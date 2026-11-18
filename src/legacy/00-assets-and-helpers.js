
"use strict";
var KEY="opora_v2",tab="today",tmr,bt,tT;
/* Стикеры лежат отдельными файлами (assets/stickers) и входят в офлайн-кэш Service Worker. */
var STK={"whar":"assets/stickers/whar.webp","cool":"assets/stickers/cool.webp","smooch":"assets/stickers/smooch.webp","sometimes":"assets/stickers/sometimes.webp","a2a":"assets/stickers/a2a.webp","meds":"assets/stickers/meds.webp","lying":"assets/stickers/lying.webp","cooking":"assets/stickers/cooking.webp","overwhelmed":"assets/stickers/overwhelmed.webp","draw":"assets/stickers/draw.webp","reading":"assets/stickers/reading.webp","hungrysmol":"assets/stickers/hungrysmol.webp","quiet":"assets/stickers/quiet.webp","hungry":"assets/stickers/hungry.webp","videos":"assets/stickers/videos.webp","rose":"assets/stickers/rose.webp","wherego":"assets/stickers/wherego.webp","helpme":"assets/stickers/helpme.webp","flat":"assets/stickers/flat.webp","likethat":"assets/stickers/likethat.webp","headbutt":"assets/stickers/headbutt.webp","muchworld":"assets/stickers/muchworld.webp","give":"assets/stickers/give.webp","likeyou":"assets/stickers/likeyou.webp","bye":"assets/stickers/bye.webp","yes":"assets/stickers/yes.webp","grin":"assets/stickers/grin.webp","goodmorning":"assets/stickers/goodmorning.webp","hearts":"assets/stickers/hearts.webp","proud":"assets/stickers/proud.webp","bath":"assets/stickers/bath.webp","ok":"assets/stickers/ok.webp","huglying":"assets/stickers/huglying.webp","snug":"assets/stickers/snug.webp","noenergy":"assets/stickers/noenergy.webp","snack":"assets/stickers/snack.webp","study":"assets/stickers/study.webp","sad":"assets/stickers/sad.webp","sniff":"assets/stickers/sniff.webp","goodnight":"assets/stickers/goodnight.webp","hug":"assets/stickers/hug.webp","drink":"assets/stickers/drink.webp","juice":"assets/stickers/juice.webp","frustrated":"assets/stickers/frustrated.webp","idk":"assets/stickers/idk.webp","eyes":"assets/stickers/eyes.webp","dontsay":"assets/stickers/dontsay.webp","no":"assets/stickers/no.webp","lovethat":"assets/stickers/lovethat.webp","daydream":"assets/stickers/daydream.webp","oh":"assets/stickers/oh.webp","thanks":"assets/stickers/thanks.webp","cry":"assets/stickers/cry.webp","home":"assets/stickers/home.webp","apple":"assets/stickers/apple.webp","boundary":"assets/stickers/boundary.webp"};
function st(n,h,c){return STK[n]?'<img class="stk'+(c?" "+c:"")+'" src="'+STK[n]+'" alt="" style="height:'+h+'px">':""}
function E(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function $(i){return document.getElementById(i)}
function avg(a){return a.length?a.reduce(function(x,y){return x+y},0)/a.length:0}
function f1(x){return (Math.round(x*10)/10).toString().replace(".",",")}
function lines(s){return String(s||"").split("\n").map(function(x){return x.trim()}).filter(Boolean)}
function td(d){return (d||new Date()).toLocaleDateString("sv")}
function addDays(k,n){var d=new Date(k+"T12:00:00");d.setDate(d.getDate()+n);return td(d)}
function tm(t){return new Date(t).toLocaleTimeString("ru",{hour:"2-digit",minute:"2-digit"})}
function md2(k){return k.slice(8)+"."+k.slice(5,7)}
function B(t,a,v,c){return'<button'+(c?' class="'+c+'"':"")+' data-a="'+a+'"'+(v!=null?' data-v="'+E(v)+'"':"")+'>'+t+'</button>'}
function bar(v){return'<div class="bar" style="width:'+Math.max(2,Math.min(100,v))+'%"></div>'}
