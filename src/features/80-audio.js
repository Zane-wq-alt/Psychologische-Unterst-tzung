"use strict";
/* ---------- звуки, музыка, анимации ---------- */
var SCH=[["rain","Дождь","n"],["thunder","Гроза вдали","n"],["ocean","Океан","n"],["wind","Ветер","n"],["fire","Камин","n"],["stream","Ручей","n"],["birds","Птицы","n"],["crickets","Сверчки","n"],["brown","Глубокий шум","s"],["pink","Мягкий шум","s"],["white","Белый шум","s"],["drone","Низкий гул","s"],["pad","Мягкий пад","m"],["piano","Пианино","m"],["bells","Колокольчики","m"],["box","Шкатулка","m"]];
var SC={rain:1.1,thunder:.8,ocean:.8,wind:1.2,fire:.8,stream:1.4,birds:.5,crickets:.16,brown:.8,pink:.5,white:.5,drone:.3,pad:.25,piano:.42,bells:.45,box:.4};
var PRE=[["goodnight","Сон",{brown:40,pad:35,drone:15}],["quiet","Дождь",{rain:60,thunder:25,brown:20}],["videos","Океан",{ocean:65,wind:15,birds:10}],["home","Камин",{fire:60,brown:25,box:15}],["study","Фокус",{pink:35,piano:30,pad:15}],["goodmorning","Лес",{stream:45,birds:50,wind:15}],["snug","Ночь",{crickets:50,wind:20,pad:30,bells:12}],["daydream","Мечты",{pad:40,piano:25,bells:25,box:15}]];
var MOODS=[["Светлая",[0,2,4,5,7,9,11],[0,4,5,3]],["Мягкая грусть",[0,2,3,5,7,8,10],[0,5,2,6]],["Космос",[0,2,4,6,7,9,11],[0,1,0,4]],["Тёплая",[0,2,3,5,7,9,10],[0,3,0,6]]];
var AU={ctx:null,master:null,fx:null,rev:null,comp:null,bufs:{},L:{},on:false,tt:0,tm:0,step:0,next:0,t:0,an:null},HARM={root:48,mood:0,ch:[48,52,55,59],pi:0,t0:0};
function lvl(k){return(S.ui.snd.mix[k]||0)}
function mtof(m){return 440*Math.pow(2,(m-69)/12)}
function rnd(a,b){return a+Math.random()*(b-a)}
function mkNoise(c,type){var n=c.sampleRate*4,L=2048,a=new Float32Array(n+L),b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0),i,l=0,lw=0,b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
 for(i=0;i<n+L;i++){var w=Math.random()*2-1;if(type=="white"){lw=lw*.62+w*.38;a[i]=lw*.9}else if(type=="pink2"){a[i]=w*.2}else if(type=="pink"){b0=.99886*b0+w*.0555179;b1=.99332*b1+w*.0750759;b2=.969*b2+w*.153852;b3=.8665*b3+w*.3104856;b4=.55*b4+w*.5329522;b5=-.7616*b5-w*.016898;a[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11;b6=w*.115926}else{l=(l+.02*w)/1.02;a[i]=l*3.5}}
 for(i=0;i<n;i++)d[i]=i<L?a[i]*(i/L)+a[n+i]*(1-i/L):a[i];return b}
