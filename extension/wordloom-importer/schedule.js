// Local Chrome alarms only. No credentials or article bodies are stored in job history.
const DAILY='wordloom-daily', STEP='wordloom-step';
const HOME='https://wordloom-reading.nicktang0307.chatgpt.site';
const FEEDS=[['Technology','Technology'],['Business','Business'],['World','World'],['Science','Science'],['Culture','Arts']];
function sydneyParts(now=Date.now()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 return {day:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour)};
}
function nextEight(now=Date.now()){
 // Sydney uses whole-hour offsets; search UTC hours to handle DST and year rollover.
 let t=Math.floor(now/3600000)*3600000+3600000;
 for(let n=0;n<27;n++,t+=3600000)if(sydneyParts(t).hour===8)return t;
 throw new Error('Could not calculate next Sydney morning');
}
function articleLinks(xml){
 return [...xml.matchAll(/<link>\s*(?:<!\[CDATA\[)?(https:\/\/www\.nytimes\.com\/\d{4}\/\d{2}\/\d{2}\/[^<\s]+?)(?:\]\]>)?\s*<\/link>/g)].map(m=>{
  try{const u=new URL(m[1].replace(/&amp;/g,'&'));u.search='';u.hash='';return u.href;}catch{return '';}
 }).filter(u=>u.endsWith('.html')&&!/\/(interactive|video|live)\//.test(u));
}
let locked=false;
const state=async()=>({enabled:false,status:'Ready.',...(await chrome.storage.local.get('schedule')).schedule});
const put=async s=>chrome.storage.local.set({schedule:s});
async function closeOwned(id){if(id)await chrome.tabs.remove(id).catch(()=>{});}
async function siteRequest(tabId,article){
 const [{result}]=await chrome.scripting.executeScript({target:{tabId},func:async(article)=>{
  try{
   if(location.origin!=='https://wordloom-reading.nicktang0307.chatgpt.site')return {error:'Wordloom tab was redirected. Sign in, then try again.'};
   const r=await fetch('/api/reading',{method:article?'POST':'GET',credentials:'same-origin',headers:article?{'Content-Type':'application/json'}:{},body:article?JSON.stringify(article):undefined,signal:AbortSignal.timeout(20000)});
   if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))return {error:'Sign in to Wordloom in Chrome, then use Import now.'};
   const data=await r.json();return {data};
  }catch{return {error:'Wordloom could not be reached. Try Import now later.'};}
 },args:[article||null]});
 if(!result||result.error)throw new Error(result?.error||'Wordloom did not respond.');
 return result.data;
}
async function start(force=false){
 let s=await state();const today=sydneyParts();
 if(s.job)return;
 if(!force&&(!s.enabled||today.hour<8||s.lastDay===today.day))return;
 s.lastDay=today.day;s.status='Starting daily import…';
 s.job={phase:'site',index:0,count:0,started:Date.now(),seen:[],siteTab:null,articleTab:null};
 await put(s);await chrome.alarms.create(STEP,{delayInMinutes:0.5});
 await chrome.action.setBadgeText({text:'…'});
}
async function step(){
 if(locked)return;locked=true;
 try{
  const s=await state();if(!s.job)return;
  // Re-arm before work so worker suspension cannot strand an in-progress job.
  await chrome.alarms.create(STEP,{delayInMinutes:0.5});
  const j=s.job;
  if(Date.now()-j.started>30*60000)throw new Error('Import paused after a long delay. Use Import now when Chrome is ready.');
  if(j.phase==='site'){
   j.siteTab=(await chrome.tabs.create({url:HOME,active:false})).id;j.phase='check';
  }else if(j.phase==='check'){
   const rows=await siteRequest(j.siteTab);
   if(!Array.isArray(rows))throw new Error('Sign in to Wordloom first.');
   j.seen=rows.map(r=>r.url);j.phase='feed';
  }else if(j.phase==='feed'){
   if(j.index>=FEEDS.length){
    await closeOwned(j.siteTab);s.job=null;s.status=`Finished: ${j.count} new article(s). Check their endings when reading.`;
    await put(s);await chrome.alarms.clear(STEP);await chrome.action.setBadgeText({text:String(j.count)});return;
   }
   const [category,feed]=FEEDS[j.index];
   const response=await fetch(`https://rss.nytimes.com/services/xml/rss/nyt/${feed}.xml`,{signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('NYT article feed is unavailable. Try again later.');
   const xml=await response.text();
   if(!/<rss\b/i.test(xml))throw new Error('NYT feed could not be read.');
   const url=articleLinks(xml).find(u=>!j.seen.includes(u));
   if(!url){j.index++;s.status=`No new standard ${category} article; continuing…`;}
   else{j.articleTab=(await chrome.tabs.create({url,active:false})).id;j.phase='scroll';s.status=`Loading ${category} article…`;}
  }else if(j.phase==='scroll'){
   // Scroll the normally rendered page; never inspect hidden paywall content.
   await chrome.scripting.executeScript({target:{tabId:j.articleTab},func:()=>window.scrollTo(0,document.body.scrollHeight)});
   j.phase='extract';
  }else if(j.phase==='extract'){
   const [{result}]=await chrome.scripting.executeScript({target:{tabId:j.articleTab},files:['extract.js']});
   if(!result||result.error)throw new Error(result?.error||'NYT article could not be read.');
   result.category=FEEDS[j.index][0];
   // Same-origin authenticated request preserves Wordloom's access controls.
   await siteRequest(j.siteTab,result);
   j.seen.push(result.url);j.count++;j.index++;j.phase='feed';
   await closeOwned(j.articleTab);j.articleTab=null;s.status=`Saved ${j.count} article(s)…`;
  }
  await put(s);
 }catch(e){
  const s=await state();s.status=`Stopped: ${e.message} Already saved: ${s.job?.count||0}.`;
  // Leave NYT's failed page open for the owner to inspect normally.
  await closeOwned(s.job?.siteTab);s.job=null;await put(s);
  await chrome.alarms.clear(STEP);await chrome.action.setBadgeText({text:'!'});
 }finally{locked=false;}
}
async function restore(){
 const s=await state();
 if(s.enabled){await chrome.alarms.create(DAILY,{when:nextEight()});await start();}
 if(s.job)await chrome.alarms.create(STEP,{delayInMinutes:0.5});
}
chrome.alarms.onAlarm.addListener(async alarm=>{
 if(alarm.name===STEP)await step();
 if(alarm.name===DAILY){await chrome.alarms.create(DAILY,{when:nextEight()});await start();}
});
chrome.runtime.onStartup.addListener(()=>restore().catch(()=>{}));
chrome.runtime.onInstalled.addListener(()=>restore().catch(()=>{}));
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(!message.type?.startsWith('SCHEDULE_'))return false;
 (async()=>{
  if(sender.url!==chrome.runtime.getURL('popup.html'))throw new Error('Invalid sender');
  if(locked&&message.type!=='SCHEDULE_STATUS')throw new Error('An import step is finishing. Try again in a moment.');
  let s=await state();
  if(message.type==='SCHEDULE_ENABLE'){
   s.enabled=true;await put(s);await restore();
  }else if(message.type==='SCHEDULE_PAUSE'){
   s.enabled=false;await closeOwned(s.job?.siteTab);await closeOwned(s.job?.articleTab);s.job=null;s.status='Paused.';await put(s);
   await chrome.alarms.clear(DAILY);await chrome.alarms.clear(STEP);await chrome.action.setBadgeText({text:''});
  }else if(message.type==='SCHEDULE_RUN')await start(true);
  s=await state();return {ok:true,enabled:s.enabled,status:s.status};
 })().then(reply).catch(e=>reply({ok:false,error:e.message}));return true;
});
