import rawCatalog from "./catalog.json";
import { validateCatalog } from "./catalog";
import { algorithmSettings } from "./settings";
import type { Config } from "./types";

export const catalog = validateCatalog(rawCatalog);
export const { missions, products } = catalog;
export const defaultConfig: Config = {
  query: missions[0].query,
  mission: missions[0].id,
  budget: missions[0].budget,
  ...algorithmSettings.defaults,
  provider: "baseline",
  likes: [],
  dislikes: [],
  locked: [],
};
