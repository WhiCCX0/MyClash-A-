# Gemini Web P0：独立路由

- 生成器先应用不变的 Claude 补丁，再应用独立的 `tools/gemini-route.cjs`，重建两版 `Script/*.js`。
- `Gemini Web` 为 `select` 总入口，默认 `默认代理`。提供五个独立的手动 `select` 地区组（美国、日本、新加坡、香港、台湾），有对应节点才生成；`GLOBAL` 追加总入口及实际生成的地区组（不重复）；不产生 `fallback`、`url-test`、`load-balance`。
- **固定出口**：`默认代理` 可能跟随自动组改变出口。请选择 `Gemini <地区>` 并在该组中明确选一个具体节点。节点名不等于永久固定的公网 IP。
- 规则依次为 `IN-USER,gemini-01/aistudio-01,Gemini Web` → `PROCESS-PATH-REGEX,\\(gemini-web2api-go|aistudio2api)\.exe$,Gemini Web` → `DOMAIN,gemini.google.com,Gemini Web`。它们紧随原 Claude 路由块，位于 Google/AI 通用规则之前；不全局接管 `accounts.google.com` 或其他共用 Google 域名。
- Gemini Web 后端的**代理池**设置 `http://gemini-01:x@127.0.0.1:7890`；AI Studio 后端（AIStudio2API）的**管理页默认代理**设置 `http://aistudio-01:x@127.0.0.1:7890`。两个后端共享 Gemini Web 出口。`IN-USER` 用户名只是路由标签，非认证凭据；`allow-lan: true`、`bind-address: '*'` 不变，LAN 客户端也可使用同样标签。
- **进程兜底已启用：** 插件 [`lib/native.mjs:64`](https://github.com/BUKOWSKIREAL/magpie-gemini-web/blob/17ac5ca88e4a7f5e703140bbe3e8bd6a72b7677e/lib/native.mjs#L64) 固定 Windows 后端名 `gemini-web2api-go.exe`（已由 Bettbox 连接日志证实）；[`lib/studio-native.mjs:107`](https://github.com/BUKOWSKIREAL/magpie-gemini-web/blob/17ac5ca88e4a7f5e703140bbe3e8bd6a72b7677e/lib/studio-native.mjs#L107) 固定 `aistudio2api.exe`（**真机日志待确认**）。如果自行下载了带版本号的 exe，应改回以上两个名字，否则正则将静默失配。此进程规则接管两个进程访问的**全部目标**，包括非 Google 网站；**不包含 `camoufox.exe`**。进程命中仍需真机检查。
- **地区限制：** Google [AI Studio 官方可用地区清单](https://ai.google.dev/gemini-api/docs/available-regions) 不包含香港。与 Gemini Web 共用同一总组时，不应选 `Gemini 香港`；如果选 `默认代理`，也需确认其真实出口非香港。
- 不使用 `round-robin`：后端以代理 URL 为独立槽位，而新连接轮询可能造成账号或文件上传的出口不一致。P0 不修正后端的跨请求及 Cookie 续期出口一致性，不能保证不受 Google 风控。
- **地区限制：** Google [AI Studio 官方可用地区清单](https://ai.google.dev/gemini-api/docs/available-regions) 不包含香港。与 Gemini Web 共用同一总组时，不应选 `Gemini 香港`；如果选 `默认代理`，也需确认其真实出口非香港。
- [全量 Raw](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/mihomoScript.js) · [精简 Raw](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/Script.js)
