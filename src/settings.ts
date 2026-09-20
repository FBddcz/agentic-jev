import rawSettings from "./algorithm.json";
import type { SlateSize } from "./types";

export type AlgorithmSettings = {
  version: string;
  defaults: {
    maxItems: SlateSize;
    diversity: number;
    ads: boolean;
    adWeight: number;
  };
  retrieval: {
    limit: number;
    sceneBoost: number;
    bm25K1: number;
    bm25B: number;
  };
  baseline: {
    relevanceBase: number;
    missionWeight: number;
    lexicalWeight: number;
    affinityBase: number;
    qualityWeight: number;
    likeWeight: number;
    dislikeWeight: number;
    directLikeBoost: number;
  };
  ranking: {
    relevanceWeight: number;
    affinityWeight: number;
    qualityWeight: number;
    minRelevance: number;
  };
  slate: {
    beamWidth: number;
    searchBudget: number;
    coverageReward: number;
    repeatPenalty: number;
  };
  advertising: {
    minRelevance: number;
    baseCtr: number;
    qualityCtrWeight: number;
    minCpc: number;
  };
};
export type EngineProvenance = {
  catalogVersion: string;
  catalogFingerprint: string;
  settingsFingerprint: string;
  settings: AlgorithmSettings;
};

type Bounds = Record<string, [number, number, boolean?]>;
function section(
  value: unknown,
  path: string,
  bounds: Bounds,
): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} 必须是对象。`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !Object.hasOwn(bounds, key)))
    throw new Error(`${path} 包含未知参数。`);
  return Object.fromEntries(
    Object.entries(bounds).map(([key, [min, max, integer]]) => {
      const v = record[key];
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < min ||
        v > max ||
        (integer && !Number.isInteger(v))
      )
        throw new Error(
          `${path}.${key} 需为 ${min}–${max} 的${integer ? "整数" : "有限数值"}。`,
        );
      return [key, v];
    }),
  );
}

export function validateAlgorithmSettings(input: unknown): AlgorithmSettings {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("algorithm 必须是对象。");
  const r = input as Record<string, any>;
  const expected = [
    "version",
    "defaults",
    "retrieval",
    "baseline",
    "ranking",
    "slate",
    "advertising",
  ];
  if (Object.keys(r).some((key) => !expected.includes(key)))
    throw new Error("algorithm 包含未知参数。");
  if (
    typeof r.version !== "string" ||
    !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(r.version)
  )
    throw new Error("algorithm.version 无效。");
  if (
    !r.defaults ||
    typeof r.defaults !== "object" ||
    Array.isArray(r.defaults) ||
    Object.keys(r.defaults).some(
      (key) => !["maxItems", "diversity", "ads", "adWeight"].includes(key),
    ) ||
    !(
      r.defaults.maxItems === null ||
      (Number.isSafeInteger(r.defaults.maxItems) && r.defaults.maxItems > 0)
    ) ||
    typeof r.defaults.ads !== "boolean"
  )
    throw new Error(
      "algorithm.defaults 需包含有效 maxItems、diversity、ads、adWeight。",
    );
  const weights = section(
    { diversity: r.defaults.diversity, adWeight: r.defaults.adWeight },
    "algorithm.defaults",
    { diversity: [0, 1], adWeight: [0, 1] },
  );
  const retrieval = section(r.retrieval, "algorithm.retrieval", {
    limit: [1, 1000, true],
    sceneBoost: [0, 3],
    bm25K1: [0.01, 5],
    bm25B: [0, 1],
  });
  const baseline = section(r.baseline, "algorithm.baseline", {
    relevanceBase: [0, 1],
    missionWeight: [0, 1],
    lexicalWeight: [0, 1],
    affinityBase: [0, 1],
    qualityWeight: [0, 1],
    likeWeight: [0, 1],
    dislikeWeight: [0, 1],
    directLikeBoost: [0, 1],
  });
  const ranking = section(r.ranking, "algorithm.ranking", {
    relevanceWeight: [0, 1],
    affinityWeight: [0, 1],
    qualityWeight: [0, 1],
    minRelevance: [0, 1],
  });
  if (
    Math.abs(
      ranking.relevanceWeight +
        ranking.affinityWeight +
        ranking.qualityWeight -
        1,
    ) > 1e-9
  )
    throw new Error("algorithm.ranking 的三个排序权重之和需为 1。");
  const slate = section(r.slate, "algorithm.slate", {
    beamWidth: [1, 100, true],
    searchBudget: [100, 1000000, true],
    coverageReward: [0, 3],
    repeatPenalty: [0, 3],
  });
  const advertising = section(r.advertising, "algorithm.advertising", {
    minRelevance: [0, 1],
    baseCtr: [0.0001, 1],
    qualityCtrWeight: [0, 1],
    minCpc: [0, 100],
  });
  if (advertising.baseCtr + advertising.qualityCtrWeight > 1)
    throw new Error("algorithm.advertising 的模拟 pCTR 不可超过 1。");
  return {
    version: r.version,
    defaults: {
      maxItems: r.defaults.maxItems,
      diversity: weights.diversity,
      ads: r.defaults.ads,
      adWeight: weights.adWeight,
    },
    retrieval,
    baseline,
    ranking,
    slate,
    advertising,
  } as AlgorithmSettings;
}

export const algorithmSettings = validateAlgorithmSettings(rawSettings);
