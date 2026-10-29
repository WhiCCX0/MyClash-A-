'use strict';

// Gemini Web P0: a dedicated selector and five independent country selectors.
// No fallback, url-test, load-balance, or extra listening ports are created here.
function parseGeminiConfig(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw Error('Gemini config must be a JSON object');
  }
  const keys = Object.keys(obj);
  if (keys.length !== 2 || keys.some(k => k !== 'in_users' && k !== 'process_path_regex')) {
    throw Error('Gemini config must contain only in_users and process_path_regex');
  }
  if (!Array.isArray(obj.in_users) || obj.in_users.length < 1 || obj.in_users.length > 8) {
    throw Error('in_users must contain 1 to 8 users');
  }
  const userSet = new Set();
  for (const user of obj.in_users) {
    if (typeof user !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(user)) {
      throw Error('Invalid Gemini in-user: ' + String(user));
    }
    if (userSet.has(user)) throw Error('Duplicate Gemini in-user: ' + user);
    userSet.add(user);
  }
  const regex = obj.process_path_regex;
  if (typeof regex !== 'string' || regex.length > 256 || /[,\r\n]/.test(regex)) {
    throw Error('Invalid Gemini process_path_regex');
  }
  if (regex) {
    try { new RegExp(regex); } catch (e) { throw Error('Invalid Gemini process regex: ' + e.message); }
  }
  return {in_users: [...obj.in_users], process_path_regex: regex};
}

// Runtime: refs to upstream MyClash internals are intentional and guarded.
function addGeminiRoute(config, cfg) {
  if (typeof getMatchedRegions !== 'function' ||
      typeof regionDefinitions === 'undefined' || !Array.isArray(regionDefinitions) ||
      typeof selectBaseOption === 'undefined' || !selectBaseOption ||
      typeof selectBaseOption !== 'object' ||
      typeof iconBaseUrl !== 'string') {
    throw Error('Gemini route requires upstream region helpers and selectBaseOption');
  }
  if (!config || !Array.isArray(config.proxies) ||
      !Array.isArray(config['proxy-groups']) || !Array.isArray(config.rules)) {
    throw Error('Missing MyClash Gemini input arrays');
  }
  if (!Array.isArray(cfg.in_users) || !cfg.in_users.length ||
      typeof cfg.process_path_regex !== 'string') {
    throw Error('Missing validated GEMINI_CONFIG');
  }
  const order = ['美国', '日本', '新加坡', '香港', '台湾'];
  const groups = config['proxy-groups'];
  const names = new Set(groups.map(g => g.name));
  const existingProxies = new Set(config.proxies.map(p => p.name));
  const definitions = new Map(regionDefinitions.map(r => [r.name, r]));
  const byRegion = new Map(order.map(name => [name, []]));
  const seen = new Map(order.map(name => [name, new Set()]));
  const excluded = new Set(['direct', 'reject', 'reject-drop', 'pass', 'compatible']);

  for (const proxy of config.proxies) {
    if (!proxy || typeof proxy.name !== 'string' ||
        excluded.has(String(proxy.type).toLowerCase())) continue;
    const matched = getMatchedRegions(proxy.name);
    if (!Array.isArray(matched)) throw Error('Unexpected region match result');
    for (const region of matched) {
      if (!byRegion.has(region.name) || seen.get(region.name).has(proxy.name)) continue;
      seen.get(region.name).add(proxy.name);
      byRegion.get(region.name).push(proxy.name);
    }
  }
  const selections = [];
  for (const name of order) {
    if (!byRegion.get(name).length) continue;
    const groupName = 'Gemini ' + name;
    const definition = definitions.get(name);
    if (!definition || typeof definition.icon !== 'string') {
      throw Error('Missing upstream Gemini region icon: ' + name);
    }
    if (names.has(groupName) || existingProxies.has(groupName)) {
      throw Error('Gemini region name collision: ' + groupName);
    }
    names.add(groupName);
    selections.push({
      ...selectBaseOption,
      name: groupName,
      proxies: byRegion.get(name),
      icon: definition.icon,
      hidden: false,
    });
  }
  const groupName = 'Gemini Web';
  if (names.has(groupName) || existingProxies.has(groupName)) {
    throw Error('Gemini selector name collision');
  }
  if (!names.has('默认代理')) throw Error('Missing 默认代理 group');
  const entry = {
    ...selectBaseOption,
    name: groupName,
    proxies: ['默认代理', ...selections.map(g => g.name)],
    icon: iconBaseUrl + 'Google.svg',
    hidden: false,
  };
  const claudeIdx = groups.findIndex(g => g.name === 'Claude固定出口');
  const defaultIdx = groups.findIndex(g => g.name === '默认代理');
  const insertion = (claudeIdx >= 0 ? claudeIdx : defaultIdx) + 1;
  groups.splice(insertion, 0, entry, ...selections);
  const global = groups.find(g => g.name === 'GLOBAL');
  if (!global || !Array.isArray(global.proxies)) throw Error('Missing GLOBAL group');
  for (const name of [groupName, ...selections.map(g => g.name)]) {
    if (!global.proxies.includes(name)) global.proxies.push(name);
  }

  // Preserve the entire Claude block: insert immediately after its last ROUTE entry.
  if (typeof ROUTE === 'undefined' || !Array.isArray(ROUTE) || !ROUTE.length) {
    throw Error('Missing Claude ROUTE constant');
  }
  const lastClaudeRule = ROUTE[ROUTE.length - 1];
  const lastIndex = config.rules.indexOf(lastClaudeRule);
  if (lastIndex < 0 || lastIndex !== config.rules.lastIndexOf(lastClaudeRule)) {
    throw Error('Claude routing tail missing or ambiguous');
  }
  const geminiRules = ['IN-USER,' + cfg.in_users.join('/') + ',Gemini Web'];
  if (cfg.process_path_regex) {
    geminiRules.push('PROCESS-PATH-REGEX,' + cfg.process_path_regex + ',Gemini Web');
  }
  geminiRules.push('DOMAIN,gemini.google.com,Gemini Web');
  config.rules.splice(lastIndex + 1, 0, ...geminiRules);
}

function patchGemini(source, cfg) {
  const parsed = parseGeminiConfig(cfg);
  if (typeof source !== 'string') throw Error('Expected generated Claude source');
  const ends = source.match(/\/\/ END MyClash-A- Claude routing/g) || [];
  if (ends.length !== 1) throw Error('Expected exactly one Claude END marker');
  if (source.includes('BEGIN MyClash-A- Gemini routing')) {
    throw Error('Already injected Gemini routing');
  }
  const returns = source.match(/^  return newConfig;[ \t]*$/gm) || [];
  if (returns.length !== 1) throw Error('Expected one upstream return newConfig');
  const expected = /^  \/\/ END MyClash-A- Claude routing[ \t]*\r?\n(?=  return newConfig;[ \t]*$)/m;
  if (!expected.test(source)) throw Error('Unexpected Claude injection boundary');
  const added = source.replace(expected, (match) => match +
    '  // BEGIN MyClash-A- Gemini routing (generated)\n' +
    '  addGeminiRoute(newConfig, GEMINI_CONFIG);\n' +
    '  // END MyClash-A- Gemini routing\n');
  return added + '\n// Gemini Web P0 add-on (generated)\n' +
    'const GEMINI_CONFIG=' + JSON.stringify(parsed) + ';\n' +
    addGeminiRoute.toString() + '\n';
}

module.exports = {parseGeminiConfig, patchGemini, addGeminiRoute};
