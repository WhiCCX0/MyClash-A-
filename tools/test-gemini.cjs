'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseGeminiConfig,patchGemini}=require('./gemini-route.cjs');
const regions=['美国','日本','新加坡','香港','台湾'];
const names=['🇺🇸 US 01','美国 02','🇯🇵 JP 01','日本 02','🇸🇬 SG 01','新加坡 02','🇭🇰 HK 01','香港 02','🇹🇼 TW 01','台湾 02','Mystery 01'];
const node=(name,i,type='ss')=>({name,type,server:'node'+i+'.example.net',port:443,cipher:'aes-128-gcm',password:'test'});
const sample={proxies:[...names.map((n,i)=>node(n,i)),node('🇺🇸 US DIRECT',50,'direct')],dns:{}};
const plain=x=>JSON.parse(JSON.stringify(x));
let passed=0,failed=0;
function check(label,run){
  try{run();console.log('PASS '+label);passed++;}
  catch(e){console.error('FAIL '+label+'\n'+(e.stack||e));failed++;}
}
function load(s){return vm.runInNewContext(s+'\n({main,getMatchedRegions,regionDefinitions})',{},{timeout:5000});}
function claudeOnly(s){
  const marker='// Gemini Web P0 add-on (generated)';
  assert.equal(s.split(marker).length,2,'One Gemini suffix required');
  const head=s.split(marker)[0];
  const block=/^  \/\/ BEGIN MyClash-A- Gemini routing \(generated\)[\s\S]*?^  \/\/ END MyClash-A- Gemini routing[ \t]*\r?\n/gm;
  assert.equal((head.match(block)||[]).length,1,'One Gemini injection required');
  const restored=head.replace(block,'');
  assert.match(restored,/^  \/\/ END MyClash-A- Claude routing\r?\n  return newConfig;[ \t]*$/m,
    'Claude END must be immediately followed by return newConfig with no blank line');
  return restored;
}
check('parse/accept default',()=>assert.deepEqual(parseGeminiConfig({in_users:['gemini-01'],process_path_regex:''}),
  {in_users:['gemini-01'],process_path_regex:''}));
const bad={
  'extra key':{in_users:['a'],process_path_regex:'',extra:1},
  'missing key':{in_users:['a']},
  'empty users':{in_users:[],process_path_regex:''},
  'too many users':{in_users:Array.from({length:9},(_,i)=>'u'+i),process_path_regex:''},
  'duplicate':{in_users:['a','a'],process_path_regex:''},
  'slash':{in_users:['a/b'],process_path_regex:''},
  'comma in user':{in_users:['a,b'],process_path_regex:''},
  'space':{in_users:['a b'],process_path_regex:''},
  'regex comma':{in_users:['a'],process_path_regex:'a,b'},
  'regex newline':{in_users:['a'],process_path_regex:'a\nb'},
  'regex invalid':{in_users:['a'],process_path_regex:'[bad'},
  'regex long':{in_users:['a'],process_path_regex:'x'.repeat(257)},
  'not object':null
};
for(const [label,cfg] of Object.entries(bad))
  check('parse/reject '+label,()=>assert.throws(()=>parseGeminiConfig(cfg)));
