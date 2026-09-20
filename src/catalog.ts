import type { Mission, Product } from "./types";

export type Catalog = {
  version: string;
  missions: Mission[];
  products: Product[];
};

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} 必须是对象。`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${path} 必须是 1–${max} 字符的文本。`);
  return value.trim();
}
function id(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(result))
    throw new Error(`${path} 需以字母开头，只含字母、数字、下划线或连字符。`);
  return result;
}
function number(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${path} 必须是 ${min}–${max} 之间的有限数值。`);
  return value;
}
function money(value: unknown, path: string, min: number): number {
  const result = number(
    value,
    path,
    min,
    Math.floor(Number.MAX_SAFE_INTEGER / 100000),
  );
  if (Math.abs(result * 100 - Math.round(result * 100)) > 1e-7)
    throw new Error(`${path} 最多保留两位小数。`);
  return result;
}
function list(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max)
    throw new Error(`${path} 必须包含 1–${max} 项。`);
  return value;
}
function words(value: unknown, path: string, max: number): string[] {
  const result = list(value, path, max).map((v, i) =>
    text(v, `${path}[${i}]`, 100),
  );
  if (new Set(result).size !== result.length)
    throw new Error(`${path} 不可重复。`);
  return result;
}
function color(value: unknown, path: string): string {
  const result = text(value, path, 7);
  if (!/^#[\da-f]{6}$/i.test(result))
    throw new Error(`${path} 需为 #RRGGBB 色值。`);
  return result;
}
function keys(value: Record<string, unknown>, allowed: string[], path: string) {
  const unknown = Object.keys(value).filter((k) => !allowed.includes(k));
  if (unknown.length)
    throw new Error(`${path} 包含未知字段：${unknown.join("、")}。`);
}

/** Validate at both browser and server import boundaries; return independent data. */
export function validateCatalog(input: unknown): Catalog {
  const raw = object(input, "catalog");
  keys(raw, ["version", "missions", "products"], "catalog");
  const version = id(raw.version, "catalog.version");
  const missions = list(raw.missions, "catalog.missions", 32).map(
    (entry, index): Mission => {
      const path = `catalog.missions[${index}]`,
        m = object(entry, path);
      keys(
        m,
        [
          "id",
          "name",
          "en",
          "query",
          "budget",
          "roles",
          "words",
          "color",
          "title",
          "subtitle",
        ],
        path,
      );
      const budget = number(
        m.budget,
        `${path}.budget`,
        1,
        Number.MAX_SAFE_INTEGER,
      );
      if (!Number.isSafeInteger(budget))
        throw new Error(`${path}.budget 需为整数。`);
      return {
        id: id(m.id, `${path}.id`),
        name: text(m.name, `${path}.name`),
        en: text(m.en, `${path}.en`),
        query: text(m.query, `${path}.query`, 500),
        budget,
        roles: words(m.roles, `${path}.roles`, 20),
        words: words(m.words, `${path}.words`, 30),
        color: color(m.color, `${path}.color`),
        title: text(m.title, `${path}.title`),
        subtitle: text(m.subtitle, `${path}.subtitle`, 500),
      };
    },
  );
  const missionIds = new Set(missions.map((m) => m.id));
  if (missionIds.size !== missions.length)
    throw new Error("catalog.missions 存在重复场景 ID。");
  const products = list(raw.products, "catalog.products", 1000).map(
    (entry, index): Product => {
      const path = `catalog.products[${index}]`,
        p = object(entry, path);
      keys(
        p,
        [
          "id",
          "name",
          "subtitle",
          "brand",
          "price",
          "category",
          "mission",
          "tags",
          "quality",
          "art",
          "color",
          "bid",
        ],
        path,
      );
      const mission = id(p.mission, `${path}.mission`);
      if (!missionIds.has(mission))
        throw new Error(`${path}.mission 引用了未知场景 ${mission}。`);
      return {
        id: id(p.id, `${path}.id`),
        name: text(p.name, `${path}.name`),
        subtitle: text(p.subtitle, `${path}.subtitle`, 500),
        brand: text(p.brand, `${path}.brand`),
        price: money(p.price, `${path}.price`, 0.01),
        category: text(p.category, `${path}.category`, 100),
        mission,
        tags: words(p.tags, `${path}.tags`, 20),
        quality: number(p.quality, `${path}.quality`, 0, 1),
        art: id(p.art, `${path}.art`),
        color: color(p.color, `${path}.color`),
        bid: money(p.bid, `${path}.bid`, 0),
      };
    },
  );
  if (new Set(products.map((p) => p.id)).size !== products.length)
    throw new Error("catalog.products 存在重复商品 ID。");
  for (const mission of missions)
    if (!products.some((p) => p.mission === mission.id))
      throw new Error(`场景 ${mission.id} 至少需要一件商品。`);
  return { version, missions, products };
}
