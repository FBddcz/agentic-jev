import { createHash, randomUUID } from "node:crypto";
import type { Config, Product, Provider } from "../src/types";
import {
  sourceNames,
  type ShoppingMarket,
  type SearchCandidate,
  type SearchSource,
  type SearchSnapshot,
  type SearchResult,
  type SearchDecision,
  type SearchShortlist,
} from "../src/search-types";
import type { Decider, DecisionResult } from "./engine";

const SOURCES = Object.keys(sourceNames) as SearchSource[];
const MODELS: Provider[] = ["baseline", "jev", "openai", "claude", "minicpm"];
export type SearchKeys = Partial<
  Record<"tavily" | "brave" | "search1api", string>
>;
function string(value: unknown, name: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${name} 需为 1–${max} 字符。`);
  return value.trim();
}
export function validateSearch(input: any) {
  const query = string(input?.query, "搜索词", 500);
  if (
    !Array.isArray(input.sources) ||
    !input.sources.length ||
    input.sources.length > SOURCES.length ||
    new Set(input.sources).size !== input.sources.length ||
    input.sources.some((s: any) => !SOURCES.includes(s))
  )
    throw new Error("请选择有效且不重复的搜索来源。");
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100)
    throw new Error("每个来源可取 1–100 条；受上游接口返回量限制。");
  if (
    input.market !== undefined &&
    (!["amazon", "taobao", "jd"].includes(input.market) ||
      input.sources.some(
        (s: string) => !["tavily", "brave", "search1api"].includes(s),
      ))
  )
    throw new Error("真实商品检索请选择有效平台和全网搜索来源。");
  return {
    market: input.market as ShoppingMarket | undefined,
    query,
    sources: input.sources as SearchSource[],
    limit: input.limit as number,
  };
}
const plain = (s: unknown, max: number) =>
  typeof s === "string"
    ? s
        .replace(
          /&(?:lt|gt|amp|quot|apos|nbsp);|&#(x[0-9a-f]+|\d+);/gi,
          (entity, numeric) => {
            if (numeric) {
              const n =
                numeric[0].toLowerCase() === "x"
                  ? parseInt(numeric.slice(1), 16)
                  : Number(numeric);
              return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
            }
            return (
              (
                {
                  "&lt;": "<",
                  "&gt;": ">",
                  "&amp;": "&",
                  "&quot;": '\"',
                  "&apos;": "'",
                  "&nbsp;": " ",
                } as Record<string, string>
              )[entity.toLowerCase()] || entity
            );
          },
        )
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
export function canonicalUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      return null;
    u.hash = "";
    if (["doi.org", "dx.doi.org"].includes(u.hostname)) {
      u.protocol = "https:";
      u.hostname = "doi.org";
      u.pathname = u.pathname.toLowerCase();
      u.search = "";
    }
    for (const k of [...u.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$)/i.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    return u.href;
  } catch {
    return null;
  }
}
type Raw = {
  title: unknown;
  url: unknown;
  snippet: unknown;
  extra?: string;
  paper?: SearchCandidate["paper"];
};
export function normalizeResults(
  rows: Raw[],
  source: SearchSource,
  limit: number,
): SearchCandidate[] {
  const out: SearchCandidate[] = [];
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const url = canonicalUrl(row.url),
      title = plain(row.title, 300);
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    out.push({
      id: "r" + createHash("sha256").update(url).digest("hex").slice(0, 20),
      title,
      url,
      snippet: plain(row.snippet, 1800),
      sources: [source],
      originalRank: out.length + 1,
      sourceRanks: { [source]: index + 1 },
      extra: row.extra,
      ...(row.paper ? { paper: row.paper } : {}),
    });
    if (out.length >= limit) break;
  }
  return out;
}
async function lane(
  source: SearchSource,
  query: string,
  limit: number,
  keys: SearchKeys,
  fetcher: typeof fetch,
) {
  let url: string,
    init: RequestInit = {
      headers: {
        "User-Agent": "AgenticJev/0.3 (research search client)",
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    };
  if (source === "github")
    url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}`;
  else if (source === "hackernews")
    url = `https://hn.algolia.com/api/v1/search?tags=story&query=${encodeURIComponent(query)}&hitsPerPage=${limit}`;
  else if (source === "crossref")
    url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(query)}&rows=${limit}&filter=type:journal-article,type:proceedings-article,type:posted-content`;
  else if (source === "europepmc")
    url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=${limit}`;
  else {
    if (!keys[source])
      throw new Error(`${sourceNames[source]} 尚未配置搜索 Key。`);
    if (source === "tavily") {
      url = "https://api.tavily.com/search";
      init = {
        ...init,
        method: "POST",
        headers: {
          ...init.headers,
          "Content-Type": "application/json",
          Authorization: `Bearer ${keys.tavily}`,
        },
        body: JSON.stringify({
          query,
          search_depth: "basic",
          auto_parameters: false,
          max_results: Math.min(limit, 20),
          include_answer: false,
          include_raw_content: false,
        }),
      };
    } else if (source === "brave") {
      url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(limit, 20)}`;
      init.headers = { ...init.headers, "X-Subscription-Token": keys.brave! };
    } else {
      url = "https://api.search1api.com/search";
      init = {
        ...init,
        method: "POST",
        headers: {
          ...init.headers,
          "Content-Type": "application/json",
          Authorization: `Bearer ${keys.search1api}`,
        },
        body: JSON.stringify({
          query,
          search_service: "google",
          max_results: limit,
        }),
      };
    }
  }
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch {
    throw new Error(`${sourceNames[source]} 网络连接失败或超过 15 秒。`);
  }
  if (!response.ok)
    throw new Error(
      `${sourceNames[source]} 返回 HTTP ${response.status}${response.status === 429 || response.status === 403 ? "，请检查配额或稍后重试" : ""}。`,
    );
  const body = await response.json();
  let rows: Raw[];
  if (source === "github") {
    if (!Array.isArray(body.items))
      throw new Error("GitHub 搜索响应格式不完整。");
    rows = body.items.map((p: any) => ({
      title: p.full_name,
      url: p.html_url,
      snippet: p.description,
      extra: `${p.language || "未标记语言"} · ★ ${Number(p.stargazers_count) || 0} · ${p.license?.spdx_id || "许可未标记"}`,
    }));
  } else if (source === "hackernews") {
    if (!Array.isArray(body.hits))
      throw new Error("Hacker News 搜索响应格式不完整。");
    rows = body.hits.map((p: any) => ({
      title: p.title,
      url:
        p.url ||
        `https://news.ycombinator.com/item?id=${encodeURIComponent(p.objectID)}`,
      snippet: p.story_text || p.title,
      extra: `${Number(p.points) || 0} 分 · ${Number(p.num_comments) || 0} 条讨论`,
    }));
  } else if (source === "crossref") {
    if (!Array.isArray(body.message?.items))
      throw new Error("Crossref 响应格式不完整。");
    rows = body.message.items.map((p: any) => {
      const doi = plain(p.DOI, 300).toLowerCase();
      const year = Number(p.published?.["date-parts"]?.[0]?.[0]);
      return {
        title: Array.isArray(p.title) ? p.title[0] : p.title,
        url: doi ? `https://doi.org/${doi}` : p.URL,
        snippet: p.abstract,
        paper: {
          authors: Array.isArray(p.author)
            ? p.author
                .slice(0, 6)
                .map((a: any) =>
                  plain(
                    [a.given, a.family].filter(Boolean).join(" ") || a.name,
                    150,
                  ),
                )
                .filter(Boolean)
                .join(", ") + (p.author.length > 6 ? " et al." : "")
            : "",
          year: Number.isInteger(year) && year > 0 ? year : null,
          venue: plain(p["container-title"]?.[0], 300),
          doi,
          openAccess: null,
        },
      };
    });
  } else if (source === "europepmc") {
    if (body.errMsg || !Array.isArray(body.resultList?.result))
      throw new Error("Europe PMC 响应格式不完整或检索式无效。");
    rows = body.resultList.result.map((p: any) => {
      const doi = plain(p.doi, 300).toLowerCase();
      const year = Number(p.pubYear);
      return {
        title: p.title,
        url: doi
          ? `https://doi.org/${doi}`
          : `https://europepmc.org/article/${encodeURIComponent(p.source)}/${encodeURIComponent(p.id)}`,
        snippet: p.abstractText,
        paper: {
          authors: plain(p.authorString, 1000),
          year: Number.isInteger(year) && year > 0 ? year : null,
          venue: plain(p.journalInfo?.journal?.title, 300),
          doi,
          openAccess:
            p.isOpenAccess === "Y"
              ? true
              : p.isOpenAccess === "N"
                ? false
                : null,
        },
      };
    });
  } else {
    const values = source === "brave" ? body.web?.results : body.results;
    if (!Array.isArray(values))
      throw new Error(`${sourceNames[source]} 响应格式不完整。`);
    rows = values.map((p: any) => ({
      title: p.title,
      url: p.url || p.link,
      snippet: source === "tavily" ? p.content : p.description || p.snippet,
    }));
  }
  return normalizeResults(rows, source, limit);
}
export function isMarketplaceProduct(
  raw: string,
  market: ShoppingMarket,
): boolean {
  const u = new URL(raw),
    h = u.hostname;
  if (market === "amazon")
    return (
      (h === "amazon.com" || h.endsWith(".amazon.com")) &&
      /\/(dp|gp\/product)\/[a-z0-9]{10}(?:\/|$)/i.test(u.pathname)
    );
  if (market === "taobao")
    return (
      ["item.taobao.com", "detail.tmall.com"].includes(h) &&
      u.pathname === "/item.htm" &&
      /^\d+$/.test(u.searchParams.get("id") || "")
    );
  return h === "item.jd.com" && /^\/\d+\.html$/.test(u.pathname);
}
export async function retrieveSearch(
  input: unknown,
  keys: SearchKeys,
  fetcher: typeof fetch = fetch,
): Promise<SearchSnapshot> {
  const { query, sources, limit, market } = validateSearch(input),
    start = performance.now();
  const results = await Promise.all(
    sources.map(async (source) => {
      const t = performance.now();
      try {
        const domains =
          market === "amazon"
            ? "site:amazon.com"
            : market === "taobao"
              ? "(site:item.taobao.com OR site:detail.tmall.com)"
              : "site:item.jd.com";
        let items = await lane(
          source,
          market ? `${query} ${domains}` : query,
          limit,
          keys,
          fetcher,
        );
        if (market)
          items = items.filter((p) => isMarketplaceProduct(p.url, market));
        return { source, items, ms: performance.now() - t, error: null };
      } catch (e) {
        return {
          source,
          items: [] as SearchCandidate[],
          ms: performance.now() - t,
          error: (e as Error).message,
        };
      }
    }),
  );
  if (results.every((r) => r.error))
    throw new Error(results.map((r) => r.error).join(" "));
  // Interleave sources before scoring, so a large source cannot hide another.
  const map = new Map<string, SearchCandidate>();
  for (let rank = 0; rank < limit; rank++)
    for (const result of results) {
      const item = result.items[rank];
      if (!item) continue;
      const old = map.get(item.url);
      if (old) {
        if (!old.sources.includes(result.source))
          old.sources.push(result.source);
        old.sourceRanks = {
          ...old.sourceRanks,
          ...item.sourceRanks,
        };
        if (item.snippet.length > old.snippet.length)
          old.snippet = item.snippet;
        if (item.paper) {
          if (!old.paper) old.paper = item.paper;
          else {
            if (item.paper.openAccess !== null)
              old.paper.openAccess = item.paper.openAccess;
            if (!old.paper.authors) old.paper.authors = item.paper.authors;
            if (!old.paper.year) old.paper.year = item.paper.year;
            if (!old.paper.venue) old.paper.venue = item.paper.venue;
          }
        }
      } else
        map.set(item.url, {
          ...item,
          sources: [...item.sources],
          sourceRanks: { ...item.sourceRanks },
          originalRank: map.size + 1,
        });
    }
  const candidates = [...map.values()];
  return {
    id: randomUUID(),
    query,
    createdAt: new Date().toISOString(),
    candidates,
    lanes: results.map((r) => ({
      source: r.source,
      ms: r.ms,
      count: r.items.length,
      error: r.error,
    })),
    searchMs: performance.now() - start,
    requestedLimit: limit,
    ...(market ? { market } : {}),
    fingerprint: createHash("sha256")
      .update(JSON.stringify(candidates))
      .digest("hex"),
  };
}
function terms(s: string) {
  const chunks = s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return [
    ...new Set(
      chunks
        .flatMap((t) =>
          /[\u3400-\u9fff]/.test(t)
            ? [...t].slice(0, -1).map((_, i) => t.slice(i, i + 2))
            : [t],
        )
        .filter((t) => t.length > 1),
    ),
  ];
}
function overlap(query: string, text: string) {
  const words = terms(query);
  return words.length
    ? words.filter((t) => text.toLowerCase().includes(t)).length / words.length
    : 0;
}
// Reuse the typed scoring boundary; prices and auction fields never enter a search prompt.
function modelItem(c: SearchCandidate): Product {
  return {
    id: c.id,
    name: c.title,
    subtitle: c.snippet,
    category: c.sources.join(","),
    tags: [],
    brand: "",
    price: 0,
    quality: 0,
    art: "",
    color: "#ffffff",
    bid: 0,
    mission: "search",
  };
}

