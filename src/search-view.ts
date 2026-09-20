import type { Provider } from "./types";
import type { SearchResult } from "./search-types";

/** Threshold changes only affect presentation; original model evidence is kept intact. */
export function applySearchThreshold(
  result: SearchResult,
  threshold: number,
): SearchResult {
  return {
    ...result,
    threshold,
    decisions: result.decisions.map((decision) => ({
      ...decision,
      rows: decision.rows.map((row) => {
        const excluded = result.excluded.includes(row.id);
        return {
          ...row,
          retained: !excluded && row.score >= threshold,
          reason: excluded
            ? "你已排除"
            : row.score < threshold
              ? "低于当前阈值"
              : "达到当前匹配阈值",
        };
      }),
    })),
  };
}

const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id) => right.includes(id));

export function searchPreferencesChanged(
  result: SearchResult,
  current: {
    intent: string;
    liked: string[];
    excluded: string[];
    providers: Provider[];
    shortlistSize: number | null;
  },
) {
  return (
    current.intent !== result.intent ||
    !sameIds(current.liked, result.liked) ||
    !sameIds(current.excluded, result.excluded) ||
    !sameIds(
      current.providers,
      result.decisions.map((decision) => decision.provider),
    ) ||
    current.shortlistSize !== result.shortlist.limit
  );
}

export function searchEvidenceExport(
  result: SearchResult,
  threshold: number,
  view: {
    selectedProvider: Provider;
    includeBelowThreshold: boolean;
    pendingChanges: boolean;
  },
) {
  return {
    ...applySearchThreshold(result, threshold),
    display: {
      ...view,
      threshold,
      thresholdAppliedLocally: threshold !== result.threshold,
      scoringThreshold: result.threshold,
      scoringCreatedAt: result.createdAt,
      exportedAt: new Date().toISOString(),
    },
  };
}
