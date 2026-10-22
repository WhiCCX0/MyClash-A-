'use strict';
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
'DOMAIN-SUFFIX,siftscience.com,Claude固定出口',
'DOMAIN-SUFFIX,sift.com,Claude固定出口',
'DOMAIN-SUFFIX,growthbook.io,Claude固定出口',
'IP-CIDR,160.79.104.0/21,Claude固定出口,no-resolve',
'IP-CIDR6,2607:6bc0::/48,Claude固定出口,no-resolve',
'IP-CIDR6,2607:6bc0:11::/48,Claude固定出口,no-resolve',
'IP-ASN,399358,Claude固定出口,no-resolve'
];
function addClaudeRoute(config,pinnedNode){
const groupName='Claude固定出口';
const names=[...new Set(config['proxies'].filter(p=>p&&typeof p.name==='string'&&
!['direct','reject','reject-drop','pass','compatible'].includes(String(p.type).toLowerCase())).map(p=>p.name))];
if(config['proxy-groups'].some(g=>g.name===groupName)||names.includes(groupName))throw Error('Claude group name collision');
const available=Boolean(pinnedNode&&names.includes(pinnedNode));
config['proxy-groups'].push({
name:groupName,type:'select',
proxies:pinnedNode?(available?[pinnedNode,'REJECT']:['REJECT']):['REJECT',...names],
'default-selected':available?pinnedNode:'REJECT',
'empty-fallback':'REJECT'
});
config['rules']=[...BLOCK,...ROUTE,...config['rules']];
}
function patch(source,pinnedNode=''){
if(typeof pinnedNode!=='string'||pinnedNode.length>256||
['DIRECT','REJECT','PASS'].includes(pinnedNode.toUpperCase()))throw Error('Invalid pinned node name');
if(source.includes('BEGIN MyClash-A- Claude routing')||
!source.includes("newConfig['proxy-groups']")||!source.includes("newConfig['rules']"))throw Error('Unexpected upstream source');
if((source.match(/function main\s*\(\s*config\s*\)/g)||[]).length!==1||
(source.match(/^  return newConfig;[ \t]*$/gm)||[]).length!==1)
throw Error('Upstream main changed, keeping last working build');
const result=source.replace(/^  return newConfig;[ \t]*$/m,
'  // BEGIN MyClash-A- Claude routing (generated)\n'+
'  addClaudeRoute(newConfig, '+JSON.stringify(pinnedNode)+');\n'+
'  // END MyClash-A- Claude routing\n'+
'  return newConfig;');
return result+'\n// Shared add-on: upstream MyClash code is otherwise unchanged.\n'+
'const BLOCK='+JSON.stringify(BLOCK)+';\n'+
'const ROUTE='+JSON.stringify(ROUTE)+';\n'+
addClaudeRoute.toString()+'\n';
}
module.exports={patch,BLOCK,ROUTE};
