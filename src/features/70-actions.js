"use strict";
/* ---------- действия ---------- */

ACT.go=function(b){go(b.dataset.v)};
ACT.ui=function(b){var k=b.dataset.v;if(k=="fs"){S.ui.fs=S.ui.fs>=1.3?1:+(S.ui.fs+.15).toFixed(2);toast("Размер текста: "+Math.round(S.ui.fs*100)+"%")}
 if(k=="th"){S.ui.th={auto:"light",light:"dark",dark:"auto"}[S.ui.th]||"auto";toast({auto:"Тема: как в системе",light:"Тема: светлая",dark:"Тема: тёмная"}[S.ui.th])}
 if(k=="q"){S.ui.q=S.ui.q?0:1;toast(S.ui.q?"Тихий режим: без анимаций и звуков интерфейса":"Тихий режим выключен")}sv();applyUI()};
ACT.pre=function(b){var q=QK[+b.dataset.v];if(!q[2]){go("emo");return}MK.forEach(function(k,j){$("s_"+k).value=q[2][j];$("o_"+k).textContent=q[2][j]});$("cn").value=q[1];toast("Шкалы заполнены. Проверь и сохрани","ok")};

ACT.med=function(b){var a=S.md[td()]=S.md[td()]||[],i=+b.dataset.v,j=a.indexOf(i);if(b.checked&&j<0)a.push(i);if(!b.checked&&j>-1)a.splice(j,1);sv()};
ACT.dr=function(b){S.ui.dr=+b.dataset.v;sv();go("dyn")};
ACT.dm=function(b){var k=b.dataset.v,a=S.ui.dm,j=a.indexOf(k);if(b.checked&&j<0)a.push(k);if(!b.checked&&j>-1)a.splice(j,1);sv();go("dyn")};
ACT.cal=function(b){var y=+calM.slice(0,4),m=+calM.slice(5,7)-1+(+b.dataset.v),d=new Date(y,m,1);calM=td(d).slice(0,7);go("dyn")};
ACT.day=function(b){calSel=b.dataset.v;go("dyn")};
ACT.stop=function(){stopB()};
ACT.note=function(b){var m=S.chat[+b.dataset.v];if(m){S.notes.push({t:m.c,d:td()});if(S.notes.length>30)S.notes.shift();sv();go("helper",1,1);toast("Совет сохранён","likethat")}};
ACT.delnote=function(b){S.notes.splice(+b.dataset.v,1);sv();go("helper",1,1)};
ACT.spt=function(b){S.sp.total=Math.max(1,+b.value||12);sv();go("prep")};
ACT.tdone=function(b){if(b.checked)sfx("soft");S.sp.tasks[+b.dataset.v].x=b.checked;sv();go("prep")};
ACT.tdel=function(b){S.sp.tasks.splice(+b.dataset.v,1);sv();go("prep")};
function addTask(n,c,fav){n=(n||"").trim();if(!n)return;rollSp();S.sp.tasks.push({n:n,c:c||1,x:false});var h=S.sp.hist[n]=S.sp.hist[n]||{c:c,n:0};h.n++;h.c=c;if(fav&&!S.sp.fav.some(function(f){return f.n==n}))S.sp.fav.push({n:n,c:c});sv();go("prep",1)}
ACT.tadd=function(){addTask($("tn").value,Math.max(1,+$("tc").value||1),$("tfav").checked)};
ACT.qadd=function(b){addTask(b.dataset.n,+b.dataset.c,false)};
ACT.fac=function(){evEstimate()};
ACT.evadd=function(){var n=($("en").value||"Событие").trim(),d=$("evd").value||td();S.ev.push({id:"e"+Date.now(),d:d,n:n,c:evC});S.ev.sort(function(a,b){return a.d<b.d?-1:1});if(d==td()){rollSp();S.sp.tasks.push({n:n,c:evC,x:false})}sv();go("prep",1);toast("Событие запланировано","ok")};
ACT.evdel=function(b){S.ev=S.ev.filter(function(e){return e.id!=b.dataset.v});sv();go("prep")};
ACT.rtg=function(b){if(b.checked)sfx("soft");var d=S.rt.done[td()]=S.rt.done[td()]||[],k=b.dataset.v,i=d.indexOf(k);if(b.checked&&i<0)d.push(k);if(!b.checked&&i>-1)d.splice(i,1);var ks=Object.keys(S.rt.done).sort();while(ks.length>120)delete S.rt.done[ks.shift()];sv();go("routine")};
ACT.rtadd=function(b){var k=b.dataset.v,v=$("r_"+k).value.trim();if(v){S.rt[k].push(v);sv();go("routine",1)}};
ACT.rtdel=function(b){var p=b.dataset.v.split(":");S.rt[p[0]].splice(+p[1],1);delete S.rt.done[td()];sv();go("routine")};
ACT.br=function(b){var p=b.dataset.v.split(":"),n=p[1].split(",").map(Number);breathe(p[0],n[0],n[1],n[2])};
ACT.tmr=function(b){var p=b.dataset.v.split(":");tmrGo(p[0]=="tl"?(+$("tm").value||10):+p[1],p[0])};
ACT.tsel=function(b){var k=b.dataset.v;tsel[k]=!tsel[k];b.classList.toggle("sel",!!tsel[k])};
ACT.hlp=function(){var ks=Object.keys(tsel).filter(function(k){return tsel[k]});if(!ks.length){toast("Сначала отметьте, что помогло");return}ks.forEach(function(k){S.hlp[k]=(S.hlp[k]||0)+1});tsel={};sv();go("calm",1,1);toast("Запомнил, что помогает","likethat");sfx("ok");sparkle()};
ACT.addep=function(){S.ep.push({t:Date.now(),d:td(),ty:$("et").value,tr:$("etr").value,sg:$("esg").value.trim(),du:$("edu").value,rc:$("erc").value,hl:$("ehl").value.trim(),nh:$("enh").value.trim()});sv();go("ep",1);toast("Записано. Это поможет заметить закономерности","thanks")};
ACT.epdel=function(b){S.ep.splice(+b.dataset.v,1);sv();go("ep")};
ACT.sttask=function(b){S.st.task=b.value;sv()};
ACT.sttpl=function(){S.st.steps=["Подготовить место и материалы","Открыть задачу и больше ничего не делать","Сделать 2 минуты","Решить: продолжать или пауза","Отметить прогресс"].map(function(x){return{n:x,x:0}});sv();go("start")};
ACT.stclr=function(){S.st.steps=[];sv();go("start")};
ACT.stdone=function(b){if(b.checked)sfx("soft");S.st.steps[+b.dataset.v].x=b.checked;if(b.checked&&S.st.steps.every(function(s){return s.x}))setTimeout(function(){sparkle();sfx("ok")},50);sv();go("start")};
ACT.stadd=function(){var v=$("ssn").value.trim();if(v){S.st.steps.push({n:v,x:0});sv();go("start",1)}};
ACT.emo=function(b){var e=EM[+b.dataset.v],r=$("er");r.className="card";r.innerHTML=st(e[3],100)+'<br><b>Возможно:</b> '+E(e[1])+'<br><b>Что нужно:</b> '+E(e[2])};
ACT.cp=function(b){copyText(b.dataset.t,b)};
ACT.cpadd=function(){var v=$("cpn").value.trim();if(v){S.cp.push(v);sv();go("say",1)}};
ACT.cpdel=function(b){S.cp.splice(+b.dataset.v,1);sv();go("say")};
ACT.fav=function(b){var k=b.dataset.v,f=favs(),i=f.indexOf(k);if(i>-1)f.splice(i,1);else{if(f.length>=6){toast("Можно закрепить до 6 разделов");return}f.push(k)}S.ui.fav=f;sv();go(tab,1,1);toast(i>-1?"Убрано из быстрых":"Закреплено на главной","ok")};
ACT.simple=function(b){S.ui.simple=b.checked?1:0;sv();go("more",1,1);toast(b.checked?"Простой режим включён":"Показаны все разделы")};
var WB=0;
function wordsBoard(){WB=1;var want=["Да","Нет","Тише, пожалуйста","Мне нужна помощь","Нет сил","Мне нужно уйти"],my=S.cc.slice(0,2),lst=my.concat(CARDS.filter(function(c){return want.indexOf(c[1])>-1}).sort(function(a,b){return want.indexOf(a[1])-want.indexOf(b[1])})).slice(0,8);
 overlay('<h2 style="text-align:center;margin:6px 0">Без слов</h2><div class="mut" style="text-align:center">Нажмите карточку, она откроется на весь экран.</div><div class="wb">'+lst.map(function(c){return'<button class="tile" data-a="big" data-s="'+E(c[0])+'" data-t="'+E(c[1])+'">'+st(c[0],84)+E(c[1])+'</button>'}).join("")+'</div><p style="text-align:center">'+B("Закрыть","close")+'</p>')}
