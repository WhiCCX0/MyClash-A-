'use strict';
const fs=require('node:fs');
const {patch}=require('./claude-route.cjs');
const files=['Script/mihomoScript.js','Script/Script.js'];
async function get(url){
  for(let i=0;i<3;i++){
    try {
      const r=await fetch(url,{headers:{'User-Agent':'MyClash-A-Sync'},signal:AbortSignal.timeout(30000)});
      if(!r.ok)throw Error(url+' HTTP '+r.status);
      return await r.text();
    } catch(e) {if(i===2)throw e;await new Promise(res=>setTimeout(res,1000*(i+1)));}
  }
}
async function main(){
const cfg=JSON.parse(fs.readFileSync('claude-route.json','utf8'));
if(typeof cfg.node_name!=='string')throw Error('node_name must be string');
const meta=JSON.parse(await get('https://api.github.com/repos/AIsouler/MyClash/commits/main'));
if(!/^[a-f0-9]{40}$/.test(meta.sha))throw Error('Invalid upstream SHA');
const generated={};
for(const file of files){
const source=await get('https://raw.githubusercontent.com/AIsouler/MyClash/'+meta.sha+'/'+file);
generated[file]=patch(source,cfg.node_name);
}
for(const file of files){fs.writeFileSync(file,generated[file]);console.log(file+' built at '+meta.sha);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
