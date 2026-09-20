import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { catalog, defaultConfig } from "../src/data";
import { validateCatalog } from "../src/catalog";
import { algorithmSettings, validateAlgorithmSettings } from "../src/settings";
import { createEngine, generate, validateConfig } from "../server/engine";
import { createCompatibleDecider } from "../server/providers";
import { evaluate } from "../server/evaluation";

function garden() {
  const base = catalog.products[0];
  return {
    version: "garden-v1",
    missions: [
      {
        ...catalog.missions[0],
        id: "garden",
        name: "阳台花园",
        query: "阳台种花",
        budget: 500,
        roles: ["容器", "工具"],
        words: ["种花", "garden"],
      },
    ],
    products: [
      {
        ...base,
        id: "pot",
        name: "陶盆",
        subtitle: "园艺花盆",
        mission: "garden",
        category: "容器",
        tags: ["自然", "轻便"],
        price: 50.5,
        bid: 0,
      },
      {
        ...base,
        id: "tool",
        name: "园艺铲",
        subtitle: "种花工具",
        mission: "garden",
        category: "工具",
        tags: ["耐用"],
        price: 29.5,
        bid: 0,
      },
      {
        ...base,
        id: "soil",
        name: "营养土",
        subtitle: "盆栽土壤",
        mission: "garden",
        category: "土壤",
        tags: ["自然"],
        price: 20.25,
        bid: 0,
      },
    ],
  };
}

test("a new JSON scene and catalog work without editing ranking or provider logic", async () => {
  const input = garden(),
    engine = createEngine(input);
  const config = {
    ...defaultConfig,
    mission: "garden",
    query: "GARDEN 种花",
    budget: 500,
    likes: ["soil"],
    dislikes: ["pot"],
    locked: ["tool"],
  };
  let state: any;
  const decider = createCompatibleDecider(
    {
      provider: "openai",
      model: "fixture",
      key: "",
      baseURL: "http://localhost:1234/v1",
    },
    async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      state = JSON.parse(request.messages[1].content);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  items: state.candidates.map((p: { id: string }) => ({
                    id: p.id,
                    relevance: 0.9,
                    affinity: 0.5,
                  })),
                }),
              },
            },
          ],
          model: "fixture",
        }),
        { status: 200 },
      );
    },
  );
  const run = await engine.generate({ ...config, provider: "openai" }, decider);
  assert.equal(run.mission, "garden");
  assert.deepEqual(
    state.liked.map((p: { id: string }) => p.id),
    ["soil"],
  );
  assert.deepEqual(
    state.disliked.map((p: { id: string }) => p.id),
    ["pot"],
  );
  assert.ok(run.slate.some((p) => p.id === "tool"));
  assert.ok(run.slate.every((p) => ["soil", "tool"].includes(p.id)));
  assert.equal(run.engine.catalogVersion, "garden-v1");
  assert.equal(run.engine.catalogFingerprint.length, 64);
  // Changing caller-owned input after construction cannot corrupt an engine.
  input.products[1].price = 9000;
  assert.equal(
    (await engine.generate(config)).candidates.find((p) => p.id === "tool")!
      .price,
    29.5,
  );
});

test("catalog validation rejects duplicate IDs, invalid money, dangling scenes and empty roles", () => {
  const mutations: ((c: ReturnType<typeof garden>) => void)[] = [
    (c) => {
      c.products[1].id = c.products[0].id;
    },
    (c) => {
      c.products[0].mission = "unknown";
    },
    (c) => {
      c.products[0].quality = NaN;
    },
    (c) => {
      c.products[0].price = -1;
    },
    (c) => {
      c.products[0].price = 12.001;
    },
    (c) => {
      c.products[0].bid = Infinity;
    },
    (c) => {
      c.products[0].color = "not-a-color";
    },
    (c) => {
      c.missions[0].roles = [];
    },
    (c) => {
      c.missions.push({ ...c.missions[0] });
    },
  ];
  for (const mutate of mutations) {
    const c = garden();
    mutate(c);
    assert.throws(() => validateCatalog(c));
  }
  assert.throws(
    () => validateCatalog({ ...garden(), prodcuts: [] }),
    /未知字段/,
  );
  assert.throws(() => validateCatalog({ ...garden(), products: [] }));
  const premium = garden();
  premium.products[0].price = 15000.5;
  assert.equal(validateCatalog(premium).products[0].price, 15000.5);
});

