# 第三方资源与许可

原创应用代码采用 MIT。以下照片分别遵循原有许可，不能将它们当作 MIT 资产。网页将图片缩放、裁切用于类别参考；虚构商品名称和价格不表示照片中的实物在售，也不表示品牌或作者背书。

| 文件                       | 作者                    | 来源                                                                                                    | 许可                                                           |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| public/photos/tent.jpg     | © Vyacheslav Argenberg | [原始页面](https://commons.wikimedia.org/wiki/File:Zagedan_Ridge,_Camping_tent,_Caucasus_Mountains.jpg) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)       |
| public/photos/chair.jpg    | PsamatheM               | [原始页面](https://commons.wikimedia.org/wiki/File:Helinox_Ground_Chair_1.jpg)                          | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| public/photos/lantern.jpg  | TaurusEmerald           | [原始页面](https://commons.wikimedia.org/wiki/File:Enbrighten_LED_Camping_Lantern.jpg)                  | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| public/photos/bottle.jpg   | Gannu03                 | [原始页面](https://commons.wikimedia.org/wiki/File:Stainless_Steel_Water_Bottle.jpg)                    | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| public/photos/keyboard.jpg | Anirban Saha            | [原始页面](https://commons.wikimedia.org/wiki/File:Beautiful_Mechanical_Keyboard.jpg)                   | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| public/photos/tray.jpg     | Jberkel                 | [原始页面](https://commons.wikimedia.org/wiki/File:Tray_with_espresso_cups.jpg)                         | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |

图片已转换为 JPEG 并缩放，页面按容器裁切。CC BY-SA 图片及其图片衍生物保留相同许可；应用代码的许可独立。完整来源元数据保存在 src/photo-assets.json。

## 快速决策参考

[SemIf](https://github.com/TheoLeeCJ/SemIf)（MIT）提供直接候选 logits、状态前缀复用与并行后缀评分的公开方法。local/serve.py 参考其算法分工，采用独立实现；未复制上游源码。项目不复现 TypeSafe 未公开的训练方法。

MiniCPM5-2B 权重不随仓库分发，使用前请查看 [模型原始仓库及其许可](https://huggingface.co/openbmb/MiniCPM5-2B)。Jev 是 TypeSafe 的服务，与本项目无隶属关系。
