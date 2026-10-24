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
const headline:React.CSSProperties={fontSize:94,lineHeight:1.07,fontWeight:650,letterSpacing:-3,margin:0};
const enter=(f:number)=>({opacity:ramp(f,0,17),transform:`translateY(${(1-ramp(f,0,28))*80}px)`});
const Tag:React.FC<{text:string;dark?:boolean}>=({text,dark})=><div style={{...label,color:dark?'#b7cbbb':green,position:'absolute',left:88,top:155}}>{text}</div>;
const Head:React.FC<{children:React.ReactNode;dark?:boolean}>=({children,dark})=><h1 style={{...headline,color:dark?cream:green,position:'absolute',left:84,top:255,right:80}}>{children}</h1>;
const Decor:React.FC<{dark?:boolean}>=({dark})=><><div style={{position:'absolute',width:1100,height:1100,border:`1px solid ${dark?'#ffffff15':'#173f3112'}`,borderRadius:'50%',left:340,top:540}}/><div style={{position:'absolute',width:750,height:750,border:`1px solid ${dark?'#ffffff10':'#173f3110'}`,borderRadius:'50%',left:-420,top:-250}}/></>;

export const Crossword:React.FC=()=>{const f=useCurrentFrame();const state=f<37?0:f<50?1:f<63?2:f<76?3:f<102?4:5;
 return <AbsoluteFill style={{background:cream,overflow:'hidden'}}><Decor/><Tag text="02 / КРОССВОРДЫ"/><div style={enter(f)}><Head>Слова находят<br/>своё место.</Head></div>
 <div style={{position:'absolute',top:600,left:88,fontSize:40,color:'#526273'}}>Тема: семья</div>
 <div style={{position:'absolute',top:770,left:70,width:940,background:'#fdfdf9',padding:'65px 36px',borderRadius:32,boxShadow:'0 30px 80px #173f3110',transform:`translateY(${(1-ramp(f,0,30))*120}px) scale(${1+.035*ramp(f,90,130)})`}}>
 <Img src={image('crossword'+state)} style={{width:'100%',display:'block'}}/>
 </div>
 <div style={{position:'absolute',left:90,top:1360,fontSize:46,fontWeight:600,color:state===5?green:'#526273',opacity:ramp(f,20,35)}}>{state===5?'✓ Слово проверено':'Подсказка: сын · 4 буквы'}</div>
 </AbsoluteFill>};

export const Wordle:React.FC=()=>{const f=useCurrentFrame();return <AbsoluteFill style={{background:green,overflow:'hidden'}}><Decor dark/><Tag text="03 / ПЯТЬ БУКВ" dark/><div style={enter(f)}><Head dark>Одно слово.<br/>Шесть попыток.</Head></div>
 <div style={{position:'absolute',left:85,top:565,width:910,height:950,borderRadius:30,background:cream,overflow:'hidden',transform:`translateY(${(1-ramp(f,0,28))*150}px)`}}>
 <Img src={image('wordle0')} style={{position:'absolute',left:90,top:35,width:730,display:'block'}}/>
 {Array.from({length:5},(_,i)=>{const a=104+i*7,p=interpolate(f,[a,a+9,a+18],[0,90,180],clamp);const front=f<a+9;return <div key={i} style={{position:'absolute',left:90+i*148.08,top:35,width:137.64,height:139.67,transform:`perspective(700px) rotateX(${p}deg)`,opacity:ramp(f,55+i*5,64+i*5),transformStyle:'preserve-3d'}}>
 {front?<div style={{height:'100%',borderRadius:10,background:'#f0f4e9',border:'3px solid #709578',color:green,display:'grid',placeItems:'center',fontSize:80,fontWeight:650}}>{'ЗМӔЛД'[i]}</div>:<Img src={staticFile('letter'+i+'.png')} style={{width:'100%',height:'100%',transform:'rotateX(180deg)'}}/>}
 </div>})}
 </div>
 <div style={{position:'absolute',left:88,top:508,color:cream,fontSize:32,fontWeight:550,opacity:ramp(f,145,164),background:green}}>✓ Есть! Возвращайся завтра.</div>
 </AbsoluteFill>};

export const Caption:React.FC<{text:string}>=({text})=><div style={{position:'absolute',left:75,right:135,top:1495,display:'flex',justifyContent:'center'}}><div style={{background:'#102d24',color:'white',padding:'22px 30px',borderRadius:18,fontFamily:'Golos',fontSize:62,fontWeight:550,lineHeight:1.18,textAlign:'center',whiteSpace:'pre-line',boxShadow:'0 5px 24px #00000018'}}>{text}</div></div>;
export const SCENES={intro:Intro3,audio:Audio3,crossword:Crossword,wordle:Wordle,choice:Choice3,outro:Outro3};
export const Main:React.FC<{bgm?:boolean}>=({bgm=true})=>{const [handle]=useState(()=>delayRender('Local fonts'));useEffect(()=>{Promise.all([new FontFace('Onest',`url(${staticFile('fonts/onest.ttf')})`).load(),new FontFace('Golos',`url(${staticFile('fonts/golos.ttf')})`).load()]).then(fonts=>{fonts.forEach(font=>document.fonts.add(font));continueRender(handle)})},[handle]);return <AbsoluteFill style={{background:cream,fontFamily:'Onest',overflow:'hidden'}}>
 {SHOTS.map(s=>{const C=SCENES[s.id];return <Sequence key={s.id} from={s.from} durationInFrames={s.duration}><C/></Sequence>})}
 {CAPTIONS.map(c=><Sequence key={c.from} from={c.from} durationInFrames={c.to-c.from}><Caption text={c.text}/></Sequence>)}
 <Audio src={staticFile('audio/narration.mp3')} volume={1.18}/>
 {bgm&&<Audio src={staticFile('audio/music.mp3')} volume={f=>interpolate(f,[0,35,TOTAL-65,TOTAL],[0,.075,.075,0],clamp)}/>}
 {SFX.map((s,i)=><Sequence key={i} from={s.from} durationInFrames={s.duration}><Audio src={staticFile('audio/'+s.src)} volume={s.volume}/></Sequence>)}
 </AbsoluteFill>};