function auInit(){if(AU.ctx){if(AU.ctx.state=="suspended")AU.ctx.resume();return true}
 try{var C=window.__AC||window.AudioContext||window.webkitAudioContext;if(!C)return false;var c=AU.ctx=new C();
  AU.comp=c.createDynamicsCompressor();AU.comp.threshold.value=-22;AU.comp.knee.value=24;AU.comp.ratio.value=3;AU.comp.attack.value=.01;AU.comp.release.value=.3;
  var out=c.createGain();out.gain.value=.9;AU.comp.connect(out);out.connect(c.destination);AU.an=c.createAnalyser();AU.an.fftSize=2048;out.connect(AU.an);
  AU.sh=c.createBiquadFilter();AU.sh.type="highshelf";AU.sh.frequency.value=2600;AU.sh.gain.value=-6;AU.tone=c.createBiquadFilter();AU.tone.type="lowpass";AU.tone.frequency.value=5200;AU.tone.Q.value=.5;AU.sh.connect(AU.tone);AU.tone.connect(AU.comp);AU.master=c.createGain();AU.master.gain.value=0;AU.master.connect(AU.sh);AU.fx=c.createGain();AU.fx.gain.value=.9;AU.fx.connect(AU.sh);
  var len=Math.round(c.sampleRate*2.8),ib=c.createBuffer(2,len,c.sampleRate);for(var k=0;k<2;k++){var d=ib.getChannelData(k),p=0,p2=0;for(var i=0;i<len;i++){var w=(Math.random()*2-1)*Math.pow(1-i/len,3);p=p*.72+w*.28;p2=p2*.72+p*.28;d[i]=p2*2}}
  AU.rev=c.createConvolver();AU.rev.buffer=ib;var rg=c.createGain();rg.gain.value=.55;AU.rev.connect(rg);rg.connect(AU.sh);AU.revIn=c.createGain();AU.revIn.connect(AU.rev);
  ["white","pink","brown"].forEach(function(t){AU.bufs[t]=mkNoise(c,t)});if(c.state=="suspended")c.resume();return true}catch(e){AU.ctx=null;return false}}
/* голоса */
function nsrc(t,off){var s=AU.ctx.createBufferSource();s.buffer=AU.bufs[t];s.loop=true;s.start(0,off==null?Math.random()*3:off);return s}
function pan(v){var c=AU.ctx;if(!c.createStereoPanner)return null;var p=c.createStereoPanner();p.pan.value=v;return p}
function sendTo(n,dst,rs,pv){var c=AU.ctx,last=n;if(pv!=null){var p=pan(pv);if(p){last.connect(p);last=p}}last.connect(dst);if(rs>0){var g=c.createGain();g.gain.value=rs;last.connect(g);g.connect(AU.revIn)}}
/* универсальный голос: o={f,t,dur,a,vol,type,lp,rs,dst,r2,v2,pv,glide} */
function vox(o){var c=AU.ctx,t=o.t||c.currentTime,e=c.createGain(),os=[],n=o.dur+.15,a=o.a||.01;
 e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(o.vol,t+a);e.gain.setTargetAtTime(0,t+a+(o.hold||0),(o.dur-a)/4.5);
 var o1=c.createOscillator();o1.type=o.type||"sine";o1.frequency.setValueAtTime(o.f,t);if(o.glide)o1.frequency.exponentialRampToValueAtTime(o.glide,t+o.dur);if(o.det)o1.detune.value=o.det;os.push(o1);
 var m=c.createGain();m.gain.value=1;o1.connect(m);
 if(o.r2){var o2=c.createOscillator(),g2=c.createGain();o2.frequency.setValueAtTime(o.f*o.r2,t);g2.gain.setValueAtTime(o.v2,t);g2.gain.exponentialRampToValueAtTime(.0001,t+o.dur*.35);o2.connect(g2);g2.connect(m);os.push(o2)}
 var x=m;if(o.lp){var f=c.createBiquadFilter();f.type="lowpass";f.frequency.value=o.lp;m.connect(f);x=f}x.connect(e);
 sendTo(e,o.dst||AU.fx,o.rs==null?.3:o.rs,o.pv);os.forEach(function(q){q.start(t);q.stop(t+n)});o1.onended=function(){try{e.disconnect()}catch(z){}};return e}
