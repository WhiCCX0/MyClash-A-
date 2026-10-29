# Gemini Web：进程兜底与 AI Studio 共用出口

- 生成器先应用不变的 Claude 补丁，再应用独立的 `tools/gemini-route.cjs`，重建两版 `Script/*.js`。
- `Gemini Web` 是独立 `select` 总组，默认 `默认代理`；本版本最多生成 `Gemini 美国`、`Gemini 日本`、`Gemini 新加坡`、`Gemini 香港`、`Gemini 台湾` 五个手动组，`GLOBAL` 同时纳入总组和实际生成的地区组。无负载均衡、自动故障切换及额外端口。
- 固定出口时在总组中选地区组，在该组中手选具体节点；`默认代理` 可能随自动组改变出口。
- 规则顺序：`IN-USER,gemini-01/aistudio-01,Gemini Web` → `PROCESS-PATH-REGEX,\\(gemini-web2api-go|aistudio2api)\.exe$,Gemini Web` → `DOMAIN,gemini.google.com,Gemini Web`。规则位于 Claude 路由块之后、上游 Google/AI 之前，不全局接管 `accounts.google.com` 等共享域名。
- Gemini Web 后端**代理池**使用 `http://gemini-01:x@127.0.0.1:7890`；AIStudio2API **管理页默认代理**使用 `http://aistudio-01:x@127.0.0.1:7890`。两者共用出口；`IN-USER` 用户名只作路由标签，不是身份验证。现有 `allow-lan: true`、`bind-address: '*'` 不变。
- 插件 [`lib/native.mjs:64`](https://github.com/BUKOWSKIREAL/magpie-gemini-web/blob/17ac5ca88e4a7f5e703140bbe3e8bd6a72b7677e/lib/native.mjs#L64) 固定文件名 `gemini-web2api-go.exe`，[`lib/studio-native.mjs:107`](https://github.com/BUKOWSKIREAL/magpie-gemini-web/blob/17ac5ca88e4a7f5e703140bbe3e8bd6a72b7677e/lib/studio-native.mjs#L107) 固定 `aistudio2api.exe`；**两者均已由 Bettbox 真机日志确认**。下载带版本号的 exe 要先改回固定名称，否则进程兜底可能静默失配。进程规则一旦命中，会将这两个进程的**全部目标**（包括非 Google 地址）交给 Gemini Web；不包括 `camoufox.exe`。
- **真实验收记录：** `aistudio2api.exe` 到 `alkalimakersuite-pa.clients6.google.com`，`gemini-web2api-go.exe` 到 `gemini.google.com`，均显示规则 `InUser(gemini-01/aistudio-01)`；代理链均为 **`Gemini Web → Gemini 台湾 → 2-台湾-住宅`**。内核**接受了 `PROCESS-PATH-REGEX` 规则，但实际命中未被观察到**，因为两个后端都携带代理用户名；不能把进程兜底记作真机命中通过。
- **地区限制：** Google [AI Studio 官方地区页面](https://ai.google.dev/gemini-api/docs/available-regions) 不包含香港；两个后端共用组时，不要选 `Gemini 香港`，也要检查 `默认代理` 的实际出口是否香港。
- 不使用 `round-robin`：后端以代理 URL 为独立槽位，而新连接轮询可能造成账号或文件上传的出口不一致。P0 不修正后端的跨请求及 Cookie 续期出口一致性，不能保证不受 Google 风控。
- **后续验证：** 如需验证进程兜底，请实际制造不带代理用户名的后端连接，并从 Bettbox 日志确认 `PROCESS-PATH-REGEX` 被命中。之前 Claude 只有静态不变量测试覆盖，不应记为 Claude 真机验收通过。
- [全量 Raw](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/mihomoScript.js) · [精简 Raw](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/Script.js)
