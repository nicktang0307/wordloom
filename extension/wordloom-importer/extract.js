(()=>{
 const visible=element=>{
  if(!element||!element.getClientRects().length)return false;
  for(let p=element;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0'||p.getAttribute('aria-hidden')==='true')return false;}
  return true;
 };
 const pageText=document.body?.innerText||'';
 if(/verify you are human|unusual traffic|access temporarily restricted|存取暫時受限/i.test(pageText))return {error:'NYT is showing a verification or access restriction. Stop here and resolve it through NYT before importing.'};
 if(/subscribe to continue reading|log in to continue reading/i.test(pageText))return {error:'NYT is asking you to sign in or subscribe. Open the full article before importing.'};
 const root=document.querySelector('section[name="articleBody"]')||document.querySelector('[data-testid="article-body"]');
 if(!root)return {error:'Article text was not found. Open a standard NYT article and let it finish loading. Live blogs and interactive pages are not supported yet.'};
 const paragraphs=Array.from(root.querySelectorAll('p')).filter(p=>visible(p)&&!p.closest('aside,figure,figcaption,[data-testid="ad-unit"]')).map(p=>p.innerText.trim()).filter(p=>p&&!/^ADVERTISEMENT$/i.test(p));
 const title=document.querySelector('h1')?.innerText.trim();
 const body=paragraphs.join('\n\n');
 if(!title||body.split(/\s+/).length<100)return {error:'Too little article text was found. Check that the full article is visible, then try again.'};
 if(body.length>150000)return {error:'This article is too long for this importer.'};
 const url=new URL(location.href);url.hash='';url.search='';
 return {title,url:url.href,body,category:document.querySelector('meta[property="article:section"]')?.content?.slice(0,80)||'NYT'};
})();
