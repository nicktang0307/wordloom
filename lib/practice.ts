export type Lesson={step:number;help:boolean;sentence:string;spelling:string;gap:string;speaking:'pending'|'done'|'skip';completed:boolean};
export const newLesson=():Lesson=>({step:0,help:false,sentence:'',spelling:'',gap:'',speaking:'pending',completed:false});
export function readLesson(raw?:string):Lesson{try{const p=JSON.parse(raw||'');return p&&Number.isInteger(p.step)&&p.step>=0&&p.step<=5?{...newLesson(),...p}:newLesson()}catch{return newLesson()}}
export function normalise(s:string){return s.normalize('NFKC').trim().toLowerCase().replace(/[‘’]/g,"'").replace(/[‐‑–—]/g,'-').replace(/\s+/g,' ')}
export function correctSpelling(answer:string,word:string){return normalise(answer)===normalise(word)}
export function wordPattern(word:string){return new RegExp('(?<![A-Za-z])'+word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![A-Za-z])','gi')}
export function cloze(context:string,word:string){return context.replace(wordPattern(word),'_____')}
export function sentenceCheck(sentence:string,word:string){if(!wordPattern(word).test(sentence))return 'Include the word “'+word+'” in your sentence.';if(sentence.trim().split(/\s+/).length<5)return 'Give your sentence more context—aim for at least five words.';return ''}
export function nextReview(stage:number,help:boolean,now:number){const next=help?0:Math.min(stage+1,6);return {stage:next,due:now+(help?600000:[0,1,3,7,14,30,60][next]*86400000)}}
