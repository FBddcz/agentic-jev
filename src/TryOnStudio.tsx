import { photoData } from "./image-upload";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ImagePlus,
  Sparkles,
  Download,
  RefreshCw,
} from "lucide-react";
import { t } from "./i18n";
type Result = {
  image: string;
  model: string;
  inferenceMs: number;
  elapsedMs: number;
};
export function TryOnStudio() {
  const [person, setPerson] = useState("");
  const [garment, setGarment] = useState("");
  const [category, setCategory] = useState("tops");
  const [photoType, setPhotoType] = useState("flat-lay");
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [original, setOriginal] = useState(false);
  async function check() {
    setChecking(true);
    try {
      const response = await fetch("/api/tryon/status");
      const data = await response.json();
      setReady(response.ok && data.ready === true);
    } catch {
      setReady(false);
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    void check();
  }, []);
  async function choose(file: File | undefined, isPerson: boolean) {
    if (!file) return;
    setReading(true);
    setError("");
    try {
      const image = await photoData(file);
      (isPerson ? setPerson : setGarment)(image);
      setResult(null);
      setOriginal(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }
  async function generate() {
    setBusy(true);
    setError("");
    setOriginal(false);
    try {
      const response = await fetch("/api/tryon/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personImage: person,
          garmentImage: garment,
          category,
          garmentPhotoType: photoType,
        }),
        signal: AbortSignal.timeout(125000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(
        e instanceof Error && e.name === "TimeoutError"
          ? "试衣服务未连接或超过 120 秒，请检查本机推理服务。"
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="tryon-studio">
      <div className="scene-layout">
        <section className="scene-stage tryon-stage">
          <div className="tryon-stage-title">
            <span>YOUR PERSONAL FITTING ROOM</span>
            <span>{result && !original ? "AI 试衣结果" : "真人照片"}</span>
          </div>
          <div className="tryon-preview">
            {(result && !original) || person ? (
              <img
                src={result && !original ? result.image : person}
                alt={
                  result && !original ? "AI 生成的试衣结果" : "你选择的人物照片"
                }
              />
            ) : (
              <div className="tryon-empty">
                <ImagePlus size={34} strokeWidth={1} />
                <h2>从真实的你开始</h2>
                <p>
                  一张穿着完整的清晰照片，
                  <br />
                  一件想试的衣服。
                </p>
                <span>PHOTO VIRTUAL TRY-ON</span>
              </div>
            )}
          </div>
          <div className="scene-stage-footer">
            <span>
              {busy
                ? "正在生成试衣图…"
                : result
                  ? "生成效果仅供试搭参考"
                  : "选择照片后在此预览"}
            </span>
            {result && (
              <>
                <button onClick={() => setOriginal(!original)}>
                  {original ? "查看试衣" : "对比原图"}
                </button>
                <a
                  className="text-btn"
                  href={result.image}
                  download="shiyi-try-on.png"
                >
                  <Download size={14} />
                  保存画面
                </a>
              </>
            )}
          </div>
        </section>
        <section className="scene-preferences tryon-preferences">
          <span className="eyebrow">A NEW LOOK, STILL YOU.</span>
          <h2>把喜欢，穿在身上</h2>
          <div className="tryon-inputs">
            {([true, false] as const).map((isPerson) => (
              <label className="tryon-upload" key={String(isPerson)}>
                {(isPerson ? person : garment) ? (
                  <img
                    src={isPerson ? person : garment}
                    alt={isPerson ? "人物照片缩略图" : "衣服照片缩略图"}
                  />
                ) : (
                  <ImagePlus size={22} strokeWidth={1} />
                )}
                <span>{isPerson ? "选择人物照片" : "选择衣服图片"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || reading}
                  aria-label={isPerson ? "选择人物照片" : "选择衣服图片"}
                  onChange={(e) => {
                    void choose(e.target.files?.[0], isPerson);
                    e.target.value = "";
                  }}
                />
              </label>
            ))}
          </div>
          <label className="field">
            衣服类别
            <select
              disabled={busy}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setResult(null);
              }}
            >
              <option value="tops">上装</option>
              <option value="bottoms">下装</option>
              <option value="one-pieces">连衣裙与连体衣</option>
            </select>
          </label>
          <label className="field">
            衣服图形式
            <select
              disabled={busy}
              value={photoType}
              onChange={(e) => {
                setPhotoType(e.target.value);
                setResult(null);
              }}
            >
              <option value="flat-lay">商品平铺图</option>
              <option value="model">模特穿着图</option>
            </select>
          </label>
          <button
            className="primary scene-apply"
            disabled={!ready || !person || !garment || busy || reading}
            onClick={() => void generate()}
          >
            <Sparkles size={15} />
            {busy ? "正在生成试衣图…" : "生成真实试衣图"}
            <ArrowUpRight size={15} />
          </button>
          <div className="tryon-connection">
            <span className={ready ? "connected" : ""}>
              {checking
                ? "正在检查试衣服务…"
                : ready
                  ? "本机试衣服务已连接"
                  : "尚未连接试衣模型"}
            </span>
            <button
              className="text-btn"
              disabled={checking || busy}
              aria-label="检查试衣连接"
              onClick={() => void check()}
            >
              <RefreshCw size={13} />
            </button>
          </div>
          {!ready && (
            <p className="scene-disclaimer">
              先体验官方演示，或按部署说明连接自己的推理服务。
            </p>
          )}
          <div className="tryon-links">
            <a
              href="https://huggingface.co/spaces/fashn-ai/fashn-vton-1.5"
              target="_blank"
              rel="noreferrer"
            >
              体验官方演示
              <ArrowUpRight size={13} />
            </a>
            <a
              href="https://github.com/FBddcz/agentic-jev/blob/main/docs/TRY_ON.md"
              target="_blank"
              rel="noreferrer"
            >
              部署说明
              <ArrowUpRight size={13} />
            </a>
          </div>
          <p className="scene-disclaimer">
            选择的照片仅暂存在当前页面；点击生成后发送至你连接的本机试衣服务，不写入浏览器存储。人物照片请保留完整衣着。
          </p>
          {error && (
            <p role="alert" className="error">
              {t(error)}
            </p>
          )}
        </section>
      </div>
      {result && (
        <div className="tryon-result-time" role="status">
          <span>{result.model}</span>
          <span>图像推理：{(result.inferenceMs / 1000).toFixed(1)} s</span>
          <span>服务端往返：{(result.elapsedMs / 1000).toFixed(1)} s</span>
        </div>
      )}
      <details className="scene-resource-links">
        <summary>真人视频与 3D 人物方案</summary>
        <p>
          照片换装、视频换装和可转动的 3D
          人物分别需要不同的模型。此页接入照片换装；下列视频与 3D
          项目是可选扩展。
        </p>
        <a
          href="https://github.com/Zheng-Chong/CatV2TON"
          target="_blank"
          rel="noreferrer"
        >
          CatV2TON · 视频换装 · 非商业许可
        </a>
        <a
          href="https://github.com/microsoft/Microsoft-Rocketbox"
          target="_blank"
          rel="noreferrer"
        >
          Microsoft Rocketbox · 115 个绑定人物 · MIT
        </a>
        <a
          href="https://github.com/aigc3d/LHM"
          target="_blank"
          rel="noreferrer"
        >
          LHM · 从照片重建可动画人物
        </a>
        <p>
          FASHN 主模型为 Apache
          2.0；默认人体解析依赖含非商业限制。商业部署需要另行核对整条依赖链。官方演示有独立的配额与可用性。
        </p>
      </details>
    </div>
  );
}