ACT.words=function(){wordsBoard()};
ACT.big=function(b){bigS(b.dataset.s,b.dataset.t)};
ACT.instr=function(){instr()};
ACT.ccadd=function(){var t=$("cct").value.trim();if(!t){toast("Введите текст карточки");return}S.cc.push([$("ccs").value,t]);sv();go("cards",1);toast("Карточка сохранена","ok")};
ACT.ccshow=function(){var t=$("cct").value.trim();if(t)bigS($("ccs").value,t)};
ACT.ccdel=function(b){S.cc.splice(+b.dataset.v,1);sv();go("cards")};
ACT.sos=function(){sos()};ACT.sosc=function(){closeOv();go("cards")};ACT.close=function(){closeOv()};
ACT.savenow=function(){flushLocal();toast(localOK?"Сохранено на устройстве":"Не удалось сохранить",localOK?"likethat":"err");go("rep")};
ACT.cprep=function(b){copyText($("rp").value,b)};
ACT.dlrep=function(){saveFile("opora-otchet.txt",$("rp").value)};
ACT.dljson=function(){saveFile("opora-backup.json",STORAGE.exportText(S),"application/json")};
ACT.dlcsv=function(){saveFile("opora-checkins.csv",csv())};
ACT.imp=function(){importJSON($("jd").value)};
ACT.erarm=function(b){window._er=b.dataset.v=="1";go("rep")};
ACT.erase=function(){var fresh=STORAGE.fresh();fresh.ui=S.ui;var result=STORAGE.replaceState(fresh,"before-reset");if(!result.ok){toast("Не удалось создать резервную копию или сбросить данные","err");return}VER++;window._er=false;S=result.state;storageBlocked=false;localOK=true;setCS();go("today",1);toast("Данные сброшены; предыдущая версия сохранена в резервной копии","ok")};
ACT.restore=function(b){var result=STORAGE.restoreBackup(b.dataset.v);if(!result.ok){toast("Не удалось восстановить эту копию","err");return}var loaded=STORAGE.load();S=loaded.state;storageBlocked=!loaded.ok;localOK=loaded.ok;if(loaded.ok)VER++;applyUI();setCS();go("rep",1);toast(loaded.ok?"Копия восстановлена":"Копия восстановлена, но её формат требует проверки","ok")};
ACT.dlraw=function(){var raw=STORAGE.raw();if(raw!==null)saveFile("opora-recovery-raw.txt",raw,"text/plain")};
document.addEventListener("click",function(e){var b=e.target.closest("[data-a]");if(!b||b.tagName=="SELECT")return;if(b.type=="checkbox"&&e.target!==b&&!b.contains(e.target))return;var f=ACT[b.dataset.a];if(f&&b.tagName!="INPUT"||(f&&b.type=="checkbox"))f(b,e)});
document.addEventListener("change",function(e){var t=e.target;
 if(t.dataset&&t.dataset.p){var k=t.dataset.p;S.p[k]=k=="spoons"?Math.max(1,+t.value||12):t.value;sv();profUpd()}
 else if(t.dataset&&t.dataset.pg){var g=t.dataset.pg;S.p[g]=[].slice.call(document.querySelectorAll('input[data-pg="'+g+'"]:checked')).map(function(x){return x.value});sv();profUpd()}
 else if(t.dataset&&t.dataset.plan){var z=t.dataset.plan;if(t.value.trim())S.plan[z]=t.value;else{delete S.plan[z];t.value=gen(z)}sv();toast("Сохранено")}
 else if((t.dataset&&t.dataset.m)||t.id=="avol"){sv()}
 else if(t.dataset&&t.dataset.a=="spt"){ACT.spt(t)}
 else if(t.dataset&&t.dataset.a=="sttask"){ACT.sttask(t)}
 else if(t.id=="imf"&&t.files&&t.files[0]){var r=new FileReader();r.onload=function(){importJSON(String(r.result))};r.readAsText(t.files[0])}});
