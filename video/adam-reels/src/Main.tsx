import React,{useEffect,useState} from 'react';
import {AbsoluteFill,Audio,Img,Sequence,staticFile,useCurrentFrame,interpolate,Easing,delayRender,continueRender} from 'remotion';
import {CAPTIONS,SHOTS,SFX,TOTAL} from './timeline';
import {Intro3,Audio3,Choice3,Outro3} from './Visuals';
const green='#173f31',cream='#f1f0ec',ink='#101b34';
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
const ease=Easing.bezier(.16,1,.3,1);
const ramp=(f:number,a:number,b:number)=>interpolate(f,[a,b],[0,1],{...clamp,easing:ease});
const image=(s:string)=>staticFile(s+'.png');
const label:React.CSSProperties={fontFamily:'Golos',fontSize:32,fontWeight:550,letterSpacing:5,textTransform:'uppercase'};
const headline:React.CSSProperties={fontSize:86,lineHeight:1.12,fontWeight:550,letterSpacing:-1.5,margin:0};
const enter=(f:number)=>({opacity:ramp(f,0,17),transform:`translateY(${(1-ramp(f,0,28))*80}px)`});
const Tag:React.FC<{text:string;dark?:boolean}>=({text,dark})=><div style={{...label,color:dark?'#b7cbbb':green,position:'absolute',left:88,top:155}}>{text}</div>;
const Head:React.FC<{children:React.ReactNode;dark?:boolean}>=({children,dark})=><h1 style={{...headline,color:dark?cream:green,position:'absolute',left:84,top:255,right:80}}>{children}</h1>;
const Decor:React.FC<{dark?:boolean}>=({dark})=><><div style={{position:'absolute',width:1100,height:1100,border:`1px solid ${dark?'#ffffff15':'#173f3112'}`,borderRadius:'50%',left:340,top:540}}/><div style={{position:'absolute',width:750,height:750,border:`1px solid ${dark?'#ffffff10':'#173f3110'}`,borderRadius:'50%',left:-420,top:-250}}/></>;

export const Crossword:React.FC=()=>{const f=useCurrentFrame();const state=f<37?0:f<50?1:f<63?2:f<76?3:f<102?4:5;
 return <AbsoluteFill style={{background:cream,overflow:'hidden'}}><Tag text="КРОССВОРДЫ"/><Head>Вспоминай слова.<br/>Находи ответы.</Head>
 <div style={{position:'absolute',top:600,left:88,fontSize:40,color:'#526273'}}>Тема: семья</div>
 <div style={{position:'absolute',top:770,left:70,width:940,height:560,background:'#fdfdf9',padding:'65px 36px',borderRadius:24,border:'1px solid #dfe5e9'}}>
 {[0,37,50,63,76,102].map((at,i)=>f>=at&&<Img key={i} src={image('crossword'+i)} style={{position:'absolute',left:36,top:65,width:868,opacity:i===0?1:interpolate(f,[at,at+7],[0,1],clamp)}}/>)}
 </div>
 <div style={{position:'absolute',left:90,top:1360,fontSize:46,fontWeight:600,color:state===5?green:'#526273',opacity:ramp(f,20,35)}}>{state===5?'✓ Слово проверено':'Подсказка: сын · 4 буквы'}</div>
 </AbsoluteFill>};

export const Wordle:React.FC=()=>{const f=useCurrentFrame();return <AbsoluteFill style={{background:cream,overflow:'hidden'}}><Tag text="ПЯТЬ БУКВ"/><Head>Одно слово.<br/>Шесть попыток.</Head>
 <div style={{position:'absolute',left:85,top:565,width:910,height:950,borderRadius:24,background:'#fff',border:'1px solid #dfe5e9',overflow:'hidden'}}>
 <Img src={image('wordle0')} style={{position:'absolute',left:90,top:35,width:730,display:'block'}}/>
 {Array.from({length:5},(_,i)=>{const at=104+i*7;return <div key={i} style={{position:'absolute',left:90+i*148.08,top:35,width:137.64,height:139.67,opacity:interpolate(f,[50+i*7,57+i*7],[0,1],clamp)}}>
 <Img src={staticFile('typed-letter'+i+'.png')} style={{width:'100%',height:'100%'}}/>
 <Img src={staticFile('letter'+i+'.png')} style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:interpolate(f,[at,at+7],[0,1],clamp)}}/>
 </div>})}
 </div>
 <div style={{position:'absolute',left:88,top:508,color:green,fontSize:32,fontWeight:500,opacity:ramp(f,145,164)}}>✓ Есть! Возвращайся завтра.</div>
 </AbsoluteFill>};

export const Caption:React.FC<{text:string}>=({text})=><div style={{position:'absolute',left:75,right:115,top:1550,textAlign:'center',color:'#243a30',fontFamily:'Golos, Arial, sans-serif',fontSize:50,fontWeight:450,lineHeight:1.3,whiteSpace:'pre-line'}}>{text}</div>;
export const SCENES={intro:Intro3,audio:Audio3,crossword:Crossword,wordle:Wordle,choice:Choice3,outro:Outro3};
export const Main:React.FC<{bgm?:boolean}>=({bgm=true})=>{const [handle]=useState(()=>delayRender('Local fonts'));useEffect(()=>{new FontFace('Golos',`url(${staticFile('fonts/golos.ttf')})`,{weight:'400 900'}).load().then(font=>{document.fonts.add(font);continueRender(handle)})},[handle]);return <AbsoluteFill style={{background:cream,fontFamily:'Golos, Arial, sans-serif',overflow:'hidden'}}>
 {SHOTS.map(s=>{const C=SCENES[s.id];return <Sequence key={s.id} from={s.from} durationInFrames={s.duration}><C/></Sequence>})}
 {CAPTIONS.filter(c=>c.text!=='Адам.').map(c=><Sequence key={c.from} from={c.from} durationInFrames={c.to-c.from}><Caption text={c.text}/></Sequence>)}
 <Audio src={staticFile('audio/narration.mp3')} volume={1.18}/>
 {bgm&&<Audio src={staticFile('audio/music.mp3')} volume={f=>interpolate(f,[0,35,TOTAL-65,TOTAL],[0,.075,.075,0],clamp)}/>}
 {SFX.map((s,i)=><Sequence key={i} from={s.from} durationInFrames={s.duration}><Audio src={staticFile('audio/'+s.src)} volume={s.volume}/></Sequence>)}
 </AbsoluteFill>};
