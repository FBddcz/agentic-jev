import { t } from "./i18n";
import { useState, type ChangeEvent } from "react";
import { Download, Upload, Save, Trash2, RotateCcw } from "lucide-react";
import { defaultConfig } from "./data";
import type { Config } from "./types";

const STORAGE_KEY = "agenticjev.presets.v1";
const FORMAT = "agenticjev-preset-v1";
type Preset = { id: string; name: string; config: Config };

function readPresets(): Preset[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (p) =>
        p &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        p.name.length <= 60 &&
        p.config &&
        typeof p.config === "object",
    );
  } catch {
    return [];
  }
}

async function validate(config: unknown): Promise<Config> {
  const response = await fetch("/api/validate-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "预设配置无效。");
  return data.config;
}

export function PresetManager({
  config,
  onApply,
}: {
  config: Config;
  onApply: (config: Config) => void;
}) {
  const [presets, setPresets] = useState<Preset[]>(readPresets);
  const [name, setName] = useState(() => t("我的购物计划"));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [jsonText, setJsonText] = useState("");

  function persist(next: Preset[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      throw new Error("浏览器无法保存预设，请使用 JSON 导出。");
    }
    setPresets(next);
  }
  async function perform(task: () => Promise<void> | void) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }
  function presetName() {
    const result = name.trim();
    if (!result || result.length > 60)
      throw new Error("预设名称需要 1–60 个字符。");
    return result;
  }
  function save() {
    void perform(async () => {
      const title = presetName();
      const checked = await validate(config);
      persist([
        ...presets,
        { id: crypto.randomUUID(), name: title, config: checked },
      ]);
      setNotice("当前意图、预算、件数、反馈和引擎选择已保存。");
    });
  }
  function exportPreset() {
    void perform(async () => {
      const title = presetName();
      const checked = await validate(config);
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              { format: FORMAT, name: title, config: checked },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "agenticjev-preset.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  async function importText(text: string) {
    if (new TextEncoder().encode(text).length > 32000)
      throw new Error("预设不能超过 32 KB。");
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("请输入有效的 JSON 预设。");
    }
    if (
      data?.format !== FORMAT ||
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.length > 60
    )
      throw new Error(
        "这不是受支持的 AgenticJev 预设。请从“导出当前预设”生成。",
      );
    const checked = await validate(data.config);
    persist([
      ...presets,
      { id: crypto.randomUUID(), name: data.name.trim(), config: checked },
    ]);
    setJsonText("");
    setNotice("已导入，点击应用后可继续调整。");
  }
  async function importPreset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await perform(async () => {
      if (file.size > 32000) throw new Error("预设文件不能超过 32 KB。");
      await importText(await file.text());
    });
  }

  return (
    <div className="preset-manager">
      <p className="connection-summary">
        把一组条件保存成预设，下次继续试。预设留在当前浏览器，也可以导出 JSON
        分享或备份。
      </p>
      <label className="field">
        预设名称
        <input
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </label>
      <div className="preset-actions">
        <button className="primary" disabled={busy} onClick={save}>
          <Save size={14} />
          保存当前条件
        </button>
        <button className="secondary" disabled={busy} onClick={exportPreset}>
          <Download size={14} />
          导出当前预设
        </button>
        <label
          className={`secondary preset-import ${busy ? "is-disabled" : ""}`}
        >
          <Upload size={14} />
          导入 JSON
          <input
            aria-label="导入预设 JSON"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={importPreset}
          />
        </label>
      </div>
      <details className="preset-paste">
        <summary>或粘贴预设 JSON</summary>
        <label className="field">
          预设 JSON
          <textarea
            value={jsonText}
            rows={5}
            disabled={busy}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder="粘贴从“导出当前预设”获得的 JSON"
          />
        </label>
        <button
          className="secondary"
          disabled={busy || !jsonText.trim()}
          onClick={() => void perform(() => importText(jsonText))}
        >
          导入粘贴的预设
        </button>
      </details>
      <p className="small-note">
        保存购物意图、预算、组合上限、偏好反馈、广告设置和引擎选择，不包含 API
        Key 或模型连接地址。应用预设只修改条件，点击生成后才调用所选模型。
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p className="preset-notice" role="status">
          {notice}
        </p>
      )}
      <div className="preset-list">
        {presets.length ? (
          presets.map((p) => (
            <article key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <p>{p.config.query}</p>
                <small>
                  预算 ¥{p.config.budget} ·{" "}
                  {p.config.maxItems === null
                    ? "随心搭配"
                    : `最多 ${p.config.maxItems ?? 4} 件`}
                </small>
              </div>
              <div className="preset-row-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => onApply(await validate(p.config)))
                  }
                >
                  应用
                </button>
                <button
                  className="icon-btn"
                  disabled={busy}
                  aria-label={`删除预设${p.name}`}
                  onClick={() =>
                    void perform(() =>
                      persist(presets.filter((x) => x.id !== p.id)),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="small-note">
            还没有保存的预设。先保存当前条件，或导入已有 JSON。
          </p>
        )}
      </div>
      <button
        className="text-btn"
        disabled={busy}
        onClick={() =>
          void perform(async () => onApply(await validate(defaultConfig)))
        }
      >
        <RotateCcw size={14} />
        恢复默认购物条件
      </button>
    </div>
  );
}
