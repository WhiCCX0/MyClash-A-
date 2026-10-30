'use strict';
const fs = require('node:fs');
const { patch, parseAnthropicSource } = require('./claude-route.cjs');
const { parseGeminiConfig, patchGemini } = require('./gemini-route.cjs');
const files = ['Script/mihomoScript.js', 'Script/Script.js'];
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const headers = { 'User-Agent': 'MyClash-A-Sync' };
      if (new URL(url).hostname === 'api.github.com') {
        headers.Accept = 'application/vnd.github+json';
        if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
      }
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw Error(url + ' HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
    }
  }
}
// Replace only the recognizable upstream banner; preserve unknown upstream headers.
function applyForkHeader(source, file, upstreamSha) {
  const versions = {
    'Script/Script.js': ['精简版', 'Script.js'],
    'Script/mihomoScript.js': ['全量版', 'mihomoScript.js'],
  };
  const entry = versions[file];
  if (!entry || !/^[a-f0-9]{40}$/.test(upstreamSha)) throw Error('Invalid fork header build input');
  const [version, filename] = entry;
  const forkLines = [
    ' * 本仓库：https://github.com/WhiCCX0/MyClash-A-',
    ' * 脚本链接：https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/' + filename,
    ' * 附加功能：Claude 固定出口、Gemini Web / AI Studio 独立分流（构建时自动注入）',
    ' * 构建基于上游提交：' + upstreamSha,
  ];
  const header = [
    '/**',
    ' * mihomo配置覆写脚本（' + version + '）· MyClash-A- 定制版',
    ' * 原作者：AIsouler（MIT License）',
    ' * 上游仓库：https://github.com/AIsouler/MyClash',
    ...forkLines,
    ' * 友情推荐，非常好用、省电且内存占用低的代理软件：https://github.com/appshubcc/Bettbox',
    ' */',
  ].join('\n');
  const first = source.match(/^\/\*\*[\s\S]*?\*\//);
  if (first && first[0].includes('mihomo配置覆写脚本') && first[0].includes('AIsouler')) {
    return header + source.slice(first[0].length);
  }
  // Unknown upstream layout: retain the original comment, append a separate fork block.
  const originalComment = source.match(/^\/\*[\s\S]*?\*\//) || source.match(/^(?:\/\/[^\r\n]*(?:\r?\n|$))+/);
  const offset = originalComment ? originalComment[0].length : 0;
  const forkBlock = ['/**', ...forkLines, ' */'].join('\n');
  console.warn('WARNING: Unrecognized MyClash upstream header in ' + file + '; preserving original comment');
  return source.slice(0, offset) + (offset ? '\n\n' : '') + forkBlock + '\n' + source.slice(offset);
}
async function main() {
  const cfg = JSON.parse(fs.readFileSync('claude-route.json', 'utf8'));
  const geminiCfg = parseGeminiConfig(JSON.parse(fs.readFileSync('gemini-route.json', 'utf8')));
  if (typeof cfg.node_name !== 'string') throw Error('node_name must be string');
  const meta = JSON.parse(await get('https://api.github.com/repos/AIsouler/MyClash/commits/main'));
  if (!/^[a-f0-9]{40}$/.test(meta.sha)) throw Error('Invalid upstream SHA');
  // Pull the complete maintained Anthropic domain source for every daily build.
  // The parser fails closed if upstream introduces an unsupported directive.
  const anthropicSource = await get(
    'https://raw.githubusercontent.com/v2fly/domain-list-community/master/data/anthropic',
  );
  const anthropicRules = parseAnthropicSource(anthropicSource);
  console.log('Anthropic canonical rules: ' + anthropicRules.length);
  const generated = {};
  for (const file of files) {
    const source = await get('https://raw.githubusercontent.com/AIsouler/MyClash/' + meta.sha + '/' + file);
    generated[file] = applyForkHeader(patchGemini(patch(source, cfg.node_name, anthropicRules), geminiCfg), file, meta.sha);
  }
  for (const file of files) {
    fs.writeFileSync(file, generated[file]);
    console.log(file + ' built at ' + meta.sha);
  }
}
module.exports = { applyForkHeader };
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
