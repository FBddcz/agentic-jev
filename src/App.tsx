import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  Compass,
  FlaskConical,
  BookOpen,
  Heart,
  Pin,
  X,
  SlidersHorizontal,
  Search,
  Zap,
  Check,
  ChevronDown,
  Download,
  RefreshCw,
  Settings2,
  Leaf,
  Tent,
  Coffee,
  BriefcaseBusiness,
  Monitor,
  ExternalLink,
  CircleHelp,
  LoaderCircle,
  Ban,
  Radio,
  Layers3,
  ChevronRight,
  CheckCheck,
  Plus,
} from "lucide-react";
import { defaultConfig, missions, products } from "./data";
import type { Config, Evaluation, Ranked, Run } from "./types";
import { Landscape, ProductArt, VisualMode, photoAssets } from "./Art";
import {
  ModelSettings,
  ModelCompare,
  profileDefaults,
  providerNames,
} from "./ModelPanels";

const money = (n: number) =>
  `¥${n.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const icons = {
  camp: Tent,
  desk: Monitor,
  commute: BriefcaseBusiness,
  coffee: Coffee,
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(
    `/api/${path}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "请求失败");
  return data;
}
function download(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-inner">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function ProductCard({
  p,
  index,
  config,
  busy,
  onFeedback,
  onInspect,
}: {
  p: Ranked;
  index: number;
  config: Config;
  busy: boolean;
  onFeedback: (id: string, key: "likes" | "locked" | "dislikes") => void;
  onInspect: (p: Ranked) => void;
}) {
  return (
    <article
      className="product-card"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="product-visual" style={{ background: `${p.color}22` }}>
        <span className="category-label">{p.category}</span>
        <button
          className={`favorite ${config.likes.includes(p.id) ? "selected" : ""}`}
          disabled={busy}
          onClick={() => onFeedback(p.id, "likes")}
          aria-label={`${config.likes.includes(p.id) ? "取消喜欢" : "喜欢"}${p.name}`}
        >
          <Heart
            size={17}
            fill={config.likes.includes(p.id) ? "currentColor" : "none"}
          />
        </button>
        <button
          className="art-button"
          onClick={() => onInspect(p)}
          aria-label={`查看${p.name}的推荐依据`}
        >
          <ProductArt kind={p.art} color={p.color} />
        </button>
        {config.locked.includes(p.id) && (
          <span className="locked-tag">
            <Pin size={10} />
            已固定
          </span>
        )}
      </div>
      <div className="product-info">
        <span className="product-subtitle">{p.subtitle}</span>
        <h3>
          <button onClick={() => onInspect(p)}>{p.name}</button>
        </h3>
        <div className="price-line">
          <strong>{money(p.price)}</strong>
          <span>
            <span className="mini-dot" />
            匹配 {pct(p.evidence.relevance)}
          </span>
        </div>
        <div className="card-actions">
          <button
            className={config.locked.includes(p.id) ? "active" : ""}
            disabled={busy}
            onClick={() => onFeedback(p.id, "locked")}
          >
            <Pin size={13} />
            {config.locked.includes(p.id) ? "取消固定" : "固定这件"}
          </button>
          <button
            disabled={busy}
            onClick={() => onFeedback(p.id, "dislikes")}
            aria-label={`排除${p.name}`}
          >
            <RefreshCw size={13} />
            换一件
          </button>
        </div>
      </div>
    </article>
  );
}
function Sources() {
  const sources = [
    [
      "官方模型与 API",
      "TypeSafe · Jev",
      "Choice / Score / Noul 三类判断；本项目直接使用官方 JavaScript SDK。",
      "https://docs.typesafe.ai/api",
      "已接入",
    ],
    [
      "最接近的官方范例",
      "TypeSafe · Re-ranking",
      "BM25 短名单 → Noul 重排，为本项目的召回与决策分工提供依据。",
      "https://docs.typesafe.ai/cookbooks/rerank_typesafe",
      "方法参考",
    ],
    [
      "本地快速决策",
      "TheoLeeCJ / SemIf",
      "直接读取候选 logits，复用公共前缀 KV，批量计算问题后缀；本项目 MiniCPM 路径的方法参考。",
      "https://github.com/TheoLeeCJ/SemIf",
      "已借鉴",
    ],
    [
      "开源重排实现",
      "hotchpotch / jev-reranker",
      "以 Jev 判断检索结果的相关性与证据价值。MIT 许可。",
      "https://github.com/hotchpotch/jev-reranker",
      "相关项目",
    ],
    [
      "开源搜索应用",
      "superagents-lab / jev-search",
      "搜索结果经 Jev 判断、重排与分组。MIT 许可。",
      "https://github.com/superagents-lab/jev-search",
      "相关项目",
    ],
    [
      "快速决策模式",
      "browser-use / jev-ultrafast",
      "动态候选空间 + 一次调用中的多项判断，借鉴其窄决策循环。",
      "https://github.com/browser-use/jev-ultrafast",
      "架构参考",
    ],
    [
      "生成式推荐研究",
      "Meta · Generative Recommenders",
      "HSTU 序列建模研究；与这里的约束组合生成是不同技术路线。",
      "https://github.com/meta-recsys/generative-recommenders",
      "研究背景",
    ],
    [
      "开放研究环境",
      "Google Research · RecSim",
      "可配置的连续交互推荐仿真；后续接入会话级实验的参考。",
      "https://github.com/google-research/recsim",
      "下一阶段",
    ],
    [
      "模型对照入口",
      "TypeSafe · System One Adapter",
      "用普通 LLM API 替换 System One 接口，适合后续公平成本 / 质量对照。",
      "https://github.com/typesafe-ai/system-one-adapter-python",
      "下一阶段",
    ],
  ];
  return (
    <>
      <div className="section-intro">
        <div>
          <span className="eyebrow">RESEARCH, WITH RECEIPTS</span>
          <h1>好想法，也要有依据。</h1>
          <p>把一次购物体验，变成一个可复现的研究问题。</p>
        </div>
        <span className="pill">资料核验 · 2026.09.20</span>
      </div>
      <div className="research-thesis">
        <Sparkles size={28} />
        <div>
          <span className="eyebrow">THE QUESTION</span>
          <h2>快速结构化决策，能否生成更好的整套推荐？</h2>
          <p>
            在相同候选、预算和反馈条件下，比较逐件排序与组合生成；同时关注偏好满足、需求覆盖和交互延迟。它是一个待验证的假设。
          </p>
        </div>
      </div>
      <div className="source-grid">
        {sources.map(([label, title, desc, url, tag]) => (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="source-card"
            key={title}
          >
            <div>
              <span className="eyebrow">{label}</span>
              <ArrowUpRight size={19} />
            </div>
            <h3>{title}</h3>
            <p>{desc}</p>
            <span className="pill">{tag}</span>
          </a>
        ))}
      </div>
      <div className="note-box">
        <CircleHelp size={18} />
        <p>
          当前生成的是商品组合及其展示结构，使用有限商品集合上的约束搜索；没有训练语义
          ID 生成模型，也不宣称已复现 TIGER / HSTU。Jev 本体以官方 API
          提供，开源
          SDK、适配器和社区复现不等于官方开放权重。完整调研与路线见仓库
          docs/RESEARCH.md。
        </p>
      </div>
    </>
  );
}
export default function App() {
  const [visual, setVisual] = useState<"photos" | "illustrations">("photos");
  const [page, setPage] = useState<"discover" | "lab" | "research">("discover");
  const [config, setConfig] = useState<Config>({ ...defaultConfig });
  const [run, setRun] = useState<Run | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [status, setStatus] = useState({
    configured: false,
    verified: false,
    model: "jev-latest",
    profiles: profileDefaults,
  });
  const [settings, setSettings] = useState(false);
  const [inspect, setInspect] = useState<Ranked | null>(null),
    [showCandidates, setShowCandidates] = useState(false),
    [filter, setFilter] = useState("");
  const [evalResult, setEvalResult] = useState<Evaluation | null>(null),
    [seed, setSeed] = useState(42);
  const [compare, setCompare] = useState(false),
    [toast, setToast] = useState("");
  const init = useRef(false);
  const scene = missions.find(
    (m) => m.id === (run?.mission ?? config.mission),
  )!;
  const requestedScene = missions.find((m) => m.id === config.mission)!;
  const stale = run && JSON.stringify(run.config) !== JSON.stringify(config);
  async function refreshStatus() {
    try {
      const s = await api<typeof status>("status");
      setStatus(s);
    } catch {
      /* Main API errors are shown by the action that failed. */
    }
  }
  async function generate(next = config) {
    setBusy(true);
    setError("");
    try {
      const result = await api<Run>("generate", next);
      setRun(result);
      setCompare(false);
      await refreshStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!init.current) {
      init.current = true;
      void generate(defaultConfig);
    }
  }, []);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 3000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  function missionChange(id: Config["mission"]) {
    const m = missions.find((m) => m.id === id)!;
    const next = {
      ...config,
      mission: id,
      query: m.query,
      budget: m.budget,
      locked: [],
      dislikes: [],
    };
    setConfig(next);
    setPage("discover");
    void generate(next);
  }
  function feedback(id: string, type: "likes" | "locked" | "dislikes") {
    if (
      type === "locked" &&
      !config.locked.includes(id) &&
      config.locked.length >= 4
    ) {
      setToast("最多固定 4 件，请先取消固定一件。");
      return;
    }
    const next = {
      ...config,
      [type]: config[type].includes(id)
        ? config[type].filter((v) => v !== id)
        : [...config[type], id],
    };
    if (type === "dislikes") {
      next.locked = next.locked.filter((v) => v !== id);
      next.likes = next.likes.filter((v) => v !== id);
    }
    setConfig(next);
    void generate(next);
  }
  async function runEvaluation() {
    setBusy(true);
    setError("");
    try {
      setEvalResult(
        await api<Evaluation>("evaluate", { provider: config.provider, seed }),
      );
      await refreshStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const shown = compare ? run?.greedy : run?.slate;
  return (
    <VisualMode.Provider value={visual}>
      <div className="app-shell">
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPage("discover");
            }}
          >
            <span className="brand-icon">✳</span>
            <div>
              <strong>
                拾意<span>RecJev</span>
              </strong>
              <small>LESS SCROLL. MORE YOU.</small>
            </div>
          </a>
          <span className="nav-caption">你的发现空间</span>
          <nav>
            {(
              [
                { id: "discover", name: "灵感探索", icon: Compass },
                { id: "lab", name: "对照实验", icon: FlaskConical },
                { id: "research", name: "研究地图", icon: BookOpen },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                className={page === item.id ? "nav-item active" : "nav-item"}
                onClick={() => setPage(item.id)}
              >
                <item.icon size={18} />
                {item.name}
                {page === item.id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-rule" />
          <span className="nav-caption">从一个小计划开始</span>
          <div className="mission-nav">
            {missions.map((m) => {
              const Icon = icons[m.id];
              return (
                <button
                  disabled={busy}
                  onClick={() => missionChange(m.id)}
                  key={m.id}
                  className={config.mission === m.id ? "selected" : ""}
                >
                  <Icon size={17} />
                  {m.name}
                  <ChevronRight size={13} />
                </button>
              );
            })}
          </div>
          <div className="sidebar-note">
            <div className="orbit">
              <Sparkles size={22} />
            </div>
            <strong>
              每一个选择，
              <br />
              都更接近你。
            </strong>
            <p>
              喜欢、固定，或换一件。
              <br />
              让下一次推荐更懂你。
            </p>
            <span>
              <span className="online-dot" />
              交互式研究原型
            </span>
          </div>
          <a
            href="https://github.com/FBddcz/rec-jev"
            target="_blank"
            rel="noreferrer"
            className="github-link"
          >
            <span>开源，欢迎一起探索</span>
            <ArrowUpRight size={15} />
          </a>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              发现生活的另一种可能<span>/</span>
              <strong>
                {page === "discover"
                  ? "灵感探索"
                  : page === "lab"
                    ? "对照实验"
                    : "研究地图"}
              </strong>
            </div>
            <div className="top-actions">
              <button
                className="visual-toggle"
                onClick={() =>
                  setVisual(visual === "photos" ? "illustrations" : "photos")
                }
                aria-label="切换照片与插画"
              >
                {visual === "photos" ? "实拍参考" : "插画模式"}
                <RefreshCw size={12} />
              </button>
              <button
                className="connection"
                onClick={() => setSettings(true)}
                disabled={busy}
              >
                <span
                  className={status.verified ? "online-dot" : "neutral-dot"}
                />
                模型连接
                <Settings2 size={14} />
              </button>
              <span className="avatar">意</span>
            </div>
          </header>
          <main>
            {error && (
              <div className="error" role="alert">
                <CircleHelp size={18} />
                <span>
                  {error}
                  {run && " 当前保留上次成功生成的结果。"}
                </span>
                <button onClick={() => setError("")} aria-label="关闭错误">
                  <X size={16} />
                </button>
              </div>
            )}
            {page === "discover" && (
              <>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">
                      A LITTLE INTENTION. A NEW DISCOVERY.
                    </span>
                    <h1>
                      灵感，刚好发生<span className="heading-star">✳</span>
                    </h1>
                    <p>告诉我你想做什么，一起发现更适合你的那一套。</p>
                  </div>
                  <span className="edition">
                    NO. 001 <span>生活提案</span>
                  </span>
                </div>
                <div className="mobile-scenes">
                  {missions.map((m) => (
                    <button
                      key={m.id}
                      disabled={busy}
                      className={m.id === config.mission ? "active" : ""}
                      onClick={() => missionChange(m.id)}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
                <div className="discovery-top">
                  <section
                    className={`hero hero-${config.mission}`}
                    style={{ background: requestedScene.color }}
                  >
                    <span className="hero-kicker">
                      <Leaf size={13} />
                      {requestedScene.en}
                    </span>
                    <h2>{requestedScene.title}</h2>
                    <p>{requestedScene.subtitle}</p>
                    {config.mission === "camp" ? (
                      <Landscape />
                    ) : (
                      <div className="hero-object">
                        <ProductArt
                          kind={
                            config.mission === "desk"
                              ? "lamp"
                              : config.mission === "coffee"
                                ? "kettle"
                                : "bag"
                          }
                          color={
                            config.mission === "desk"
                              ? "#9b9d82"
                              : config.mission === "coffee"
                                ? "#ac8969"
                                : "#839a8c"
                          }
                        />
                      </div>
                    )}
                    <div className="hero-footer">
                      <span className="tiny-circle">↗</span>
                      好生活，从一个小计划开始。
                      <span className="hero-number">
                        0
                        {missions.findIndex((m) => m.id === config.mission) + 1}{" "}
                        / 04
                      </span>
                    </div>
                  </section>
                  <section className="preferences">
                    <div className="panel-heading">
                      <h3>
                        <SlidersHorizontal size={17} />
                        按你的心意
                      </h3>
                      <span>实时可调</span>
                    </div>
                    <label className="range-label" htmlFor="budget">
                      整套预算<strong>{money(config.budget)}</strong>
                    </label>
                    <input
                      id="budget"
                      type="range"
                      min="100"
                      max="3000"
                      step="50"
                      value={config.budget}
                      disabled={busy}
                      onChange={(e) =>
                        setConfig({ ...config, budget: Number(e.target.value) })
                      }
                    />
                    <div className="range-ends">
                      <span>¥100</span>
                      <span>¥3,000</span>
                    </div>
                    <label
                      className="range-label diversity-label"
                      htmlFor="diversity"
                    >
                      探索更多搭配<span>{pct(config.diversity)}</span>
                    </label>
                    <input
                      id="diversity"
                      type="range"
                      min="0"
                      max="1"
                      step=".01"
                      value={config.diversity}
                      disabled={busy}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          diversity: Number(e.target.value),
                        })
                      }
                    />
                    <div className="range-ends">
                      <span>偏好优先</span>
                      <span>互补优先</span>
                    </div>
                    <div className="preference-rule" />
                    <label className="engine-label">
                      决策引擎
                      <select
                        aria-label="决策引擎"
                        disabled={busy}
                        value={config.provider}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            provider: e.target.value as Config["provider"],
                          })
                        }
                      >
                        {Object.entries(providerNames).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="switch-line">
                      <span>
                        发现赞助好物 <CircleHelp size={12} />
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={config.ads}
                        disabled={busy}
                        onChange={(e) =>
                          setConfig({ ...config, ads: e.target.checked })
                        }
                      />
                    </label>
                  </section>
                </div>
                <form
                  className="intent-bar"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void generate();
                  }}
                >
                  <div className="search-symbol">
                    <Sparkles size={23} />
                  </div>
                  <div className="intent-input">
                    <label htmlFor="intent">这一刻，你想要什么？</label>
                    <input
                      id="intent"
                      value={config.query}
                      maxLength={500}
                      disabled={busy}
                      onChange={(e) =>
                        setConfig({ ...config, query: e.target.value })
                      }
                      placeholder="例如：轻装出门，找一套周末露营装备"
                    />
                  </div>
                  <button className="primary" disabled={busy}>
                    {busy ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}{" "}
                    {busy
                      ? "正在生成"
                      : stale
                        ? "按新偏好生成"
                        : "生成我的方案"}
                    <ArrowRight size={16} />
                  </button>
                </form>
                <div className="session-line">
                  <span>
                    <Radio size={13} />
                    偏好会话
                  </span>
                  <span>{config.likes.length} 个喜欢</span>
                  <span>{config.locked.length} 件固定</span>
                  <span>{config.dislikes.length} 件已排除</span>
                  {config.likes.length +
                    config.locked.length +
                    config.dislikes.length >
                    0 && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        const c = {
                          ...config,
                          likes: [],
                          locked: [],
                          dislikes: [],
                        };
                        setConfig(c);
                        void generate(c);
                      }}
                    >
                      清空反馈
                    </button>
                  )}
                  <span className="session-note">
                    {config.provider === "baseline"
                      ? "无需 API Key，即刻体验"
                      : "生成与反馈会调用所选模型服务"}
                  </span>
                </div>
                <div className="board-heading">
                  <div>
                    <span className="eyebrow">CURATED AROUND YOUR INTENT</span>
                    <h2>
                      {compare ? "逐件排序，会选这些" : "你的下一套，刚刚好"}
                      <span className="count-pill">
                        {shown?.length ?? 0} 件好物
                      </span>
                    </h2>
                  </div>
                  <div className="board-tools">
                    <button
                      className="text-btn"
                      disabled={!run || busy}
                      onClick={() => setCompare(!compare)}
                    >
                      <Layers3 size={15} />
                      {compare ? "回到组合生成" : "看看普通排序"}
                    </button>
                    <button
                      className="icon-btn"
                      disabled={!run}
                      onClick={() =>
                        download(run, `recjev-${run!.id.slice(0, 8)}.json`)
                      }
                      aria-label="导出本次实验 JSON"
                    >
                      <Download size={17} />
                    </button>
                  </div>
                </div>
                {run && (
                  <div className={`slate-summary ${stale ? "is-stale" : ""}`}>
                    <span>
                      <CheckCheck size={16} />
                      {stale ? "展示上次生成结果" : "预算内，为你组合"}
                    </span>
                    <span>
                      合计{" "}
                      <strong>
                        {money((shown ?? []).reduce((s, p) => s + p.price, 0))}
                      </strong>
                      <i>/ {money(run.config.budget)}</i>
                    </span>
                    <span className="summary-right">
                      {compare
                        ? "对照：预算约束下逐件贪心选择"
                        : `${scene.name} · 需求覆盖 ${pct(run.coverage)}`}
                    </span>
                  </div>
                )}
                <div className={`product-grid ${busy ? "is-loading" : ""}`}>
                  {shown?.map((p, i) => (
                    <ProductCard
                      p={p}
                      index={i}
                      key={p.id}
                      config={config}
                      busy={busy}
                      onFeedback={feedback}
                      onInspect={setInspect}
                    />
                  ))}
                  {!run &&
                    Array.from({ length: 4 }, (_, i) => (
                      <div key={i} className="product-skeleton" />
                    ))}
                  {run && shown?.length === 0 && (
                    <div className="empty-state">
                      <Search />
                      <h3>这次条件下，还没有合适的组合。</h3>
                      <p>试试提高预算，或清空已排除的商品。</p>
                    </div>
                  )}
                </div>
                <div className="under-grid">
                  <section className="decision-card">
                    <div className="panel-heading">
                      <h3>
                        <Zap size={17} />
                        每一步，都看得见
                      </h3>
                      <span className="pill">
                        {run?.modelCalls ?? 0} 次模型调用
                      </span>
                    </div>
                    <div className="trace-steps">
                      {(run?.trace ?? []).map((t, i) => (
                        <div key={t.name}>
                          <span className="step-number">0{i + 1}</span>
                          <strong>{t.name}</strong>
                          <p>{t.detail}</p>
                        </div>
                      ))}
                    </div>
                    <div className="trace-footer">
                      <span>
                        <span className="online-dot" />
                        {run?.model ?? "准备中"}
                      </span>
                      <span>
                        本次服务端耗时{" "}
                        <b>{run ? run.totalLatency.toFixed(1) : "—"} ms</b>
                      </span>
                      <button
                        className="text-btn"
                        onClick={() => setPage("lab")}
                      >
                        去做对照实验
                        <ArrowUpRight size={13} />
                      </button>
                    </div>
                  </section>
                  <section className="sponsor-card">
                    <div className="sponsor-top">
                      <span className="eyebrow">ANOTHER GOOD FIND</span>
                      <span className="ad-label">赞助 · 模拟</span>
                    </div>
                    {run?.auction.winner ? (
                      <>
                        <div className="sponsor-content">
                          <ProductArt
                            kind={run.auction.winner.art}
                            color={run.auction.winner.color}
                          />
                          <div>
                            <h3>{run.auction.winner.name}</h3>
                            <p>给你的计划，多一种选择。</p>
                            <strong>{money(run.auction.winner.price)}</strong>
                            <button
                              className="text-btn"
                              onClick={() => setInspect(run.auction.winner)}
                            >
                              为什么是它
                              <ArrowUpRight size={13} />
                            </button>
                          </div>
                        </div>
                        <span className="sponsor-note">
                          独立于组合预算 · 模拟 CPC {money(run.auction.cpc)}
                        </span>
                      </>
                    ) : (
                      <div className="sponsor-empty">
                        <Leaf size={25} />
                        <p>
                          {run?.config.ads
                            ? "没有满足相关性门槛的赞助好物"
                            : "只留发现，不加赞助。"}
                        </p>
                      </div>
                    )}
                  </section>
                </div>
                <section className="candidate-section">
                  <button
                    className="candidate-toggle"
                    onClick={() => setShowCandidates(!showCandidates)}
                  >
                    <span>
                      <Search size={17} />
                      探索全部候选
                      <span className="count-pill">
                        {run?.candidates.length ?? 0}
                      </span>
                    </span>
                    <ChevronDown
                      size={18}
                      className={showCandidates ? "rotate" : ""}
                    />
                  </button>
                  {showCandidates && (
                    <>
                      <input
                        className="candidate-search"
                        placeholder="在候选中筛选名称、类别…"
                        aria-label="筛选候选商品"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                      <div className="candidate-list">
                        {run?.candidates
                          .filter((p) =>
                            `${p.name} ${p.category}`.includes(filter),
                          )
                          .map((p, i) => (
                            <button key={p.id} onClick={() => setInspect(p)}>
                              <span className="candidate-rank">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <ProductArt kind={p.art} color={p.color} />
                              <span>
                                <strong>{p.name}</strong>
                                <small>
                                  {p.category} · {p.reason}
                                </small>
                              </span>
                              <b>{money(p.price)}</b>
                              <span className="candidate-score">
                                {pct(p.evidence.relevance)}
                              </span>
                              <ArrowUpRight size={15} />
                            </button>
                          ))}
                      </div>
                      {run?.candidates.filter((p) =>
                        `${p.name} ${p.category}`.includes(filter),
                      ).length === 0 && (
                        <p className="empty-filter">没有匹配的候选商品。</p>
                      )}
                    </>
                  )}
                </section>
                <div className="fine-print">
                  <CircleHelp size={13} />
                  <span>
                    {run?.warnings.join(" ")}{" "}
                    商品、价格与广告为合成演示，不支持下单；照片为类别参考，未覆盖类别显示插画。
                  </span>
                </div>
              </>
            )}
            {page === "lab" && (
              <>
                <div className="section-intro">
                  <div>
                    <span className="eyebrow">DON’T JUST DEMO. MEASURE.</span>
                    <h1>把灵感，放进实验里。</h1>
                    <p>相同候选与约束，比较不同模型与组合策略。</p>
                  </div>
                  <FlaskConical size={36} strokeWidth={1} />
                </div>
                <ModelCompare
                  config={config}
                  profiles={status.profiles ?? profileDefaults}
                  globalBusy={busy}
                  onBusy={setBusy}
                  onConnect={() => setSettings(true)}
                  onComplete={() => void refreshStatus()}
                />
                <h2 className="algorithm-title">② 固定场景中的组合算法对照</h2>
                <div className="experiment-launch">
                  <div className="experiment-icon">
                    <FlaskConical size={28} />
                  </div>
                  <div>
                    <h3>逐件排序 vs. 组合生成</h3>
                    <p>4 个场景 × 3 档预算 · 12 个固定合成案例 · 一键复现</p>
                  </div>
                  <div className="experiment-options">
                    <label>
                      引擎
                      <select
                        aria-label="实验决策引擎"
                        value={config.provider}
                        disabled={busy}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            provider: e.target.value as Config["provider"],
                          })
                        }
                      >
                        {Object.entries(providerNames).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Bootstrap 种子
                      <input
                        aria-label="实验种子"
                        type="number"
                        min="0"
                        max="4294967295"
                        disabled={busy}
                        value={seed}
                        onChange={(e) => setSeed(Number(e.target.value))}
                      />
                    </label>
                  </div>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={runEvaluation}
                  >
                    {busy ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <ArrowRight size={16} />
                    )}{" "}
                    {busy ? "实验进行中…" : "运行对照实验"}
                  </button>
                </div>
                <div className="note-box">
                  <CircleHelp size={17} />
                  <p>
                    {config.provider !== "baseline"
                      ? "此实验将发起 12 次所选模型请求，按账号规则计费；失败会明确报错，不填充模拟成绩。"
                      : "本地模式不调用模型，测试的是组合算法。切换为 Jev 后才会实际比较 Jev 评分上的两种组合策略。"}
                  </p>
                </div>
                {evalResult ? (
                  <>
                    <div className="lab-result-heading">
                      <h2>这次实验，发现了什么？</h2>
                      <button
                        className="text-btn"
                        onClick={() =>
                          download(
                            evalResult,
                            `recjev-eval-${evalResult.seed}.json`,
                          )
                        }
                      >
                        <Download size={16} />
                        导出完整样本
                      </button>
                    </div>
                    <div className="metric-grid">
                      {[
                        { label: "需求覆盖", key: "coverage", format: pct },
                        { label: "预算满足率", key: "budgetPass", format: pct },
                        {
                          label: "NDCG@4",
                          key: "ndcg",
                          format: (n: number) => n.toFixed(3),
                        },
                        {
                          label: "合成效用",
                          key: "meanUtility",
                          format: (n: number) => n.toFixed(3),
                        },
                      ].map(({ label, key, format }) => (
                        <div className="metric-card" key={key}>
                          <span>{label}</span>
                          {evalResult.metrics.map((m, i) => (
                            <div key={m.policy}>
                              <small>{m.policy}</small>
                              <b>{format(m[key as "coverage"])}</b>
                              <div className={`metric-track track-${i}`}>
                                <span
                                  style={{ width: pct(m[key as "coverage"]) }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="evaluation-meta">
                      <span>{evalResult.cases} 个案例</span>
                      <span>{evalResult.modelCalls} 次模型调用</span>
                      <span>{evalResult.models.join(" / ")}</span>
                      <span>种子 {evalResult.seed}</span>
                    </div>
                    <p className="result-caveat">{evalResult.note}</p>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>策略</th>
                            <th>合成效用均值</th>
                            <th>95% bootstrap 区间</th>
                            <th>共享端到端平均耗时</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evalResult.metrics.map((m) => (
                            <tr key={m.policy}>
                              <td>{m.policy}</td>
                              <td>{m.meanUtility.toFixed(3)}</td>
                              <td>
                                [{m.ci.map((v) => v.toFixed(3)).join(", ")}]
                              </td>
                              <td>{m.latency.toFixed(1)} ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="lab-empty">
                    <div className="empty-chart">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <h2>好的结论，从一次诚实的对照开始。</h2>
                    <p>
                      运行后查看覆盖度、排序质量、预算约束与完整样本。
                      <br />
                      这里的成绩来自实际运行，不预填“提升百分比”。
                    </p>
                  </div>
                )}
                <div className="research-next">
                  <h3>接下来的研究路线</h3>
                  <div>
                    <span>
                      01 <strong>真实会话与人工标注</strong>
                      <small>检验意图与反馈理解</small>
                    </span>
                    <span>
                      02 <strong>传统重排 / LLM 对照</strong>
                      <small>测量质量、成本与延迟</small>
                    </span>
                    <span>
                      03 <strong>长期偏好与广告约束</strong>
                      <small>研究体验和收益的取舍</small>
                    </span>
                  </div>
                </div>
                {run && (
                  <section className="auction-panel">
                    <h3>最近一次生成 · 广告实验</h3>
                    <p>{run.auction.note}</p>
                    <label className="range-label" htmlFor="adweight">
                      竞价收益权重 <b>{pct(config.adWeight)}</b>
                    </label>
                    <input
                      id="adweight"
                      type="range"
                      min="0"
                      max="1"
                      step=".05"
                      value={config.adWeight}
                      disabled={busy}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          adWeight: Number(e.target.value),
                        })
                      }
                    />
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => generate()}
                    >
                      应用到当前方案
                    </button>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>候选</th>
                            <th>模拟出价</th>
                            <th>模拟 pCTR</th>
                            <th>竞价分</th>
                            <th>资格</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.auction.rows.slice(0, 8).map((r) => (
                            <tr key={r.id}>
                              <td>
                                {products.find((p) => p.id === r.id)!.name}
                              </td>
                              <td>{money(r.bid)}</td>
                              <td>{pct(r.pctr)}</td>
                              <td>{r.value.toFixed(4)}</td>
                              <td>{r.eligible ? "通过" : "未通过"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
            {page === "research" && <Sources />}
            <footer>
              <span className="footer-brand">✳ 拾意 / RecJev</span>
              <span>快速决策，让每次发现都有回应。</span>
              <span>Built to play. Designed to question.</span>
            </footer>
          </main>
        </div>
        {settings && (
          <Modal title="连接你的决策模型" onClose={() => setSettings(false)}>
            <ModelSettings
              profiles={status.profiles ?? profileDefaults}
              onSaved={() => {
                setSettings(false);
                void refreshStatus();
                setToast("连接已保存，生成或对照时才会调用。");
              }}
            />
          </Modal>
        )}
        {inspect && (
          <Modal
            title="这件好物，为什么适合你？"
            onClose={() => setInspect(null)}
          >
            <div
              className="inspect-product"
              style={{ background: `${inspect.color}22` }}
            >
              <ProductArt kind={inspect.art} color={inspect.color} />
              <div>
                <span className="eyebrow">{inspect.category}</span>
                <h2>{inspect.name}</h2>
                <p>{inspect.subtitle}</p>
                <strong>{money(inspect.price)}</strong>
              </div>
            </div>
            <div className="evidence-grid">
              <div>
                <span>
                  相关性{" "}
                  {inspect.evidence.source === "jev"
                    ? "Noul"
                    : inspect.evidence.source === "baseline"
                      ? "启发式"
                      : inspect.evidence.source === "local-logits"
                        ? "候选 softmax"
                        : "模型自评分"}
                </span>
                <strong>{pct(inspect.evidence.relevance)}</strong>
              </div>
              <div>
                <span>
                  偏好契合{" "}
                  {inspect.evidence.source === "jev"
                    ? "Score / 2"
                    : inspect.evidence.source === "baseline"
                      ? "启发式"
                      : "模型评分"}
                </span>
                <strong>{pct(inspect.evidence.affinity)}</strong>
              </div>
              <div>
                <span>Score 置信度</span>
                <strong>
                  {inspect.evidence.confidence === null
                    ? "不适用"
                    : pct(inspect.evidence.confidence)}
                </strong>
              </div>
            </div>
            {photoAssets[inspect.art] && visual === "photos" && (
              <p className="photo-credit">
                照片为类别参考，不代表实售商品。
                <a
                  href={photoAssets[inspect.art].page}
                  target="_blank"
                  rel="noreferrer"
                >
                  {photoAssets[inspect.art].author} ·{" "}
                  {photoAssets[inspect.art].license}
                </a>
              </p>
            )}
            <p className="reason-line">
              <Sparkles size={16} />
              {inspect.reason}
            </p>
            <div className="rubric">
              <h4>分数是怎样使用的？</h4>
              <p>
                单品排序 = 0.68 × 相关性 + 0.22 × 偏好契合 + 0.10 ×
                商品质量。组合阶段再加入需求覆盖奖励、重复类别惩罚，并严格检查总预算。
              </p>
              <p>
                {inspect.evidence.source === "jev"
                  ? "Noul 表示“商品对当前意图有用”的语义概率，不是点击概率；Score 置信度仅对应偏好评分。"
                  : "此分数未经业务校准，不能直接解释为真实点击率。"}{" "}
                推荐理由由商品标签和场景模板生成。
              </p>
            </div>
            {inspect.evidence.probabilities && (
              <pre>
                {JSON.stringify(inspect.evidence.probabilities, null, 2)}
              </pre>
            )}
            <div className="modal-buttons">
              <span className="pill">
                {inspect.evidence.source === "jev"
                  ? "官方 Jev"
                  : inspect.evidence.source === "baseline"
                    ? "本地规则"
                    : inspect.evidence.source === "local-logits"
                      ? "本地候选 logits"
                      : "普通模型 JSON"}
              </span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  feedback(inspect.id, "likes");
                  setInspect(null);
                }}
              >
                <Heart size={15} />
                喜欢这件
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  feedback(inspect.id, "locked");
                  setInspect(null);
                }}
              >
                <Pin size={15} />
                {config.locked.includes(inspect.id) ? "取消固定" : "固定到方案"}
              </button>
            </div>
          </Modal>
        )}
        {toast && (
          <div className="toast" role="status">
            <Check size={16} />
            {toast}
          </div>
        )}
      </div>
    </VisualMode.Provider>
  );
}
