# 扩展 AgenticJev

## 开发环境

```bash
npm ci
npm run dev
```

React / Vite 提供界面，Node 在同一端口提供 `/api/*`。`npm run format` 统一代码排版；`npm run build` 做类型检查并构建静态资源。Python worker 独立可选，规则和云端路径不依赖 Torch。

## 先保存自己的实验条件

页面右上角「实验预设」支持命名保存、应用、删除、JSON 导入与导出。内容包括意图、预算、数量、喜欢 / 排除 / 固定、广告偏好和引擎选择。保存在当前浏览器，不包含 Key、接口地址或模型连接凭证；清除浏览器数据会清除预设，需长期保留时导出 JSON。

导入格式为 `{format: "agenticjev-preset-v1", name, config}`。服务端校验配置、商品 ID 和约束，未知商品不会悄悄换成其他商品。应用预设只修改页面条件，点击生成才执行。

`Config.maxItems` 可为任意安全正整数，或 `null` 表示自动搭配。旧 API 请求未提供该字段时默认 4。自动模式在配置的召回短名单上优化组合；显式请求更多件数时自动扩大召回，最多取现有可用商品。数量是上限，预算、偏好与候选可用性可能使实际结果更少。预算可以直接填写正整数，滑块只是快捷调节入口。

## 换商品、加场景

编辑 `src/catalog.json`，保留三个顶层字段：

```json
{
  "version": "my-catalog-v1",
  "missions": [],
  "products": []
}
```

上面的空数组只展示结构；实际文件需要至少一个场景和一件商品。复制现有条目开始改最方便。

| 数据 | 字段与作用                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| 场景 | `id`、`name`、`en`、`query`、`budget`、`roles`、`words`、`color`、`title`、`subtitle`                       |
| 商品 | `id`、`name`、`subtitle`、`brand`、`price`、`category`、`mission`、`tags`、`quality`、`art`、`color`、`bid` |

`mission` 引用场景 ID，`roles` 是任务要覆盖的商品类别，`words` 用于识别意图；目标类别应来自需求，不能为让指标更好而事后修改。商品 ID 是反馈与评价的连接主键。价格按元，最多两位小数；质量范围 0–1，出价为模拟数据。ID 必须唯一，颜色使用 `#RRGGBB`。

`src/catalog.ts` 在前后端导入时校验目录：缺失字段、未知字段、重复 ID、无效数字或场景引用会明确报错。新增场景不需要改 `MissionId` 或推荐算法；未知场景使用默认图标。`art` 对应 `src/photo-assets.json` 中的照片类别；也可直接用商品 ID 登记专属照片，优先于类别图片，无需改 React。

修改后**重启开发服务**，生产运行重新 `npm run build` 再启动，保证前后端使用同一配置。当前 JSON 目录适合小规模研究，校验容量为 32 个场景、1000 件商品；更大规模应在 `createEngine` 的召回边界接索引或数据服务，而非一次把整个目录送进模型。这是当前内存实现的容量保护，不是推荐件数限制。

实拍放入 `public/photos/`，在 `src/photo-assets.json` 登记来源、作者和许可，在 `THIRD_PARTY_NOTICES.md` 保留署名。每项包含 `src`、`title`、`author`、`page`、`license`、`licenseUrl`，可用 `position`（如 `50% 30%`）调整裁切焦点。图片加载失败显示“照片暂不可用”。真实库存、价格更新与研究快照应分开管理；缺货和地区可售等约束需要在召回前过滤、生成后复核。

## 改算法参数

`src/algorithm.json` 集中维护以下参数，校验规则在 `src/settings.ts`：

| 分组          | 用途                                                              |
| ------------- | ----------------------------------------------------------------- |
| `defaults`    | 默认数量、探索偏好、广告开关与广告权重                            |
| `retrieval`   | 候选数、场景加分、BM25 参数                                       |
| `baseline`    | 规则基线的相关性、质量、反馈标签权重                              |
| `ranking`     | relevance / affinity / quality 三个排序权重（和为 1），相关性门槛 |
| `slate`       | beam 宽度、需求覆盖奖励、重复类别惩罚、搜索计算预算               |
| `advertising` | 广告相关性门槛、合成 pCTR 与最低模拟 CPC                          |

`slate.searchBudget` 控制候选扩展的计算成本；达到预算会返回已找到的可行方案并明确提示，不保证全局最优。实验输出保存配置内容、目录版本和两个 SHA256 指纹，便于判断结果是否来自同一数据与参数。

## 创建独立研究实例

`createEngine(catalog, settings)` 将目录与参数绑定成独立实例：

