"use strict";
/* ---------- дыхание ---------- */
var BPAT={"4-0-6":[4,0,6,0],"5-5":[5,0,5,0],"4-7-8":[4,7,8,0],"box":[4,4,4,4]},BR={run:false,raf:0,id:"",p:[4,0,6,0],t0:0,ph:-1,cy:0,v:null,end:0,lastS:-1};
function ez(p){return .5-.5*Math.cos(Math.PI*Math.min(1,Math.max(0,p)))}
function bParts(id){var w=$(id);return w?{w:w,c:w.querySelector(".bc"),h:w.querySelector(".bh"),t:w.querySelector(".brt")}:null}
function bCurve(n,fn){var a=new Float32Array(n);for(var i=0;i<n;i++)a[i]=fn(i/(n-1));return a}
function bVoice(){if(!auInit())return null;var c=AU.ctx,V={},out=c.createGain();out.gain.value=0;out.connect(AU.fx);var rg=c.createGain();rg.gain.value=.5;out.connect(rg);rg.connect(AU.revIn);
 V.out=out;V.tone=c.createGain();V.tone.gain.value=0;var lp=c.createBiquadFilter();lp.type="lowpass";lp.frequency.value=900;V.tone.connect(lp);lp.connect(out);V.os=[];
 [[1,1],[1.5,.32],[.5,.45],[2,.1]].forEach(function(p){var o=c.createOscillator(),g=c.createGain();o.frequency.value=196*p[0];g.gain.value=p[1];o.connect(g);g.connect(V.tone);o.start();V.os.push(o);if(p[0]==1)V.o1=o;if(p[0]==1.5)V.o2=o});
 var s=nsrc("pink");V.ns=s;V.bp=c.createBiquadFilter();V.bp.type="bandpass";V.bp.frequency.value=500;V.bp.Q.value=.55;V.ng=c.createGain();V.ng.gain.value=0;var l2=c.createBiquadFilter();l2.type="lowpass";l2.frequency.value=1600;s.connect(V.bp);V.bp.connect(V.ng);V.ng.connect(l2);l2.connect(out);
 V.vol=Math.max(.25,Math.pow(S.ui.snd.vol/100,.8));out.gain.setTargetAtTime(V.vol,c.currentTime,.3);V.end=c.currentTime;return V}
function bPhase(kind,dur){var V=BR.v;if(!V||!AU.ctx)return;var c=AU.ctx,t=Math.max(c.currentTime+.02,V.end),N=64,k=.05;V.end=t+dur;
 try{[V.tone.gain,V.ng.gain,V.o1.frequency,V.o2.frequency,V.bp.frequency].forEach(function(p){p.cancelScheduledValues(t)});
  if(kind==0||kind==2){var up=kind==0;
   V.tone.gain.setValueCurveAtTime(bCurve(N,function(p){var e=ez(p);return k*(up?.2+.8*e:1-.8*e)}),t,dur);
   V.ng.gain.setValueCurveAtTime(bCurve(N,function(p){return k*.9*Math.pow(Math.sin(Math.PI*p),1.5)}),t,dur);
   V.o1.frequency.setValueCurveAtTime(bCurve(N,function(p){var e=ez(p);return 196*(up?1+.22*e:1.22-.22*e)}),t,dur);
   V.o2.frequency.setValueCurveAtTime(bCurve(N,function(p){var e=ez(p);return 294*(up?1+.22*e:1.22-.22*e)}),t,dur);
   V.bp.frequency.setValueCurveAtTime(bCurve(N,function(p){var e=ez(p);return up?420+700*e:1120-700*e}),t,dur)}
  else{var hi=kind==1;V.tone.gain.setValueAtTime(k*(hi?1:.2),t);V.ng.gain.setValueAtTime(0,t)}}catch(e){}}
function bStopVoice(){var V=BR.v;BR.v=null;if(!V||!AU.ctx)return;var c=AU.ctx,t=c.currentTime;V.out.gain.cancelScheduledValues(t);V.out.gain.setTargetAtTime(0,t,.25);setTimeout(function(){V.os.forEach(function(o){try{o.stop()}catch(e){}});try{V.ns.stop()}catch(e){}try{V.out.disconnect()}catch(e){}},1500)}
function brFrame(now){BR.raf=0;if(!BR.run)return;var P=bParts(BR.id);if(!P||!P.c){stopB();return}var p=BR.p,cyc=p[0]+p[1]+p[2]+p[3],el=(now-BR.t0)/1000,cy=Math.floor(el/cyc),x=el-cy*cyc,kind,ph,dur,lvl,name,sec;
 if(x<p[0]){kind=0;ph=x/p[0];dur=p[0];lvl=ez(ph);name="Вдох";sec=p[0]-x}else if(x<p[0]+p[1]){kind=1;dur=p[1];ph=(x-p[0])/p[1];lvl=1;name="Пауза";sec=p[1]-(x-p[0])}else if(x<p[0]+p[1]+p[2]){kind=2;var y=x-p[0]-p[1];dur=p[2];ph=y/p[2];lvl=1-ez(ph);name="Выдох";sec=p[2]-y}else{kind=3;var y2=x-p[0]-p[1]-p[2];dur=p[3];ph=y2/p[3];lvl=0;name="Пауза";sec=p[3]-y2}
 var key=cy*4+kind;if(key!==BR.ph){BR.ph=key;BR.lastS=-1;if(S.ui.bsnd&&!S.ui.q&&BR.v)bPhase(kind,dur)}
 var lo=BR.small?.9:.8,hi=BR.small?1.3:1.5,s=lo+(hi-lo)*lvl;P.c.style.transform="scale("+s.toFixed(4)+")";if(P.h){P.h.style.transform="scale("+(s*1.16).toFixed(4)+")";P.h.style.opacity=(.12+.2*lvl).toFixed(3)}
 var sc=Math.ceil(sec-.001);if(sc!==BR.lastS){BR.lastS=sc;P.t.textContent=name+" "+Math.max(1,sc)}
 BR.raf=requestAnimationFrame(brFrame)}
function breathe(id,a,b,c,d){stopB();var P=bParts(id);if(!P)return;BR.id=id;BR.p=[a,b,c,d||0];BR.small=window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches;BR.ph=-1;BR.run=true;
 P.c.style.transition="none";if(P.h)P.h.style.transition="none";if(S.ui.bsnd&&!S.ui.q)BR.v=bVoice();BR.t0=performance.now();BR.raf=requestAnimationFrame(brFrame)}
function stopB(){var was=BR.run;BR.run=false;cancelAnimationFrame(BR.raf);BR.raf=0;bStopVoice();["br","br2"].forEach(function(i){var P=bParts(i);if(P&&P.c){P.t.textContent="Готов";P.c.style.transition="transform .6s ease-out";P.c.style.transform="scale(1)";if(P.h){P.h.style.transition="transform .6s ease-out,opacity .6s";P.h.style.transform="scale(1.1)";P.h.style.opacity=".12"}}})}
function bwHtml(id){return'<div class="bw" id="'+id+'"><i class="bh"></i><i class="bc"></i><b class="brt" aria-live="off">Готов</b></div>'}
