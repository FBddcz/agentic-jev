import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalUrl,
  normalizeResults,
  retrieveSearch,
  rankSearch,
  SearchStore,
  validateSearch,
} from "../server/search";
import { buildQuestions } from "../server/jev";
import type { SearchSnapshot } from "../src/search-types";
const response = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), { status });
const fixtures = async (url: string | URL | Request) =>
  String(url).includes("github.com")
    ? response({
        items: [
          {
            full_name: "team/jev-search",
            html_url: "https://example.org/jev?utm_source=github",
            description: "Jev web search and ranking",
            stargazers_count: 15,
          },
          {
            full_name: "team/game",
            html_url: "javascript:alert(1)",
            description: "bad",
          },
        ],
      })
    : response({
        hits: [
          {
            title: "Jev search discussion",
            url: "https://example.org/jev",
            story_text: "Jev web search decision agent discussion",
            points: 4,
          },
          {
            title: "Coffee",
            url: "https://example.org/coffee",
            story_text: "Roasting coffee",
          },
        ],
      });
const retrieve = () =>
  retrieveSearch(
    { query: "jev", sources: ["github", "hackernews"], limit: 20 },
    {},
    fixtures as typeof fetch,
  );
test("real search sources merge canonical URLs and preserve provenance and original order", async () => {
  const s = await retrieve();
  assert.equal(s.candidates.length, 2);
  assert.deepEqual(s.candidates[0].sources, ["github", "hackernews"]);
  assert.equal(s.candidates[0].url, "https://example.org/jev");
  assert.equal(s.lanes.length, 2);
  assert.equal(s.lanes[0].count, 1);
  assert.ok(s.searchMs >= 0);
  assert.equal(s.fingerprint.length, 64);
});
test("failed lanes remain explicit; missing keys never become local mock results", async () => {
  const s = await retrieveSearch(
    { query: "jev", sources: ["github", "brave"], limit: 3 },
    {},
    fixtures as typeof fetch,
  );
  assert.equal(s.candidates.length, 1);
  assert.match(s.lanes[1].error!, /Key/);
  await assert.rejects(
    retrieveSearch(
      { query: "jev", sources: ["search1api"], limit: 3 },
      {},
      fixtures as typeof fetch,
    ),
    /Key/,
  );
});
test("network failures and malformed responses are not silently interpreted as empty search results", async () => {
  await assert.rejects(
    retrieveSearch(
      { query: "jev", sources: ["github"], limit: 3 },
      {},
      async () => response({ unexpected: true }),
    ),
    /格式/,
  );
  await assert.rejects(
    retrieveSearch(
      { query: "jev", sources: ["github"], limit: 3 },
      {},
      async () => {
        throw new Error("private upstream body");
      },
    ),
    (e) => !/private/.test(String(e)),
  );
});
test("web source credentials are only sent to their fixed API; results sanitize unsafe links", async () => {
  let seen = "";
  const s = await retrieveSearch(
    { query: "camping", sources: ["search1api"], limit: 6 },
    { search1api: "secret" },
    async (url, init) => {
      seen = String(url);
      assert.equal((init!.headers as any).Authorization, "Bearer secret");
      assert.equal(init!.redirect, "error");
      const body = JSON.parse(init!.body as string);
      assert.equal(body.query, "camping");
      return response({
        results: [
          {
            title: "<b>Tent</b>",
            link: "https://shop.example/tent",
            snippet: "<script>hi</script>text",
          },
        ],
      });
    },
  );
  assert.equal(seen, "https://api.search1api.com/search");
  assert.equal(s.candidates[0].title, "Tent");
  assert.ok(!JSON.stringify(s).includes("secret"));
  assert.equal(canonicalUrl("https://user:pass@example.com/"), null);
  assert.equal(canonicalUrl("data:text/html,hello"), null);
});
test("same candidate snapshot supports feedback, comparison and exact score evidence without another search", async () => {
  const s = await retrieve();
  let calls = 0;
  const mock = async (_c: any, items: any[]) => {
    calls++;
    return {
      evidence: items.map((p) => ({
        id: p.id,
        relevance: 0.8,
        affinity: 0.6,
        confidence: null,
        lexical: 0,
        source: "llm" as const,
      })),
      model: "fixture-v1",
      usage: null,
      rawAnswers: { fixture: true },
      latency: 1,
      calls: 1,
    };
  };
  const result = await rankSearch(
    s,
    {
      intent: "Jev web search",
      threshold: 0.3,
      providers: ["baseline", "openai"],
      excluded: [s.candidates[1].id],
    },
    () => mock,
  );
  assert.equal(calls, 1);
  assert.equal(result.decisions[0].calls, 0);
  assert.equal(result.decisions[1].rows[0].score, 0.74);
  assert.equal(
    result.decisions[1].rows.some((r) => r.id === s.candidates[1].id),
    false,
  );
  assert.deepEqual(result.shortlist.excludedIds, [s.candidates[1].id]);
  assert.equal(result.snapshot.fingerprint, s.fingerprint);
  assert.equal(s.candidates.length, 2);
});
test("one failed model does not get fabricated scores or invalidate successful comparisons", async () => {
  const s = await retrieve();
  const result = await rankSearch(
    s,
    { intent: "Jev search", threshold: 0, providers: ["baseline", "jev"] },
    () => undefined,
  );
  assert.ok(result.decisions[0].rows.length);
  assert.ok(result.decisions[1].error);
  assert.deepEqual(result.decisions[1].rows, []);
});
test("rejects unknown feedback, conflicting feedback, invalid thresholds and duplicated sources", async () => {
  const s = await retrieve();
  for (const extra of [
    { liked: ["unknown"] },
    { liked: [s.candidates[0].id], excluded: [s.candidates[0].id] },
    { threshold: NaN },
    { providers: ["baseline", "baseline"] },
  ])
    await assert.rejects(
      rankSearch(
        s,
        { intent: "Jev", threshold: 0.2, providers: ["baseline"], ...extra },
        () => undefined,
      ),
    );
  assert.throws(() =>
    validateSearch({ query: "jev", sources: ["github", "github"], limit: 20 }),
  );
  assert.throws(() =>
    validateSearch({ query: "jev", sources: ["github"], limit: 0 }),
  );
});
test("snapshots are independent copies and expire; search Jev rubrics do not ask shopping questions", async () => {
  const s = await retrieve(),
    store = new SearchStore();
  store.add(s);
  store.get(s.id).candidates.length = 0;
  assert.equal(store.get(s.id).candidates.length, 2);
  assert.throws(() => store.get("missing"));
  store.add({
    ...s,
    id: "old",
    createdAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
  });
  assert.throws(() => store.get("old"));
  const qs = buildQuestions([{ id: "r1" } as any], "search");
  assert.match(JSON.stringify(qs), /search purpose/);
  assert.ok(!JSON.stringify(qs).includes("shopper"));
});

