import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {explainCantonese} from '@/lib/cantonese';
export async function POST(req:Request){
 if(!await getChatGPTUser())return Response.json({error:'Sign in to translate words.'},{status:401});
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let word:string,meaning:string;
 try{const raw=await req.text();if(raw.length>4000)throw 0;const data=JSON.parse(raw);word=data.word;meaning=data.meaning;if(typeof word!=='string'||typeof meaning!=='string'||!word.trim()||word.length>100||!meaning.trim()||meaning.length>500)throw 0;}
 catch{return Response.json({error:'Choose an English meaning first.'},{status:400});}
 const key=(env as unknown as {OPENAI_API_KEY?:string}).OPENAI_API_KEY;
 if(!key)return Response.json({error:'Automatic Cantonese explanations are not connected yet. You can add your own below.',code:'not_configured'},{status:503});
 try{return Response.json({zh:await explainCantonese(word,meaning,key)},{headers:{'Cache-Control':'private, no-store'}})}
 catch{return Response.json({error:'Cantonese translation is unavailable. Your English meaning is still here; try again or add your own.'},{status:503})}
}
