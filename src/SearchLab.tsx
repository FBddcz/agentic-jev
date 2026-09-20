import { t, useLocale } from "./i18n";
import { useEffect, useState } from "react";
import {
  Search,
  Globe2,
  ArrowUpRight,
  Heart,
  Ban,
  Timer,
  Download,
  Activity,
  Settings2,
  RefreshCw,
  Check,
} from "lucide-react";
import type { Profile, Provider } from "./types";
import { providerNames } from "./ModelPanels";
import {
  sourceNames,
  shoppingMarkets,
  type ShoppingMarket,
  type SearchSource,
  type SearchSnapshot,
  type SearchResult,
} from "./search-types";
const ms = (n: number) =>
  n < 1000 ? `${n.toFixed(0)} ms` : `${(n / 1000).toFixed(2)} s`;
async function post(path: string, body: unknown) {
  const r = await fetch(`/api/search/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "请求失败");
  return data;
}
function saveJSON(value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "agenticjev-search.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SearchLab({
  profiles,
  onModelSettings,
  shopping = false,
}: {
  profiles: Profile[];
  shopping?: boolean;
  onModelSettings: () => void;
}) {
  const locale = useLocale();
  const [market, setMarket] = useState<ShoppingMarket>("amazon");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [query, setQuery] = useState(""),
    [intent, setIntent] = useState("");
  const [sources, setSources] = useState<SearchSource[]>(
      shopping ? ["tavily"] : ["github", "hackernews"],
    ),
    [providers, setProviders] = useState<Provider[]>(["baseline"]),
    [limit, setLimit] = useState(20),
    [threshold, setThreshold] = useState(0.2);
  const [snapshot, setSnapshot] = useState<SearchSnapshot | null>(null),
    [result, setResult] = useState<SearchResult | null>(null),
    [selected, setSelected] = useState<Provider>("baseline");
  const [liked, setLiked] = useState<string[]>([]),
    [excluded, setExcluded] = useState<string[]>([]),
    [showDropped, setShowDropped] = useState(false);
  const [stage, setStage] = useState<"idle" | "search" | "score">("idle"),
    [elapsed, setElapsed] = useState(0),
    [error, setError] = useState("");
  const [connect, setConnect] = useState(false),
    [keySource, setKeySource] = useState<"tavily" | "search1api" | "brave">(
      "tavily",
    ),
    [key, setKey] = useState(""),
    [notice, setNotice] = useState("");
  const [available, setAvailable] = useState<Record<string, boolean>>({
      github: true,
      hackernews: true,
      crossref: true,
      europepmc: true,
    }),
    [history, setHistory] = useState<{ label: string; ms: number }[]>([]);
  const busy = stage !== "idle";
  async function refresh() {
    try {
      const r = await fetch("/api/status");
      const s = await r.json();
      setAvailable(
        s.searchSources || {
          github: true,
          hackernews: true,
          crossref: true,
          europepmc: true,
        },
      );
    } catch {}
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!busy) return;
    const start = performance.now();
    const t = setInterval(() => setElapsed(performance.now() - start), 80);
    return () => clearInterval(t);
  }, [busy]);
  function toggle<T>(values: T[], value: T) {
    return values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
  }
  async function run(retrieve: boolean) {
    if (!sources.length || !providers.length) {
      setError("至少选择一个来源和一个决策引擎。");
      return;
    }
    setError("");
    setElapsed(0);
    setStage(retrieve ? "search" : "score");
    try {
      const next: SearchSnapshot = retrieve
        ? await post("retrieve", {
            query,
            sources,
            limit,
            ...(shopping ? { market } : {}),
          })
        : snapshot!;
      if (!next) throw new Error("请先搜索获取候选。");
      if (retrieve) {
        setSnapshot(next);
        setLiked([]);
        setExcluded([]);
        setResult(null);
      }
      setStage("score");
      const scored: SearchResult = await post("rank", {
        snapshotId: next.id,
        intent: intent.trim() || query.trim(),
        providers,
        threshold,
        liked: retrieve ? [] : liked,
        excluded: retrieve ? [] : excluded,
      });
      setResult(scored);
      setSelected(
        scored.decisions.find((d) => !d.error)?.provider || providers[0],
      );
      setHistory((h) =>
        [
          ...h,
          {
            label: retrieve ? "搜索＋决策" : "反馈重评",
            ms: (retrieve ? next.searchMs : 0) + scored.rankingMs,
          },
        ].slice(-12),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStage("idle");
    }
  }
  async function saveKey(clear = false) {
    setNotice("");
    setError("");
    try {
      await post("connect", { source: keySource, key, clear });
      setKey("");
      setNotice(
        clear ? "搜索连接已清除。" : "搜索连接已保存。点击搜索时才请求服务。",
      );
      await refresh();
      if (!clear) setSources([keySource]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const decision = result?.decisions.find((d) => d.provider === selected);
  const rows = decision?.rows.filter((r) => showDropped || r.retained) || [];
  const scope =
    sources.length &&
    sources.every((s) => ["crossref", "europepmc"].includes(s))
      ? "papers"
      : sources.length &&
          sources.every((s) => ["github", "hackernews"].includes(s))
        ? "tech"
        : sources.length &&
            sources.every((s) => ["tavily", "brave", "search1api"].includes(s))
          ? "web"
          : "custom";
  const searchChanged =
    snapshot &&
    (query.trim() !== snapshot.query ||
      (shopping && market !== snapshot.market) ||
      limit !== snapshot.requestedLimit ||
      JSON.stringify(sources) !==
        JSON.stringify(snapshot.lanes.map((l) => l.source)));
  const changed =
    result &&
    ((intent.trim() || query.trim()) !== result.intent ||
      threshold !== result.threshold ||
      JSON.stringify(liked) !== JSON.stringify(result.liked) ||
      JSON.stringify(excluded) !== JSON.stringify(result.excluded));
  return (
    <div className={`search-lab ${snapshot ? "has-results" : "is-empty"}`}>
      <div className="search-heading">
        <div>
          <span className="eyebrow">A SMALL INTENTION. A WORLD TO FIND.</span>
          <h1>
            {shopping ? "少一点挑选，" : "拾一份心意，"}
            <br />
            {shopping ? "找到真正想买的" : "发现下一种可能"}
            <span className="artist-mark">✳</span>
          </h1>
          <p>
            {shopping
              ? "从真实商品页面出发，选择更有依据。"
              : "少一点翻找，多一点刚刚好。"}
          </p>
        </div>
      </div>
      {shopping ? (
        <div className="search-scopes" role="group" aria-label="电商平台">
          {(Object.keys(shoppingMarkets) as ShoppingMarket[]).map((m) => (
            <button
              key={m}
              aria-pressed={market === m}
              disabled={busy}
              onClick={() => setMarket(m)}
            >
              {shoppingMarkets[m]}
            </button>
          ))}
        </div>
      ) : (
        <div className="search-scopes" role="group" aria-label="搜索范围">
          <button
            aria-pressed={scope === "tech"}
            disabled={busy}
            onClick={() => setSources(["github", "hackernews"])}
          >
            开源与技术
          </button>
          <button
            aria-pressed={scope === "papers"}
            disabled={busy}
            onClick={() => setSources(["crossref", "europepmc"])}
          >
            论文 <small>免费</small>
          </button>
          <button
            aria-pressed={scope === "web"}
            disabled={busy}
            onClick={() => {
              const connected = (
                ["tavily", "search1api", "brave"] as SearchSource[]
              ).filter((s) => available[s]);
              setSources(connected.length ? [connected[0]] : ["tavily"]);
              if (!connected.length) {
                setOptionsOpen(true);
                setConnect(true);
              }
            }}
          >
            全网{" "}
            <small>
              {available.tavily || available.search1api || available.brave
                ? "已连接"
                : "需连接"}
            </small>
          </button>
        </div>
      )}
      <section className="search-workbench">
        <label className="search-query">
          <Search size={22} />
          <input
            aria-label="联网搜索词"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="此刻，你想发现什么？"
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.nativeEvent.isComposing &&
                query.trim()
              )
                void run(true);
            }}
            disabled={busy}
          />
          <button
            className="primary"
            onClick={() => void run(true)}
            disabled={busy || !query.trim()}
          >
            {busy ? "正在决策…" : shopping ? "检索商品" : "发现"}
            <ArrowUpRight size={16} />
          </button>
        </label>
        <p className="search-scope-note">
          {shopping
            ? "平台搜索可直接免费打开；在此筛选真实商品链接，需要连接 Search1API 或 Brave。价格、库存与商品图以平台页面为准。"
            : scope === "papers"
              ? "免费检索跨学科题录与生物医学文献，无需 Key。英文关键词通常覆盖更广。"
              : scope === "tech"
                ? "当前范围：开源项目与技术讨论。找论文或开放网页，可切换上方范围。"
                : scope === "web"
                  ? "全网搜索需要搜索服务连接；模型 Key 用于评分，不会自动启用联网。"
                  : "正在使用自选来源。"}
        </p>
        <div className="search-context">
          <span>{sources.map((s) => t(sourceNames[s])).join(" · ")}</span>
          <span>
            {providers.length === 1
              ? providers[0] === "baseline"
                ? "关键词判断"
                : providerNames[providers[0]]
              : `${providers.length} 个模型对照`}
          </span>
        </div>
        {shopping && (
          <div className="store-links">
            <a
              href={`${market === "amazon" ? "https://www.amazon.com/s?k=" : market === "taobao" ? "https://s.taobao.com/search?q=" : "https://search.jd.com/Search?enc=utf-8&keyword="}${encodeURIComponent(query.trim())}`}
              target="_blank"
              rel="noreferrer"
            >
              直接去平台搜索 <ArrowUpRight size={13} />
            </a>
            <button
              onClick={() => {
                setOptionsOpen(true);
                setConnect(true);
              }}
            >
              连接后在此推荐
            </button>
          </div>
        )}
        <details
          className="search-options"
          open={optionsOpen}
          onToggle={(e) => setOptionsOpen(e.currentTarget.open)}
        >
          <summary>
            <Settings2 size={14} />
            调整来源与偏好<span>＋</span>
          </summary>
          <label className="search-intent">
            更具体的需求（选填）
            <textarea
              aria-label="联网匹配需求"
              placeholder="例如：优先开源、可本地运行；不填则按上方需求判断"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={2}
              disabled={busy}
            />
          </label>
          <div className="search-controls">
            <fieldset>
              <legend>候选从哪里来</legend>
              <div className="search-chips">
                {(Object.keys(sourceNames) as SearchSource[])
                  .filter(
                    (s) =>
                      !shopping ||
                      ["tavily", "search1api", "brave"].includes(s),
                  )
                  .map((s) => (
                    <label
                      key={s}
                      className={sources.includes(s) ? "chosen" : ""}
                    >
                      <input
                        type="checkbox"
                        checked={sources.includes(s)}
                        onChange={() => setSources(toggle(sources, s))}
                        disabled={busy}
                      />
                      {sourceNames[s]}
                      {!available[s] && <small>需 Key</small>}
                    </label>
                  ))}
              </div>
            </fieldset>
            <button
              className="text-btn"
              onClick={() => setConnect(!connect)}
              disabled={busy}
            >
              <Settings2 size={15} />
              搜索连接
            </button>
          </div>
          <div className="search-controls">
            <fieldset>
              <legend>谁来做判断 · 可同场对照</legend>
              <div className="search-chips">
                {(
                  [
                    "baseline",
                    "jev",
                    "openai",
                    "claude",
                    "minicpm",
                  ] as Provider[]
                ).map((p) => (
                  <label
                    key={p}
                    className={providers.includes(p) ? "chosen" : ""}
                  >
                    <input
                      type="checkbox"
                      checked={providers.includes(p)}
                      onChange={() => setProviders(toggle(providers, p))}
                      disabled={busy}
                    />
                    {p === "baseline" ? "关键词基线" : providerNames[p]}
                    {p !== "baseline" &&
                      !profiles.find((x) => x.provider === p)?.configured && (
                        <small>需连接</small>
                      )}
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              className="text-btn"
              onClick={onModelSettings}
              disabled={busy}
            >
              模型连接
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="search-tuning">
            <label>
              每源候选数
              <input
                aria-label="每源候选数"
                type="number"
                min="1"
                max="100"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                disabled={busy}
              />
            </label>
            <label>
              保留阈值 <b>{Math.round(threshold * 100)}%</b>
              <input
                aria-label="联网匹配保留阈值"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                disabled={busy}
              />
            </label>
            <button
              className="secondary"
              disabled={busy || !snapshot}
              onClick={() => void run(false)}
            >
              <RefreshCw size={14} />
              按新偏好重新评分
            </button>
          </div>
          <p className="search-note">
            GitHub 与 Hacker News 无需搜索
            Key，范围是开源项目与技术讨论；搜索商品、旅行等开放网页，请配置
            Tavily、Search1API 或
            Brave。搜索词会发送给所选来源；选用模型时，需求、标题、摘要和反馈会发送给该模型。仅判断已返回的摘要，未核验库存、价格或网页全文。
          </p>
          {connect && (
            <div className="search-connect">
              <label>
                搜索服务
                <select
                  value={keySource}
                  onChange={(e) => {
                    setKeySource(e.target.value as typeof keySource);
                    setKey("");
                  }}
                >
                  <option value="tavily">Tavily</option>
                  <option value="search1api">Search1API</option>
                  <option value="brave">Brave Search</option>
                </select>
              </label>
              <label>
                API Key
                <input
                  type="password"
                  autoComplete="off"
                  aria-label="搜索 API Key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </label>
              <button className="primary" onClick={() => void saveKey()}>
                保存搜索连接
              </button>
              <button className="secondary" onClick={() => void saveKey(true)}>
                清除连接
              </button>
              <p>
                Key 只保存在本机服务内存；重启清除，不进入浏览器存储或实验导出。
              </p>
              {keySource === "tavily" && (
                <p>
                  <a
                    href="https://app.tavily.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    申请 Tavily 免费 Key
                  </a>
                  {" · "}
                  <a
                    href="https://docs.tavily.com/documentation/api-credits"
                    target="_blank"
                    rel="noreferrer"
                  >
                    免费额度与计费规则
                  </a>
                  <br />
                  本项目固定基础搜索，每次 1 credit；每个来源最多取 20
                  条结果。免费账户每月 1,000
                  credits，无需绑卡，以服务方当前规则为准。
                </p>
              )}
              {notice && <p role="status">{notice}</p>}
            </div>
          )}
        </details>
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <div className="search-progress" role="status">
          <Activity size={18} />
          <strong>
            {stage === "search"
              ? "正在从所选来源获取候选"
              : "候选已就绪，正在评分"}
          </strong>
          <span>{ms(elapsed)}</span>
          <small>
            {stage === "search"
              ? "并行检索、清理链接、合并重复来源"
              : "各引擎按相同候选顺序执行；等待真实响应"}
          </small>
        </div>
      )}
      {!shopping && !snapshot && !busy && (
        <div className="artist-inspirations">
          <span>从一点灵感开始</span>
          <div>
            {(scope === "papers"
              ? [
                  {
                    name: "推荐系统综述",
                    query: "recommendation systems survey",
                    intent: "推荐系统综述与方法比较",
                  },
                  {
                    name: "检索增强生成",
                    query: "retrieval augmented generation",
                    intent: "检索增强生成的评测方法",
                  },
                  {
                    name: "医疗决策支持",
                    query: "clinical decision support",
                    intent: "临床决策支持的评估研究",
                  },
                ]
              : [
                  {
                    name: "Jev 的新玩法",
                    query: "jev",
                    intent: "Jev 搜索与快速决策的开源实现",
                  },
                  {
                    name: "找个好用的 AI 工具",
                    query: "local AI assistant",
                    intent: "可本地运行的 AI 助手，关注隐私和使用门槛",
                  },
                  {
                    name: "开源推荐系统",
                    query: "recommendation system",
                    intent: "推荐系统研究和可复现实现",
                  },
                ]
            ).map((e) => (
              <button
                key={e.name}
                onClick={() => {
                  setQuery(e.query);
                  setIntent(t(e.intent));
                }}
              >
                {e.name}
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
          <p>默认探索开源项目与技术讨论。切换“论文”可免费检索学术文献。</p>
        </div>
      )}
      {snapshot && (
        <>
          <details className="dashboard-disclosure">
            <summary>
              <Activity size={15} />
              查看决策过程
              <span>
                {snapshot.candidates.length} 个候选 · 搜索{" "}
                {ms(snapshot.searchMs)}
                {result ? ` · 评分 ${ms(result.rankingMs)}` : ""}
              </span>
              <b>＋</b>
            </summary>
            <section className="decision-dashboard">
              <div className="search-section-title">
                <h2>
                  <Activity size={20} />
                  决策大盘
                </h2>
                <div>
                  <span>{snapshot.query}</span>
                  <button
                    className="text-btn"
                    disabled={!result}
                    onClick={() => saveJSON(result)}
                  >
                    导出完整证据
                    <Download size={14} />
                  </button>
                </div>
              </div>
              <div className="decision-kpis">
                <div>
                  <span>真实候选</span>
                  <strong>{snapshot.candidates.length}</strong>
                  <small>按 URL 去重后</small>
                </div>
                <div>
                  <span>联网耗时</span>
                  <strong>{ms(snapshot.searchMs)}</strong>
                  <small>含来源请求与去重</small>
                </div>
                <div>
                  <span>本轮评分耗时</span>
                  <strong>{result ? ms(result.rankingMs) : "—"}</strong>
                  <small>多模型按顺序执行</small>
                </div>
                <div>
                  <span>当前引擎保留</span>
                  <strong>
                    {decision && !decision.error
                      ? decision.rows.filter((r) => r.retained).length
                      : "—"}
                    <em> / {snapshot.candidates.length}</em>
                  </strong>
                  <small>低分结果仍可展开</small>
                </div>
              </div>
              <div className="decision-panels">
                <div className="decision-panel">
                  <h3>搜索来源与耗时</h3>
                  {snapshot.lanes.map((l) => (
                    <div className="timing-row" key={l.source}>
                      <div>
                        <span>{sourceNames[l.source]}</span>
                        <b>{ms(l.ms)}</b>
                      </div>
                      <div className="timing-track">
                        <i
                          style={{
                            width: `${Math.max(1, (l.ms / Math.max(snapshot.searchMs, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>{l.error || `${l.count} 条返回结果`}</small>
                    </div>
                  ))}
                </div>
                <div className="decision-panel">
                  <h3>模型响应对照</h3>
                  {result?.decisions.map((d) => (
                    <div className="timing-row" key={d.provider}>
                      <div>
                        <span>
                          {d.provider === "baseline"
                            ? "关键词基线"
                            : providerNames[d.provider]}
                        </span>
                        <b>{ms(d.ms)}</b>
                      </div>
                      <div className="timing-track model">
                        <i
                          style={{
                            width: `${Math.max(1, (d.ms / Math.max(...result.decisions.map((x) => x.ms), 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>
                        {d.error ||
                          `${d.model} · ${d.calls} 次请求 · ${d.rows.length * 2} 项评分`}
                      </small>
                    </div>
                  )) || <p>等待评分</p>}
                </div>
              </div>
              {history.length > 1 && (
                <div className="decision-history">
                  <span>最近 {history.length} 轮</span>
                  {history.map((h, i) => (
                    <div key={i} title={`${h.label} ${ms(h.ms)}`}>
                      <i
                        style={{
                          height: `${Math.max(5, (h.ms / Math.max(...history.map((x) => x.ms))) * 48)}px`,
                        }}
                      />
                      <small>{i + 1}</small>
                    </div>
                  ))}
                  <small>每轮实测耗时，非通用性能基准</small>
                </div>
              )}
            </section>
          </details>
          {searchChanged && (
            <p className="search-pending">
              搜索条件已改变；下方仍是上一轮结果，请点击“发现”重新检索。
            </p>
          )}
          {shopping && (
            <p className="search-scope-note">
              仅展示搜索来源返回的商品详情链接，不生成虚构商品、价格或图片。
            </p>
          )}
          <p className="search-snapshot-label">
            结果来自：<b translate="no">{snapshot.query}</b> ·{" "}
            {snapshot.lanes.map((l) => t(sourceNames[l.source])).join(" · ")}
          </p>
          {snapshot.lanes.some((l) => l.error) && (
            <p className="search-pending" role="status">
              部分来源暂时不可用，当前仅显示成功来源的结果；详情见决策过程。
            </p>
          )}
          {result && (
            <section className="search-results">
              <div className="search-section-title">
                <h2>
                  匹配结果 <small>{rows.length}</small>
                </h2>
                <label>
                  <input
                    type="checkbox"
                    checked={showDropped}
                    onChange={(e) => setShowDropped(e.target.checked)}
                  />
                  包含低分与已排除
                </label>
              </div>
              <div className="search-result-tabs">
                {result.decisions.map((d) => (
                  <button
                    key={d.provider}
                    className={selected === d.provider ? "active" : ""}
                    onClick={() => setSelected(d.provider)}
                  >
                    {d.provider === "baseline"
                      ? "关键词基线"
                      : providerNames[d.provider]}
                    {d.error ? " · 失败" : ""}
                  </button>
                ))}
              </div>
              {changed && (
                <p className="search-pending">
                  偏好已修改。点击“按新偏好重新评分”后生效；下方保留上一轮结果。
                </p>
              )}
              <div className="search-refine">
                <button
                  className="text-btn"
                  disabled={busy}
                  onClick={() => void run(false)}
                >
                  <RefreshCw size={13} />
                  按反馈重新匹配
                </button>
              </div>
              <p className="search-note">
                当前分数 = 70% 相关性 + 30%
                需求契合；关键词基线仅按文本重合度计算。模型分数与 Jev
                语义判断均不代表事实正确率；本地 logits
                与普通模型分数未经业务校准。修改搜索词或来源后，请重新搜索。
              </p>
              {decision?.error ? (
                <div className="error">{decision.error}</div>
              ) : !rows.length ? (
                <div className="search-empty compact">
                  当前没有达到阈值的结果。可展开低分候选，或调整需求与阈值后重评。
                </div>
              ) : (
                rows.map((r) => (
                  <article
                    className={`search-result ${r.retained ? "" : "dropped"}`}
                    key={r.id}
                  >
                    <div className="search-rank">
                      {String(r.rank).padStart(2, "0")}
                      <small>原 #{r.originalRank}</small>
                    </div>
                    <div className="search-result-main">
                      <div className="search-result-meta">
                        {r.sources.map((s) => t(sourceNames[s])).join(" · ")}
                        <span>{new URL(r.url).hostname}</span>
                      </div>
                      <h3>
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          translate="no"
                        >
                          {r.title}
                          <ArrowUpRight size={15} />
                        </a>
                      </h3>
                      {r.paper && (
                        <div className="paper-meta">
                          <span>{r.paper.year || "年份未标注"}</span>
                          {r.paper.venue && (
                            <span translate="no">{r.paper.venue}</span>
                          )}
                          {r.paper.openAccess === true && (
                            <span className="open-access">开放获取</span>
                          )}
                          {r.paper.authors && (
                            <small translate="no">{r.paper.authors}</small>
                          )}
                          {r.paper.doi && (
                            <small>
                              DOI: <span translate="no">{r.paper.doi}</span>
                            </small>
                          )}
                        </div>
                      )}
                      {r.snippet ? (
                        <div className="result-excerpt">
                          <p translate="no">
                            {r.snippet.length > 300
                              ? r.snippet.slice(0, 300) + "…"
                              : r.snippet}
                          </p>
                          {r.snippet.length > 300 && (
                            <details>
                              <summary>展开摘要片段</summary>
                              <p translate="no">{r.snippet}</p>
                            </details>
                          )}
                        </div>
                      ) : (
                        <p className="missing-abstract">
                          {r.paper
                            ? "来源未提供摘要，本次仅按题名判断；请打开原文核实。"
                            : "来源没有提供摘要，请打开原网页核实。"}
                        </p>
                      )}
                      {r.extra && <small>{r.extra}</small>}
                      <div className="search-feedback">
                        <button
                          disabled={busy}
                          className={liked.includes(r.id) ? "active" : ""}
                          onClick={() => {
                            setLiked(toggle(liked, r.id));
                            setExcluded(excluded.filter((id) => id !== r.id));
                          }}
                        >
                          <Heart size={13} />
                          {liked.includes(r.id) ? "已喜欢" : "更像我想要的"}
                        </button>
                        <button
                          disabled={busy}
                          className={excluded.includes(r.id) ? "active" : ""}
                          onClick={() => {
                            setExcluded(toggle(excluded, r.id));
                            setLiked(liked.filter((id) => id !== r.id));
                          }}
                        >
                          <Ban size={13} />
                          {excluded.includes(r.id) ? "撤销排除" : "不符合需求"}
                        </button>
                        <span>{r.reason}</span>
                      </div>
                    </div>
                    <div className="search-score">
                      <strong>
                        {(r.score * 100).toFixed(1)}
                        <small>匹配分</small>
                      </strong>
                      <label>
                        相关性 <b>{Math.round(r.evidence.relevance * 100)}%</b>
                        <meter min="0" max="1" value={r.evidence.relevance} />
                      </label>
                      <label>
                        需求契合 <b>{Math.round(r.evidence.affinity * 100)}%</b>
                        <meter min="0" max="1" value={r.evidence.affinity} />
                      </label>
                    </div>
                  </article>
                ))
              )}
              <p className="search-note">
                候选快照：
                {new Date(snapshot.createdAt).toLocaleString(
                  locale === "en" ? "en-US" : "zh-CN",
                )}{" "}
                · {snapshot.fingerprint.slice(0, 12)}。保留 30
                分钟，可重复评分；不同轮次的联网搜索结果可能变化。
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
