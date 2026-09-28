import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=readFileSync(new URL('../wordloom-importer/schedule.js',import.meta.url),'utf8');
function harness(saved={},failure=false){
 const calls={tabs:[],alarms:[],scripts:0};let alarm;
 const noop={addListener:()=>{}};
 const chrome={runtime:{onStartup:noop,onInstalled:noop,onMessage:noop},alarms:{onAlarm:{addListener:fn=>alarm=fn},create:async(...a)=>calls.alarms.push(a),clear:async()=>{}},action:{setBadgeText:async()=>{}},storage:{local:{get:async()=>({schedule:saved}),set:async x=>{saved=structuredClone(x.schedule);}}},tabs:{remove:async id=>calls.tabs.push(id)},scripting:{executeScript:async()=>{calls.scripts++;return [{result:failure?{error:'Verify you are human'}:{}}];}}};
 const ctx=vm.createContext({chrome,Intl,Date,URL,AbortSignal});vm.runInContext(source,ctx);
 return {ctx,calls,get:()=>saved,alarm:(name)=>alarm({name})};
}
test('8 am Sydney respects DST and year rollover',()=>{
 const {ctx}=harness();
 for(const [now,expected] of [['2026-09-21T20:00:00Z','2026-09-21T22:00:00Z'],['2026-10-03T22:00:00Z','2026-10-04T21:00:00Z'],['2026-12-31T22:00:00Z','2027-01-01T21:00:00Z']]){
  assert.equal(new Date(vm.runInContext(`nextEight(${Date.parse(now)})`,ctx)).toISOString(),new Date(expected).toISOString());
 }
});
test('feed selects standard NYT articles only, without trackers',()=>{
 const {ctx}=harness();ctx.xml='<rss><link>https://www.nytimes.com/2026/09/21/science/test.html?x=1&amp;y=2</link><link>https://evil.com/2026/09/21/test.html</link><link>https://www.nytimes.com/2026/09/21/interactive/test.html</link></rss>';
 assert.deepEqual(Array.from(vm.runInContext('articleLinks(xml)',ctx)),['https://www.nytimes.com/2026/09/21/science/test.html']);
});
test('verification stops job without saving, leaves NYT page open',async()=>{
 const h=harness({enabled:true,job:{phase:'extract',started:Date.now(),articleTab:2,siteTab:1,count:0,index:0}},true);
 await h.alarm('wordloom-step');assert.equal(h.get().job,null);assert.match(h.get().status,/Verify you are human/);assert.equal(h.calls.scripts,1);assert.deepEqual(h.calls.tabs,[1]);
});
test('catch-up runs at most once each Sydney date',async()=>{
 const h=harness({enabled:true,lastDay:new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())});
 await vm.runInContext('start()',h.ctx);assert.equal(h.get().job,undefined);
});
