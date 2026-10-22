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
assert.ok(cfg.rules.includes('DOMAIN-SUFFIX,anthropic.com,Claude固定出口'));
assert.ok(cfg.dns&&cfg.tun&&cfg.profile['store-selected']);
if(pinned){assert.ok(g.proxies.length<=2);assert.equal(g.proxies[0],g.proxies.length===2?pinned:'REJECT');}
else {assert.equal(g.proxies[0],'REJECT');assert.ok(g.proxies.length>1);}
console.log('PASS '+file);
}
