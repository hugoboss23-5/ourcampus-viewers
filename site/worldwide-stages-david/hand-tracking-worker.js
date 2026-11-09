/** 2026-10-03. Source preparation only. Classic dedicated worker, local inference.
 * Create with new Worker(url), WITHOUT {type:'module'}: the installed classic
 * WASM loader publishes ModuleFactory through importScripts. The task bundle
 * itself remains the existing local .mjs, loaded with dynamic import.
 * Main thread owns camera consent/stream, one-frame latch and gesture engine.
 */
(() => {
  'use strict';
  const WIDTH=640, HEIGHT=480;
  const assetBase=new URL('./vendor/hand-tracking/', self.location.href);
  let phase='idle', sessionId=null, generation=0, model=null, startup=null;
  let inputCanvas=null, inputContext=null, delegate='', credit=1, lastTimestamp=-Infinity;
  let stopPromise=null;
  const message=(type,fields={})=>self.postMessage({type,sessionId,...fields});
  const errorText=error=>String(error?.message||error);
  function releaseModel(instance) { if(instance)instance.close(); }
  function closeBitmap(bitmap) { if(bitmap&&typeof bitmap.close==='function')bitmap.close(); }
  function loading(stage) { if(phase==='loading')message('status',{phase,stage}); }

  async function initialize(id) {
    if(phase!=='idle'){message('error',{stage:'protocol',fatal:false,error:'Worker already initialized'});return;}
    if(!(typeof id==='string'&&id.length)){message('error',{stage:'protocol',fatal:false,error:'Nonempty sessionId required'});return;}
    sessionId=id;phase='loading';const token=++generation;
    startup=(async()=>{
      if(typeof importScripts!=='function')throw new Error('Classic worker required');
      if(typeof OffscreenCanvas!=='function')throw new Error('OffscreenCanvas unavailable');
      loading('module');
      const vision=await import(new URL('vision_bundle.mjs',assetBase).href);
      if(token!==generation)return;
      loading('runtime');
      const files=await vision.FilesetResolver.forVisionTasks(new URL('wasm',assetBase).href);
      if(token!==generation)return;
      const options=kind=>({canvas:new OffscreenCanvas(WIDTH,HEIGHT),baseOptions:{modelAssetPath:new URL('hand_landmarker.task',assetBase).href,delegate:kind},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:0.5,minHandPresenceConfidence:0.5,minTrackingConfidence:0.5});
      let instance;
      loading('model-gpu');
      try { instance=await vision.HandLandmarker.createFromOptions(files,options('GPU'));delegate='GPU'; }
      catch(error) {
        if(token!==generation)return;
        loading('model-cpu');
        instance=await vision.HandLandmarker.createFromOptions(files,options('CPU'));delegate='CPU';
      }
      if(token!==generation){releaseModel(instance);return;}
      model=instance;
      inputCanvas=new OffscreenCanvas(WIDTH,HEIGHT);
      inputContext=inputCanvas.getContext('2d');
      if(!inputContext)throw new Error('OffscreenCanvas 2D context unavailable');
      phase='ready';
      message('ready',{phase,delegate,width:WIDTH,height:HEIGHT,nextFrameId:credit});
    })();
    try { await startup; }
    catch(error) {
      if(token!==generation)return;
      message('error',{stage:'initialize',fatal:true,error:errorText(error)});
      void stop('initialize-error');
    }
  }

  function frame(data) {
    const bitmap=data.imageBitmap;
    try {
      if(data.sessionId!==sessionId||phase!=='ready'||data.frameId!==credit){
        message('dropped',{frameId:data.frameId,reason:'not-ready-or-stale',nextFrameId:credit});return;
      }
      if(typeof ImageBitmap!=='function'||!(bitmap instanceof ImageBitmap))throw new Error('Transferred ImageBitmap required');
      if(!Number.isFinite(data.timestamp)||data.timestamp<=lastTimestamp){
        message('dropped',{frameId:data.frameId,reason:'nonmonotonic-timestamp',nextFrameId:credit});return;
      }
      phase='processing';
      const began=performance.now();
      inputContext.drawImage(bitmap,0,0,WIDTH,HEIGHT);
      const detectStarted=performance.now();
      const result=model.detectForVideo(inputCanvas,data.timestamp);
      const detectFinished=performance.now();
      lastTimestamp=data.timestamp;credit++;phase='ready';
      message('result',{frameId:data.frameId,nextFrameId:credit,timestamp:data.timestamp,delegate,landmarks:result.landmarks||[],worldLandmarks:result.worldLandmarks||[],handedness:result.handedness||result.handednesses||[],timing:{drawMs:detectStarted-began,detectMs:detectFinished-detectStarted,workerTotalMs:detectFinished-began},sourceWidth:bitmap.width,sourceHeight:bitmap.height,width:WIDTH,height:HEIGHT});
    } catch(error) {
      message('error',{stage:'frame',fatal:true,frameId:data.frameId,error:errorText(error)});
      void stop('frame-error');
    } finally { closeBitmap(bitmap); }
  }

  function stop(reason='requested') {
    if(stopPromise)return stopPromise;
    phase='stopping';generation++;
    stopPromise=(async()=>{
      try { await startup; } catch(error) { /* initialization failure already reported */ }
      try { releaseModel(model); }
      catch(error) { message('error',{stage:'close',fatal:true,error:errorText(error)}); }
      finally {
        model=null;inputContext=null;inputCanvas=null;phase='stopped';
        try { message('stopped',{phase,reason}); } finally { self.close(); }
      }
    })();
    return stopPromise;
  }

  self.onmessage=event=>{
    const data=event.data||{};
    if(data.type==='frame'){frame(data);return;}
    if(data.type==='init'){void initialize(data.sessionId);return;}
    if(data.type==='stop'){void stop();return;}
    closeBitmap(data.imageBitmap);
    message('error',{stage:'protocol',fatal:false,error:'Unknown worker message'});
  };
})();
