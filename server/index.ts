import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, extname } from "node:path";
import { createServer as createViteServer } from "vite";
import { APIError, APITimeoutError } from "@typesafe-ai/sdk";
import { generate, replaceItem, validateConfig } from "./engine";
import { createJevDecider } from "./jev";
import { batchDecider } from "./batched";
import { evaluate } from "./evaluation";
import {
  createCompatibleDecider,
  validateConnection,
  type Connection,
} from "./providers";
import type { Provider } from "../src/types";
import {
  retrieveSearch,
  rankSearch,
  SearchStore,
  SearchScoreCache,
  type SearchKeys,
} from "./search";
import { recommendScene } from "./scene";
import { runTryOn, tryOnStatus } from "./tryon";
const searchStore = new SearchStore();
const searchScoreCache = new SearchScoreCache();
const searchKeys: SearchKeys = {
  tavily: process.env.TAVILY_API_KEY,
  search1api: process.env.SEARCH1API_API_KEY,
  brave: process.env.BRAVE_SEARCH_API_KEY,
};
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 8787),
  dev = process.argv.includes("--dev");
let apiKey = process.env.TYPESAFE_API_KEY || "",
  model = process.env.JEV_MODEL || "jev-latest",
  verified = false,
  busy = false;
const connections: Partial<Record<Provider, Connection>> = {};
const verifiedProfiles = new Set<Provider>();
// In-memory epochs invalidate cached scores even when only a credential changes.
// Credentials themselves never enter a cache key, response or export.
const connectionRevisions = new Map<Provider, number>();
function connectionChanged(provider: Provider) {
  connectionRevisions.set(
    provider,
    (connectionRevisions.get(provider) ?? 0) + 1,
  );
}
function searchProviderIdentity(provider: Provider) {
  return JSON.stringify({
    provider,
    revision: connectionRevisions.get(provider) ?? 0,
    model: provider === "jev" ? model : (connections[provider]?.model ?? ""),
    endpoint:
      provider === "jev"
        ? "https://api.typesafe.ai"
        : (connections[provider]?.baseURL ?? ""),
  });
}
function deciderFor(
  provider: Provider,
  domain: "shopping" | "search" = "shopping",
) {
  return provider === "jev"
    ? apiKey
      ? batchDecider(createJevDecider(apiKey, model, domain))
      : undefined
    : connections[provider]
      ? batchDecider(
          createCompatibleDecider(connections[provider]!, fetch, domain),
        )
      : undefined;
}
function status() {
  return {
    searchSources: {
      github: true,
      hackernews: true,
      crossref: true,
      europepmc: true,
      tavily: !!searchKeys.tavily,
      search1api: !!searchKeys.search1api,
      brave: !!searchKeys.brave,
    },
    configured: !!apiKey,
    verified,
    model,
    profiles: [
      {
        provider: "jev",
        model,
        baseURL: "https://api.typesafe.ai/v1/systemone",
        configured: !!apiKey,
        verified,
      },
      ...(["openai", "claude", "minicpm"] as const).map((provider) => ({
        provider,
        model: connections[provider]?.model ?? "",
        baseURL:
          connections[provider]?.baseURL ??
          {
            openai: "https://api.openai.com/v1",
            claude: "https://api.anthropic.com/v1",
            minicpm: "http://127.0.0.1:8788",
          }[provider],
        configured: !!connections[provider],
        verified: verifiedProfiles.has(provider),
      })),
    ],
  };
}
const vite = dev
  ? await createViteServer({
      root,
      server: { middlewareMode: true },
      appType: "spa",
    })
  : null;