const SEARCH_SCORING_REVISION = "search-rubrics-v1";
type CachedSearchScore = {
  result: DecisionResult;
  scoredAt: string;
  originalMs: number;
};

/** Process-local exact-context cache. Never share candidate-only scores across prompts. */
export class SearchScoreCache {
  private entries = new Map<
    string,
    CachedSearchScore & { expiresAt: number; bytes: number }
  >();
  private bytes = 0;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    options: {
      maxEntries?: number;
      maxBytes?: number;
      ttlMs?: number;
      now?: () => number;
    } = {},
  ) {
    this.maxEntries = options.maxEntries ?? 64;
    this.maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000;
    this.now = options.now ?? Date.now;
    if (
      ![this.maxEntries, this.maxBytes, this.ttlMs].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      )
    )
      throw new Error("评分缓存容量与有效期需为正整数。");
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(key);
  }

  get(key: string): CachedSearchScore | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.remove(key);
      return undefined;
    }
    // LRU eviction does not extend the original TTL.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return structuredClone({
      result: entry.result,
      scoredAt: entry.scoredAt,
      originalMs: entry.originalMs,
    });
  }

  set(key: string, result: DecisionResult, originalMs: number) {
    const now = this.now();
    const provenance = { scoredAt: new Date(now).toISOString(), originalMs };
    for (const [id, entry] of this.entries)
      if (now >= entry.expiresAt) this.remove(id);
    this.remove(key);
    const bytes = Buffer.byteLength(JSON.stringify(result));
    if (bytes > this.maxBytes) return provenance;
    this.entries.set(key, {
      result: structuredClone(result),
      ...provenance,
      expiresAt: now + this.ttlMs,
      bytes,
    });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes)
      this.remove(this.entries.keys().next().value!);
    return provenance;
  }

  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}

