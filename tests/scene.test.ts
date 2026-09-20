import test from "node:test";
import assert from "node:assert/strict";
import { recommendScene } from "../server/scene";
import { scenePresets } from "../src/scene-data";
test("3D recommendations respect the concept budget and select from renderable presets", async () => {
  for (const kind of ["outfit", "room"]) {
    const result = await recommendScene(
      {
        kind,
        query: "natural green 自然 绿色",
        budget: kind === "room" ? 5000 : 600,
        provider: "baseline",
      },
      () => undefined,
    );
    const selected = scenePresets.find((p) => p.id === result.selectedId)!;
    assert.ok(selected);
    assert.equal(selected.kind, kind);
    assert.ok(selected.budget <= result.budget);
    assert.equal(result.modelCalls, 0);
    assert.ok(result.rows.every((r) => r.score >= 0 && r.score <= 1));
  }
  assert.equal(
    (
      await recommendScene(
        { kind: "room", query: "warm", budget: 1, provider: "baseline" },
        () => undefined,
      )
    ).selectedId,
    null,
  );
});
test("scene model failures do not produce local substitute scores", async () => {
  await assert.rejects(
    recommendScene(
      { kind: "outfit", query: "work", budget: 2000, provider: "jev" },
      () => undefined,
    ),
    /连接/,
  );
  await assert.rejects(
    recommendScene(
      { kind: "room", query: "warm", budget: -1, provider: "baseline" },
      () => undefined,
    ),
    /有效/,
  );
});
