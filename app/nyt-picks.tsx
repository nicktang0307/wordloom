'use client';
import {useEffect,useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
type Pick={title:string;url:string;summary:string;category:string};
export function NYTPicks(){const [picks,setPicks]=useState<Pick[]>([]),[enabled,setEnabled]=useState(false),[error,setError]=useState('');
useEffect(()=>{const c=new AbortController();fetch('/api/articles',{signal:c.signal}).then(async r=>{const data:any=await r.json();if(!r.ok)throw new Error(data.error||'Reading picks are unavailable.');setEnabled(data.enabled);setPicks(data.articles||[])}).catch(e=>{if(!c.signal.aborted)setError(e.message)});return()=>c.abort()},[]);
if(!enabled&&!error)return null;
return <section className="nyt-discovery"><div className="section-line"><h2>NYT reading picks</h2><span>Links to read with your subscription</span></div>{error?<p role="status" className="lesson-note">{error}</p>:<div className="practice-list">{picks.map(p=><div key={p.url}><div><p>{p.category} · The New York Times</p><h3>{p.title}</h3><p>{p.summary}</p></div><a className="secondary" href={p.url} target="_blank" rel="noreferrer">Read on NYT <ArrowUpRight size={16}/></a></div>)}</div>}<p className="lesson-note">These are article suggestions, not imported full articles. Save unfamiliar words in your notebook after reading.</p></section>}
