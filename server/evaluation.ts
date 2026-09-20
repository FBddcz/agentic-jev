import { defaultConfig, missions, products } from "../src/data";
import type { Evaluation, Config } from "../src/types";
import { generate, VERSION, type Decider } from "./engine";

// Fixed, manually specified synthetic judgments, held outside scorer inputs.
// Designed to exercise constraint handling; not a representative benchmark.
export const judgments: Record<string, Record<string, number>> = {
  camp: {
    c01: 3,
    c02: 3,
    c03: 3,
    c04: 3,
    c05: 2,
    c06: 1,
    c07: 2,
    c08: 2,
    c09: 2,
    c10: 1,
    c11: 2,
    c12: 2,
  },
  desk: {
    d01: 3,
    d02: 3,
    d03: 2,
    d04: 3,
    d05: 2,
    d06: 1,
    d07: 2,
    d08: 3,
    d09: 1,
    d10: 2,
    d11: 2,
    d12: 1,
  },
  commute: {
    u01: 3,
    u02: 3,
    u03: 3,
    u04: 3,
    u05: 2,
    u06: 2,
    u07: 2,
    u08: 1,
    u09: 1,
    u10: 1,
    u11: 2,
    u12: 2,
  },
  coffee: {
    f01: 3,
    f02: 3,
    f03: 3,
    f04: 3,
    f05: 2,
    f06: 2,
    f07: 2,
    f08: 2,
    f09: 1,
    f10: 1,
    f11: 1,
    f12: 2,
  },
};
export function ndcg(
  ids: string[],
  truth: Record<string, number>,
  eligible: string[],
): number {
  const gain = (r: number, i: number) => (2 ** r - 1) / Math.log2(i + 2);
  const ideal = eligible
    .map((id) => truth[id] ?? 0)
    .sort((a, b) => b - a)
    .slice(0, 4)
    .reduce((s, r, i) => s + gain(r, i), 0);
  return ideal
    ? ids.slice(0, 4).reduce((s, id, i) => s + gain(truth[id] ?? 0, i), 0) /
        ideal
    : 0;
}
function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(1664525, n) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
function interval(values: number[], seed: number): [number, number] {
  const rng = random(seed),
    samples = Array.from(
      { length: 500 },
      () =>
        values.reduce((s) => s + values[Math.floor(rng() * values.length)], 0) /
        values.length,
    ).sort((a, b) => a - b);
  return [samples[12], samples[487]];
}
export async function evaluate(
  provider: Config["provider"] = "baseline",
  seed = 42,
  decider?: Decider,
): Promise<Evaluation> {
  const rows: Evaluation["rows"] = [],
    times: Record<string, number[]> = { 逐件排序: [], 组合生成: [] };
  let modelCalls = 0;
  const models = new Set<string>();
  for (const m of missions)
    for (const ratio of [0.45, 0.7, 1]) {
      const budget = Math.round(m.budget * ratio),
        run = await generate(
          {
            ...defaultConfig,
            query: m.query,
            mission: m.id,
            budget,
            provider,
            ads: false,
          },
          decider,
        );
      modelCalls += run.modelCalls;
      models.add(run.model);
      for (const [policy, list] of [
        ["逐件排序", run.greedy],
        ["组合生成", run.slate],
      ] as const) {
        const coverage =
          new Set(
            list
              .filter((p) => m.roles.includes(p.category))
              .map((p) => p.category),
          ).size / m.roles.length;
        const itemUtility =
          list.reduce((s, p) => s + (judgments[m.id][p.id] ?? 0) / 3, 0) / 4;
        rows.push({
          caseId: `${m.id}-${budget}`,
          policy,
          ids: list.map((p) => p.id),
          coverage,
          total: list.reduce((s, p) => s + p.price, 0),
          budget,
          ndcg: ndcg(
            list.map((p) => p.id),
            judgments[m.id],
            products.filter((p) => p.price <= budget).map((p) => p.id),
          ),
          utility: 0.5 * itemUtility + 0.5 * coverage,
        });
        // Shared retrieval/model/generation time; not per-policy latency attribution.
        times[policy].push(run.totalLatency);
      }
    }
  const metrics = Object.keys(times).map((policy) => {
    const entries = rows.filter((r) => r.policy === policy),
      mean = (f: (r: (typeof entries)[number]) => number) =>
        entries.reduce((s, r) => s + f(r), 0) / entries.length;
    return {
      policy,
      coverage: mean((r) => r.coverage),
      budgetPass: mean((r) => Number(r.total <= r.budget)),
      meanUtility: mean((r) => r.utility),
      ndcg: mean((r) => r.ndcg),
      latency: times[policy].reduce((a, b) => a + b, 0) / times[policy].length,
      ci: interval(
        entries.map((r) => r.utility),
        seed,
      ),
    };
  });
  return {
    seed,
    cases: 12,
    provider,
    modelCalls,
    models: [...models],
    metrics,
    rows,
    version: VERSION,
    note: "12 个固定合成场景（4 场景 × 3 预算）。偏好标签人工设定且不输入评分器；效用 = 0.5 × 标签效用 + 0.5 × 需求覆盖。95% bootstrap 区间只描述此小样本，不代表真实用户。两策略共享一次评分结果与端到端延迟；种子只控制 bootstrap。无真实 CTR、GMV 或线上 A/B 结论。",
  };
}
