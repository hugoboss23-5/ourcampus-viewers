// 2026-10-03. Actual consecutive tour-frame intervals, including long stalls.
// This records animation callbacks, not GPU time or proof of displayed pixels.
export function createTourFrameTiming({maxSamples=60000,publishIntervalMs=1000}={}){
 if(!Number.isInteger(maxSamples)||maxSamples<1||!Number.isFinite(publishIntervalMs)||publishIntervalMs<0)throw Error('Invalid frame timing bounds');
 let active=false,previous=null,chapter=null,samples=[],total=0,elapsed=0,peak=0,slow100=0,slow33=0,lastPublish=-Infinity,run=0,state={run:0,active:false,frames:0};
 function publish(now){
  const values=samples.map(s=>s.ms).sort((a,b)=>a-b),n=values.length;
  const percentile=p=>n?values[Math.ceil(p*n)-1]:null;
  state={run,active,frames:total,retainedFrames:n,complete:total===n,elapsedMs:elapsed,callbackFps:elapsed?1000*total/elapsed:null,medianMs:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),percentileScope:total===n?'full run':'retained frames',maxMs:total?peak:null,over100Ms:slow100,over33Ms:slow33,last:samples.at(-1)||null};
  lastPublish=now;
 }
 function observe(now,{tourActive=false,chapterId=null}={}){
  if(!Number.isFinite(now))throw Error('Frame timestamp must be finite');
  if(tourActive&&!active){active=true;run++;previous=null;samples=[];total=0;elapsed=0;peak=0;slow100=0;slow33=0;lastPublish=-Infinity;}
  if(!tourActive){if(active){active=false;previous=null;publish(now);}return;}
  if(previous!==null){
   const ms=now-previous;if(ms<=0)throw Error('Frame timestamps must increase');
   samples.push({ms,chapter});if(samples.length>maxSamples)samples.shift();total++;elapsed+=ms;peak=Math.max(peak,ms);if(ms>100)slow100++;if(ms>1000/30)slow33++;
  }
  previous=now;chapter=typeof chapterId==='string'?chapterId:null;
  if(now-lastPublish>=publishIntervalMs)publish(now);
 }
 return {observe,get state(){return state;},clear(){active=false;previous=null;chapter=null;samples=[];total=0;elapsed=0;peak=0;slow100=0;slow33=0;lastPublish=-Infinity;state={run,active:false,frames:0};}};
}
