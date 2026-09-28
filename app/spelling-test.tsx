'use client';
import {useRef,useState} from 'react';
import {ArrowLeft,Check} from 'lucide-react';
import {Progress} from '@/components/ui/progress';
import {type Word} from './practice';
import {cloze,correctSpelling} from '@/lib/practice';

export function SpellingTest({words,onExit}:{words:Word[];onExit:()=>Promise<void>}) {
 const [cards]=useState(()=>[...words].filter(w=>w.meaning.trim()||w.zh.trim()).sort((a,b)=>a.due-b.due).slice(0,10));
 const [index,setIndex]=useState(0),[answer,setAnswer]=useState(''),[result,setResult]=useState<'correct'|'incorrect'|'skipped'|null>(null),[score,setScore]=useState(0),[missed,setMissed]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),input=useRef<HTMLInputElement>(null);
 const word=cards[index],finished=index>=cards.length;
 async function leave(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await onExit()}catch{setError('Could not refresh your notebook. Please try again.')}finally{lock.current=false;setBusy(false)}}
 function check(skip=false){if(result||(!skip&&!answer.trim()))return;setResult(skip?'skipped':correctSpelling(answer,word.word)?'correct':'incorrect')}
 async function next(){
  if(lock.current||!result)return;
  lock.current=true;setBusy(true);setError('');
  try{
   const response=await fetch('/api/words',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'review',id:word.id,rating:result==='correct'?'remember':'again',expectedStage:word.stage,expectedDue:word.due}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('Your result could not be saved. Try again before moving on.');
   if(result==='correct')setScore(v=>v+1);else setMissed(v=>[...v,word.word]);
   setIndex(v=>v+1);setAnswer('');setResult(null);
   requestAnimationFrame(()=>input.current?.focus());
  }catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'Saving took too long. Try again; the same result will not count twice.')}finally{lock.current=false;setBusy(false)}
 }
 if(finished)return <section className="lesson-complete spelling-test"><Check size={36}/><p className="eyebrow">SPELLING TEST</p><h2>{cards.length?'Test complete.':'Add a meaning first.'}</h2>{cards.length?<><p className="spelling-score">{score} / {cards.length} correct</p><p>Missed or skipped words return sooner. Your review dates are saved.</p>{missed.length>0&&<div className="spelling-missed"><h3>Keep practising</h3><p>{missed.join(' · ')}</p></div>}</>:<p>Save an English meaning or Cantonese explanation in your notebook to use a word in this test.</p>}<button className="primary" disabled={busy} onClick={()=>void leave()}>Back to practice</button>{error&&<p role="alert" className="error">{error}</p>}</section>;
 return <section className="lesson spelling-test"><button className="back" disabled={busy} onClick={()=>void leave()}><ArrowLeft size={17}/>Back to practice</button><div className="lesson-progress"><span>Spelling test · 拼字測驗</span><span>{index+1} / {cards.length}</span></div><Progress value={index/cards.length*100} aria-label="Spelling test progress"/><div className="lesson-surface"><p className="eyebrow">REMEMBER THE WORD</p><h2>Which word is it?</h2>{word.zh&&<p className="chinese lesson-prompt" lang="zh-Hant-HK">{cloze(word.zh,word.word)}</p>}{word.meaning&&<p className="lesson-prompt">{cloze(word.meaning,word.word)}</p>}<p className="lesson-note">Type the word saved in your notebook. Capital letters do not matter.</p><form onSubmit={e=>{e.preventDefault();check()}}><label className="lesson-label" htmlFor="test-spelling">Your spelling</label><input ref={input} id="test-spelling" className="lesson-input" value={answer} onChange={e=>setAnswer(e.target.value)} maxLength={100} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} disabled={!!result||busy} autoFocus/>{!result&&<div className="lesson-actions"><button type="submit" className="primary" disabled={!answer.trim()||busy}>Check answer</button><button type="button" className="secondary" disabled={busy} onClick={()=>check(true)}>I don’t know</button></div>}</form>{result&&<div className={'lesson-feedback '+(result==='correct'?'right':'retry')} role="status"><b>{result==='correct'?'Correct!':result==='skipped'?'Let’s learn this one.':'Not quite — here is the spelling.'}</b><p className="spelling-answer">{word.word}</p>{word.context&&<blockquote>{word.context}</blockquote>}<button type="button" className="primary" disabled={busy} onClick={()=>void next()}>{busy?'Saving…':error?'Retry saving':index===cards.length-1?'Save & see results':'Save & next word'}</button></div>}{error&&<p className="error" role="alert">{error}</p>}</div><p className="lesson-note">Each result saves when you continue. This test uses your saved explanations and makes no AI requests.</p></section>
}