for(const file of ['Script/mihomoScript.js','Script/Script.js']){
  const source=fs.readFileSync(file,'utf8'),original=claudeOnly(source);
  const api=load(source),oldApi=load(original),cfg=api.main(structuredClone(sample)),old=oldApi.main(structuredClone(sample));
  const groups=cfg['proxy-groups'],byName=new Map(groups.map(g=>[g.name,g]));
  const gemini=byName.get('Gemini Web');
  const added=groups.filter(g=>g.name==='Gemini Web'||regions.some(r=>g.name==='Gemini '+r));
  const excluded=new Set(['direct','reject','reject-drop','pass','compatible']);
  const expected=new Map(regions.map(r=>[r,[]]));
  for(const p of cfg.proxies){
    if(excluded.has(String(p.type).toLowerCase()))continue;
    for(const region of oldApi.getMatchedRegions(p.name)){
      const arr=expected.get(region.name);
      if(arr&&!arr.includes(p.name))arr.push(p.name);
    }
  }
  check(file+'/root select and ordering',()=>{
    assert.ok(gemini);assert.equal(gemini.type,'select');assert.equal(gemini.hidden,false);
    assert.deepEqual(plain(gemini.proxies),['默认代理',...regions.map(r=>'Gemini '+r)]);
  });
  for(const r of regions)check(file+'/region '+r+' membership/order/icon',()=>{
    const g=byName.get('Gemini '+r);
    assert.ok(g);assert.equal(g.type,'select');assert.equal(g.hidden,false);
    assert.deepEqual(plain(g.proxies),expected.get(r));assert.equal(g.proxies.length,2);
    assert.equal(g.icon,api.regionDefinitions.find(x=>x.name===r).icon);
    for(const name of g.proxies){
      assert.ok(cfg.proxies.some(p=>p.name===name&&!excluded.has(String(p.type).toLowerCase())));
      assert.ok(!byName.has(name));assert.ok(!['DIRECT','REJECT','直连'].includes(name));
    }
  });
  check(file+'/valid group refs/no duplicate groups',()=>{
    assert.equal(byName.size,groups.length);
    assert.ok(gemini.proxies.every(name=>byName.has(name)));
    assert.equal(added.length,6);
  });
  check(file+'/new groups are only select',()=>{
    for(const g of added){assert.equal(g.type,'select');assert.ok(!('strategy' in g));assert.ok(!('hash-key' in g));}
  });
  check(file+'/GLOBAL contains Gemini root and all five regions once',()=>{
    const list=byName.get('GLOBAL').proxies;
    const expected=['Gemini Web',...regions.map(r=>'Gemini '+r)];
    for(const name of expected){
      assert.ok(list.includes(name),file+': GLOBAL missing '+name);
      assert.equal(list.filter(n=>n===name).length,1,file+': GLOBAL duplicated '+name);
    }
    assert.deepEqual(plain(list.filter(n=>expected.includes(n))),expected);
  });
  check(file+'/Claude selector invariant',()=>{
    const get=x=>x['proxy-groups'].find(g=>g.name==='Claude固定出口');
    const a=get(cfg),b=get(old);
    assert.deepEqual(plain({proxies:a.proxies,selected:a['default-selected']}),
      plain({proxies:b.proxies,selected:b['default-selected']}));
  });
  check(file+'/rules exact insertion/priority',()=>{
    const rules=cfg.rules,at=rules.indexOf('PROCESS-NAME,claude.exe,Claude固定出口');
    assert.ok(at>=0);
    assert.equal(rules[at+1],'IN-USER,gemini-01,Gemini Web');
    assert.equal(rules[at+2],'DOMAIN,gemini.google.com,Gemini Web');
    assert.equal(rules.filter(r=>r.endsWith(',Gemini Web')).length,2);
    assert.ok(!rules.some(r=>r.startsWith('PROCESS-PATH-REGEX,')));
    for(const rule of ['RULE-SET,google,Google','RULE-SET,ai,AI'])
      if(rules.includes(rule))assert.ok(rules.indexOf(rule)>at+2);
  });
  check(file+'/no shared Google domains',()=>{
    const forbidden=['accounts.google.com','content-push.googleapis.com','push.clients6.google.com',
      'googleusercontent.com','usercontent.google.com','www.google.com','generativelanguage.googleapis.com'];
    assert.ok(!cfg.rules.some(rule=>rule.endsWith(',Gemini Web')&&forbidden.some(d=>rule.includes(d))));
  });
  check(file+'/Claude-only deep invariants',()=>{
    const current=plain(cfg),base=plain(old);
    current.rules.splice(current.rules.indexOf('IN-USER,gemini-01,Gemini Web'),2);
    const generated=new Set(added.map(g=>g.name));
    current['proxy-groups']=current['proxy-groups'].filter(g=>!generated.has(g.name));
    const global=current['proxy-groups'].find(g=>g.name==='GLOBAL');
    global.proxies=global.proxies.filter(n=>!generated.has(n));
    for(const key of ['rules','proxy-groups','proxies','dns','tun','mixed-port','rule-providers'])
      assert.deepEqual(current[key],base[key],key);
  });
  check(file+'/only US edge',()=>{
    const g=api.main({proxies:[node('🇺🇸 US 01',1),node('美国 02',2)],dns:{}})['proxy-groups'];
    assert.deepEqual(plain(g.find(x=>x.name==='Gemini Web').proxies),['默认代理','Gemini 美国']);
    assert.equal(g.filter(x=>x.name.startsWith('Gemini ')).length,2);
  });
  check(file+'/no regions edge',()=>{
    const g=api.main({proxies:[node('Mystery 01',1)],dns:{}})['proxy-groups'];
    assert.deepEqual(plain(g.find(x=>x.name==='Gemini Web').proxies),['默认代理']);
    assert.equal(g.filter(x=>x.name.startsWith('Gemini ')).length,1);
  });
  check(file+'/minimal mode edge',()=>{
    assert.equal((source.match(/极简模式:\s*false/g)||[]).length,1);
    const g=load(source.replace(/极简模式:\s*false/,'极简模式: true'))
      .main(structuredClone(sample))['proxy-groups'];
    const keys=new Set(g.map(x=>x.name));
    assert.ok(keys.has('默认代理'));
    for(const r of regions)assert.ok(keys.has('Gemini '+r));
    assert.ok(g.find(x=>x.name==='Gemini Web').proxies.every(n=>keys.has(n)));
  });
  check(file+'/optional regex + multiple users',()=>{
    const opt={in_users:['alpha','beta'],process_path_regex:'^D:\\\\AI\\\\Tools\\\\gemini\\.exe$'};
    const customized=load(patchGemini(original,opt)).main(structuredClone(sample));
    const rules=customized.rules,at=rules.indexOf('IN-USER,alpha/beta,Gemini Web');
    assert.ok(at>0);
    assert.equal(rules[at+1],'PROCESS-PATH-REGEX,'+opt.process_path_regex+',Gemini Web');
    assert.equal(rules[at+2],'DOMAIN,gemini.google.com,Gemini Web');
    assert.equal(rules.filter(r=>r.startsWith('PROCESS-PATH-REGEX,')).length,1);
  });
  check(file+'/patch rejects duplicate or missing Claude',()=>{
    assert.throws(()=>patchGemini(source,{in_users:['gemini-01'],process_path_regex:''}));
    assert.throws(()=>patchGemini(original.replace('// END MyClash-A- Claude routing','// removed'),
      {in_users:['gemini-01'],process_path_regex:''}));
  });
}
console.log('SUMMARY Gemini P0: passed='+passed+' failed='+failed+' total='+(passed+failed));
if(failed)process.exitCode=1;