function bell(f,dur,vol,pv){if(!auInit())return;vox({f:f,dur:dur||2.2,vol:vol||.07,a:.004,r2:2.76,v2:.35,rs:.5,pv:pv==null?rnd(-.3,.3):pv})}
function pluck(f,dur,vol,dst,pv){vox({f:f,dur:dur,vol:vol,a:.008,type:"triangle",r2:2,v2:.3,lp:2600,rs:.35,dst:dst,pv:pv})}
function lfo(L,f,depth,param,type){var c=AU.ctx,o=c.createOscillator(),g=c.createGain();o.type=type||"sine";o.frequency.value=f;g.gain.value=depth;o.connect(g);g.connect(param);o.start();L.src.push(o);return o}
/* гармония */
function chordAt(deg,sc,root){var r=[];for(var i=0;i<4;i++){var d=deg+i*2,o=Math.floor(d/7);r.push(root+sc[d%7]+12*o)}return r}
function setChord(){var m=MOODS[HARM.mood],pr=m[2];HARM.ch=chordAt(pr[HARM.pi%4],m[1],HARM.root);HARM.pi++}
function scaleNotes(){var m=MOODS[HARM.mood][1],r=HARM.root+12,a=[];[0,1,2,4,5].forEach(function(d){a.push(r+m[d])});[0,1,2,4,5].forEach(function(d){a.push(r+12+m[d])});return a}
/* слои: каждый возвращает {in,src[],ev?(t),rate} */
function mkL(k){var c=AU.ctx,g=c.createGain();g.gain.value=0;g.connect(AU.master);var rv=c.createGain();rv.gain.value=0;g.connect(rv);rv.connect(AU.revIn);var L={k:k,g:g,src:[],rv:rv,next:0,ev:null},f,s,q,n;
 function bed(t,fq,type,Q){var s=nsrc(t),f=c.createBiquadFilter();f.type=type;f.frequency.value=fq;if(Q)f.Q.value=Q;s.connect(f);L.src.push(s);return f}
 if(k=="brown"){f=bed("brown",500,"lowpass");lfo(L,.04,150,f.frequency);f.connect(g)}
 else if(k=="pink"){f=bed("pink",2300,"lowpass");lfo(L,.05,600,f.frequency);f.connect(g)}
 else if(k=="white"){f=bed("white",1900,"lowpass");f.connect(g)}
 else if(k=="drone"){f=c.createBiquadFilter();f.type="lowpass";f.frequency.value=380;lfo(L,.03,90,f.frequency);f.connect(g);[[55,.5],[82.4,.3],[110.3,.18],[164.9,.06]].forEach(function(p,i){var o=c.createOscillator(),e=c.createGain();o.frequency.value=p[0];o.detune.value=i*3;e.gain.value=p[1];o.connect(e);e.connect(f);o.start();L.src.push(o);lfo(L,.02+i*.011,.08,e.gain)});rv.gain.value=.3}
 else if(k=="rain"){f=bed("pink",2600,"lowpass");var h=c.createBiquadFilter();h.type="highpass";h.frequency.value=450;f.connect(h);var hg=c.createGain();hg.gain.value=.7;h.connect(hg);hg.connect(g);lfo(L,.07,.18,hg.gain);var lo=bed("brown",260,"lowpass"),lg=c.createGain();lg.gain.value=.5;lo.connect(lg);lg.connect(g);L.rate=7;L.ev=function(t){var o=c.createOscillator(),e=c.createGain(),f0=rnd(700,2000);o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f0*.6,t+.04);e.gain.setValueAtTime(rnd(.012,.04),t);e.gain.exponentialRampToValueAtTime(.0001,t+.04);o.connect(e);var p=pan(rnd(-.8,.8));if(p){e.connect(p);p.connect(g)}else e.connect(g);o.start(t);o.stop(t+.06)}}
 else if(k=="thunder"){L.rate=.035;rv.gain.value=.25;L.ev=function(t){var s=nsrc("brown"),f=c.createBiquadFilter(),e=c.createGain(),d=rnd(5,9);f.type="lowpass";f.frequency.setValueAtTime(rnd(120,200),t);f.frequency.exponentialRampToValueAtTime(50,t+d);e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(rnd(.5,1),t+rnd(.6,1.6));e.gain.setTargetAtTime(0,t+1.8,d/4);s.connect(f);f.connect(e);e.connect(g);s.stop(t+d+2);s.onended=function(){try{e.disconnect()}catch(z){}}}}
 else if(k=="ocean"){rv.gain.value=.15;[[.083,.5],[.057,.7]].forEach(function(p,i){var f=bed("brown",i?420:700,"lowpass"),e=c.createGain();e.gain.value=.5;f.connect(e);e.connect(g);lfo(L,p[0]*rnd(.9,1.1),.4,e.gain);lfo(L,p[0]*rnd(.9,1.1),300,f.frequency)});var fo=bed("pink",800,"bandpass",.6),fe=c.createGain();fe.gain.value=.16;fo.connect(fe);fe.connect(g);lfo(L,.083,.18,fe.gain)}
 else if(k=="wind"){f=bed("pink",600,"bandpass",.9);var e=c.createGain();e.gain.value=.6;f.connect(e);e.connect(g);lfo(L,.05,350,f.frequency);lfo(L,.13,160,f.frequency);lfo(L,.07,.35,e.gain)}
 else if(k=="fire"){f=bed("brown",260,"lowpass");f.connect(g);rv.gain.value=.08;L.rate=7;L.ev=function(t){var s=nsrc("white"),h=c.createBiquadFilter(),e=c.createGain(),big=Math.random()<.12;h.type="bandpass";h.frequency.value=big?rnd(400,900):rnd(900,2600);h.Q.value=big?1.5:.9;e.gain.setValueAtTime(big?rnd(.35,.7):rnd(.06,.3),t);e.gain.exponentialRampToValueAtTime(.0001,t+(big?.07:.025));s.connect(h);h.connect(e);var p=pan(rnd(-.6,.6));if(p){e.connect(p);p.connect(g)}else e.connect(g);s.stop(t+.12);s.onended=function(){try{e.disconnect()}catch(z){}}}}
 else if(k=="stream"){f=bed("pink",1100,"bandpass",.7);var e=c.createGain();e.gain.value=.55;f.connect(e);e.connect(g);lfo(L,5.3,.2,e.gain);lfo(L,8.7,.15,e.gain);lfo(L,.2,500,f.frequency);var w=bed("white",2400,"lowpass"),we=c.createGain();we.gain.value=.08;w.connect(we);we.connect(g);L.rate=9;rv.gain.value=.1;L.ev=function(t){var o=c.createOscillator(),e=c.createGain(),f0=rnd(380,900);o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f0*1.9,t+.05);e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(rnd(.02,.06),t+.01);e.gain.exponentialRampToValueAtTime(.0001,t+.07);o.connect(e);var p=pan(rnd(-.7,.7));if(p){e.connect(p);p.connect(g)}else e.connect(g);o.start(t);o.stop(t+.09)}}
 else if(k=="birds"){L.rate=.3;rv.gain.value=.5;L.ev=function(t){var n=2+Math.floor(Math.random()*4),kind=Math.random()<.5,base=rnd(1700,3000),p=rnd(-.8,.8),tt=t;for(var i=0;i<n;i++){var f=kind?base*(1+i*.09):base*(i%2?1.18:1),d=kind?rnd(.09,.16):.05,o=c.createOscillator(),e=c.createGain(),pn=pan(p);o.frequency.setValueAtTime(f,tt);o.frequency.exponentialRampToValueAtTime(f*(kind?1.25:.9),tt+d);e.gain.setValueAtTime(0,tt);e.gain.linearRampToValueAtTime(.035,tt+.02);e.gain.exponentialRampToValueAtTime(.0001,tt+d);o.connect(e);if(pn){e.connect(pn);pn.connect(g)}else e.connect(g);o.start(tt);o.stop(tt+d+.02);tt+=d+(kind?.05:.035)}}}
 else if(k=="crickets"){rv.gain.value=.05;[[2900,29,.8],[3250,33,1.1]].forEach(function(p){var o=c.createOscillator(),a=c.createGain(),b=c.createGain();o.frequency.value=p[0];a.gain.value=.5;b.gain.value=.5;o.connect(a);a.connect(b);b.connect(g);o.start();L.src.push(o);lfo(L,p[1],.5,a.gain);lfo(L,p[2],.5,b.gain,"square")})}
 else if(k=="pad"){L.rate=0;rv.gain.value=.75;L.ev=null;L.onChord=function(t){HARM.ch.forEach(function(m,i){vox({f:mtof(m+(i<2?-12:0)),t:t,dur:HARM.len+3,a:3.2,vol:.1/(1+i*.15),type:"triangle",lp:900,rs:1,det:(i%2?5:-5),dst:g,pv:(i-1.5)*.4})})}}
 else if(k=="piano"){rv.gain.value=.6;var pat=[0,3,6,8,11,14],ix=0;L.onStep=function(s,t){var b=s%16,bar=Math.floor(s/16);if(bar%4==3&&b>7)return;var pi=pat.indexOf(b);if(pi<0||Math.random()>.88)return;var ch=HARM.ch,m=ch[(pi+(bar%2))%4]+12*(pi>3?1:0)+12;if(Math.random()<.2)m=scaleNotes()[Math.floor(Math.random()*6)];pluck(mtof(m),rnd(1.6,2.6),rnd(.05,.1),g,rnd(-.3,.3))}}
 else if(k=="bells"){rv.gain.value=.9;L.onStep=function(s,t){if(s%2||Math.random()>.2)return;var n=scaleNotes();vox({f:mtof(n[Math.floor(Math.random()*n.length)]+12),t:t,dur:rnd(3,4.5),vol:rnd(.04,.08),a:.005,r2:2.76,v2:.4,rs:1,dst:g,pv:rnd(-.7,.7)})}}
 else if(k=="box"){rv.gain.value=.5;var mot=[],mi=0;L.onChord=function(){var n=scaleNotes();mot=[];for(var i=0;i<6;i++)mot.push(n[Math.floor(Math.random()*n.length)]+12*(Math.random()<.4?1:0));mi=0};L.onStep=function(s,t){if(!mot.length||(s%16)%2||(s%32)>13&&Math.random()<.7)return;var m=mot[mi++%mot.length];vox({f:mtof(m+12),t:t,dur:.9,vol:rnd(.05,.08),a:.003,r2:3,v2:.15,rs:.7,dst:g,pv:rnd(-.2,.2)})}}
 return L}
