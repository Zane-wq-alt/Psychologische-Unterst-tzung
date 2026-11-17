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
var CLOUD_CONSENT_KEY="opora_cloud_consent_v1",CLOUD_CONSENT=false;
try{CLOUD_CONSENT=localStorage.getItem(CLOUD_CONSENT_KEY)==="yes"}catch(_){}
if(CLOUD_CONSENT&&CLOUD.status().configured&&CLOUD.status().signedIn)CLOUD.enable(true);
if(window.location.search.indexOf("token_hash=")>-1||window.location.hash.indexOf("access_token=")>-1)CLOUD.handleCallback().then(function(result){
 if(result.ok){
  if(CLOUD_CONSENT)CLOUD.enable(true);
  if(typeof go==="function")go("rep",1);
  if(typeof toast==="function")toast("Вход в облачный аккаунт выполнен","ok");
 }else console.warn("Cloud sign-in callback was not completed:",result.error);
});
try{rollSp(true)}catch(e){}
if(LOAD.ok&&LOAD.status=="empty")localOK=STORAGE.save(S).ok;
var DATA_KEY="opora_v2_data_v1",externalChange=false;
function extBanner(){return'<div class="card z zy" id="ext"><b>Данные изменила другая вкладка «Опоры».</b><br>Чтобы ничего не потерять, сохранение в этой вкладке остановлено. Загрузите свежие данные или осознанно сохраните версию этой вкладки: перед заменой будет создана локальная копия.<div class="row" style="margin-top:8px">'+B("Загрузить свежие данные","extreload",null,"pri")+B("Сохранить версию этой вкладки","extkeep")+'</div></div>'}
function flagExternalChange(){if(externalChange)return;externalChange=true;if(lsT){clearTimeout(lsT);lsT=0}setCS();var v=$("v");if(v&&!$("ext"))v.insertAdjacentHTML("afterbegin",extBanner())}
function saveLocal(){if(storageBlocked)return false;if(externalChange)return false;var result=STORAGE.save(S);if(!result.ok&&result.error=="external-change")flagExternalChange();return result.ok}
try{addEventListener("storage",function(e){if(externalChange||storageBlocked)return;if(e.key!==null&&e.key!==DATA_KEY)return;if(STORAGE.hasExternalChange())flagExternalChange()})}catch(_){}
function setCS(){var e=$("cs");if(e)e.textContent=externalChange?"Сохранение остановлено: данные изменила другая вкладка. Загрузите свежие данные или сохраните версию этой вкладки.":storageBlocked?"Хранилище не изменено: обнаружена ошибка. Импортируйте корректную копию или скачайте исходные данные.":!localOK?"Не удалось сохранить локально — скачайте копию и проверьте свободное место":migrationNotice?(LOAD.migration&&!LOAD.migration.markerSaved?"Данные перенесены и проверены; исходная копия сохранена, но маркер переноса записать не удалось.":"Данные перенесены в новое локальное хранилище; исходная копия сохранена."):"Сохранено на устройстве"}
setCS();
function saveSoon(){if(lsT)return;lsT=setTimeout(function(){lsT=0;localOK=saveLocal()||false;setCS()},300)}
function flushLocal(){if(lsT){clearTimeout(lsT);lsT=0}localOK=saveLocal()||false;setCS()}
addEventListener("pagehide",flushLocal);document.addEventListener("visibilitychange",function(){if(document.hidden)flushLocal()});
function sv(){VER++;saveSoon();setCS()}
