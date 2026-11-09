// 2026-10-04. Saved geometry only; native coordinates use Z up.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { createHillsideWalk } from './hillside-walk.js';

const $=id=>document.getElementById(id);
const point=v=>new THREE.Vector3(v[0],v[2],-v[1]);
let renderer,scene,camera,controls,model,configuration,sun,walk,view='arrival';
const doors=[];
let frame=0,frameKind='raf',transition=null,saving=false,loaded=false,toastTimer,performanceCheck=null;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const state={date:'2026-10-04',loaded:false,errors:[],frames:0};
window.hillsideReview=state;
window.addEventListener('error',event=>{state.errors.push(event.message);$('load-title').textContent='3D rendering error';$('load-detail').textContent=event.message;$('retry').hidden=false;$('loading').hidden=false;});
function tell(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function cancelFrame(){if(frame){if(frameKind==='timer')clearTimeout(frame);else cancelAnimationFrame(frame);frame=0;}}
// Safari may mark an embedded preview hidden while its controls remain visible.
// Paint requested changes once even there; idle views do not run a timer loop.
function request(){if(frame||saving)return;frameKind=document.hidden?'timer':'raf';frame=frameKind==='timer'?setTimeout(()=>draw(performance.now()),0):requestAnimationFrame(draw);}
function draw(now){
  frame=0;
  if(!loaded||saving)return;
  if(transition){
    const t=Math.min(1,(now-transition.start)/900),s=t*t*(3-2*t);
    camera.position.lerpVectors(transition.from,transition.to,s);controls.target.lerpVectors(transition.fromTarget,transition.target,s);
    if(t===1){transition=null;controls.enabled=true;}
  }
  const walking=walk?.update(now)||false;
  const changing=walk?.active?false:controls.update();
  try{renderer.render(scene,camera);}catch(error){state.errors.push(String(error));$('load-title').textContent='3D rendering error';$('load-detail').textContent=String(error);$('retry').hidden=false;$('loading').hidden=false;return;}state.frames++;state.renderCalls=renderer.info.render.calls;state.triangles=renderer.info.render.triangles;
  state.camera=camera.position.toArray();state.target=controls.target.toArray();state.walk=walk?.snapshot||null;
  performanceCheck?.observe(now);
  if(transition||changing||walking||performanceCheck?.active)request();
}
function projection(){
  const preset=configuration?.views?.[view];
  if(walk?.active){camera.fov=60;camera.updateProjectionMatrix();return;}
  if(preset?.lensMm){
    // Native camera uses a horizontal 36mm sensor. Keep its framing on wide
    // screens; include both portals when the viewport is tall.
    const aspect=Math.min(camera.aspect,preset.referenceAspect||1.6);
    camera.fov=THREE.MathUtils.radToDeg(2*Math.atan((preset.sensorWidthMm||36)/(2*preset.lensMm*aspect)));
  }else camera.fov=preset?.fov||45;
  camera.updateProjectionMatrix();
}
function resize(){
  if(!renderer||saving)return;
  const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;projection();request();
}
function sectionMode(on){
  model.traverse(o=>{
    if(o.userData.section_hide===true)o.visible=!on;
  });
  renderer.shadowMap.needsUpdate=true;
}
function setDoors(open){for(const d of doors)d.object.position.copy(d.original).addScaledVector(d.offset,open?1:0);model.updateMatrixWorld(true);renderer.shadowMap.needsUpdate=true;state.doorsOpen=open;request();}
function go(name,instant=false){
  if(name==='interior'){if(walk?.active){go('arrival',true);return;}transition=null;sectionMode(false);walk?.enter('A1');return;}
  if(walk?.active)walk.stop();
  setDoors(false);
  const preset=configuration.views[name];if(!preset)return;
  view=name;sectionMode(name==='section');
  const to=point(preset.position),target=point(preset.target);
  projection();
  // Arrival looks slightly upward. Preserve the actual eye-height preset.
  const nativePolar=new THREE.Spherical().setFromVector3(to.clone().sub(target)).phi;
  controls.maxPolarAngle=Math.max(Math.PI*.51,nativePolar+.015);
  if(instant||reducedMotion||document.hidden){transition=null;camera.position.copy(to);controls.target.copy(target);controls.enabled=true;controls.update();}
  else{transition={from:camera.position.clone(),fromTarget:controls.target.clone(),to,target,start:performance.now()};controls.enabled=false;}
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
  $('caption').textContent=preset.caption||'Two halls · representative design study';state.view=name;request();
}
async function saveImage(){
  if(!loaded||saving||transition)return;
  saving=true;controls.enabled=false;$('capture').disabled=true;
  cancelFrame();
  const size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio();
  const limit=Math.min(3840,renderer.capabilities.maxTextureSize),scale=limit/Math.max(size.x,size.y);
  const w=Math.round(size.x*scale),h=Math.round(size.y*scale);
  try{
    renderer.setPixelRatio(1);renderer.setSize(w,h,false);renderer.render(scene,camera);
    const blob=await new Promise((resolve,reject)=>renderer.domElement.toBlob(b=>b?resolve(b):reject(Error('Image capture failed')),'image/png'));
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Hillside halls - ${view} - ${new Date().toISOString().replace(/[:.]/g,'-')}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    state.lastCapture={width:w,height:h,bytes:blob.size,view};tell('Image saved');
  }catch(error){state.errors.push(String(error));tell('The image could not be saved. Please try again.');}
  finally{renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);controls.enabled=!walk?.active;saving=false;$('capture').disabled=false;resize();}
}
async function boot(){
  try{
    const response=await fetch('./assets/hillside-data/view-config.json');if(!response.ok)throw Error('Model configuration unavailable');configuration=await response.json();
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=configuration.exposure??1;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
    $('viewport').append(renderer.domElement);renderer.domElement.setAttribute('aria-label','Drag to explore the hillside model; scroll to zoom');
    scene=new THREE.Scene();scene.background=new THREE.Color('#d8e1df');
    camera=new THREE.PerspectiveCamera(45,1,.15,2500);controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;controls.dampingFactor=.10;controls.minDistance=2;controls.maxDistance=310;controls.addEventListener('change',request);
    controls.addEventListener('start',()=>{transition=null;});resize();
    const env=await new HDRLoader().loadAsync('./assets/kloppenheim_06_puresky.hdr');env.mapping=THREE.EquirectangularReflectionMapping;
    scene.environment=env;scene.environmentIntensity=configuration.environmentIntensity??.8;scene.background=env;scene.backgroundBlurriness=.03;
    const light=configuration.sun||{position:[-60,-70,105],target:[64,45,0],intensity:2.1};
    sun=new THREE.DirectionalLight(0xfff0db,light.intensity);sun.position.copy(point(light.position));sun.target.position.copy(point(light.target));sun.castShadow=true;
    sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-105,right:105,top:100,bottom:-100,near:1,far:350});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.00003;sun.shadow.normalBias=.025;scene.add(sun,sun.target);
    const gltf=await new GLTFLoader().loadAsync(configuration.model,p=>{if(p.total){$('progress').max=p.total;$('progress').value=p.loaded;$('load-detail').textContent=`Loading model · ${Math.round(p.loaded/p.total*100)}%`;}});
    model=gltf.scene;scene.add(model);
    // Native lights are illustration proxies. Normalize the exported radiometric
    // values for the browser's lighting/exposure pipeline, not a lux simulation.
    model.traverse(o=>{if(o.isPointLight||o.isSpotLight)o.intensity*=String(o.userData.fixture_zone||'').endsWith('-interior')?(configuration.interiorLightScale??.003):(configuration.localLightScale??.01);});
    let meshes=0,instances=0;model.traverse(o=>{if(o.isMesh){meshes++;instances+=o.isInstancedMesh?o.count:1;o.castShadow=true;o.receiveShadow=true;const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){for(const key of ['map','normalMap','roughnessMap'])if(m[key])m[key].anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}}});
    model.updateMatrixWorld(true);
    model.traverse(o=>{if(o.userData.walk_door&&Array.isArray(o.userData.walk_open_offset_native)){
      const original=o.position.clone(),world=o.getWorldPosition(new THREE.Vector3()),target=world.clone().add(point(o.userData.walk_open_offset_native));
      const local=o.parent?o.parent.worldToLocal(target):target;
      doors.push({object:o,original,offset:local.sub(original)});
    }});
    if(configuration.walkContract){
      const response=await fetch(configuration.walkContract);if(!response.ok)throw Error('Interior navigation unavailable');
      const contract=await response.json();
      const required=contract.halls.flatMap(h=>h.doors.map(d=>d.tag));
      if(required.some(tag=>!doors.some(d=>d.object.userData.walk_door===tag)))throw Error('Saved doors do not match the interior navigation');
      walk=createHillsideWalk({camera,canvas:renderer.domElement,contract,requestRender:request,onDoors:setDoors,onExit:()=>go('arrival',true),onMode:inside=>{
        controls.enabled=!inside;view=inside?'interior':view;
        scene.environmentIntensity=inside?(configuration.interiorEnvironmentIntensity??.18):(configuration.environmentIntensity??.8);
        $('enter-hall').textContent=inside?'Go outside':'Go inside';$('other-hall').hidden=!inside;
        document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
        if(inside){camera.fov=60;camera.updateProjectionMatrix();$('caption').textContent='Inside the shell · proposed structure and finishes';}
        $('hint').textContent=inside?'Drag to look · Scroll to walk · Esc for outside':'Drag to explore · Scroll to move closer';
      }});
      $('enter-hall').disabled=false;
    }
    renderer.shadowMap.needsUpdate=true;loaded=true;state.loaded=true;state.model=configuration.model;state.meshes=meshes;state.instances=instances;state.pixelRatio=renderer.getPixelRatio();
    go('arrival',true);$('controls').disabled=false;$('loading').hidden=true;
    if(new URLSearchParams(location.search).has('diagnostics')){const diagnostic=document.createElement('details');diagnostic.style.cssText='position:fixed;left:12px;bottom:70px;color:#7fe9ff;background:#05070dcc;font:10px monospace;padding:6px;max-width:80vw';const summary=document.createElement('summary');summary.textContent='Review diagnostics';diagnostic.append(summary);const output=document.createElement('output');diagnostic.append(output);document.body.append(diagnostic);setInterval(()=>{output.textContent=JSON.stringify({frames:state.frames,hidden:document.hidden,framePending:frame,frameKind,view,triangles:state.triangles,errors:state.errors,walk:state.walk,doors:doors.length});},1000);}
    if(new URLSearchParams(location.search).get('review')==='1'){
      const {createPerformanceCheck}=await import('./campus-performance-check-v1.js');
      performanceCheck=createPerformanceCheck({
        getSnapshot:()=>({fixedView:{model:configuration.browserModelSha256,view,camera:camera.position.toArray(),target:controls.target.toArray(),viewport:[innerWidth,innerHeight],pixelRatio:renderer.getPixelRatio()},renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},meshes,instances,userAgent:navigator.userAgent}),
        requestRender:request,
        onStart:()=>{if(walk?.active){go('arrival',true);tell('Performance check uses the still exterior view');}if(transition)go(view,true);for(let i=0;i<180;i++)controls.update();controls.enabled=false;$('controls').disabled=true;},
        onStop:receipt=>{state.performanceReceipt=receipt;controls.enabled=!walk?.active;$('controls').disabled=false;}
      });
    }
    const hideMenu=()=>{$('view-menu').hidden=true;$('views-toggle').setAttribute('aria-expanded','false');};
    $('views-toggle').onclick=()=>{const open=$('view-menu').hidden;$('view-menu').hidden=!open;$('views-toggle').setAttribute('aria-expanded',String(open));};
    document.addEventListener('pointerdown',e=>{if(!$('dock').contains(e.target))hideMenu();});
    document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{hideMenu();go(button.dataset.view);}));
    $('other-hall').addEventListener('click',hideMenu);
    $('capture').addEventListener('click',()=>{hideMenu();saveImage();});
    renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();state.errors.push('WebGL context lost');$('load-title').textContent='The 3D view needs to reload';$('load-detail').textContent='Your model is saved. Reload the view to continue.';$('retry').hidden=false;$('loading').hidden=false;});
  }catch(error){state.errors.push(String(error));$('load-title').textContent='The model could not open';$('load-detail').textContent='Please reload the view. The saved model has not changed.';$('retry').hidden=false;console.error(error);}
}
$('retry').onclick=()=>location.reload();window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{cancelFrame();if(document.hidden)performanceCheck?.finish('Tab was hidden');request();});
boot();
