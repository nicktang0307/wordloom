'use client';
import {useEffect,useState} from 'react';
import {Plus,ArrowUpRight} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {parseArticle,validateArticle,latestArticles,articleDateLabel,type SavedArticle,type ArticleDraft} from '@/lib/reading';
export function ImportedArticles({onOpen}:{onOpen:(article:SavedArticle)=>void}){
  const [items,setItems]=useState<SavedArticle[]>([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[readError,setReadError]=useState('');
  const [open,setOpen]=useState(false),[raw,setRaw]=useState(''),[draft,setDraft]=useState<ArticleDraft|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function load(){setLoading(true);setLoadError('');try{const r=await fetch('/api/reading');const d:any=await r.json();if(!r.ok)throw new Error(d.error);setItems(d);}catch(e){setLoadError((e as Error).message)}finally{setLoading(false)}}
  useEffect(()=>{void load()},[]);
  useEffect(()=>{
    const id=new URLSearchParams(window.location.hash.slice(1)).get('wordloom-import');
    if(!id)return;
    function receive(event:MessageEvent){
      if(event.source!==window||event.origin!==window.location.origin||event.data?.id!==id)return;
      if(event.data.type==='WORDLOOM_IMPORT_ERROR'){setOpen(true);setError(event.data.error||'Transfer failed. Please send the article again.');return;}
      if(event.data.type!=='WORDLOOM_IMPORT_PREVIEW')return;
      try{const article=validateArticle(event.data.article);setDraft(article);setRaw(article.title+'\n\n'+article.url+'\n\n'+article.body);setError('');setOpen(true);window.postMessage({type:'WORDLOOM_IMPORT_RECEIVED',id},window.location.origin);}
      catch{setOpen(true);setError('This article could not be imported. Please check the NYT page and try again.');}
    }
    window.addEventListener('message',receive);
    window.postMessage({type:'WORDLOOM_IMPORT_READY'},window.location.origin);
    return()=>window.removeEventListener('message',receive);
  },[]);
  async function openArticle(item:SavedArticle){
    setReadError('');
    if(item.read_at){onOpen(item);return;}
    try{
      const response=await fetch('/api/reading',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.id})});
      const result=await response.json() as {error?:string;read_at?:number};if(!response.ok)throw new Error(result.error||'Could not save read status.');if(typeof result.read_at!=='number')throw new Error('Could not save read status.');
      const updated={...item,read_at:result.read_at};setItems(old=>old.map(x=>x.id===item.id?updated:x));onOpen(updated);
    }catch(e){setReadError((e as Error).message);}
  }
  function preview(){try{setDraft(validateArticle(parseArticle(raw)));setError('')}catch(e){setError((e as Error).message)}}
  async function save(){
    setError('');setBusy(true);
    try{const value=validateArticle(draft);const r=await fetch('/api/reading',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});const d:any=await r.json();if(!r.ok)throw new Error(d.error);setItems(old=>[d,...old.filter(x=>x.id!==d.id)]);setOpen(false);setRaw('');setDraft(null);await openArticle(d);}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <section className="imported-shelf" aria-label="Imported articles"><div className="section-line"><h2>Your NYT articles</h2><button className="primary" onClick={()=>{setOpen(true);setError('')}}><Plus size={17}/>Import NYT article</button></div>
    <p className="import-hint">Latest 20 articles · newest article dates first</p>
    {readError&&<p role="alert" className="message error">{readError}</p>}
    {loading?<p role="status">Loading your articles…</p>:loadError?<p role="alert">{loadError} <button className="back" onClick={load}>Try again</button></p>:items.length===0?<p className="import-hint">Paste the title, link and article text from your Safari shortcut. Save it here to read and collect words.</p>:<div className="shelf imported-grid">{latestArticles(items).map(item=><button className="article-card imported-card" key={item.id} onClick={()=>void openArticle(item)}><div className="card-top"><span>{item.category} · {item.read_at?'Read':'Unread'}</span><ArrowUpRight size={20}/></div><h3>{item.title}</h3><p className="article-date" title="Article date from its NYT URL">{articleDateLabel(item.url)}</p><p>{item.body.slice(0,140)}{item.body.length>140?'…':''}</p><div className="card-footer"><span>{Math.ceil(item.body.split(/\s+/).length/130)} min read</span><span>{new URL(item.url).hostname}</span></div></button>)}</div>}
    <p className="import-hint">On your laptop: <a href="/downloads/wordloom-importer.zip" download style={{textDecoration:'underline'}}>Download Chrome importer v0.2</a> · Extract it, then use Chrome Extensions → Developer mode → Load unpacked. Already installed? Replace the extension files and click Reload, then enable daily 8 am Sydney imports in its popup.</p>
    <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value)}}><DialogContent className="article-import-dialog"><DialogTitle>Import an article</DialogTitle><DialogDescription>Paste your NYT Safari shortcut result: title, source URL, then the article text.</DialogDescription>
      {!draft?<><label htmlFor="article-paste">Article text</label><textarea id="article-paste" value={raw} maxLength={200000} onChange={e=>setRaw(e.target.value)} placeholder={'Article title\n\nhttps://www.nytimes.com/…\n\nArticle text…'} rows={12}/><p className="import-hint">ADVERTISEMENT markers will be removed. Long blocks are grouped into shorter reading paragraphs; these may differ from the original. Check and edit before saving.</p></>:<><label htmlFor="article-title">Title</label><input id="article-title" value={draft.title} maxLength={500} onChange={e=>setDraft({...draft,title:e.target.value})}/><label htmlFor="article-url">Source URL</label><input id="article-url" type="url" value={draft.url} maxLength={2000} onChange={e=>setDraft({...draft,url:e.target.value})}/><label htmlFor="article-category">Category</label><input id="article-category" value={draft.category} maxLength={80} onChange={e=>setDraft({...draft,category:e.target.value})}/><label htmlFor="article-body">Review the article · {draft.body.split(/\s+/).filter(Boolean).length} words</label><textarea id="article-body" value={draft.body} rows={9} maxLength={150000} onChange={e=>setDraft({...draft,body:e.target.value})}/><p className="import-hint">Check the ending against the original. Saving the same source URL updates your existing copy.</p></>}
      {error&&<p className="message error" role="alert">{error}</p>}<div className="import-actions">{draft?<><button className="secondary" disabled={busy} onClick={()=>{setDraft(null);setError('')}}>Back to pasted text</button><button className="primary" disabled={busy} onClick={save}>{busy?'Saving…':'Save & read'}</button></>:<button className="primary" disabled={!raw.trim()} onClick={preview}>Preview article</button>}</div>
    </DialogContent></Dialog>
  </section>
}
