import {getChatGPTUser} from '@/app/chatgpt-auth';
import {pythonBackend} from '@/lib/python-backend';
export async function GET(){const u=await getChatGPTUser();if(!u)return Response.json({error:'Sign in to load your reading picks.'},{status:401});return await pythonBackend('/api/articles',u.userId)??Response.json({enabled:false,articles:[]});}
