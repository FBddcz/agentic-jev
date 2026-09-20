import test from "node:test";
import assert from "node:assert/strict";
import {
  runTryOn,
  tryOnEndpoint,
  tryOnStatus,
  validateTryOnInput,
  validateTryOnImage,
  tryOnModel,
} from "../server/tryon";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const input = {
  personImage: png,
  garmentImage: png,
  category: "tops",
  garmentPhotoType: "flat-lay",
};
test("try-on only forwards bounded actual image data to a loopback worker", () => {
  for (const url of [
    "https://example.com",
    "http://127.0.0.1@evil.com",
    "http://127.0.0.1:8789/path",
    "http://127.0.0.1:8789?key=secret",
  ])
    assert.throws(() => tryOnEndpoint(url));
  assert.equal(tryOnEndpoint("http://127.0.0.1:8789"), "http://127.0.0.1:8789");
  for (const image of [
    "https://example.com/person.png",
    "data:image/png;base64,SGVsbG8=",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "x".repeat(6_000_000),
  ])
    assert.throws(() => validateTryOnImage(image));
  assert.equal(validateTryOnImage(png), png);
  assert.throws(() => validateTryOnInput({ ...input, category: "remove" }));
  assert.throws(() =>
    validateTryOnInput({ ...input, garmentPhotoType: "url" }),
  );
});
test("try-on reports only completed provider images and measured times", async () => {
  let calls = 0;
  const fetcher = (async (url, options) => {
    calls++;
    assert.equal(new URL(String(url)).pathname, "/try-on");
    assert.equal(options?.redirect, "error");
    assert.deepEqual(JSON.parse(options?.body as string), input);
    return Response.json({ image: png, model: tryOnModel, inferenceMs: 5000 });
  }) as typeof fetch;
  const result = await runTryOn(input, fetcher);
  assert.equal(calls, 1);
  assert.equal(result.image, png);
  assert.equal(result.inferenceMs, 5000);
  assert.ok(result.elapsedMs >= 0);
  await assert.rejects(() =>
    runTryOn(input, (async () =>
      Response.json({
        image: "https://evil.com/result",
        model: tryOnModel,
        inferenceMs: 1,
      })) as typeof fetch),
  );
  await assert.rejects(
    () =>
      runTryOn(
        input,
        (async () =>
          new Response("private diagnostics", { status: 500 })) as typeof fetch,
      ),
    /当前照片已保留/,
  );
});
test("disconnected and mismatched workers cannot advertise readiness or fake a result", async () => {
  const failed = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  assert.equal((await tryOnStatus(failed)).ready, false);
  assert.equal(
    (
      await tryOnStatus((async () =>
        Response.json({ ready: true, model: "other" })) as typeof fetch)
    ).ready,
    false,
  );
  assert.equal(
    (
      await tryOnStatus((async () =>
        Response.json({ ready: true, model: tryOnModel })) as typeof fetch)
    ).ready,
    true,
  );
  await assert.rejects(() => runTryOn(input, failed), /未连接/);
});
