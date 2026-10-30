'use strict';
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const { parseGeminiConfig, patchGemini } = require('./gemini-route.cjs');
const routeConfig = parseGeminiConfig(JSON.parse(fs.readFileSync('gemini-route.json', 'utf8')));
const expectedGeminiRules = [
  'IN-USER,' + routeConfig.in_users.join('/') + ',Gemini Web',
  ...(routeConfig.process_path_regex ? ['PROCESS-PATH-REGEX,' + routeConfig.process_path_regex + ',Gemini Web'] : []),
  'DOMAIN,gemini.google.com,Gemini Web',
  'DOMAIN,gemini.gstatic.com,Gemini Web',
  'DOMAIN,ai.google.dev,Gemini Web',
  'DOMAIN,aistudio.google.com,Gemini Web',
  'DOMAIN,alkalimakersuite-pa.clients6.google.com,Gemini Web',
  'DOMAIN,webchannel-alkalimakersuite-pa.clients6.google.com,Gemini Web',
];
const sharedOrder = ['手动选择', '美国', '日本', '新加坡', '台湾', '其他节点'];
const names = [
  '🇺🇸 US 01',
  '美国 02',
  '🇯🇵 JP 01',
  '日本 02',
  '🇸🇬 SG 01',
  '新加坡 02',
  '🇭🇰 HK 01',
  '香港 02',
  '🇹🇼 TW 01',
  '台湾 02',
  'Mystery 01',
];
const node = (name, i, type = 'ss') => ({
  name,
  type,
  server: 'node' + i + '.example.net',
  port: 443,
  cipher: 'aes-128-gcm',
  password: 'test',
});
const sample = { proxies: [...names.map((n, i) => node(n, i)), node('🇺🇸 US DIRECT', 50, 'direct')], dns: {} };
const plain = (x) => JSON.parse(JSON.stringify(x));
let passed = 0,
  failed = 0;
function check(label, run) {
  try {
    run();
    console.log('PASS ' + label);
    passed++;
  } catch (e) {
    console.error('FAIL ' + label + '\n' + (e.stack || e));
    failed++;
  }
}
function load(s) {
  return vm.runInNewContext(s + '\n({main,getMatchedRegions,regionDefinitions})', {}, { timeout: 5000 });
}
function claudeOnly(s) {
  const marker = '// Gemini Web P0 add-on (generated)';
  assert.equal(s.split(marker).length, 2, 'One Gemini suffix required');
  const head = s.split(marker)[0];
  const block =
    /^  \/\/ BEGIN MyClash-A- Gemini routing \(generated\)[\s\S]*?^  \/\/ END MyClash-A- Gemini routing[ \t]*\r?\n/gm;
  assert.equal((head.match(block) || []).length, 1, 'One Gemini injection required');
  const restored = head.replace(block, () => '');
  assert.match(
    restored,
    /^  \/\/ END MyClash-A- Claude routing\r?\n  return newConfig;[ \t]*$/m,
    'Claude END must be immediately followed by return newConfig with no blank line',
  );
  return restored;
}
check('parse/accept default', () =>
  assert.deepEqual(parseGeminiConfig({ in_users: ['gemini-01'], process_path_regex: '' }), {
    in_users: ['gemini-01'],
    process_path_regex: '',
  }),
);
const bad = {
  'extra key': { in_users: ['a'], process_path_regex: '', extra: 1 },
  'missing key': { in_users: ['a'] },
  'empty users': { in_users: [], process_path_regex: '' },
  'too many users': { in_users: Array.from({ length: 9 }, (_, i) => 'u' + i), process_path_regex: '' },
  duplicate: { in_users: ['a', 'a'], process_path_regex: '' },
  slash: { in_users: ['a/b'], process_path_regex: '' },
  'comma in user': { in_users: ['a,b'], process_path_regex: '' },
  space: { in_users: ['a b'], process_path_regex: '' },
  'regex comma': { in_users: ['a'], process_path_regex: 'a,b' },
  'regex newline': { in_users: ['a'], process_path_regex: 'a\nb' },
  'regex invalid': { in_users: ['a'], process_path_regex: '[bad' },
  'regex long': { in_users: ['a'], process_path_regex: 'x'.repeat(257) },
  'RE2 positive lookahead': { in_users: ['a'], process_path_regex: 'foo(?=bar)' },
  'RE2 negative lookahead': { in_users: ['a'], process_path_regex: 'foo(?!bar)' },
  'RE2 positive lookbehind': { in_users: ['a'], process_path_regex: '(?<=foo)bar' },
  'RE2 negative lookbehind': { in_users: ['a'], process_path_regex: '(?<!foo)bar' },
  'RE2 backreference': { in_users: ['a'], process_path_regex: String.raw`\1` },
  'not object': null,
};
for (const value of ['(?i)gemini\\.exe$', '(?s)(?i)gemini.*', '(?-i)Gemini']) {
  check('parse/accept RE2 inline flags ' + value, () => {
    assert.equal(parseGeminiConfig({ in_users: ['a'], process_path_regex: value }).process_path_regex, value);
  });
}
for (const [label, cfg] of Object.entries(bad))
  check('parse/reject ' + label, () => assert.throws(() => parseGeminiConfig(cfg)));
