import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const extraction=readFileSync(new URL('../wordloom-importer/extract.js',import.meta.url),'utf8');
function extract({notice='',hidden=false,root=true}={}){
 const paragraph={innerText:'This is a sample article sentence about a neighbourhood garden. '.repeat(12),getClientRects:()=>[{}],getAttribute:()=>null,parentElement:null,closest:()=>null};
 return vm.runInNewContext(extraction,{URL,location:{href:'https://www.nytimes.com/2026/09/21/world/test.html?campaign=example'},getComputedStyle:()=>({display:hidden?'none':'block',visibility:'visible',opacity:'1'}),document:{body:{innerText:notice},querySelector:s=>s==='h1'?{innerText:'Garden article'}:s.startsWith('meta')?null:root?{querySelectorAll:()=>[paragraph]}:null}});
}
test('extracts visible paragraphs and removes tracking query',()=>{const r=extract();assert.equal(r.title,'Garden article');assert(!r.url.includes('?'));assert(r.body.includes('garden'));});
test('stops on verification',()=>assert(extract({notice:'Verify you are human'}).error));
test('does not read hidden text',()=>assert(extract({hidden:true}).error));
test('rejects unsupported layouts',()=>assert(extract({root:false}).error));
const background=readFileSync(new URL('../wordloom-importer/background.js',import.meta.url),'utf8');
test('transfer is limited to the destination site and matching ID',async()=>{
 let handler;const id='import-11111111-1111-1111-1111-111111111111';const saved={[id]:{article:{title:'Test'},createdAt:Date.now()}};
 vm.runInNewContext(background,{importScripts:()=>{},URL,Date,chrome:{runtime:{onMessage:{addListener:fn=>handler=fn},getURL:p=>'chrome-extension://test/'+p},storage:{session:{get:async key=>key?{[key]:saved[key]}:saved,remove:async key=>delete saved[key]}}}});
 const send=(message,url)=>new Promise(resolve=>handler(message,{tab:{id:1},url},resolve));
 assert.equal((await send({type:'GET_ARTICLE',id},'https://example.com/#wordloom-import='+id)).ok,false);
 assert.equal((await send({type:'GET_ARTICLE',id},'https://wordloom-reading.nicktang0307.chatgpt.site/#other')).ok,false);
 const url='https://wordloom-reading.nicktang0307.chatgpt.site/#wordloom-import='+id;
 assert.equal((await send({type:'GET_ARTICLE',id},url)).article.title,'Test');
 await send({type:'ACK_ARTICLE',id},url);
 assert.equal((await send({type:'GET_ARTICLE',id},url)).ok,false);
});
