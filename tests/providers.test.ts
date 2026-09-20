import test from "node:test";
import assert from "node:assert/strict";
import {
  createCompatibleDecider,
  parseScores,
  validateConnection,
} from "../server/providers";
import { products, defaultConfig } from "../src/data";
const items = products.slice(0, 2),
  lexical = new Map(items.map((p) => [p.id, 0.3]));
test("compatible scores are complete, bounded and never advertised as confidence", () => {
  const raw = {
    items: items.map((p) => ({ id: p.id, relevance: 0.8, affinity: 0.6 })),
  };
  const scores = parseScores(raw, items, lexical, "llm");
  assert.equal(scores[0].confidence, null);
  assert.equal(scores[0].source, "llm");
  assert.throws(() =>
    parseScores({ items: [raw.items[0], raw.items[0]] }, items, lexical, "llm"),
  );
  assert.throws(() =>
    parseScores(
      { items: [{ ...raw.items[0], relevance: NaN }, raw.items[1]] },
      items,
      lexical,
      "llm",
    ),
  );
});
test("connection URLs reject credential-bearing URLs, redirects and remote plaintext", () => {
  for (const baseURL of [
    "http://example.com/v1",
    "https://secret@example.com/v1",
    "https://example.com/v1?key=abc",
  ])
    assert.throws(() =>
      validateConnection({
        provider: "openai",
        baseURL,
        model: "example",
        key: "abc",
      }),
    );
  assert.throws(() =>
    validateConnection({
      provider: "minicpm",
      baseURL: "https://example.com",
      model: "mini",
      key: "",
    }),
  );
  assert.equal(
    validateConnection({
      provider: "openai",
      baseURL: "http://127.0.0.1:8000/v1/",
      model: "local",
      key: "",
    }).baseURL,
    "http://127.0.0.1:8000/v1",
  );
});
for (const provider of ["openai", "claude", "minicpm"] as const)
  test(`${provider} request and readout use the intended protocol`, async () => {
    let seen: any;
    const scores = {
      items: items.map((p) => ({ id: p.id, relevance: 0.8, affinity: 0.6 })),
    };
    const fetcher = (async (url: any, options: any) => {
      seen = { url, options, body: JSON.parse(options.body) };
      return new Response(
        JSON.stringify(
          provider === "minicpm"
            ? {
                ...scores,
                model: "mini-test",
                usage: { input_tokens: 300, output_tokens: 0 },
                timing: { forward_calls: 2 },
              }
            : provider === "claude"
              ? {
                  model: "claude-test",
                  content: [{ type: "text", text: JSON.stringify(scores) }],
                  usage: { input_tokens: 300, output_tokens: 30 },
                }
              : {
                  model: "gpt-test",
                  choices: [{ message: { content: JSON.stringify(scores) } }],
                  usage: { prompt_tokens: 300, completion_tokens: 30 },
                },
        ),
        { status: 200 },
      );
    }) as typeof fetch;
    const decider = createCompatibleDecider(
      {
        provider,
        key: "example-test-only",
        model: "test",
        baseURL:
          provider === "minicpm"
            ? "http://127.0.0.1:8788"
            : "https://api.example.com/v1",
      },
      fetcher,
    );
    const result = await decider(
      { ...defaultConfig, provider },
      items,
      lexical,
      "camp",
      { liked: [], disliked: [] },
    );
    assert.equal(result.calls, 1);
    assert.equal(result.usage?.input_tokens, 300);
    assert.equal(seen.options.redirect, "error");
    assert.ok(
      seen.url.endsWith(
        provider === "claude"
          ? "/messages"
          : provider === "minicpm"
            ? "/score"
            : "/chat/completions",
      ),
    );
    assert.equal(
      result.evidence[0].source,
      provider === "minicpm" ? "local-logits" : "llm",
    );
    if (provider === "claude")
      assert.equal(seen.options.headers["anthropic-version"], "2023-06-01");
    if (provider === "openai")
      assert.deepEqual(seen.body.response_format, { type: "json_object" });
  });
test("upstream errors remain errors and do not echo provider bodies", async () => {
  const decider = createCompatibleDecider(
    {
      provider: "openai",
      key: "test",
      model: "test",
      baseURL: "https://api.example.com/v1",
    },
    (async () =>
      new Response("sensitive-provider-body", { status: 401 })) as typeof fetch,
  );
  await assert.rejects(
    decider(defaultConfig, items, lexical, "camp", { liked: [], disliked: [] }),
    (e) =>
      e instanceof Error &&
      e.message.includes("401") &&
      !e.message.includes("sensitive"),
  );
});
