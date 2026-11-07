'use strict';
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const { patch, parseAnthropicSource, BLOCK } = require('./claude-route.cjs');
const { applyForkHeader } = require('./sync-upstream.cjs');
const anthropicFixture = [
  '# canonical list',
  'anthropic.com',
  'claude.ai',
  'claude.com',
  'clau.de',
  'domain:anthropic.com @!cn',
  'full:api.anthropic.com @ads',
  'keyword:claude',
  'example.org @ads @!cn # attributes and comment',
  'example.org',
  'alpha.example',
  'beta.example',
  'gamma.example',
  'delta.example',
  'epsilon.example',
  'zeta.example',
  'eta.example',
  'theta.example',
  'iota.example',
  'kappa.example',
  'lambda.example',
].join('\n');
const parsed = parseAnthropicSource(anthropicFixture);
for (const expected of [
  'DOMAIN-SUFFIX,anthropic.com,Claude固定出口',
  'DOMAIN,api.anthropic.com,Claude固定出口',
  'DOMAIN-KEYWORD,claude,Claude固定出口',
  'DOMAIN-SUFFIX,example.org,Claude固定出口',
])
  assert.ok(parsed.includes(expected), 'parse missing ' + expected);
assert.equal(parsed.filter((x) => x === 'DOMAIN-SUFFIX,anthropic.com,Claude固定出口').length, 1);
assert.equal(parsed.filter((x) => x === 'DOMAIN-SUFFIX,example.org,Claude固定出口').length, 1);
for (const directive of ['regexp:foo', 'include:foo', 'unknown:foo']) {
  assert.throws(
    () => parseAnthropicSource(anthropicFixture + '\n' + directive),
    /Unsupported|Invalid/,
    'Expected parser rejection: ' + directive,
  );
}
function originalUpstreamScript(source) {
  const addon = '// Shared add-on: upstream MyClash code is otherwise unchanged.';
  const gemini = '// Gemini Web P0 add-on (generated)';
  assert.ok(source.includes(addon) && source.includes(gemini));
  let upstream = source.slice(0, source.indexOf(addon));
  const claudeBlock =
    /^  \/\/ BEGIN MyClash-A- Claude routing \(generated\)\r?\n[\s\S]*?^  \/\/ END MyClash-A- Claude routing\r?\n/gm;
  const geminiBlock =
    /^  \/\/ BEGIN MyClash-A- Gemini routing \(generated\)\r?\n[\s\S]*?^  \/\/ END MyClash-A- Gemini routing\r?\n/gm;
  assert.equal((upstream.match(claudeBlock) || []).length, 1);
  assert.equal((upstream.match(geminiBlock) || []).length, 1);
  upstream = upstream.replace(claudeBlock, () => '').replace(geminiBlock, () => '');
  return upstream;
}

const sample = {
  proxies: [
    ...['🇹🇼 台湾 01', '🇹🇼 TW 02', '🇭🇰 香港 01', '🇯🇵 日本 01', '🇺🇸 美国 01', '🇸🇬 新加坡 01'].map((name, i) => ({
      name,
      type: 'ss',
      server: 'node' + i + '.example.net',
      port: 443,
      cipher: 'aes-128-gcm',
      password: 'test',
    })),
  ],
  dns: {},
};
const pinned = JSON.parse(fs.readFileSync('claude-route.json', 'utf8')).node_name;
const fallbackSha = '0123456789abcdef0123456789abcdef01234567';
const unusualHeader = '/**\n * Unexpected upstream header\n */';
const preservedSource = unusualHeader + '\nconst originalCode = 1;\n';
const fallback = applyForkHeader(preservedSource, 'Script/Script.js', fallbackSha);
assert.ok(fallback.startsWith(unusualHeader + '\n\n/**\n'), 'Must preserve an unrecognized upstream comment');
assert.ok(fallback.endsWith('\nconst originalCode = 1;\n'), 'Must preserve original source code');
for (const expected of [
  ' * 本仓库：https://github.com/WhiCCX0/MyClash-A-',
  ' * 脚本链接：https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/Script.js',
  ' * 附加功能：Claude 固定出口、Gemini Web / AI Studio 独立分流（构建时自动注入）',
  ' * 构建基于上游提交：' + fallbackSha,
])
  assert.ok(fallback.includes(expected), 'Fallback missing: ' + expected);