```ts
import { createEngine } from "./server/engine";
import myCatalog from "./src/catalog.json";
import mySettings from "./src/algorithm.json";

const experiment = createEngine(myCatalog, mySettings);
const result = await experiment.generate({
  ...experiment.defaultConfig,
  query: "为周末挑一套轻便装备",
  maxItems: null,
});
```

它同时暴露 `validateConfig`、`recall`、`rank`、`buildSlate`、`auction`、`provenance`，可分别研究召回、评分与组合。默认模块导出仍绑定应用目录，方便现有调用使用。

## 替换评分器或组合策略

实现 `Decider(config, candidates, lexical, mission, feedback)`，返回 `evidence`、实际 `model`、`usage`、`rawAnswers`、`latency`、`calls`。`feedback` 包含当前实例目录中的喜欢和排除商品，避免串用内置目录。分数必须恰好覆盖候选且在 0–1 之间，评分来源与置信度不能伪装。

云端与 MiniCPM 的入口由 `batchDecider` 包装：每批最多 24 候选、顺序执行、完整汇总；任何批次失败或模型版本变化时整体报错。自定义 `Decider` 可以使用自己的批处理实现。已有协议在 `server/jev.ts`、`server/providers.ts`；新增协议还需扩展 `Provider`、连接路由和 `src/ModelPanels.tsx`。

替换 BM25、增加 MMR、整数规划或学习策略时，共用预算、排除、固定与展示顺序。当前每种协议保存一路连接；比较同协议多个模型时，可将 provider 主键扩为具名 profile ID。

## API 与测试

| 接口                        | 用途                                     |
| --------------------------- | ---------------------------------------- |
| `GET /api/status`           | 配置状态与运行锁，不返回 Key             |
| `POST /api/validate-config` | 校验并规范化 Config，不调用模型          |
| `POST /api/connect`         | 设置或清除模型连接                       |
| `POST /api/generate`        | 生成当前配置的组合与证据                 |
| `POST /api/compare`         | `{config, providers}`，2–4 路模型对照    |
| `POST /api/evaluate`        | `{provider, seed}`，固定 12 案例算法对照 |

固定评价使用 `server/fixtures/catalog-v1.json` 与 `algorithm-v1.json`，独立于应用的自定义配置。历史原始报告不因品牌或目录变更重写。新增数据集应保存独立人工标签、使用许可、采样与划分方式；用户行为按用户 / 时间划分。

运行 `npm test`、`npm run build`、`npm run evaluate`。测试覆盖自定义场景、反馈上下文、配置拒绝、自由件数、分批协议、约束与固定评测不受自定义数据影响。默认 CI 不下载模型权重，本地验证见 [模型指南](MODELS.md)。

## 界面与部署

检查桌面、平板、手机与缩放后的有效 CSS 宽度，覆盖预设弹窗、候选展开、长模型名和实验结果。不要通过隐藏横向溢出掩盖布局问题。

服务只监听回环地址，适合本机单用户研究。公开 GitHub 不等于公开多用户服务；互联网部署需先加入认证、会话隔离、配额、持久化策略与 TLS。当前多个标签页共享模型连接和运行锁。

## 联网搜索与语言界面

`server/search.ts` 负责真实来源请求、HTTP(S)/DOI 去重、来源合并、快照、关键词基线和复用模型评分。扩展来源时同步更新 `src/search-types.ts`、状态接口与适配器测试。搜索与购物共用模型协议，但问题模板按 `search` 域区分；详细接口见 [SEARCH.md](SEARCH.md)。

`src/i18n/en.json` 提供自然英文文案，中文为 UI 源文案；动态模板在 `src/i18n/index.ts`。JSX 边界只处理展示文字与无障碍属性，不改输入值、URL、JSON 证据或 `translate="no"` 内容。语言状态由全局共享 store 和 `useSyncExternalStore` 驱动，页面不因切换而重挂载。自定义 JSX runtime 属于应用代码，Vite 配置禁止将它预打包成另一份语言状态。新增页面需覆盖英中切换和窄屏检查。

## 单件替换与场景预览

`POST /api/replace` 验证当前组合 ID，临时保留其余商品，只寻找相同场景、相同类别、预算允许的替代品。成功时保持每个未替换商品的位置，临时约束不写入持久固定列表；失败保留原方案。喜欢和固定仅记录偏好，下一次显式生成才重排整套。自动搭配按场景需求类别选择，减少重复类别；用户自定数量仍可超过四件。冻结基准仍固定四件，不受自动搭配交互调整影响。

场景预览有独立的概念目录、预算与 API，不混入商品评测目录。渲染实现与能力边界见 [SCENES.md](SCENES.md)。
