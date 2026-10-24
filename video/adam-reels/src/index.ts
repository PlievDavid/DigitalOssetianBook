import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {Main} from './Main';
import {FPS,TOTAL} from './timeline';
registerRoot(()=>React.createElement(Composition,{id:'AdamReels',component:Main,durationInFrames:TOTAL,fps:FPS,width:1080,height:1920,defaultProps:{bgm:true}}));
