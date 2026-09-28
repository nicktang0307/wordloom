export type Sense={meaning:string;zh:string;part:string;example:string};
export async function lookupDictionary(word:string,fetcher:typeof fetch=fetch){
  let unavailable=false;
  for(const provider of ['free','datamuse']){
    try{
      const url=provider==='free'?'https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(word):'https://api.datamuse.com/words?sp='+encodeURIComponent(word)+'&md=d&max=5';
      const response=await fetcher(url,{signal:AbortSignal.timeout(5000)});
      if(!response.ok){if(response.status!==404)unavailable=true;continue;}
      const data=await response.json();
      if(!Array.isArray(data))throw new Error('Invalid dictionary response');
      const senses:Sense[]=provider==='free'
        ?data.flatMap(e=>(e.meanings||[]).flatMap((m:any)=>(m.definitions||[]).filter((d:any)=>typeof d.definition==='string'&&d.definition.trim()).map((d:any)=>({meaning:d.definition.slice(0,500),zh:'',part:String(m.partOfSpeech||''),example:String(d.example||'').slice(0,1500)}))))
        :data.filter(e=>typeof e.word==='string'&&e.word.toLowerCase()===word).flatMap(e=>(e.defs||[]).filter((d:any)=>typeof d==='string').map((d:string)=>{const [part,...definition]=d.split('\t');return {meaning:(definition.length?definition.join('\t'):part).slice(0,500),part:definition.length?part:'',zh:'',example:''}}));
      if(senses.length)return {senses:senses.slice(0,8),provider:provider==='free'?'Free Dictionary API':'Datamuse (WordNet / Wiktionary)',url:provider==='free'?'https://dictionaryapi.dev/':'https://www.datamuse.com/api/'};
    }catch{unavailable=true;}
  }
  return {error:unavailable?'The dictionaries could not be reached. Try again, open the dictionary below, or add your own meaning.':'No definition found. Try the base form of the word, or add your own meaning.',status:unavailable?503:404};
}