for (const file of ['Script/mihomoScript.js', 'Script/Script.js']) {
  const source = fs.readFileSync(file, 'utf8');
  const firstComment = source.match(/^\/\*\*[\s\S]*?\*\//);
  assert.ok(firstComment, file + ': missing generated file header');
  const banner = firstComment[0];
  const lite = file === 'Script/Script.js';
  const version = lite ? '精简版' : '全量版';
  const filename = lite ? 'Script.js' : 'mihomoScript.js';
  assert.ok(banner.includes('mihomo配置覆写脚本（' + version + '）· MyClash-A- 定制版'));
  assert.ok(banner.includes('原作者：AIsouler（MIT License）'));
  assert.ok(banner.includes('本仓库：https://github.com/WhiCCX0/MyClash-A-'));
  assert.ok(banner.includes('脚本链接：https://raw.githubusercontent.com/WhiCCX0/MyClash-A-/main/Script/' + filename));
  assert.match(banner, /构建基于上游提交：[a-f0-9]{40}/);
  assert.ok(!source.includes('raw.githubusercontent.com/AIsouler/MyClash'), file + ': stale upstream Raw link');
  const main = vm.runInNewContext(source + '\nmain', {}, { timeout: 5000 });
  const cfg = main(structuredClone(sample));
  const g = cfg['proxy-groups'].find((x) => x.name === 'Claude固定出口');
  assert.ok(g);
  assert.equal(g.type, 'select');
  assert.ok(g.proxies.includes('REJECT'));
  assert.ok(!g.proxies.includes('DIRECT'));
  assert.ok(!g.proxies.includes('自动选择'));
  const taiwanNames = new Set(['🇹🇼 台湾 01', '🇹🇼 TW 02']);
  const taiwanGroupNames = ['台湾', '台湾-自动选择'];
  const expectedTaiwan = ['REJECT', ...taiwanNames, ...taiwanGroupNames];
  const allowedTaiwan = new Set(expectedTaiwan);
  assert.ok(
    g.proxies.every((name) => allowedTaiwan.has(name)),
    file + ': non-Taiwan in Claude',
  );
  const byName = new Map(cfg['proxy-groups'].map((group) => [group.name, group]));
  for (const region of ['香港', '日本', '美国', '新加坡', '台湾']) {
    const manual = byName.get(region);
    const auto = byName.get(region + '-自动选择');
    assert.ok(manual && auto && auto.type === 'url-test', file + ': existing ' + region + ' groups must be preserved');
  }
  assert.ok(
    !cfg['proxy-groups'].some((group) => group.type === 'fallback' || group.name.endsWith('-故障转移')),
    file + ': unwanted fallback group',
  );
  assert.deepEqual(
    Array.from(g.proxies).sort(),
    (pinned ? (taiwanNames.has(pinned) ? [pinned, 'REJECT'] : ['REJECT']) : expectedTaiwan).sort(),
  );

  assert.equal(cfg.rules[0], 'DOMAIN-SUFFIX,sentry.io,REJECT');
  assert.ok(cfg.rules.includes('DOMAIN-SUFFIX,datadoghq.eu,REJECT'));
  // The fork's REJECT exceptions must survive regeneration of both scripts.
  // Keep the narrower ChatGPT experiment host instead of rejecting chatgpt.com.
  const forkRejects = ['DOMAIN-SUFFIX,ab.chatgpt.com,REJECT', 'DOMAIN-SUFFIX,oaistatsig.com,REJECT'];
  assert.deepEqual(Array.from(cfg.rules.slice(0, BLOCK.length)), Array.from(BLOCK), file + ': fork REJECT ordering');
  // Bilibili PCDN: preserve the narrow wildcard, not the entire biliapi.net suffix.
  const biliRejects = [
    'DOMAIN-WILDCARD,*pcdn*.biliapi.net,REJECT',
    'DOMAIN-SUFFIX,mcdn.bilivideo.cn,REJECT',
    'DOMAIN-SUFFIX,mcdn.bilivideo.com,REJECT',
    'DOMAIN-SUFFIX,szbdyd.com,REJECT',
    'DOMAIN-SUFFIX,mountaintoys.cn,REJECT',
  ];
  assert.ok(!BLOCK.includes('DOMAIN-SUFFIX,biliapi.net,REJECT'), 'Do not reject all Bilibili API domains');
  assert.ok(!BLOCK.includes('DOMAIN-SUFFIX,bilivideo.com,REJECT'), 'Do not reject all Bilibili video domains');
  for (const rule of biliRejects) {
    assert.ok(BLOCK.includes(rule), file + ': missing maintained Bilibili REJECT rule ' + rule);
    assert.equal(
      cfg.rules.filter((entry) => entry === rule).length,
      1,
      file + ': duplicated or missing Bilibili REJECT ' + rule,
    );
    const claudeAt = cfg.rules.indexOf('DOMAIN-SUFFIX,anthropic.com,Claude固定出口');
    const aiAt = cfg.rules.indexOf('RULE-SET,ai,AI');
    assert.ok(claudeAt < 0 || cfg.rules.indexOf(rule) < claudeAt, file + ': REJECT must precede Claude ' + rule);
    assert.ok(aiAt < 0 || cfg.rules.indexOf(rule) < aiAt, file + ': REJECT must precede AI ' + rule);
  }
  // Targeted Douyin candidates: no blanket Douyin CDN or Douyu block.
  const douyinRejects = [
    'DOMAIN-SUFFIX,xycdn.com,REJECT',
    'DOMAIN,pull-hs-f5-hot.flive.douyincdn.com,REJECT',
  ];
  for (const rule of douyinRejects) {
    assert.ok(BLOCK.includes(rule), file + ': missing maintained Douyin REJECT rule ' + rule);
    assert.equal(
      cfg.rules.filter((item) => item === rule).length,
      1,
      file + ': absent or duplicate Douyin REJECT ' + rule,
    );
    const claudeAt = cfg.rules.indexOf('DOMAIN-SUFFIX,anthropic.com,Claude固定出口');
    const geminiAt = cfg.rules.indexOf('DOMAIN,gemini.google.com,Gemini Web');
    assert.ok(claudeAt < 0 || cfg.rules.indexOf(rule) < claudeAt, file + ': Douyin REJECT must precede Claude');
    assert.ok(geminiAt < 0 || cfg.rules.indexOf(rule) < geminiAt, file + ': Douyin REJECT must precede Gemini');
  }
  for (const tooBroad of [
    'DOMAIN-SUFFIX,douyincdn.com,REJECT',
    'DOMAIN-SUFFIX,douyinvod.com,REJECT',
    'DOMAIN-SUFFIX,douyucdn.cn,REJECT',
  ])
    assert.ok(!BLOCK.includes(tooBroad), file + ': too broad Douyin/Douyu block ' + tooBroad);
  for (const rule of forkRejects) {
    assert.ok(BLOCK.includes(rule), file + ': missing maintained reject rule ' + rule);
    assert.ok(cfg.rules.includes(rule), file + ': missing generated reject rule ' + rule);
    const claudeAt = cfg.rules.indexOf('DOMAIN-SUFFIX,anthropic.com,Claude固定出口');
    assert.ok(cfg.rules.indexOf(rule) < claudeAt, file + ': REJECT rule must precede Claude ' + rule);
    const geminiAt = cfg.rules.indexOf('DOMAIN,gemini.google.com,Gemini Web');
    assert.ok(geminiAt < 0 || cfg.rules.indexOf(rule) < geminiAt, file + ': REJECT rule must precede Gemini ' + rule);
  }
  assert.ok(!BLOCK.includes('DOMAIN-SUFFIX,chatgpt.com,REJECT'), 'Do not reject all ChatGPT');
  assert.ok(!BLOCK.includes('DOMAIN-SUFFIX,statsigapi.net,REJECT'), 'Do not reject shared Statsig');
  // Claude owns the requested registrable domains, including Datadog US intake.
  // A broad Datadog REJECT would shadow the new Claude rule.
  for (const domain of ['anthropic.com', 'claude.ai', 'claudeusercontent.com', 'datadoghq.com']) {
    const rule = 'DOMAIN-SUFFIX,' + domain + ',Claude固定出口';
    assert.ok(cfg.rules.includes(rule), file + ': missing suffix ' + domain);
  }
  assert.ok(!cfg.rules.includes('DOMAIN-SUFFIX,datadoghq.com,REJECT'));
  assert.ok(!cfg.rules.includes('DOMAIN-KEYWORD,datadoghq,REJECT'));
  assert.ok(cfg.rules.includes('DOMAIN-SUFFIX,siftscience.com,Claude固定出口'));
  // Test the published result, not just the injection source: only inbound
  // Anthropic IPv4 ranges are destination routes. Outbound ranges are for
  // Anthropic-initiated traffic and should not widen client-side routing.
  const inboundIpv4 = [
    'IP-CIDR,160.79.104.0/23,Claude固定出口,no-resolve',
    'IP-CIDR,153.61.224.0/22,Claude固定出口,no-resolve',
  ];
  for (const rule of inboundIpv4) {
    assert.ok(cfg.rules.includes(rule), file + ': missing inbound Claude IPv4 ' + rule);
    assert.ok(
      cfg.rules.indexOf(rule) < cfg.rules.indexOf('PROCESS-NAME,claude.exe,Claude固定出口'),
      file + ': inbound IP route should precede process fallback',
    );
  }
  for (const outbound of ['160.79.104.0/21', '153.61.208.0/20']) {
    assert.ok(
      !cfg.rules.includes('IP-CIDR,' + outbound + ',Claude固定出口,no-resolve'),
      file + ': outbound Anthropic source IP wrongly used as destination route ' + outbound,
    );
  }
  // Shared third-party domains must not be globally hijacked.
  const aiAt = cfg.rules.indexOf('RULE-SET,ai,AI');
  for (const rule of ['DOMAIN,anthropic-com.ghost.io,Claude固定出口', 'PROCESS-NAME,claude.exe,Claude固定出口']) {
    const at = cfg.rules.indexOf(rule);
    assert.ok(at >= 0 && (aiAt < 0 || at < aiAt), file + ': absent/late ' + rule);
  }
  for (const shared of [
    'storage.googleapis.com',
    'raw.githubusercontent.com',
    'challenges.cloudflare.com',
    'statsigapi.net',
    'intercom.io',
  ]) {
    assert.ok(
      !cfg.rules.some((rule) => rule.includes(',' + shared + ',Claude固定出口')),
      file + ': overbroad shared-domain rule for ' + shared,
    );
  }
  assert.ok(
    cfg.rules.indexOf('DOMAIN-SUFFIX,datadoghq.com,Claude固定出口') <
      cfg.rules.indexOf('PROCESS-NAME,claude.exe,Claude固定出口'),
  );

  const generatedRules = Array.from(vm.runInNewContext(source + '\nANTHROPIC_RULES', {}, { timeout: 5000 }));
  assert.ok(generatedRules.length >= 15, file + ': missing generated domain list');
  for (const rule of generatedRules) {
    assert.ok(cfg.rules.includes(rule), file + ': lost canonical Anthropic rule ' + rule);
  }
  for (const core of ['anthropic.com', 'claude.ai', 'claude.com', 'clau.de']) {
    assert.ok(cfg.rules.includes('DOMAIN-SUFFIX,' + core + ',Claude固定出口'), file + ': missing core domain ' + core);
  }
  const provider = cfg['rule-providers'].myclash_claude_anthropic;
  assert.ok(
    provider &&
      provider.type === 'http' &&
      provider.behavior === 'domain' &&
      provider.format === 'mrs' &&
      provider.url.startsWith(vm.runInNewContext(source + '\nruleSetBaseUrl', {}, { timeout: 5000 })) &&
      provider.url.endsWith('geosite/anthropic.mrs'),
  );
  const claudeIdx = cfg.rules.indexOf('RULE-SET,myclash_claude_anthropic,Claude固定出口');
  const aiIdx = cfg.rules.indexOf('RULE-SET,ai,AI');
  if (aiIdx >= 0) assert.ok(claudeIdx >= 0 && claudeIdx < aiIdx, file + ': Claude after AI');
  for (const core of ['anthropic.com', 'claude.ai', 'claude.com', 'clau.de'])
    assert.ok(aiIdx < 0 || cfg.rules.indexOf('DOMAIN-SUFFIX,' + core + ',Claude固定出口') < aiIdx);

  assert.ok(cfg.dns && cfg.tun && cfg.profile['store-selected']);
  if (pinned) {
    assert.ok(g.proxies.length <= 2);
    assert.equal(g.proxies[0], g.proxies.length === 2 ? pinned : 'REJECT');
  } else {
    assert.equal(g.proxies[0], 'REJECT');
    assert.equal(g.proxies.length, expectedTaiwan.length);
  }
  const noTw = main({
    proxies: [
      { name: '🇺🇸 美国 01', type: 'ss', server: 'example.net', port: 443, cipher: 'aes-128-gcm', password: 'test' },
    ],
    dns: {},
  });
  const noTwGroup = noTw['proxy-groups'].find((x) => x.name === 'Claude固定出口');
  assert.deepEqual(Array.from(noTwGroup.proxies), ['REJECT'], file + ': missing Taiwan must reject');
  assert.ok(!noTw['proxy-groups'].some((x) => x.type === 'fallback' || x.name.endsWith('-故障转移')));

  const upstream = originalUpstreamScript(source);
  const runner = (name) => vm.runInNewContext(patch(upstream, name, generatedRules) + '\nmain', {}, { timeout: 5000 });
  for (const name of ['🇹🇼 台湾 01', '🇹🇼 台湾 $& 01', '🇭🇰 香港 01']) {
    const config = structuredClone(sample);
    config.proxies.push({
      name: '🇹🇼 台湾 $& 01',
      type: 'ss',
      server: 'pinned.example.net',
      port: 443,
      cipher: 'aes-128-gcm',
      password: 'test',
    });
    const actual = runner(name)(config)['proxy-groups'].find((x) => x.name === 'Claude固定出口');
    assert.ok(actual, file + ': missing pinned group');
    const expected = name === '🇭🇰 香港 01' ? ['REJECT'] : [name, 'REJECT'];
    assert.deepEqual(Array.from(actual.proxies), expected, file + ': bad pinned name ' + name);
    assert.equal(
      actual['default-selected'],
      expected.length === 2 ? name : 'REJECT',
      file + ': default-selected mismatch',
    );
  }
  console.log('PASS ' + file);
}
