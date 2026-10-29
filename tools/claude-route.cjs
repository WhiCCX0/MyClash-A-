'use strict';
// Maintained Claude domains: v2fly/domain-list-community data/anthropic.
const PROVIDER = 'myclash_claude_anthropic';
const PROVIDER_URL = 'https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/anthropic.mrs';
function parseAnthropicSource(source) {
  if (typeof source !== 'string' || !source.trim()) throw Error('Empty Anthropic source');
  const entries = new Set();
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    let kind = 'DOMAIN-SUFFIX', domain = line;
    if (line.startsWith('full:')) { kind = 'DOMAIN'; domain = line.slice(5); }
    else if (line.startsWith('keyword:')) { kind = 'DOMAIN-KEYWORD'; domain = line.slice(8); }
    else if (line.startsWith('regexp:') || line.startsWith('include:') ||
             line.includes('@') || line.includes(' ')) {
      throw Error('Unsupported Anthropic domain directive: ' + line);
    }
    if (!/^[a-z0-9.-]+$/i.test(domain) || domain.startsWith('.') ||
        domain.endsWith('.') || !domain.includes('.')) {
      throw Error('Invalid Anthropic domain: ' + line);
    }
    entries.add(kind + ',' + domain.toLowerCase() + ',Claude固定出口');
  }
  for (const d of ['anthropic.com','claude.ai','claude.com','clau.de']) {
    if (!entries.has('DOMAIN-SUFFIX,' + d + ',Claude固定出口'))
      throw Error('Missing critical Anthropic domain: ' + d);
  }
  if (entries.size < 15) throw Error('Unexpectedly short Anthropic domain list');
  return [...entries].sort();
}

const BLOCK=[
'DOMAIN-SUFFIX,sentry.io,REJECT',
'DOMAIN-SUFFIX,datadoghq.com,REJECT',
'DOMAIN-SUFFIX,datadoghq.eu,REJECT',
'DOMAIN-KEYWORD,datadoghq,REJECT'
];
const ROUTE=[
'DOMAIN-SUFFIX,anthropic.com,Claude固定出口',
'DOMAIN-SUFFIX,claude.ai,Claude固定出口',
'DOMAIN-SUFFIX,claude.com,Claude固定出口',
'DOMAIN-SUFFIX,claude.dev,Claude固定出口',
'DOMAIN-SUFFIX,clau.de,Claude固定出口',
'DOMAIN-SUFFIX,claudeusercontent.com,Claude固定出口',
'DOMAIN-SUFFIX,claudemcpcontent.com,Claude固定出口',
'DOMAIN,anthropic.auth0.com,Claude固定出口',
'DOMAIN,anthropic.com.cdn.cloudflare.net,Claude固定出口',
// Anthropic-branded Ghost CMS host; use exact hostname, not the shared ghost.io suffix.
'DOMAIN,anthropic-com.ghost.io,Claude固定出口',
'DOMAIN-SUFFIX,siftscience.com,Claude固定出口',
'DOMAIN-SUFFIX,sift.com,Claude固定出口',
'DOMAIN-SUFFIX,growthbook.io,Claude固定出口',
'IP-CIDR,160.79.104.0/21,Claude固定出口,no-resolve',
'IP-CIDR6,2607:6bc0::/48,Claude固定出口,no-resolve',
'IP-CIDR6,2607:6bc0:11::/48,Claude固定出口,no-resolve',
'IP-ASN,399358,Claude固定出口,no-resolve',
// Windows native Claude Code catch-all. Applies only if Mihomo identifies the process.
'PROCESS-NAME,claude.exe,Claude固定出口'
];
function addClaudeRoute(config,pinnedNode,anthropicRules){
if(!Array.isArray(anthropicRules)||anthropicRules.length<15||
!anthropicRules.every(r=>typeof r==='string'&&r.endsWith(',Claude固定出口')))
throw Error('Missing generated Anthropic domain rules');
if(!config['rule-providers']||config['rule-providers'][PROVIDER])throw Error('Anthropic provider collision or missing providers');
config['rule-providers'][PROVIDER]={
type:'http',format:'mrs',behavior:'domain',interval:86400,
url:PROVIDER_URL,path:'./ruleset/myclash_claude_anthropic.mrs',
'path-in-bundle':'geo/geosite/anthropic.mrs'
};

const groupName='Claude固定出口';
const names=[...new Set(config['proxies'].filter(p=>p&&typeof p.name==='string'&&
!['direct','reject','reject-drop','pass','compatible'].includes(String(p.type).toLowerCase())).map(p=>p.name))];
if(config['proxy-groups'].some(g=>g.name===groupName)||names.includes(groupName))throw Error('Claude group name collision');
const available=Boolean(pinnedNode&&names.includes(pinnedNode));
const groups=config['proxy-groups'];
const defaultIndex=groups.findIndex(g=>g.name==='默认代理');
const insertAt=defaultIndex<0?0:defaultIndex+1;
groups.splice(insertAt,0,{
name:groupName,type:'select',
proxies:pinnedNode?(available?[pinnedNode,'REJECT']:['REJECT']):['REJECT',...names],
'default-selected':available?pinnedNode:'REJECT'
});
const global=groups.find(g=>g.name==='GLOBAL');
if(global&&Array.isArray(global.proxies)&&!global.proxies.includes(groupName))global.proxies.push(groupName);
config['rules']=[...BLOCK,...anthropicRules,
'RULE-SET,'+PROVIDER+',Claude固定出口',
...ROUTE,...config['rules']];
}
function patch(source,pinnedNode='',anthropicRules){
if(!Array.isArray(anthropicRules)||anthropicRules.length<15)throw Error('Missing Anthropic domains');
if(typeof pinnedNode!=='string'||pinnedNode.length>256||
['DIRECT','REJECT','PASS'].includes(pinnedNode.toUpperCase()))throw Error('Invalid pinned node name');
if(source.includes('BEGIN MyClash-A- Claude routing')||
!source.includes("newConfig['proxy-groups']")||!source.includes("newConfig['rules']"))throw Error('Unexpected upstream source');
if((source.match(/function main\s*\(\s*config\s*\)/g)||[]).length!==1||
(source.match(/^  return newConfig;[ \t]*$/gm)||[]).length!==1)
throw Error('Upstream main changed, keeping last working build');
const result=source.replace(/^  return newConfig;[ \t]*$/m,
'  // BEGIN MyClash-A- Claude routing (generated)\n'+
'  addClaudeRoute(newConfig, '+JSON.stringify(pinnedNode)+', ANTHROPIC_RULES);\n'+
'  // END MyClash-A- Claude routing\n'+
'  return newConfig;');
return result+'\n// Shared add-on: upstream MyClash code is otherwise unchanged.\n'+
'const PROVIDER='+JSON.stringify(PROVIDER)+';\n'+
'const PROVIDER_URL='+JSON.stringify(PROVIDER_URL)+';\n'+
'const ANTHROPIC_RULES='+JSON.stringify(anthropicRules)+';\n'+
'const BLOCK='+JSON.stringify(BLOCK)+';\n'+
'const ROUTE='+JSON.stringify(ROUTE)+';\n'+
addClaudeRoute.toString()+'\n';
}
module.exports={patch,parseAnthropicSource,BLOCK,ROUTE};