test("algorithm parameters are validated and actually control ranking, retrieval and search", async () => {
  for (const change of [
    { retrieval: { ...algorithmSettings.retrieval, limit: "24" } },
    { retrieval: { ...algorithmSettings.retrieval, bm25K1: 0 } },
    { slate: { ...algorithmSettings.slate, beamWidth: 10000 } },
    { slate: { ...algorithmSettings.slate, searchBudget: Infinity } },
    { ranking: { ...algorithmSettings.ranking, relevanceWeight: 0 } },
    { advertising: { ...algorithmSettings.advertising, baseCtr: 1 } },
    { defaults: { ...algorithmSettings.defaults, diversity: NaN } },
  ])
    assert.throws(() =>
      validateAlgorithmSettings({ ...algorithmSettings, ...change }),
    );
  assert.throws(() =>
    validateAlgorithmSettings({ ...algorithmSettings, beemWidth: 50 }),
  );
  const settings = structuredClone(algorithmSettings);
  settings.version = "small-search";
  settings.retrieval.limit = 12;
  settings.ranking = {
    relevanceWeight: 0,
    affinityWeight: 0,
    qualityWeight: 1,
    minRelevance: 0.24,
  };
  settings.slate.beamWidth = 1;
  settings.slate.searchBudget = 100;
  const run = await createEngine(catalog, settings).generate({
    ...defaultConfig,
    budget: 50000,
    maxItems: 20,
  });
  assert.equal(run.candidates.length, 20);
  assert.ok(run.candidates.every((p) => p.rankScore === p.quality));
  assert.match(run.engine.settingsFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(run.engine.settings.slate.beamWidth, 1);
  assert.ok(run.trace.some((step) => step.detail.includes("宽度 1")));
  assert.ok(run.warnings.some((warning) => warning.includes("计算预算")));
  assert.ok(run.total <= 50000);
});

test("auto and arbitrary item counts are natural limits, with larger requests expanding retrieval", async () => {
  assert.equal(defaultConfig.maxItems, null);
  for (const maxItems of [null, 1, 3, 5, 13, 30, Number.MAX_SAFE_INTEGER]) {
    const run = await generate({
      ...defaultConfig,
      maxItems,
      budget: 50000,
      diversity: 0,
    });
    assert.equal(run.config.maxItems, maxItems);
    assert.ok(run.slate.length <= (maxItems ?? catalog.products.length));
    assert.equal(new Set(run.slate.map((p) => p.id)).size, run.slate.length);
    assert.ok(run.total <= 50000);
    if (maxItems === 30) assert.equal(run.candidates.length, 30);
    if (maxItems === Number.MAX_SAFE_INTEGER)
      assert.equal(run.candidates.length, catalog.products.length);
    if (maxItems === null)
      assert.equal(run.candidates.length, algorithmSettings.retrieval.limit);
  }
  for (const budget of [1, 50000, Number.MAX_SAFE_INTEGER])
    assert.equal(validateConfig({ ...defaultConfig, budget }).budget, budget);
  for (const budget of [0, -1, 50.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => validateConfig({ ...defaultConfig, budget }));
});

test("fixed evaluation remains comparable when application catalog and defaults are customized", async () => {
  const saved = JSON.parse(
    await readFile(
      new URL("../docs/baseline-results.json", import.meta.url),
      "utf8",
    ),
  );
  const original = structuredClone(catalog),
    originalSettings = structuredClone(algorithmSettings);
  try {
    const replacement = garden();
    catalog.missions.splice(
      0,
      catalog.missions.length,
      ...replacement.missions,
    );
    catalog.products.splice(
      0,
      catalog.products.length,
      ...replacement.products,
    );
    algorithmSettings.defaults.maxItems = 30;
    algorithmSettings.slate.coverageReward = 0;
    const result = await evaluate();
    assert.equal(result.cases, 12);
    assert.equal(result.version, saved.version);
    assert.deepEqual(result.rows, saved.rows);
    assert.deepEqual(
      result.metrics.map(({ latency: _, ...metric }) => metric),
      saved.metrics.map(({ latency: _, ...metric }: any) => metric),
    );
    assert.equal(result.engine.settings.defaults.maxItems, 4);
    assert.equal(result.engine.settings.slate.coverageReward, 0.8);
  } finally {
    catalog.missions.splice(0, catalog.missions.length, ...original.missions);
    catalog.products.splice(0, catalog.products.length, ...original.products);
    Object.assign(algorithmSettings, originalSettings);
  }
});
