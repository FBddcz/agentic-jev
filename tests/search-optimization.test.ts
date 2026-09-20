import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeResults,
  rankSearch,
  retrieveSearch,
  SearchScoreCache,
} from "../server/search";
import type { SearchRankOptions } from "../server/search";
import type { SearchCandidate, SearchSnapshot } from "../src/search-types";
import type { Decider, DecisionResult } from "../server/engine";
import { batchDecider } from "../server/batched";

function snapshot(count = 40): SearchSnapshot {
  return {
    id: "snapshot",
    query: "retrieval",
    createdAt: new Date().toISOString(),
    candidates: Array.from({ length: count }, (_, i) => ({
      id: `r${i + 1}`,
      title: `Candidate ${i + 1}`,
      url: `https://example.org/${i + 1}`,
      snippet: "Source excerpt",
      sources: ["github"],
      originalRank: i + 1,
      sourceRanks: { github: i + 1 },
    })),
    lanes: [],
    searchMs: 2,
    requestedLimit: count,
    fingerprint: "fixture",
  };
}
const input = {
  intent: "retrieval",
  providers: ["openai"],
  threshold: 0.2,
};
function mockScorer(onCall?: (...args: Parameters<Decider>) => void): Decider {
  return async (...args) => {
    onCall?.(...args);
    const [, items, lexical] = args;
    return {
      evidence: items.map((p) => ({
        id: p.id,
        relevance: 0.8,
        affinity: 0.6,
        confidence: null,
        lexical: lexical.get(p.id) ?? 0,
        source: "llm" as const,
      })),
      model: "fixture-model-v1",
      usage: { input_tokens: 123, output_tokens: 45 },
      rawAnswers: { actual: "fixture answer" },
      latency: 7,
      calls: 1,
    };
  };
}
const cachedOptions = (cache = new SearchScoreCache()): SearchRankOptions => ({
  cache,
  providerIdentity: (provider) =>
    `${provider}:https://fixture.example:v1:connection-1`,
});

test("upstream ranks survive invalid rows, URL deduplication and source merging", async () => {
  const rows = normalizeResults(
    [
      { title: "Unsafe", url: "javascript:bad", snippet: "" },
      { title: "Kept", url: "https://example.org/kept", snippet: "" },
      {
        title: "Duplicate",
        url: "https://example.org/kept?utm_source=x",
        snippet: "",
      },
      { title: "Another", url: "https://example.org/another", snippet: "" },
    ],
    "github",
    10,
  );
  assert.deepEqual(
    rows.map((r) => r.sourceRanks),
    [{ github: 2 }, { github: 4 }],
  );

  const merged = await retrieveSearch(
    { query: "retrieval", sources: ["github", "hackernews"], limit: 5 },
    {},
    async (url) =>
      String(url).includes("github.com")
        ? Response.json({
            items: [
              { full_name: "First", html_url: "https://example.org/first" },
              {
                full_name: "Shared",
                html_url: "https://example.org/shared?utm_source=github",
              },
            ],
          })
        : Response.json({
            hits: [{ title: "Shared", url: "https://example.org/shared" }],
          }),
  );
  const shared = merged.candidates.find((c) => c.url.endsWith("/shared"))!;
  assert.deepEqual(shared.sourceRanks, { hackernews: 1, github: 2 });
  assert.equal(shared.originalRank, 2);
});

test("DOI deduplication keeps both paper source ranks", async () => {
  const result = await retrieveSearch(
    { query: "retrieval", sources: ["crossref", "europepmc"], limit: 4 },
    {},
    async (url) =>
      String(url).includes("crossref")
        ? Response.json({
            message: {
              items: [
                { title: ["First"], DOI: "10.1234/first" },
                { title: ["Shared"], DOI: "10.1234/SHARED" },
              ],
            },
          })
        : Response.json({
            resultList: {
              result: [{ title: "Shared", doi: "10.1234/shared" }],
            },
          }),
  );
  assert.deepEqual(
    result.candidates.find((c) => c.url.endsWith("/shared"))!.sourceRanks,
    { europepmc: 1, crossref: 2 },
  );
});

