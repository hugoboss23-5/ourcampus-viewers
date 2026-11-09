/** 2026-10-03. Optional asynchronous GPU measurements, never a frame-rate guess.
 * Khronos EXT_disjoint_timer_query_webgl2: invalid/disjoint samples are discarded.
 * Does not change rendering, geometry, resolution, materials, or shadow settings.
 */
export function createRenderTiming(gl,{intervalMs=400,maxPending=4,maxSamples=120}={}){
 const ext=gl?.getExtension?.('EXT_disjoint_timer_query_webgl2');
 const supported=!!ext&&typeof gl.createQuery==='function'&&typeof gl.getQueryParameter==='function';
 if(!Number.isFinite(intervalMs)||intervalMs<0||!Number.isInteger(maxPending)||maxPending<1||!Number.isInteger(maxSamples)||maxSamples<1)throw Error('Invalid render timing bounds.');
 let enabled=false,active=null,pending=[],samples=[],lastAt=-Infinity,disposed=false;
 const state={supported,enabled:false,status:supported?'Ready':'GPU timer unavailable',samples:0,discarded:0,last:null};
 function release(q){gl.deleteQuery(q);}
 function discardPending(){for(const q of pending)release(q.query);state.discarded+=pending.length;pending=[];}
 function poll(){
  if(!supported||disposed)return;
  if(gl.isContextLost?.()){discardPending();state.status='Graphics context lost';return;}
  if(gl.getParameter(ext.GPU_DISJOINT_EXT)){discardPending();state.status='GPU clock reset; samples discarded';return;}
  while(pending.length){
   const entry=pending[0];
   if(!gl.getQueryParameter(entry.query,gl.QUERY_RESULT_AVAILABLE))break;
   const ns=gl.getQueryParameter(entry.query,gl.QUERY_RESULT);pending.shift();release(entry.query);
   if(!Number.isFinite(ns)||ns<0){state.discarded++;continue;}
   const sample={...entry.metadata,gpuMs:ns/1e6,submittedAt:entry.at};samples.push(sample);
   if(samples.length>maxSamples)samples.shift();state.samples=samples.length;state.last=sample;state.status='Measured GPU render time';
  }
 }
 function begin(metadata={},now=performance.now()){
  poll();
  if(disposed||!supported||!enabled||active||pending.length>=maxPending||now-lastAt<intervalMs||gl.isContextLost?.())return false;
  // Cooperate with an existing profiler; do not nest TIME_ELAPSED queries.
  if(gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))return false;
  if(gl.getParameter(ext.GPU_DISJOINT_EXT))return false;
  const query=gl.createQuery();if(!query)return false;
  active={query,at:now,metadata:JSON.parse(JSON.stringify(metadata))};
  gl.beginQuery(ext.TIME_ELAPSED_EXT,query);lastAt=now;return true;
 }
 function end(){
  if(!active)return;
  const entry=active;active=null;
  if(gl.isContextLost?.()){release(entry.query);state.discarded++;return;}
  gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(entry);
 }
 function setEnabled(value){if(enabled===!!value)return;enabled=!!value;state.enabled=enabled;lastAt=-Infinity;}
 function clear(){
  if(active)end();discardPending();samples=[];state.samples=0;state.last=null;lastAt=-Infinity;
  state.status=supported?'Ready':'GPU timer unavailable';
 }
 function dispose(){if(disposed)return;clear();disposed=true;enabled=false;state.enabled=false;}
 return {begin,end,poll,setEnabled,clear,dispose,state,get samples(){return samples.map(s=>structuredClone(s));}};
}
