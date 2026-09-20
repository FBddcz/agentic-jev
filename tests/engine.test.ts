import test from "node:test";
import assert from "node:assert/strict";
import { products, defaultConfig, missions } from "../src/data";
import {
  generate,
  validateConfig,
  buildSlate,
  rank,
  baselineEvidence,
  recall,
  auction,
} from "../server/engine";
import { parseAnswers, buildQuestions } from "../server/jev";
import { evaluate, ndcg } from "../server/evaluation";

test("all four scenes respect hard budgets, uniqueness and exclusions across budget levels", async () => {
  for (const m of missions)
    for (const budget of [50, 100, 250, 600, 1000, 1500, 3000]) {
      const c = {
        ...defaultConfig,
        mission: m.id,
        query: m.query,
        budget,
        dislikes: [products.find((p) => p.mission === m.id)!.id],
      };
      const run = await generate(c);
      for (const list of [run.slate, run.greedy]) {
        assert.ok(list.reduce((s, p) => s + p.price, 0) <= budget);
        assert.ok(list.length <= 4);
        assert.equal(new Set(list.map((p) => p.id)).size, list.length);
        assert.ok(list.every((p) => !c.dislikes.includes(p.id)));
      }
      assert.equal(run.modelCalls, 0);
      assert.equal(run.model, "local-heuristic-v1");
      assert.ok(run.slate.every((p) => p.evidence.confidence === null));
    }
});
test("fixed items are retained, and overspending fixed sets are rejected", async () => {
  const run = await generate({
    ...defaultConfig,
    locked: ["c10"],
    budget: 1500,
  });
  assert.ok(run.slate.some((p) => p.id === "c10"));
  assert.throws(
    () => validateConfig({ ...defaultConfig, locked: ["c10"], budget: 500 }),
    /超过预算/,
  );
  assert.throws(
    () =>
      validateConfig({ ...defaultConfig, locked: ["c01"], dislikes: ["c01"] }),
    /冲突/,
  );
});
test("unknown products, numeric strings, NaN and extra providers cannot enter engine", () => {
  for (const patch of [
    { likes: ["fake"] },
    { likes: ["c01", "c01"] },
    { budget: "1500" },
    { diversity: NaN },
    { adWeight: 2 },
    { ads: "true" },
    { provider: "pretend-jev" },
    { query: " " },
    { query: "a".repeat(501) },
  ])
    assert.throws(() => validateConfig({ ...defaultConfig, ...patch }));
});
test("feedback changes affinity and does not silently alter provider", async () => {
  const a = await generate(defaultConfig),
    b = await generate({ ...defaultConfig, likes: ["c01"] });
  assert.ok(
    b.candidates.find((p) => p.id === "c01")!.evidence.affinity >
      a.candidates.find((p) => p.id === "c01")!.evidence.affinity,
  );
  await assert.rejects(
    generate({ ...defaultConfig, provider: "jev" }),
    /尚未连接/,
  );
});
test("single-item ranking and diverse bundle can make different decisions under one budget", () => {
  const c = { ...defaultConfig, diversity: 1 },
    r = recall(c),
    scores = baselineEvidence(c, r.items, r.lexical, r.mission),
    ranked = rank(r.items, scores, r.mission);
  const slate = buildSlate(ranked, c, r.mission),
    greedy = buildSlate(ranked, c, r.mission, "greedy");
  assert.equal(new Set(slate.map((p) => p.category)).size, 4);
  assert.notDeepEqual(
    slate.map((p) => p.id),
    greedy.map((p) => p.id),
  );
});
test("advertising stays separate, passes relevance gate, and never prices above bid", async () => {
  const run = await generate(defaultConfig),
    a = run.auction;
  assert.ok(a.winner);
  assert.ok(a.winner!.evidence.relevance >= 0.55);
  assert.ok(!run.slate.some((p) => p.id === a.winner!.id));
  assert.ok(a.cpc <= a.winner!.bid);
  assert.equal(
    auction(run.candidates, run.slate, { ...defaultConfig, ads: false }).winner,
    null,
  );
  const poor = run.candidates.map((p) => ({
    ...p,
    evidence: { ...p.evidence, relevance: 0 },
  }));
  assert.equal(auction(poor, [], defaultConfig).winner, null);
});
test("official Jev contract: per-candidate IDs, 0-based score and strict distributions", () => {
  const items = products.slice(0, 2),
    qs = buildQuestions(items),
    lexical = new Map(items.map((p) => [p.id, 0.5]));
  assert.equal(Object.keys(qs).length, 4);
  assert.equal(qs.rel_c01.type, "noul");
  assert.match(String(qs.rel_c02.instructions), /candidates\[1\]/);
  const raw = {
    model: "jev-1.13.0",
    usage: { input_tokens: 400, output_tokens: 40 },
    answers: Object.fromEntries(
      items.flatMap((p) => [
        [`rel_${p.id}`, { type: "noul", noul: 0.82 }],
        [
          `fit_${p.id}`,
          {
            type: "score",
            score: 1.8,
            confidence: 0.7,
            probabilities: { "0": 0, "1": 0.2, "2": 0.8 },
          },
        ],
      ]),
    ),
  };
  const result = parseAnswers(raw, items, lexical);
  assert.equal(result.evidence[0].affinity, 0.9);
  assert.equal(result.evidence[0].confidence, 0.7);
  const bad = structuredClone(raw);
  bad.answers.rel_c01 = { type: "noul", noul: 1.2 };
  assert.throws(() => parseAnswers(bad, items, lexical), /越界/);
  const missing = structuredClone(raw);
  delete missing.answers.fit_c02;
  assert.throws(() => parseAnswers(missing, items, lexical));
  const corrupt = structuredClone(raw);
  corrupt.answers.fit_c01 = {
    type: "score",
    score: 1,
    confidence: 0.8,
    probabilities: { "0": 0.8, "1": 0.8, "2": 0.8 },
  };
  assert.throws(() => parseAnswers(corrupt, items, lexical), /分布/);
});
test("real provider result records returned model and usage; errors never become baseline scores", async () => {
  const run = await generate(
    { ...defaultConfig, provider: "jev" },
    async (c, items, lexical, mission) => ({
      evidence: baselineEvidence(c, items, lexical, mission).map((e) => ({
        ...e,
        source: "jev",
        confidence: 0.8,
      })),
      model: "contract-test-fixture",
      calls: 1,
      latency: 1,
      rawAnswers: { fixture: true },
      usage: { input_tokens: 100, output_tokens: 20 },
    }),
  );
  assert.equal(run.modelCalls, 1);
  assert.equal(run.model, "contract-test-fixture");
  assert.equal(run.usage?.input_tokens, 100);
  await assert.rejects(
    generate({ ...defaultConfig, provider: "jev" }, async () => {
      throw new Error("offline");
    }),
    /offline/,
  );
});
test("unknown intent is disclosed and empty budget remains an honest empty result", async () => {
  assert.ok(
    (await generate({ ...defaultConfig, query: "zzzzzz" })).warnings.some((w) =>
      w.includes("匹配较弱"),
    ),
  );
  assert.equal(
    (await generate({ ...defaultConfig, budget: 50 })).slate.length,
    0,
  );
});
test("NDCG has a fixed cutoff and reproducible evaluation reports per-case evidence", async () => {
  assert.equal(ndcg(["a", "b"], { a: 3, b: 2 }, ["a", "b"]), 1);
  assert.equal(ndcg([], { a: 3 }, ["a"]), 0);
  const a = await evaluate("baseline", 42),
    b = await evaluate("baseline", 42);
  assert.equal(a.rows.length, 24);
  assert.equal(a.modelCalls, 0);
  assert.deepEqual(a.rows, b.rows);
  assert.deepEqual(
    a.metrics.map((m) => m.ci),
    b.metrics.map((m) => m.ci),
  );
  assert.ok(a.metrics.every((m) => m.budgetPass === 1 && m.ndcg <= 1));
});
