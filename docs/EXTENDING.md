# 扩展 RecJev

## 开发环境

```bash
npm ci
npm run dev
```

React / Vite 提供界面，Node 在同一端口提供 `/api/*`。`npm run format` 统一代码排版；`npm run build` 做 TypeScript 检查并生成静态资源；`npm start` 服务构建结果。Python worker 是可选组件，规则与云端路径不依赖 Torch。

## 添加商品与生活场景

`src/data.ts` 导出商品、场景和默认配置；类型在 `src/types.ts`。

商品需要稳定 `id`、场景、名称、描述、价格、类别、标签和用于演示的质量分 / 出价。价格单位是人民币元，目录 ID 是反馈与评价连接的主键。新增场景时同步 `MissionId`、场景词、目标类别 `roles` 与界面图标映射。目标类别定义了需求覆盖，应由任务需求确定，不能为让算法获胜事后修改。

照片放入 `public/photos/`，在 `src/photo-assets.json` 加入类别映射、来源页、作者和许可，在 `THIRD_PARTY_NOTICES.md` 保留署名。没有授权的商品照片不要直接复制。未匹配摄影类别时 `src/Art.tsx` 使用 SVG。

换成真实目录时，先分离库存 / 价格更新与离线研究快照；缺货、预算、地区可售等条件应在评分前过滤，并在生成后再次检查。当前目录是代码内静态数据，没有库存接口。

## 替换召回与组合算法

`server/engine.ts` 分为 `recall`、`rank`、`buildSlate` 与 `auction`。可以将 BM25 替换为向量召回或双路召回，保持候选 ID 与分数来源可追踪。比较评分器时，先固定召回结果，否则无法区分召回变化与评分改进。

`buildSlate` 当前包含逐件贪心和宽度 40 的 beam。新增 MMR、整数规划或学习策略时，应共用预算、排除、固定、最大件数约束。界面中的商品顺序要明确：目前按单品分展示，评价 NDCG 也使用这一顺序。

## 添加评分器

实现 `server/engine.ts` 导出的 `Decider`：

```ts
(c, items, lexical, mission) =>
  Promise<{
    evidence; // 每个候选恰好一条，有来源的 0..1 relevance / affinity
    model; // 服务实际返回的版本
    usage; // 没有可靠数据时使用 null
    rawAnswers; // 可审计的原始模型结果，不含凭证
    latency; // 实际等待时间，ms
    calls; // 真实请求数
  }>;
```

然后扩展 `Provider` 类型、`server/index.ts` 的连接与路由，以及 `src/ModelPanels.tsx` 的入口。已有通用协议见 `server/providers.ts`；官方 Jev 单独保存在 `server/jev.ts`。新接口必须检查完整候选、重复 ID、分数范围与异常；禁止失败后偷偷用规则分数顶替。

当前每种协议保存一路连接，最多选择 4 路对照；要比较两个不同 GPT 模型，需要将配置从 provider 主键改为具名 profile ID，并让结果记录协议与 profile ID。不要把模型名当唯一身份。

## API 边界

| 接口                 | 用途                                 |
| -------------------- | ------------------------------------ |
| `GET /api/status`    | 配置、已验证状态与运行锁，不返回 Key |
| `POST /api/connect`  | 设置 / 清除模型连接                  |
| `POST /api/generate` | 生成当前配置的组合与证据             |
| `POST /api/compare`  | 同一配置的 2–4 路独立模型结果        |
| `POST /api/evaluate` | 12 个固定案例中的两种组合算法        |

`generate` 使用 `Config`；`compare` 接收 `{config, providers}`；`evaluate` 接收 `{provider, seed}`。错误响应为 `{error}`，模型对照中每路有独立 `error` 字段。前端展示上一次成功结果时会标记，不能把旧结果称为新配置的输出。

## 数据与实验

人工 qrels、案例和指标位于 `server/evaluation.ts`。新增数据集应记录来源、使用许可、抽样和划分方式；用户行为数据按用户 / 时间划分，避免泄露。调整 rubric 后同时更新 `VERSION`，报告保存逐案例候选、结果、标签和运行配置。

运行 `npm test`、`npm run build`、`npm run evaluate`。本地模型验证见 [模型指南](MODELS.md)，不放入默认 CI 下载多 GB 权重。提交性能改动时附硬件、精度、batch、预热、重复次数和失败信息。

## 界面与部署

布局使用 CSS grid 与断点，内容列设置 `min-width: 0`，长模型名允许换行，表格在容器内滚动。检查 320、390、768、1024、1440 宽度及缩放后的有效 CSS 宽度，同时检查弹窗、候选展开与实验结果；不要依赖隐藏横向溢出掩盖问题。

服务默认只监听回环地址。公开 GitHub 仓库不等于公开多用户服务。需要部署到互联网时，先实现身份认证、会话隔离、调用配额、持久化策略与 TLS，再配置监听地址；当前全局连接和运行锁适用于本机单用户演示。