/* планировщик */
function conduct(){var c=AU.ctx;if(!c||!AU.on)return;var now=c.currentTime,eig=60/52/2,k;
 while(AU.next<now+.6){var t=AU.next,s=AU.step;if(s%16==0){setChord();HARM.t0=t;for(k in AU.L){var L=AU.L[k];if(L.onChord&&!L.dead)L.onChord(t)}if(s%64==0&&s>0&&Math.random()<.5){HARM.root=48+[0,2,3,5,7,9][Math.floor(Math.random()*6)]}}
  for(k in AU.L){var Ly=AU.L[k];if(Ly.onStep&&!Ly.dead&&lvl(k)>0)Ly.onStep(s,t)}AU.next+=eig;AU.step++}
 for(k in AU.L){var Lx=AU.L[k];if(Lx.ev&&!Lx.dead&&lvl(k)>0){if(!Lx.next)Lx.next=now+rnd(0,1/Lx.rate);var cap=0;while(Lx.next<now+.6&&cap++<12){Lx.ev(Lx.next);Lx.next+=(-Math.log(1-Math.random()))/Lx.rate}}}}
function dispL(k){var L=AU.L[k];if(!L)return;L.dead=true;delete AU.L[k];var t=AU.ctx.currentTime;L.g.gain.cancelScheduledValues(t);L.g.gain.setTargetAtTime(0,t,.2);setTimeout(function(){L.src.forEach(function(s){try{s.stop()}catch(e){}});try{L.g.disconnect();L.rv.disconnect()}catch(e){}},1500)}
function aApply(){if(!AU.ctx)return;var t=AU.ctx.currentTime;SCH.forEach(function(q){var k=q[0],v=lvl(k);if(v>0&&!AU.L[k]&&AU.on){AU.L[k]=mkL(k);if(AU.L[k].onChord&&HARM.t0)AU.L[k].onChord(t+.05)}var L=AU.L[k];if(L){if(v>0)L.g.gain.setTargetAtTime(v/100*SC[k],t,.25);else if(!L.zt){L.zt=1;L.g.gain.setTargetAtTime(0,t,.25);setTimeout(function(){if(lvl(k)<=0&&AU.L[k]===L)dispL(k);else L.zt=0},1800)}if(v>0)L.zt=0}});
 if(AU.on)AU.master.gain.setTargetAtTime(Math.pow(S.ui.snd.vol/100,1.6)*1.1,t,.15)}
