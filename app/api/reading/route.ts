import {getChatGPTUser} from '@/app/chatgpt-auth';
import {db} from '@/lib/db';
import {pythonBackend} from '@/lib/python-backend';
import {validateArticle} from '@/lib/reading';
const privateHeaders={'Cache-Control':'private, no-store'};
export async function GET(){
  const u=await getChatGPTUser();if(!u)return Response.json({error:'Sign in to view your articles.'},{status:401});
  const forwarded=await pythonBackend('/api/reading',u.userId);if(forwarded)return forwarded;
  try{
    const rows=await db().prepare('SELECT id,title,url,body,category,created_at,read_at FROM reading_articles WHERE owner=? ORDER BY created_at DESC').bind(u.userId).all();
    return Response.json(rows.results,{headers:privateHeaders});
  }catch(e){console.error(e);return Response.json({error:'Your articles could not be loaded. Please try again.'},{status:503,headers:privateHeaders});}
}
export async function POST(req:Request){
  const u=await getChatGPTUser();if(!u)return Response.json({error:'Sign in to import articles.'},{status:401});
  if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
  let draft;
  try{const raw=await req.text();if(raw.length>250000)throw new Error('This article is too large.');draft=validateArticle(JSON.parse(raw));}
  catch(e){return Response.json({error:e instanceof SyntaxError?'Invalid article data.':(e as Error).message},{status:400});}
  const forwarded=await pythonBackend('/api/reading',u.userId,new Request(req.url,{method:'POST',body:JSON.stringify(draft)}));if(forwarded)return forwarded;
  try{
    await db().prepare('INSERT INTO reading_articles (id,owner,title,url,body,category,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner,url) DO UPDATE SET title=excluded.title,body=excluded.body,category=excluded.category').bind(crypto.randomUUID(),u.userId,draft.title,draft.url,draft.body,draft.category,Date.now()).run();
    const row=await db().prepare('SELECT id,title,url,body,category,created_at,read_at FROM reading_articles WHERE owner=? AND url=?').bind(u.userId,draft.url).first();
    return Response.json(row,{headers:privateHeaders});
  }catch(e){console.error(e);return Response.json({error:'Could not save your article. Your text is still here; please try again.'},{status:503});}
}

export async function PATCH(req:Request){
  const u=await getChatGPTUser();if(!u)return Response.json({error:'Sign in to mark an article as read.'},{status:401});
  if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
  let id:string;
  try{const raw=await req.text();if(raw.length>1000)throw new Error();const value=JSON.parse(raw);if(typeof value.id!=='string'||!value.id||value.id.length>100)throw new Error();id=value.id;}
  catch{return Response.json({error:'Invalid article.'},{status:400});}
  try{
    const row=await db().prepare('UPDATE reading_articles SET read_at=COALESCE(read_at,?) WHERE id=? AND owner=? RETURNING id,read_at').bind(Date.now(),id,u.userId).first();
    if(!row)return Response.json({error:'Article not found.'},{status:404});
    return Response.json(row,{headers:privateHeaders});
  }catch{return Response.json({error:'Could not save read status. Please try opening the article again.'},{status:503});}
}
