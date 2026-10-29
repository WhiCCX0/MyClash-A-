# MyClash

> [!NOTE]
> 本仓库 **WhiCCX0/MyClash-A-** 基于 [AIsouler/MyClash](https://github.com/AIsouler/MyClash) 维护。以下先说明本 Fork 新增的 Claude 路由和自动更新功能；文档后半部分保留上游 MyClash 的原始使用说明。

## 本 Fork 的修改说明

**目标：** 在尽量保留 MyClash 原有 DNS、TUN、节点归类和其他分流的前提下，增加 Claude 相关连接的指定出口与部分遥测域名阻断，并自动跟进上游全量版、精简版 JS 脚本。

| 修改项目 | 本 Fork 行为 |
| --- | --- |
| **Claude / Anthropic 完整域名分流** | 每日读取 [domain-list-community 的 Anthropic 域名清单](https://github.com/v2fly/domain-list-community/blob/master/data/anthropic)，生成逐域名优先规则；并加载 [MetaCubeX 的 `anthropic.mrs`](https://github.com/MetaCubeX/meta-rules-dat/tree/meta) 自动更新规则集，均指向 **Claude固定出口** |
| **Claude Code Windows 进程兜底** | 新增 `PROCESS-NAME,claude.exe,Claude固定出口`，仅在 Mihomo 能识别程序来源时生效；用于捕获 CLI 访问尚未列入域名库的目标，**不会覆盖独立子进程或网页浏览器** |
| **Anthropic 专属第三方主机** | 增加精确规则 `anthropic-com.ghost.io`；认证主机 `anthropic.auth0.com` 和 Claude CDN 专属主机继续保留 |
| Sift（`siftscience.com`、`sift.com`）和 GrowthBook（`growthbook.io`） | 与 Claude 采用同一策略组 |
| Sentry（`sentry.io`） | `REJECT` |
| Datadog（`datadoghq.com`、`datadoghq.eu` 及含 `datadoghq` 的域名） | `REJECT` |
| Claude 节点选择 | **只显示台湾节点及 `台湾`、`台湾-自动选择` 组**；默认 `REJECT`；没有台湾节点则保持拒绝连接，不回退到其他地区 |
| 每日自动同步 | GitHub Actions 每天 **03:23 UTC（北京时间 11:23）** 检查上游，基于同一上游提交重建全量版与精简版 |
| 构建失败 | 不发布新脚本，保留上次成功版本 |
| 其他 MyClash 功能 | 保留上游 JS 的主要实现和 Bettbox 开关；仅在生成的最终配置中叠加 Claude 规则 |

> [!NOTE]
> [!IMPORTANT]
> **规则覆盖范围与风险说明（2026-10-29 联网核查）**
> - Claude Code 官方 [网络端点说明](https://code.claude.com/docs/en/network-config) 包含 `api.anthropic.com`、`platform.claude.com`、`mcp-proxy.anthropic.com`、`downloads.claude.ai`、`bridge.claudeusercontent.com`；这些都被现有 Claude 域名后缀规则覆盖，无需重复。
> - `storage.googleapis.com`、`raw.githubusercontent.com`、`registry.npmjs.org`、`statsigapi.net`、`intercom.io`、`challenges.cloudflare.com`、`hcaptcha.com` 等共享主机/服务**没有全局加入**，避免将无关应用也送入 Claude 出口；若特定登录流程需要共享域名同出口，应在连接日志确认后做有范围的单独处理。
> - 原版配置使用 `find-process-mode: strict`。Windows 原生 `claude.exe` 进程兜底依赖 Mihomo 获取进程信息，可能不会覆盖 HTTP 代理入口、代理网关、Claude 启动的浏览器和 MCP 子进程；它也会把**该进程发起的非 Claude 网站访问**送往 Claude 组。
> - Anthropic 的[入站 IPv4](https://platform.claude.com/docs/en/api/ip-addresses) 是 `160.79.104.0/23`，其公布的 `160.79.104.0/21` 是**Anthropic 服务端出站源地址池**；不能将服务端源地址等同于用户连接必达的目标地址。当前规则保留已有的 `/21` 兜底，仅匹配目标 IP，并不保证所有 CDN IP 都能归到 Claude。
> - 代理分流无法掩盖服务端经正常 HTTPS 连接观察到的出口 IP，也无法证明账号风控仅依赖 IP。**本配置不保证规避账号封禁或地区资格检查。**

> **Claude 与 AI 的匹配优先级：** 上游 `category-ai-!cn` 数据集仍包含 Anthropic 域名（未篡改原版数据），但本 Fork 的**完整 Claude 域名规则与 `anthropic.mrs` 先于 `RULE-SET,ai,AI` 匹配**。因此已知 Anthropic 域名会实际进入 `Claude固定出口`，而不是 AI。未来新增域名取决于域名清单及规则集是否及时更新；无法对未知域名作绝对保证。
>
> 如果维护中的域名清单出现构建器不支持的新语法，GitHub Actions 会中止发布，避免静默遗漏。Sentry/Datadog 仍按既有规则优先阻断。
>
> [!IMPORTANT]
> - **Sentry 和 Datadog 为全局域名阻断规则**，会影响其他使用相同域名的软件，不仅限 Claude。
> - 阻断部分遥测不能保证不出现直连；请在 Bettbox 检查 TUN 实际状态和连接日志。固定节点名称也**不等于固定公网 IP**。
> - 本配置用于统一已接管流量的路由、减少指定域名的上报，**不能保证避免 Claude 账号封禁**。账号资格与使用地区仍需符合服务商政策。

### 本 Fork 覆写脚本（Bettbox）

| 版本 | 文件 | Raw 链接 |
| --- | --- | --- |
| **全量版（推荐）** | [`Script/mihomoScript.js`](./Script/mihomoScript.js) | [复制/打开全量版](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/mihomoScript.js) |
| **精简版** | [`Script/Script.js`](./Script/Script.js) | [复制/打开精简版](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/Script.js) |

**使用步骤：** 在 Bettbox 中复制原配置用于测试 → 将其中一条 Raw 链接作为**唯一**覆写脚本 → 应用配置 → 在 `Claude固定出口` 组选择台湾具体节点（或台湾地区组）→ 检查连接日志。不要同时启用上游 MyClash 或 one-exit 作为第二份覆写。

**地区分组保持上游原样：不会创建任何 `fallback`／`故障转移` 组。** `台湾-自动选择` 是 `url-test`，可能在台湾节点间自动切换，若需要稳定使用某一节点，应选具体台湾节点。

若要在构建时强制绑定一个具体节点，可编辑 [`claude-route.json`](./claude-route.json) 的 `node_name`（填写**MyClash 标准化后的台湾具体节点全名**；非台湾节点会被拒绝）；该节点不再存在时，构建出的组仅保留 `REJECT`，不会回退直连。留空表示在 Bettbox 内手动选择。

### Gemini Web 路由（P0）

新增 **Gemini Web**（`select`，默认选择 `默认代理`）和最多五个独立的 Gemini 地区手动组：`Gemini 美国`、`Gemini 日本`、`Gemini 新加坡`、`Gemini 香港`、`Gemini 台湾`。各地区只使用上游 MyClash 已归类的真实节点，空地区不生成；与原有地区组和 Google、AI、Claude 组相互独立。`GLOBAL` 追加 `Gemini Web` 和实际生成的 Gemini 地区组，已存在的成员不重复添加。不新增监听端口、`fallback`、`url-test`、`load-balance` 或 `hash-key`。

**固定出口：** `默认代理` 只是初始选项，可能跟随其他自动组变化，**不保证固定出口**。如需固定节点，应在 `Gemini Web` 中选一个 `Gemini <地区>`，再在该地区组里选择具体节点；固定节点名也不保证公网 IP 永不变化。

**实际规则顺序：** 原 Claude BLOCK 和 Anthropic 规则全部保留；紧接 Claude 最后一条 `PROCESS-NAME,claude.exe,Claude固定出口` 插入 `IN-USER,gemini-01,Gemini Web` 和 `DOMAIN,gemini.google.com,Gemini Web`，随后才是上游 Google、AI 等规则。`accounts.google.com`、`push.clients6.google.com`、`content-push.googleapis.com` 等共享 Google 主机不会被全局划入 Gemini 组。

**后端连接：** gemini-web2api-go 不读取 `HTTP(S)_PROXY` 环境变量；请在反代后端的**代理池**中填写 `http://gemini-01:x@127.0.0.1:7890`。用户名只是 `IN-USER` 路由标签，**不是认证身份**；原有 `allow-lan: true` 与 `bind-address: '*'` 保留，局域网客户端也能使用相同标签。`IN-USER` 仅覆盖带代理认证用户名的 HTTP/mixed 入站连接；TUN 接管且不带用户名的连接不会因此匹配。

**进程兜底默认关闭。** `gemini-route.json` 中 `process_path_regex` 初始为空字符串，不生成 `PROCESS-PATH-REGEX`。只能在 Bettbox 的真实连接日志确认后端进程完整路径后，才可选填锚定、转义后的路径正则，提交并重新生成。进程规则会把该进程访问的**所有目标**（包含非 Google 目标）交给 Gemini Web；JS `new RegExp()` 校验通过不保证 Mihomo 正则语法相容，必须真机验证。不能猜测 Windows 路径。

**已知限制：** 账号跨请求出口漂移、请求内部 Cookie 续期不使用已选代理属于反代后端第二阶段问题，P0 不修复。`round-robin` 按连接切换节点，可能破坏后端的同出口要求，因此不采用。本功能不保证避免 Google 风控。

#### Bettbox 真机验收（由用户操作）

1. 复制一份订阅配置进行测试，导入[此分支全量 Raw](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/feat/gemini-web-p0/Script/mihomoScript.js)或[精简 Raw](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/feat/gemini-web-p0/Script/Script.js)作为**唯一覆写脚本**；验证内核可加载，记录 Bettbox 与 Mihomo 版本。
2. 在面板确认 `Gemini Web` 和有节点的 Gemini 地区组可见，初始为 `默认代理`；在地区组内选择具体节点。
3. 后端代理池填写 `http://gemini-01:x@127.0.0.1:7890` 并发送一次对话；从连接日志或 `127.0.0.1:9090` 的 connections 接口确认 `IN-USER` 命中，出口链为 `Gemini Web → 地区组 → 具体节点`。
4. 验证浏览器访问 `accounts.google.com` 仍使用原 Google 组，`gemini.google.com` 匹配 Gemini 专用 DOMAIN 规则，Claude Code 仍使用 `Claude固定出口`。**步骤 1–4 全通过即为 P0 真机通过。**
5. 查找新账号首次 Cookie 续期等**不带 IN-USER** 的连接，记录是否能识别到真实后端进程路径；识别不到则保持「进程兜底未启用」。
6. （可选）确认完整路径后，才配置 `process_path_regex`，等待重新生成并复测 `PROCESS-PATH-REGEX`；注意正则锚定和反斜杠、点号转义。
7. 记录同账号连续请求的实际出口节点，供后端第二阶段使用；此项不作为 P0 通过条件。

简明说明见 [Gemini-README.md](./Gemini-README.md)。在本 PR 合并前，`main` 的 Raw 链接仍是旧版，不含 Gemini P0。


### Bettbox 中看不到 `Claude固定出口`？

1. **机场订阅与脚本覆写是不同入口**：请先正常导入机场节点订阅，再到 Bettbox 的脚本覆写页面绑定本 Fork 的全量或精简 **JS Raw 地址**；不要将 JS 当成机场订阅 YAML 导入。
2. 更新或重新下载脚本覆写，保存并确认它确实对**当前选中的机场订阅**启用；再刷新订阅并重新加载 Mihomo 配置。
3. 本 Fork 的 `Claude固定出口` 现在紧跟在 `默认代理` 之后，同时列入 `GLOBAL` 可选组。出现后选择台湾节点或台湾组；初始为 `REJECT`。
4. 仍未出现时，请检查 Bettbox 的脚本执行错误和内核配置加载日志：如果报错或仍引用 `AIsouler/MyClash` 的原版地址，说明新版覆写尚未生效。分享截图前遮挡私人订阅 URL 和节点凭据。

### 上游同步与维护

- 自动工作流：[Daily MyClash + Claude routes](./.github/workflows/sync-myclash.yml)，支持手动 `Run workflow`；GitHub 定时任务可能延迟。
- 生成器：[`tools/sync-upstream.cjs`](./tools/sync-upstream.cjs)；Claude 补丁：[`tools/claude-route.cjs`](./tools/claude-route.cjs)；验证：[`tools/test-claude.cjs`](./tools/test-claude.cjs)。
- **只自动更新两份 JS 覆写脚本**；下方上游 README 提及的 YAML 配置文件不包含此 Fork 的 Claude 补丁。
- 更多说明见 [`Claude-README.md`](./Claude-README.md)。

---

## 上游 MyClash 原版说明

> 以下为上游保留内容；其中原版 Raw 链接不包含本 Fork 新增的 Claude 规则，请优先使用上方本 Fork 的链接。


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

