# Gemini Web P0：独立路由

- 当前实现位于 `feat/gemini-web-p0` 分支，待 PR 审核；未合并到 `main`。
- 生成器先应用不变的 Claude 补丁，再应用独立的 `tools/gemini-route.cjs`，重建两版 `Script/*.js`。
- `Gemini Web` 为 `select` 总入口，默认 `默认代理`。提供五个独立的手动 `select` 地区组（美国、日本、新加坡、香港、台湾），有对应节点才生成；`GLOBAL` 追加总入口及实际生成的地区组（不重复）；不产生 `fallback`、`url-test`、`load-balance`。
- **固定出口**：`默认代理` 可能跟随自动组改变出口。请选择 `Gemini <地区>` 并在该组中明确选一个具体节点。节点名不等于永久固定的公网 IP。
- 主要路由为 `IN-USER,gemini-01,Gemini Web`，浏览器域名兜底为 `DOMAIN,gemini.google.com,Gemini Web`。都在 Claude 完整规则之后、上游 Google/AI 之前，不全局接管 `accounts.google.com` 或其他 Google 共用主机。
- 在反代后端自己的代理池设置 `http://gemini-01:x@127.0.0.1:7890`；不能只设置 `HTTP(S)_PROXY`。`IN-USER` 的用户名仅是路由标签，不是认证凭据；现有 `allow-lan: true`、`bind-address: '*'` 不变，LAN 设备同样可以携带标签。
- `gemini-route.json` 的 `process_path_regex` 默认 `""`，因此**进程兜底未启用**。请先从 Bettbox/Mihomo 连接面板获取真实完整路径，再考虑锚定并转义后填写。进程规则还会接管非 Google 请求；JS 正则校验不保证 Mihomo 正则引擎兼容。
- 不使用 `round-robin`：后端以代理 URL 为独立槽位，而新连接轮询可能造成账号或文件上传的出口不一致。P0 不修正后端的跨请求及 Cookie 续期出口一致性，不能保证不受 Google 风控。
- **真机验收**：1）Bettbox 导入本分支单份 Raw 并确认内核加载；2）验证 Gemini 地区组与默认选项；3）后端连 7890 后查看 `IN-USER` 及真实链路；4）验证浏览器 Google、Gemini 与 Claude 原有分流互不干扰。之后再记录无用户名的续期流量/可选进程路径与连续请求的出口。
- [全量分支 Raw](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/feat/gemini-web-p0/Script/mihomoScript.js) · [精简分支 Raw](https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/feat/gemini-web-p0/Script/Script.js)
