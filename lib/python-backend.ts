import {env} from 'cloudflare:workers';
/** Forward only after Sites has authenticated the user. Never trust browser identity headers. */
export async function pythonBackend(path:string,userId:string,request?:Request):Promise<Response|null>{
 const config=env as unknown as {PYTHON_BACKEND_URL?:string;PYTHON_BACKEND_TOKEN?:string};
 if(!config.PYTHON_BACKEND_URL)return null;
 if(!config.PYTHON_BACKEND_TOKEN)return Response.json({error:'The Python backend connection is incomplete.'},{status:503});
 try{
  const base=new URL(config.PYTHON_BACKEND_URL);
  if(base.protocol!=='https:'||base.username||base.password)throw new Error('Invalid backend URL');
  const target=new URL(path,base);
  if(target.origin!==base.origin)throw new Error('Invalid API path');
  const method=request?.method||'GET';
  const response=await fetch(target,{method,headers:{Authorization:'Bearer '+config.PYTHON_BACKEND_TOKEN,'X-Wordloom-User':userId,'Content-Type':'application/json'},body:method==='GET'?undefined:await request!.text(),redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Unexpected backend response');
  return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'The Python backend is unavailable. Please try again.'},{status:503})}
}
