'use strict';
const $=s=>document.querySelector(s), canvas=$('#gameCanvas'),ctx=canvas.getContext('2d');
const image=new Image();image.src='assets/reference-frame.jpg';
// The complete original frame is retained as an atlas. Browser chrome is never drawn.
const atlasSources={rules:'assets/reference-rules.jpg',symbols:'assets/reference-symbols.jpg',spin:'assets/reference-spin.jpg',hyper:'assets/reference-hyper.jpg'};
const atlasImages=window.gameAssets||{};
const atlasReady=window.gameAssets?Promise.resolve():Promise.all(Object.entries(atlasSources).map(([key,src])=>new Promise((resolve,reject)=>{const a=new Image();a.onload=()=>{atlasImages[key]=a;resolve();};a.onerror=reject;a.src=src;})));
const FRAME={x:0,y:318,w:886,h:1414};
let balance=533340,stake=250,rounds=[],grid=null,busy=false,ready=false,fast=false,animation=0,phase='idle',changed=false,muted=true;
let statusPatch=null;
let spinPlan=null,spinElapsed=0,finishRequested=false,lastPayout=0;
const format=value=>(value/100).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
function base(){ctx.drawImage(image,FRAME.x,FRAME.y,FRAME.w,FRAME.h,0,0,886,1414);}
function paint(){
 if(!ready)return;base();
 ReelView.draw(ctx,image,grid||ReelView.initial,spinPlan,spinElapsed);
 // Visible provenance replaces the captured provider/session identifier.
 ctx.fillStyle='#100015';ctx.fillRect(0,1390,886,32);ctx.fillStyle='#bba9bf';ctx.font='17px Arial';ctx.textAlign='center';ctx.fillText('DEMO EDUCATIVA · FICHAS FICTICIAS · SIN PREMIOS REALES',443,1410);
 // One footer renderer for initial load, spinning, stopped and reset states.
 ctx.save();ctx.fillStyle='#100015';ctx.fillRect(0,1353,886,42);
 ctx.drawImage(image,153,1670,116,31,153,1352,116,31);
 ctx.drawImage(image,484,1670,118,31,484,1352,118,31);
 ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font='28px Impact, Arial Narrow, Arial';ctx.fillStyle='#fff';
 ctx.scale(1.25,1);ctx.fillText(format(balance)+' ARS',275/1.25,1379,196/1.25);
 ctx.fillText(format(stake)+' ARS',610/1.25,1379,210/1.25);ctx.restore();

 // Draw the entire controls surface as a single layer, avoiding visible patches.
 ctx.drawImage(busy?atlasImages.spin:atlasImages.symbols,0,1168,886,506,0,813,886,455);
 if(busy){ctx.save();ctx.fillStyle='#100015aa';for(const [x,w] of [[213,125],[451,94],[551,124]])ctx.fillRect(x,1268,w,73);ctx.restore();}
 if(phase==='end'||(!busy&&lastPayout>0)){
  ctx.fillStyle='#22022e';ctx.fillRect(55,835,776,64);ctx.textAlign='center';ctx.font='900 36px Arial Narrow,Arial';ctx.fillStyle='white';ctx.fillText(phase==='end'?'FIN DE LA DEMOSTRACIÓN':'GANANCIA '+format(lastPayout)+' ARS',443,880,740);
 }


}
function controls(){const stopped=rounds.length>=10;$('.spin-control').disabled=!ready||stopped;$('.spin-control').setAttribute('aria-label',busy?'Detener los rodillos':'Girar una ronda de demostración');for(const s of ['.plus-control','.minus-control','.stake-control','.reset-control','.sound-control','.info-control'])$(s).disabled=!ready||busy;$('#resetMenu').disabled=busy;}
function info(){const used=rounds.reduce((s,r)=>s+r.stake,0),paid=rounds.reduce((s,r)=>s+r.payout,0);$('#summary').textContent=`${rounds.length} rondas · Usadas: ${format(used)} · Recibidas: ${format(paid)} · Neto: ${format(paid-used)} fichas.`;$('#history').replaceChildren();rounds.forEach((r,i)=>{const tr=document.createElement('tr');[String(i+1),format(r.stake),format(r.payout),format(r.payout-r.stake)].forEach(text=>{const td=document.createElement('td');td.textContent=text;tr.append(td);});$('#history').append(tr);});if(!$('#info').open)$('#info').showModal();}
async function audioToggle(){const audio=$('#audio');if(muted){try{await audio.play();muted=false;}catch{$('#status').textContent='Tocá nuevamente para activar el audio.';return;}}else{audio.pause();muted=true;}$('#audioNote').textContent=muted?'DEMO · ♫ apagado':'DEMO · ♫ activado';}
function changeStake(direction){if(busy)return;const values=[250,500,1000,1250,2000,2500,5000,10000,12500,25000,50000,100000,250000,500000,2500000];let i=values.findIndex(v=>v>=stake);stake=values[Math.max(0,Math.min(values.length-1,i+direction))];syncStake();changed=true;paint();$('#status').textContent='Fichas por ronda: '+format(stake);}
function reset(){if(busy)return;clearInterval(autoTimer);remaining=0;balance=533340;rounds=[];grid=null;spinPlan=null;lastPayout=0;phase='idle';changed=stake!==250;paint();controls();$('#status').textContent='Demostración reiniciada.';}
$('.spin-control').addEventListener('click',()=>{
 if(busy){finishRequested=true;return;}
 if(!ready||rounds.length>=10)return;
 if(balance<stake){$('#status').textContent='Fichas ficticias insuficientes.';return;}
 const before=grid||ReelView.initial,result=AulaAzar.round(balance,stake),spent=stake;
 balance-=spent;changed=true;busy=true;phase='spin';lastPayout=0;finishRequested=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 spinPlan=ReelView.plan(before,result.grid,fast,reduced);grid=result.grid;spinElapsed=0;controls();
 $('#status').textContent='Girando una ronda de demostración.';
 const start=performance.now(),duration=Math.max(...spinPlan.map(s=>s.duration));
 function frame(now){spinElapsed=finishRequested?duration:now-start;
  if(spinElapsed<duration){paint();animation=requestAnimationFrame(frame);return;}
  balance=result.balance;lastPayout=result.payout;grid=result.grid;spinPlan=null;
  rounds.push({stake:spent,payout:result.payout});busy=false;phase=rounds.length>=10?'end':'complete';paint();controls();
  $('#status').textContent=`Ronda ${rounds.length}. Recibidas ${format(result.payout)}. Saldo ${format(balance)} fichas ficticias.`;
  if(rounds.length>=10)info();
 }
 animation=requestAnimationFrame(frame);
});
$('.plus-control').addEventListener('click',()=>changeStake(1));$('.minus-control').addEventListener('click',()=>changeStake(-1));$('.reset-control').addEventListener('click',()=>$('#autoplay').showModal());$('.info-control').addEventListener('click',()=>{drawRules();$('#rules').showModal();});$('.sound-control').addEventListener('click',()=>$('#hyperplay').showModal());$('.menu-control').addEventListener('click',()=>$('#menu').showModal());$('.stake-control').addEventListener('click',()=>(stakeFields(),$('#stakes').showModal()));$('.speed-control').addEventListener('click',()=>{fast=!fast;$('.speed-control').setAttribute('aria-pressed',String(fast));$('#status').textContent=fast?'Animación rápida':'Animación normal';});
$('.fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('.reference-game').requestFullscreen();}catch{$('#status').textContent='La pantalla completa no está disponible en este navegador.';}});
$('#openInfo').addEventListener('click',()=>{$('#menu').close();info();});$('#audioMenu').addEventListener('click',audioToggle);$('#resetMenu').addEventListener('click',()=>{reset();$('#menu').close();});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));document.querySelectorAll('[data-stake]').forEach(b=>b.addEventListener('click',()=>{if(busy)return;stake=Number(b.dataset.stake);changed=true;paint();$('#stakes').close();}));
document.addEventListener('visibilitychange',()=>{if(document.hidden)$('#audio').pause();else if(!muted)$('#audio').play().catch(()=>{});});
image.onload=async()=>{try{await atlasReady;ReelView.configure(atlasImages);ready=true;paint();controls();}catch{$('#status').textContent='No se pudieron cargar los gráficos del juego. Recargá la página.';}};image.onerror=()=>{$('#status').textContent='No se pudo cargar la imagen de referencia. Recargá la página.';const p=document.createElement('p');p.className='loading-error';p.textContent='No se pudo cargar la imagen. Revisá la conexión y recargá.';$('.reference-game').append(p);};if(image.complete&&image.naturalWidth)image.onload();controls();

