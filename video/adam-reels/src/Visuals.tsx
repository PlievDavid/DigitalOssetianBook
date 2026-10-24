import React from 'react';
import {AbsoluteFill,Img,staticFile,useCurrentFrame,interpolate,Easing} from 'remotion';
import choices from '../public/audio-choices.json';
const C={bg:'#f1f0ec',green:'#173f31',ink:'#101b34',muted:'#526273',blue:'#cce0f6',sage:'#dce7d3',sand:'#ffe0b3'};
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
const tween=(f:number,a:number,b:number)=>interpolate(f,[a,b],[0,1],{...clamp,easing:Easing.bezier(.22,1,.36,1)});
const Brand:React.FC=()=><div style={{position:'absolute',left:88,top:125,display:'flex',alignItems:'center',gap:22}}><Img src={staticFile('brand.svg')} style={{width:86,height:70}}/><div style={{fontSize:52,fontWeight:700,color:C.green,letterSpacing:-2}}>Адам</div></div>;
const Heading:React.FC<{children:React.ReactNode}>=({children})=><div style={{position:'absolute',left:88,right:75,top:265,fontSize:94,lineHeight:1.07,fontWeight:650,letterSpacing:-3,color:C.green}}>{children}</div>;
const Headphones:React.FC<{size?:number}>=({size=60})=><svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 20v-5a11 11 0 0 1 22 0v5"/><rect x="4" y="17" width="5" height="11" rx="2" fill="currentColor"/><rect x="23" y="17" width="5" height="11" rx="2" fill="currentColor"/></svg>;

export const Intro3:React.FC=()=>{const f=useCurrentFrame(),p=tween(f,73,105);return <AbsoluteFill style={{background:C.bg,overflow:'hidden'}}><Brand/>
 <div style={{position:'absolute',left:0,top:480,width:1080,height:1000,overflow:'hidden',opacity:tween(f,0,40)}}><Img src={staticFile('watercolor.png')} style={{position:'absolute',left:260,top:0,width:850,transform:`translateY(${(1-tween(f,0,65))*65}px) scale(${1+.025*f/150})`}}/></div>
 <Heading>Осетинский<br/>становится ближе.</Heading>
 <div style={{position:'absolute',left:70,top:650,fontSize:460,lineHeight:1,fontWeight:650,color:C.green,opacity:1-p,transform:`translateY(${(1-tween(f,0,42))*80}px)`}}>Ӕ</div>
 <div style={{position:'absolute',left:86,top:755,fontSize:175,fontWeight:700,letterSpacing:-9,color:C.green,opacity:p,transform:`translateY(${(1-p)*45}px)`}}>Адам</div>
 <div style={{position:'absolute',left:90,top:1060,width:420,fontSize:40,lineHeight:1.3,color:C.green,opacity:p}}>Осетинский язык<br/>для всех</div>
 </AbsoluteFill>};

export const Audio3:React.FC=()=>{const f=useCurrentFrame();const step=f<65?0:1;const data=choices[step];const press=step===0?28:76,fly=press+8,land=fly+21;
const progress=interpolate(f,[fly,land],[0,1],{...clamp,easing:Easing.bezier(.4,0,.2,1)});const completed=f>=land;const cardIn=tween(f,0,22);
const slotX=(i:number)=>126+i*280;
const startX=slotX(data.correct),endX=126+step*280;
const tile=(src:string,x:number,y:number,opacity=1,scale=1)=><Img src={staticFile(src)} style={{position:'absolute',left:x,top:y,width:250,height:106,objectFit:'contain',opacity,transform:`scale(${scale})`}}/>;
return <AbsoluteFill style={{background:C.bg,overflow:'hidden'}}><Brand/><Heading>Слушай фразу.<br/>Выбирай слова.</Heading>
 <div style={{position:'absolute',left:70,top:575,width:940,height:875,borderRadius:24,background:'#fff',border:'1px solid #dfe5e9',boxShadow:'0 18px 45px #162c2310',opacity:cardIn,transform:`translateY(${(1-cardIn)*40}px)`}}/>
 <Img src={staticFile('audio-prompt.png')} style={{position:'absolute',left:112,top:620,width:856,borderRadius:18,opacity:cardIn}}/>
 <div style={{position:'absolute',left:112,top:885,width:856,height:105,background:'#ecf4fc',borderRadius:14,display:'flex',alignItems:'center',padding:'0 24px',gap:8}}>
 <div style={{width:65,height:65,borderRadius:'50%',background:C.green,color:'white',display:'grid',placeItems:'center',marginRight:20}}><svg width="24" height="28" viewBox="0 0 24 28" fill="currentColor"><path d="M2 2 23 14 2 26Z"/></svg></div>
 {Array.from({length:49},(_,i)=><div key={i} style={{width:7,borderRadius:6,background:C.green,opacity:i<Math.floor(f*.45)?1:.26,height:12+42*Math.abs(Math.sin(i*.45+f*.08))}}/>)}
 </div>
 <div style={{position:'absolute',left:113,top:1024,fontFamily:'Golos',fontSize:30,fontWeight:550,color:C.muted}}>Ваш ответ</div>
 <div style={{position:'absolute',left:112,top:1070,width:856,height:130,border:'2px dashed #bdcdb9',borderRadius:16,background:'#f8faf5'}}/>
 <div style={{position:'absolute',left:113,top:1232,fontFamily:'Golos',fontSize:30,fontWeight:550,color:C.muted}}>Выберите слово</div>
 {data.options.map((_,i)=>{const chosen=i===data.correct;const visible=!chosen||f<fly;const stage=step===0?1-interpolate(f,[59,64],[0,1],clamp):tween(f,65,73);const opacity=visible?stage:0;const scale=chosen?interpolate(f,[press,press+5,fly],[1,.96,1],clamp):1;return <React.Fragment key={i}>{tile(`audio-choice-${step}-${i}.png`,slotX(i),1290,opacity,scale)}</React.Fragment>})}
 {step===1&&tile('audio-selected-0.png',126,1082)}
 {f>=fly&&tile(`audio-selected-${step}.png`,startX+(endX-startX)*progress,1290+(1082-1290)*progress-52*Math.sin(progress*Math.PI),1,1+.035*Math.sin(progress*Math.PI))}
 {f>=press&&f<press+18&&<div style={{position:'absolute',left:startX+125-40,top:1343-40,width:80,height:80,border:'3px solid #173f31',borderRadius:'50%',opacity:interpolate(f,[press,press+18],[.32,0],clamp),transform:`scale(${interpolate(f,[press,press+18],[.4,1.4],clamp)})`}}/>}
 <div style={{position:'absolute',left:800,top:1024,fontFamily:'Golos',fontSize:28,color:C.muted}}>{step+1+(completed?1:0)} / 6</div>
 </AbsoluteFill>};

