import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import catalog from "../src/catalog.json";
import photos from "../src/photo-assets.json";
import { localizeProps, setLocale, t } from "../src/i18n/index";
test("each demo product has its own licensed photo, source page and file content", () => {
  const resolved = catalog.products.map(
    (p) => (photos as Record<string, any>)[p.id],
  );
  assert.equal(resolved.length, 48);
  for (const photo of resolved) {
    assert.ok(photo?.src);
    assert.ok(photo.author);
    assert.ok(photo.license);
    assert.ok(photo.page);
  }
  assert.equal(new Set(resolved.map((p) => p.page)).size, 48);
  assert.equal(new Set(resolved.map((p) => p.src)).size, 48);
  const hashes = resolved.map((p) =>
    createHash("sha256")
      .update(readFileSync(new URL(`../public${p.src}`, import.meta.url)))
      .digest("hex"),
  );
  assert.equal(new Set(hashes).size, 48);
});
test("language changes translate UI without altering form values, URLs, option identities or raw evidence", () => {
  setLocale("en");
  assert.equal(t("发现"), "Discover");
  const props = localizeProps("input", {
    value: "我的购物计划",
    placeholder: "此刻，你想发现什么？",
    type: "text",
  });
  assert.equal(props.value, "我的购物计划");
  assert.equal(props.placeholder, "What would you like to discover?");
  const option = localizeProps("option", { children: "本地规则" });
  assert.equal(option.children, "Local rules");
  assert.equal(option.value, "本地规则");
  assert.equal(
    localizeProps("pre", { children: '{"name":"拾意"}' }).children,
    '{"name":"拾意"}',
  );
  assert.equal(
    localizeProps("span", { translate: "no", children: "拾意" }).children,
    "拾意",
  );
  assert.equal(
    localizeProps("a", { href: "https://example.com/中文", children: "发现" })
      .href,
    "https://example.com/中文",
  );
  setLocale("zh");
  assert.equal(t("发现"), "发现");
  setLocale("en");
});

test("application and separately loaded JSX modules share language changes immediately", async () => {
  const url = new URL("../src/i18n/index.ts", import.meta.url);
  url.searchParams.set("runtime-copy", "regression");
  const other = await import(url.href);
  setLocale("en");
  assert.equal(other.t("发现"), "Discover");
  other.setLocale("zh");
  assert.equal(t("发现"), "发现");
  setLocale("en");
  assert.equal(
    other.localizeProps("button", { children: "论文" }).children,
    "Papers",
  );
});
