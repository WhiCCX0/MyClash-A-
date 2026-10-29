# Gemini Web：共用上游地区组与 AI Studio 出口

- 由 `tools/sync-upstream.cjs` 对上游 MyClash 依次应用原有 Claude 与 Gemini patch，重建两版 `Script/*.js`；不手动编辑生成文件。
- `Gemini Web` 是唯一新增的 Gemini `select` 策略组，默认 `默认代理`；其后按顺序引用上游已有且有成员的 `美国`、`日本`、`新加坡`、`台湾`、`其他节点`。极简模式仅引用 `默认代理`。不再新增 `Gemini 美国` 等专属组，不加入 `香港`，不引用 `*-自动选择` 组、DIRECT、REJECT、直连；`GLOBAL` 仅新增 `Gemini Web`。
- **共享选择的代价：** 同一个上游地区组只记一个节点选择。`Claude固定出口` 应直接选**台湾具体节点**，不要选原生 `台湾` 组，否则与 Gemini 共享选择状态。地区组内手动选具体节点，不要选 `*-自动选择`：上游自动测速周期 **600 秒**、容差 **50ms**，可能发生出口切换。`默认代理` 本身也可能变化。
- `其他节点` 可能含 Google 不支持的地区，使用前自行核实真实出口。[AI Studio 官方可用地区](https://ai.google.dev/gemini-api/docs/available-regions) 不包含香港，因此从总组移除香港。
- 精确规则依次为 `IN-USER,gemini-01/aistudio-01,Gemini Web` → `PROCESS-PATH-REGEX,\\(gemini-web2api-go|aistudio2api)\.exe$,Gemini Web` → `DOMAIN,gemini.google.com,Gemini Web` → `DOMAIN,gemini.gstatic.com,Gemini Web`，紧接原 Claude 规则。新增 `gemini.gstatic.com` 是因为 Bettbox 真机日志显示浏览器访问时曾走 `默认代理`；不加入 `www.gstatic.com`、`ssl.gstatic.com` 或宽泛的 `gstatic.com` 后缀规则。
- Gemini Web 后端代理池设置 `http://gemini-01:x@127.0.0.1:7890`；AIStudio2API **管理页默认代理**设置 `http://aistudio-01:x@127.0.0.1:7890`。用户名仅为 `IN-USER` 标签，不是认证；`allow-lan: true`、`bind-address: '*'` 仍保持不变。
- 插件 [lib/native.mjs:64](https://github.com/BUKOWSKIREAL/magpie-gemini-web/blob/17ac5ca88e4a7f5e703140bbe3e8bd6a72b7677e/lib/native.mjs#L64) 和 [lib/studio-native.mjs:107](https://github.com/BUKOWSKIREAL/magpie-gemini-web/blob/17ac5ca88e4a7f5e703140bbe3e8bd6a72b7677e/lib/studio-native.mjs#L107) 固定 `gemini-web2api-go.exe`、`aistudio2api.exe`，两个文件名均已有 Bettbox 真机日志验证。如果自行下载带版本号的 exe，应改回固定名字，否则兜底可能静默失配。进程规则命中时会接管这两个进程的所有目标（包括非 Google）；不包括 `camoufox.exe`。
- **已知真机结果（上一版 PR #2）：** 两后端分别访问 `gemini.google.com` 和 `alkalimakersuite-pa.clients6.google.com`，规则显示 `InUser(gemini-01/aistudio-01)`，代理链 `Gemini Web → Gemini 台湾 → 2-台湾-住宅`。进程规则已被内核接受，但**未实际观察到 `PROCESS-PATH-REGEX` 命中**，因为两进程均带用户名。**本次共用地区组改造尚待真机确认**。
- 不使用连接级 `round-robin`；后端账号和 Cookie 续期跨出口问题仍未修复。不全局接管其他共享 Google 域名，不保证 Google 风控不触发。
- **本次真机复核**：确认 Gemini Web 只含允许的原生策略组、香港不在总组、各地区手选节点；确认 Gemini/AIStudio2API `IN-USER` 路由与 `gemini.gstatic.com` 域名规则；将 Claude 固定出口直接设为台湾具体节点。进程兜底如需核验，必须使用不带用户名的连接。
- [全量 Raw](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/mihomoScript.js) · [精简 Raw](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/Script.js)
