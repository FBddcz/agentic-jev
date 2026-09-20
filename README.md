<div align="center">

# ✳️ RecJev · 拾意

### 少一点翻找，多一点「刚刚好」。

**🛍️ 可玩的搜广推实验室 · ⚡ Jev / 本地小模型 / 云端 API · 🆚 同场对照**

输入一个生活计划，生成一整套选择。喜欢、固定、换一件，让推荐跟着你的心意走。

[![Checks](https://github.com/FBddcz/rec-jev/actions/workflows/ci.yml/badge.svg)](https://github.com/FBddcz/rec-jev/actions)
[![Stars](https://img.shields.io/github/stars/FBddcz/rec-jev?style=flat&color=b5cf7b)](https://github.com/FBddcz/rec-jev/stargazers)
[![MIT](https://img.shields.io/badge/License-MIT-66824a.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22.12%2B-417e38?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-397e91?logo=react&logoColor=white)](https://react.dev/)

[🚀 快速上手](#quickstart) · [🧠 接入模型](#models) · [🧪 实验方法](docs/EVALUATION.md) · [🧩 二次开发](docs/EXTENDING.md) · [🗺️ 研究地图](docs/RESEARCH.md)

![拾意：真实运行的桌面界面](docs/desktop.png)

**拾一份心意，发现下一种可能。**

喜欢这种把研究做成可玩应用的方式？点一颗 **⭐ Star**，一起把它变得更好。

</div>

## ✨ 打开拾意，你能做什么？

- 🎮 **没有 Key，也能玩**：内置规则基线，安装后即可探索 48 件合成商品，模型调用数明确为 0。
- 🎒 **生成一整套**：从候选池组合最多 4 件好物，同时考虑意图、偏好、需求覆盖和整套预算。
- 💚 **边玩边改变推荐**：喜欢表达偏好，固定保留心仪商品，换一件排除不合适的选择。
- 🔎 **把搜广推串起来**：BM25 与场景召回 → 语义评分 → 组合生成 → 独立模拟赞助位。
- 🧠 **多模型入口**：官方 Jev、GPT / OpenAI 兼容接口、Claude 原生接口、本地 MiniCPM5-2B。
- ⚡ **试试小模型快速决策**：借鉴 [SemIf](https://github.com/TheoLeeCJ/SemIf)，读取候选 token logits，复用公共前缀 KV，批量处理问题后缀。
- 🆚 **同一个计划，2–4 路对照**：查看各路组合、实际模型版本、请求耗时和评分来源，带走完整 JSON。
- 📷 **实拍与插画切换**：6 类授权摄影作为类别参考，其他类别使用原创 SVG；离线也能显示。
- 📱 **随屏幕重排**：桌面、平板、手机和窄窗口均有布局；允许浏览器缩放。

商品名、价格、质量和广告出价是合成演示数据。摄影是类别参考，不是这些虚构商品的实售照片；没有下单或真实广告扣费。照片作者及许可见 [素材声明](THIRD_PARTY_NOTICES.md)。

<details>
<summary>📱 看看手机界面</summary>

<img src="docs/mobile.png" alt="拾意手机尺寸界面" width="375" />

</details>

## 🎯 四个小计划，一套完整闭环

| 场景          | 试着改变什么？                       |
| ------------- | ------------------------------------ |
| 🏕️ 周末轻露营 | 更低预算、轻量装备、固定一把椅子     |
| 🖥️ 理想办公桌 | 喜欢安静与自然材质，换掉不合适的键盘 |
| 🚶 城市漫游   | 在通勤便携与风格之间取舍             |
| ☕ 在家咖啡馆 | 组合器具、收纳和饮用体验             |

<a id="quickstart"></a>

## 🚀 三分钟，把实验室开起来

准备 **Node.js 22.12+** 和 Git。首次安装需要联网，规则基线随后可离线运行。

```bash
git clone https://github.com/FBddcz/rec-jev.git
cd rec-jev
npm ci
npm run build
npm start
```

打开 **[http://127.0.0.1:8787](http://127.0.0.1:8787)** → 选择生活计划 → 保持「本地规则」→ 点击 **生成我的方案**。🎉

修改代码用 `npm run dev`。服务只监听本机；手机尺寸适配不等同于已开放局域网访问。购物偏好保存在页面内，刷新后重置；模型连接保存在本机服务内存，重启后清除。

<a id="models"></a>

## 🧠 给推荐接上不同的大脑

| 入口                   | 如何决策                     | 需要什么                             |
| ---------------------- | ---------------------------- | ------------------------------------ |
| 🎮 本地规则            | 词法、场景、标签与质量公式   | 无 Key / GPU                         |
| ⚡ TypeSafe Jev        | 官方 Noul / Score 语义判断   | TypeSafe 访问权限与官方 Key          |
| 🌐 GPT / 兼容 API      | 生成 JSON 候选自评分         | Base URL、模型 ID、所需 Key          |
| 🟠 Claude 原生         | Anthropic Messages 生成评分  | Anthropic Key、可用模型 ID           |
| 🍎 MiniCPM 直读 logits | 单 token 答案读出 + 前缀复用 | Python 3.11+、推理依赖、约 5 GB 权重 |

右上角 **模型连接** → 选择入口 → 填写并保存 → 在 **决策引擎** 中选择对应模型。保存不会发起模型请求；生成、喜欢、固定、换一件和模型实验会调用所选服务。

Key 不写入浏览器存储、导出、日志或仓库。更换云端连接需要重新填写 Key。普通模型分数、MiniCPM 的未校准条件 softmax 与 Jev 返回值分别标记。

### ⚡ 官方 Jev

到 [TypeSafe](https://typesafe.ai) 申请访问，获准后在 [控制台](https://console.typesafe.ai) 创建 Key。默认模型为 `jev-latest`；实验请记录实际返回版本。官方地址固定为 `https://api.typesafe.ai/v1/systemone`，使用官方 JavaScript SDK。

每个候选有两个问题：**是否与意图相关、是否契合偏好**。最多 24 件商品，共 48 个问题合并成一次 API 请求。预算、去重和组合约束由代码处理。也可复制 `.env.example` 为 `.env` 配置 Jev。

### 🍎 本地 MiniCPM5-2B

在另一个终端中运行：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r local/requirements.txt
python local/serve.py --device auto
```

Windows PowerShell 用 `.venv\Scripts\Activate.ps1` 激活环境。首次评分会下载并加载固定版本权重；已有缓存可加 `--local-files-only`。默认自动选择 CUDA、MPS 或 CPU。

网页中选择 **MiniCPM 直读 logits**，地址保持 `http://127.0.0.1:8788`，保存即可。`--mode fresh` 关闭前缀复用，`--mode shared` 启用共享前缀；`--batch-size` 控制后缀批量大小。

本地路径已经用真实权重完成小样本与完整推荐链路验证。它借鉴 SemIf 的推理组织方式，**没有复现 TypeSafe 的专有训练或 Jev 权重**。完整接入说明、原理与实测边界见 **[模型指南](docs/MODELS.md)**。

## 🆚 让结果说话

![规则与真实 MiniCPM 模型对照](docs/comparison.png)

*图中 MiniCPM 使用已加载权重，模型等待约 16.9 秒；它是独立的界面实测，不是官方 Jev 成绩。*

**对照实验** 页面提供两个独立入口：

1. **模型对照**：固定当前意图、预算、反馈与候选逻辑，选 2–4 路依次执行。失败单独展示，不填入替代成绩。
2. **组合算法对照**：12 个固定合成案例中，两种算法共用相同候选和评分，比较逐件贪心与 beam search。

```bash
npm test
npm run build
npm run evaluate
# 已配置官方 Key 时，下面会发起 12 次真实 Jev 请求：
node --env-file=.env --import tsx scripts/evaluate.ts --jev
```

规则评分下的合成样本（**0 次 Jev 调用**）：

| 策略     | 需求覆盖 | 预算满足率 | NDCG@4 | 合成效用 |
| -------- | -------: | ---------: | -----: | -------: |
| 逐件排序 |    54.2% |       100% |  0.641 |    0.618 |
| 组合生成 |     100% |       100% |  0.672 |    0.889 |

这组结果用于检验实现与指标。目标函数本身奖励覆盖，12 个手工案例不能证明真实业务收益，也不能证明某个模型更强。协议测试使用夹具；仓库没有预填真实 Jev、GPT 或 Claude 的成绩。

📊 [评价定义](docs/EVALUATION.md) · [规则原始结果](docs/baseline-results.json) · [MiniCPM 读出样本](docs/local-probe.json) · [本地完整对照](docs/local-comparison.json)

## 🔬 值得继续探索的方向

**Intent → Decisions → Slate → Feedback**：快速语义判断与可执行约束一起驱动会话推荐。

```text
意图 + 反馈 + 预算
        ↓
BM25 / 场景召回（48 → 最多 24）
        ↓
规则 / Jev / 普通模型 JSON / 本地候选 logits
        ↓
单品排序 ──→ 逐件贪心对照
        ↓
约束 Beam Search ──→ 最多 4 件商品的组合
        ↓
独立模拟赞助 → 展示 → 喜欢 / 固定 / 换一件 → 下一轮
```

这里的「生成式」是**从有限候选生成商品组合**。当前没有训练 HSTU / TIGER 或生成式 item ID 模型；后续可用同一界面接入它们，比较不同路线。

- 🎯 **更懂意图吗？** 在中英文、否定表达和跨场景意图上盲测相关性。
- ⏱️ **更适合即时交互吗？** 分开测质量、p50/p95 延迟、失败率、成本与替换轮数。
- 🧩 **哪些环节真正有用？** 消融候选打分、KV 复用、批处理和组合覆盖奖励。
- 🌱 **反馈能否改善下一轮？** 收集经同意的会话与整套接受标签，检验兴趣漂移和偏好校准。

## 🧩 从这里开始二次开发

| 想改什么               | 入口                                   |
| ---------------------- | -------------------------------------- |
| 商品、场景、默认偏好   | `src/data.ts`                          |
| 购物交互与响应式界面   | `src/App.tsx`、`src/styles.css`        |
| 模型连接与对照面板     | `src/ModelPanels.tsx`                  |
| 召回、排序、组合与广告 | `server/engine.ts`                     |
| Jev / 云端 / 本地协议  | `server/jev.ts`、`server/providers.ts` |
| MiniCPM 读出与前缀复用 | `local/serve.py`                       |
| 固定标签与评价指标     | `server/evaluation.ts`                 |

见 **[扩展指南](docs/EXTENDING.md)**、**[参与贡献](CONTRIBUTING.md)**。优先欢迎真实数据接入、传统 reranker / MMR 基线、可复现失败案例和无障碍改进。

## 🤝 致谢与同系列项目

感谢 [TypeSafe](https://github.com/typesafe-ai) 的官方文档与 SDK，以及 [TheoLeeCJ / SemIf](https://github.com/TheoLeeCJ/SemIf) 对小模型快速决策方法的开放探索。更多项目与来源见 [研究地图](docs/RESEARCH.md)。

🤖 **[EmbodiedJev · 行知](https://github.com/FBddcz/embodied-jev)** 探索具身行动，✳️ **RecJev · 拾意** 探索搜广推决策。把想法做成能玩、能测、能继续改的应用。

代码采用 [MIT License](LICENSE)。第三方照片保留各自许可，模型权重另受模型仓库条款约束；本仓库不分发权重。

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=FBddcz/rec-jev&type=Date)](https://star-history.com/#FBddcz/rec-jev&Date)

_图表由 Star History 动态生成，随仓库星标记录更新。_