let coins=1,coinIndex=0;const coinValues=[50,100,200,500,1000,2000,5000,10000,50000];
function stakeFields(){syncStake();document.querySelector('#coinCount').textContent=coins;document.querySelector('#coinValue').textContent=format(coinValues[coinIndex])+' ARS';document.querySelector('#totalStake').textContent=format(stake)+' ARS';}
document.querySelectorAll('[data-adjust]').forEach(b=>b.onclick=()=>{const [field,d]=b.dataset.adjust.split(':');if(field==='coins')coins=Math.max(1,Math.min(10,coins+Number(d)));else if(field==='value')coinIndex=Math.max(0,Math.min(coinValues.length-1,coinIndex+Number(d)));else {changeStake(Number(d));stakeFields();return;}stake=5*coins*coinValues[coinIndex];changed=true;paint();stakeFields();});
document.querySelector('#maxStake').onclick=()=>{coins=10;coinIndex=8;stake=2500000;changed=true;paint();stakeFields();};stakeFields();
let autoTimer=null,remaining=0;
function autoStart(dialog){dialog.close();remaining=Number(document.querySelector(dialog.id==='hyperplay'?'#hyperCount':'#autoCount').value);fast=dialog.id==='hyperplay'||$('#turboAuto').checked||$('#fastAuto').checked;clearInterval(autoTimer);autoTimer=setInterval(()=>{if(busy)return;if(!remaining||rounds.length>=10||balance<stake){clearInterval(autoTimer);return;}remaining--;document.querySelector('.spin-control').click();},300);}
document.querySelector('#startAuto').onclick=()=>autoStart(document.querySelector('#autoplay'));
let hyperTimer=null;
function stopHyper(){clearInterval(hyperTimer);hyperTimer=null;$('#hyperStart').textContent='▶';}
$('#hyperStart').onclick=()=>{if(hyperTimer){stopHyper();return;}if(busy)return;let left=Number($('#hyperCount').value);$('#hyperStart').textContent='Ⅱ';hyperTimer=setInterval(()=>{if(left<=0||rounds.length>=10||balance<stake){stopHyper();return;}const result=AulaAzar.round(balance,stake);balance=result.balance;grid=result.grid;rounds.push({stake,payout:result.payout});left--;changed=true;phase=rounds.length>=10?'end':'complete';paint();controls();hyperFields();$('#hyperSpent').textContent=format(rounds.reduce((sum,r)=>sum+r.stake,0));$('#hyperPaid').textContent=format(rounds.reduce((sum,r)=>sum+r.payout,0));$('.hyper-columns').textContent='TIRADA '+rounds.length+' · GANANCIA '+format(result.payout)+' · CRÉDITO '+format(balance);if($('#hyperStop').checked&&result.payout>0)stopHyper();},180);};
$('#hyperplay').addEventListener('close',stopHyper);

