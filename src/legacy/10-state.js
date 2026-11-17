"use strict";
/* ---------- состояние ---------- */
var DEF={ci:[],ep:[],ev:[],chat:[],notes:[],hlp:{},cc:[],cp:[],md:{},plan:{},
sp:{d:"",total:12,tasks:[],fav:[],hist:{},log:{}},
rt:{morning:["Вода","Еда","Одежда, комфортная по ощущениям"],evening:["Ужин","Гигиена","Подготовить вещи на завтра","Выключить экраны и свет"],done:{}},
st:{task:"",steps:[]},ui:{fs:1,th:"auto",q:0,fav:[],simple:0,rem:[{id:"ci",t:"20:00",on:0,n:"Опора: чек-ин",tx:"Как ты сейчас? Один тап, и запись готова."},{id:"water",t:"12:00",on:0,n:"Опора: вода и перекус",tx:"Вода и что-нибудь съедобное."},{id:"med",t:"09:00",on:0,n:"Опора: лекарства и план",tx:"Загляни в список на сегодня."}],dm:["en","sens","anx"],dr:14,sfx:0,bsnd:0,snd:{vol:40,mix:{},tm:0}},
p:{name:"",goal:"",sens:[],trig:[],stims:"",safe:"",media:"",interests:"",style:"смешанно",signs:"",helps:"",bad:"",shut:"",people:"",meds:"",spoons:12}};
var STORAGE=window.OporaStorage.create({key:"opora_v2_data_v1",legacyKey:KEY,defaults:DEF});
var LOAD=STORAGE.load(),S=LOAD.state,storageBlocked=!LOAD.ok,localOK=LOAD.ok,lsT=0,migrationNotice=LOAD.ok&&(LOAD.status=="migrated"||LOAD.status=="migrated-marker-warning");
var CLOUD=window.OporaCloudController.create({config:window.OPORA_SUPABASE_CONFIG,revision:S.cloudRevision==null?null:S.cloudRevision});
if(S.cloudConsent===true&&CLOUD.status().configured&&CLOUD.status().signedIn)CLOUD.enable(true);
if(window.location.search.indexOf("token_hash=")>-1)CLOUD.handleCallback().then(function(result){
 if(result.ok&&S.cloudConsent===true)CLOUD.enable(true);
 if(!result.ok)console.warn("Cloud sign-in callback was not completed:",result.error);
});
try{rollSp(true)}catch(e){}
if(LOAD.ok&&LOAD.status=="empty")localOK=STORAGE.save(S).ok;
function saveLocal(){if(storageBlocked)return false;var result=STORAGE.save(S);return result.ok}
function setCS(){var e=$("cs");if(e)e.textContent=storageBlocked?"Хранилище не изменено: обнаружена ошибка. Импортируйте корректную копию или скачайте исходные данные.":!localOK?"Не удалось сохранить локально — скачайте копию и проверьте свободное место":migrationNotice?(LOAD.migration&&!LOAD.migration.markerSaved?"Данные перенесены и проверены; исходная копия сохранена, но маркер переноса записать не удалось.":"Данные перенесены в новое локальное хранилище; исходная копия сохранена."):"Сохранено на устройстве"}
setCS();
function saveSoon(){if(lsT)return;lsT=setTimeout(function(){lsT=0;localOK=saveLocal()||false;setCS()},300)}
function flushLocal(){if(lsT){clearTimeout(lsT);lsT=0}localOK=saveLocal()||false;setCS()}
addEventListener("pagehide",flushLocal);document.addEventListener("visibilitychange",function(){if(document.hidden)flushLocal()});
function sv(){VER++;saveSoon();setCS()}
