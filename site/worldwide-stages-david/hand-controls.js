/** 2026-10-03. Installed Hive Cockpit gestures, local camera inference only.
 * Source: /Applications/Hive Cockpit.app/Contents/Resources/app.asar
 * app/index.html SHA b760dbb8ab82f0b7b9b8e35114bc75ec9758e769a8f16c1ed0e611ade182b638.
 * The newer cockpit project has different gestures; those are not used here.
 */
export function createCockpitGestureEngine(emit) {
  let lastOne = null, lastTwo = null;
  function pinchOf(lm) {
    const span = Math.hypot(lm[0].x-lm[9].x, lm[0].y-lm[9].y) || 0.001;
    const grip = Math.hypot(lm[4].x-lm[8].x, lm[4].y-lm[8].y) / span;
    return {on:grip < 0.42,x:1-(lm[4].x+lm[8].x)/2,y:(lm[4].y+lm[8].y)/2,grip};
  }
  return {
    reset() { lastOne = lastTwo = null; },
    process(list) {
      // Exactly the installed cockpit: immediate single-pinch drag; two-pinch spread.
      const pinches = list.map(pinchOf).filter(p=>p.on);
      if (pinches.length >= 2) {
        const d = Math.hypot(pinches[0].x-pinches[1].x,pinches[0].y-pinches[1].y);
        if (lastTwo != null && Math.abs(d-lastTwo) > 0.004) {
          emit({type:'zoom',factor:1-(d-lastTwo)*2.4});
        }
        lastTwo=d;lastOne=null;
        emit({type:'status',phase:'zoom',text:'Spread two pinched hands to zoom',hands:list.length,pinches:pinches.length});
      } else if (pinches.length === 1) {
        const p=pinches[0];
        if (lastOne) {
          const dx=p.x-lastOne.x,dy=p.y-lastOne.y;
          emit({type:'rotate',dx,dy,yawDelta:-dx*4.0,pitchDelta:-dy*3.0,minPolarAngle:0.14,maxPolarAngle:Math.PI-0.14});
        }
        lastOne=p;lastTwo=null;
        emit({type:'status',phase:'rotate',text:'Pinch and drag to turn',hands:list.length,pinches:1});
      } else {
        lastOne=lastTwo=null;
        emit({type:'status',phase:'ready',text:list.length?'Pinch to grab':'Show a hand to the camera',hands:list.length,pinches:0});
      }
    }
  };
}

/** Explicit user start. Local classic worker inference; installed gesture math stays main.
 * One credit / one frame, including asynchronous bitmap creation. No main-thread inference.
 */