document.querySelector('#openHyper').onclick=()=>{document.querySelector('#autoplay').close();document.querySelector('#hyperplay').showModal();};
document.querySelector('#autoCount').oninput=e=>{document.querySelector('#autoNumber').textContent=e.target.value;document.querySelector('#startAuto').textContent='INICIAR TIR. AUTO. ('+e.target.value+')';};

function hyperFields(){$('#hyperStake').textContent=format(stake)+' ARS';$('#hyperCredit').textContent=format(balance)+' ARS';$('#hyperCountLabel').textContent=$('#hyperCount').value;}
$('#hyperMinus').onclick=()=>{changeStake(-1);hyperFields();};$('#hyperPlus').onclick=()=>{changeStake(1);hyperFields();};
$('#hyperBetRange').oninput=e=>{stake=[250,500,1000,1250,2000,2500,5000,10000,12500,25000,50000,100000,250000,500000,2500000][Number(e.target.value)];changed=true;paint();hyperFields();};
$('#hyperCount').oninput=hyperFields;for(const [id,dir] of [['#hyperCountMinus',-1],['#hyperCountPlus',1]])$(id).onclick=()=>{$('#hyperCount').value=Math.max(1,Math.min(100,Number($('#hyperCount').value)+dir));hyperFields();};
$('.sound-control').addEventListener('click',hyperFields);$('#openHyper').addEventListener('click',hyperFields);

function drawRules(){const c=$('#rulesCanvas').getContext('2d');c.drawImage(atlasImages.rules,32,335,826,1250,0,0,826,1250);const table=[[[250,50,10],0,0],[[1000,200,20],1,0],[[200,40,10],0,1],[[200,40,10],1,1],[[40,10,4],0,2],[[40,10,4],1,2],[[40,8,4],0,3],[[40,8,4,1],1,3]];c.font='22px Arial';c.textAlign='left';c.fillStyle='white';for(const [rates,col,row]of table){const x=col?475:138,y=[379,629,873,1104][row];c.fillStyle='#08050b';c.fillRect(x-4,y-3,294,rates.length*23+8);c.fillStyle='white';rates.forEach((rate,i)=>c.fillText((5-i)+' - '+format(stake*rate)+' ARS',x,y+20+i*23,287));}}
function syncStake(){if(5*coins*coinValues[coinIndex]===stake)return true;let found=false;for(let i=0;i<coinValues.length;i++){const n=stake/(5*coinValues[i]);if(Number.isInteger(n)&&n>=1&&n<=10){coins=n;coinIndex=i;found=true;break;}}return found;}