test("free paper sources preserve metadata, merge DOI variants and never imply missing abstracts", async () => {
  const s = await retrieveSearch(
    {
      query: "retrieval augmented generation",
      sources: ["crossref", "europepmc"],
      limit: 5,
    },
    {},
    async (url, init) => {
      assert.equal(new Headers(init?.headers).has("Authorization"), false);
      if (String(url).includes("api.crossref.org"))
        return response({
          message: {
            items: [
              {
                title: ["A paper"],
                DOI: "10.1234/ABC",
                author: [{ given: "Ada", family: "Example" }],
                published: { "date-parts": [[2024]] },
                "container-title": ["Example Journal"],
              },
              { title: ["No abstract paper"], DOI: "10.1234/DEF" },
            ],
          },
        });
      assert.ok(String(url).includes("resultType=core"));
      return response({
        resultList: {
          result: [
            {
              title: "A paper",
              doi: "10.1234/abc",
              abstractText: "<jats:p>A real abstract.</jats:p>",
              authorString: "Example A.",
              pubYear: "2024",
              isOpenAccess: "Y",
              journalInfo: { journal: { title: "Example Journal" } },
            },
          ],
        },
      });
    },
  );
  assert.equal(s.candidates.length, 2);
  assert.deepEqual(s.candidates[0].sources, ["crossref", "europepmc"]);
  assert.equal(s.candidates[0].url, "https://doi.org/10.1234/abc");
  assert.equal(s.candidates[0].snippet, "A real abstract.");
  assert.equal(s.candidates[0].paper?.year, 2024);
  assert.equal(s.candidates[0].paper?.openAccess, true);
  assert.equal(s.candidates[0].paper?.authors, "Ada Example");
  assert.equal(s.candidates[1].snippet, "");
  assert.equal(s.candidates[1].paper?.year, null);
  assert.equal(s.candidates[1].paper?.openAccess, null);
  assert.equal(
    canonicalUrl("http://dx.doi.org/10.1234/ABC?utm_source=x"),
    s.candidates[0].url,
  );
});

