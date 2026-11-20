'use strict';

// Validate a Mihomo (Go RE2) regex and compile an equivalent JS RegExp for testing.
function compileRe2ForJs(regex) {
  if (typeof regex !== 'string' || regex.length > 256 || /[,\r\n]/.test(regex)) {
    throw Error('Invalid Gemini process_path_regex');
  }
  // Reject constructs invalid in Go RE2 (lookarounds, backrefs, JS-only (?<name>...) and \u{...}).
  if (
    /\(\?(?:=|!|<=|<!|<[A-Za-z_])/.test(regex) ||
    /\\[1-9]/.test(regex) ||
    /\\u\{[0-9a-fA-F]+\}/.test(regex)
  ) {
    throw Error('Unsupported RE2 process_path_regex construct');
  }
  // Guard against nested quantifiers (e.g. (a+)+, ([a-z]*)+) to prevent ReDoS in JS RegExp evaluation.
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,?\d*\})/.test(regex)) {
    throw Error('Unsafe nested quantifier in process_path_regex');
  }
  let flags = '';
  let body = regex;
  const leading = body.match(/^(?:\(\?([imsU-]+)\))+/);
  if (leading) {
    const rawFlags = leading[0].replace(/[()\?]/g, '');
    let negating = false;
    const active = new Set();
    for (const ch of rawFlags) {
      if (ch === '-') {
        negating = true;
      } else if (ch === 'i' || ch === 'm' || ch === 's') {
        if (negating) active.delete(ch);
        else active.add(ch);
      }
    }
    flags = [...active].join('');
    body = body.slice(leading[0].length);
  }
  // Translate RE2 (?P<name>...) and \A / \z anchors for JS RegExp syntax verification.
  const jsBody = body
    .replace(/\(\?P<([A-Za-z_][A-Za-z0-9_]*)>/g, '(?<$1>')
    .replace(/\\A/g, '^')
    .replace(/\\z/g, '$');
  try {
    return new RegExp(jsBody, flags);
  } catch (e) {
    throw Error('Invalid Gemini process regex: ' + e.message);
  }
}

// Gemini Web: one dedicated selector reusing existing upstream region groups.
// No country-specific selectors, fallback, load-balance, or ports are created.
function parseGeminiConfig(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw Error('Gemini config must be a JSON object');
  }
  const keys = Object.keys(obj);
  if (keys.length !== 2 || keys.some((k) => k !== 'in_users' && k !== 'process_path_regex')) {
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
    compileRe2ForJs(regex);
  }
  return { in_users: [...obj.in_users], process_path_regex: regex };
}

// Runtime: refs to upstream MyClash internals are intentional and guarded.
function addGeminiRoute(config, cfg) {
  if (
    typeof selectBaseOption === 'undefined' ||
    !selectBaseOption ||
    typeof selectBaseOption !== 'object' ||
    typeof iconBaseUrl !== 'string'
  ) {
    throw Error('Gemini route requires upstream selectBaseOption and iconBaseUrl');
  }
  if (
    !config ||
    !Array.isArray(config.proxies) ||
    !Array.isArray(config['proxy-groups']) ||
    !Array.isArray(config.rules)
  ) {
    throw Error('Missing MyClash Gemini input arrays');
  }
  if (!Array.isArray(cfg.in_users) || !cfg.in_users.length || typeof cfg.process_path_regex !== 'string') {
    throw Error('Missing validated GEMINI_CONFIG');
  }
  const groups = config['proxy-groups'];
  const groupByName = new Map();
  for (const g of groups) {
    if (g && typeof g.name === 'string' && g.name && !groupByName.has(g.name)) {
      groupByName.set(g.name, g);
    }
  }
  const existingProxies = new Set(
    config.proxies.filter((p) => p && typeof p.name === 'string' && p.name).map((p) => p.name),
  );
  const groupName = 'Gemini Web';
  if (groupByName.has(groupName) || existingProxies.has(groupName)) {
    throw Error('Gemini selector name collision');
  }
  if (!groupByName.has('默认代理')) throw Error('Missing 默认代理 group');
  // Reuse existing upstream groups unchanged; omit absent/lite-mode groups.
  const sharedOrder = ['手动选择', '美国', '日本', '新加坡', '台湾', '其他节点'];
  const sharedGroups = sharedOrder.filter((name) => {
    const group = groupByName.get(name);
    return group && Array.isArray(group.proxies) && group.proxies.length > 0;
  });
  const entry = {
    ...selectBaseOption,
    name: groupName,
    proxies: ['默认代理', ...sharedGroups],
    icon: iconBaseUrl + 'Google.svg',
    hidden: false,
  };
  const claudeIdx = groups.findIndex((g) => g && g.name === 'Claude固定出口');
  const defaultIdx = groups.findIndex((g) => g && g.name === '默认代理');
  const insertion = (claudeIdx >= 0 ? claudeIdx : defaultIdx) + 1;
  groups.splice(insertion, 0, entry);
  const global = groupByName.get('GLOBAL');
  if (!global || !Array.isArray(global.proxies)) throw Error('Missing GLOBAL group');
  if (!global.proxies.includes(groupName)) global.proxies.push(groupName);

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
  geminiRules.push('DOMAIN,gemini.gstatic.com,Gemini Web');
  geminiRules.push('DOMAIN,ai.google.dev,Gemini Web');
  geminiRules.push('DOMAIN,aistudio.google.com,Gemini Web');
  geminiRules.push('DOMAIN,alkalimakersuite-pa.clients6.google.com,Gemini Web');
  geminiRules.push('DOMAIN,webchannel-alkalimakersuite-pa.clients6.google.com,Gemini Web');
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
  const added = source.replace(
    expected,
    (match) =>
      match +
      '  // BEGIN MyClash-A- Gemini routing (generated)\n' +
      '  addGeminiRoute(newConfig, GEMINI_CONFIG);\n' +
      '  // END MyClash-A- Gemini routing\n',
  );
  const usersLiteral = '[' + parsed.in_users.map((u) => "'" + u + "'").join(', ') + ']';
  const regexLiteral = "'" + parsed.process_path_regex.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  return (
    added +
    '\n// Gemini Web P0 add-on (generated)\n' +
    'const GEMINI_CONFIG = {\n' +
    '  in_users: ' +
    usersLiteral +
    ',\n' +
    '  process_path_regex: ' +
    regexLiteral +
    ',\n};\n\n' +
    addGeminiRoute.toString() +
    '\n'
  );
}

module.exports = { parseGeminiConfig, patchGemini, addGeminiRoute, compileRe2ForJs };
