/** 2026-10-04. Opt-in fixed-view delivered-frame check. No scene changes. */
export function quantile(values, fraction) {
 if (!values.length) return null;
 const sorted=[...values].sort((a,b)=>a-b), index=(sorted.length-1)*fraction, lo=Math.floor(index);
 return sorted[lo]+(sorted[Math.ceil(index)]-sorted[lo])*(index-lo);
}
export function createFrameCollector({start, fingerprint, warmupMs=1000, durationMs=12000}) {
 let previous=null, first=null, last=null; const intervals=[], reasons=new Set();
 return {
  observe(now,{fingerprint: current,hidden=false}={}) {
   if(hidden) reasons.add('Tab was hidden');
   if(current!==fingerprint) reasons.add('Camera, viewport, layers, lighting or model changed');
   if(now>=start+warmupMs){
    if(previous!==null){intervals.push(now-previous);last=now;}else first=now;
    previous=now;
   }
   return now-start>=durationMs;
  },
  invalidate(reason){reasons.add(reason);},
  result(now){const span=first!==null&&last!==null?last-first:0;return {
   valid:reasons.size===0&&intervals.length>0&&now-start>=durationMs,reasons:[...reasons,...(now-start<durationMs?['Check ended before 12 seconds']:[])],sampleCount:intervals.length,
   elapsedMs:now-start,measuredSpanMs:span,warmupMs,durationTargetMs:durationMs,
   medianFrameMs:quantile(intervals,.5),p95FrameMs:quantile(intervals,.95),p99FrameMs:quantile(intervals,.99),maxFrameMs:intervals.length?Math.max(...intervals):null,
   over50Ms:intervals.filter(x=>x>50).length,over100Ms:intervals.filter(x=>x>100).length,
   approximateDeliveredFPS:span>0?intervals.length*1000/span:null,frameIntervalsMs:[...intervals],
   fpsMeaning:'Delivered animation-frame intervals during this fixed view; not a hardware guarantee or GPU completion measurement.'
  };}
 };
}
export function fixedViewSignature(s) {
 // Ignore sub-micrometre numeric noise, preserving original receipt snapshots.
 const normalize=value=>{
  if(typeof value==='number'&&Number.isFinite(value))return Math.round(value*1e6)/1e6;
  if(Array.isArray(value))return value.map(normalize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,normalize(v)]));
  return value;
 };
 // Dynamic counters stay outside the caller's authoritative fixed-view fields.
 const fixed=s.fixedView ?? Object.fromEntries(['option','model','modelURL','camera','target','viewport','width','height','pixelRatio','roofs','systems','roofsVisible','systemsVisible','lighting','layers'].filter(k=>k in s).map(k=>[k,s[k]]));
 return JSON.stringify(normalize(fixed));
}
export function createPerformanceCheck({getSnapshot,requestRender,onStart=()=>{},onStop=()=>{}}) {
 if(typeof getSnapshot!=='function'||typeof requestRender!=='function')throw Error('Performance check needs snapshots and rendering');
 let collector=null,initial=null,receipt=null,disposed=false;
 const panel=document.createElement('section');panel.setAttribute('aria-label','Performance check');
 panel.style.cssText='position:fixed;left:16px;top:80px;z-index:20;width:300px;max-height:70vh;overflow:auto;padding:12px;border:1px solid #1B7FA6;border-radius:10px;background:#05070Dee;color:#7FE9FF;font:12px ui-monospace,monospace;box-shadow:0 0 18px #2FD8FF22;';
 const title=document.createElement('strong');title.textContent='FIXED VIEW PERFORMANCE';
 const status=document.createElement('p');status.textContent='Keep this view still. Run a 12 second check.';
 const startButton=document.createElement('button');startButton.textContent='Run check';
 const download=document.createElement('button');download.textContent='Save receipt';download.disabled=true;
 for(const b of [startButton,download]) b.style.cssText='padding:7px;margin:0 6px 6px 0;color:#7FE9FF;background:#12202E;border:1px solid #1B7FA6;border-radius:5px;cursor:pointer';
 const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Measurement details';pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px';details.append(summary,pre);panel.append(title,status,startButton,download,details);document.body.append(panel);
 const snap=()=>JSON.parse(JSON.stringify(getSnapshot()));
 function finish(reason){
  if(!collector)return receipt;
  if(reason)collector.invalidate(reason);
  const result=collector.result(performance.now());collector=null;
  receipt={date:new Date().toISOString(),check:'fixed-view-delivered-frames-v1',...result,initialSnapshot:initial,finalSnapshot:snap()};
  startButton.disabled=false;download.disabled=false;
  const number=v=>v===null?'unavailable':v.toFixed(1);
  status.textContent=`${result.valid?'Complete':'Invalid'} · ${result.sampleCount} intervals · ${number(result.elapsedMs/1000)}s elapsed. Median ${number(result.medianFrameMs)}ms; p95 ${number(result.p95FrameMs)}ms; p99 ${number(result.p99FrameMs)}ms; max ${number(result.maxFrameMs)}ms. >50ms: ${result.over50Ms}; >100ms: ${result.over100Ms}. Approx. delivered FPS: ${number(result.approximateDeliveredFPS)}.${result.reasons.length?' '+result.reasons.join('; '):''}`;
  pre.textContent=JSON.stringify(receipt,null,2);onStop(receipt);return receipt;
 }
 const hidden=()=>{if(collector&&document.hidden)finish('Tab was hidden');};document.addEventListener('visibilitychange',hidden);
 startButton.onclick=()=>{
  if(disposed||collector)return;
  onStart();initial=snap();collector=createFrameCollector({start:performance.now(),fingerprint:fixedViewSignature(initial)});
  startButton.disabled=true;download.disabled=true;status.textContent='Checking this fixed view for 12 seconds. Keep camera and controls still.';pre.textContent='';
  if(document.hidden)finish('Tab was hidden');else requestRender();
 };
 download.onclick=()=>{if(!receipt)return;const url=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='campus-performance-'+receipt.date.replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return {
  observe(now,metadata={}){if(!collector)return;const s=snap();if(collector.observe(now,{fingerprint:fixedViewSignature(s),hidden:document.hidden||metadata.hidden}))finish();},
  get active(){return !!collector;},finish,
  dispose(){if(disposed)return;finish('Check disposed before completion');disposed=true;document.removeEventListener('visibilitychange',hidden);panel.remove();}
 };
}
