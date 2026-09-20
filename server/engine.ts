import { randomUUID } from "node:crypto";
import { missions, products } from "../src/data";
import type {
  Auction,
  Config,
  Evidence,
  MissionId,
  Product,
  Ranked,
  Run,
} from "../src/types";
export const VERSION = "recjev-v0.1-catalog1-rubric1";
export const clamp = (v: number, lo = 0, hi = 1) =>
  Math.max(lo, Math.min(hi, v));
export function validateConfig(input: unknown): Config {
  if (!input || typeof input !== "object")
    throw new Error("请输入完整的实验配置。");
  const c = input as Config;
  if (typeof c.query !== "string" || !c.query.trim() || c.query.length > 500)
    throw new Error("购物意图需要 1–500 个字符。");
  if (
    !missions.some((m) => m.id === c.mission) ||
    !["baseline", "jev", "openai", "claude", "minicpm"].includes(c.provider)
  )
    throw new Error("未知的场景或决策引擎。");
  if (!Number.isInteger(c.budget) || c.budget < 50 || c.budget > 10000)
    throw new Error("预算需为 50–10000 元之间的整数。");
  for (const key of ["diversity", "adWeight"] as const)
    if (
      typeof c[key] !== "number" ||
      !Number.isFinite(c[key]) ||
      c[key] < 0 ||
      c[key] > 1
    )
      throw new Error("权重需在 0–1 之间。");
  for (const key of ["likes", "dislikes", "locked"] as const)
    if (
      !Array.isArray(c[key]) ||
      c[key].length > products.length ||
      c[key].some((id) => !products.some((p) => p.id === id)) ||
      new Set(c[key]).size !== c[key].length
    )
      throw new Error("商品反馈中存在未知或重复商品。");
  if (
    c.locked.length > 4 ||
    c.locked.some((id) => c.dislikes.includes(id)) ||
    c.likes.some((id) => c.dislikes.includes(id))
  )
    throw new Error("固定、喜欢与排除设置存在冲突。");
  if (
    products
      .filter((p) => c.locked.includes(p.id))
      .reduce((s, p) => s + p.price, 0) > c.budget
  )
    throw new Error("固定商品已超过预算，请提高预算或取消固定。");
  if (typeof c.ads !== "boolean") throw new Error("广告设置无效。");
  return {
    query: c.query.trim(),
    mission: c.mission,
    budget: c.budget,
    diversity: c.diversity,
    provider: c.provider,
    likes: [...c.likes],
    dislikes: [...c.dislikes],
    locked: [...c.locked],
    ads: c.ads,
    adWeight: c.adWeight,
  };
}

