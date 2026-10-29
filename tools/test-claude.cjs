'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const sample={proxies:[{name:'美国 01',type:'ss',server:'a.example.net',port:443,cipher:'aes-128-gcm',password:'test'}],dns:{}};
const pinned=JSON.parse(fs.readFileSync('claude-route.json','utf8')).node_name;
for(const file of ['Script/mihomoScript.js','Script/Script.js']){
const main=vm.runInNewContext(fs.readFileSync(file,'utf8')+'\nmain',{},{timeout:5000});
const cfg=main(structuredClone(sample));
const g=cfg['proxy-groups'].find(x=>x.name==='Claude固定出口');
assert.ok(g);assert.equal(g.type,'select');
assert.ok(g.proxies.includes('REJECT'));assert.ok(!g.proxies.includes('DIRECT'));
assert.ok(!g.proxies.includes('自动选择'));
assert.equal(cfg.rules[0],'DOMAIN-SUFFIX,sentry.io,REJECT');
assert.equal(cfg.rules[3],'DOMAIN-KEYWORD,datadoghq,REJECT');
assert.ok(cfg.rules.includes('DOMAIN-SUFFIX,siftscience.com,Claude固定出口'));
// Shared third-party domains must not be globally hijacked.
const aiAt=cfg.rules.indexOf('RULE-SET,ai,AI');
for (const rule of [
 'DOMAIN,anthropic-com.ghost.io,Claude固定出口',
 'PROCESS-NAME,claude.exe,Claude固定出口'
]) {
 const at=cfg.rules.indexOf(rule);
 assert.ok(at>=0 && (aiAt<0 || at<aiAt),file+': absent/late '+rule);
}
for (const shared of ['storage.googleapis.com','raw.githubusercontent.com','challenges.cloudflare.com','statsigapi.net','intercom.io']) {
 assert.ok(!cfg.rules.some(rule => rule.includes(','+shared+',Claude固定出口')),
   file+': overbroad shared-domain rule for '+shared);
}
assert.ok(cfg.rules.indexOf('DOMAIN-KEYWORD,datadoghq,REJECT') <
 cfg.rules.indexOf('PROCESS-NAME,claude.exe,Claude固定出口'));

const required = [
 'ant.dev','anthropic.com','anthropic.team','antspace.dev',
 'chatbotclaude.com','clau.de','claude.ai','claude.app','claude.com',
 'claude.dev','claude.new','claude.site','claudeacademy.com',
 'claudemcpclient.com','claudemcpcontent.com','claudepages.dev',
 'claudestudio.com','claudeusercontent.com'
];
for(const domain of required) {
 assert.ok(cfg.rules.includes('DOMAIN-SUFFIX,'+domain+',Claude固定出口'),
   file+': lost Claude domain '+domain);
}
assert.ok(cfg.rules.includes('DOMAIN,servd-anthropic-website.b-cdn.net,Claude固定出口'));
const provider = cfg['rule-providers'].myclash_claude_anthropic;
assert.ok(provider && provider.type === 'http' && provider.behavior === 'domain' &&
 provider.format === 'mrs' && provider.url.includes('anthropic.mrs'));
const claudeIdx=cfg.rules.indexOf('RULE-SET,myclash_claude_anthropic,Claude固定出口');
const aiIdx=cfg.rules.indexOf('RULE-SET,ai,AI');
if (aiIdx >= 0) assert.ok(claudeIdx >= 0 && claudeIdx < aiIdx, file+': Claude after AI');
assert.ok(cfg.rules.indexOf('DOMAIN-SUFFIX,claude.new,Claude固定出口') < aiIdx || aiIdx < 0);

assert.ok(cfg.dns&&cfg.tun&&cfg.profile['store-selected']);
if(pinned){assert.ok(g.proxies.length<=2);assert.equal(g.proxies[0],g.proxies.length===2?pinned:'REJECT');}
else {assert.equal(g.proxies[0],'REJECT');assert.ok(g.proxies.length>1);}
console.log('PASS '+file);
}
