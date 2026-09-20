import type { Provider } from "./types";
export type SceneKind = "outfit" | "room";
export type ScenePreset = {
  id: string;
  kind: SceneKind;
  name: string;
  description: string;
  tags: string[];
  budget: number;
  colors: [string, string, string, string];
  shape: "tailored" | "relaxed" | "dress" | "compact" | "lounge";
};
export const scenePresets: ScenePreset[] = [
  {
    id: "outfit-linen",
    kind: "outfit",
    name: "亚麻午后",
    description: "米白上装、沙色长裤与自然配饰",
    tags: [
      "minimal",
      "natural",
      "warm",
      "casual",
      "极简",
      "自然",
      "温暖",
      "休闲",
    ],
    budget: 650,
    colors: ["#eee8d8", "#b7aa8c", "#706754", "#f3efe4"],
    shape: "relaxed",
  },
  {
    id: "outfit-city",
    kind: "outfit",
    name: "都市剪影",
    description: "炭灰夹克、深色长裤与黑色鞋履",
    tags: ["minimal", "work", "dark", "formal", "极简", "通勤", "深色", "正式"],
    budget: 980,
    colors: ["#535650", "#303734", "#272c29", "#e4e5de"],
    shape: "tailored",
  },
  {
    id: "outfit-sage",
    kind: "outfit",
    name: "鼠尾草日记",
    description: "浅绿针织、奶油长裤与轻便鞋履",
    tags: [
      "natural",
      "green",
      "casual",
      "relaxed",
      "自然",
      "绿色",
      "休闲",
      "轻松",
    ],
    budget: 520,
    colors: ["#8d9c84", "#eee8d8", "#b5a991", "#eef1e8"],
    shape: "relaxed",
  },
  {
    id: "outfit-evening",
    kind: "outfit",
    name: "暮色礼服",
    description: "酒红裙装与深色鞋履",
    tags: ["party", "dress", "elegant", "red", "晚宴", "裙装", "优雅", "红色"],
    budget: 1200,
    colors: ["#86595e", "#704b52", "#463738", "#efe6e3"],
    shape: "dress",
  },
  {
    id: "outfit-blue",
    kind: "outfit",
    name: "蓝调周末",
    description: "雾蓝上装、深蓝长裤与白色鞋履",
    tags: ["blue", "casual", "cool", "weekend", "蓝色", "休闲", "冷色", "周末"],
    budget: 430,
    colors: ["#839eac", "#4e6273", "#ecebe6", "#e8edef"],
    shape: "relaxed",
  },
  {
    id: "room-oat",
    kind: "room",
    name: "燕麦客厅",
    description: "奶油沙发、浅木地板、暖白墙面与圆形茶几",
    tags: [
      "minimal",
      "natural",
      "warm",
      "wood",
      "极简",
      "自然",
      "温暖",
      "木质",
    ],
    budget: 7800,
    colors: ["#e9e3d5", "#c3b79e", "#dacdb4", "#f4efe4"],
    shape: "lounge",
  },
  {
    id: "room-sage",
    kind: "room",
    name: "绿意小宅",
    description: "鼠尾草沙发、紧凑布局与绿色植物",
    tags: [
      "small",
      "green",
      "natural",
      "compact",
      "小户型",
      "绿色",
      "自然",
      "紧凑",
    ],
    budget: 4600,
    colors: ["#87987f", "#ded6bd", "#c9b792", "#eeeede"],
    shape: "compact",
  },
  {
    id: "room-city",
    kind: "room",
    name: "城市艺廊",
    description: "深灰沙发、石色地毯与简洁艺术墙",
    tags: ["modern", "dark", "minimal", "art", "现代", "深色", "极简", "艺术"],
    budget: 9500,
    colors: ["#636965", "#b2b0a5", "#9c8b73", "#dedfd7"],
    shape: "lounge",
  },
  {
    id: "room-clay",
    kind: "room",
    name: "陶土暖居",
    description: "陶土沙发、暖色地毯与木质茶几",
    tags: ["warm", "earth", "cozy", "art", "温暖", "大地色", "舒适", "艺术"],
    budget: 6200,
    colors: ["#b8836f", "#d1bb9a", "#b0936d", "#f1e6d7"],
    shape: "compact",
  },
  {
    id: "room-blue",
    kind: "room",
    name: "海盐留白",
    description: "浅蓝沙发、象牙色地毯与明亮墙面",
    tags: ["blue", "bright", "cool", "minimal", "蓝色", "明亮", "冷色", "极简"],
    budget: 5700,
    colors: ["#8fa7b1", "#e5dfd1", "#c8bea7", "#edf0eb"],
    shape: "compact",
  },
];
export type SceneDecision = {
  kind: SceneKind;
  query: string;
  budget: number;
  provider: Provider;
  model: string;
  modelCalls: number;
  elapsedMs: number;
  modelMs: number;
  createdAt: string;
  rows: {
    id: string;
    relevance: number;
    fit: number;
    score: number;
    affordable: boolean;
  }[];
  selectedId: string | null;
};
