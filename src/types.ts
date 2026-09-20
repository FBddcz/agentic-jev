import type { EngineProvenance } from "./settings";

export type Provider = "baseline" | "jev" | "openai" | "claude" | "minicpm";
export const slateSizes = [4, 6, 8, 12] as const;
export type SlateSize = number | null;
export type Profile = {
  provider: Exclude<Provider, "baseline">;
  model: string;
  baseURL: string;
  configured: boolean;
  verified: boolean;
};
export type MissionId = string;
export type Product = {
  id: string;
  name: string;
  subtitle: string;
  brand: string;
  price: number;
  category: string;
  mission: MissionId;
  tags: string[];
  quality: number;
  art: string;
  color: string;
  bid: number;
};
export type Mission = {
  id: MissionId;
  name: string;
  en: string;
  query: string;
  budget: number;
  roles: string[];
  words: string[];
  color: string;
  title: string;
  subtitle: string;
};
export type Config = {
  query: string;
  mission: MissionId;
  budget: number;
  maxItems: SlateSize;
  diversity: number;
  provider: Provider;
  likes: string[];
  dislikes: string[];
  locked: string[];
  ads: boolean;
  adWeight: number;
};
export type Evidence = {
  id: string;
  relevance: number;
  affinity: number;
  confidence: number | null;
  lexical: number;
  source: "baseline" | "jev" | "llm" | "local-logits";
  probabilities?: Record<string, number>;
};
export type Ranked = Product & {
  evidence: Evidence;
  rankScore: number;
  reason: string;
};
export type Auction = {
  winner: Ranked | null;
  cpc: number;
  rows: {
    id: string;
    bid: number;
    pctr: number;
    value: number;
    eligible: boolean;
  }[];
  note: string;
};
export type Run = {
  replacement?: {
    targetId: string;
    replacementId: string;
    preservedIds: string[];
  };
  engine: EngineProvenance;
  id: string;
  createdAt: string;
  config: Config;
  mission: MissionId;
  candidates: Ranked[];
  slate: Ranked[];
  greedy: Ranked[];
  auction: Auction;
  total: number;
  coverage: number;
  objective: number;
  warnings: string[];
  trace: { name: string; detail: string; ms: number }[];
  model: string;
  modelCalls: number;
  modelLatency: number;
  totalLatency: number;
  usage: { input_tokens: number; output_tokens: number } | null;
  rawAnswers: unknown;
  version: string;
};
export type Evaluation = {
  engine: EngineProvenance;
  seed: number;
  cases: number;
  provider: Provider;
  modelCalls: number;
  models: string[];
  metrics: {
    policy: string;
    coverage: number;
    budgetPass: number;
    meanUtility: number;
    ndcg: number;
    latency: number;
    ci: [number, number];
  }[];
  rows: {
    caseId: string;
    policy: string;
    ids: string[];
    coverage: number;
    total: number;
    budget: number;
    ndcg: number;
    utility: number;
  }[];
  note: string;
  version: string;
};

export type Comparison = {
  config: Config;
  createdAt: string;
  results: {
    provider: Provider;
    run: Run | null;
    error: string | null;
    elapsed: number;
  }[];
};