export function createHandControls({video:providedVideo}={}) {
  const listeners=new Set();let video=providedVideo,ownedVideo=false,session=null,epoch=0;
  let videoCallback=0,animationCallback=0,running=false,phase='off',stage='',delegate='';
  let detections=0,lastDetectMs=0,lastWorkerTotalMs=0,lastVideoTime=-1,lastSentAt=-Infinity;
  const statusTexts={module:'Loading hand tracking code…',runtime:'Preparing local hand tracking…',
    'model-gpu':'Loading the hand model…','model-cpu':'Preparing the hand model fallback…',
    'camera-request':'Waiting for camera access…','camera-preview':'Starting camera preview…'};
  function emit(event){if(event.type==='status'){phase=event.phase;stage=event.stage||'';}for(const fn of listeners)fn(event);}
  const engine=createCockpitGestureEngine(emit);
  function current(s){return session===s&&s.epoch===epoch&&!s.stopping;}
  function loading(name){emit({type:'status',phase:'loading',stage:name,text:statusTexts[name]||'Preparing hand controls…'});}
  function cancelLoop(){if(videoCallback&&video?.cancelVideoFrameCallback)video.cancelVideoFrameCallback(videoCallback);if(animationCallback)cancelAnimationFrame(animationCallback);videoCallback=animationCallback=0;}
  function releaseStream(){if(video?.srcObject){video.srcObject.getTracks().forEach(t=>t.stop());video.srcObject=null;}}
  function closeBitmap(b){if(b&&typeof b.close==='function')b.close();}
  function retire(s){
    if(!s||s.stopping)return;s.stopping=true;
    clearTimeout(s.startupTimer);clearTimeout(s.frameTimer);
    if(s.cameraStream){s.cameraStream.getTracks().forEach(t=>t.stop());s.cameraStream=null;}
    if(!s.readySettled){s.readySettled=true;s.rejectReady(new Error('Hand tracking start canceled'));}
    const terminate=()=>{clearTimeout(s.stopTimer);s.worker.terminate();s.terminated=true;};
    s.terminate=terminate;s.stopTimer=setTimeout(terminate,2000);
    try{s.worker.postMessage({type:'stop',sessionId:s.id});}catch(error){terminate();}
  }
  function stop(){
    const old=session;epoch++;session=null;running=false;cancelLoop();releaseStream();engine.reset();
    retire(old);lastVideoTime=-1;lastSentAt=-Infinity;
    if(ownedVideo&&video){video.remove();video=null;ownedVideo=false;}
    emit({type:'status',phase:'off',text:'Hand controls off',hands:0,pinches:0});
  }
  function fail(s,error){
    if(!current(s))return;stop();emit({type:'status',phase:'error',stage:'worker',text:'Hand tracking stopped. Try again.',error:String(error.message||error),backend:'worker'});
  }
  function timeout(promise,ms,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),ms);})]).finally(()=>clearTimeout(timer));}
  function receive(s,event){
    const data=event.data||{};
    if(s.stopping){closeBitmap(data.imageBitmap);if(data.type==='stopped'&&data.sessionId===s.id)s.terminate();return;}
    if(!current(s)||data.sessionId!==s.id){closeBitmap(data.imageBitmap);return;}
    if(data.type==='status'){if(typeof data.stage==='string')loading(data.stage);return;}
    if(data.type==='ready'){
      if(s.readySettled||data.nextFrameId!==1||!['GPU','CPU'].includes(data.delegate)){fail(s,new Error('Invalid worker startup response'));return;}
      clearTimeout(s.startupTimer);s.readySettled=true;s.nextFrameId=1;delegate=data.delegate;s.resolveReady();return;
    }
    if(data.type==='result'){
      const f=s.inFlight;
      if(!f||data.frameId!==f.frameId||data.nextFrameId!==f.frameId+1||data.timestamp!==f.timestamp){closeBitmap(data.imageBitmap);fail(s,new Error('Invalid hand-tracking frame credit'));return;}
      if(!Array.isArray(data.landmarks)||!data.landmarks.every(hand=>Array.isArray(hand)&&hand.length===21&&hand.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))){fail(s,new Error('Invalid hand landmarks'));return;}
      if(!data.timing||!Number.isFinite(data.timing.detectMs)||!Number.isFinite(data.timing.workerTotalMs)){fail(s,new Error('Invalid hand-tracking timing'));return;}
      clearTimeout(s.frameTimer);s.inFlight=null;s.nextFrameId=data.nextFrameId;
      lastDetectMs=data.timing.detectMs;lastWorkerTotalMs=data.timing.workerTotalMs;detections++;
      if(running)engine.process(data.landmarks);return;
    }
    if(data.type==='error'||data.type==='dropped'){closeBitmap(data.imageBitmap);fail(s,new Error(data.error||data.reason||'Hand tracking worker rejected a frame'));return;}
    closeBitmap(data.imageBitmap);fail(s,new Error('Unexpected hand-tracking worker message'));
  }
  async function submit(s,t){
    if(!current(s)||!running||s.inFlight||s.nextFrameId===null)return;
    const f={frameId:s.nextFrameId,timestamp:t};s.inFlight=f;s.nextFrameId=null;
    // The latch covers bitmap creation itself, not just worker inference.
    s.frameTimer=setTimeout(()=>fail(s,new Error('Hand tracking frame timed out')),10000);
    let bitmap;
    try{
      bitmap=await createImageBitmap(video);
      if(!current(s)||!running||s.inFlight!==f){closeBitmap(bitmap);return;}
      s.worker.postMessage({type:'frame',sessionId:s.id,frameId:f.frameId,timestamp:t,imageBitmap:bitmap},[bitmap]);
      bitmap=null; // Worker now owns and closes the transferred frame.
    }catch(error){closeBitmap(bitmap);fail(s,error);}
  }
  function pump(s){
    if(!current(s)||!running)return;
    const frame=t=>{
      videoCallback=animationCallback=0;if(!current(s)||!running)return;
      if(video.readyState>=2&&video.currentTime!==lastVideoTime&&t-lastSentAt>=1000/30&&!s.inFlight&&s.nextFrameId!==null){lastVideoTime=video.currentTime;lastSentAt=t;void submit(s,t);}
      pump(s);
    };
    if(video.requestVideoFrameCallback)videoCallback=video.requestVideoFrameCallback(frame);else animationCallback=requestAnimationFrame(frame);
  }
  async function start(){
    if(session)return session.startPromise;
    const token=++epoch;loading('module');
    let worker;
    try{worker=new Worker(new URL('./hand-tracking-worker.js',import.meta.url));}
    catch(error){emit({type:'status',phase:'error',text:'Hand controls could not start.',error:String(error.message||error)});throw error;}
    const s={id:'campus-hands-'+token+'-'+Date.now(),epoch:token,worker,nextFrameId:null,inFlight:null,stopping:false,readySettled:false};session=s;
    s.ready=new Promise((resolve,reject)=>{s.resolveReady=resolve;s.rejectReady=reject;});
    s.startupTimer=setTimeout(()=>fail(s,new Error('Hand model loading timed out. Try again.')),60000);
    worker.onmessage=e=>receive(s,e);worker.onerror=e=>fail(s,new Error(e.message||'Hand-tracking worker failed'));worker.onmessageerror=()=>fail(s,new Error('Hand-tracking worker message could not be read'));
    s.startPromise=(async()=>{
      let acquired=null,startingVideo=null;
      try{
        worker.postMessage({type:'init',sessionId:s.id});await s.ready;if(!current(s))return;
        loading('camera-request');
        const request=navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user',frameRate:{ideal:30,max:30}},audio:false});
        // A permission response arriving after cancellation belongs only to A.
        request.then(stream=>{if(current(s))s.cameraStream=stream;else stream.getTracks().forEach(t=>t.stop());},()=>{});
        acquired=await timeout(request,60000,'Camera access is still pending. Allow access and try again.');if(!current(s)){acquired.getTracks().forEach(t=>t.stop());return;}
        if(!video){video=document.createElement('video');video.hidden=true;document.body.appendChild(video);ownedVideo=true;}
        startingVideo=video;loading('camera-preview');startingVideo.muted=true;startingVideo.playsInline=true;startingVideo.srcObject=acquired;
        await timeout(startingVideo.play(),15000,'Camera preview did not start. Try again.');
        if(!current(s)){acquired.getTracks().forEach(t=>t.stop());if(startingVideo.srcObject===acquired)startingVideo.srcObject=null;return;}
        running=true;engine.reset();detections=0;lastDetectMs=lastWorkerTotalMs=0;lastVideoTime=-1;lastSentAt=-Infinity;
        emit({type:'status',phase:'ready',text:'Pinch and drag to turn',hands:0,pinches:0,backend:'worker',delegate});pump(s);
      }catch(error){
        if(acquired){acquired.getTracks().forEach(t=>t.stop());if(startingVideo?.srcObject===acquired)startingVideo.srcObject=null;}
        if(!current(s))return;
        stop();emit({type:'status',phase:'error',text:error.name==='NotAllowedError'?'Allow camera access to use hand controls.':'Hand controls could not start. Try again.',error:String(error.message||error),backend:'worker'});throw error;
      }
    })();return s.startPromise;
  }
  return {start,stop,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},get state(){return {running,phase,stage,backend:'worker',delegate,detections,lastDetectMs,lastWorkerTotalMs,frameInFlight:!!session?.inFlight,nextFrameId:session?.nextFrameId??null};}};
}
