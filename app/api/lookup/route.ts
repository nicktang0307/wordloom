import {lookupDictionary} from '@/lib/dictionary';
import {pythonBackend} from '@/lib/python-backend';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {articles} from '@/app/content';
export async function GET(req:Request){const u=await getChatGPTUser();if(!u)return Response.json({error:'Sign in to look up words.'},{status:401});const forwarded=await pythonBackend('/api/lookup'+new URL(req.url).search,u.userId);if(forwarded)return forwarded;const word=new URL(req.url).searchParams.get('word')?.trim().toLowerCase()||'';if(!/^[a-z][a-z '-]{0,79}$/.test(word))return Response.json({error:'Try a short English word or phrase.'},{status:400});const curated=articles.flatMap(a=>a.words).find(w=>w[0]===word);if(curated)return Response.json({senses:[{meaning:curated[1],zh:curated[2],part:'',example:''}],provider:'Wordloom'});const result=await lookupDictionary(word);return Response.json(result,{status:'error' in result?result.status:200});}
