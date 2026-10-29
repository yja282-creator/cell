import {stages,chromosomes,firstDivisionGroups,sceneState} from './model.js';
const $=s=>document.querySelector(s);
const svg=$('#cell-scene');
let mode='mitosis',index=0,progress=0,playing=false,lastTime=0,speed=1;
let spindle=true,labels=true,crossover=true;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const lerp=(a,b,p)=>a+(b-a)*p;
const ease=p=>p*p*(3-2*p);
const clamp=p=>Math.max(0,Math.min(1,p));
const el=(tag,attrs={},children='')=>`<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}>${children}</${tag}>`;
const line=(x1,y1,x2,y2,attrs={})=>el('line',{x1,y1,x2,y2,...attrs});
const ellipse=(cx,cy,rx,ry,attrs={})=>el('ellipse',{cx,cy,rx,ry,...attrs});
const text=(x,y,value,attrs={})=>el('text',{x,y,class:'svg-label',...attrs},value);
function nucleus(cx,cy,rx,ry,opacity=1){return ellipse(cx,cy,rx,ry,{fill:'#ffffff','fill-opacity':.52,stroke:'#6ebbbb','stroke-width':1.8,'stroke-dasharray':'6 5',opacity});}
function membrane(cx,cy,rx,ry,pinch=0){
 const waist=ry*(1-pinch*.86);
 return el('path',{'data-structure':'membrane',d:`M ${cx} ${cy-ry+pinch*ry*.86} C ${cx-rx*.48} ${cy-ry}, ${cx-rx} ${cy-ry}, ${cx-rx} ${cy} C ${cx-rx} ${cy+ry}, ${cx-rx*.48} ${cy+ry}, ${cx} ${cy+waist} C ${cx+rx*.48} ${cy+ry}, ${cx+rx} ${cy+ry}, ${cx+rx} ${cy} C ${cx+rx} ${cy-ry}, ${cx+rx*.48} ${cy-ry}, ${cx} ${cy-waist} Z`,fill:'url(#cell-fill)',stroke:'#41b5ac','stroke-width':2.2});
}
function pole(x,y,opacity=1){
 let rays='';for(let a=0;a<12;a++){const t=a*Math.PI/6;rays+=line(x+Math.cos(t)*9,y+Math.sin(t)*9,x+Math.cos(t)*19,y+Math.sin(t)*19,{stroke:'#f3b84c','stroke-width':1.1});}
 return el('g',{opacity},rays+el('rect',{x:x-7,y:y-4,width:14,height:8,rx:2,fill:'#ef9e2e',transform:`rotate(35 ${x} ${y})`})+el('rect',{x:x-3,y:y-9,width:6,height:14,rx:2,fill:'#ffd576',transform:`rotate(35 ${x} ${y})`}));
}
function fiber(px,py,x,y,opacity=1){return el('path',{'data-structure':'spindle',d:`M ${px} ${py} Q ${(px+x)/2} ${y+(py-y)*.25} ${x} ${y}`,stroke:'#14a98a','stroke-width':1.35,fill:'none',opacity:opacity*.75});}
function chromatid(c,x,y,sister=0,scale=1,exchange=false,decondense=0,separated=false){
 const len=c.length*scale,w=13*scale,sign=(sister===0?-1:1)*(separated?-1:1);
 const kink=decondense*9;
 let d=`M ${x+sign*w} ${y-len} Q ${x+sign*(2+kink)} ${y-len*.47} ${x} ${y} Q ${x+sign*(2-kink)} ${y+len*.47} ${x+sign*w} ${y+len}`;
 let shape=el('path',{d,stroke:c.color,'stroke-width':7*scale,'stroke-linecap':'round',fill:'none'});
 if(exchange && c.id<2 && sister===(c.id===0?1:0)){
  const start=.60;
  shape+=el('path',{d:`M ${x+sign*(w*.52)} ${y+len*start} Q ${x+sign*w*.75} ${y+len*.85} ${x+sign*w} ${y+len}`,stroke:c.other,'stroke-width':7*scale,'stroke-linecap':'round',fill:'none'});
 }
 return shape;
}
function chromosome(c,x,y,duplicated=true,scale=1,exchange=false,decondense=0,sister=0){
 return el('g',{'data-structure':'chromosome','data-id':c.id,'data-duplicated':String(duplicated)},(duplicated?chromatid(c,x,y,0,scale,exchange,decondense)+chromatid(c,x,y,1,scale,exchange,decondense):chromatid(c,x,y,sister,scale,exchange,decondense,true))+ellipse(x,y,3.8*scale,4*scale,{fill:'#384768',stroke:'#ffffff','stroke-width':1}));
}
function chromatin(c,x,y,scale=1,duplicated=false,exchange=false,sister=0){
 // Loosely coiled chromatin, with a second strand after DNA replication.
 const thread=(offset,s)=>{
  const d=`M ${x-20*scale+offset} ${y-15*scale} c ${-20*scale} ${-25*scale}, ${48*scale} ${-23*scale}, ${27*scale} ${-2*scale} s ${-40*scale} ${2*scale}, ${-18*scale} ${20*scale} s ${43*scale} ${-13*scale}, ${30*scale} ${7*scale} s ${-48*scale} ${16*scale}, ${-29*scale} ${-1*scale}`;
  let out=el('path',{d,fill:'none',stroke:c.color,'stroke-width':2.4,opacity:.85});
  if(exchange&&c.id<2&&s===(c.id===0?1:0))out+=el('path',{d:`M ${x+19*scale+offset} ${y+25*scale} q ${-16*scale} ${12*scale} ${-29*scale} ${-1*scale}`,fill:'none',stroke:c.other,'stroke-width':2.5});
  return out;
 };
 return el('g',{'data-structure':'chromatin','data-id':c.id,'data-duplicated':String(duplicated)},thread(0,sister)+(duplicated?thread(6,1):''));
}
function label(x,y,toX,toY,value,anchor='start'){
 if(!labels)return '';
 return el('g',{class:'structure-label'},el('path',{d:`M ${x} ${y-5} L ${toX} ${toY}`,fill:'none',stroke:'#5994b0','stroke-width':1})+text(x+(anchor==='end'?-6:6),y-9,value,{'text-anchor':anchor}));
}
function interphase(p){
 let out=membrane(480,245,320,185)+nucleus(480,245,150,135);
 for(const c of chromosomes){const x=425+(c.id%2)*105,y=195+Math.floor(c.id/2)*95;out+=chromatin(c,x,y,1.1,p>.48);}
 out+=pole(690,155)+pole(lerp(690,720,p),lerp(155,185,p),clamp(p*2));
 out+=label(340,83,390,140,'핵막')+label(563,407,536,310,'염색질')+label(738,110,701,153,'중심체');
 out+=text(480,465,p<.35?'G₁ · 세포 성장':p<.78?'S · DNA 복제':'G₂ · 분열 준비',{'text-anchor':'middle',class:'svg-cell-label'});
 return out;
}
function activeCell(cx,cy,rx,ry,ids,id,p,second=false,groupIndex=0){
 const stageBase=id.replace(/[12]$/,'');
 const pro=stageBase==='pro',meta=stageBase==='meta',ana=stageBase==='ana',telo=stageBase==='telo';
 const first=mode==='meiosis'&&!second;
 const sc=second?.8:1;
 const poleDist=rx*.79;
 const ap=ana?ease(p):telo?1:0;
 const poleP=pro?ease(p):1;
 const poleLeft=cx-lerp(rx*.52,poleDist,poleP),poleRight=cx+lerp(rx*.52,poleDist,poleP);
 const poleY=pro?cy-ry*.57*(1-poleP):cy;
 const exchange=mode==='meiosis'&&crossover&&(!pro||second||p>.5);
 let out=membrane(cx,cy,rx,ry,telo?.66*ease(p):0),fibers='',objects='';
 if(pro)out+=nucleus(cx,cy,rx*.51,ry*.74,1-clamp((p-.45)/.4));
 if(meta)out+=line(cx,cy-ry*.84,cx,cy+ry*.84,{stroke:'#78a9c4','stroke-dasharray':'4 6','stroke-width':1,opacity:.45});
 const opacity=telo?1-p:pro?clamp((p-.2)/.8):1;
 if(spindle){
  out+=pole(poleLeft,poleY,Math.max(.1,opacity))+pole(poleRight,cy+(cy-poleY),Math.max(.1,opacity));
  if(!pro || p>.35){for(const sy of [-1,1])fibers+=el('path',{d:`M ${poleLeft} ${poleY} Q ${cx} ${cy+sy*ry*.72} ${poleRight} ${cy+(cy-poleY)}`,fill:'none',stroke:'#5ac9b5','stroke-width':1,opacity:opacity*.55});}
 }
 if(first){
  for(const c of chromosomes){
   const pair=Math.floor(c.id/2),side=firstDivisionGroups[0].includes(c.id)?-1:1;
   const initialX=cx+(c.id%2===0?-1:1)*78,initialY=cy+(pair===0?-1:1)*70;
   const x=pro?lerp(initialX,cx+side*22,ease(p)):cx+side*lerp(22,poleDist*.72,ap);
   const y=pro?lerp(initialY,cy+(pair===0?-1:1)*52,ease(p)):cy+(pair===0?-1:1)*52;
   if(spindle&&(!pro||p>.65))fibers+=fiber(side<0?poleLeft:poleRight,cy,x,y,opacity);
   if(telo&&p>.65)objects+=chromatin(c,x,y,.7,true,exchange);
   else objects+=chromosome(c,x,y,true,sc,exchange);
  }
  if((meta||(pro&&p>.7))&&crossover){
   const y=cy-52+25;
   objects+=el('path',{'data-structure':'chiasma',d:`M ${cx-11} ${y-8} L ${cx+11} ${y+8} M ${cx+11} ${y-8} L ${cx-11} ${y+8}`,stroke:'#b57ac8','stroke-width':2,fill:'none'});
   if(labels)objects+=label(cx+90,cy-4,cx, y,'키아스마 · 교차 지점');
  }
  if(pro&&p>.45&&p<.9&&crossover)objects+=text(cx,cy-113,'상동 염색체 접합',{'text-anchor':'middle','font-size':12});
 }else{
  ids.forEach((id,i)=>{
   const c=chromosomes[id],y=cy+(i-(ids.length-1)/2)*(second?100:83);
   const initX=cx+(i%2===0?-45:45)*sc;
   const centerX=pro?lerp(initX,cx,ease(p)):cx;
   if(ana||telo){
    for(const s of [0,1]){const x=cx+(s===0?-1:1)*lerp(0,poleDist*.72,ap);
     if(spindle)fibers+=fiber(s===0?poleLeft:poleRight,cy,x,y,opacity);
     objects+=telo&&p>.65?chromatin(c,x,y,second?.55:.7,false,exchange,s):chromosome(c,x,y,false,sc,exchange,0,s);
    }
   }else{
    if(spindle&&(!pro||p>.45))fibers+=fiber(poleLeft,poleY,centerX-3,y,opacity)+fiber(poleRight,cy+(cy-poleY),centerX+3,y,opacity);
    objects+=chromosome(c,centerX,y,true,sc,exchange);
   }
  });
 }
 out+=fibers;
 if(telo){for(const side of [-1,1])out+=nucleus(cx+side*poleDist*.72,cy,rx*.32,ry*.67,clamp(p*1.6));}
 out+=objects;
 if(!second){
  if(meta)out+=label(cx+75,cy-ry+5,cx,cy-ry*.8,'적도면');
  if(spindle&&!pro&&!telo)out+=label(cx-rx+18,cy-ry+8,cx-rx*.48,cy-55,'방추사');
  if(pro)out+=label(cx-rx+12,cy+ry-5,cx-60,cy+60,'염색체 · 자매 염색분체 2개');
  if(telo)out+=label(cx+40,cy+ry+15,cx+rx*.36,cy+ry*.52,'새로운 핵막');
 }
 if(second)out+=text(cx,465,`감수 II · 세포 ${groupIndex+1}`,{'text-anchor':'middle',class:'svg-cell-label'});
 return out;
}
function daughter(cx,cy,rx,ry,ids,duplicated,p,sister=0){
 let out=membrane(cx,cy,rx,ry)+nucleus(cx,cy,rx*.68,ry*.71);
 ids.forEach((id,i)=>{
  const c=chromosomes[id];
  const x=ids.length===4?cx+(i%2===0?-1:1)*rx*.29:cx;
  const y=ids.length===4?cy+(i<2?-1:1)*ry*.3:cy+(i===0?-1:1)*ry*.31;
  const exchange=mode==='meiosis'&&crossover;
  if(duplicated)out+=chromosome(c,x,y,true,.72,exchange);
  else out+=chromatin(c,x,y,ids.length===4?.7:.6,false,exchange,sister);
 });
 return out;
}
function cytokinesis(id,p){
 const second=id==='cyto2',first=id==='cyto1';
 let out='';
 if(second){
  for(let g=0;g<2;g++)for(let s=0;s<2;s++){
   const mid=g===0?250:710;
   const cx=mid+(s===0?-1:1)*lerp(88,110,ease(p));
   out+=daughter(cx,245,lerp(87,96,p),135,firstDivisionGroups[g],false,p,s);
   out+=text(cx,426,`n = 2 · 1C`,{'text-anchor':'middle',class:'svg-cell-label'});
  }
 }else{
  for(let g=0;g<2;g++){
   const cx=480+(g===0?-1:1)*lerp(169,222,ease(p));
   const ids=first?firstDivisionGroups[g]:[0,1,2,3];
   out+=daughter(cx,245,lerp(164,180,p),166,ids,first,p);
   out+=text(cx,460,first?'n = 2 · 2C':'2n = 4 · 2C',{'text-anchor':'middle',class:'svg-cell-label'});
  }
 }
 out+=text(480,40,second?'반수체 딸세포 4개':first?'반수체 딸세포 2개':'유전적으로 같은 딸세포 2개',{'text-anchor':'middle',class:'svg-cell-label'});
 return out;
}
function render(){
 const {stage,p,second}=sceneState(mode,index,progress);
 let content='';
 if(stage.id==='inter')content=interphase(p);
 else if(stage.id.startsWith('cyto'))content=cytokinesis(stage.id,p);
 else if(second)firstDivisionGroups.forEach((ids,g)=>{content+=activeCell(g===0?250:710,245,200,176,ids,stage.id,p,true,g);});
 else content=activeCell(480,245,335,188,[0,1,2,3],stage.id,p);
 svg.innerHTML=`<title id="scene-title">${mode==='mitosis'?'체세포분열':'감수분열'} · ${stage.name}</title><desc id="scene-description">${stage.chromosome} ${stage.spindle}</desc><defs><radialGradient id="cell-fill"><stop offset="0" stop-color="#f5ffff" stop-opacity=".85"/><stop offset="1" stop-color="#c7f4ee" stop-opacity=".7"/></radialGradient></defs>${content}`;
 $('#progress').value=Math.round(p*100);$('#progress-label').textContent=`${Math.round(p*100)}%`;
}
function updateInfo(){
 const list=stages[mode],stage=list[index];
 $('#phase-title').innerHTML=`${stage.name} <span>${stage.english}</span>`;
 $('#phase-description').textContent=stage.description;
 $('#chromosome-info').textContent=stage.chromosome;
 $('#spindle-info').textContent=stage.spindle;
 $('#takeaway-text').textContent=stage.takeaway;
 $('#stage-counter').textContent=`${String(index+1).padStart(2,'0')} / ${String(list.length).padStart(2,'0')}`;
 $('#stage-kicker').textContent=`PHASE ${String(index+1).padStart(2,'0')}`;
 $('#division-badge').textContent=mode==='mitosis'?'체세포분열':/2$/.test(stage.id)?'감수 II':'감수 I';
 $('#stats').innerHTML=`<div class="stat"><small>염색체 수</small><strong>${stage.count}</strong></div><div class="stat"><small>DNA량</small><strong>${stage.dna}</strong></div>`;
 $('#prev').disabled=index===0;$('#next').disabled=index===list.length-1;
 document.querySelectorAll('.phase-button').forEach((button,i)=>{if(i===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
 render();
}
function setStage(value){index=Math.max(0,Math.min(stages[mode].length-1,value));progress=0;updateInfo();}
function updatePlay(){ $('#play-icon').textContent=playing?'Ⅱ':'▶';$('#play-text').textContent=playing?'일시정지':'재생';$('#play').setAttribute('aria-label',playing?'시뮬레이션 일시정지':'시뮬레이션 재생');}
function pause(){playing=false;updatePlay();}
function setMode(value){
 mode=value;index=0;progress=0;pause();
 document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.mode===mode)));
 $('#workspace').setAttribute('aria-labelledby',`${mode}-tab`);
 $('#mode-summary').textContent=mode==='mitosis'?'한 번의 분열 · 유전적으로 같은 딸세포 2개':'두 번의 분열 · 유전적으로 다양한 딸세포 4개';
 $('#crossover-option').hidden=mode!=='meiosis';
 $('#timeline').innerHTML=stages[mode].map((stage,i)=>`<button class="phase-button" data-stage="${i}" aria-label="${stage.name} 관찰"><span class="phase-number">${String(i+1).padStart(2,'0')}</span><b>${stage.name}</b><small>${stage.english}</small></button>`).join('');
 updateInfo();
}
$('#timeline').addEventListener('click',event=>{const button=event.target.closest('[data-stage]');if(button){pause();setStage(Number(button.dataset.stage));}});
const tabs=[...document.querySelectorAll('[data-mode]')];
tabs.forEach(button=>{button.addEventListener('click',()=>setMode(button.dataset.mode));button.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs[1]:tabs.find(tab=>tab!==button);next.focus();setMode(next.dataset.mode);}});});
$('#play').addEventListener('click',()=>{if(!playing&&index===stages[mode].length-1&&progress>=1)setStage(0);playing=!playing;lastTime=performance.now();updatePlay();});
$('#prev').addEventListener('click',()=>{pause();setStage(index-1);});
$('#next').addEventListener('click',()=>{pause();setStage(index+1);});
$('#reset').addEventListener('click',()=>{pause();setStage(0);});
$('#speed').addEventListener('change',event=>{speed=Number(event.target.value);});
$('#progress').addEventListener('input',event=>{pause();progress=Number(event.target.value)/100;render();});
$('#show-spindle').addEventListener('change',event=>{spindle=event.target.checked;render();});
$('#show-labels').addEventListener('change',event=>{labels=event.target.checked;render();});
$('#show-crossover').addEventListener('change',event=>{crossover=event.target.checked;render();});
document.addEventListener('visibilitychange',()=>{lastTime=performance.now();});
function tick(now){
 const elapsed=Math.min((now-lastTime)/1000,.1);lastTime=now;
 if(playing&&!document.hidden){
  progress+=elapsed*speed/7;
  if(progress>=1){if(index===stages[mode].length-1){progress=1;pause();}else{setStage(index+1);}}
  // User-initiated playback remains available with reduced motion, in discrete steps.
  if(!reducedMotion||Math.floor(progress*100)%10===0||!playing)render();
 }
 requestAnimationFrame(tick);
}
setMode('mitosis');requestAnimationFrame(tick);