test("RRF combines source positions and a positive lexical rank before scoring", async () => {
  const s = snapshot(3);
  s.candidates[1] = {
    ...s.candidates[1],
    sources: ["github", "hackernews"],
    sourceRanks: { github: 20, hackernews: 20 },
  };
  s.candidates[2] = {
    ...s.candidates[2],
    title: "Retrieval benchmark",
    sourceRanks: { github: 90 },
  };
  let ordered: string[] = [];
  const result = await rankSearch(s, { ...input, shortlistSize: 2 }, () =>
    mockScorer((_, items) => {
      ordered = items.map((p) => p.id);
    }),
  );
  // Shared candidate: 2/80; lexical candidate: 1/150 + 1/61; first source: 1/61.
  assert.deepEqual(ordered, ["r2", "r3"]);
  assert.deepEqual(result.shortlist.omittedIds, ["r1"]);
  assert.equal(result.shortlist.method, "rrf-60+lexical-v1");
  assert.ok(result.shortlist.ms >= 0);
});

test("shortlist defaults to 24, retains every explicit like and never scores exclusions", async () => {
  const s = snapshot();
  let captured: string[] = [];
  const result = await rankSearch(
    s,
    {
      ...input,
      liked: ["r40"],
      excluded: ["r2"],
      providers: ["openai", "claude"],
    },
    () =>
      mockScorer((config, items, _lexical, _mission, feedback) => {
        if (!captured.length) captured = items.map((p) => p.id);
        else
          assert.deepEqual(
            items.map((p) => p.id),
            captured,
          );
        assert.ok(items.some((p) => p.id === "r40"));
        assert.ok(items.every((p) => p.id !== "r2"));
        assert.deepEqual(config.dislikes, ["r2"]);
        assert.deepEqual(
          feedback.disliked.map((p) => p.id),
          ["r2"],
        );
        assert.equal(feedback.disliked[0].subtitle, s.candidates[1].snippet);
      }),
  );
  assert.equal(captured.length, 24);
  assert.equal(result.shortlist.total, 40);
  assert.equal(result.shortlist.eligible, 39);
  assert.equal(result.shortlist.selected, 24);
  assert.equal(result.shortlist.omittedIds.length, 15);
  assert.deepEqual(result.shortlist.excludedIds, ["r2"]);
  for (const decision of result.decisions) {
    assert.equal(decision.rows.length, 24);
    assert.ok(
      decision.rows.every((r) => !result.shortlist.omittedIds.includes(r.id)),
    );
  }
  const overflow = await rankSearch(
    s,
    {
      ...input,
      shortlistSize: 1,
      liked: ["r39", "r40"],
    },
    () => mockScorer(),
  );
  assert.equal(overflow.shortlist.limit, 1);
  assert.deepEqual(
    overflow.decisions[0].rows.map((r) => r.id),
    ["r39", "r40"],
  );
});

test("all mode and all-excluded mode keep accounting complete without fake scores", async () => {
  const s = snapshot(30);
  const all = await rankSearch(
    s,
    { ...input, shortlistSize: null, excluded: ["r1"] },
    () => mockScorer(),
  );
  assert.equal(all.shortlist.selected, 29);
  assert.deepEqual(all.shortlist.omittedIds, []);
  const none = await rankSearch(
    s,
    {
      ...input,
      excluded: s.candidates.map((c) => c.id),
    },
    () => {
      throw new Error("No connection lookup or scoring should happen");
    },
  );
  assert.equal(none.shortlist.eligible, 0);
  assert.equal(none.shortlist.selected, 0);
  assert.deepEqual(none.decisions[0].rows, []);
  assert.equal(none.decisions[0].calls, 0);
  assert.equal(none.decisions[0].error, null);
});

test("shortlist and refresh options reject malformed input before scoring", async () => {
  for (const shortlistSize of [0, 101, 1.5, "24", NaN, Infinity])
    await assert.rejects(
      rankSearch(snapshot(), { ...input, shortlistSize }, () => mockScorer()),
      /精排候选数/,
    );
  await assert.rejects(
    rankSearch(snapshot(), { ...input, refreshScores: "yes" }, () =>
      mockScorer(),
    ),
    /布尔值/,
  );
});

