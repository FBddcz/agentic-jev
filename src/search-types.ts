import type { Evidence, Provider, Run } from "./types";
export type SearchSource =
  | "github"
  | "hackernews"
  | "crossref"
  | "europepmc"
  | "tavily"
  | "search1api"
  | "brave";
export const sourceNames: Record<SearchSource, string> = {
  github: "GitHub 开源项目",
  hackernews: "Hacker News 技术讨论",
  crossref: "Crossref 跨学科论文",
  europepmc: "Europe PMC 生物医学",
  tavily: "全网 · Tavily",
  search1api: "全网 · Search1API",
  brave: "全网 · Brave",
};
export type ShoppingMarket = "amazon" | "taobao" | "jd";
export const shoppingMarkets = {
  amazon: "Amazon",
  taobao: "淘宝 / 天猫",
  jd: "京东",
};
export type SearchCandidate = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  sources: SearchSource[];
  originalRank: number;
  /** Upstream positions before invalid/duplicate results are removed. */
  sourceRanks?: Partial<Record<SearchSource, number>>;
  extra?: string;
  paper?: {
    authors: string;
    year: number | null;
    venue: string;
    doi: string;
    openAccess: boolean | null;
  };
};
export type SearchLane = {
  source: SearchSource;
  ms: number;
  count: number;
  error: string | null;
};
export type SearchSnapshot = {
  id: string;
  query: string;
  createdAt: string;
  candidates: SearchCandidate[];
  lanes: SearchLane[];
  searchMs: number;
  requestedLimit: number;
  market?: ShoppingMarket;
  fingerprint: string;
};
export type SearchRow = SearchCandidate & {
  evidence: Evidence;
  score: number;
  rank: number;
  retained: boolean;
  reason: string;
};
export type SearchDecision = {
  provider: Provider;
  model: string;
  rows: SearchRow[];
  ms: number;
  calls: number | null;
  usage: Run["usage"];
  rawAnswers: unknown;
  error: string | null;
  /** Original scoring provenance, separate from this request's ms/calls/usage. */
  cache?: {
    hit: boolean;
    scoredAt: string;
    originalMs: number;
    originalCalls: number;
    originalUsage: Run["usage"];
  };
};
export type SearchShortlist = {
  /** Requested cap; explicit likes can raise the actual selected count. */
  limit: number | null;
  total: number;
  eligible: number;
  selected: number;
  excludedIds: string[];
  omittedIds: string[];
  method: "rrf-60+lexical-v1";
  ms: number;
};
export type SearchResult = {
  snapshot: SearchSnapshot;
  intent: string;
  threshold: number;
  liked: string[];
  excluded: string[];
  decisions: SearchDecision[];
  shortlist: SearchShortlist;
  rankingMs: number;
  createdAt: string;
  scoring: string;
};
