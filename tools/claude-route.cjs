'use strict';

const PROVIDER = 'myclash_claude_anthropic';

function parseAnthropicSource(source) {
  if (typeof source !== 'string' || !source.trim()) throw Error('Empty Anthropic source');
  const entries = new Set();
  for (const raw of source.split(/\r?\n/)) {
    const uncommented = raw.replace(/\s+#.*$/, () => '').trim();
    if (!uncommented || uncommented.startsWith('#')) continue;
    const attrMatch = uncommented.match(/(?:\s+@!?[a-z0-9._-]+)+\s*$/i);
    const attrs = attrMatch ? attrMatch[0].trim().split(/\s+/) : [];
    // Skip entries tagged @ads so advertising rules are not routed to Claude固定出口.
    if (attrs.some((token) => token.toLowerCase() === '@ads')) continue;
    const line = (attrMatch ? uncommented.slice(0, attrMatch.index) : uncommented).trim();
    if (!line) continue;
    let kind = 'DOMAIN-SUFFIX',
      domain = line;
    if (line.startsWith('full:')) {
      kind = 'DOMAIN';
      domain = line.slice(5);
    } else if (line.startsWith('domain:')) {
      domain = line.slice(7);
    } else if (line.startsWith('keyword:')) {
      kind = 'DOMAIN-KEYWORD';
      domain = line.slice(8);
    } else if (line.includes(':')) {
      throw Error('Unsupported Anthropic directive: ' + line);
    }
    domain = domain.trim().toLowerCase();
    if (
      !domain ||
      !/^[a-z0-9.-]+$/i.test(domain) ||
      domain.startsWith('.') ||
      domain.endsWith('.') ||
      domain.includes('..') ||
      (kind !== 'DOMAIN-KEYWORD' && !domain.includes('.'))
    ) {
      throw Error('Invalid Anthropic domain: ' + line);
    }
    entries.add(kind + ',' + domain + ',Claude固定出口');
  }
  for (const d of ['anthropic.com', 'claude.ai', 'claude.com']) {
    if (!entries.has('DOMAIN-SUFFIX,' + d + ',Claude固定出口')) {
      throw Error('Missing critical Anthropic domain: ' + d);
    }
  }
  return [...entries].sort();
}

const BLOCK = [
  'DOMAIN-SUFFIX,sentry.io,REJECT',
  'DOMAIN-SUFFIX,datadoghq.eu,REJECT',
  'DOMAIN-SUFFIX,ab.chatgpt.com,REJECT',
  'DOMAIN-SUFFIX,oaistatsig.com,REJECT',
  // Targeted event collection and browser analytics; no broad Segment/Fathom or Datadog block.
  'DOMAIN,api.segment.io,REJECT',
  'DOMAIN,cdn.usefathom.com,REJECT',
  'DOMAIN,browser-intake-us5-datadoghq.com,REJECT',
  'DOMAIN,http-intake.logs.us5.datadoghq.com,REJECT',
  // Bilibili PCDN and specified domains; keep the narrow wildcard, not the entire biliapi.net.
  'DOMAIN-WILDCARD,*pcdn*.biliapi.net,REJECT',
  'DOMAIN-SUFFIX,mcdn.bilivideo.cn,REJECT',
  'DOMAIN-SUFFIX,mcdn.bilivideo.com,REJECT',
  'DOMAIN-SUFFIX,szbdyd.com,REJECT',
  'DOMAIN-SUFFIX,mountaintoys.cn,REJECT',
  // Targeted Douyin candidates only; do not block general Douyin CDNs or Douyu.
  'DOMAIN-SUFFIX,xycdn.com,REJECT',
  'DOMAIN,pull-hs-f5-hot.flive.douyincdn.com,REJECT',
];

const ROUTE = [
  // Explicit safety belt in addition to the canonical Anthropic domain source and MRS rule-set.
  'DOMAIN-SUFFIX,anthropic.com,Claude固定出口',
  'DOMAIN-SUFFIX,claude.ai,Claude固定出口',
  'DOMAIN-SUFFIX,claude.com,Claude固定出口',
  'DOMAIN-SUFFIX,claude.dev,Claude固定出口',
  'DOMAIN-SUFFIX,clau.de,Claude固定出口',
  'DOMAIN-SUFFIX,claudeusercontent.com,Claude固定出口',
  // Datadog shared domain still uses Claude except the exact intake host blocked above.
  'DOMAIN-SUFFIX,datadoghq.com,Claude固定出口',
  'DOMAIN-SUFFIX,claudemcpcontent.com,Claude固定出口',
  // Exact third-party web endpoints; do not redirect their shared parent domains.
  'DOMAIN,api-iam.intercom.io,Claude固定出口',
  'DOMAIN,nexus-websocket-a.intercom.io,Claude固定出口',
  'DOMAIN,anthropic.auth0.com,Claude固定出口',
  'DOMAIN,anthropic.com.cdn.cloudflare.net,Claude固定出口',
  // Anthropic-branded Ghost CMS host; use exact hostname, not the shared ghost.io suffix.
  'DOMAIN,anthropic-com.ghost.io,Claude固定出口',
  'DOMAIN-SUFFIX,siftscience.com,Claude固定出口',
  'DOMAIN-SUFFIX,sift.com,Claude固定出口',
  'DOMAIN-SUFFIX,growthbook.io,Claude固定出口',
  // User-requested non-Claude website sharing the Claude selector (including its subdomains).
  'DOMAIN-SUFFIX,javdb.com,Claude固定出口',
  // Anthropic inbound IPv4 destinations (client -> Anthropic).
  // Do not substitute outbound /21 and /20, which are source IPs for Anthropic-initiated calls.
  'IP-CIDR,160.79.104.0/23,Claude固定出口,no-resolve',
  'IP-CIDR,153.61.224.0/22,Claude固定出口,no-resolve',
  'IP-CIDR6,2607:6bc0::/48,Claude固定出口,no-resolve',
  'IP-CIDR6,2607:6bc0:11::/48,Claude固定出口,no-resolve',
  'IP-ASN,399358,Claude固定出口,no-resolve',
  'PROCESS-NAME,claude.exe,Claude固定出口',
];

function addClaudeRoute(config, pinnedNode, anthropicRules) {
  if (
    !Array.isArray(anthropicRules) ||
    anthropicRules.length < 15 ||
    !anthropicRules.every((r) => typeof r === 'string' && r.endsWith(',Claude固定出口'))
  )
    throw Error('Missing generated Anthropic domain rules');
  if (
    !config ||
    !Array.isArray(config.proxies) ||
    !Array.isArray(config['proxy-groups']) ||
    !Array.isArray(config.rules)
  )
    throw Error('Missing MyClash Claude input arrays');
  if (!config['rule-providers'] || config['rule-providers'][PROVIDER])
    throw Error('Anthropic provider collision or missing providers');
  if (typeof ruleSetBaseUrl === 'undefined' || typeof ruleSetBaseUrl !== 'string')
    throw Error('Claude route requires upstream ruleSetBaseUrl string');
  config['rule-providers'][PROVIDER] = {
    type: 'http',
    format: 'mrs',
    behavior: 'domain',
    interval: 86400,
    url: ruleSetBaseUrl + 'geosite/anthropic.mrs',
    path: './ruleset/myclash_claude_anthropic.mrs',
    'path-in-bundle': 'geo/geosite/anthropic.mrs',
  };

  const groupName = 'Claude固定出口';
  const groups = config['proxy-groups'];
  const groupNames = new Set();
  for (const g of groups) {
    if (g && typeof g.name === 'string') {
      groupNames.add(g.name);
    }
  }
  const excludedTypes = new Set(['direct', 'reject', 'reject-drop', 'pass', 'compatible']);
  const names = new Set();
  for (const p of config.proxies) {
    if (p && typeof p.name === 'string' && !excludedTypes.has(String(p.type).toLowerCase())) {
      names.add(p.name);
    }
  }
  if (groupNames.has(groupName) || names.has(groupName)) throw Error('Claude group name collision');

  // Match the Taiwanese region using upstream's own classification rules.
  // Unlike a name-only filter, this is consistent with normalized custom proxies.
  const taiwanNodes = [...names].filter((name) => getMatchedRegions(name).some((region) => region.name === '台湾'));
  const taiwanSet = new Set(taiwanNodes);
  const candidateTaiwanGroups = ['台湾', '台湾-自动选择'];
  const taiwanGroups = candidateTaiwanGroups.filter((name) => groupNames.has(name) && taiwanNodes.length > 0);
  const available = Boolean(pinnedNode && taiwanSet.has(pinnedNode));
  const choices = pinnedNode
    ? available
      ? [pinnedNode, 'REJECT']
      : ['REJECT']
    : ['REJECT', ...taiwanNodes, ...taiwanGroups];
  const defaultIndex = groups.findIndex((g) => g && g.name === '默认代理');
  const insertAt = defaultIndex < 0 ? 0 : defaultIndex + 1;
  const hasBaseSelect = typeof selectBaseOption === 'object' && selectBaseOption !== null;
  const baseSelect = hasBaseSelect ? selectBaseOption : { type: 'select' };
  groups.splice(insertAt, 0, {
    ...baseSelect,
    name: groupName,
    type: 'select',
    proxies: choices,
    'default-selected': available ? pinnedNode : 'REJECT',
  });
  const global = groups.find((g) => g && g.name === 'GLOBAL');
  if (global && Array.isArray(global.proxies) && !global.proxies.includes(groupName)) global.proxies.push(groupName);
  // Deduplicate identical rules while preserving first-seen priority order.
  const mergedRules = [
    ...BLOCK,
    ...anthropicRules,
    'RULE-SET,' + PROVIDER + ',Claude固定出口',
    ...ROUTE,
    ...config['rules'],
  ];
  config['rules'] = [...new Set(mergedRules)];
}

function patch(source, pinnedNode = '', anthropicRules) {
  if (!Array.isArray(anthropicRules) || anthropicRules.length < 15) throw Error('Missing Anthropic domains');
  const reservedNodes = ['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL', '直连'];
  if (
    typeof pinnedNode !== 'string' ||
    pinnedNode.length > 256 ||
    /[\r\n]/.test(pinnedNode) ||
    reservedNodes.includes(pinnedNode.trim().toUpperCase())
  )
    throw Error('Invalid pinned node name');
  if (
    typeof source !== 'string' ||
    source.includes('BEGIN MyClash-A- Claude routing') ||
    !source.includes("newConfig['proxy-groups']") ||
    !source.includes("newConfig['rules']")
  )
    throw Error('Unexpected MyClash upstream layout');
  const matches = source.match(/ {2}return newConfig;/g) || [];
  if (matches.length !== 1) throw Error('Expected single return newConfig');
  const quoteSingle = (val) => "'" + val.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const fmtArr = (arr) => '[\n' + arr.map((item) => '  ' + quoteSingle(item) + ',').join('\n') + '\n]';
  const result = source.replace(
    / {2}return newConfig;/,
    () =>
      '  // BEGIN MyClash-A- Claude routing (generated)\n' +
      '  addClaudeRoute(newConfig, ' +
      quoteSingle(pinnedNode) +
      ', ANTHROPIC_RULES);\n' +
      '  // END MyClash-A- Claude routing\n' +
      '  return newConfig;',
  );
  return (
    result +
    '\n// Shared add-on: upstream MyClash code is otherwise unchanged.\n' +
    'const PROVIDER = ' +
    quoteSingle(PROVIDER) +
    ';\n' +
    'const ANTHROPIC_RULES = ' +
    fmtArr(anthropicRules) +
    ';\n' +
    'const BLOCK = ' +
    fmtArr(BLOCK) +
    ';\n' +
    'const ROUTE = ' +
    fmtArr(ROUTE) +
    ';\n\n' +
    addClaudeRoute.toString() +
    '\n'
  );
}

module.exports = { patch, parseAnthropicSource, addClaudeRoute, PROVIDER, BLOCK, ROUTE };