var slT=0;function svLater(){clearTimeout(slT);slT=setTimeout(sv,500)}
function profUpd(){var c=completeness(),m=$("pm"),t=$("pmt");if(m)m.style.width=c+"%";if(t)t.textContent="Заполнено на "+c+"%";toast("Сохранено")}
document.addEventListener("input",function(e){var t=e.target;if(t.dataset&&t.dataset.m){S.ui.snd.mix[t.dataset.m]=+t.value;var ml=$("mv_"+t.dataset.m);if(ml)ml.textContent=t.value;aApply();svLater()}if(t.id=="avol"){S.ui.snd.vol=+t.value;var vl=$("vo");if(vl)vl.textContent=t.value;aApply();svLater()}if(t.type=="range"&&t.id&&t.id.indexOf("s_")==0){var l=$("o_"+t.id.slice(2));if(l)l.textContent=t.value}});
document.addEventListener("input",function(e){var t=e.target;if(t.id!="msr")return;var q=t.value.trim().toLowerCase(),n=0;document.querySelectorAll(".mrow").forEach(function(r){var ok=!q||r.dataset.n.indexOf(q)>-1;r.hidden=!ok;if(ok)n++});document.querySelectorAll(".mg").forEach(function(g){g.hidden=!g.querySelector(".mrow:not([hidden])")});var m=$("mnone");if(m)m.hidden=n>0});
document.addEventListener("keydown",function(e){if(e.key=="Escape"&&!$("sos").hidden)closeOv()});
