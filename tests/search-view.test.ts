import test from "node:test";
import assert from "node:assert/strict";
import type { SearchResult } from "../src/search-types";
import {
  applySearchThreshold,
  searchEvidenceExport,
  searchPreferencesChanged,
} from "../src/search-view";

function resultFixture(): SearchResult {
  const candidates = ["one", "two", "three"].map((id, index) => ({
    id,
    title: id,
    url: `https://example.com/${id}`,
    snippet: "Source snippet",
    sources: ["github" as const],
    originalRank: index + 1,
  }));
  return {
    snapshot: {
      id: "snapshot",
      query: "search",
      createdAt: "2026-09-20T01:00:00.000Z",
      candidates,
      lanes: [],
      searchMs: 50,
      requestedLimit: 20,
      fingerprint: "fingerprint",
    },
    intent: "useful projects",
    threshold: 0.2,
    liked: [],
    excluded: ["three"],
    shortlist: {
      limit: 24,
      total: 3,
      eligible: 2,
      selected: 2,
      excludedIds: ["three"],
      omittedIds: [],
      method: "rrf-60+lexical-v1",
      ms: 1,
    },
    decisions: [
      {
        provider: "openai",
        model: "actual-model",
        rows: candidates.slice(0, 2).map((candidate, index) => ({
          ...candidate,
          evidence: {
            id: candidate.id,
            relevance: index ? 0.4 : 0.9,
            affinity: 0.5,
            confidence: null,
            lexical: 0.5,
            source: "llm",
          },
          score: index ? 0.43 : 0.78,
          rank: index + 1,
          retained: true,
          reason: "达到当前匹配阈值",
        })),
        ms: 180,
        calls: 1,
        usage: null,
        rawAnswers: { result: "original evidence" },
        error: null,
      },
    ],
    rankingMs: 182,
    createdAt: "2026-09-20T01:00:01.000Z",
    scoring: "70% relevance + 30% affinity",
  };
}

test("threshold changes only alter retention and explanations, preserving model evidence and source result", () => {
  const original = resultFixture();
  const serialized = JSON.stringify(original);
  const view = applySearchThreshold(original, 0.6);
  assert.deepEqual(
    view.decisions[0].rows.map((row) => row.retained),
    [true, false],
  );
  assert.equal(view.decisions[0].rows[1].reason, "低于当前阈值");
  assert.equal(view.decisions[0].calls, 1);
  assert.equal(view.decisions[0].ms, 180);
  assert.equal(view.decisions[0].rawAnswers, original.decisions[0].rawAnswers);
  assert.equal(
    view.decisions[0].rows[0].evidence,
    original.decisions[0].rows[0].evidence,
  );
  assert.equal(JSON.stringify(original), serialized);
  assert.deepEqual(
    applySearchThreshold(original, 0).decisions[0].rows.map((row) => row.id),
    ["one", "two"],
  );
});

test("exports capture local threshold and stale controls without claiming another scoring run", () => {
  const original = resultFixture();
  const exported = searchEvidenceExport(original, 0.6, {
    selectedProvider: "openai",
    includeBelowThreshold: false,
    pendingChanges: true,
  });
  assert.equal(exported.threshold, 0.6);
  assert.equal(exported.display.thresholdAppliedLocally, true);
  assert.equal(exported.display.scoringThreshold, 0.2);
  assert.equal(exported.display.scoringCreatedAt, original.createdAt);
  assert.equal(exported.display.pendingChanges, true);
  assert.equal(exported.decisions[0].calls, 1);
  assert.equal(exported.rankingMs, original.rankingMs);
  assert.equal(exported.decisions[0].rows[1].retained, false);
  assert.equal(original.threshold, 0.2);
});

test("feedback, selected engines and shortlist changes require reranking; provider order does not", () => {
  const original = resultFixture();
  const preferences = {
    intent: original.intent,
    liked: [],
    excluded: ["three"],
    providers: ["openai" as const],
    shortlistSize: 24,
  };
  assert.equal(searchPreferencesChanged(original, preferences), false);
  assert.equal(
    searchPreferencesChanged(original, {
      ...preferences,
      providers: ["baseline"],
    }),
    true,
  );
  assert.equal(
    searchPreferencesChanged(original, { ...preferences, shortlistSize: null }),
    true,
  );
  assert.equal(
    searchPreferencesChanged(original, { ...preferences, liked: ["two"] }),
    true,
  );
  assert.equal(
    searchPreferencesChanged(original, { ...preferences, excluded: [] }),
    true,
  );
  assert.equal(
    searchPreferencesChanged(original, { ...preferences, intent: "new need" }),
    true,
  );
  original.decisions.push({ ...original.decisions[0], provider: "baseline" });
  assert.equal(
    searchPreferencesChanged(original, {
      ...preferences,
      providers: ["baseline", "openai"],
    }),
    false,
  );
});