export const Choice3:React.FC=()=>{const f=useCurrentFrame();const cards=[{title:'Аудиопазлы',hint:'Слушай и выбирай',color:C.blue},{title:'Кроссворды',hint:'Вспоминай слова',color:C.sage},{title:'Пять букв',hint:'Играй каждый день',color:C.sand}];return <AbsoluteFill style={{background:C.bg,overflow:'hidden'}}><Brand/><Heading>С чего<br/>начнём?</Heading>
 {cards.map((c,i)=>{const p=tween(f,i*10,32+i*10);return <div key={c.title} style={{position:'absolute',left:85,top:580+i*285,width:910,height:250,borderRadius:24,background:c.color,overflow:'hidden',opacity:p,transform:`translateY(${(1-p)*65}px)`}}>
 <div style={{position:'absolute',left:40,top:40,fontSize:65,fontWeight:650,letterSpacing:-2,color:C.green}}>{c.title}</div><div style={{position:'absolute',left:43,top:140,fontSize:34,color:C.green}}>{c.hint}</div>
 {i===0?<div style={{position:'absolute',right:46,top:70,color:C.green}}><Headphones size={100}/></div>:i===1?<Img src={staticFile('family.webp')} style={{position:'absolute',right:0,top:0,width:255,height:250,objectFit:'contain'}}/>:<div style={{position:'absolute',right:30,top:75,display:'flex',gap:6}}>{['Ӕ','М'].map(t=><div key={t} style={{width:84,height:94,borderRadius:10,background:C.green,color:'white',display:'grid',placeItems:'center',fontSize:59,fontWeight:600,transform:t==='Ӕ'?'rotate(-7deg)':'rotate(7deg)'}}>{t}</div>)}</div>}
 </div>})}
 </AbsoluteFill>};

export const Outro3:React.FC=()=>{const f=useCurrentFrame();return <AbsoluteFill style={{background:C.bg,overflow:'hidden'}}><Brand/>
 <Img src={staticFile('watercolor.png')} style={{position:'absolute',left:340,top:430,width:800,opacity:tween(f,0,35),transform:`translateY(${(1-tween(f,0,45))*80}px)`}}/>
 <div style={{position:'absolute',left:86,top:520,fontSize:185,fontWeight:700,letterSpacing:-9,color:C.green,opacity:tween(f,0,30)}}>Адам</div>
 <div style={{position:'absolute',left:90,top:800,fontSize:88,fontWeight:650,lineHeight:1.09,letterSpacing:-3,color:C.green,opacity:tween(f,22,49)}}>Начни<br/>с первого<br/>слова.</div>
 <div style={{position:'absolute',left:90,top:1220,padding:'26px 36px',borderRadius:14,background:C.green,color:'#fff',fontFamily:'Golos',fontSize:36,fontWeight:550,opacity:tween(f,43,67)}}>Начать заниматься <span style={{marginLeft:30}}>→</span></div>
 </AbsoluteFill>};
