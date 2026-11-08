import {Main,SCENES,Caption} from './Main';
import {SHOTS,CAPTIONS,SFX,FPS,TOTAL} from './timeline';
import {Audio} from 'remotion';
import React from 'react';
import {staticFile} from 'remotion';
const Narration=()=>React.createElement(Audio,{src:staticFile('audio/narration.mp3'),volume:1.18});
export const WORKBENCH={name:'Адам · Reels',fps:FPS,width:1080,height:1920,total:TOTAL,background:'#f1f0ec',revision:'v4',
shots:SHOTS.map(s=>({...s,component:SCENES[s.id]})),transitions:[],
captions:CAPTIONS.filter(c=>c.text!=='Адам.').map(c=>({id:'caption-'+c.from,label:c.text,from:c.from,duration:c.to-c.from,component:Caption,props:{text:c.text},schema:[{type:'textarea',key:'text',label:'Субтитры',default:c.text}]})),
overlays:[{id:'voice',label:'Русский диктор',from:0,duration:TOTAL,component:Narration}],
sfx:SFX.map(s=>({from:s.from,duration:s.duration,src:'audio/'+s.src,volume:s.volume})),
bgm:[{from:0,duration:TOTAL,src:'audio/music.mp3',volume:.075,fadeIn:35,fadeOut:65}],order:['captions','overlays','transitions'],original:Main};