test("malformed paper APIs and query failures are visible errors", async () => {
  for (const source of ["crossref", "europepmc"]) {
    await assert.rejects(
      retrieveSearch(
        { query: "example", sources: [source], limit: 2 },
        {},
        async () => response({ unexpected: true }),
      ),
      /格式/,
    );
  }
  await assert.rejects(
    retrieveSearch(
      { query: "invalid query", sources: ["europepmc"], limit: 2 },
      {},
      async () =>
        response({ errMsg: "Invalid query", resultList: { result: [] } }),
    ),
    /无效/,
  );
});

test("real shopping accepts only product detail URLs on the selected marketplace", async () => {
  const { isMarketplaceProduct } = await import("../server/search");
  assert.ok(
    isMarketplaceProduct(
      "https://www.amazon.com/example/dp/B012345678",
      "amazon",
    ),
  );
  assert.ok(
    isMarketplaceProduct(
      "https://item.taobao.com/item.htm?id=123456",
      "taobao",
    ),
  );
  assert.ok(
    isMarketplaceProduct(
      "https://detail.tmall.com/item.htm?id=123456",
      "taobao",
    ),
  );
  assert.ok(isMarketplaceProduct("https://item.jd.com/123456.html", "jd"));
  for (const u of [
    "https://amazon.com.attacker.example/dp/B012345678",
    "https://www.amazon.com/s?k=chair",
    "https://other.example/dp/B012345678",
  ])
    assert.equal(isMarketplaceProduct(u, "amazon"), false);
  const s = await retrieveSearch(
    { query: "desk chair", sources: ["brave"], limit: 5, market: "amazon" },
    { brave: "fixture-key" },
    async (url) => {
      assert.match(
        new URL(String(url)).searchParams.get("q")!,
        /site:amazon.com/,
      );
      return response({
        web: {
          results: [
            {
              title: "Chair",
              url: "https://www.amazon.com/dp/B012345678",
              description: "Actual upstream snippet",
            },
            { title: "Search", url: "https://www.amazon.com/s?k=chair" },
          ],
        },
      });
    },
  );
  assert.equal(s.candidates.length, 1);
  assert.equal(s.market, "amazon");
  assert.equal(s.query, "desk chair");
  assert.equal(s.lanes[0].count, 1);
  assert.throws(() =>
    validateSearch({
      query: "chair",
      sources: ["github"],
      limit: 5,
      market: "amazon",
    }),
  );
});
test("Tavily uses basic credits, caps upstream results and preserves real source evidence", async () => {
  let calls = 0;
  const result = await retrieveSearch(
    { query: "linen shirt", sources: ["tavily"], limit: 80, market: "amazon" },
    { tavily: "test-key" },
    (async (url, init) => {
      calls++;
      assert.equal(url, "https://api.tavily.com/search");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer test-key",
      );
      const body = JSON.parse(init?.body as string);
      assert.equal(body.search_depth, "basic");
      assert.equal(body.auto_parameters, false);
      assert.equal(body.max_results, 20);
      assert.equal(body.include_answer, false);
      assert.equal(body.include_raw_content, false);
      assert.match(body.query, /site:amazon.com/);
      return Response.json({
        results: [
          {
            title: "Linen shirt",
            url: "https://www.amazon.com/dp/B012345678",
            content: "Actual provider snippet",
          },
          {
            title: "Off-market",
            url: "https://example.com",
            content: "ignored",
          },
        ],
      });
    }) as typeof fetch,
  );
  assert.equal(calls, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].snippet, "Actual provider snippet");
  assert.deepEqual(result.candidates[0].sources, ["tavily"]);
  assert.ok(!JSON.stringify(result).includes("test-key"));
});

test("Tavily fails explicitly on missing key and exhausted quota", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response("quota", { status: 429 });
  }) as typeof fetch;
  await assert.rejects(
    () =>
      retrieveSearch(
        { query: "test", sources: ["tavily"], limit: 10 },
        {},
        fetcher,
      ),
    /尚未配置/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    () =>
      retrieveSearch(
        { query: "test", sources: ["tavily"], limit: 10 },
        { tavily: "test-key" },
        fetcher,
      ),
    /429/,
  );
});