const send = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
};
async function body(req: IncomingMessage, limit = 32000): Promise<any> {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const data of req) {
    length += data.length;
    if (length > limit) throw new Error("请求过大。");
    chunks.push(data);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new Error("请求不是有效 JSON。");
  }
}
const server = createServer(async (req, res) => {
  const host = req.headers.host;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host ?? ""))
    return send(res, 403, { error: "仅允许本机访问。" });
  const path = new URL(req.url ?? "/", `http://${host}`).pathname;
  if (path.startsWith("/api/")) {
    if (
      req.headers.origin &&
      ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(
        req.headers.origin,
      )
    )
      return send(res, 403, { error: "拒绝跨站请求。" });
    if (req.method === "GET" && path === "/api/status")
      return send(res, 200, { ...status(), busy });
    if (req.method === "GET" && path === "/api/tryon/status")
      return send(res, 200, await tryOnStatus());
    if (
      req.method !== "POST" ||
      !String(req.headers["content-type"]).startsWith("application/json")
    )
      return send(res, 405, { error: "请使用 JSON POST。" });
    if (busy)
      return send(res, 409, { error: "另一个实验正在运行，请稍后再试。" });
    let ownsBusy = false;
    try {
      const data = await body(
        req,
        path === "/api/tryon/run" ? 12 * 1024 * 1024 : 32000,
      );
      if (busy)
        return send(res, 409, { error: "另一个实验正在运行，请稍后再试。" });
      if (path === "/api/tryon/run") {
        busy = true;
        ownsBusy = true;
        return send(res, 200, await runTryOn(data));
      }
      if (path === "/api/scene/recommend") {
        busy = true;
        ownsBusy = true;
        return send(
          res,
          200,
          await recommendScene(data, (p) => deciderFor(p, "search")),
        );
      }
      if (path === "/api/search/connect") {
        if (!["tavily", "brave", "search1api"].includes(data.source))
          throw new Error("未知搜索来源。");
        const source = data.source as keyof SearchKeys;
        if (data.clear === true) delete searchKeys[source];
        else {
          if (
            typeof data.key !== "string" ||
            !data.key.trim() ||
            data.key.length > 2048
          )
            throw new Error("请填写有效搜索 Key。");
          searchKeys[source] = data.key.trim();
        }
        return send(res, 200, status());
      }
      if (path === "/api/search/retrieve") {
        busy = true;
        ownsBusy = true;
        const snapshot = await retrieveSearch(data, searchKeys);
        searchStore.add(snapshot);
        return send(res, 200, snapshot);
      }
      if (path === "/api/search/rank") {
        busy = true;
        ownsBusy = true;
        const snapshot = searchStore.get(data.snapshotId);
        return send(
          res,
          200,
          await rankSearch(snapshot, data, (p) => deciderFor(p, "search"), {
            cache: searchScoreCache,
            providerIdentity: searchProviderIdentity,
          }),
        );
      }
      if (path === "/api/validate-config")
        return send(res, 200, { config: validateConfig(data) });
      if (path === "/api/connect") {
        if (data.provider && data.provider !== "jev") {
          if (!["openai", "claude", "minicpm"].includes(data.provider))
            throw new Error("未知模型类型。");
          const provider = data.provider as Connection["provider"];
          if (data.clear === true) {
            delete connections[provider];
            verifiedProfiles.delete(provider);
            connectionChanged(provider);
            return send(res, 200, status());
          }
          connections[provider] = validateConnection({
            provider,
            model: data.model,
            baseURL: data.baseURL,
            key: data.key ?? "",
          });
          verifiedProfiles.delete(provider);
          connectionChanged(provider);
          return send(res, 200, status());
        }
        if (data.clear === true) {
          apiKey = "";
          verified = false;
          connectionChanged("jev");
          return send(res, 200, status());
        }
        if (
          typeof data.key !== "string" ||
          data.key.length < 8 ||
          data.key.length > 512 ||
          !/^[\w.\-]+$/.test(data.model ?? "")
        )
          throw new Error("请填写有效 Key 和模型名。");
        apiKey = data.key;
        model = data.model;
        verified = false;
        connectionChanged("jev");
        return send(res, 200, status());
      }
      if (path === "/api/replace") {
        busy = true;
        ownsBusy = true;
        return send(
          res,
          200,
          await replaceItem(data, deciderFor(data.config?.provider)),
        );
      }
      if (path === "/api/generate") {
        busy = true;
        ownsBusy = true;
        const run = await generate(data, deciderFor(data.provider));
        if (run.modelCalls > 0) {
          verifiedProfiles.add(data.provider);
          if (data.provider === "jev") verified = true;
        }
        return send(res, 200, run);
      }
      if (path === "/api/evaluate") {
        if (
          !["baseline", "jev", "openai", "claude", "minicpm"].includes(
            data.provider,
          ) ||
          !Number.isInteger(data.seed) ||
          data.seed < 0 ||
          data.seed > 4294967295
        )
          throw new Error("实验引擎或种子无效。");
        busy = true;
        ownsBusy = true;
        const result = await evaluate(
          data.provider,
          data.seed,
          deciderFor(data.provider),
        );
        if (result.modelCalls > 0) {
          verifiedProfiles.add(data.provider);
          if (data.provider === "jev") verified = true;
        }
        return send(res, 200, result);
      }
      if (path === "/api/compare") {
        if (
          !Array.isArray(data.providers) ||
          data.providers.length < 2 ||
          data.providers.length > 4 ||
          new Set(data.providers).size !== data.providers.length ||
          data.providers.some(
            (p: unknown) =>
              !["baseline", "jev", "openai", "claude", "minicpm"].includes(
                p as string,
              ),
          )
        )
          throw new Error("请选择 2–4 个不同引擎。");
        busy = true;
        ownsBusy = true;
        const results = [];
        for (const provider of data.providers as Provider[]) {
          const start = performance.now();
          try {
            const run = await generate(
              { ...data.config, provider },
              deciderFor(provider),
            );
            results.push({
              provider,
              run,
              error: null,
              elapsed: performance.now() - start,
            });
            if (run.modelCalls) {
              verifiedProfiles.add(provider);
              if (provider === "jev") verified = true;
            }
          } catch (error) {
            results.push({
              provider,
              run: null,
              error:
                error instanceof APIError
                  ? "官方模型请求失败，请检查 Key 和配额。"
                  : error instanceof Error
                    ? error.message
                    : "请求失败",
              elapsed: performance.now() - start,
            });
          }
        }
        return send(res, 200, {
          config: data.config,
          createdAt: new Date().toISOString(),
          results,
        });
      }
      return send(res, 404, { error: "没有这个接口。" });
    } catch (error) {
      // Never return SDK bodies or stack traces: they may contain request data.
      let message = "请求处理失败，请重试。",
        status = 400;
      if (error instanceof APITimeoutError) {
        message = "Jev 请求超时（15 秒），请重试；未生成替代结果。";
        status = 504;
      } else if (error instanceof APIError) {
        message = `Jev 官方接口返回 HTTP ${error.status}。请检查访问权限、Key 或配额。`;
        status = 502;
      } else if (error instanceof Error && !error.name.includes("API"))
        message = error.message;
      else {
        message = "无法连接 Jev 官方服务，请检查网络。";
        status = 502;
      }
      return send(res, status, { error: message });
    } finally {
      if (ownsBusy) busy = false;
    }
  }
  if (vite) return vite.middlewares(req, res);
  if (req.method !== "GET" && req.method !== "HEAD")
    return send(res, 405, { error: "Method not allowed" });
  let relative: string;
  try {
    relative = decodeURIComponent(path);
  } catch {
    return send(res, 400, { error: "Invalid path" });
  }
  const dist = join(root, "dist"),
    target = resolve(dist, "." + relative);
  if (!target.startsWith(dist + "/") && target !== dist)
    return send(res, 403, { error: "Forbidden" });
  const file =
    existsSync(target) && extname(target) ? target : join(dist, "index.html");
  try {
    const bytes = await readFile(file);
    const mime: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    };
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    send(res, 404, { error: "请先运行 npm run build。" });
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `AgenticJev · 拾意 → http://127.0.0.1:${port} (${dev ? "dev" : "production"})`,
  ),
);
process.on("SIGTERM", () => server.close());
