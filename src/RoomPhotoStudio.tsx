import { useState } from "react";
import { Download, ImagePlus } from "lucide-react";
import { photoData } from "./image-upload";
import { t } from "./i18n";

export function RoomPhotoStudio() {
  const [photo, setPhoto] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  async function choose(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setError("");
    try {
      setPhoto(await photoData(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }
  return (
    <section className="scene-stage room-photo-studio">
      <div className="tryon-stage-title">
        <span>YOUR SPACE. YOUR STORY.</span>
        <span>房间原图</span>
      </div>
      <div className="tryon-preview room-photo-preview">
        {photo ? (
          <img src={photo} alt="你上传的房间照片，未经 AI 修改" />
        ) : (
          <div className="tryon-empty">
            <ImagePlus size={36} strokeWidth={1} />
            <h2>从你家的样子开始</h2>
            <p>
              上传一张真实房间照片，
              <br />
              让空间设计有自己的起点。
            </p>
            <span>YOUR OWN ROOM</span>
          </div>
        )}
      </div>
      <div className="room-photo-actions">
        <label className="room-upload-button">
          <ImagePlus size={16} />
          {reading ? "正在读取照片…" : photo ? "更换房间照片" : "上传我的房间"}
          <input
            type="file"
            aria-label="上传房间照片"
            accept="image/jpeg,image/png,image/webp"
            disabled={reading}
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {photo && (
          <a className="text-btn" href={photo} download="shiyi-my-room.jpg">
            <Download size={14} />
            保存当前照片
          </a>
        )}
        <p>照片仅在当前页面预览，不会自动发送或保存到服务器。</p>
      </div>
      <p className="room-photo-note">
        当前显示原图。尚未连接房间图像编辑模型，因此不会把概念场景当作你家的装修效果。
      </p>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
    </section>
  );
}
