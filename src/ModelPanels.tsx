import { useState } from "react";
import {
  ArrowRight,
  Download,
  Settings2,
  LoaderCircle,
  Check,
  ExternalLink,
} from "lucide-react";
import type { Config, Profile, Provider, Comparison } from "./types";
export const providerNames: Record<Provider, string> = {
  baseline: "本地规则",
  jev: "TypeSafe Jev",
  openai: "GPT / 兼容 API",
  claude: "Claude 原生",
  minicpm: "MiniCPM 直读 logits",
};
export const profileDefaults: Profile[] = [
  {
    provider: "jev",
    baseURL: "https://api.typesafe.ai/v1/systemone",
    model: "jev-latest",
    configured: false,
    verified: false,
  },
  {
    provider: "openai",
    baseURL: "https://api.openai.com/v1",
    model: "",
    configured: false,
    verified: false,
  },
  {
    provider: "claude",
    baseURL: "https://api.anthropic.com/v1",
    model: "",
    configured: false,
    verified: false,
  },
  {
    provider: "minicpm",
    baseURL: "http://127.0.0.1:8788",
    model: "openbmb/MiniCPM5-2B",
    configured: false,
    verified: false,
  },
];
async function post(path: string, body: unknown) {
  const r = await fetch("/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
}
export function ModelSettings({
  profiles,
  onSaved,
}: {
  profiles: Profile[];
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState<Profile["provider"]>("jev");
  const initial =
    profiles.find((p) => p.provider === "jev") ?? profileDefaults[0];
  const [baseURL, setBaseURL] = useState(initial.baseURL),
    [model, setModel] = useState(initial.model),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = profiles.find((p) => p.provider === provider);
  function select(id: Profile["provider"]) {
    setProvider(id);
    const p =
      profiles.find((p) => p.provider === id) ??
      profileDefaults.find((p) => p.provider === id)!;
    setBaseURL(p.baseURL);
    setModel(p.model || profileDefaults.find((p) => p.provider === id)!.model);
    setKey("");
    setError("");
  }
  async function save(clear = false) {
    setBusy(true);
    setError("");
    try {
      await post("connect", { provider, baseURL, model, key, clear });
      setKey("");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="provider-tabs">
        {profileDefaults.map((p) => (
          <button
            key={p.provider}
            className={provider === p.provider ? "active" : ""}
            onClick={() => select(p.provider)}
          >
            {providerNames[p.provider]}
          </button>
        ))}
      </div>
      <p className="connection-summary">
        {provider === "jev"
          ? "官方 Jev 需要 TypeSafe API 访问权限，返回 Noul / Score。"
          : provider === "minicpm"
            ? "运行项目附带的 Python 本地服务，直接读取 MiniCPM 候选 logits；不生成 JSON 文本，也不需要云端 Key。"
            : provider === "claude"
              ? "使用 Anthropic 原生 Messages 接口，返回生成式评分。"
              : "使用 Chat Completions 兼容接口；可连接 GPT、代理服务或本地 OpenAI 兼容服务。"}
      </p>
      <label className="field">
        {provider === "minicpm" ? "本地服务地址" : "Base URL"}
        <input
          readOnly={provider === "jev"}
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
        />
      </label>
      <label className="field">
        模型 ID
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="填写账号或本地服务实际支持的模型 ID"
        />
      </label>
      {provider !== "minicpm" && (
        <label className="field">
          API Key
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              current?.configured
                ? "更改连接时请重新填写 Key"
                : provider === "openai"
                  ? "本地兼容服务可留空"
                  : "填写此平台的官方 API Key"
            }
          />
        </label>
      )}
      {provider === "minicpm" && (
        <pre className="local-command">python local/serve.py --device auto</pre>
      )}
      <p className="small-note">
        连接保存在本机服务内存。保存不发请求；生成与对照会调用所选服务。Jev
        概率、小模型条件 softmax、普通模型自评分分别标记。
        {provider === "minicpm"
          ? " 首次使用需安装 Python 依赖并准备约 5 GB 模型权重。"
          : ""}
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="modal-buttons">
        {provider === "jev" && (
          <a
            href="https://console.typesafe.ai"
            target="_blank"
            rel="noreferrer"
          >
            申请官方 API
            <ExternalLink size={13} />
          </a>
        )}
        {current?.configured && (
          <button
            className="text-btn"
            disabled={busy}
            onClick={() => save(true)}
          >
            清除这路连接
          </button>
        )}
        <button
          className="primary"
          disabled={
            busy ||
            !model ||
            ((provider === "jev" || provider === "claude") && !key)
          }
          onClick={() => save()}
        >
          {busy ? "保存中…" : "保存连接"}
          <ArrowRight size={14} />
        </button>
      </div>
    </>
  );
}
export function ModelCompare({
  config,
  profiles,
  globalBusy,
  onBusy,
  onConnect,
  onComplete,
}: {
  config: Config;
  profiles: Profile[];
  globalBusy: boolean;
  onBusy: (v: boolean) => void;
  onConnect: () => void;
  onComplete: () => void;
}) {
  const [chosen, setChosen] = useState<Provider[]>(["baseline", "jev"]),
    [result, setResult] = useState<Comparison | null>(null),
    [error, setError] = useState("");
  async function run() {
    onBusy(true);
    setResult(null);
    setError("");
    try {
      setResult(await post("compare", { config, providers: chosen }));
      onComplete();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      onBusy(false);
    }
  }
  function exportResult() {
    const u = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = "recjev-model-comparison.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  return (
    <section className="model-comparison">
      <div className="panel-heading">
        <h3>① 同一个购物计划，不同模型来决定</h3>
        <button className="text-btn" onClick={onConnect} disabled={globalBusy}>
          <Settings2 size={14} />
          配置连接
        </button>
      </div>
      <p className="compare-intent">
        “{result?.config.query ?? config.query}” · 预算 ¥
        {result?.config.budget ?? config.budget}
      </p>
      <div className="model-choices">
        {(["baseline", "jev", "openai", "claude", "minicpm"] as Provider[]).map(
          (p) => (
            <label key={p}>
              <input
                type="checkbox"
                checked={chosen.includes(p)}
                disabled={globalBusy}
                onChange={() =>
                  setChosen(
                    chosen.includes(p)
                      ? chosen.filter((x) => x !== p)
                      : [...chosen, p],
                  )
                }
              />
              <span>
                {providerNames[p]}
                <small>
                  {p === "baseline"
                    ? "无需配置"
                    : profiles.find((x) => x.provider === p)?.configured
                      ? "已配置"
                      : "待配置"}
                </small>
              </span>
            </label>
          ),
        )}
      </div>
      <div className="compare-controls">
        <span>
          选择 2–4 路，依次运行；每路独立计时。云端模型按实际调用计费。
        </span>
        <button
          className="primary"
          disabled={globalBusy || chosen.length < 2 || chosen.length > 4}
          onClick={run}
        >
          {globalBusy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <ArrowRight size={15} />
          )}
          开始模型对照
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <>
          <div className="model-results">
            {result.results.map((r) => (
              <article key={r.provider}>
                <span className="eyebrow">{providerNames[r.provider]}</span>
                {r.run ? (
                  <>
                    <h3>{r.run.model}</h3>
                    <p>
                      {r.run.modelCalls} 次请求 ·{" "}
                      {r.run.modelLatency.toFixed(1)} ms 模型等待
                    </p>
                    <div className="model-result-numbers">
                      <strong>¥{r.run.total}</strong>
                      <span>覆盖 {Math.round(r.run.coverage * 100)}%</span>
                    </div>
                    <ol>
                      {r.run.slate.map((p) => (
                        <li key={p.id}>
                          {p.name}
                          <small>¥{p.price}</small>
                        </li>
                      ))}
                    </ol>
                    <small className="model-readout">
                      {r.provider === "jev"
                        ? "Noul / Score"
                        : r.provider === "minicpm"
                          ? "候选 logits · 未校准"
                          : r.provider === "baseline"
                            ? "启发式规则"
                            : "生成式自评分"}
                    </small>
                  </>
                ) : (
                  <div className="model-failure">
                    <p>{r.error}</p>
                    <small>本路失败，没有填入模拟成绩。</small>
                  </div>
                )}
              </article>
            ))}
          </div>
          <button className="text-btn" onClick={exportResult}>
            <Download size={14} />
            导出模型对照 JSON
          </button>
        </>
      )}
    </section>
  );
}
