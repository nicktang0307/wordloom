export type SavedArticle = {id:string;title:string;url:string;body:string;category:string;created_at:number;read_at?:number|null};
export type ArticleDraft = Pick<SavedArticle,'title'|'url'|'body'|'category'>;
export function cleanArticle(body:string){
  return body.replace(/\r\n?/g,'\n').split('\n').filter(line=>!/^ADVERTISEMENT$/i.test(line.trim())).join('\n').replace(/\bADVERTISEMENT\b/g,'').replace(/[\t ]{2,}/g,' ').replace(/\n[\t ]*\n(?:[\t ]*\n)+/g,'\n\n').trim();
}
// Layout only: retain existing paragraph boundaries; recover readable chunks
// when copying has flattened the text. These are not original editorial breaks.
export function articleParagraphs(body:string):string[]{
  return cleanArticle(body).split(/\n+/).map(p=>p.trim()).filter(Boolean).flatMap(p=>{
    if(p.split(/\s+/).length<120)return [p];
    const sentences=Array.from(new Intl.Segmenter('en',{granularity:'sentence'}).segment(p),s=>s.segment.trim());
    const result:string[]=[];let chunk:string[]=[];let words=0;
    for(const sentence of sentences){
      chunk.push(sentence);words+=sentence.split(/\s+/).length;
      if(words>=80||chunk.length>=3){result.push(chunk.join(' '));chunk=[];words=0;}
    }
    if(chunk.length)result.push(chunk.join(' '));
    return result;
  });
}
export function parseArticle(raw:string):ArticleDraft{
  const lines=raw.replace(/\r\n?/g,'\n').split('\n');
  const urlIndex=lines.findIndex(line=>/^https?:\/\/\S+$/i.test(line.trim()));
  if(urlIndex<0)throw new Error('Include the article URL on its own line below the title.');
  return {title:lines.slice(0,urlIndex).join(' ').trim(),url:lines[urlIndex].trim(),body:articleParagraphs(lines.slice(urlIndex+1).join('\n')).join('\n\n'),category:'My reading'};
}
export function validateArticle(value:unknown):ArticleDraft{
  const d=value as ArticleDraft;
  if(!d||typeof d!=='object'||['title','url','body','category'].some(k=>typeof (d as any)[k]!=='string'))throw new Error('Please include a title, source URL and article text.');
  const result={title:d.title.trim(),url:d.url.trim(),body:cleanArticle(d.body),category:d.category.trim()||'My reading'};
  if(!result.title||result.title.length>500||result.url.length>2000||result.body.length<20||result.body.length>150000||result.category.length>80)throw new Error('Use a title under 500 characters and article text between 20 and 150,000 characters.');
  let url:URL;try{url=new URL(result.url)}catch{throw new Error('Enter a valid source URL.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an http or https source URL without login details.');
  if(url.hostname!=='nytimes.com'&&!url.hostname.endsWith('.nytimes.com'))throw new Error('Please use a New York Times article URL.');
  url.hash=''; result.url=url.href;
  return result;
}

// Legacy imports contain no publication metadata. NYT standard article URLs carry a date.
export function articleDate(url:string):string|null{
  try{
    const match=new URL(url).pathname.match(/^\/(\d{4})\/(\d{2})\/(\d{2})\//);
    if(!match)return null;
    const date=match.slice(1).join('-');
    const parsed=new Date(date+'T00:00:00Z');
    return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:null;
  }catch{return null;}
}
export function articleDateLabel(url:string):string{
  const date=articleDate(url);
  return date?new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z')):'Date unavailable';
}
export function latestArticles(items:SavedArticle[]):SavedArticle[]{
  return [...items].sort((a,b)=>{
    const aDate=articleDate(a.url),bDate=articleDate(b.url);
    return (bDate?Date.parse(bDate):b.created_at)-(aDate?Date.parse(aDate):a.created_at)||b.created_at-a.created_at||a.id.localeCompare(b.id);
  }).slice(0,20);
}
