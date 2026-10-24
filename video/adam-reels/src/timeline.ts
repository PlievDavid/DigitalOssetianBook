export const FPS=30;
export const TOTAL=930;
export const SHOTS=[
 {id:'intro',label:'Осетинский становится ближе',from:0,duration:150},
 {id:'audio',label:'Аудиопазл: выбор слов',from:150,duration:120},
 {id:'crossword',label:'Кроссворд: ввод и проверка',from:270,duration:150},
 {id:'wordle',label:'Пять букв: раскрытие ответа',from:420,duration:195},
 {id:'choice',label:'Выбор занятий',from:615,duration:135},
 {id:'outro',label:'Адам: финал',from:750,duration:180},
] as const;
export const CAPTIONS=[
 {from:3,to:76,text:'Хочешь учить осетинский?'},
 {from:89,to:142,text:'Начни с Адама.'},
 {from:156,to:255,text:'Слушай фразы и собирай\nответы в аудиопазлах.'},
 {from:273,to:326,text:'Вспоминай знакомые слова'},
 {from:328,to:407,text:'и находи новые\nв тематических кроссвордах.'},
 {from:423,to:471,text:'Любишь играть?'},
 {from:490,to:602,text:'Попробуй угадать слово дня\nв игре «Пять букв».'},
 {from:626,to:680,text:'Выбирай, что нравится,'},
 {from:683,to:743,text:'и занимайся в своём темпе.'},
 {from:763,to:794,text:'Адам.'},
 {from:810,to:883,text:'Начни с первого слова.'},
];
const START=Object.fromEntries(SHOTS.map(s=>[s.id,s.from])) as Record<typeof SHOTS[number]['id'],number>;
export const SFX=[
 {from:START.intro+88,src:'impact.mp3',volume:.16,duration:28},
 {from:START.audio,src:'sweep.mp3',volume:.19,duration:25},
 ...[28,76].map(offset=>({from:START.audio+offset,src:'tap.mp3',volume:.22,duration:9})),
 ...[37,50,63,76].map(offset=>({from:START.crossword+offset,src:'tap.mp3',volume:.20,duration:9})),
 {from:START.crossword+102,src:'impact.mp3',volume:.12,duration:28},
 {from:START.wordle,src:'sweep.mp3',volume:.18,duration:25},
 ...[104,111,118,125,132].map(offset=>({from:START.wordle+offset,src:'tap.mp3',volume:.22,duration:9})),
 {from:START.choice,src:'sweep.mp3',volume:.18,duration:25},
 {from:START.outro+25,src:'impact.mp3',volume:.18,duration:28},
];
