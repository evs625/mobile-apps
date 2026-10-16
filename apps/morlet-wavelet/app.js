import {envelope,complexWavelet} from "./geometry.js";

(()=>{
"use strict";
const canvas=document.getElementById('view'),ctx=canvas.getContext('2d',{alpha:false});
const $=id=>document.getElementById(id);
const scene={az:-0.92,el:0.49,zoom:1,playing:true,cycle:5.5,sigma:1.35,phase:0,alpha:.27,projections:true,envelopes:true,grid:true};
let W=1000,H=750, DPR=1,last=0,dirty=true;
const limits={xmin:-4.2,xmax:4.2,ymin:-1.72,ymax:1.72,zmin:-1.72,zmax:1.72};
function resize(){
 const box=canvas.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);
 W=Math.max(250,Math.round(box.width));H=Math.max(300,Math.round(box.height));DPR=d;
 canvas.width=Math.round(W*d);canvas.height=Math.round(H*d);
 ctx.setTransform(d,0,0,d,0,0); dirty=true;
}
if('ResizeObserver' in window)new ResizeObserver(resize).observe(canvas);
else window.addEventListener('resize',resize);
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
const A=t=>envelope(t,scene.sigma);
const f=t=>complexWavelet(t,scene);
function vec(x,y,z){return [x,y,z]}
function linear(a,b,k){return a+(b-a)*k}
let basis,scale,cx,cy;
function prepare(){
 const a=scene.az,e=scene.el,sa=Math.sin(a),ca=Math.cos(a),se=Math.sin(e),ce=Math.cos(e);
 basis={right:[-sa,ca,0],up:[-se*ca,-se*sa,ce],depth:[ce*ca,ce*sa,se]};
 scale=Math.min(W/12.4,H/10.3)*scene.zoom;
 cx=W*.5;cy=H*.545;
}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function project(p){
 const q=[p[0],p[1],p[2]];
 return [cx+scale*dot(q,basis.right),cy-scale*dot(q,basis.up),dot(q,basis.depth)];
}
function line3(points,color,width=1,alpha=1){
 if(points.length<2)return;ctx.beginPath();
 let c=project(points[0]);ctx.moveTo(c[0],c[1]);
 for(let i=1;i<points.length;i++){c=project(points[i]);ctx.lineTo(c[0],c[1])}
 ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();ctx.globalAlpha=1;
}
function tick(p1,p2,w=1.35){line3([p1,p2],'#17161d',w);}
function grids(){
 if(!scene.grid)return;
 const x=limits.xmin,X=limits.xmax,y=limits.ymin,Y=limits.ymax,z=limits.zmin,Z=limits.zmax;
 let all=[];
 // Floor z=zmin, back wall y=ymax, and end wall x=xmin.
 for(let k=0;k<=8;k++){
   const xx=linear(x,X,k/8);
   all.push([vec(xx,y,z),vec(xx,Y,z)]);
   all.push([vec(xx,Y,z),vec(xx,Y,Z)]);
 }
 for(let k=0;k<=6;k++){
   const yy=linear(y,Y,k/6), zz=linear(z,Z,k/6);
   all.push([vec(x,yy,z),vec(X,yy,z)]);
   all.push([vec(x,Y,zz),vec(X,Y,zz)]);
   all.push([vec(x,yy,z),vec(x,yy,Z)]);
 }
 for(let k=0;k<=7;k++){
   const zz=linear(z,Z,k/7);all.push([vec(x,y,zz),vec(x,Y,zz)]);
 }
 for(const q of all) line3(q,'#e5e5e6',1.35,.91);
 // Matte vertical edges and bottom edges emulate the source Matplotlib 3D cube.
 line3([vec(x,y,z),vec(X,y,z)],'#24242b',2.15);
 line3([vec(x,y,z),vec(x,Y,z)],'#292930',2.15);
 line3([vec(X,y,z),vec(X,Y,z)],'#222229',2.05);
 line3([vec(X,Y,z),vec(X,Y,Z)],'#27272e',2.25);
 line3([vec(x,y,z),vec(x,y,Z)],'#dedee0',1.3);
 for(let k=0;k<=8;k++){
   const xx=linear(x,X,k/8);
   tick(vec(xx,y,z),vec(xx,y,z-.09),1.4);
 }
 for(let k=0;k<=6;k++){
   const yy=linear(y,Y,k/6), zz=linear(z,Z,k/6);
   tick(vec(X,yy,z),vec(X,yy,z-.08),1.3);
   tick(vec(X,Y,zz),vec(X+.075,Y,zz),1.2);
 }
}
function projectionCurve(kind){
 const steps=380,arr=[],upper=[],lower=[];
 for(let i=0;i<=steps;i++){
   const t=linear(limits.xmin,limits.xmax,i/steps),v=f(t),a=A(t);
   if(kind==='floor'){
      arr.push(vec(t,v[0],limits.zmin+.012));
      upper.push(vec(t,a,limits.zmin+.016));lower.push(vec(t,-a,limits.zmin+.016));
   }else{
      arr.push(vec(t,limits.ymax-.012,v[1]));
      upper.push(vec(t,limits.ymax-.014,a));lower.push(vec(t,limits.ymax-.014,-a));
   }
 }
 if(scene.envelopes){line3(upper,'#ef9ca8',1.8,.25);line3(lower,'#ef9ca8',1.8,.25)}
 line3(arr,'#aba1e3',3.1,.77);
}
function endProjection(){
 const points=[];const steps=420;
 for(let i=0;i<=steps;i++){
   const t=linear(limits.xmin,limits.xmax,i/steps),a=f(t);
   points.push(vec(limits.xmin+.025,a[0],a[1]));
 }
 line3(points,'#aea4e4',3,.75);
}
function membrane(){
 // Render a transparent helicoidal sheet extending radially from the
 // real-time axis to the complex wavelet, not a CWT height field.
 const segs=160,rings=10,cells=[],tmin=limits.xmin,tmax=limits.xmax;
 for(let i=0;i<segs;i++){
  const t=linear(tmin,tmax,i/segs),t2=linear(tmin,tmax,(i+1)/segs),a=f(t),b=f(t2);
  for(let j=0;j<rings;j++){
   const r=j/rings,s=(j+1)/rings;
   const v=[vec(t,a[0]*r,a[1]*r),vec(t2,b[0]*r,b[1]*r),vec(t2,b[0]*s,b[1]*s),vec(t,a[0]*s,a[1]*s)];
   const z=v.reduce((sum,p)=>sum+dot(p,basis.depth),0)/4;
   cells.push({v,z});
  }
 }
 // Farthest faces first; transparent mesh remains recognizable from all angles.
 cells.sort((a,b)=>a.z-b.z);
 for(const {v} of cells){
  ctx.beginPath();let p=project(v[0]);ctx.moveTo(p[0],p[1]);
  for(let j=1;j<4;j++){p=project(v[j]);ctx.lineTo(p[0],p[1]);}
  ctx.closePath();ctx.fillStyle='rgb(132,123,203)';ctx.globalAlpha=scene.alpha*.65;ctx.fill();
 }
 ctx.globalAlpha=1;
 // Radial spokes appear as thin, distinct fan lines in the reference frames.
 for(let i=0;i<=56;i++){
  const t=linear(tmin,tmax,i/56),q=f(t);
  line3([vec(t,0,0),vec(t,q[0],q[1])],'#6f68aa',.85,.39);
 }
 const spiral=[];
 for(let i=0;i<=480;i++){const t=linear(tmin,tmax,i/480),q=f(t);spiral.push(vec(t,q[0],q[1]));}
 line3(spiral,'#8981cc',2.35,.79);
}
function axisAndEnvelope(){
 const e=[],ax=[];
 for(let i=0;i<=400;i++){
  const t=linear(limits.xmin,limits.xmax,i/400); ax.push(vec(t,0,0));e.push(vec(t,0,A(t)));
 }
 if(scene.envelopes)line3(e,'#e8788b',1.9,.95);
 line3(ax,'#19171c',3.15,1);
}
function render(){
 if(!W||!H)return;ctx.save();ctx.fillStyle='#fff';ctx.globalAlpha=1;ctx.fillRect(0,0,W,H);
 prepare();grids();
 if(scene.projections){projectionCurve('floor');projectionCurve('wall');endProjection()}
 membrane();axisAndEnvelope();
 ctx.restore();dirty=false;
}
function loop(t){
 if(scene.playing && last){scene.az += (t-last)*Math.PI*2/(12000);dirty=true}
 last=t;if(dirty)render();requestAnimationFrame(loop);
}
const pointers=new Map();
let gesture=null;
function startGesture(){
 const pts=[...pointers.values()];
 if(pts.length>=2){
   gesture={type:'pinch',distance:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),zoom:scene.zoom};
 }else if(pts.length===1){
   gesture={type:'drag',x:pts[0].x,y:pts[0].y,az:scene.az,el:scene.el};
 }else gesture=null;
}
function pauseOnInteraction(){
 scene.playing=false;$('toggle').textContent='Play rotation';$('toggle').classList.remove('active');dirty=true;
}
canvas.addEventListener('pointerdown',ev=>{
 pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
 canvas.setPointerCapture(ev.pointerId);startGesture();pauseOnInteraction();
});
canvas.addEventListener('pointermove',ev=>{
 if(!pointers.has(ev.pointerId))return;
 pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
 const pts=[...pointers.values()];
 if(pts.length>=2 && gesture?.type==='pinch'){
   const distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
   scene.zoom=clamp(gesture.zoom*distance/Math.max(gesture.distance,1),.55,2.4);
 }else if(pts.length===1 && gesture?.type==='drag'){
   scene.az=gesture.az-(pts[0].x-gesture.x)*.008;
   scene.el=clamp(gesture.el+(pts[0].y-gesture.y)*.006,-1.35,1.35);
 }
 dirty=true;
});
for(const evtype of ['pointerup','pointercancel']) canvas.addEventListener(evtype,ev=>{
 pointers.delete(ev.pointerId);startGesture();
});
canvas.addEventListener('wheel',ev=>{ev.preventDefault();scene.zoom=clamp(scene.zoom*Math.exp(-ev.deltaY*.001),.55,2.4);dirty=true;},{passive:false});
$('toggle').onclick=()=>{scene.playing=!scene.playing;$('toggle').textContent=scene.playing?'Pause rotation':'Play rotation';$('toggle').classList.toggle('active',scene.playing)};
$('reset').onclick=()=>{scene.az=-.92;scene.el=.49;scene.zoom=1;dirty=true};
$('export').onclick=()=>{render();const a=document.createElement('a');a.download='Morlet_Wavelet_3D.png';a.href=canvas.toDataURL('image/png');a.click();};
for(const [id,prop,out,fmt] of [['cycles','cycle','cyclesText',v=>v.toFixed(2)],['sigma','sigma','sigmaText',v=>v.toFixed(2)],['phase','phase','phaseText',v=>`${Math.round(v*180/Math.PI)}°`],['opacity','alpha','opacityText',v=>`${Math.round(v*100)}%`]]){
 $(id).addEventListener('input',ev=>{let v=+ev.target.value;if(id==='phase')v=v*Math.PI/180;if(id==='opacity')v=v/100;scene[prop]=v;$(out).textContent=fmt(v);dirty=true;});
}
for(const id of ['projections','envelopes','grid'])$(id).addEventListener('change',ev=>{scene[id]=ev.target.checked;dirty=true;});
canvas.tabIndex=0;
canvas.addEventListener('keydown',ev=>{
 const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-',' '];
 if(!keys.includes(ev.key))return;
 ev.preventDefault();
 if(ev.key==='ArrowLeft')scene.az+=.1;
 if(ev.key==='ArrowRight')scene.az-=.1;
 if(ev.key==='ArrowUp')scene.el=clamp(scene.el+.1,-1.35,1.35);
 if(ev.key==='ArrowDown')scene.el=clamp(scene.el-.1,-1.35,1.35);
 if(ev.key==='+'||ev.key==='=')scene.zoom=clamp(scene.zoom*1.13,.55,2.4);
 if(ev.key==='-')scene.zoom=clamp(scene.zoom/1.13,.55,2.4);
 if(ev.key===' ')$('toggle').click();
 if(ev.key.startsWith('Arrow'))pauseOnInteraction();
 dirty=true;
});
resize();requestAnimationFrame(loop);
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
 window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(console.warn));
}
})();
