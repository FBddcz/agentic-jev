import { useSyncExternalStore } from "react";
import messages from "./en.json";
export type Locale = "en" | "zh";
type LanguageStore = {
  locale: Locale;
  listeners: Set<() => void>;
  messages: Record<string, string>;
};
// The JSX runtime and application imports must share state, including across Vite hot updates.
const host = globalThis as typeof globalThis & {
  __agenticJevLanguage?: LanguageStore;
};
function initialLocale(): Locale {
  try {
    return typeof localStorage !== "undefined" &&
      localStorage.getItem("agenticjev.language") === "zh"
      ? "zh"
      : "en";
  } catch {
    return "en";
  }
}
const language: LanguageStore = (host.__agenticJevLanguage ??= {
  locale: initialLocale(),
  listeners: new Set(),
  messages,
});
language.messages = messages;
export function setLocale(next: Locale) {
  language.locale = next;
  try {
    localStorage.setItem("agenticjev.language", next);
  } catch {}
  language.listeners.forEach((f) => f());
}
export function useLocale() {
  return useSyncExternalStore(
    (f) => {
      language.listeners.add(f);
      return () => {
        language.listeners.delete(f);
      };
    },
    () => language.locale,
    () => "en" as Locale,
  );
}
export function t(value: string): string {
  if (language.locale === "zh" || !/[\u3400-\u9fff]/.test(value)) return value;
  const key = value.replace(/\s+/g, " ").trim();
  if (language.messages[key] !== undefined)
    return value.replace(value.trim(), language.messages[key]);
  const sourceError =
    /^(.*) (尚未配置搜索 Key。|网络连接失败或超过 15 秒。|响应格式不完整。)$/.exec(
      value,
    );
  if (sourceError)
    return `${t(sourceError[1])}: ${{ "尚未配置搜索 Key。": "connect a search API key first.", "网络连接失败或超过 15 秒。": "connection failed or exceeded 15 seconds.", "响应格式不完整。": "incomplete response." }[sourceError[2]]}`;
  const patterns: [RegExp, (...a: string[]) => string][] = [
    [
      /^(.+) · 需求覆盖 (.+)$/,
      (_, scene, n) => `${t(scene)} · ${n} need coverage`,
    ],
    [
      /^(呼应当前场景|跨场景发现) · (.+)$/,
      (_, lead, tags) => `${t(lead)} · ${tags.split(" / ").map(t).join(" / ")}`,
    ],
    [
      /^BM25 \+ 场景召回 · (\d+) → (\d+) 件$/,
      (_, n, k) => `BM25 + scenario retrieval · ${n} → ${k} items`,
    ],
    [
      /^Beam search · 宽度 (\d+) · 预算硬约束 · (.+)$/,
      (_, n, size) => `Beam search · width ${n} · hard budget · ${t(size)}`,
    ],
    [
      /^独立赞助位 · 相关性门槛 (.+)$/,
      (_, n) => `Separate sponsor · relevance threshold ${n}`,
    ],
    [
      /^(\d+) 项评分 · (\d+) 次请求$/,
      (_, n, k) => `${n} judgments · ${k} requests`,
    ],
    [
      /^(.+) · (\d+) 分 · (\d+) 条讨论$/,
      (_, lead, n, k) => `${lead} · ${n} points · ${k} comments`,
    ],
    [/^(\d+) 分 · (\d+) 条讨论$/, (_, n, k) => `${n} points · ${k} comments`],
    [/^删除预设(.+)$/, (_, name) => `Delete saved plan ${name}`],
    [/^(\d+) 个模型对照$/, (_, n) => `${n} models`],
    [/^(\d+) 条返回结果$/, (_, n) => `${n} results returned`],
    [
      /^(.*) · (\d+) 次请求 · (\d+) 项评分$/,
      (_, model, n, k) => `${model} · ${n} requests · ${k} judgments`,
    ],
    [/^ · 评分 (.*)$/, (_, time) => ` · scoring ${time}`],
    [/^最多 (\d+) 件$/, (_, n) => `Up to ${n} items`],
    [/^原 #(\d+)$/, (_, n) => `Was #${n}`],
    [/^喜欢(.+)$/, (_, name) => `Like ${t(name)}`],
    [/^取消喜欢(.+)$/, (_, name) => `Unlike ${t(name)}`],
    [/^排除(.+)$/, (_, name) => `Replace ${t(name)}`],
    [/^查看(.+)的推荐依据$/, (_, name) => `Why ${t(name)}?`],
    [/^(.+) · 类别摄影参考$/, (_, name) => `${t(name)} · reference photo`],
    [/^(.+) 暂无照片$/, (_, name) => `No photo available for ${t(name)}`],
    [
      /^本次使用本地启发式评分，模型调用为 0；评分不是校准概率。$/,
      () =>
        "Local heuristic scores. No model calls; scores are not calibrated probabilities.",
    ],
    [
      /^当前预算、相关性、排除条件与搭配偏好下，生成 (\d+) 件商品（上限 (\d+) 件）。$/,
      (_, n, max) =>
        `Found ${n} items within your budget and preferences (up to ${max}).`,
    ],
  ];
  for (const [pattern, format] of patterns)
    if (pattern.test(value))
      return value.replace(pattern, (...args) => format(...args));
  return value;
}
/** Translate UI text at the JSX boundary. Form values, links and exported evidence stay untouched. */
export function localizeProps(type: unknown, props: any) {
  if (
    typeof type !== "string" ||
    !props ||
    props.translate === "no" ||
    ["pre", "code", "script", "style"].includes(type)
  )
    return props;
  const text = (child: any): any =>
    typeof child === "string"
      ? t(child)
      : Array.isArray(child)
        ? child.map(text)
        : child;
  const next = { ...props, children: text(props.children) };
  for (const key of ["aria-label", "title", "placeholder", "alt"])
    if (typeof props[key] === "string") next[key] = t(props[key]);
  if (
    type === "option" &&
    props.value === undefined &&
    typeof props.children === "string"
  )
    next.value = props.children;
  return next;
}