export type SearchRankOptions = {
  cache?: SearchScoreCache;
  /** Include model, endpoint and connection revision; never put API keys here. */
  providerIdentity?: (provider: Provider) => string;
  /** Bump when scoring rubrics change. Included even for otherwise identical inputs. */
  promptRevision?: string;
  /** Must match the batchDecider configuration used by deciderFor. */
  batchSize?: number;
};

function shortlistSearch(
  snapshot: SearchSnapshot,
  intent: string,
  limit: number | null,
  liked: string[],
  excluded: string[],
) {
  const start = performance.now();
  const excludedSet = new Set(excluded);
  const eligible = snapshot.candidates.filter((c) => !excludedSet.has(c.id));
  const lexical = new Map(
    eligible.map((c) => [c.id, overlap(intent, `${c.title} ${c.snippet}`)]),
  );
  const tie = (a: SearchCandidate, b: SearchCandidate) =>
    a.originalRank - b.originalRank || a.id.localeCompare(b.id);
  // Positive lexical overlap is one extra ranked list in reciprocal rank fusion.
  // It never pretends to be an embedding or a model-generated relevance score.
  const lexicalRanks = new Map(
    [...eligible]
      .filter((c) => lexical.get(c.id)! > 0)
      .sort((a, b) => lexical.get(b.id)! - lexical.get(a.id)! || tie(a, b))
      .map((c, i) => [c.id, i + 1]),
  );
  const fusion = (c: SearchCandidate) => {
    const sourceScore = c.sources.reduce((sum, source) => {
      // Legacy snapshots have only merged originalRank. New retrievals retain
      // sourceRanks so deduplication does not lose upstream rank evidence.
      const rank = c.sourceRanks?.[source] ?? c.originalRank;
      return sum + 1 / (60 + rank);
    }, 0);
    const lexicalRank = lexicalRanks.get(c.id);
    return sourceScore + (lexicalRank ? 1 / (60 + lexicalRank) : 0);
  };
  const ordered = [...eligible].sort(
    (a, b) => fusion(b) - fusion(a) || tie(a, b),
  );
  const selectedIds = new Set(liked);
  for (const c of ordered) {
    if (limit !== null && selectedIds.size >= limit) break;
    selectedIds.add(c.id);
  }
  const selected = ordered.filter((c) => selectedIds.has(c.id));
  const shortlist: SearchShortlist = {
    limit,
    total: snapshot.candidates.length,
    eligible: eligible.length,
    selected: selected.length,
    excludedIds: snapshot.candidates
      .filter((c) => excludedSet.has(c.id))
      .map((c) => c.id),
    omittedIds: ordered.filter((c) => !selectedIds.has(c.id)).map((c) => c.id),
    method: "rrf-60+lexical-v1",
    ms: performance.now() - start,
  };
  return { selected, lexical, shortlist };
}

