import { scenePresets, type SceneDecision } from "../src/scene-data";
import type { Config, Product, Provider } from "../src/types";
import type { Decider } from "./engine";
export async function recommendScene(
  input: any,
  deciderFor: (p: Provider) => Decider | undefined,
): Promise<SceneDecision> {
  const start = performance.now();
  if (
    !["room", "outfit"].includes(input?.kind) ||
    typeof input.query !== "string" ||
    !input.query.trim() ||
    input.query.length > 500 ||
    !Number.isSafeInteger(input.budget) ||
    input.budget <= 0 ||
    !["baseline", "jev", "openai", "claude", "minicpm"].includes(input.provider)
  )
    throw new Error("请填写有效的场景、需求、预算与决策引擎。");
  const presets = scenePresets.filter((p) => p.kind === input.kind);
  const text = input.query.toLowerCase();
  const lexical = new Map(
    presets.map((p) => [
      p.id,
      Math.min(
        1,
        p.tags.filter((tag) => text.includes(tag.toLowerCase())).length / 3,
      ),
    ]),
  );
  const items: Product[] = presets.map((p) => ({
    id: p.id,
    name: p.name,
    subtitle: `${p.description}. ${p.tags.join(", ")}. Illustrative 3D concept, estimated budget CNY ${p.budget}; not a real product listing.`,
    brand: "",
    price: p.budget,
    category: p.kind,
    mission: "search",
    tags: p.tags,
    quality: 0,
    art: "",
    color: p.colors[0],
    bid: 0,
  }));
  const config: Config = {
    query: input.query,
    mission: "search",
    provider: input.provider,
    budget: input.budget,
    maxItems: 1,
    diversity: 0,
    likes: [],
    dislikes: [],
    locked: [],
    ads: false,
    adWeight: 0,
  };
  let model = "scene-tag-baseline-v1",
    modelCalls = 0,
    modelMs = 0;
  let evidence = presets.map((p) => ({
    id: p.id,
    relevance: 0.2 + 0.8 * lexical.get(p.id)!,
    affinity: 0.2 + 0.8 * lexical.get(p.id)!,
  }));
  if (input.provider !== "baseline") {
    const decider = deciderFor(input.provider);
    if (!decider)
      throw new Error("尚未连接所选模型。请先配置连接，或切回本地基线。");
    const result = await decider(config, items, lexical, "search", {
      liked: [],
      disliked: [],
    });
    evidence = result.evidence;
    model = result.model;
    modelCalls = result.calls;
    modelMs = result.latency;
  }
  if (
    evidence.length !== presets.length ||
    new Set(evidence.map((e) => e.id)).size !== presets.length ||
    evidence.some(
      (e) =>
        !presets.some((p) => p.id === e.id) ||
        ![e.relevance, e.affinity].every(
          (n) => Number.isFinite(n) && n >= 0 && n <= 1,
        ),
    )
  )
    throw new Error("评分不完整或越界，未生成替代结果。");
  const rows = presets
    .map((p) => {
      const e = evidence.find((e) => e.id === p.id)!;
      return {
        id: p.id,
        relevance: e.relevance,
        fit: e.affinity,
        score: 0.7 * e.relevance + 0.3 * e.affinity,
        affordable: p.budget <= input.budget,
      };
    })
    .sort(
      (a, b) =>
        Number(b.affordable) - Number(a.affordable) ||
        b.score - a.score ||
        presets.find((p) => p.id === a.id)!.budget -
          presets.find((p) => p.id === b.id)!.budget,
    );
  return {
    kind: input.kind,
    query: input.query,
    budget: input.budget,
    provider: input.provider,
    model,
    modelCalls,
    modelMs,
    elapsedMs: performance.now() - start,
    createdAt: new Date().toISOString(),
    rows,
    selectedId: rows.find((r) => r.affordable)?.id || null,
  };
}