export function tokens(text: string): string[] {
  const chunks = text.toLowerCase().match(/[a-z0-9]+|[\u3400-\u9fff]+/g) ?? [];
  return chunks.flatMap((s) =>
    /^[\u3400-\u9fff]+$/.test(s)
      ? s.length === 1
        ? [s]
        : Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2))
      : [s],
  );
}
const corpus = products.map((p) =>
  tokens(
    `${p.name} ${p.subtitle} ${p.tags.join(" ")} ${missions.find((m) => m.id === p.mission)!.name}`,
  ),
);
const avgLength = corpus.reduce((s, t) => s + t.length, 0) / corpus.length;
export function bm25(query: string): Map<string, number> {
  const terms = [...new Set(tokens(query))];
  return new Map(
    products.map((p, i) => [
      p.id,
      terms.reduce((sum, t) => {
        const df = corpus.filter((doc) => doc.includes(t)).length;
        const tf = corpus[i].filter((v) => v === t).length;
        const idf = Math.log(1 + (corpus.length - df + 0.5) / (df + 0.5));
        return (
          sum +
          (idf * (tf * 2.2)) /
            (tf + 1.2 * (0.25 + (0.75 * corpus[i].length) / avgLength))
        );
      }, 0),
    ]),
  );
}
export function recall(c: Config): {
  items: Product[];
  lexical: Map<string, number>;
  mission: MissionId;
  recognized: boolean;
} {
  const lexical = bm25(c.query);
  const explicit = missions
    .map((m) => ({
      m,
      hits: m.words.filter((w) => c.query.toLowerCase().includes(w)).length,
    }))
    .sort((a, b) => b.hits - a.hits)[0];
  const strongest = [...products].sort(
    (a, b) => lexical.get(b.id)! - lexical.get(a.id)!,
  )[0];
  const mission = explicit.hits
    ? explicit.m.id
    : lexical.get(strongest.id)! > 0
      ? strongest.mission
      : c.mission;
  const max = Math.max(1, ...lexical.values());
  for (const [k, v] of lexical) lexical.set(k, v / max);
  const eligible = products.filter(
    (p) => !c.dislikes.includes(p.id) && p.price <= c.budget,
  );
  const sorted = eligible.sort(
    (a, b) =>
      lexical.get(b.id)! +
        (b.mission === mission ? 0.7 : 0) -
        (lexical.get(a.id)! + (a.mission === mission ? 0.7 : 0)) ||
      a.id.localeCompare(b.id),
  );
  const fixed = sorted.filter((p) => c.locked.includes(p.id));
  const items = [
    ...fixed,
    ...sorted.filter((p) => !c.locked.includes(p.id)),
  ].slice(0, 24);
  return {
    items,
    lexical,
    mission,
    recognized: explicit.hits > 0 || lexical.get(strongest.id)! > 0,
  };
}
export function baselineEvidence(
  c: Config,
  items: Product[],
  lexical: Map<string, number>,
  mission: MissionId,
): Evidence[] {
  const liked = products.filter((p) => c.likes.includes(p.id));
  const rejected = products.filter((p) => c.dislikes.includes(p.id));
  return items.map((p) => {
    const overlap = (a: Product) =>
      p.tags.filter((t) => a.tags.includes(t)).length /
      Math.max(1, p.tags.length);
    const pos = liked.length
      ? liked.reduce((s, x) => s + overlap(x), 0) / liked.length
      : 0;
    const neg = rejected.length
      ? rejected.reduce((s, x) => s + overlap(x), 0) / rejected.length
      : 0;
    const affinity = clamp(
      0.45 +
        p.quality * 0.25 +
        pos * 0.24 -
        neg * 0.2 +
        (c.likes.includes(p.id) ? 0.12 : 0),
    );
    return {
      id: p.id,
      relevance: clamp(
        0.08 + (p.mission === mission ? 0.52 : 0) + lexical.get(p.id)! * 0.3,
      ),
      affinity,
      confidence: null,
      lexical: lexical.get(p.id)!,
      source: "baseline",
    };
  });
}
export function rank(
  items: Product[],
  evidence: Evidence[],
  mission: MissionId,
): Ranked[] {
  return items
    .map((p) => {
      const e = evidence.find((e) => e.id === p.id)!;
      if (!e) throw new Error("缺失候选商品评分。");
      return {
        ...p,
        evidence: e,
        rankScore: 0.68 * e.relevance + 0.22 * e.affinity + 0.1 * p.quality,
        reason: `${p.mission === mission ? "呼应当前场景" : "跨场景发现"} · ${p.tags.slice(0, 2).join(" / ")}`,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id));
}
export function objective(
  items: Ranked[],
  c: Config,
  mission: MissionId,
): number {
  const roles = missions.find((m) => m.id === mission)!.roles;
  const covered = new Set(
    items.filter((p) => roles.includes(p.category)).map((p) => p.category),
  ).size;
  const unique = new Set(items.map((p) => p.category)).size;
  return (
    items.reduce((s, p) => s + p.rankScore, 0) +
    c.diversity * (covered * 0.8 - (items.length - unique) * 0.65)
  );
}
export function buildSlate(
  ranked: Ranked[],
  c: Config,
  mission: MissionId,
  policy: "beam" | "greedy" = "beam",
): Ranked[] {
  const locked = ranked.filter((p) => c.locked.includes(p.id));
  const rest = ranked.filter(
    (p) => !c.locked.includes(p.id) && p.evidence.relevance >= 0.24,
  );
  const sum = (a: Ranked[]) => a.reduce((s, p) => s + p.price, 0);
  if (policy === "greedy") {
    const list = [...locked];
    for (const p of rest)
      if (list.length < 4 && sum(list) + p.price <= c.budget) list.push(p);
    return list.sort(
      (a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id),
    );
  }
  let beam = [locked],
    best = locked;
  for (let step = locked.length; step < 4; step++) {
    const unique = new Map<string, Ranked[]>();
    for (const list of beam)
      for (const p of rest) {
        if (list.some((x) => x.id === p.id) || sum(list) + p.price > c.budget)
          continue;
        const next = [...list, p];
        unique.set(
          next
            .map((x) => x.id)
            .sort()
            .join(","),
          next,
        );
      }
    if (!unique.size) break;
    beam = [...unique.values()]
      .sort(
        (a, b) =>
          objective(b, c, mission) - objective(a, c, mission) ||
          sum(a) - sum(b),
      )
      .slice(0, 40);
    if (objective(beam[0], c, mission) > objective(best, c, mission))
      best = beam[0];
  }
  return best.sort(
    (a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id),
  );
}
export function auction(ranked: Ranked[], slate: Ranked[], c: Config): Auction {
  const rows = ranked
    .filter((p) => p.bid > 0 && !slate.some((s) => s.id === p.id))
    .map((p) => {
      // A disclosed synthetic click model; Jev semantic probabilities are NOT pCTR.
      const pctr = 0.025 + 0.035 * p.quality;
      const relevance = p.evidence.relevance;
      const multiplier = pctr * ((1 - c.adWeight) * relevance + c.adWeight);
      return {
        id: p.id,
        bid: p.bid,
        pctr,
        value: multiplier * p.bid,
        eligible: c.ads && relevance >= 0.55,
      };
    })
    .sort((a, b) => b.value - a.value);
  const eligible = rows.filter((r) => r.eligible),
    first = eligible[0],
    second = eligible[1];
  const winner = first ? ranked.find((p) => p.id === first.id)! : null;
  const multiplier = first ? first.value / first.bid : 0;
  const price = first
    ? Math.min(first.bid, Math.max(0.05, (second?.value ?? 0) / multiplier))
    : 0;
  return {
    winner,
    cpc: Math.round(price * 100) / 100,
    rows,
    note: "独立赞助位 · 模拟质量加权二价竞价；pCTR 来自固定演示公式，非 Jev 概率。不产生扣费。",
  };
}
export type DecisionResult = {
  evidence: Evidence[];
  model: string;
  usage: Run["usage"];
  rawAnswers: unknown;
  latency: number;
  calls: number;
};
export type Decider = (
  c: Config,
  items: Product[],
  lexical: Map<string, number>,
  mission: MissionId,
) => Promise<DecisionResult>;
export async function generate(
  input: unknown,
  decider?: Decider,
): Promise<Run> {
  const start = performance.now(),
    c = validateConfig(input);
  const retrieved = recall(c),
    recallTime = performance.now() - start;
  let decision: DecisionResult;
  if (c.provider !== "baseline") {
    if (!decider)
      throw new Error("尚未连接所选模型。请先配置连接，或切回本地基线。");
    if (!retrieved.items.length)
      decision = {
        evidence: [],
        model: `${c.provider}-not-called`,
        usage: null,
        rawAnswers: null,
        latency: 0,
        calls: 0,
      };
    else
      decision = await decider(
        c,
        retrieved.items,
        retrieved.lexical,
        retrieved.mission,
      );
  } else
    decision = {
      evidence: baselineEvidence(
        c,
        retrieved.items,
        retrieved.lexical,
        retrieved.mission,
      ),
      model: "local-heuristic-v1",
      usage: null,
      rawAnswers: null,
      latency: 0,
      calls: 0,
    };
  const rankStart = performance.now();
  const candidates = rank(
    retrieved.items,
    decision.evidence,
    retrieved.mission,
  );
  const slate = buildSlate(candidates, c, retrieved.mission),
    greedy = buildSlate(candidates, c, retrieved.mission, "greedy");
  const rankingTime = performance.now() - rankStart;
  const a = auction(candidates, slate, c);
  const roles = missions.find((m) => m.id === retrieved.mission)!.roles;
  const coverage =
    new Set(
      slate.filter((p) => roles.includes(p.category)).map((p) => p.category),
    ).size / roles.length;
  const warnings = [];
  if (!retrieved.recognized)
    warnings.push(
      "当前意图与演示商品匹配较弱；使用所选场景召回，可尝试露营、办公、通勤或咖啡。",
    );
  if (slate.length < 4)
    warnings.push("在当前预算、相关性阈值和排除条件下，无法组合满 4 件商品。");
  if (c.provider === "baseline")
    warnings.push("本次使用本地启发式评分，模型调用为 0；评分不是校准概率。");
  if (c.provider === "jev")
    warnings.push("Jev 输出为语义判断；未以真实电商日志校准为点击率或转化率。");
  if (c.provider === "openai" || c.provider === "claude")
    warnings.push("普通模型自评分，非校准概率。");
  if (c.provider === "minicpm")
    warnings.push("候选 logits 的条件 softmax，未经业务校准。");
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    config: c,
    mission: retrieved.mission,
    candidates,
    slate,
    greedy,
    auction: a,
    total: slate.reduce((s, p) => s + p.price, 0),
    coverage,
    objective: objective(slate, c, retrieved.mission),
    warnings,
    model: decision.model,
    modelCalls: decision.calls,
    modelLatency: decision.latency,
    usage: decision.usage,
    rawAnswers: decision.rawAnswers,
    totalLatency: performance.now() - start,
    version: VERSION,
    trace: [
      {
        name: "召回候选",
        detail: `BM25 + 场景召回 · ${products.length} → ${candidates.length} 件`,
        ms: recallTime,
      },
      {
        name: "候选评分",
        detail:
          c.provider !== "baseline"
            ? `${candidates.length * 2} 项评分 · ${decision.calls} 次请求`
            : "本地相关性 + 反馈偏好 · 0 次模型调用",
        ms: decision.latency,
      },
      {
        name: "生成组合",
        detail: "Beam search · 宽度 40 · 预算硬约束 · 最多 4 件",
        ms: rankingTime,
      },
      {
        name: "赞助竞价",
        detail: a.winner
          ? "独立赞助位 · 相关性门槛 0.55"
          : "无展示 · 关闭或无合格候选",
        ms: 0,
      },
    ],
  };
}
