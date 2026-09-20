# AgenticJev 方向调研：快速结构化决策 × 生成式组合推荐

核验日期：2026-09-20。检索范围包括 Google、TypeSafe 官方文档和官方 GitHub 组织、GitHub 搜索与社区索引，以及直接相关的推荐研究仓库。网页资料会变化；这是有范围的调研，不代表穷尽整个互联网。

## 1. 核心判断

**推荐方向：会话式意图购物 + 受约束的商品组合生成 + 可检查的搜广推实验。**

Jev 擅长在限定答案空间中回答具体语义问题。把用户需求与候选商品放进 state，让它判断“是否有用”“是否契合偏好”；由代码执行数值约束、搜索与展示。不要让它做预算加总，也不要把它当普通聊天模型逐字生成推荐文案。

这比“又一个搜索框”更有可玩性：用户能改变任务、表达喜欢、排除或固定商品，直观看见下一轮组合变化。比一开始训练端到端大推荐模型更适合快速验证：无需用户日志或 GPU，能够先建可复现实验界面。

**技术路线声明**：本项目的生成对象是有约束的商品集合（slate / bundle），生成器是 beam search，Jev 是可替换的语义评分器。未训练生成式推荐网络，未复现 HSTU / TIGER，不宣称学术首创。当前只是可验证假设的原型。

## 2. 官方已确认事实

