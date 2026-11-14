"use strict";
/* ---------- прогноз и подсказки ---------- */
function rollSp(q){var s=S.sp,t=td();if(s.d==t)return;if(s.d&&s.tasks.length){s.log[s.d]={p:s.tasks.reduce(function(a,x){return a+x.c},0),u:s.tasks.filter(function(x){return x.x}).reduce(function(a,x){return a+x.c},0),t:s.total};var ks=Object.keys(s.log).sort();while(ks.length>60)delete s.log[ks.shift()]}
 s.d=t;s.tasks=[];s.total=+S.p.spoons||s.total||12;S.ev.filter(function(e){return e.d==t}).forEach(function(e){s.tasks.push({n:e.n,c:e.c,x:false})});if(!q)sv()}
function spPlan(){rollSp();return S.sp.tasks.reduce(function(a,t){return a+t.c},0)}
function risk(){var r=[],sc=0,t=td(),te=ent(t),ref=te.length?te[te.length-1]:lastCI(),dm=dayMap();
 if(ref){var z=zone(ref);if(z=="r"){sc+=3;r.push("последняя запись в красной зоне")}else if(z=="y"){sc+=1.5;r.push("последняя запись в жёлтой зоне")}}
 var sl=te.concat(ent(addDays(t,-1))).filter(function(c){return c.sleep}).slice(-1)[0];if(sl&&sl.sleep<6){sc+=1.5;r.push("сна было меньше 6 часов")}
 var ds=Object.keys(dm).sort().slice(-3);if(ds.length==3&&dm[ds[0]].en>dm[ds[1]].en&&dm[ds[1]].en>dm[ds[2]].en&&dm[ds[2]].en<=6){sc+=1;r.push("энергия снижается три дня подряд")}
 var y=dm[addDays(t,-1)];if(y&&y.mask>=7){sc+=1;r.push("вчера был высокий маскинг")}
 var ps=spPlan(),tot=S.sp.total||12;if(ps>tot){sc+=1.5;r.push("план дня больше ресурса ложек")}else if(ps>=tot*.9){sc+=1;r.push("запас ложек почти на нуле")}
 var nz=0;for(var i=0;i<4;i++){var q=dayZone(addDays(t,-i));if(q&&q!="g")nz++;else if(q)break}if(nz>=2){sc+=1;r.push("несколько дней подряд без зелёной зоны")}
 var evn=S.ev.filter(function(e){return e.d==t});if(evn.length){sc+=1;r.push("сегодня событие: "+evn[0].n)}
 return{lvl:sc>=4?"h":sc>=2?"m":"l",sc:sc,r:r,has:!!ref}}
function nowActions(){var a=[],l=lastCI(),t=td(),te=ent(t),ref=te.length?te[te.length-1]:l,hr=new Date().getHours(),rk=risk();
 if(!te.length)a.push("Сделайте короткий чек-ин на вкладке «Сегодня». Это 30 секунд, и подсказки станут точнее.");
 if(ref){var z=zone(ref);if(z=="r")a.push("Красная зона: "+plan("r"));else if(z=="y")a.push("Жёлтая зона: "+plan("y"));
  if(ref.ate===false)a.push("Вы отметили, что не ели нормально: поешьте что-то простое из безопасной еды"+(S.p.safe?" ("+S.p.safe+")":"")+".");
  if(ref.drank===false)a.push("Выпейте воды.");
  if(ref.soc<=3)a.push("Социальный ресурс низкий: общайтесь письменно и используйте готовые фразы или карточки.");
  if(ref.mask>=7)a.push("Высокий маскинг: запланируйте время без людей, где можно не подстраиваться.");
  if(ref.sens>=6)tips(3).forEach(function(x){a.push(x)});
  if(ref.en<=4&&ref.sens<6)a.push("Мало энергии: уберите из плана необязательное, выберите одно маленькое дело.")}
 if(spPlan()>(S.sp.total||12))a.push("План дня больше вашего запаса ложек: перенесите одно-два дела на другой день.");
 var md=lines(S.p.meds);if(md.length&&hr>=10&&(S.md[t]||[]).length<md.length)a.push("Проверьте свой список напоминаний: не все пункты отмечены.");
 var soon=S.ev.filter(function(e){return e.d>t&&e.d<=addDays(t,2)});if(soon.length)a.push("Скоро событие «"+soon[0].n+"» ("+md2(soon[0].d)+"): подготовьтесь заранее на вкладке «Силы и события».");
 if(ref&&zone(ref)!="g")a.push("Можно включить спокойные звуки или сыграть в успокаивающую игру: вкладка «Звуки и игры».");
 if(hr>=22||hr<5)a.push("Поздно: переходите к вечерней рутине и снижайте стимулы.");
 if(rk.lvl=="l"&&a.length<2&&S.p.interests)a.push("Хороший момент для своего интереса: "+S.p.interests+".");
 return a.slice(0,6)}
