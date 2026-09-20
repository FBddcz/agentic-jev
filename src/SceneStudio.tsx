import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { ArrowUpRight, Download, RotateCcw, Sparkles } from "lucide-react";
import type { SceneCanvasHandle } from "./SceneCanvas";
const SceneCanvas = lazy(() =>
  import("./SceneCanvas").then((m) => ({ default: m.SceneCanvas })),
);
import { scenePresets, type SceneKind, type SceneDecision } from "./scene-data";
import { providerNames } from "./ModelPanels";
import type { Profile, Provider } from "./types";
import { t } from "./i18n";
import { TryOnStudio } from "./TryOnStudio";
import { RoomPhotoStudio } from "./RoomPhotoStudio";
export function SceneStudio({
  profiles,
  onModelSettings,
}: {
  profiles: Profile[];
  onModelSettings: () => void;
}) {
  const kind: SceneKind = "room";
  const [roomView, setRoomView] = useState<"photo" | "reference">("photo");
  const [view, setView] = useState<"tryon" | "room">("tryon");
  const [selectedId, setSelectedId] = useState("room-oat"),
    [query, setQuery] = useState(""),
    [budget, setBudget] = useState(10000),
    [provider, setProvider] = useState<Provider>("baseline"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [decision, setDecision] = useState<SceneDecision | null>(null),
    [renderMs, setRenderMs] = useState(0),
    [wallMs, setWallMs] = useState(0);
  const [realisticRoom, setRealisticRoom] = useState(true);
  const canvas = useRef<SceneCanvasHandle>(null),
    onRendered = useCallback((ms: number) => setRenderMs(ms), []);
  const preset = scenePresets.find((p) => p.id === selectedId)!;
  const presets = scenePresets.filter((p) => p.kind === kind);
  const isStale =
    decision &&
    (decision.query !==
      (query.trim() || "minimal natural warm 极简 自然 温暖") ||
      decision.budget !== budget ||
      decision.provider !== provider);
  async function recommend() {
    setBusy(true);
    setError("");
    const begin = performance.now();
    try {
      const response = await fetch("/api/scene/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          query: query.trim() || "minimal natural warm 极简 自然 温暖",
          budget,
          provider,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDecision(data);
      if (data.selectedId) {
        setSelectedId(data.selectedId);
        setRealisticRoom(false);
      } else setError("预算内没有方案，当前画面已保留。可提高预算后重试。");
      setWallMs(performance.now() - begin);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="scene-studio">
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE IMAGINATION. MADE VISIBLE.</span>
          <h1>
            让心意，先有模样<span className="heading-star">✳</span>
          </h1>
          <p>选一个场景，把偏好变成眼前的搭配。</p>
        </div>
      </div>
      <div className="scene-kind" role="group" aria-label="Scene type">
        <button
          aria-pressed={view === "tryon"}
          onClick={() => setView("tryon")}
        >
          {t("真人试衣")}
        </button>
        <button aria-pressed={view === "room"} onClick={() => setView("room")}>
          {t("家庭客厅")}
        </button>
      </div>
      {view === "tryon" ? (
        <TryOnStudio />
      ) : (
        <>
          <div className="scene-kind" role="group" aria-label="房间来源">
            <button
              aria-pressed={roomView === "photo"}
              onClick={() => setRoomView("photo")}
            >
              我的房间
            </button>
            <button
              aria-pressed={roomView === "reference"}
              onClick={() => setRoomView("reference")}
            >
              参考全景与概念
            </button>
          </div>
          <div hidden={roomView !== "photo"}>
            <RoomPhotoStudio />
          </div>
          {roomView === "reference" && (
            <>
              {kind === "room" && (
                <div
                  className="scene-kind"
                  role="group"
                  aria-label="房间预览模式"
                >
                  <button
                    aria-pressed={!realisticRoom}
                    onClick={() => setRealisticRoom(false)}
                  >
                    可编辑概念
                  </button>
                  <button
                    aria-pressed={realisticRoom}
                    onClick={() => setRealisticRoom(true)}
                  >
                    真实室内全景
                  </button>
                </div>
              )}
              <div className="scene-layout">
                <section className="scene-stage">
                  <div className="scene-stage-head">
                    <span>LIVE 3D</span>
                    <span>
                      {realisticRoom && kind === "room"
                        ? "Kiara Interior · Poly Haven"
                        : preset.name}
                    </span>
                  </div>
                  <Suspense
                    fallback={
                      <p className="scene-render-error">Loading scene…</p>
                    }
                  >
                    <SceneCanvas
                      ref={canvas}
                      preset={preset}
                      realisticRoom={realisticRoom}
                      onRendered={onRendered}
                    />
                  </Suspense>
                  <div className="scene-stage-footer">
                    <span>
                      {realisticRoom ? "拖动环视" : "拖动旋转 · 滚轮缩放"}
                    </span>
                    <button
                      aria-label="重置视角"
                      onClick={() => canvas.current?.reset()}
                    >
                      <RotateCcw size={15} />
                    </button>
                    <button onClick={() => canvas.current?.capture()}>
                      <Download size={14} />
                      保存画面
                    </button>
                  </div>
                </section>
                <section className="scene-preferences">
                  <span className="eyebrow">DESIGNED AROUND YOU</span>
                  <h2>你想要哪一种感觉？</h2>
                  <label className="field">
                    风格与需求
                    <textarea
                      aria-label="场景需求"
                      rows={3}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={
                        kind === "room"
                          ? "例如：小户型，温暖木质，喜欢自然绿色"
                          : "例如：简洁通勤，偏爱米白和自然色"
                      }
                      maxLength={500}
                    />
                  </label>
                  <div className="scene-prompts">
                    {(kind === "room"
                      ? ["温暖木质", "绿色小户型", "现代艺术"]
                      : ["自然休闲", "深色通勤", "优雅晚宴"]
                    ).map((q) => (
                      <button
                        key={q}
                        disabled={busy}
                        onClick={() => setQuery(t(q))}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    概念预算（¥）
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={budget}
                      aria-label="场景概念预算"
                      onChange={(e) => setBudget(Number(e.target.value))}
                    />
                  </label>
                  <label className="field">
                    决策引擎
                    <select
                      aria-label="场景决策引擎"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as Provider)}
                    >
                      {Object.entries(providerNames).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                          {id !== "baseline" &&
                          !profiles.some(
                            (p) => p.provider === id && p.configured,
                          )
                            ? ` · ${t("需连接")}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary scene-apply"
                    disabled={
                      busy || !Number.isSafeInteger(budget) || budget <= 0
                    }
                    onClick={() => void recommend()}
                  >
                    <Sparkles size={15} />
                    {busy
                      ? "正在决策…"
                      : kind === "room"
                        ? "推荐并布置客厅"
                        : "推荐并试搭"}
                    <ArrowUpRight size={15} />
                  </button>
                  <button className="text-btn" onClick={onModelSettings}>
                    模型连接
                  </button>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  {decision && (
                    <div className="scene-speed" role="status">
                      <strong>{wallMs.toFixed(0)} ms</strong>
                      <span>
                        本次请求往返 · {decision.modelCalls} 次模型调用
                      </span>
                    </div>
                  )}
                  <p className="scene-disclaimer">
                    可交互的程序化 3D
                    概念预览。服装、家具和预算为设计示意，不代表真实商品、合身程度或施工报价。
                  </p>
                </section>
              </div>
              <p className="scene-asset-credit">
                <a
                  href="https://polyhaven.com/a/kiara_interior"
                  target="_blank"
                  rel="noreferrer"
                >
                  Poly Haven · Greg Zaal · CC0
                </a>
                <span>
                  真实全景是固定环境，不会因更换家具方案而改变；一键布置会切回可编辑概念。
                </span>
              </p>
              <details className="scene-resource-links">
                <summary>免费开放资源</summary>
                <a
                  href="https://polyhaven.com/models"
                  target="_blank"
                  rel="noreferrer"
                >
                  Poly Haven · CC0 家具与材质
                </a>
                <a
                  href="https://www.sweethome3d.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Sweet Home 3D · 可编辑家居设计
                </a>
              </details>
              <div className="scene-picks-head">
                <h2>换一种心情</h2>
                <span>点击方案，即时预览</span>
              </div>
              <div className="scene-picks">
                {(decision
                  ? decision.rows.map(
                      (row) => presets.find((p) => p.id === row.id)!,
                    )
                  : presets
                ).map((p) => (
                  <button
                    key={p.id}
                    className={p.id === selectedId ? "selected" : ""}
                    aria-pressed={p.id === selectedId}
                    onClick={() => {
                      setRealisticRoom(false);
                      setSelectedId(p.id);
                    }}
                  >
                    <span className="scene-swatches">
                      {p.colors.slice(0, 3).map((c, i) => (
                        <i key={i} style={{ background: c }} />
                      ))}
                    </span>
                    <strong>{p.name}</strong>
                    <small>{p.description}</small>
                    <span>
                      ¥{p.budget.toLocaleString()} · <span>概念预算</span>
                    </span>
                    {decision && (
                      <b>
                        {Math.round(
                          decision.rows.find((r) => r.id === p.id)!.score * 100,
                        )}{" "}
                        · <span>匹配分</span>
                        {!decision.rows.find((r) => r.id === p.id)!
                          .affordable && <em>超出预算</em>}
                      </b>
                    )}
                  </button>
                ))}
              </div>
              <details className="scene-evidence">
                <summary>查看决策过程</summary>
                {decision ? (
                  <>
                    <p>
                      {isStale
                        ? "条件已改变，以下保留上一次评分。"
                        : "当前显示本次真实运行记录。"}
                    </p>
                    <div className="scene-stat-grid">
                      <span>
                        候选方案<strong>{decision.rows.length}</strong>
                      </span>
                      <span>
                        服务端决策
                        <strong>{decision.elapsedMs.toFixed(1)} ms</strong>
                      </span>
                      <span>
                        模型等待
                        <strong>{decision.modelMs.toFixed(1)} ms</strong>
                      </span>
                      <span>
                        当前画面首次渲染
                        <strong>{renderMs.toFixed(0)} ms</strong>
                      </span>
                    </div>
                    <p translate="no">{decision.model}</p>
                    <p>
                      按预算过滤后，使用 70% 相关性与 30%
                      偏好契合排序；本地模式按风格标签匹配，0 次模型调用。画面由
                      Three.js 在本机渲染。
                    </p>
                  </>
                ) : (
                  <p>一键推荐后，这里显示实际评分与耗时。</p>
                )}
              </details>
            </>
          )}
        </>
      )}
    </div>
  );
}
