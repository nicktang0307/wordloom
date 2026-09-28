(()=>{
 const id=new URLSearchParams(location.hash.slice(1)).get('wordloom-import');
 if(!id)return;
 let delivered=false;
 window.addEventListener('message',async event=>{
  if(event.source!==window||event.origin!==location.origin)return;
  if(event.data?.type==='WORDLOOM_IMPORT_READY'&&!delivered){
   const response=await chrome.runtime.sendMessage({type:'GET_ARTICLE',id});
   if(response.ok){window.postMessage({type:'WORDLOOM_IMPORT_PREVIEW',id,article:response.article},location.origin);}
   else window.postMessage({type:'WORDLOOM_IMPORT_ERROR',id,error:response.error},location.origin);
  }
  if(event.data?.type==='WORDLOOM_IMPORT_RECEIVED'&&event.data.id===id&&!delivered){
   delivered=true;await chrome.runtime.sendMessage({type:'ACK_ARTICLE',id});
  }
 });
})();