function updSbtn(){var b=$("sbtn");if(b)b.hidden=!AU.on}
function updPl(){var b=$("apb");if(b)b.textContent=AU.on?"⏸ Остановить":"▶ Включить";var e=$("aptm");if(e)e.textContent=AU.on&&S.ui.snd.tm?"Выключится через "+S.ui.snd.tm+" мин от запуска":""}
function syncMix(){SCH.forEach(function(q){var e=$("m_"+q[0]),l=$("mv_"+q[0]);if(e)e.value=lvl(q[0]);if(l)l.textContent=lvl(q[0])})}
function setTm(){clearTimeout(AU.tt);var m=S.ui.snd.tm;if(AU.on&&m)AU.tt=setTimeout(function(){astop(3)},m*60000)}
function fixMix(){var m=S.ui.snd.mix;if(m.music){m.pad=m.pad||m.music;m.piano=m.piano||Math.round(m.music*.6);delete m.music}}
function aplay(){if(!auInit()){toast("Звук недоступен в этом браузере");return}fixMix();if(!SCH.some(function(q){return lvl(q[0])>0}))applyPreset(0,true);
 var c=AU.ctx;AU.on=true;HARM.mood=(S.ui.snd.mood|0)%4;HARM.root=48+[0,2,3,5,7,9][Math.floor(Math.random()*6)];HARM.pi=0;AU.step=0;AU.next=c.currentTime+.1;HARM.len=60/52*8;HARM.t0=0;
 AU.master.gain.cancelScheduledValues(c.currentTime);AU.master.gain.setValueAtTime(AU.master.gain.value,c.currentTime);clearInterval(AU.iv);AU.iv=setInterval(conduct,120);aApply();conduct();setTm();updSbtn();updPl()}
