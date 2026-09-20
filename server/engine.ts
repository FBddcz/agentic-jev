import { createHash, randomUUID } from "node:crypto";
import { catalog as defaultCatalog } from "../src/data";
import { validateCatalog } from "../src/catalog";
import {
  algorithmSettings as defaultSettings,
  validateAlgorithmSettings,
} from "../src/settings";
import type {
  Auction,
  Config,
  Evidence,
  MissionId,
  Product,
  Ranked,
  Run,
} from "../src/types";
export const clamp = (v: number, lo = 0, hi = 1) =>
  Math.max(lo, Math.min(hi, v));
export type DecisionFeedback = { liked: Product[]; disliked: Product[] };
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
  feedback: DecisionFeedback,
) => Promise<DecisionResult>;

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
/** Bind a validated dataset and algorithm settings; instances share no mutable state. */
export function createEngine(
  catalogInput: unknown = defaultCatalog,
  settingsInput: unknown = defaultSettings,
) {
  const catalog = validateCatalog(catalogInput);
  const { missions, products } = catalog;
  const settings = validateAlgorithmSettings(settingsInput);
  const fingerprint = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const provenance = {
    catalogVersion: catalog.version,
    catalogFingerprint: fingerprint(catalog),
    settingsFingerprint: fingerprint(settings),
    settings: structuredClone(settings),
  };
  const VERSION = `agenticjev-v0.2-${catalog.version}-${settings.version}`;
  const initialConfig: Config = {
    query: missions[0].query,
    mission: missions[0].id,
    budget: missions[0].budget,
    ...settings.defaults,
    provider: "baseline",
    likes: [],
    dislikes: [],
    locked: [],
  };
  const totalPrice = (items: Product[]) =>
    items.reduce((sum, p) => sum + Math.round(p.price * 100), 0) / 100;
  function validateConfig(input: unknown): Config {
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
    if (!Number.isSafeInteger(c.budget) || c.budget < 1)
      throw new Error("预算需为正的安全整数。");
    const maxItems = c.maxItems === undefined ? 4 : c.maxItems;
    if (maxItems !== null && (!Number.isSafeInteger(maxItems) || maxItems <= 0))
      throw new Error("组合件数需为安全正整数，或 null（自动搭配）。");
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
      (maxItems !== null && c.locked.length > maxItems) ||
      c.locked.some((id) => c.dislikes.includes(id)) ||
      c.likes.some((id) => c.dislikes.includes(id))
    )
      throw new Error("固定、喜欢与排除设置存在冲突。");
    if (totalPrice(products.filter((p) => c.locked.includes(p.id))) > c.budget)
      throw new Error("固定商品已超过预算，请提高预算或取消固定。");
    if (typeof c.ads !== "boolean") throw new Error("广告设置无效。");
    return {
      query: c.query.trim(),
      mission: c.mission,
      budget: c.budget,
      maxItems,
      diversity: c.diversity,
      provider: c.provider,
      likes: [...c.likes],
      dislikes: [...c.dislikes],
      locked: [...c.locked],
      ads: c.ads,
      adWeight: c.adWeight,
    };
  }

  const corpus = products.map((p) =>
    tokens(
      `${p.name} ${p.subtitle} ${p.tags.join(" ")} ${missions.find((m) => m.id === p.mission)!.name}`,
    ),
  );
  const avgLength = Math.max(
    1,
    corpus.reduce((s, t) => s + t.length, 0) / corpus.length,
  );
  const documentFrequency = new Map<string, number>();
  const termFrequencies = corpus.map((document) => {
    const frequencies = new Map<string, number>();
    for (const term of document)
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    for (const term of frequencies.keys())
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    return frequencies;
  });
  function bm25(query: string): Map<string, number> {
    const terms = [...new Set(tokens(query))];
    return new Map(
      products.map((p, i) => [
        p.id,
        terms.reduce((sum, t) => {
          const df = documentFrequency.get(t) ?? 0;
          const tf = termFrequencies[i].get(t) ?? 0;
          if (tf === 0) return sum;
          const idf = Math.log(1 + (corpus.length - df + 0.5) / (df + 0.5));
          return (
            sum +
            (idf * (tf * (settings.retrieval.bm25K1 + 1))) /
              (tf +
                settings.retrieval.bm25K1 *
                  (1 -
                    settings.retrieval.bm25B +
                    (settings.retrieval.bm25B * corpus[i].length) / avgLength))
          );
        }, 0),
      ]),
    );
  }
  function recall(c: Config): {
    items: Product[];
    lexical: Map<string, number>;
    mission: MissionId;
    recognized: boolean;
  } {
    const lexical = bm25(c.query);
    const explicit = missions
      .map((m) => ({
        m,
        hits: m.words.filter((w) =>
          c.query.toLowerCase().includes(w.toLowerCase()),
        ).length,
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
          (b.mission === mission ? settings.retrieval.sceneBoost : 0) -
          (lexical.get(a.id)! +
            (a.mission === mission ? settings.retrieval.sceneBoost : 0)) ||
        a.id.localeCompare(b.id),
    );
    const fixed = sorted.filter((p) => c.locked.includes(p.id));
    const items = [
      ...fixed,
      ...sorted.filter((p) => !c.locked.includes(p.id)),
    ].slice(
      0,
      Math.max(settings.retrieval.limit, c.maxItems ?? 0, c.locked.length),
    );
    return {
      items,
      lexical,
      mission,
      recognized: explicit.hits > 0 || lexical.get(strongest.id)! > 0,
    };
  }
  function baselineEvidence(
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
        settings.baseline.affinityBase +
          p.quality * settings.baseline.qualityWeight +
          pos * settings.baseline.likeWeight -
          neg * settings.baseline.dislikeWeight +
          (c.likes.includes(p.id) ? settings.baseline.directLikeBoost : 0),
      );
      return {
        id: p.id,
        relevance: clamp(
          settings.baseline.relevanceBase +
            (p.mission === mission ? settings.baseline.missionWeight : 0) +
            lexical.get(p.id)! * settings.baseline.lexicalWeight,
        ),
        affinity,
        confidence: null,
        lexical: lexical.get(p.id)!,
        source: "baseline",
      };
    });
  }
  function rank(
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
          rankScore:
            settings.ranking.relevanceWeight * e.relevance +
            settings.ranking.affinityWeight * e.affinity +
            settings.ranking.qualityWeight * p.quality,
          reason: `${p.mission === mission ? "呼应当前场景" : "跨场景发现"} · ${p.tags.slice(0, 2).join(" / ")}`,
        };
      })
      .sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id));
  }
  function objective(items: Ranked[], c: Config, mission: MissionId): number {
    const roles = missions.find((m) => m.id === mission)!.roles;
    const covered = new Set(
      items.filter((p) => roles.includes(p.category)).map((p) => p.category),
    ).size;
    const unique = new Set(items.map((p) => p.category)).size;
    return (
      items.reduce((s, p) => s + p.rankScore, 0) +
      c.diversity *
        (covered * settings.slate.coverageReward -
          (items.length - unique) * settings.slate.repeatPenalty)
    );
  }
  function buildSlate(
    ranked: Ranked[],
    c: Config,
    mission: MissionId,
    policy: "beam" | "greedy" = "beam",
    onBudgetReached?: () => void,
  ): Ranked[] {
    const roles = missions.find((m) => m.id === mission)!.roles;
    const limit = Math.min(
      c.maxItems ?? Math.max(roles.length, c.locked.length),
      ranked.length,
    );
    const locked = ranked.filter((p) => c.locked.includes(p.id));
    const rest = ranked.filter(
      (p) =>
        !c.locked.includes(p.id) &&
        p.evidence.relevance >= settings.ranking.minRelevance &&
        (c.maxItems !== null || roles.includes(p.category)),
    );
    const sum = totalPrice;
    if (policy === "greedy") {
      const list = [...locked];
      for (const p of rest)
        if (
          list.length < limit &&
          sum([...list, p]) <= c.budget &&
          (c.maxItems !== null || !list.some((x) => x.category === p.category))
        )
          list.push(p);
      return list.sort(
        (a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id),
      );
    }
    type State = { items: Ranked[]; total: number; score: number };
    let best: State = {
        items: locked,
        total: sum(locked),
        score: objective(locked, c, mission),
      },
      beam = [best];
    let visited = 0;
    search: for (let step = locked.length; step < limit; step++) {
      const unique = new Map<string, State>();
      for (const state of beam)
        for (const p of rest) {
          if (visited++ >= settings.slate.searchBudget) {
            onBudgetReached?.();
            const partial = [...unique.values()].sort(
              (a, b) => b.score - a.score || a.total - b.total,
            )[0];
            if (partial && partial.score > best.score) best = partial;
            break search;
          }
          if (
            state.items.some(
              (x) =>
                x.id === p.id ||
                (c.maxItems === null && x.category === p.category),
            ) ||
            Math.round((state.total + p.price) * 100) / 100 > c.budget
          )
            continue;
          const next = [...state.items, p],
            key = next
              .map((x) => x.id)
              .sort()
              .join(",");
          unique.set(key, {
            items: next,
            total: Math.round((state.total + p.price) * 100) / 100,
            score: objective(next, c, mission),
          });
        }
      if (!unique.size) break;
      beam = [...unique.values()]
        .sort((a, b) => b.score - a.score || a.total - b.total)
        .slice(0, settings.slate.beamWidth);
      if (beam[0].score > best.score) best = beam[0];
    }
    return best.items.sort(
      (a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id),
    );
  }
  function auction(ranked: Ranked[], slate: Ranked[], c: Config): Auction {
    const rows = ranked
      .filter((p) => p.bid > 0 && !slate.some((s) => s.id === p.id))
      .map((p) => {
        // A disclosed synthetic click model; Jev semantic probabilities are NOT pCTR.
        const pctr =
          settings.advertising.baseCtr +
          settings.advertising.qualityCtrWeight * p.quality;
        const relevance = p.evidence.relevance;
        const multiplier = pctr * ((1 - c.adWeight) * relevance + c.adWeight);
        return {
          id: p.id,
          bid: p.bid,
          pctr,
          value: multiplier * p.bid,
          eligible: c.ads && relevance >= settings.advertising.minRelevance,
        };
      })
      .sort((a, b) => b.value - a.value);
    const eligible = rows.filter((r) => r.eligible),
      first = eligible[0],
      second = eligible[1];
    const winner = first ? ranked.find((p) => p.id === first.id)! : null;
    const multiplier = first ? first.value / first.bid : 0;
    const price = first
      ? Math.min(
          first.bid,
          Math.max(
            settings.advertising.minCpc,
            multiplier > 0 ? (second?.value ?? 0) / multiplier : 0,
          ),
        )
      : 0;
    return {
      winner,
      cpc: Math.round(price * 100) / 100,
      rows,
      note: "独立赞助位 · 模拟质量加权二价竞价；pCTR 来自配置的模拟公式，非 Jev 概率。不产生扣费。",
    };
  }
  async function generate(input: unknown, decider?: Decider): Promise<Run> {
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
          {
            liked: products.filter((p) => c.likes.includes(p.id)),
            disliked: products.filter((p) => c.dislikes.includes(p.id)),
          },
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
    let searchLimited = false;
    const slate = buildSlate(candidates, c, retrieved.mission, "beam", () => {
        searchLimited = true;
      }),
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
        `当前意图与商品目录匹配较弱；使用所选场景召回，可尝试${missions.map((m) => m.name).join("、")}。`,
      );
    if (c.maxItems !== null && slate.length < c.maxItems)
      warnings.push(
        `当前预算、相关性、排除条件与搭配偏好下，生成 ${slate.length} 件商品（上限 ${c.maxItems} 件）。`,
      );
    if (searchLimited)
      warnings.push(
        `组合搜索已达到 ${settings.slate.searchBudget} 次候选扩展的计算预算，返回当前找到的最佳组合；可在 algorithm.json 调整搜索预算。`,
      );
    if (c.provider === "baseline")
      warnings.push("本次使用本地启发式评分，模型调用为 0；评分不是校准概率。");
    if (c.provider === "jev")
      warnings.push(
        "Jev 输出为语义判断；未以真实电商日志校准为点击率或转化率。",
      );
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
      total: totalPrice(slate),
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
      engine: structuredClone(provenance),
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
          detail: `Beam search · 宽度 ${settings.slate.beamWidth} · 预算硬约束 · ${c.maxItems === null ? "自动搭配" : `最多 ${c.maxItems} 件`}`,
          ms: rankingTime,
        },
        {
          name: "赞助竞价",
          detail: a.winner
            ? `独立赞助位 · 相关性门槛 ${settings.advertising.minRelevance}`
            : "无展示 · 关闭或无合格候选",
          ms: 0,
        },
      ],
    };
  }

  async function replaceItem(input: any, decider?: Decider): Promise<Run> {
    const start = performance.now();
    const c = validateConfig(input?.config);
    const ids: unknown = input?.ids;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > products.length ||
      new Set(ids).size !== ids.length ||
      ids.some(
        (id) => typeof id !== "string" || !products.some((p) => p.id === id),
      ) ||
      !ids.includes(input.targetId)
    )
      throw new Error("替换目标或当前组合无效，请重新生成方案。");
    const existing = ids as string[];
    if (c.locked.some((id) => !existing.includes(id)))
      throw new Error("固定条件已改变，请先按新偏好生成方案。");
    const next = validateConfig({
      ...c,
      dislikes: [...new Set([...c.dislikes, input.targetId])],
      likes: c.likes.filter((id) => id !== input.targetId),
      locked: c.locked.filter((id) => id !== input.targetId),
    });
    const keepIds = existing.filter((id) => id !== input.targetId);
    if (c.maxItems !== null && existing.length > c.maxItems)
      throw new Error("组合数量已改变，请先按新偏好生成方案。");
    const result = await generate(
      { ...next, maxItems: existing.length, locked: keepIds },
      decider,
    );
    const keep = keepIds.map(
      (id) => result.candidates.find((p) => p.id === id)!,
    );
    const target = products.find((p) => p.id === input.targetId)!;
    const alternatives = result.candidates.filter(
      (p) =>
        !existing.includes(p.id) &&
        p.category === target.category &&
        p.mission === target.mission &&
        p.evidence.relevance >= settings.ranking.minRelevance &&
        totalPrice([...keep, p]) <= next.budget,
    );
    alternatives.sort(
      (a, b) =>
        objective([...keep, b], next, result.mission) -
          objective([...keep, a], next, result.mission) ||
        a.id.localeCompare(b.id),
    );
    if (!alternatives.length)
      throw new Error(
        "当前预算内没有同类替代品，原组合已保留。可提高预算或重新生成整套。",
      );
    result.slate = existing.map((id) =>
      id === input.targetId ? alternatives[0] : keep.find((p) => p.id === id)!,
    );
    result.config = next;
    result.greedy = buildSlate(
      result.candidates,
      next,
      result.mission,
      "greedy",
    );
    result.total = totalPrice(result.slate);
    const roles = missions.find((m) => m.id === result.mission)!.roles;
    result.coverage =
      new Set(
        result.slate
          .filter((p) => roles.includes(p.category))
          .map((p) => p.category),
      ).size / roles.length;
    result.objective = objective(result.slate, next, result.mission);
    result.auction = auction(result.candidates, result.slate, next);
    result.replacement = {
      targetId: input.targetId,
      replacementId: alternatives[0].id,
      preservedIds: keepIds,
    };
    result.trace[2] = {
      name: "单件替换",
      detail: "只替换目标商品，保留其余商品和位置",
      ms: performance.now() - start - result.totalLatency,
    };
    result.totalLatency = performance.now() - start;
    return result;
  }

  return {
    VERSION,
    get defaultConfig() {
      return structuredClone(initialConfig);
    },
    get provenance() {
      return structuredClone(provenance);
    },
    validateConfig,
    bm25,
    recall,
    baselineEvidence,
    rank,
    objective,
    buildSlate,
    auction,
    generate,
    replaceItem,
  };
}

const defaultEngine = createEngine();
export const {
  VERSION,
  validateConfig,
  bm25,
  recall,
  baselineEvidence,
  rank,
  objective,
  buildSlate,
  auction,
  generate,
  replaceItem,
} = defaultEngine;
