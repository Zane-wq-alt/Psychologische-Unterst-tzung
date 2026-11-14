"use strict";
/* ---------- справочники ---------- */
var SENS={"Звук":"беруши или шумоподавление ДО входа в шумное место, а не после","Свет":"тёмные очки, приглушённый свет, избегать ламп дневного света","Запахи":"проветриваемые места, при необходимости нейтральный запах с собой","Одежда и текстуры":"одежда без бирок и швов, заранее подготовленный «безопасный» комплект","Прикосновения":"заранее обозначить границы контакта","Еда и вкусы":"«безопасная» еда под рукой, не пробовать новое в плохой день","Толпа":"непиковое время, место у выхода","Температура":"одежда слоями, холодная вода или грелка"};
var TRG={"Смена планов":"просить предупреждать заранее, иметь план Б","Неопределённость":"запросить детали письменно: время, место, длительность, участники","Спешка":"закладывать +30% времени и буфер между делами","Телефонные звонки":"переводить в переписку, готовить тезисы заранее","Открытое пространство":"наушники, место у стены, перерывы у окна","Шумные места":"короткие визиты, заранее обозначенный выход","Социальные ожидания":"заготовленные фразы, право уйти без объяснений","Критика":"просить письменную обратную связь, отвечать позже","Много задач сразу":"один шаг за раз, список из 1–3 пунктов"};
var M=[["mood","Настроение","10 — отличное",1],["en","Энергия","10 — полный запас",2],["sens","Сенсорная нагрузка","10 — предел",3],["anx","Тревога","10 — максимум",4],["soc","Социальный ресурс","10 — полный запас",5],["mask","Маскинг (подстраиваюсь под других)","10 — постоянно",6]];
var MI={mood:1,en:2,sens:3,anx:4,soc:5,mask:6},MN={mood:"Настроение",en:"Энергия",sens:"Сенсорика",anx:"Тревога",soc:"Соц. ресурс",mask:"Маскинг"},MK=["mood","en","sens","anx","soc","mask"];
var TAGS=["Сон","Еда","Люди","Шум","Работа или учёба","Смена планов","Погода","Самочувствие","Одиночество","Дорога","Экраны","Любимое занятие"];
var WD=["Вс","Пн","Вт","Ср","Чт","Пт","Сб"],ZN={g:"Зелёная зона",y:"Жёлтая зона: риск перегрузки",r:"Красная зона: перегрузка"};
function tips(n){var t=[];S.p.sens.forEach(function(k){if(SENS[k])t.push(k+": "+SENS[k])});S.p.trig.forEach(function(k){if(TRG[k])t.push(k+": "+TRG[k])});return n?t.slice(0,n):t}
function people(){return lines(S.p.people).map(function(l){var i=l.lastIndexOf(":");return i>0?{n:l.slice(0,i).trim(),t:l.slice(i+1).trim()}:{n:l,t:""}})}
function topHelp(n){var h=S.hlp;return Object.keys(h).sort(function(a,b){return h[b]-h[a]}).slice(0,n||3)}
function gen(z){var p=S.p,st_=p.stims?"Мои способы регуляции: "+p.stims+". ":"",th=topHelp(3),tp=tips(z=="y"?3:99).join("; ");
 if(z=="g")return"Всё в норме. Поддерживаю рутину, планирую нагрузку с запасом"+(p.interests?", оставляю время на интересы ("+p.interests+")":"")+(p.goal?". Моя цель: "+p.goal:"")+".";
 if(z=="y")return"Сокращаю планы вдвое, отказываюсь от необязательного. Пауза 15 минут каждый час, вода и еда. "+st_+(th.length?"Раньше помогало: "+th.join(", ")+". ":"")+(tp?"Что сделать: "+tp+".":"");
 return"Остановиться. Уйти в тихое безопасное место"+(p.safe?" ("+p.safe+")":"")+". Не вести разговоров и не принимать решений. "+st_+(th.length?"Раньше помогало: "+th.join(", ")+". ":"")+(tp?"Снизить стимулы: "+tp+". ":"")+"Написать доверенному человеку: «Мне плохо, мне нужна тишина»."}
function plan(z){return S.plan[z]||gen(z)}
function zone(c){return(c.sens>=8||c.anx>=8||c.en<=2)?"r":(c.sens>=6||c.anx>=6||c.en<=4||c.soc<=2||c.mask>=8)?"y":"g"}
function ent(k){return S.ci.filter(function(c){return c.d==k})}
function lastCI(){return S.ci[S.ci.length-1]}
function dayZone(k){var e=ent(k);if(!e.length)return null;var z="g";e.forEach(function(c){var q=zone(c);if(q=="r")z="r";else if(q=="y"&&z!="r")z="y"});return z}
var VER=0,DM=null,DMV=-1;function dayMap(){if(DM&&DMV===VER)return DM;DM=dayMapRaw();DMV=VER;return DM}
function dayMapRaw(){var m={};S.ci.forEach(function(c){var o=m[c.d]=m[c.d]||{d:c.d,n:0,s:{},sl:[],tags:{}};o.n++;MK.forEach(function(k){o.s[k]=(o.s[k]||0)+(+c[k]||0)});if(c.sleep)o.sl.push(+c.sleep);(c.tags||[]).forEach(function(t){o.tags[t]=1});if(c.ate)o.ate=1;if(c.drank)o.drank=1;if(c.out)o.out=1});
 Object.keys(m).forEach(function(d){var o=m[d];MK.forEach(function(k){o[k]=o.s[k]/o.n});o.sleep=o.sl.length?avg(o.sl):null;delete o.s;delete o.sl});return m}