function astop(f){if(!AU.ctx||!AU.on)return;AU.on=false;clearTimeout(AU.tt);clearInterval(AU.iv);var c=AU.ctx;AU.master.gain.cancelScheduledValues(c.currentTime);AU.master.gain.setTargetAtTime(0,c.currentTime,f||.4);updSbtn();updPl();
 setTimeout(function(){if(AU.on)return;Object.keys(AU.L).forEach(dispL);setTimeout(function(){if(!AU.on&&AU.ctx&&AU.ctx.state=="running"&&!BR.run&&!GM.run)AU.ctx.suspend()},1800)},(f||.4)*3500+200)}
function applyPreset(i,q){var p=PRE[i][2];S.ui.snd.mix={};Object.keys(p).forEach(function(k){S.ui.snd.mix[k]=p[k]});sv();aApply()}
function setMood(i){S.ui.snd.mood=i;HARM.mood=i;sv();document.querySelectorAll('[data-a="amood"]').forEach(function(x){x.classList.toggle("on",+x.dataset.v==i)})}
/* звуки интерфейса */
function tone(f,dur,vol,type,f2){if(!auInit())return;vox({f:f,dur:dur,vol:vol,a:.01,type:type||"sine",glide:f2,rs:.25})}
function sfx(k){if(!S.ui.sfx||S.ui.q)return;if(k=="ok"){bell(784,1.4,.05,-.1);setTimeout(function(){bell(1175,1.8,.045,.1)},130)}else if(k=="pop")vox({f:700,dur:.12,vol:.06,a:.002,glide:260,rs:.1});else bell(659,1.2,.035)}
function chime(){if(S.ui.q)return;if(!auInit())return;[0,.28,.56].forEach(function(d,i){setTimeout(function(){bell([523,659,784][i],2.5,.07)},d*1000)});if(navigator.vibrate)try{navigator.vibrate(200)}catch(e){}}
function beep(){chime()}
