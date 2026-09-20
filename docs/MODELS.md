# 模型接入与快速决策

AgenticJev 将所有模型接到同一个候选评分边界，后续排序、预算和组合算法保持一致。不同入口的数值含义不同，不能只看百分数比较置信度。

## Jev 到底快在哪里？

Jev 是 TypeSafe 提供的决策模型。SDK 是访问服务的客户端；“候选问题 → 结构化结果”的接口形式可以被其他模型实现，但接口相似不意味着模型相同。

有限答案空间允许省去自由文本生成与解析；一份状态包含多个问题，也能减少请求往返。官方服务还涉及其模型训练与推理实现，公开资料不足以将它的速度归因到某一个技巧，或断言所有问题只用一次 forward。AgenticJev 不复现这些未公开部分。

[SemIf](https://github.com/TheoLeeCJ/SemIf)（MIT，原名 OpenJev）提供另一条可检查的路线：普通小模型、直接候选 logits、公共前缀 KV 复用、批量后缀推理。本项目据此独立实现 MiniCPM worker，未引入 SemIf 运行时依赖。它复用的是推理思路，不是 Jev 权重与训练。

## 五种入口的区别

| 入口              | 返回值                               | 置信度如何处理             |
| ----------------- | ------------------------------------ | -------------------------- |
| 规则基线          | 词法与标签公式                       | `confidence: null`         |
| Jev               | Noul yes 概率、三档 Score 的期望分   | 单独保留 Score confidence  |
| GPT / OpenAI 兼容 | 模型生成的 relevance / affinity 数值 | 自评分，`confidence: null` |
| Claude 原生       | Messages 文本中的同一 JSON 结构      | 自评分，`confidence: null` |
| MiniCPM           | A/B 或 A/B/C 候选 token 条件 softmax | 未校准，`confidence: null` |

所有模型分数均不能直接当作真实 CTR / CVR。广告模拟使用单独的固定 pCTR 公式。

## 连接配置

在网页右上角「模型连接」选择协议，填写后保存。Key 只留在 Node 服务内存，状态接口只返回配置状态、模型名与地址；更改连接不会沿用旧 Key。所有标签页共享连接和运行锁。服务重启会清除配置；Jev 也支持 `.env` 中的 `TYPESAFE_API_KEY` 与 `JEV_MODEL`。

| 入口        | Base URL                                 | 路径与限制                                      |
| ----------- | ---------------------------------------- | ----------------------------------------------- |
| Jev         | `https://api.typesafe.ai/v1/systemone`   | 官方 SDK；15 秒超时，无自动重试                 |
| OpenAI 兼容 | `https://api.openai.com/v1` 或自己的地址 | 补 `/chat/completions`；需支持 JSON object 输出 |
| Claude      | `https://api.anthropic.com/v1`           | 补 `/messages`；原生 `x-api-key`                |
| MiniCPM     | `http://127.0.0.1:8788`                  | 补 `/score`；只接受回环地址                     |

模型 ID 使用账号实际可用的名称。云端通用接口 60 秒超时，本地 worker 180 秒；超时、缺失候选、未知 ID、重复 ID、越界数值或非法 JSON 都会返回错误。模型对照逐路保留失败，不静默切换规则成绩。HTTP 仅允许回环地址，远程地址必须 HTTPS；禁止地址中携带 Key 与跟随重定向。

保存不会发请求。生成方案、反馈动作、模型对照和所选模型的 12 案例实验会发送当前意图、候选描述及喜欢 / 排除商品。预算等数值约束不依赖模型执行。

## MiniCPM worker

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r local/requirements.txt
python local/serve.py --device auto --mode shared --batch-size 4
```

模型为 [openbmb/MiniCPM5-2B](https://huggingface.co/openbmb/MiniCPM5-2B)，固定 revision `12a3808a956f869c767195e9266b59c4d21d92e2`。首次使用下载约 5 GB 权重；缓存由 Hugging Face 管理，可用 `HF_HOME` 指定位置。已有缓存可加 `--local-files-only`。CPU 使用 float32，CUDA / MPS 使用 float16；默认 eager attention 兼容所测 MPS 环境，未启用 FlashAttention 或量化。

每件候选有两个问题：

- 相关性：A 不相关，B 相关，按 `[0, 1]` 加权。
- 偏好契合：A 冲突，B 中性 / 无证据，C 契合，按 `[0, 0.5, 1]` 加权。

worker 将完整意图与候选放在公共状态中，用不同问题构成 prompt，并验证每个答案字母在实际回答边界为单 token。`fresh` 批量计算完整 prompt；`shared` 找公共 token 前缀、预填 KV，再复制缓存、批量计算不同后缀。两条路径均取最后有效位置的 hidden state，只投影候选词表行，不生成答案文本。

默认每批 4 个后缀，允许 1–8；单个 prompt 超过 4096 token 直接报错，不静默截断。导出包含提示文本 hash、候选概率、模型 revision、逻辑输入 token、生成 token、forward 次数和计时。`usage.input_tokens` 是各完整 prompt 的逻辑 token 总和，不是 KV 复用后的物理计算量或云端计费 token。

## 已有真实运行记录

环境：macOS、MPS、float16、PyTorch 2.6、eager attention。以下都是单次运行证据，不是速度排行榜。

| 样本                  | 路径   | 公共前缀 | forward 次数 | 评分时间 | 生成 token |
| --------------------- | ------ | -------: | -----------: | -------: | ---------: |
| 2 候选 × 2 问题       | fresh  |        0 |            1 |  3.141 s |          0 |
| 同上                  | shared |      132 |            2 |  1.487 s |          0 |
| 完整 24 候选 × 2 问题 | shared |    1,334 |           13 | 16.062 s |          0 |

完整请求从 Node 等待 worker 约 **38.184 s**，其中加载约 **18.975 s**；其余还包含首次依赖导入、传输等。两候选实验先跑 fresh、后跑 shared，存在预热与顺序影响，不能据此宣称加速倍率。

小样本的相同 prompt hash、分数方向与边界符合预期；两路径最大概率差约 0.00246，并非位级相同。帐篷相关性约 0.80，键盘仍约 0.58；偏好分偏高。这暴露了判别能力与校准问题，不能当作推荐质量已验证。原始数据：[读出样本](local-probe.json)、[完整推荐对照](local-comparison.json)。

复查已有缓存中的小样本：

```bash
python local/probe.py > probe.json
```

## 候选较多时

默认召回短名单为 24 件，配置的请求数量更大时会扩大候选池；模型适配层使用 `batchDecider` 依次处理每批 24 件。各批使用同一意图和完整喜欢 / 排除上下文，结果汇总保留真实调用数、用量与分批原始响应。任一批失败或模型版本变化，整个生成明确失败；不会混入规则分数。

更多候选意味着更多模型工作，界面里的“随心配”不表示推理时间与目录规模无关。自动模式优先使用配置的短名单；本地完整模型延迟仍见上表。

## 如何公平比较

先固定候选、意图、反馈、标签和组合规则，再区分两类问题：模型评分是否更好；推理组织是否更省。对同一模型的 fresh/shared 消融应交错运行顺序、分别预热、多次重复，并报告数值差异、p50/p95 和峰值内存。对不同模型则同时记录质量、失败、token、真实费用及模型版本；共享前缀并不自动意味着更准。

网页对照适合探索单案例。正式报告应使用独立人工标签、隐藏测试集与足够多案例；不能用页面上的覆盖率替代总体推荐质量。下一步可尝试中文指令适配、答案位置偏差测试、校准、量化或 MLX worker；它们目前尚未实现。

## 模型评分与联网检索

模型连接仅用于评分。联网由独立检索来源提供，免费论文来源无需模型 Key；使用 Jev / GPT / Claude / MiniCPM 时，它们评估同一候选快照的标题和摘要片段。原始响应、失败、请求数、版本与耗时分别保留；失败请求数不明时为 `null`。不将关键词基线耗时或其他模型耗时视为 Jev 性能。详见 [SEARCH.md](SEARCH.md)。