test("same-context threshold changes reuse evidence with separate original cost provenance", async () => {
  let calls = 0;
  const scorer = mockScorer(() => {
    calls++;
  });
  const options = cachedOptions();
  const s = snapshot();
  const first = await rankSearch(s, input, () => scorer, options);
  const second = await rankSearch(
    s,
    { ...input, threshold: 0.9 },
    () => scorer,
    options,
  );
  assert.equal(calls, 1);
  const old = first.decisions[0],
    reused = second.decisions[0];
  assert.equal(old.cache?.hit, false);
  assert.equal(reused.cache?.hit, true);
  assert.equal(reused.calls, 0);
  assert.equal(reused.usage, null);
  assert.equal(reused.model, old.model);
  assert.deepEqual(reused.rawAnswers, old.rawAnswers);
  assert.equal(reused.cache?.originalCalls, 1);
  assert.deepEqual(reused.cache?.originalUsage, old.usage);
  assert.equal(reused.cache?.originalMs, old.ms);
  assert.equal(reused.cache?.scoredAt, old.cache?.scoredAt);
  assert.ok(old.rows.every((r) => r.retained));
  assert.ok(reused.rows.every((r) => !r.retained));
  assert.deepEqual(
    reused.rows.map((r) => r.evidence),
    old.rows.map((r) => r.evidence),
  );
  // Consumer mutation cannot alter subsequent evidence or token provenance.
  reused.rows[0].evidence.relevance = 0;
  reused.cache!.originalUsage!.input_tokens = 0;
  const third = await rankSearch(s, input, () => scorer, options);
  assert.equal(third.decisions[0].rows[0].evidence.relevance, 0.8);
  assert.equal(third.decisions[0].cache?.originalUsage?.input_tokens, 123);
});

test("cache invalidates for intent, all feedback, context, shortlist, identity, rubric and batch changes", async () => {
  let calls = 0;
  const scorer = mockScorer(() => {
    calls++;
  });
  const s = snapshot();
  const options = cachedOptions();
  await rankSearch(s, input, () => scorer, options);
  const cases: {
    snapshot?: SearchSnapshot;
    input?: object;
    options?: SearchRankOptions;
  }[] = [
    { input: { intent: "new intent" } },
    { input: { liked: ["r40"] } },
    { input: { excluded: ["r40"] } },
    { input: { shortlistSize: 25 } },
    // Even an omitted candidate is part of the exact candidate context.
    {
      snapshot: {
        ...s,
        candidates: s.candidates.map((c) =>
          c.id === "r40" ? { ...c, snippet: "Changed source excerpt" } : c,
        ),
      },
    },
    { snapshot: { ...s, candidates: [...s.candidates].reverse() } },
    {
      options: {
        ...options,
        providerIdentity: () => "same-model:new-connection-revision",
      },
    },
    {
      options: {
        ...options,
        providerIdentity: () => "different-model:same-endpoint",
      },
    },
    { options: { ...options, promptRevision: "rubrics-v2" } },
    { options: { ...options, batchSize: 12 } },
  ];
  for (const [i, variant] of cases.entries()) {
    const result = await rankSearch(
      variant.snapshot ?? s,
      { ...input, ...variant.input },
      () => scorer,
      variant.options ?? options,
    );
    assert.equal(result.decisions[0].cache?.hit, false);
    assert.equal(calls, i + 2);
  }
  // Exact data reuse need not depend on the random retrieval snapshot ID/time.
  const repeated = await rankSearch(
    { ...s, id: "another-retrieval", createdAt: new Date().toISOString() },
    input,
    () => scorer,
    options,
  );
  assert.equal(repeated.decisions[0].cache?.hit, true);
});

test("provider caches stay separate and connections without identity cannot reuse scores", async () => {
  let calls = 0;
  const scorer = mockScorer(() => {
    calls++;
  });
  const s = snapshot();
  const options = cachedOptions();
  const both = { ...input, providers: ["openai", "claude"] };
  await rankSearch(s, both, () => scorer, options);
  const reused = await rankSearch(s, both, () => scorer, options);
  assert.equal(calls, 2);
  assert.ok(reused.decisions.every((d) => d.cache?.hit));
  await rankSearch(s, input, () => scorer, { cache: options.cache });
  await rankSearch(s, input, () => scorer, { cache: options.cache });
  assert.equal(calls, 4);
});

test("cache hits do not extend TTL and refreshScores explicitly bypasses cached results", async () => {
  let now = 1000,
    calls = 0;
  const options = cachedOptions(
    new SearchScoreCache({ ttlMs: 100, now: () => now }),
  );
  const scorer = mockScorer(() => {
    calls++;
  });
  const s = snapshot();
  await rankSearch(s, input, () => scorer, options);
  now = 1099;
  assert.equal(
    (await rankSearch(s, input, () => scorer, options)).decisions[0].cache?.hit,
    true,
  );
  now = 1100;
  assert.equal(
    (await rankSearch(s, input, () => scorer, options)).decisions[0].cache?.hit,
    false,
  );
  assert.equal(calls, 2);
  assert.equal(
    (
      await rankSearch(
        s,
        { ...input, refreshScores: true },
        () => scorer,
        options,
      )
    ).decisions[0].cache?.hit,
    false,
  );
  assert.equal(calls, 3);
  assert.equal(
    (await rankSearch(s, input, () => scorer, options)).decisions[0].cache?.hit,
    true,
  );
});

