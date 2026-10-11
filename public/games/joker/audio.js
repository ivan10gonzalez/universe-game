/* Separate beds extracted from idle reference footage; UI and reel effects are not baked into the music loops. */
(function(root){
 'use strict';
 const defaults={enabled:true,music:true,effects:true,musicVolume:1,effectsVolume:.8};
 const files={active:'assets/music-active.mp3',calm:'assets/music-calm.mp3',bet:'assets/bet-change.mp3'};
 function create(options={}){
  const Context=options.AudioContext||root.AudioContext||root.webkitAudioContext;
  let settings={...defaults,...options.settings},context=null,master,musicGain,effectGain,currentMusic=null,rollSource=null,betSource=null;
  let hidden=false,rolling=false,unlocked=false,mode=null,reels=5,buffers=null,loading=null,error='',generation=0,betRequest=0;
  const voices=new Set(),offsets={active:0,calm:0};
  // Fetching bytes is silent. Context creation and playback wait for a real action.
  let downloads=null;
  function download(){if(!downloads&&Context&&!options.loadBuffers){downloads=Promise.all(Object.entries(files).map(async([key,url])=>{const r=await root.fetch(url);if(!r.ok)throw Error('No se pudo cargar el audio.');return [key,await r.arrayBuffer()];}));downloads.catch(()=>{downloads=null;});}return downloads;}
  download();
  function state(){return {...settings,mode,unlocked,available:!!Context,loaded:!!buffers,error,running:!!context&&context.state==='running'&&settings.enabled&&!hidden&&!!mode};}
  function setup(){
   if(context||!Context)return;context=new Context();master=context.createGain();musicGain=context.createGain();effectGain=context.createGain();
   master.connect(context.destination);musicGain.connect(master);effectGain.connect(master);
  }
  function load(){
   if(buffers)return Promise.resolve();
   if(!loading)loading=(options.loadBuffers?options.loadBuffers(context):download().then(entries=>Promise.all(entries.map(async([key,bytes])=>[key,await context.decodeAudioData(bytes.slice(0))]))).then(entries=>Object.fromEntries(entries)))
    .then(value=>{buffers=value;error='';}).catch(e=>{error=e.message||'No se pudo cargar el audio.';throw e;}).finally(()=>{loading=null;});
   return loading;
  }
  function remember(source,gain){voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();gain?.disconnect();};return source;}
  function stopVoice(source){if(!source)return;try{source.stop();}catch{}voices.delete(source);source.disconnect();source.gainNode?.disconnect();}
  function stopMusic(fade=0){
   if(!currentMusic)return;
   const {source,gain,kind,started,offset}=currentMusic,now=context.currentTime;
   offsets[kind]=(offset+now-started)%buffers[kind].duration;
   if(fade){gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(gain.gain.value,now);gain.gain.linearRampToValueAtTime(0,now+fade);source.stop(now+fade+.01);}else stopVoice(source);
   currentMusic=null;
  }
  function startMusic(){
   if(!buffers||!mode||currentMusic?.kind===mode)return;
   stopMusic(.35);
   const source=context.createBufferSource(),gain=context.createGain(),now=context.currentTime,offset=offsets[mode]%buffers[mode].duration;
   source.buffer=buffers[mode];source.loop=true;source.gainNode=gain;source.connect(gain);gain.connect(musicGain);remember(source,gain);
   gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(1,now+.35);source.start(0,offset);
   currentMusic={source,gain,kind:mode,started:now,offset};
  }
  function startRoll(){
   if(rollSource)return;
   const noise=context.createBuffer(1,Math.round(context.sampleRate*.16),context.sampleRate),data=noise.getChannelData(0);
   let seed=19,last=0;for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;last=.84*last+.16*(seed/1073741824-1);data[i]=last*(.32+.20*Math.sin(i/context.sampleRate*Math.PI*2*38));}
   rollSource=context.createBufferSource();rollSource.buffer=noise;rollSource.loop=true;
   const gain=context.createGain();gain.gain.value=.23*(reels/5);rollSource.connect(gain);gain.connect(effectGain);rollSource.gainNode=gain;rollSource.start();
  }
  function stopRoll(){if(rollSource){stopVoice(rollSource);rollSource=null;}}
  function apply(){
   if(!context)return;
   const live=settings.enabled&&!hidden&&context.state==='running';
   master.gain.setValueAtTime(live?1:0,context.currentTime);
   musicGain.gain.setValueAtTime(settings.music?settings.musicVolume:0,context.currentTime);effectGain.gain.setValueAtTime(settings.effectsVolume,context.currentTime);
   if(live&&settings.music&&mode)startMusic();else stopMusic();
   if(live&&settings.effects&&rolling)startRoll();else stopRoll();
   if(!live){for(const voice of [...voices])stopVoice(voice);betSource=null;}
   else if(!settings.effects){if(betSource)stopVoice(betSource);betSource=null;for(const voice of [...voices])if(voice.effect)stopVoice(voice);}
  }
  async function unlock(){
   if(!settings.enabled||hidden||!Context)return false;
   try{setup();if(context.state!=='running')await context.resume();unlocked=context.state==='running';await load();apply();return unlocked;}catch{return false;}
  }
  function tone(hz,when,length,volume,type='sine',endHz=hz){
   const gain=context.createGain(),voice=remember(context.createOscillator(),gain);voice.effect=true;voice.gainNode=gain;voice.type=type;
   voice.frequency.setValueAtTime(hz,when);voice.frequency.exponentialRampToValueAtTime(endHz,when+length);
   gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(volume,when+.005);gain.gain.exponentialRampToValueAtTime(.0001,when+length);
   voice.connect(gain);gain.connect(effectGain);voice.start(when);voice.stop(when+length+.01);
  }
  async function effect(kind){
   if(!settings.enabled||!settings.effects||hidden)return;
   const token=generation,bet=kind==='up'||kind==='down',request=bet?++betRequest:0;
   if(!await unlock()||token!==generation||!settings.enabled||!settings.effects||hidden||(bet&&request!==betRequest))return;
   const now=context.currentTime;
   if(bet){
    if(betSource)stopVoice(betSource);
    betSource=remember(context.createBufferSource());betSource.effect=true;betSource.buffer=buffers.bet;betSource.connect(effectGain);betSource.start();
   }else if(kind==='reel'){
    tone(180,now,.06,.24,'triangle',65);tone(760,now,.022,.055);
   }else if(kind==='win'){
    [72,76,79,84].forEach((pitch,i)=>tone(440*Math.pow(2,(pitch-69)/12),now+i*.085,.22,.13,'triangle'));
   }
  }
  function configure(changes){
   for(const key of ['enabled','music','effects'])if(typeof changes[key]==='boolean')settings[key]=changes[key];
   for(const key of ['musicVolume','effectsVolume'])if(Number.isFinite(changes[key]))settings[key]=Math.max(0,Math.min(1,changes[key]));
   if(!settings.enabled||!settings.effects)generation++;
   apply();return state();
  }
  return {state,configure,unlock,effect,
   activate(value){mode=value;apply();return unlock();},
   startSpin(){mode='active';rolling=true;reels=5;generation++;void unlock();apply();},
   reelStop(){reels=Math.max(0,reels-1);if(rollSource)rollSource.gainNode.gain.setValueAtTime(.23*(reels/5),context.currentTime);void effect('reel');},
   endSpin(){rolling=false;stopRoll();},
   reset(){mode=null;rolling=false;generation++;apply();for(const voice of [...voices])stopVoice(voice);betSource=null;offsets.active=0;offsets.calm=0;},
   setHidden(value){hidden=value;if(hidden)generation++;apply();if(hidden){if(context?.state==='running')void context.suspend().catch(()=>{});}else if(unlocked)void unlock();},
   destroy(){rolling=false;settings.enabled=false;generation++;apply();if(context)void context.close().catch(()=>{});}
  };
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JokerAudio=api;
})(globalThis);
