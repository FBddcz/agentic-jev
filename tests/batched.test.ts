import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, products } from "../src/data";
import type { Product } from "../src/types";
import type { Decider, DecisionResult } from "../server/engine";
import { batchDecider } from "../server/batched";

const candidates: Product[] = Array.from({ length: 50 }, (_, i) => ({
  ...products[i % products.length],
  id: `fixture-${i}`,
}));
const lexical = new Map(candidates.map((p) => [p.id, 0.5]));
const feedback = { liked: [products[0]], disliked: [products[1]] };
const config = { ...defaultConfig };
function resultFor(items: Product[], batch = 0): DecisionResult {
  return {
    evidence: items.map((p) => ({
      id: p.id,
      relevance: 0.8,
      affinity: 0.6,
      confidence: null,
      lexical: lexical.get(p.id)!,
      source: "llm",
    })),
    model: "fixture-v1",
    calls: 1,
    latency: 10 + batch,
    usage: { input_tokens: 100 + batch, output_tokens: 20 + batch },
    rawAnswers: { fixtureBatch: batch },
  };
}

test("fifty candidates use three sequential batches and retain context and evidence", async () => {
  let active = 0;
  const lengths: number[] = [];
  const wrapped: Decider = async (c, items, words, mission, history) => {
    assert.equal(c, config);
    assert.equal(words, lexical);
    assert.equal(mission, config.mission);
    assert.equal(history, feedback);
    assert.equal(++active, 1);
    const index = lengths.length;
    lengths.push(items.length);
    await Promise.resolve();
    active--;
    return resultFor(items, index);
  };
  const result = await batchDecider(wrapped)(
    config,
    candidates,
    lexical,
    config.mission,
    feedback,
  );
  assert.deepEqual(lengths, [24, 24, 2]);
  assert.deepEqual(
    result.evidence.map((e) => e.id),
    candidates.map((p) => p.id),
  );
  assert.equal(result.model, "fixture-v1");
  assert.equal(result.calls, 3);
  assert.equal(result.latency, 33);
  assert.deepEqual(result.usage, { input_tokens: 303, output_tokens: 63 });
  assert.deepEqual(result.rawAnswers, {
    batched: true,
    batchSize: 24,
    batches: [0, 1, 2].map((index) => {
      const batch = candidates.slice(index * 24, (index + 1) * 24);
      const result = resultFor(batch, index);
      return {
        candidateIds: batch.map((p) => p.id),
        model: result.model,
        calls: result.calls,
        latency: result.latency,
        usage: result.usage,
        rawAnswers: result.rawAnswers,
      };
    }),
  });
});

test("one batch preserves the provider result and raw shape without extra requests", async () => {
  for (const count of [0, 1, 24]) {
    const items = candidates.slice(0, count);
    const expected = resultFor(items);
    let calls = 0;
    const result = await batchDecider(async (_c, received) => {
      calls++;
      assert.equal(received, items);
      return expected;
    })(config, items, lexical, config.mission, feedback);
    assert.equal(calls, 1);
    assert.equal(result, expected);
    assert.equal(result.rawAnswers, expected.rawAnswers);
  }
});

test("unknown usage in any batch makes the total unknown and keeps per-batch usage", async () => {
  for (const missing of [0, 1, 2]) {
    let index = 0;
    const result = await batchDecider(async (_c, items) => {
      const current = index++;
      return {
        ...resultFor(items, current),
        usage:
          current === missing
            ? null
            : {
                input_tokens: 10,
                output_tokens: 0,
              },
      };
    })(config, candidates, lexical, config.mission, feedback);
    assert.equal(result.usage, null);
    assert.equal(result.calls, 3);
    assert.equal(
      (result.rawAnswers as { batches: DecisionResult[] }).batches[missing]
        .usage,
      null,
    );
  }
});

test("a failed batch aborts before later requests and never returns partial scores", async () => {
  let calls = 0;
  const wrapped = batchDecider(async (_c, items) => {
    if (++calls === 2) throw new Error("fixture offline");
    return resultFor(items);
  });
  await assert.rejects(
    wrapped(config, candidates, lexical, config.mission, feedback),
    /fixture offline/,
  );
  assert.equal(calls, 2);
});

test("model version changes or incomplete batches abort rather than mixing scores", async () => {
  for (const defect of ["version", "missing", "duplicate", "unknown"]) {
    let calls = 0;
    const wrapped = batchDecider(async (_c, items) => {
      const result = resultFor(items);
      if (++calls === 2) {
        if (defect === "version") result.model = "fixture-v2";
        if (defect === "missing") result.evidence.pop();
        if (defect === "duplicate") result.evidence[1] = result.evidence[0];
        if (defect === "unknown") result.evidence[0].id = "not-a-candidate";
      }
      return result;
    });
    await assert.rejects(
      wrapped(config, candidates, lexical, config.mission, feedback),
      defect === "version" ? /模型版本/ : /完整候选评分/,
    );
    assert.equal(calls, 2);
  }
});

test("batch size is a positive integer and custom sizes split requests", async () => {
  for (const size of [0, -1, 1.5, NaN, Infinity])
    assert.throws(() =>
      batchDecider(async (_c, items) => resultFor(items), size),
    );
  const lengths: number[] = [];
  await batchDecider(async (_c, items) => {
    lengths.push(items.length);
    return resultFor(items);
  }, 2)(config, candidates.slice(0, 5), lexical, config.mission, feedback);
  assert.deepEqual(lengths, [2, 2, 1]);
});