test("cache obeys LRU entry and byte bounds, supports clearing, and refuses invalid limits", () => {
  let now = 1000;
  const cache = new SearchScoreCache({ maxEntries: 2, now: () => now });
  const result: DecisionResult = {
    evidence: [],
    model: "fixture",
    usage: null,
    rawAnswers: null,
    latency: 1,
    calls: 1,
  };
  cache.set("a", result, 2);
  cache.set("b", result, 2);
  cache.get("a");
  cache.set("c", result, 2);
  assert.equal(cache.get("b"), undefined);
  assert.ok(cache.get("a"));
  cache.clear();
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), undefined);
  const bytes = Buffer.byteLength(JSON.stringify(result));
  const limited = new SearchScoreCache({ maxBytes: bytes + 1, now: () => now });
  limited.set("a", result, 2);
  limited.set("b", result, 2);
  assert.equal(limited.get("a"), undefined);
  assert.ok(limited.get("b"));
  limited.set("huge", { ...result, rawAnswers: "x".repeat(bytes * 2) }, 2);
  assert.equal(limited.get("huge"), undefined);
  assert.ok(limited.get("b"));
  now += 11 * 60 * 1000;
  assert.equal(limited.get("b"), undefined);
  assert.throws(() => new SearchScoreCache({ maxEntries: 0 }));
  assert.throws(() => new SearchScoreCache({ ttlMs: -1 }));
});

test("failed, incomplete or invalid model results never enter cache or get fallback scores", async () => {
  for (const failure of ["throw", "missing", "out-of-range"] as const) {
    let calls = 0;
    const s = snapshot();
    const options = cachedOptions();
    const scorer: Decider = async (...args) => {
      calls++;
      if (failure === "throw") throw new Error("Fixture scoring error");
      const result = await mockScorer()(...args);
      if (failure === "missing") result.evidence.pop();
      else result.evidence[0].relevance = 1.2;
      return result;
    };
    for (let i = 0; i < 2; i++) {
      const result = await rankSearch(s, input, () => scorer, options);
      assert.ok(result.decisions[0].error);
      assert.deepEqual(result.decisions[0].rows, []);
      assert.equal(result.decisions[0].cache, undefined);
    }
    assert.equal(calls, 2);
  }
});

test("shortlisting reduces deterministic request counts while all mode preserves full batch provenance", async () => {
  const s = snapshot(100);
  let calls = 0;
  const scorer = batchDecider(
    mockScorer(() => {
      calls++;
    }),
  );
  const options = cachedOptions();
  const shortened = await rankSearch(s, input, () => scorer, options);
  assert.equal(calls, 1);
  assert.equal(shortened.decisions[0].calls, 1);
  const full = await rankSearch(
    s,
    { ...input, shortlistSize: null },
    () => scorer,
    options,
  );
  assert.equal(calls, 6);
  assert.equal(full.decisions[0].calls, 5);
  assert.equal((full.decisions[0].rawAnswers as any).batches.length, 5);
  const reused = await rankSearch(
    s,
    { ...input, shortlistSize: null, threshold: 0.5 },
    () => scorer,
    options,
  );
  assert.equal(calls, 6);
  assert.equal(reused.decisions[0].calls, 0);
  assert.equal(reused.decisions[0].cache?.originalCalls, 5);
  assert.deepEqual(
    reused.decisions[0].rawAnswers,
    full.decisions[0].rawAnswers,
  );
});

test("legacy snapshots without per-source ranks remain deterministic and supported", async () => {
  const s = snapshot(30);
  s.candidates = s.candidates.map(
    ({ sourceRanks: _ranks, ...candidate }) => candidate as SearchCandidate,
  );
  const first = await rankSearch(
    s,
    { ...input, providers: ["baseline"] },
    () => undefined,
  );
  const second = await rankSearch(
    s,
    { ...input, providers: ["baseline"] },
    () => undefined,
  );
  assert.deepEqual(first.decisions[0].rows, second.decisions[0].rows);
  assert.equal(first.shortlist.selected, 24);
});