for (const file of ['Script/mihomoScript.js', 'Script/Script.js']) {
  const source = fs.readFileSync(file, 'utf8'),
    original = claudeOnly(source);
  const api = load(source),
    oldApi = load(original),
    cfg = api.main(structuredClone(sample)),
    old = oldApi.main(structuredClone(sample));
  const groups = cfg['proxy-groups'],
    oldGroups = old['proxy-groups'];
  const byName = new Map(groups.map((g) => [g.name, g]));
  const oldByName = new Map(oldGroups.map((g) => [g.name, g]));
  const gemini = byName.get('Gemini Web');
  const expectedGroupNames = [
    '默认代理',
    ...sharedOrder.filter((name) => {
      const g = oldByName.get(name);
      return g && Array.isArray(g.proxies) && g.proxies.length > 0;
    }),
  ];
  check(file + '/root select reuses upstream groups in exact order', () => {
    assert.ok(gemini);
    assert.equal(gemini.type, 'select');
    assert.equal(gemini.hidden, false);
    assert.deepEqual(plain(gemini.proxies), expectedGroupNames);
    assert.ok(!gemini.proxies.includes('香港'));
    assert.ok(gemini.proxies.every((n) => !n.endsWith('-自动选择')));
    assert.ok(gemini.proxies.every((n) => !['DIRECT', 'REJECT', '直连'].includes(n)));
    assert.ok(gemini.proxies.every((n) => oldByName.has(n)));
  });
  check(file + '/only Gemini Web added, no generated region groups', () => {
    assert.equal(byName.size, groups.length);
    assert.equal(groups.length, oldGroups.length + 1);
    assert.deepEqual(plain(groups.filter((g) => !oldByName.has(g.name)).map((g) => g.name)), ['Gemini Web']);
    for (const g of groups) assert.ok(!/^Gemini (美国|日本|新加坡|香港|台湾)$/.test(g.name));
    assert.ok(!('strategy' in gemini));
    assert.ok(!('hash-key' in gemini));
  });
  check(file + '/upstream region groups have exactly unchanged content', () => {
    const scope = ['美国', '日本', '新加坡', '台湾', '香港', '其他节点'];
    for (const name of scope) assert.deepEqual(plain(byName.get(name)), plain(oldByName.get(name)), name);
    for (const g of oldGroups) {
      if (g.name === 'GLOBAL') continue;
      assert.deepEqual(plain(byName.get(g.name)), plain(g), g.name);
    }
  });
  check(file + '/GLOBAL only adds Gemini Web once', () => {
    const global = byName.get('GLOBAL').proxies,
      baseline = oldByName.get('GLOBAL').proxies;
    assert.equal(global.filter((n) => n === 'Gemini Web').length, 1);
    assert.deepEqual(plain(global.filter((n) => n !== 'Gemini Web')), plain(baseline));
    assert.ok(!global.some((n) => /^Gemini (美国|日本|新加坡|香港|台湾)$/.test(n)));
  });
  check(file + '/Claude selector invariant', () => {
    assert.deepEqual(plain(byName.get('Claude固定出口')), plain(oldByName.get('Claude固定出口')));
  });
  check(file + '/rules exact config-derived count, order and priority', () => {
    const rules = cfg.rules,
      at = rules.indexOf('PROCESS-NAME,claude.exe,Claude固定出口');
    assert.ok(at >= 0);
    assert.equal(expectedGeminiRules.length, 1 + Number(Boolean(routeConfig.process_path_regex)) + 6);
    assert.deepEqual(plain(rules.slice(at + 1, at + 1 + expectedGeminiRules.length)), expectedGeminiRules);
    assert.equal(rules.filter((r) => r.endsWith(',Gemini Web')).length, expectedGeminiRules.length);
    assert.equal(rules.filter((r) => r.startsWith('IN-USER,') && r.endsWith(',Gemini Web')).length, 1);
    assert.equal(
      rules.filter((r) => r.startsWith('PROCESS-PATH-REGEX,') && r.endsWith(',Gemini Web')).length,
      Number(Boolean(routeConfig.process_path_regex)),
    );
    for (const rule of ['RULE-SET,google,Google', 'RULE-SET,ai,AI'])
      if (rules.includes(rule)) assert.ok(rules.indexOf(rule) > at + expectedGeminiRules.length);
  });
  check(file + '/process regex accepts both Windows backends only', () => {
    const lines = cfg.rules.filter((r) => r.startsWith('PROCESS-PATH-REGEX,') && r.endsWith(',Gemini Web'));
    assert.equal(lines.length, 1);
    const pattern = lines[0].slice('PROCESS-PATH-REGEX,'.length, -',Gemini Web'.length);
    assert.equal(pattern, routeConfig.process_path_regex);
    const regex = new RegExp(pattern);
    assert.ok(regex.test('D:\\x\\bin\\gemini-web2api-go.exe'));
    assert.ok(regex.test('D:\\x\\package\\aistudio2api.exe'));
    assert.ok(!regex.test('D:\\x\\camoufox.exe'));
    assert.ok(!regex.test('D:\\x\\gemini-web2api-go.exe.bak'));
  });
  check(file + '/no shared Google or gstatic domain rules', () => {
    const forbidden = [
      'accounts.google.com',
      'content-push.googleapis.com',
      'push.clients6.google.com',
      'googleusercontent.com',
      'usercontent.google.com',
      'www.google.com',
      'generativelanguage.googleapis.com',
      'www.gstatic.com',
      'ssl.gstatic.com',
    ];
    const rules = cfg.rules.filter((rule) => rule.endsWith(',Gemini Web'));
    assert.ok(!rules.some((rule) => forbidden.some((domain) => rule.includes(domain))));
    assert.ok(!rules.some((rule) => rule.includes('DOMAIN-SUFFIX,gstatic.com') || rule.includes('DOMAIN,gstatic.com')));
    for (const domain of [
      'gemini.gstatic.com',
      'ai.google.dev',
      'aistudio.google.com',
      'alkalimakersuite-pa.clients6.google.com',
      'webchannel-alkalimakersuite-pa.clients6.google.com',
    ])
      assert.equal(rules.filter((rule) => rule === 'DOMAIN,' + domain + ',Gemini Web').length, 1);
  });
  check(file + '/Claude-only deep invariants', () => {
    const current = plain(cfg),
      base = plain(old);
    const start = current.rules.indexOf(expectedGeminiRules[0]);
    assert.ok(start >= 0);
    assert.deepEqual(current.rules.slice(start, start + expectedGeminiRules.length), expectedGeminiRules);
    current.rules.splice(start, expectedGeminiRules.length);
    current['proxy-groups'] = current['proxy-groups'].filter((g) => g.name !== 'Gemini Web');
    const global = current['proxy-groups'].find((g) => g.name === 'GLOBAL');
    global.proxies = global.proxies.filter((n) => n !== 'Gemini Web');
    for (const key of ['rules', 'proxy-groups', 'proxies', 'dns', 'tun', 'mixed-port', 'rule-providers'])
      assert.deepEqual(current[key], base[key], key);
  });
  check(file + '/only US edge', () => {
    const g = api.main({ proxies: [node('🇺🇸 US 01', 1), node('美国 02', 2)], dns: {} })['proxy-groups'];
    assert.deepEqual(plain(g.find((x) => x.name === 'Gemini Web').proxies), ['默认代理', '手动选择', '美国']);
  });
  check(file + '/only nonregional edge', () => {
    const g = api.main({ proxies: [node('Mystery 01', 1)], dns: {} })['proxy-groups'];
    assert.deepEqual(plain(g.find((x) => x.name === 'Gemini Web').proxies), ['默认代理', '手动选择', '其他节点']);
  });
  check(file + '/manual selection disabled skips missing upstream group', () => {
    assert.equal((source.match(/手动选择:\s*true/g) || []).length, 1);
    const disabled = load(source.replace(/手动选择:\s*true/, () => '手动选择: false')).main(structuredClone(sample))[
      'proxy-groups'
    ];
    const expected = [
      '默认代理',
      ...sharedOrder.filter(
        (name) =>
          name !== '手动选择' &&
          disabled.some((g) => g.name === name && Array.isArray(g.proxies) && g.proxies.length > 0),
      ),
    ];
    assert.ok(!disabled.some((g) => g.name === '手动选择'));
    assert.deepEqual(plain(disabled.find((g) => g.name === 'Gemini Web').proxies), expected);
  });
  check(file + '/minimal mode only default', () => {
    assert.equal((source.match(/极简模式:\s*false/g) || []).length, 1);
    const lite = load(source.replace(/极简模式:\s*false/, () => '极简模式: true')).main(structuredClone(sample))[
      'proxy-groups'
    ];
    const keys = new Set(lite.map((x) => x.name));
    assert.ok(keys.has('默认代理'));
    assert.deepEqual(plain(lite.find((x) => x.name === 'Gemini Web').proxies), ['默认代理']);
    assert.equal(lite.filter((g) => g.name === 'Gemini Web').length, 1);
  });
  check(file + '/optional regex + multiple users', () => {
    const opt = { in_users: ['alpha', 'beta'], process_path_regex: '^D:\\\\AI\\\\Tools\\\\gemini\\.exe$' };
    const customized = load(patchGemini(original, opt)).main(structuredClone(sample));
    const rules = customized.rules,
      at = rules.indexOf('IN-USER,alpha/beta,Gemini Web');
    assert.ok(at > 0);
    assert.equal(rules[at + 1], 'PROCESS-PATH-REGEX,' + opt.process_path_regex + ',Gemini Web');
    assert.equal(rules[at + 2], 'DOMAIN,gemini.google.com,Gemini Web');
    assert.equal(rules[at + 3], 'DOMAIN,gemini.gstatic.com,Gemini Web');
    assert.equal(rules[at + 4], 'DOMAIN,ai.google.dev,Gemini Web');
    assert.equal(rules[at + 5], 'DOMAIN,aistudio.google.com,Gemini Web');
    assert.equal(rules[at + 6], 'DOMAIN,alkalimakersuite-pa.clients6.google.com,Gemini Web');
    assert.equal(rules[at + 7], 'DOMAIN,webchannel-alkalimakersuite-pa.clients6.google.com,Gemini Web');
    assert.equal(rules.filter((r) => r.startsWith('PROCESS-PATH-REGEX,')).length, 1);
  });
  check(file + '/empty process_path_regex produces complete ordered rules', () => {
    const noProcess = { in_users: [...routeConfig.in_users], process_path_regex: '' };
    const runtime = load(patchGemini(original, noProcess)).main(structuredClone(sample));
    const rules = runtime.rules,
      at = rules.indexOf('IN-USER,' + noProcess.in_users.join('/') + ',Gemini Web');
    const expected = expectedGeminiRules.filter((rule) => !rule.startsWith('PROCESS-PATH-REGEX,'));
    assert.ok(at >= 0);
    assert.deepEqual(plain(rules.slice(at, at + expected.length)), expected);
    assert.equal(rules.filter((r) => r.endsWith(',Gemini Web')).length, expected.length);
    assert.ok(!rules.some((r) => r.startsWith('PROCESS-PATH-REGEX,') && r.endsWith(',Gemini Web')));
    assert.deepEqual(
      plain(runtime['proxy-groups'].find((g) => g.name === 'Gemini Web').proxies),
      plain(gemini.proxies),
    );
  });
  check(file + '/patch rejects duplicate or missing Claude', () => {
    assert.throws(() => patchGemini(source, { in_users: ['gemini-01'], process_path_regex: '' }));
    assert.throws(() =>
      patchGemini(
        original.replace('// END MyClash-A- Claude routing', () => '// removed'),
        { in_users: ['gemini-01'], process_path_regex: '' },
      ),
    );
  });
}
console.log('SUMMARY Gemini P0: passed=' + passed + ' failed=' + failed + ' total=' + (passed + failed));
if (failed) process.exitCode = 1;
