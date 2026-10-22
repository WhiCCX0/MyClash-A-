# MyClash

> [!NOTE]
> 本仓库 **WhiCCX0/MyClash-A-** 基于 [AIsouler/MyClash](https://github.com/AIsouler/MyClash) 维护。以下先说明本 Fork 新增的 Claude 路由和自动更新功能；文档后半部分保留上游 MyClash 的原始使用说明。

## 本 Fork 的修改说明

**目标：** 在尽量保留 MyClash 原有 DNS、TUN、节点归类和其他分流的前提下，增加 Claude 相关连接的指定出口与部分遥测域名阻断，并自动跟进上游全量版、精简版 JS 脚本。

| 修改项目 | 本 Fork 行为 |
| --- | --- |
| Claude / Anthropic API 及部分登录、内容域名 | 进入独立的 **Claude固定出口** 策略组 |
| Sift（\`siftscience.com\`、\`sift.com\`）和 GrowthBook（\`growthbook.io\`） | 与 Claude 采用同一策略组 |
| Sentry（\`sentry.io\`） | \`REJECT\` |
| Datadog（\`datadoghq.com\`、\`datadoghq.eu\` 及含 \`datadoghq\` 的域名） | \`REJECT\` |
| 节点选择 | 首次默认 \`REJECT\`；须在 Bettbox 内手动选择**具体机场节点**，不使用地区自动组或负载均衡 |
| 每日自动同步 | GitHub Actions 每天 **03:23 UTC（北京时间 11:23）** 检查上游，基于同一上游提交重建全量版与精简版 |
| 构建失败 | 不发布新脚本，保留上次成功版本 |
| 其他 MyClash 功能 | 保留上游 JS 的主要实现和 Bettbox 开关；仅在生成的最终配置中叠加 Claude 规则 |

> [!IMPORTANT]
> - **Sentry 和 Datadog 为全局域名阻断规则**，会影响其他使用相同域名的软件，不仅限 Claude。
> - 阻断部分遥测不能保证不出现直连；请在 Bettbox 检查 TUN 实际状态和连接日志。固定节点名称也**不等于固定公网 IP**。
> - 本配置用于统一已接管流量的路由、减少指定域名的上报，**不能保证避免 Claude 账号封禁**。账号资格与使用地区仍需符合服务商政策。

### 本 Fork 覆写脚本（Bettbox）

| 版本 | 文件 | Raw 链接 |
| --- | --- | --- |
| **全量版（推荐）** | [\`Script/mihomoScript.js\`](./Script/mihomoScript.js) | [复制/打开全量版](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/mihomoScript.js) |
| **精简版** | [\`Script/Script.js\`](./Script/Script.js) | [复制/打开精简版](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/Script.js) |

**使用步骤：** 在 Bettbox 中复制原配置用于测试 → 将其中一条 Raw 链接作为**唯一**覆写脚本 → 应用配置 → 在 \`Claude固定出口\` 组手动选择一个真实节点 → 检查连接日志。不要同时启用上游 MyClash 或 one-exit 作为第二份覆写。

若要在构建时强制绑定一个具体节点，可编辑 [\`claude-route.json\`](./claude-route.json) 的 \`node_name\`（填写**MyClash 标准化后的完整节点名称**）；该节点不再存在时，构建出的组仅保留 \`REJECT\`，不会回退直连。留空表示在 Bettbox 内手动选择。

### 上游同步与维护

- 自动工作流：[Daily MyClash + Claude routes](./.github/workflows/sync-myclash.yml)，支持手动 \`Run workflow\`；GitHub 定时任务可能延迟。
- 生成器：[\`tools/sync-upstream.cjs\`](./tools/sync-upstream.cjs)；Claude 补丁：[\`tools/claude-route.cjs\`](./tools/claude-route.cjs)；验证：[\`tools/test-claude.cjs\`](./tools/test-claude.cjs)。
- **只自动更新两份 JS 覆写脚本**；下方上游 README 提及的 YAML 配置文件不包含此 Fork 的 Claude 补丁。
- 更多说明见 [\`Claude-README.md\`](./Claude-README.md)。

---

<details>
<summary>原版 MyClash 说明（以下内容由上游保留；其 Raw 链接指向原版，不含本 Fork 修改）</summary>


基于 [Mihomo](https://github.com/MetaCubeX/mihomo/tree/Alpha) 的**覆写脚本与配置文件**，仅适用于 mihomo 内核的代理客户端

> [!IMPORTANT]
>
> ⚠️ 使用脚本或配置时，请关闭代理软件的 DNS 覆写功能，以确保功能正常

## 特色功能

- 🧩 **丰富的分流策略组**：内置 AI、YouTube、Google、Telegram、Steam、Netflix、Spotify 等常用分流组，可按需启用
- 🎨 **精美图标**：策略组采用精心绘制的 SVG 图标，支持无损缩放与高清渲染，任意尺寸下均保持清晰
- 🌏 **地区节点自动分组**：自动识别香港、日本、美国、新加坡、台湾等地区，并生成对应策略组
- 🧹 **节点智能整理**：自动补国旗、优化节点名称、过滤无效节点，并按倍率自动分类
- ✨ **精准国内外分流**：区别于常见的 `cn-domain,直连` 分流方案，本仓库采用优化后的 `cn-ip,直连` 作为兜底规则，结合 `cn-domain` 国内 DNS 分流，减少国内流量误走代理、国外流量误判直连的情况，让分流更精准
- 🪶 **轻量规则方案**：采用 `rule-set` 按需加载规则，减少配置体积与内存占用
- 🛡️ **无 DNS 泄露**：DNS 配置与路由规则配套设计，解决 DNS 泄露问题
- 🔧 **私有 DNS 自动处理**：自动处理机场私有 DNS 与节点域名 hosts 映射，无需手动修改
- 🪜 **高级代理功能**：支持自定义节点、IPv4 / IPv6 优先及国外 QUIC 屏蔽
- 📱 **适配 [Bettbox](https://github.com/appshubcc/Bettbox) 图形化配置**：可直接在图形界面中开关策略组和功能选项，无需手动修改代码

## 版本选择

提供**全量版**和**精简版**，两者功能基本一致，仅分流策略组数量不同：

- **全量版**：包含完整的分流策略组，适合需要精细分流的用户
- **精简版**：仅保留常用分流策略组，配置更加简洁

---

## 覆写脚本

> [!IMPORTANT]
>
> - 脚本仅用于覆写机场提供的配置文件，请勿用于覆写自行编写的配置
> - 脚本已处理部分机场私有 DNS 和节点域名 hosts 映射导致的解析问题，请关闭代理软件的 DNS 覆写功能
> - 在 Windows 上如需解决 DNS 泄露，需关闭系统“智能多宿主名称解析”，或在代理软件中开启 [严格路由](https://wiki.metacubex.one/config/inbound/tun/#strict-route)

### DNS 处理（核心特色功能）

越来越多的机场开始使用私有 DNS 解析节点域名，普通公共 DNS 无法正确解析，更有甚者通过 hosts 映射节点域名，再通过本地监听回环到 DNS 解析，普通覆写手段根本无法处理，本项目脚本针对以上情况做了完善的处理，避免覆写后节点无法解析或被解析到垃圾线路（也就是常说的内鬼组），如果遇到解析问题请反馈

### 可配置功能

使用 **[Bettbox](https://github.com/appshubcc/Bettbox)** 时，可以直接通过图形界面管理这些选项

| 分类     | 功能                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| 策略组   | 内置多个分流策略组，每个都可单独开关，根据节点自动生成地区策略组，可选择地区自动选择、手动选择及高 / 低倍率组 |
| 节点处理 | 过滤高倍率、低倍率及非地区节点，可统一设置 IPv4 / IPv6 优先                                                   |
| 分流     | 可将全部节点加入分流策略组，也可启用极简模式                                                                  |
| 网络     | 可选屏蔽国外 QUIC 流量                                                                                        |
| 高级     | 支持自定义节点                                                                                                |
| 兼容     | 自动处理节点 hosts 映射及机场私有 DNS                                                                         |

### 使用方法（脚本）

选择对应版本，将链接或完整代码按如图所示步骤导入支持脚本覆写的客户端即可

- **全量版**

[mihomoScript.js](/Script/mihomoScript.js)，复制下面这个链接使用👇👇👇

```text
https://raw.githubusercontent.com/AIsouler/MyClash/main/Script/mihomoScript.js
```

- **精简版**

[Script.js](/Script/Script.js)，复制下面这个链接使用👇👇👇

```text
https://raw.githubusercontent.com/AIsouler/MyClash/main/Script/Script.js
```

|                                                                                   |
| --------------------------------------------------------------------------------- |
| ![img](https://raw.githubusercontent.com/AIsouler/MyClash/main/Image/import.webp) |

---

## 配置文件

配置文件与覆写脚本的整体效果基本一致，但由于 YAML 是静态配置，无法像脚本那样灵活处理

因此存在以下限制：

- 没有自定义配置项
- 无法根据节点动态生成地区策略组，未匹配到节点的地区会回退到 `REJECT`
- 使用私有 DNS 或 hosts 节点域名映射的机场，需要手动写入配置

### 使用方法（配置）

选择对应版本，将链接或完整代码导入 mihomo 客户端即可

- **全量版**

[mihomoConfig.yaml](/Config/mihomoConfig.yaml)，复制下面这个链接使用👇👇👇

```text
https://raw.githubusercontent.com/AIsouler/MyClash/main/Config/mihomoConfig.yaml
```

- **精简版**

[mihomoConfigLite.yaml](/Config/mihomoConfigLite.yaml)，复制下面这个链接使用👇👇👇

```text
https://raw.githubusercontent.com/AIsouler/MyClash/main/Config/mihomoConfigLite.yaml
```

---

## 效果预览

推荐使用 [Bettbox](https://github.com/appshubcc/Bettbox) 管理覆写脚本，可通过图形界面调整策略组和配置项

|                                                                                  |                                                                                  |                                                                                  |                                                                                  |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| ![img](https://raw.githubusercontent.com/AIsouler/MyClash/main/Image/IMG_1.webp) | ![img](https://raw.githubusercontent.com/AIsouler/MyClash/main/Image/IMG_2.webp) | ![img](https://raw.githubusercontent.com/AIsouler/MyClash/main/Image/IMG_3.webp) | ![img](https://raw.githubusercontent.com/AIsouler/MyClash/main/Image/IMG_4.webp) |
| ![img](https://raw.githubusercontent.com/AIsouler/MyClash/main/Image/IMG_5.webp) | ![img](https://raw.githubusercontent.com/AIsouler/MyClash/main/Image/IMG_6.webp) | ![img](https://raw.githubusercontent.com/AIsouler/MyClash/main/Image/IMG_7.webp) | ![img](https://raw.githubusercontent.com/AIsouler/MyClash/main/Image/IMG_8.webp) |

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=aisouler/myclash&type=date&legend=top-left)](https://www.star-history.com/?repos=aisouler%2Fmyclash&type=date&legend=top-left)

## 致谢

感谢以下项目以及所有上游项目：

- [dahaha-365/YaNet](https://github.com/dahaha-365/YaNet)
- [YiXuanZX/rules](https://github.com/YiXuanZX/rules)
- [appshubcc/bett-rules](https://github.com/appshubcc/bett-rules)
- [Koolson/Qure](https://github.com/Koolson/Qure)
- [jsdmirror/JSDMirror](https://github.com/jsdmirror/JSDMirror)

</details>
