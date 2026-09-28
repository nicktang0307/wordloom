const button=document.getElementById('send'),status=document.getElementById('status');
button.addEventListener('click',async()=>{
 button.disabled=true;status.textContent='Reading this article…';
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const url=new URL(tab?.url||'');
  if(url.protocol!=='https:'||!(url.hostname==='nytimes.com'||url.hostname.endsWith('.nytimes.com')))throw new Error('Open an NYT article in this tab first.');
  const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extract.js']});
  if(!result||result.error)throw new Error(result?.error||'Could not read this page.');
  const response=await chrome.runtime.sendMessage({type:'QUEUE_ARTICLE',article:result});
  if(!response?.ok)throw new Error(response?.error||'Could not open Wordloom.');
  status.textContent='Wordloom is opening with a preview. Compare its ending with the original, then choose Save & read.';
 }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});

const scheduleStatus=document.getElementById('schedule-status');
const origins=['https://www.nytimes.com/*','https://rss.nytimes.com/*','https://wordloom-reading.nicktang0307.chatgpt.site/*'];
async function scheduleAction(type){
 try{
  if(type==='SCHEDULE_ENABLE'||type==='SCHEDULE_RUN'){
   if(!await chrome.permissions.request({origins}))throw new Error('Website access is needed for scheduled imports.');
  }
  const result=await chrome.runtime.sendMessage({type});
  if(!result.ok)throw new Error(result.error);
  scheduleStatus.textContent=(result.enabled?'Daily schedule ON. ':'Daily schedule OFF. ')+(result.status||'Ready.');
 }catch(e){scheduleStatus.textContent=e.message;}
}
document.getElementById('enable').onclick=()=>scheduleAction('SCHEDULE_ENABLE');
document.getElementById('run').onclick=()=>scheduleAction('SCHEDULE_RUN');
document.getElementById('pause').onclick=()=>scheduleAction('SCHEDULE_PAUSE');
scheduleAction('SCHEDULE_STATUS');
