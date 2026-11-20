'use strict';
const fs = require('node:fs');
const { patch, parseAnthropicSource } = require('./claude-route.cjs');
const { parseGeminiConfig, patchGemini } = require('./gemini-route.cjs');
const files = ['Script/mihomoScript.js', 'Script/Script.js'];

function parseClaudeConfig(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw Error('Claude config must be a JSON object');
  }
  const keys = Object.keys(obj);
  if (keys.length !== 1 || keys[0] !== 'node_name' || typeof obj.node_name !== 'string') {
    throw Error('Claude config must contain only string node_name');
  }
  const trimmed = obj.node_name.trim();
  if (
    trimmed.length > 256 ||
    /[\r\n]/.test(obj.node_name) ||
    ['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL', '直连'].includes(trimmed.toUpperCase())
  ) {
    throw Error('Invalid Claude node_name');
  }
  return { node_name: obj.node_name };
}

async function get(url, fetchImpl = fetch) {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:') {
    throw Error('Refusing non-HTTPS URL: ' + url);
  }
  for (let i = 0; i < 3; i++) {
    try {
      const headers = { 'User-Agent': 'MyClash-A-Sync' };
      if (parsedUrl.hostname === 'api.github.com') {
        headers.Accept = 'application/vnd.github+json';
        if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
      }
      const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30000) });
      if (!r.ok) {
        const err = Error(url + ' HTTP ' + r.status);
        err.status = r.status;
        throw err;
      }
      return await r.text();
    } catch (e) {
      const status = e && typeof e.status === 'number' ? e.status : 0;
      const nonRetryable = status >= 400 && status < 500 && status !== 408 && status !== 429;
      if (i === 2 || nonRetryable) throw e;
      await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
    }
  }
}

// Harden upstream helper edge cases (2-level public suffix DNS policy, strict IPv4/IPv6 check, Lite US regex parity).
function hardenUpstreamSource(source) {
  if (typeof source !== 'string') throw Error('Invalid upstream source');
  let out = source;

  // 1. Align Lite US region regex with Full script so '拉斯维加斯' nodes do not fall into 其他节点.
  out = out.replace(
    '华盛顿|圣何塞|(?<![A-Za-z])USA?',
    () => '华盛顿|拉斯维加斯|圣何塞|(?<![A-Za-z])USA?',
  );

  // 2. Tighten isIpAddress to validate 0-255 IPv4 octets and bracketed IPv6 literals.
  const oldIsIp = [
    'function isIpAddress(server) {',
    "  return /^\\d{1,3}(\\.\\d{1,3}){3}$/.test(server) || server.includes(':');",
    '}',
  ].join('\n');
  const newIsIp = [
    'function isIpAddress(server) {',
    "  const host = String(server).replace(/^\\[|\\]$/g, '');",
    '  if (/^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$/.test(host)) {',
    '    return true;',
    '  }',
    "  return host.includes(':') && /^[0-9a-fA-F:.%]+$/.test(host);",
    '}',
  ].join('\n');
  if (out.includes(oldIsIp)) {
    out = out.replace(oldIsIp, () => newIsIp);
  }

  // 3. Guard simplifyDomainPolicy against collapsing 2-level public suffixes (.co.uk, .com.cn) or trailing dots.
  const oldSimplify = [
    "    const parts = domain.split('.');",
    '',
    '    if (parts.length < 3) {',
    '      groups.set(`keep:${domain}`, [{ domain, dns, dnsKey }]);',
    '      continue;',
    '    }',
    '',
    "    const suffix = parts.slice(-2).join('.');",
  ].join('\n');
  const newSimplify = [
    "    const normalizedDomain = domain.replace(/\\.+$/, '').toLowerCase();",
    "    const parts = normalizedDomain.split('.').filter(Boolean);",
    "    const twoLevelTld = /^(?:co|com|net|org|gov|edu|ac|ne|or)\\.[a-z]{2}$/.test(parts.slice(-2).join('.'));",
    '    const minParts = twoLevelTld ? 4 : 3;',
    '',
    '    if (parts.length < minParts) {',
    '      groups.set(`keep:${domain}`, [{ domain, dns, dnsKey }]);',
    '      continue;',
    '    }',
    '',
    "    const suffix = parts.slice(twoLevelTld ? -3 : -2).join('.');",
  ].join('\n');
  if (out.includes(oldSimplify)) {
    out = out.replace(oldSimplify, () => newSimplify);
  }

  return out;
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
  const cfg = parseClaudeConfig(JSON.parse(fs.readFileSync('claude-route.json', 'utf8')));
  const geminiCfg = parseGeminiConfig(JSON.parse(fs.readFileSync('gemini-route.json', 'utf8')));
  // Fetch upstream commit metadata and Anthropic canonical domain list concurrently.
  const [metaText, anthropicSource] = await Promise.all([
    get('https://api.github.com/repos/AIsouler/MyClash/commits/main'),
    get('https://raw.githubusercontent.com/v2fly/domain-list-community/master/data/anthropic'),
  ]);
  const meta = JSON.parse(metaText);
  if (!meta || typeof meta !== 'object' || !/^[a-f0-9]{40}$/.test(meta.sha)) {
    throw Error('Invalid upstream SHA');
  }
  const anthropicRules = parseAnthropicSource(anthropicSource);
  console.log('Anthropic canonical rules: ' + anthropicRules.length);

  // Fetch and build both upstream scripts concurrently.
  const builtEntries = await Promise.all(
    files.map(async (file) => {
      const rawSource = await get('https://raw.githubusercontent.com/AIsouler/MyClash/' + meta.sha + '/' + file);
      const hardened = hardenUpstreamSource(rawSource);
      const built = applyForkHeader(
        patchGemini(patch(hardened, cfg.node_name, anthropicRules), geminiCfg),
        file,
        meta.sha,
      );
      return [file, built];
    }),
  );

  for (const [file, content] of builtEntries) {
    fs.writeFileSync(file, content);
    console.log(file + ' built at ' + meta.sha);
  }
}

module.exports = { applyForkHeader, parseClaudeConfig, hardenUpstreamSource, get };
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
