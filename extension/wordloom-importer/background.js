importScripts('schedule.js');
const SITE='https://wordloom-reading.nicktang0307.chatgpt.site';
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(message.type?.startsWith('SCHEDULE_'))return false;
 (async()=>{
  if(message.type==='QUEUE_ARTICLE'){
   if(sender.url!==chrome.runtime.getURL('popup.html'))throw new Error('Invalid sender');
   const article=message.article,url=new URL(article?.url||'');
   if(url.protocol!=='https:'||!(url.hostname==='nytimes.com'||url.hostname.endsWith('.nytimes.com'))||typeof article.title!=='string'||article.title.length>500||typeof article.body!=='string'||article.body.length<20||article.body.length>150000)throw new Error('Invalid article');
   // Session storage is cleared when Chrome closes; stale transfers expire below.
   const now=Date.now(),existing=await chrome.storage.session.get(null);
   const stale=Object.keys(existing).filter(k=>k.startsWith('import-')&&now-existing[k].createdAt>3600000);
   if(stale.length)await chrome.storage.session.remove(stale);
   const id='import-'+crypto.randomUUID();
   await chrome.storage.session.set({[id]:{article,createdAt:now}});
   try{await chrome.tabs.create({url:SITE+'/#wordloom-import='+id});}catch(e){await chrome.storage.session.remove(id);throw e;}
   return {ok:true};
  }
  if(!sender.tab||new URL(sender.url||'').origin!==SITE)throw new Error('Invalid destination');
  const id=message.id;
  if(typeof id!=='string'||!/^import-[a-f0-9-]{36}$/.test(id))throw new Error('Invalid transfer');
  const expected=new URL(sender.url).hash;
  if(expected!=='#wordloom-import='+id)throw new Error('Transfer does not match this tab');
  if(message.type==='GET_ARTICLE'){
   const saved=(await chrome.storage.session.get(id))[id];
   if(!saved||Date.now()-saved.createdAt>3600000){await chrome.storage.session.remove(id);throw new Error('Transfer expired. Return to the NYT article and send it again.');}
   return {ok:true,article:saved.article};
  }
  if(message.type==='ACK_ARTICLE'){await chrome.storage.session.remove(id);return {ok:true};}
  throw new Error('Unknown request');
 })().then(reply).catch(e=>reply({ok:false,error:e.message}));
 return true;
});