export async function rankSearch(
  snapshot: SearchSnapshot,
  input: any,
  deciderFor: (p: Provider) => Decider | undefined,
  options: SearchRankOptions = {},
): Promise<SearchResult> {
  const intent = string(input?.intent, "需求描述", 1500);
  if (
    !Array.isArray(input.providers) ||
    !input.providers.length ||
    input.providers.length > 5 ||
    new Set(input.providers).size !== input.providers.length ||
    input.providers.some((p: any) => !MODELS.includes(p))
  )
    throw new Error("请选择 1–5 个不同决策模型。");
  if (
    typeof input.threshold !== "number" ||
    !Number.isFinite(input.threshold) ||
    input.threshold < 0 ||
    input.threshold > 1
  )
    throw new Error("筛选阈值需在 0–1 之间。");
  const shortlistSize =
    input.shortlistSize === undefined ? 24 : input.shortlistSize;
  if (
    shortlistSize !== null &&
    (!Number.isInteger(shortlistSize) ||
      shortlistSize < 1 ||
      shortlistSize > 100)
  )
    throw new Error("精排候选数需为 1–100 的整数，或 null（全部）。");
  if (
    input.refreshScores !== undefined &&
    typeof input.refreshScores !== "boolean"
  )
    throw new Error("重新评分选项需为布尔值。");
  if (
    options.batchSize !== undefined &&
    (!Number.isSafeInteger(options.batchSize) || options.batchSize < 1)
  )
    throw new Error("模型批次大小需为正整数。");
  function ids(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.length > snapshot.candidates.length ||
      new Set(value).size !== value.length ||
      value.some((id) => !snapshot.candidates.some((c) => c.id === id))
    )
      throw new Error("反馈包含未知或重复候选。");
    return value;
  }
  const liked = ids(input.liked ?? []),
    excluded = ids(input.excluded ?? []);
  if (liked.some((id) => excluded.includes(id)))
    throw new Error("同一候选不可同时喜欢与排除。");
  const start = performance.now();
  const { selected, lexical, shortlist } = shortlistSearch(
    snapshot,
    intent,
    shortlistSize,
    liked,
    excluded,
  );
  const items = selected.map(modelItem);
  const allItems = snapshot.candidates.map(modelItem);
  const feedback = {
    liked: allItems.filter((p) => liked.includes(p.id)),
    disliked: allItems.filter((p) => excluded.includes(p.id)),
  };
  const decisions: SearchDecision[] = [];
  for (const provider of input.providers as Provider[]) {
    const t = performance.now();
    try {
      const config: Config = {
        query: intent,
        mission: "search",
        budget: 1,
        maxItems: null,
        diversity: 0,
        provider,
        likes: liked,
        dislikes: excluded,
        locked: [],
        ads: false,
        adWeight: 0,
      };
      // A cache identity is required for external models so reconfiguration
      // cannot accidentally reuse a previous endpoint/model's successful result.
      const identity =
        provider === "baseline"
          ? "lexical-overlap-v1"
          : options.providerIdentity?.(provider);
      const cacheKey =
        options.cache && identity
          ? createHash("sha256")
              .update(
                JSON.stringify({
                  provider,
                  identity,
                  revision: options.promptRevision ?? SEARCH_SCORING_REVISION,
                  batchSize: options.batchSize ?? 24,
                  query: snapshot.query,
                  market: snapshot.market ?? null,
                  // Include the full candidate context, ordered shortlist, lexical
                  // inputs and every feedback item, not a cache entry per candidate.
                  candidates: snapshot.candidates,
                  selected: items,
                  lexical: [...lexical],
                  config,
                  feedback,
                }),
              )
              .digest("hex")
          : undefined;
      const cached =
        cacheKey && !input.refreshScores
          ? options.cache!.get(cacheKey)
          : undefined;
      let scored: DecisionResult;
      if (cached) scored = cached.result;
      else if (provider === "baseline")
        scored = {
          evidence: items.map((p) => ({
            id: p.id,
            relevance: lexical.get(p.id)!,
            affinity: liked.includes(p.id)
              ? 1
              : liked.length
                ? 0.5 +
                  0.5 *
                    Math.max(
                      ...feedback.liked.map((x) =>
                        overlap(
                          x.name + " " + x.subtitle,
                          p.name + " " + p.subtitle,
                        ),
                      ),
                    )
                : 0.5,
            confidence: null,
            lexical: lexical.get(p.id)!,
            source: "baseline" as const,
          })),
          model: "lexical-overlap-v1",
          calls: 0,
          usage: null,
          rawAnswers: null,
          latency: 0,
        };
      else {
        const decider = items.length ? deciderFor(provider) : undefined;
        if (items.length && !decider) throw new Error("尚未配置此模型连接。");
        scored = items.length
          ? await decider!(config, items, lexical, "search", feedback)
          : {
              evidence: [],
              model: `${provider}-not-called`,
              calls: 0,
              usage: null,
              rawAnswers: null,
              latency: 0,
            };
      }
      if (
        scored.evidence.length !== items.length ||
        new Set(scored.evidence.map((e) => e.id)).size !== items.length ||
        scored.evidence.some(
          (e) =>
            !items.some((p) => p.id === e.id) ||
            ![e.relevance, e.affinity].every(
              (v) => Number.isFinite(v) && v >= 0 && v <= 1,
            ),
        )
      )
        throw new Error("评分不完整或越界，未生成替代结果。");
      const rows = selected
        .map((c) => {
          const evidence = scored.evidence.find((e) => e.id === c.id)!,
            score = 0.7 * evidence.relevance + 0.3 * evidence.affinity;
          const retained = score >= input.threshold;
          return {
            ...c,
            evidence,
            score,
            retained,
            rank: 0,
            reason:
              score < input.threshold ? "低于当前阈值" : "达到当前匹配阈值",
          };
        })
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.sources.length - a.sources.length ||
            a.originalRank - b.originalRank,
        )
        .map((r, i) => ({ ...r, rank: i + 1 }));
      const ms = performance.now() - t;
      const original =
        cached ??
        (cacheKey && items.length
          ? options.cache!.set(cacheKey, scored, ms)
          : undefined);
      decisions.push({
        provider,
        model: scored.model,
        rows,
        ms,
        calls: cached ? 0 : scored.calls,
        usage: cached ? null : scored.usage,
        rawAnswers: scored.rawAnswers,
        error: null,
        cache: {
          hit: !!cached,
          scoredAt: original?.scoredAt ?? new Date().toISOString(),
          originalMs: original?.originalMs ?? ms,
          originalCalls: scored.calls,
          originalUsage: scored.usage,
        },
      });
    } catch (e) {
      decisions.push({
        provider,
        model: "",
        rows: [],
        ms: performance.now() - t,
        calls: null,
        usage: null,
        rawAnswers: null,
        error:
          provider === "jev"
            ? "Jev 评分失败，请检查连接、配额或返回格式；未使用替代分数。"
            : (e as Error).message,
      });
    }
  }
  return {
    snapshot,
    intent,
    threshold: input.threshold,
    liked,
    excluded,
    decisions,
    shortlist,
    rankingMs: performance.now() - start,
    createdAt: new Date().toISOString(),
    scoring:
      "0.7 × relevance + 0.3 × preference fit; semantic scores, not factual correctness or calibrated click probabilities",
  };
}
export class SearchStore {
  private snapshots = new Map<string, SearchSnapshot>();
  add(snapshot: SearchSnapshot) {
    this.snapshots.set(snapshot.id, structuredClone(snapshot));
    while (this.snapshots.size > 20)
      this.snapshots.delete(this.snapshots.keys().next().value!);
  }
  get(id: string) {
    const s = this.snapshots.get(id);
    if (!s || Date.now() - Date.parse(s.createdAt) > 30 * 60 * 1000)
      throw new Error("搜索快照已过期，请重新搜索。旧结果仍可导出。");
    return structuredClone(s);
  }
}