| 官方来源                                                                | 核验结论                                                    | 实现含义                                  |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| [介绍](https://docs.typesafe.ai/introduction)                           | Jev 是 TypeSafe 的 System One 模型                          | 使用官方服务语义而非普通 chat API         |
| [HTTP API](https://docs.typesafe.ai/api)                                | POST `/v1/systemone`；输入 state / questions / model        | SDK 仅在 Node 后端调用                    |
| [Noul](https://docs.typesafe.ai/primitives/noul)                        | 返回回答 yes 的概率                                         | 每件候选的语义相关性                      |
| [Score](https://docs.typesafe.ai/primitives/score)                      | 有序标准上的概率加权值；0 起始级别                          | 三档偏好评分除以 2 归一化                 |
| [Choice](https://docs.typesafe.ai/primitives/choice)                    | 有限选项概率分布，最多 255 个选项                           | 后续可做下一步动作选择；首版未调用        |
| [模型](https://docs.typesafe.ai/models)                                 | 当日 `jev-latest` 指向 `jev-1.13.0`；文本输入；英语表现较好 | 记录返回版本；中文电商效果需另测          |
| [模型限制](https://docs.typesafe.ai/model-jaggedness/jev-1.13)          | 数学精度、间接引用、无关长上下文、生成文本有局限            | 短名单、直接索引、代码掌管预算            |
| [官方重排 cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe) | BM25 30 条短名单，Jev 判断 query-candidate 相关性           | 借鉴两阶段检索，不照搬其法律检索成绩      |
| [并行问题](https://docs.typesafe.ai/patterns/fan-out)                   | 一次输入多问题，由程序使用相应结果                          | 默认 24 件 × 2 问题一批；更多候选分批请求 |
| [置信度](https://docs.typesafe.ai/confidence)                           | Confidence 与问题答案概率不同                               | 仅把 Score confidence 归属到偏好评分      |
| [JS SDK](https://github.com/typesafe-ai/typesafe-sdk-js)                | 官方 TypeScript/JavaScript SDK，MIT                         | 首版安装使用 0.6.0                        |
| [Python SDK](https://github.com/typesafe-ai/typesafe-sdk-python)        | 官方 Python SDK，MIT                                        | 后续训练 / 评测可用                       |

当日模型页标价为每百万输入 token $0.042，输出免费；速率和价格可能调整。本原型只记录服务返回 usage，不把此静态价格写成真实账单，不展示凭空估算的“节省费用”。官方宣传的速度倍率不作为本项目实测结论。

截至核验日未找到 TypeSafe 官方公开 Jev 训练权重的发布。官方 SDK、普通 LLM 适配器以及社区推理 / 训练复现应分别看待，不能叫作官方 Jev 开源模型。

## 3. 最相关的开源生态

以下已检查仓库描述 / README；许可来自 GitHub 当日元数据。下表不将上游自报性能当成本项目成绩。

| 项目                                                                                                       | 用途与价值                                                                              | 在本项目中的位置                                                                 |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [TheoLeeCJ/SemIf](https://github.com/TheoLeeCJ/SemIf) · MIT                                                | 原名 OpenJev；MiniCPM5-2B / Qwen3.5，候选 logits、共享前缀、批量后缀推理                | 本地 MiniCPM worker 的方法参考；已用真实权重验证，未复现 TypeSafe 训练           |
| [typesafe-ai/system-one-adapter-python](https://github.com/typesafe-ai/system-one-adapter-python) · MIT    | 普通 LLM API 实现同类 System One 接口；支持 OpenAI 兼容 / Anthropic                     | 接口设计参考；本项目已独立实现 OpenAI 兼容与 Claude 原生评分，未引入此适配器依赖 |
| [hotchpotch/jev-reranker](https://github.com/hotchpotch/jev-reranker) · MIT                                | Jev 判断文档相关性和证据价值                                                            | 最直接的检索重排参照                                                             |
| [superagents-lab/jev-search](https://github.com/superagents-lab/jev-search) · MIT                          | 搜索结果评分、分组与去重                                                                | 搜索应用参照                                                                     |
| [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast) · MIT                            | 动态动作候选空间，一次请求多项判断                                                      | 借鉴快速窄决策循环，而非浏览器自动化功能                                         |
| [mrnugget/jev-shell-history](https://github.com/mrnugget/jev-shell-history)                                | 对历史命令即时打分补全                                                                  | 交互式重排参考；未复制代码，未确认许可                                           |
| [arnabgho/rlcd-lite](https://github.com/arnabgho/rlcd-lite) · Apache-2.0                                   | 社区尝试 constrained decoding、GRPO、Brier reward 与校准评测                            | 可以研究本地决策器；README 明确不是 TypeSafe 算法，不能声称等价 Jev              |
| [yibie/awesome-jev](https://github.com/yibie/awesome-jev)                                                  | 分类索引，包含 scoring / ranking 和 research 项目                                       | 用来发现候选，事实再回原仓库核查                                                 |
| [RUCAIBox/RecBole](https://github.com/RUCAIBox/RecBole) · MIT                                              | 多类推荐算法、标准数据与评价流程                                                        | 后续建立传统推荐基线，尚未集成                                                   |
| [recommenders-team/recommenders](https://github.com/recommenders-team/recommenders) · MIT                  | 召回、排序和指标实践                                                                    | 数据准备、离线评价方法参考                                                       |
| [google-research/recsim](https://github.com/google-research/recsim) · Apache-2.0                           | 用户状态与连续推荐交互仿真                                                              | 后续多轮会话实验参考；依赖老旧，不直接拖进首版                                   |
| [meta-recsys/generative-recommenders](https://github.com/meta-recsys/generative-recommenders) · Apache-2.0 | HSTU 序列建模，论文 [Actions Speak Louder than Words](https://arxiv.org/abs/2402.17152) | 说明学术生成式推荐主线，与本项目路线区分                                         |

## 4. 三个可发表性待检验的研究问题

### H1：任务覆盖是否比单品相关性更接近用户选择？

固定候选池、预算、评分器与展示位置策略，比较逐件排序、MMR、约束 beam search，测量用户对整套方案的接受率、缺失需求、替换次数与完成任务所需轮数。首版仅实现逐件排序和 beam search 的合成对照，不足以支持用户体验结论。

### H2：快速判断是否能支持更高频率的反馈闭环？

在同一份盲测标注集上比较 Jev、传统 cross-encoder、小模型 / 普通 LLM。报告相关性质量、响应 p50/p95、失败率、实际 token、同预算可完成的交互轮数。对英文与中文、长短商品描述、同义词与否定条件分层评测。不能用规则基线的几毫秒冒充 Jev 推理延迟。

### H3：带明确体验约束的赞助推荐能否减少对用户任务的伤害？

固定广告预算和流量，加入相关性门槛、频控、品类排斥及任务完成约束。研究体验与收益的 Pareto 曲线。需要真实点击 / 曝光或明确的仿真用户模型，不能将 Noul 当 pCTR，也不能将固定模拟广告出价当真实收益。

## 5. 已实现与下一阶段

**已实现**：可玩的四场景购物页、合成商品池、BM25 + 场景召回、规则 / Jev / GPT 兼容 / Claude / MiniCPM 候选 logits 评分、预算约束组合、反馈、独立广告竞价、对照页、JSON 导出、测试与响应式界面。

**下一阶段建议按此顺序**：

1. 先用真实 Key 做 100 条中英文意图 × 商品人工标注测试，测相关性与误差，保存版本和问题模板；保留隐藏测试集。
2. 使用获授权电商目录或标准研究数据替换合成商品，补足品牌、属性、库存等约束；离线拆分按用户 / 时间进行，避免泄露。
3. 加入传统 reranker、MMR，并为已有普通 LLM 接口补盲测数据，并分开记录召回覆盖、评分能力和组合优化的贡献。
4. 收集经同意的多轮交互与整套接受标签；比较冷启动、兴趣漂移、喜欢 / 排除及反事实失败案例。
5. 再研究可学习的组合策略、生成式 item ID 模型或社区本地 RLCD；别用早期合成样本预设优势。

本地推理细节、SemIf 的可借鉴部分及完整实测边界见 [模型指南](MODELS.md)。先验证评分质量与交互收益，再按规模引入检索索引和吞吐基础设施。

## 联网决策与论文检索

0.3.0 增加 GitHub、Hacker News、Crossref、Europe PMC、Search1API 与 Brave 来源，以及候选快照、来源去重、模型对照、反馈重排和实测耗时大盘。这里不预设检索质量提升，关键词基线、语义相关性和事实正确性需分别评估。

- [superagents-lab/jev-search](https://github.com/superagents-lab/jev-search) 展示 Search1API 检索与 Jev 重排。它是社区项目，不是 TypeSafe 官方搜索产品。
- [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast) 含航班检索示例，从观察到的 DOM 选择操作与目标。作者报告的单次约 7.1 秒不能当成通用延迟；本项目没有实现浏览器操作或订票。
- [savka777/jev-search](https://github.com/savka777/jev-search) 的片段相关性过滤与证据计时值得参考；仓库所报性能未在此复现。
- [zhuyansen/jev-search-rerank-eval](https://github.com/zhuyansen/jev-search-rerank-eval) 提醒注意模型裁判循环与混合排序。应使用独立人工标签检验收益。

论文来源返回的是题录与可用摘要；DOI 去重不合并拥有不同 DOI 的版本，开放获取标记依赖来源。检索能力与文献质量评估、全文阅读是不同问题。完整边界见 [SEARCH.md](SEARCH.md)。
