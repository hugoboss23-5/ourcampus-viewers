import {createTreeVisibility} from './tree-visibility-v1.js';
import {createPerformanceCheck} from './campus-performance-check-v1.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {createHandControls} from './hand-controls.js';
import {createCampusTour} from './campus-tour-v3.js?v=hall-motion1';
import {getCampusTour as getBaseTour} from './tour-paths-v4.js';
import {loadCampusAdditions} from './pending-review/integration/campus-additions.js?v=campus-pair1';
import {createIntegratedNavigation} from './pending-review/integration/integrated-tour.js?v=hall-motion1';
import {createNavigationControls} from './navigation-controls-v3.js';
import {createNavigationCollision,createClickToGo} from './navigation-collision-v1.js';
import {createCampusNavigationUI,getCampusDestinations as getBaseDestinations} from './campus-navigation-ui-v1.js?v=hover1';
import {createCampusNightLighting} from './campus-night-lighting-v1.js';
import {createRenderTiming} from './render-timing-v1.js';
import {createTourFrameTiming} from './tour-frame-timing-v1.js';

let additions=null, integratedNavigation=null, integratedLightingMode=null;
const getCampusTour=id=>integratedNavigation?.getCampusTour(id)||getBaseTour(id);
const getCampusDestinations=(plan,tour)=>integratedNavigation?integratedNavigation.getCampusDestinations(plan,tour):getBaseDestinations(plan,tour);
const $=id=>document.getElementById(id),host=$('viewport');
const assets=new URL('./assets/',import.meta.url),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const state=window.__campus={loaded:false,error:null,option:null,meshes:0,drawCalls:0,triangles:0,lighting:'day',camera:[],target:[],measuredFrameRate:null};
let dayEnvironment,eveningEnvironment;
const treeDistanceGeometries=new Map(),treeDetailMeshes=[];
let treeDistanceLoad;
let performanceCheck;
const treeVisibility=createTreeVisibility();
let renderer,model,manifest,selectedOption,modelLights=[],presets={},generation=0,transition,frameId,lastTime=0,captureBusy=false,toastTimer,manualShadows=null,tour=null,tourSavedLayers=null,navigation=null,pendingNavigation=null,collision=null,clickTravel=null,campusNavigation=null,campusPlan=null,destinationMap=new Map();
const roofs=[],systems=[],emissionMaterials=new Map(),frameIntervals=[];
function isRoofObject(object){return object.userData.ifc_class==='IfcRoof'||['roof','room_ceiling'].includes(object.userData.kind)||/^Roof_/i.test(object.name);}
function isBuildingService(object){
 const data=object.userData;
 // Plant-room walls and ceilings are permanent architecture. Their source
 // coordination tag must not make them disappear with the services overlay.
 if(data.ifc_class==='IfcSanitaryTerminal')return false;
 if(data.discipline==='coordination'&&['IfcWall','IfcCovering'].includes(data.ifc_class))return false;
 return !!data.discipline||String(data.kind||'').startsWith('mep_');
}

function assetURL(path){const url=new URL(String(path),assets);if(!url.href.startsWith(assets.href))throw new Error('Asset path is outside the planning package');return url.href;}
function setStatus(title,detail,error=false){$('loading').hidden=false;$('load-title').textContent=title;$('load-detail').textContent=detail;$('retry').hidden=!error;$('progress').hidden=error;}
function showError(error){console.error(error);state.error=String(error.message||error);setStatus('This option could not open','Check the connection and try again.',true);}
$('retry').onclick=()=>selectedOption?loadOption(selectedOption.id):location.reload();
try{
 const canvas=document.createElement('canvas'),context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
 if(!context)throw new Error('WebGL 2 is unavailable');
 const reversedDepth=!!context.getExtension('EXT_clip_control');
 renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,alpha:false,reversedDepthBuffer:reversedDepth,logarithmicDepthBuffer:!reversedDepth,powerPreference:'high-performance'});
 state.depthMode=reversedDepth?'reversed':'logarithmic';
 canvas.dataset.depthMode=state.depthMode;
 const gpu=context.getExtension('WEBGL_debug_renderer_info');
 canvas.dataset.graphicsProcessor=gpu?context.getParameter(gpu.UNMASKED_RENDERER_WEBGL):context.getParameter(context.RENDERER);
}catch(error){showError(error);throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1;
renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','3D planning option. Drag to rotate; scroll to zoom.');host.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();showError(new Error('Graphics context lost'));});renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
const scene=new THREE.Scene();scene.background=new THREE.Color('#93aab4');
const camera=new THREE.PerspectiveCamera(40,1,.1,5000);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=!reducedMotion;controls.dampingFactor=.11;controls.minDistance=1;controls.maxDistance=2600;controls.maxPolarAngle=Math.PI*.72;controls.zoomToCursor=true;controls.screenSpacePanning=false;controls.rotateSpeed=.62;controls.zoomSpeed=2.2;controls.autoRotateSpeed=.55;controls.listenToKeyEvents(renderer.domElement);
function keepOrbitOnCampus(){
 if(!state.loaded||!state.bounds||tour?.active||transition||navigation?.state.mode==='walk')return;
 const min=(state.campusBounds||state.bounds).min,max=(state.campusBounds||state.bounds).max,clamped=controls.target.clone();
 clamped.x=THREE.MathUtils.clamp(clamped.x,min[0],max[0]);clamped.z=THREE.MathUtils.clamp(clamped.z,min[2],max[2]);clamped.y=THREE.MathUtils.clamp(clamped.y,0,max[1]);
 const correction=clamped.sub(controls.target);if(correction.lengthSq()>0){camera.position.add(correction);controls.target.add(correction);camera.lookAt(controls.target);camera.updateMatrixWorld();}
}
function keepCameraAboveGrade(){
 // The design datum is +0.000 and the highest modeled site paving is +0.128.
 // An adaptive angle still allows a human-height camera to look up at a roof.
 const minimumEyeHeight=.25;
 camera.position.y=Math.max(camera.position.y,minimumEyeHeight);
 const radius=Math.max(1e-6,camera.position.distanceTo(controls.target));
 controls.maxPolarAngle=Math.min(Math.PI*.72,Math.acos(THREE.MathUtils.clamp((minimumEyeHeight-controls.target.y)/radius,-1,1)));
}
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.06);scene.environment=environment.texture;scene.environmentIntensity=.20;room.dispose();pmrem.dispose();
async function loadPhotographedSky(){
 const generator=new THREE.PMREMGenerator(renderer),loader=new HDRLoader();
 for(const [name,file] of [['day','kloppenheim_06_puresky.hdr'],['evening','industrial_sunset_02_puresky.hdr']]){
  try{const texture=await loader.loadAsync(assetURL(file));texture.mapping=THREE.EquirectangularReflectionMapping;const environment=generator.fromEquirectangular(texture).texture;
   if(name==='day')dayEnvironment={texture,environment};else eveningEnvironment={texture,environment};
  }catch(error){console.warn('Photographed sky unavailable',name,error);}
 }
 generator.dispose();setLighting(state.lighting);
}
function applyLayerVisibility(){const roofSet=new Set(roofs),systemSet=new Set(systems);for(const object of new Set([...roofs,...systems]))object.visible=(!roofSet.has(object)||$('roofs-toggle').checked)&&(!systemSet.has(object)||$('systems-toggle').checked);state.roofsVisible=$('roofs-toggle').checked;state.systemsVisible=$('systems-toggle').checked;renderer.shadowMap.needsUpdate=true;nightLighting.update({cameraPosition:camera.position,target:controls.target,force:true});requestRender();}
function toggleSystems(show){$('systems-toggle').checked=show;applyLayerVisibility();}
$('systems-toggle').onchange=e=>toggleSystems(e.target.checked);
const sky=new THREE.HemisphereLight(0xe5efff,0x777c70,.62),sun=new THREE.DirectionalLight(0xfff1dd,1.9),fill=new THREE.DirectionalLight(0xdae8ff,.22);
sun.position.set(-230,380,-220);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-420,right:420,top:420,bottom:-420,near:1,far:1400});sun.shadow.bias=-.00008;sun.shadow.normalBias=.11;sun.shadow.radius=2;fill.position.set(250,100,220);scene.add(sky,sun,sun.target,fill);
const nightLighting=createCampusNightLighting({scene,budget:18,requestRender});
const renderTiming=createRenderTiming(renderer.getContext());
let displayedGPUTimingSample;
const tourFrameTiming=createTourFrameTiming();
let displayedTourFrameSummary;
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.24,.65,1.3);bloom.enabled=false;composer.addPass(bloom);composer.addPass(new OutputPass());
// Smooth the actual offscreen scene targets, not only the browser canvas.
const aaContext=renderer.getContext();
const aaColorSamples=Array.from(aaContext.getInternalformatParameter(aaContext.RENDERBUFFER,aaContext.RGBA16F,aaContext.SAMPLES)||[]);
const aaDepthSamples=Array.from(aaContext.getInternalformatParameter(aaContext.RENDERBUFFER,aaContext.DEPTH_COMPONENT24,aaContext.SAMPLES)||[]);
const aaSamples=Math.max(0,...aaColorSamples.filter(n=>n<=4&&n<=renderer.capabilities.maxSamples&&aaDepthSamples.includes(n)));
composer.renderTarget1.samples=aaSamples;composer.renderTarget2.samples=aaSamples;
state.antialiasing={samples:aaSamples,method:'multisampled scene targets',pixelRatio:renderer.getPixelRatio()};

function updateTreeDetail(){
 let near=0,distant=0;const position=new THREE.Vector3(),sphere=new THREE.Sphere();
 // The matched tree images used 1140 vertical pixels and a 40 degree field.
 // Keep extra source detail when a large window or exported image needs it.
 const minimumDistance=40*Math.max(1,renderer.domElement.height/1140)*Math.tan(THREE.MathUtils.degToRad(20))/Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
 for(const mesh of treeDetailMeshes){
  sphere.copy(mesh.userData.nativeTreeSphere).applyMatrix4(mesh.matrixWorld);position.copy(sphere.center);
  const far=position.distanceTo(camera.position)-sphere.radius>minimumDistance,geometry=far?mesh.userData.distanceTreeGeometry:mesh.userData.nativeTreeGeometry;
  if(mesh.geometry!==geometry)mesh.geometry=geometry;
  const count=treeVisibility.stats.prepared?treeVisibility.sourceCount(mesh):mesh.count;if(far)distant+=count;else near+=count;
 }
 renderer.domElement.dataset.nearTreePrimitives=String(near);renderer.domElement.dataset.distantTreePrimitives=String(distant);
 renderer.domElement.dataset.distantTreeMinimumDistance=minimumDistance.toFixed(2);
}
// Keep the engine's own render state and shadow pass. Only the caster geometry
// is switched while that pass runs; the colour pass sees the existing detail.
const renderShadowMap=renderer.shadowMap.render.bind(renderer.shadowMap);
renderer.shadowMap.render=(lights,shadowScene,shadowCamera)=>{
 if(!renderer.shadowMap.enabled||(!renderer.shadowMap.autoUpdate&&!renderer.shadowMap.needsUpdate)||!lights.length)return renderShadowMap(lights,shadowScene,shadowCamera);
 const displayed=treeDetailMeshes.map(mesh=>mesh.geometry);
 try{
  for(const mesh of treeDetailMeshes)mesh.geometry=mesh.userData.nativeTreeGeometry;
  treeVisibility.withFullInstances(()=>renderShadowMap(lights,shadowScene,shadowCamera));
  state.shadowRefreshes=(state.shadowRefreshes||0)+1;
 }finally{
  treeDetailMeshes.forEach((mesh,i)=>{mesh.geometry=displayed[i];});
 }
};
function updateIntegratedLighting(){
 const mode=additions?.lighting(camera,state.lighting==='night')||null;
 if(mode===integratedLightingMode)return;integratedLightingMode=mode;
 if(!mode){setLighting(state.lighting);return;}
 scene.environmentIntensity=mode==='hills'?.18:.45;sky.intensity=mode==='hills'?.12:.9;sun.intensity=mode==='hills'?0:.6;fill.intensity=mode==='hills'?.03:.2;renderer.toneMappingExposure=1.05;
}
function draw(){
 updateTreeDetail();state.treeVisibility=treeVisibility.update(camera);nightLighting.update({cameraPosition:camera.position,target:controls.target});updateIntegratedLighting();renderer.info.reset();
 renderTiming.setEnabled(!!tour?.active||!!performanceCheck?.active);
 renderTiming.begin({option:state.option,model:state.modelURL,chapter:renderer.domElement.dataset.tourChapter||null,camera:camera.position.toArray(),target:controls.target.toArray(),roofs:$('roofs-toggle').checked,systems:$('systems-toggle').checked,lighting:state.lighting});
 const start=performance.now();try{composer.render();}finally{renderTiming.end();}state.lastRenderMs=performance.now()-start;
 renderer.domElement.dataset.gpuTiming=JSON.stringify(renderTiming.state);
 if(displayedGPUTimingSample!==renderTiming.state.last){displayedGPUTimingSample=renderTiming.state.last;renderer.domElement.dataset.gpuTimingSamples=JSON.stringify(renderTiming.samples);}
 renderer.domElement.dataset.nightLighting=JSON.stringify(nightLighting.state);
 renderer.domElement.dataset.triangles=String(renderer.info.render.triangles);
 renderer.domElement.dataset.shadowRefreshes=String(state.shadowRefreshes||0);
}
function requestRender(){if(!frameId&&!captureBusy)frameId=requestAnimationFrame(render);}
function render(now){
 frameId=null;if(captureBusy)return;
 const tourWasActive=!!tour?.active;
 tourFrameTiming.observe(now,{tourActive:tourWasActive,chapterId:renderer.domElement.dataset.tourChapter||null});
 const rawDelta=Math.min(.25,(now-lastTime)/1000||.016),delta=Math.min(.05,rawDelta);lastTime=now;
 if(tour?.active)tour.update(now);
 else if(transition){
  const t=transition.duration?Math.min(1,(now-transition.start)/transition.duration):1;
  if(transition.dissolve){
   $('tour-fade').style.opacity=String(t<.5?t*2:(1-t)*2);
   if(t>=.5){camera.position.copy(transition.endP);controls.target.copy(transition.endT);camera.lookAt(controls.target);camera.updateMatrixWorld();}
  }else{const eased=t*t*(3-2*t);camera.position.lerpVectors(transition.p,transition.endP,eased);controls.target.lerpVectors(transition.t,transition.endT,eased);}
  if(t>=1){
   if(transition.dissolve){$('tour-fade').style.opacity='0';$('tour-fade').hidden=true;}
   transition=null;navigation.setEnabled(state.loaded&&!captureBusy&&!handControls.state.running&&handControls.state.phase!=='loading');
   if(pendingNavigation){const name=state.selectedView;const permitted=pendingNavigation!=='walk'||levelWalkCamera();if(permitted)navigation.setMode(pendingNavigation,{height:additions?.atHill(camera.position)?.5:1.7});pendingNavigation=null;state.selectedView=name;$('view-title').textContent=presets[name]?.label||'Inside hall';if($('view-select'))$('view-select').value=name;}
  }
 }
 const walking=navigation?.update(rawDelta,now);
 const travelling=manualNavigationAllowed()&&navigation?.state.mode==='walk'?clickTravel?.update(rawDelta,now):false;
 keepCameraAboveGrade();
 const changed=tour?.active||transition?.dissolve||navigation?.state.mode==='walk'?false:controls.update(delta);
 keepOrbitOnCampus();keepCameraAboveGrade();updateInteriorUI();campusNavigation?.update();draw();
 if(tourWasActive&&!tour?.active)tourFrameTiming.observe(now,{tourActive:false});
 if(displayedTourFrameSummary!==tourFrameTiming.state){displayedTourFrameSummary=tourFrameTiming.state;renderer.domElement.dataset.tourFrameTiming=JSON.stringify(displayedTourFrameSummary);}
 if(state.lastFrameAt!==null&&now>state.lastFrameAt){frameIntervals.push(now-state.lastFrameAt);if(frameIntervals.length>60)frameIntervals.shift();}
 state.lastFrameAt=now;if(frameIntervals.length>=10)state.measuredFrameRate=1000/(frameIntervals.reduce((sum,n)=>sum+n,0)/frameIntervals.length);
 state.frameSamples=frameIntervals.length;state.drawCalls=renderer.info.render.calls;state.triangles=renderer.info.render.triangles;state.camera=camera.position.toArray();state.target=controls.target.toArray();
 renderer.domElement.dataset.renderCalls=String(state.drawCalls);renderer.domElement.dataset.frameRate=state.measuredFrameRate?.toFixed(1)||'waiting';renderer.domElement.dataset.renderMs=state.lastRenderMs.toFixed(1);renderer.domElement.dataset.cameraEyeHeight=camera.position.y.toFixed(5);renderer.domElement.dataset.cameraPosition=JSON.stringify(camera.position.toArray());renderer.domElement.dataset.cameraTarget=JSON.stringify(controls.target.toArray());renderer.domElement.dataset.presentationMeshes=String(state.batching?.presentationMeshes||state.meshes);
 performanceCheck?.observe(now);
 if(performanceCheck?.active||tour?.active||transition||controls.autoRotate||changed||walking||travelling)requestRender();
 if(!frameId)state.lastFrameAt=null;
}
function manualNavigationAllowed(){return state.loaded&&!captureBusy&&!tour?.active&&!transition&&!handControls.state.running&&handControls.state.phase!=='loading';}

function resize(){if(captureBusy)return;const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);composer.setSize(w,h);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();if(state.loaded&&!tour?.active&&isSiteView(state.selectedView))selectView(state.selectedView,true);requestRender();}new ResizeObserver(resize).observe(host);resize();
function setLighting(mode){integratedLightingMode=null;const night=mode==='night';state.lighting=mode;sky.intensity=night?.24:.62;sun.intensity=night?.12:1.9;sun.color.set(night?0x94b9fa:0xfff1dd);fill.intensity=night?.16:.22;const env=night?eveningEnvironment:dayEnvironment;if(env){scene.environment=env.environment;scene.background=env.texture;scene.backgroundBlurriness=.035;scene.backgroundIntensity=night?.35:.8;}else{scene.background=new THREE.Color(night?'#071321':'#93aab4');}scene.environmentIntensity=night?.28:.65;renderer.toneMappingExposure=night?1.12:.86;bloom.enabled=night;emissionMaterials.forEach((value,material)=>material.emissiveIntensity=night?Math.max(value,2):value*.05);nightLighting.setNight(night);nightLighting.update({cameraPosition:camera.position,target:controls.target,force:true});$('day').setAttribute('aria-pressed',String(!night));$('night').setAttribute('aria-pressed',String(night));renderer.shadowMap.needsUpdate=true;requestRender();}
function setShadows(enabled){state.shadowsVisible=enabled;$('shadows-toggle').checked=enabled;if(renderer.shadowMap.enabled===enabled)return;renderer.shadowMap.enabled=enabled;renderer.shadowMap.needsUpdate=true;scene.traverse(object=>{if(object.isMesh)for(const material of [].concat(object.material))material.needsUpdate=true;});requestRender();}
$('day').onclick=()=>setLighting('day');$('night').onclick=()=>setLighting('night');$('shadows-toggle').onchange=event=>{manualShadows=event.target.checked;setShadows(manualShadows);};
$('roofs-toggle').onchange=applyLayerVisibility;
function stopSpin(){controls.autoRotate=false;$('spin').setAttribute('aria-pressed','false');$('spin').textContent='Auto rotate';}
function isSiteView(name){return name==='above'||name==='overview';}
function fitSiteCamera(view){
  const w=host.clientWidth,h=host.clientHeight,margin=18;
  let left=margin,right=w-margin,top=margin,bottom=h-margin;
  const visibleRect=selector=>{const element=document.querySelector(selector);if(!element||!element.getClientRects().length)return null;const r=element.getBoundingClientRect();return r.width&&r.height?r:null;};
  const header=visibleRect('.top'),panel=visibleRect('.campus-panel');
  if(header)top=Math.max(top,header.bottom+margin);
  if(panel){if(panel.width>w*.55)top=Math.max(top,panel.bottom+margin);else left=Math.max(left,panel.right+margin);}
  for(const selector of ['.bottom','.instructions','.view-label','.orbit-tools']){const r=visibleRect(selector);if(r)bottom=Math.min(bottom,r.top-margin);}
  const usableW=Math.max(80,right-left),usableH=Math.max(80,bottom-top),cx=(left+right)/2,cy=(top+bottom)/2;
  const target=new THREE.Vector3(...view.t),direction=new THREE.Vector3(...view.p).sub(target).normalize();
  const horizontal=new THREE.Vector3().crossVectors(camera.up,direction);if(horizontal.lengthSq()<1e-10)horizontal.set(1,0,0);horizontal.normalize();
  const vertical=new THREE.Vector3().crossVectors(direction,horizontal).normalize(),tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/camera.zoom;
  const tanX=tanV*camera.aspect*usableW/w,tanY=tanV*usableH/h;
  let distance=50;
  const framing=state.campusBounds||state.bounds;
  for(const x of [framing.min[0],framing.max[0]])for(const y of [framing.min[1],framing.max[1]])for(const z of [framing.min[2],framing.max[2]]){
    const delta=new THREE.Vector3(x,y,z).sub(target),depth=delta.dot(direction);
    distance=Math.max(distance,depth+Math.abs(delta.dot(horizontal))/tanX,depth+Math.abs(delta.dot(vertical))/tanY);
  }
  distance*=1.06;controls.maxDistance=Math.max(2600,distance*1.2);camera.far=Math.max(5000,distance+new THREE.Vector3(...state.bounds.max).sub(new THREE.Vector3(...state.bounds.min)).length()*1.2);
  camera.setViewOffset(w,h,w/2-cx,h/2-cy,w,h);
  state.siteFraming={view:state.selectedView,usableRect:[left,top,right,bottom],distance,viewport:[w,h]};
  return target.clone().addScaledVector(direction,distance);
}
function selectView(name,immediate=false){if(!presets[name]||captureBusy||tour?.active)return;if(handControls.state.running||handControls.state.phase==='loading')handControls.stop();clickTravel?.stop();navigation?.stopInput();if(navigation?.state.mode==='walk')navigation.setMode('orbit');navigation?.setEnabled(true);pendingNavigation=presets[name].walk===true||name==='interior'&&presets[name].walk!==false?'walk':null;const view=presets[name];camera.fov=view.fov||40;const target=new THREE.Vector3(...view.t);let position=new THREE.Vector3(...view.p);camera.clearViewOffset();controls.maxDistance=2600;camera.far=5000;state.selectedView=name;$('inside-hills').textContent='Data center hill';if(isSiteView(name)&&state.bounds)position=fitSiteCamera(view);else{state.siteFraming=null;if(position.y>30&&!view.fixedCamera)position.sub(target).multiplyScalar(Math.max(1,Math.min(2.5,1.25/camera.aspect))).add(target);}camera.updateProjectionMatrix();stopSpin();controls.update();const shadowRadius=isSiteView(name)?Math.max(200,(state.bounds.max[0]-state.bounds.min[0])*.56):Math.max(45,Math.min(100,position.distanceTo(target)*.5));sun.target.position.copy(target);sun.position.copy(target).add(new THREE.Vector3(-230,380,-220));Object.assign(sun.shadow.camera,{left:-shadowRadius,right:shadowRadius,top:shadowRadius,bottom:-shadowRadius});sun.shadow.camera.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;setShadows(manualShadows??true);const dissolve=!immediate&&!reducedMotion&&!isSiteView(name);transition={start:performance.now(),duration:immediate||reducedMotion?0:dissolve?800:650,dissolve,p:camera.position.clone(),t:controls.target.clone(),endP:position,endT:target};if(dissolve){navigation.setEnabled(false);$('tour-fade').hidden=false;$('tour-fade').style.opacity='0';}$('view-title').textContent=view.label||name;if($('view-select'))$('view-select').value=name;requestRender();}
// Physical camera position, rather than the last selected view, keeps this correct while walking.
function currentInteriorHall(){
 if(!state.loaded||!campusPlan||camera.position.y<.1)return null;const hill=additions?.atHill(camera.position);if(hill)return hill;
 return (campusPlan.option?.halls||[]).find(hall=>{
  const [ox,oy]=hall.origin_xy||[],[w,l]=hall.dims_m||[];
  if(![ox,oy,w,l,hall.clear_height_m].every(Number.isFinite))return false;
  const angle=(hall.rotation_deg||0)*Math.PI/180,dx=camera.position.x-ox,dy=-camera.position.z-oy;
  const x=dx*Math.cos(angle)+dy*Math.sin(angle),y=-dx*Math.sin(angle)+dy*Math.cos(angle);
  return x>.2&&x<w-.2&&y>.2&&y<l-.2&&camera.position.y<hall.clear_height_m;
 })||null;
}
function updateInteriorUI(){
 const hall=currentInteriorHall();state.interiorHall=hall?.id||null;
 const inside=!!hall,wasInside=document.body.classList.contains('inside-building');document.body.classList.toggle('inside-building',inside);
 if(inside&&!wasInside&&(handControls.state.running||handControls.state.phase==='loading'))handControls.stop();
 $('exit-building').disabled=!inside||captureBusy||!!tour?.active;$('other-hill').hidden=!hall?.shellId||additions?.roomCount<2;$('other-hill').disabled=captureBusy||!!tour?.active;
 if(inside&&$('more').open)$('more').open=false;
}
$('other-hill').onclick=()=>selectView(currentInteriorHall()?.shellId==='A1'?'hills-interior-2':'hills-interior-1');
$('exit-building').onclick=()=>{
 if(!state.loaded||captureBusy||tour?.active)return;
 const hall=currentInteriorHall();if(!hall)return;
 selectView(presets[hall.id]?hall.id:'overview');renderer.domElement.focus({preventScroll:true});
};
function buildInteriorEntrances(option){
 const path=getCampusTour(option.id),matches=!!path&&path.modelSha256===option.model_sha256;
 for(const [buttonId,chapterId,label] of [['inside-sports','sports-inside','Sports hall'],['inside-events','events-inside',integratedNavigation?'Performance hall':campusPlan?.gym_program?.building==='events'?'Gym building':'Events hall']]){
  const button=$(buttonId),pose=matches?path.chapters.find(c=>c.id===chapterId)?.poses?.[0]:null;
  button.textContent=label;button.setAttribute('aria-label','See inside '+label.toLowerCase());button.disabled=!state.loaded||!pose;
  if(!pose)continue;
  const eye=[pose.p[0],1.7,pose.p[2]],canWalk=!!collision?.canMove({from:eye,to:eye});
  presets[buttonId]={p:[...pose.p],t:[...pose.t],label:'Inside '+label.toLowerCase(),walk:pose.walk===false?false:canWalk,fixedCamera:pose.fixedCamera,fov:pose.fov,dissolve:true};
 }
}
function openBuildingInterior(id){
 if(!state.loaded||captureBusy||tour?.active||!presets[id])return;
 const path=getCampusTour(selectedOption.id);
 if(path?.modelSha256!==selectedOption.model_sha256){toast('This building view needs updating for the current model.');return;}
 selectView(id);
 renderer.domElement.focus({preventScroll:true});
}
$('inside-sports').onclick=()=>openBuildingInterior('inside-sports');
$('inside-events').onclick=()=>openBuildingInterior('inside-events');
$('inside-hills').onclick=()=>selectView('hills-interior-1');
function markCustom(){clickTravel?.stop();if(transition?.dissolve){$('tour-fade').hidden=true;$('tour-fade').style.opacity='0';navigation?.setEnabled(state.loaded&&!captureBusy&&!tour?.active&&!handControls.state.running&&handControls.state.phase!=='loading');}transition=null;pendingNavigation=null;state.selectedView=null;stopSpin();$('view-title').textContent='Your view';if($('view-select'))$('view-select').value='';}controls.addEventListener('start',markCustom);controls.addEventListener('change',requestRender);
function zoom(factor){if(navigation?.state.mode==='walk'){navigation.move(factor<1?'forward':'back',1.5);return;}markCustom();const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();requestRender();}$('zoom-in').onclick=()=>zoom(1/1.3);$('zoom-out').onclick=()=>zoom(1.3);$('spin').onclick=()=>{if(navigation?.state.mode==='walk'){selectView('overview');return;}transition=null;controls.autoRotate=!controls.autoRotate;$('spin').setAttribute('aria-pressed',String(controls.autoRotate));$('spin').textContent=controls.autoRotate?'Pause rotation':'Auto rotate';requestRender();};
let dragMode='turn';
function updateNavigationUI(){
 const walk=navigation?.state.mode==='walk';dragMode=walk?'move':'turn';
 $('turn').setAttribute('aria-pressed',String(!walk));$('move').setAttribute('aria-pressed',String(walk));$('walk-tools').hidden=!walk;
 $('control-hint').textContent=walk?'Drag to look · Scroll to walk · Click the floor to go · W A S D or arrows':'Drag to fly around · Scroll to zoom';
 renderer.domElement.dataset.dragMode=walk?'walk':'orbit';renderer.domElement.style.cursor='grab';renderer.domElement.setAttribute('aria-label',walk?'Walk through campus. W A S D or arrows to move; drag to look; scroll to walk.':'Fly around campus. W A S D or arrows to move; drag to rotate; scroll to zoom.');
}
function levelWalkCamera(){
 const hill=additions?.atHill(camera.position);if(hill){camera.position.y=.5;return true;}const eye=[camera.position.x,1.7,camera.position.z];if(!collision||!collision.canMove({from:eye,to:eye})){toast('This spot is too close to a wall or furniture. Choose another view.');return false;}
 const heading=controls.target.clone().sub(camera.position);heading.y=0;if(heading.lengthSq()<1e-8)heading.set(0,0,-1);heading.normalize();
 camera.position.y=1.7;controls.target.copy(camera.position).addScaledVector(heading,8);camera.lookAt(controls.target);camera.updateMatrixWorld();return true;
}
function setDragMode(mode){
 if(!navigation||captureBusy||tour?.active)return;
 if(handControls.state.running||handControls.state.phase==='loading')handControls.stop();
 if(mode==='turn'&&navigation.state.mode==='orbit'||mode==='move'&&navigation.state.mode==='walk')return;
 navigation.setEnabled(true);
 if(mode==='move'&&camera.position.y>12){selectView('interior');return;}
 if(mode==='turn'&&navigation.state.mode==='walk'){selectView('overview');return;}
 if(mode==='move'&&!levelWalkCamera())return;navigation.setMode(mode==='move'?'walk':'orbit',{height:additions?.atHill(camera.position)?.5:1.7});updateNavigationUI();
}
$('turn').onclick=()=>setDragMode('turn');$('move').onclick=()=>setDragMode('move');$('home').onclick=()=>selectView('overview');
const handControls=createHandControls({video:$('hand-video')});
handControls.subscribe(event=>{
 if(event.type==='status'){
  const off=event.phase==='off';if($('hand-panel').hidden!==off)$('hand-panel').hidden=off;if($('hand-status').textContent!==event.text)$('hand-status').textContent=event.text;
  const label=off||event.phase==='error'?'Use hands':'Stop hands';if($('hands').textContent!==label)$('hands').textContent=label;$('hands').setAttribute('aria-pressed',String(!off&&event.phase!=='error'));
  $('hand-video').hidden=off||event.phase==='loading'||event.phase==='error';
  if(navigation&&(off||event.phase==='error')&&state.loaded&&!captureBusy&&!tour?.active)navigation.setEnabled(true);renderer.domElement.dataset.handPhase=event.phase;renderer.domElement.dataset.detectedHands=String(event.hands||0);
 }else if(state.loaded&&!captureBusy&&!tour?.active&&event.type==='rotate'){
  markCustom();const offset=camera.position.clone().sub(controls.target),spherical=new THREE.Spherical().setFromVector3(offset);
  spherical.theta+=event.yawDelta;spherical.phi=THREE.MathUtils.clamp(spherical.phi+event.pitchDelta,event.minPolarAngle,event.maxPolarAngle);
  camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));keepCameraAboveGrade();controls.update();requestRender();
 }else if(state.loaded&&!captureBusy&&!tour?.active&&event.type==='zoom')zoom(event.factor);
 const handState=handControls.state;
 renderer.domElement.dataset.handDetections=String(handState.detections);
 renderer.domElement.dataset.handBackend=handState.backend||'main';
 renderer.domElement.dataset.handDelegate=handState.delegate||'';
 renderer.domElement.dataset.handInferenceMs=handState.lastDetectMs.toFixed(2);
 renderer.domElement.dataset.handWorkerTotalMs=(handState.lastWorkerTotalMs||0).toFixed(2);
 if(state.loaded&&!captureBusy&&!tour?.active&&(event.type==='rotate'||event.type==='zoom')){
  const key=event.type==='rotate'?'handTurns':'handZooms';renderer.domElement.dataset[key]=String(Number(renderer.domElement.dataset[key]||0)+1);
 }
});
let floorClickStart=null;
renderer.domElement.addEventListener('pointerdown',event=>{clickTravel?.stop();floorClickStart=!additions?.atHill(camera.position)&&manualNavigationAllowed()&&navigation?.state.mode==='walk'&&event.button===0?{x:event.clientX,y:event.clientY,id:event.pointerId,at:performance.now()}:null;},{capture:true});
renderer.domElement.addEventListener('pointerup',event=>{const start=floorClickStart;floorClickStart=null;if(!start||event.pointerId!==start.id||performance.now()-start.at>400||Math.hypot(event.clientX-start.x,event.clientY-start.y)>4||!manualNavigationAllowed()||navigation?.state.mode!=='walk')return;const r=renderer.domElement.getBoundingClientRect();clickTravel?.setDestination([(event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1]);},{capture:true});
renderer.domElement.addEventListener('pointercancel',()=>{floorClickStart=null;clickTravel?.stop();},{capture:true});
renderer.domElement.addEventListener('wheel',()=>clickTravel?.stop(),{capture:true,passive:true});
window.addEventListener('blur',()=>clickTravel?.stop());
renderer.domElement.addEventListener('blur',()=>clickTravel?.stop());
document.addEventListener('pointerdown',event=>{if(event.target!==renderer.domElement)clickTravel?.stop();},{capture:true});
campusNavigation=createCampusNavigationUI({canvas:renderer.domElement,getDestinations:getCampusDestinations,labelRoot:$('campus-labels'),camera,onJump:d=>selectView(d.id),isEnabled:()=>manualNavigationAllowed()&&!document.body.classList.contains('clean')&&!document.body.classList.contains('inside-building'),isAnchorVisible:(anchor,destination)=>{if(destination.overlayModelSha256)return !destination.presentation?.interiorKind&&destination.id.startsWith('hills-pair-');if(['kitchen','office','dining','gym','basketball','exhibition'].includes(destination.id)&&$('roofs-toggle').checked&&camera.position.y>12)return false;return collision?.isAnchorVisible?.(anchor,camera.position.toArray())??false;}});
navigation=createNavigationControls({camera,orbitControls:controls,element:renderer.domElement,requestRender,markCustom,canInteract:manualNavigationAllowed,canMove:move=>additions?.moveHill(move)??(collision?collision.canMove(move):false),isInsideBuilding:()=>!!currentInteriorHall(),onBlocked:()=>toast('The way is blocked. Turn or choose another direction.'),onModeChange:updateNavigationUI});
updateNavigationUI();
for(const button of document.querySelectorAll('[data-walk]')){
 button.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();navigation.move(button.dataset.walk,.5);navigation.startMove(button.dataset.walk);try{button.setPointerCapture(event.pointerId);}catch{}});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>navigation.stopMove(button.dataset.walk));
 button.addEventListener('click',event=>{if(event.detail===0)navigation.move(button.dataset.walk);});
}
for(const type of ['pointerup','pointercancel'])window.addEventListener(type,()=>navigation.stopInput());
$('hands').onclick=async()=>{
 if(handControls.state.running||handControls.state.phase==='loading'){handControls.stop();return;}
 markCustom();navigation.stopInput();if(navigation.state.mode==='walk')navigation.setMode('orbit');navigation.setEnabled(false);stopSpin();try{await handControls.start();}catch(error){console.warn('Local hand tracking',error.name,error.message);}
};
$('hand-stop').onclick=()=>handControls.stop();
window.addEventListener('pagehide',()=>{handControls.stop();tour?.stop('page hidden');});
document.addEventListener('visibilitychange',()=>{if(document.hidden)handControls.stop();});
tour=createCampusTour({camera,controls,reducedMotion,requestRender,
 ui:{root:$('tour-overlay'),title:$('tour-title'),caption:$('tour-caption'),more:$('tour-more'),counter:$('tour-counter'),progress:$('tour-progress'),fade:$('tour-fade'),end:$('tour-end'),next:$('tour-next'),back:$('tour-back'),stops:$('tour-stops')},
 onStart(){
  tourFrameTiming.clear();
  handControls.stop();navigation.stopInput();navigation.setMode('orbit');navigation.setEnabled(false);markCustom();clearTimeout(toastTimer);$('toast').hidden=true;$('restore').hidden=true;$('more').open=false;
  for(const id of ['comparison','assumptions','preview'])if($(id).open)$(id).close();
  tourSavedLayers={roofs:$('roofs-toggle').checked,systems:$('systems-toggle').checked};
  $('roofs-toggle').checked=true;$('systems-toggle').checked=false;applyLayerVisibility();
  renderer.domElement.style.cursor='default';renderer.domElement.setAttribute('aria-label','Automatic guided campus tour. Press Escape to end.');
 },
 onChapter(chapter){camera.fov=chapter.poses[0].fov||40;camera.updateProjectionMatrix();
  $('systems-toggle').checked=!!chapter.presentation?.systems;$('roofs-toggle').checked=chapter.presentation?.roofs!==false;applyLayerVisibility();
  const target=new THREE.Vector3(...chapter.poses[0].t),radius=chapter.id==='campus'||chapter.id==='campus-finish'?Math.max(200,(state.bounds.max[0]-state.bounds.min[0])*.56):110;
  sun.target.position.copy(target);sun.position.copy(target).add(new THREE.Vector3(-230,380,-220));
  Object.assign(sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius});sun.shadow.camera.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;
  renderer.domElement.dataset.tourChapter=chapter.id;
 },
 onEnd(reason){
  if(tourSavedLayers){$('roofs-toggle').checked=tourSavedLayers.roofs;$('systems-toggle').checked=tourSavedLayers.systems;tourSavedLayers=null;applyLayerVisibility();}
  markCustom();navigation.setEnabled(true);navigation.sync();updateNavigationUI();
  renderer.domElement.dataset.tourEndReason=reason;$('tour-start').focus({preventScroll:true});
 }
});
$('tour-start').onclick=()=>{
 if(!state.loaded||captureBusy)return;
 try{
  const path=getCampusTour(selectedOption.id);
  if(path.modelSha256!==selectedOption.model_sha256)throw new Error('The saved campus changed; its tour path needs updating.');
  tour.start(path);
 }catch(error){console.warn('Campus tour',error);toast(error.message||'This campus tour could not start.');}
};
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();renderer.domElement.addEventListener('dblclick',event=>{if(!model||tour?.active||navigation?.state.mode==='walk')return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(model,true).find(hit=>{for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;return true;});if(!hit)return;markCustom();const direction=camera.position.clone().sub(controls.target).normalize(),distance=THREE.MathUtils.clamp(camera.position.distanceTo(hit.point)*.35,12,100);transition={start:performance.now(),duration:reducedMotion?0:600,p:camera.position.clone(),t:controls.target.clone(),endP:hit.point.clone().addScaledVector(direction,distance),endT:hit.point.clone()};$('view-title').textContent='Detail view';requestRender();});
function instanceRepeatedGeometry(root){
  root.updateMatrixWorld(true);
  const groups=new Map();
  root.traverse(object=>{
    if(!object.isMesh||object.isInstancedMesh||object.isSkinnedMesh||object.geometry.morphAttributes?.position)return;
    // Only repeated authored geometry is instanced. Every vertex, material and placement is retained.
    let visible=true,isRoof=false,isSystem=false,nativeKind=null;
    for(let parent=object;parent;parent=parent.parent){visible=visible&&parent.visible;isRoof=isRoof||isRoofObject(parent);isSystem=isSystem||isBuildingService(parent);if(parent.userData.kind==='specified_grove_tree_visual')nativeKind=parent.userData.kind;if(parent===root)break;}
    const materials=[].concat(object.material).map(material=>material.uuid).join(',');
    const key=[object.geometry.uuid,materials,visible,isRoof,isSystem,nativeKind,object.castShadow,object.receiveShadow,object.renderOrder,object.layers.mask].join(';');
    if(!groups.has(key))groups.set(key,{objects:[],isRoof,isSystem,visible,nativeKind});groups.get(key).objects.push(object);
  });
  const inverseRoot=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),check=new THREE.Matrix4();
  let sources=0,instances=0;
  for(const entry of groups.values()){
    if(entry.objects.length<16)continue;
    const first=entry.objects[0],mesh=new THREE.InstancedMesh(first.geometry,first.material,entry.objects.length);
    mesh.name='Native repeated geometry / '+first.name;mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.renderOrder=first.renderOrder;mesh.layers.mask=first.layers.mask;mesh.visible=entry.visible;
    mesh.userData={kind:entry.isRoof?'roof':entry.isSystem?'mep_presentation':entry.nativeKind||'native_repeated_geometry',discipline:entry.isSystem?'coordinated building services':undefined};
    for(let i=0;i<entry.objects.length;i++){
      const source=entry.objects[i];matrix.multiplyMatrices(inverseRoot,source.matrixWorld);mesh.setMatrixAt(i,matrix);
      check.multiplyMatrices(root.matrixWorld,matrix);
      if(check.elements.some((value,n)=>Math.abs(value-source.matrixWorld.elements[n])>1e-8))throw new Error('Native placement changed during instance grouping');
    }
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();root.add(mesh);
    for(const object of entry.objects)object.removeFromParent();sources+=entry.objects.length;instances+=mesh.count;
  }
  if(sources!==instances)throw new Error('Native geometry count changed during instance grouping');
  state.repeatedGeometry={sources,instances};
  root.updateMatrixWorld(true);
}
function partitionNativeInstances(root){
  root.updateMatrixWorld(true);
  const sources=[];root.traverse(object=>{if(object.isInstancedMesh&&object.count>16&&!object.morphTexture)sources.push(object);});
  let originalInstances=0,preservedInstances=0,originalMeshes=0,tileMeshes=0;
  const local=new THREE.Matrix4(),world=new THREE.Matrix4(),position=new THREE.Vector3(),color=new THREE.Color();
  for(const source of sources){
    const tiles=new Map();
    for(let i=0;i<source.count;i++){
      source.getMatrixAt(i,local);world.multiplyMatrices(source.matrixWorld,local);position.setFromMatrixPosition(world);
      const key=Math.floor(position.x/20)+','+Math.floor(position.z/20);
      if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(i);
    }
    if(tiles.size<2)continue;
    originalMeshes++;originalInstances+=source.count;
    for(const [key,indices]of tiles){
      const tile=new THREE.InstancedMesh(source.geometry,source.material,indices.length);
      tile.name=source.name+' / spatial tile '+key;tile.userData={...source.userData};
      tile.matrixAutoUpdate=false;tile.matrix.copy(source.matrix);tile.visible=source.visible;
      tile.castShadow=source.castShadow;tile.receiveShadow=source.receiveShadow;tile.renderOrder=source.renderOrder;tile.layers.mask=source.layers.mask;
      for(let i=0;i<indices.length;i++){
        source.getMatrixAt(indices[i],local);tile.setMatrixAt(i,local);
        if(source.instanceColor){source.getColorAt(indices[i],color);tile.setColorAt(i,color);}
      }
      tile.instanceMatrix.needsUpdate=true;if(tile.instanceColor)tile.instanceColor.needsUpdate=true;
      tile.computeBoundingBox();tile.computeBoundingSphere();source.parent.add(tile);tileMeshes++;preservedInstances+=indices.length;
    }
    source.removeFromParent();source.dispose();
  }
  if(originalInstances!==preservedInstances)throw new Error('Native instance count changed during spatial grouping');
  state.instancePartition={originalInstances,preservedInstances,originalMeshes,tileMeshes};
  renderer.domElement.dataset.nativeInstances=String(preservedInstances);renderer.domElement.dataset.spatialTiles=String(tileMeshes);
  root.updateMatrixWorld(true);
}
async function loadTreeDistanceGeometry(){
 if(treeDistanceLoad)return treeDistanceLoad;
 treeDistanceLoad=(async()=>{
  const response=await fetch(assetURL('vegetation-tree-distance.glb'),{method:'HEAD',cache:'no-cache'});
  if(!response.ok)return;
  const gltf=await new GLTFLoader().loadAsync(assetURL('vegetation-tree-distance.glb'));gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(object=>{
   if(!object.isMesh||Array.isArray(object.material))return;
   const kind=['branches','leaves','trunk'].find(name=>object.material.name.includes('tree_small_02_'+name));if(!kind)return;
   // The distant asset has unit height. Native instances use source-height
   // geometry and scale by scheduled height / 4.55700394 metres.
   const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld).scale(4.55700394,4.55700394,4.55700394);geometry.computeBoundingBox();geometry.computeBoundingSphere();treeDistanceGeometries.set(kind,geometry);
  });
  if(treeDistanceGeometries.size!==3)throw new Error('Distant tree must have all three source materials');
  disposeModel(gltf.scene);
 })().catch(error=>{console.warn('Distant tree geometry unavailable',error);treeDistanceGeometries.clear();});
 return treeDistanceLoad;
}
function connectTreeDistanceGeometry(root){
 treeDetailMeshes.length=0;
 root.traverse(object=>{
  if(!object.isInstancedMesh||object.userData.kind!=='specified_grove_tree_visual'||Array.isArray(object.material))return;
  const kind=['branches','leaves','trunk'].find(name=>object.material.name.includes('tree_small_02_'+name)),geometry=treeDistanceGeometries.get(kind);if(!geometry)return;
  object.userData.nativeTreeGeometry=object.geometry;object.userData.distanceTreeGeometry=geometry;object.userData.nativeTreeSphere=object.boundingSphere.clone();treeDetailMeshes.push(object);
 });
 renderer.domElement.dataset.treeDetailTiles=String(treeDetailMeshes.length);
}
function batchStaticGeometry(root){
  instanceRepeatedGeometry(root);
  partitionNativeInstances(root);
  root.updateMatrixWorld(true);
  const groups=new Map(),sources=[];
  root.traverse(object=>{
    if(!object.isMesh||object.isSkinnedMesh||object.isInstancedMesh||Array.isArray(object.material)||object.material.transparent)return;
    let isSystem=isBuildingService(object);let isRoof=false;for(let parent=object;parent&&parent!==root;parent=parent.parent)if(isRoofObject(parent))isRoof=true;
    const geometry=object.geometry;
    const attributes=Object.keys(geometry.attributes).sort().map(name=>{const a=geometry.attributes[name];return name+':'+a.itemSize+':'+a.normalized+':'+a.array.constructor.name;}).join('|');
    let transmissionTile='';
    if(object.material.transmission>.01){
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      const center=geometry.boundingBox.clone().applyMatrix4(object.matrixWorld).getCenter(new THREE.Vector3());
      transmissionTile=Math.floor(center.x/20)+','+Math.floor(center.z/20);
    }
    const key=[object.material.uuid,isRoof,isSystem,!!geometry.index,attributes,object.castShadow,object.receiveShadow,transmissionTile].join(';');
    if(!groups.has(key))groups.set(key,{material:object.material,isRoof,isSystem,castShadow:object.castShadow,receiveShadow:object.receiveShadow,objects:[]});
    groups.get(key).objects.push(object);sources.push(object);
  });
  const mergedGroup=new THREE.Group();mergedGroup.name='Runtime presentation batches';
  let batchedSources=0;
  for(const entry of groups.values()){
    if(entry.objects.length<2)continue;
    // Bake each object's world transform into vertices. No authored asset is changed.
    const geometries=entry.objects.map(object=>{
      const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
      if(object.matrixWorld.determinant()<0&&geometry.index){const indices=geometry.index.array;for(let i=0;i<indices.length;i+=3){const swap=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=swap;}}
      return geometry;
    });
    const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
    if(!geometry)continue;
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,entry.material);mesh.name=(entry.isRoof?'Roof_':'Batch_')+entry.material.name;
    mesh.castShadow=entry.castShadow;mesh.receiveShadow=entry.receiveShadow;mesh.userData.kind=entry.isRoof?'roof':entry.isSystem?'mep_presentation':'presentation';mesh.userData.discipline=entry.isSystem?'coordinated building services':undefined;mergedGroup.add(mesh);
    for(const object of entry.objects){object.removeFromParent();batchedSources++;}
  }
  root.add(mergedGroup);roofs.length=0;systems.length=0;let visibleMeshes=0;
  root.traverse(object=>{if(object.isMesh){visibleMeshes++;if(isBuildingService(object))systems.push(object);}if(isRoofObject(object))roofs.push(object);});
  state.batching={sourceMeshes:state.meshes,mergedSources:batchedSources,presentationMeshes:visibleMeshes,batchCount:mergedGroup.children.length};
  state.roofs=roofs.length;
  root.updateMatrixWorld(true);
}

function disposeModel(root){if(!root)return;const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(object=>{if(object.isMesh){geometries.add(object.geometry);if(object.userData.nativeTreeGeometry)geometries.add(object.userData.nativeTreeGeometry);[].concat(object.material).forEach(m=>materials.add(m));}});for(const m of materials)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);const sharedDistance=new Set(treeDistanceGeometries.values());geometries.forEach(g=>{if(!sharedDistance.has(g))g.dispose();});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();}
function clearModel(){additions=null;integratedNavigation=null;integratedLightingMode=null;treeVisibility.dispose();state.treeVisibility=null;document.body.classList.remove('inside-building');state.interiorHall=null;$('exit-building').disabled=true;nightLighting.clearModel();renderTiming.clear();tourFrameTiming.clear();tour?.stop('option changed');clickTravel?.stop();clickTravel=null;collision?.dispose();collision=null;campusNavigation?.dispose();campusPlan=null;destinationMap.clear();navigation?.stopInput();navigation?.setEnabled(false);pendingNavigation=null;stopSpin();transition=null;disposeModel(model);treeDetailMeshes.length=0;model=null;roofs.length=0;systems.length=0;emissionMaterials.clear();modelLights=[];state.loaded=false;state.selectedView=null;state.meshes=0;state.bounds=null;state.campusBounds=null;state.presets={};state.triangles=0;state.lights=0;state.roofs=0;state.authoredRoofs=0;state.batching=null;state.measuredFrameRate=null;state.lastFrameAt=null;frameIntervals.length=0;document.body.dataset.loaded='false';$('views').replaceChildren();$('inside-sports').disabled=true;$('inside-events').disabled=true;$('inside-hills').disabled=true;$('roofs-toggle').checked=true;for(const id of ['roofs-toggle','systems-toggle','shadows-toggle','day','night','zoom-in','zoom-out','spin','capture','turn','move','home','hands','tour-start','walk-forward','walk-back','walk-left','walk-right'])$(id).disabled=true;$('glb-download').hidden=true;$('preview-open').hidden=true;$('gallery-items').replaceChildren();if($('preview').open)$('preview').close();document.querySelectorAll('[data-download]').forEach(link=>link.hidden=true);draw();}
function integer(value){return Number(value).toLocaleString('en-US',{maximumFractionDigits:0});}
function decimal(value){return Number(value).toLocaleString('en-US',{maximumFractionDigits:1});}
function parkingLabel(option){const p=option.parking||{};if(p.strategy==='garage')return 'Garage only · '+integer(p.garage_spaces)+' spaces';if(p.strategy==='surface')return 'Surface only · '+integer(p.surface_spaces)+' spaces';return 'Parking strategy unresolved';}
function showSummary(option){$('selected-number').textContent=option.id.replace('option-','Option ')+' · Drawing package '+option.id.replace('option-','');$('selected-title').textContent=option.title;$('selected-design').textContent=option.design||'';$('parking-strategy').textContent=parkingLabel(option);$('facts').replaceChildren();const facts=option.facts||{},entries=[];if(Number.isFinite(facts.main_halls))entries.push([integer(facts.main_halls),'main halls']);if(Number.isFinite(facts.building_area_sf))entries.push([integer(facts.building_area_sf),'sq ft · main halls']);if(Number.isFinite(facts.site_area_acres))entries.push([decimal(facts.site_area_acres),'acres · site used']);if(Number.isFinite(facts.footprint_acres))entries.push([decimal(facts.footprint_acres),'acres · building footprint']);if(Number.isFinite(facts.parking_structures))entries.push([integer(facts.parking_structures),'parking structures']);for(const [value,label] of entries){const item=document.createElement('div'),number=document.createElement('strong'),name=document.createElement('span');number.textContent=value;name.textContent=label;item.append(number,name);$('facts').append(item);}document.querySelectorAll('[data-option]').forEach(button=>button.setAttribute('aria-checked',String(button.dataset.option===option.id)));}
async function refreshGallery(option,epoch){
  const choices=Array.isArray(option.renders)&&option.renders.length?option.renders:option.render?[{file:option.render,label:'Campus overview'}]:[];
  const unique=[...new Map(choices.filter(item=>item?.file).map(item=>[item.file,item])).values()];
  const checks=await Promise.allSettled(unique.map(async item=>{const href=new URL(assetURL(item.file));if(item.image_sha256)href.searchParams.set('v',item.image_sha256.slice(0,16));const response=await fetch(href,{method:'HEAD',cache:'no-cache'});return response.ok?{...item,href}:null;}));
  if(epoch!==generation)return;
  const figures=[];
  for(const result of checks){
    if(result.status!=='fulfilled'||!result.value)continue;
    const item=result.value,figure=document.createElement('figure'),link=document.createElement('a'),img=document.createElement('img'),caption=document.createElement('figcaption');
    link.href=item.href;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label','Open '+(item.label||'rendered view')+' image');
    img.src=item.href;img.alt=option.title+' · '+(item.label||'Rendered view');img.loading='lazy';img.decoding='async';
    img.onerror=()=>{figure.remove();if(!$('gallery-items').children.length){$('preview-open').hidden=true;if($('preview').open)$('preview').close();}};
    caption.textContent=item.label||'Rendered view';link.append(img);figure.append(link,caption);figures.push(figure);
  }
  $('gallery-items').replaceChildren(...figures);$('preview-title').textContent=option.title;$('preview-open').hidden=!figures.length;
  state.renderedViews=figures.length;
}
async function refreshComparisonDownload(){
  try{const href=new URL(assetURL('two-options-comparison.pdf'));if(manifest.comparison_sha256)href.searchParams.set('v',manifest.comparison_sha256.slice(0,16));const response=await fetch(href,{method:'HEAD',cache:'no-cache'});document.querySelectorAll('[data-comparison-pdf]').forEach(link=>{link.hidden=!response.ok;if(response.ok){link.href=href.href;link.download='two-options-comparison.pdf';}});}catch{document.querySelectorAll('[data-comparison-pdf]').forEach(link=>link.hidden=true);}
}
async function refreshDownloads(option,epoch){
  const entries=Object.entries(option.downloads||{});
  await Promise.allSettled([refreshGallery(option,epoch),...entries.map(async([type,path])=>{const href=new URL(assetURL(path));if(option.download_sha256?.[type])href.searchParams.set('v',option.download_sha256[type].slice(0,16));const response=await fetch(href,{method:'HEAD',cache:'no-cache'});if(!response.ok||epoch!==generation)return;document.querySelectorAll('[data-download="'+type+'"]').forEach(link=>{link.href=href;link.download=path.split('/').at(-1);link.hidden=false;});})]);
}
function buildViews(bounds,option){let parcel=campusPlan?.option?.site?.bounds_m;if(parcel&&additions){const b=additions.placement.hills.pairPlacementBoundsXY||[];parcel=[Math.min(parcel[0],...b.map(x=>x[0])),Math.min(parcel[1],...b.map(x=>x[1])),Math.max(parcel[2],...b.map(x=>x[2])),Math.max(parcel[3],...b.map(x=>x[3]))];}if(parcel?.length===4&&parcel.every(Number.isFinite)){bounds=new THREE.Box3(new THREE.Vector3(parcel[0],0,-parcel[3]),new THREE.Vector3(parcel[2],state.bounds.max[1],-parcel[1]));state.campusBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};}const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),distance=Math.max(size.x,size.z)*1.10;presets={overview:{p:[center.x+distance*.72,Math.max(150,distance*.6),center.z+distance*.85],t:[center.x,0,center.z],label:'Whole campus'},above:{p:[center.x,Math.max(500,distance*1.4),center.z+.01],t:[center.x,0,center.z],label:'Site from above'}};for(const [name,view] of Object.entries(option.views||{}))if(view.p?.length===3&&view.t?.length===3&&!(additions&&['overview','above'].includes(name)))presets[name]={...view};if(integratedNavigation)Object.assign(presets,integratedNavigation.presets);state.presets=Object.fromEntries(Object.entries(presets).map(([name,p])=>[name,{...p,p:[...p.p],t:[...p.t]}]));const labels={overview:'Whole campus',sports:'Sports hall',events:'Events hall',garage:'Garage',parking:'Parking',arrival:'Arrival plaza',entry:'Entry detail',events_entry:'Events entrance',interior:'Inside hall',soccer_spectators:'Soccer stands',useful_site:'Activity park',gardens:'Gardens',stage:'Stage',above:'Site from above'};
const standView=presets.soccer_spectators;
if(standView){const p=standView.p;standView.p=[p[0]-19,8,p[2]+8];standView.t=[p[0]+2.2,1.4,p[2]-35.5];standView.label='Sideline soccer stands';}
if(presets.stage){const v=presets.stage;v.p=[v.p[0]+43,19,v.p[2]-38];v.t=[v.t[0],4,v.t[2]-3];v.label='Amphitheater stage';}
if(presets.useful_site)presets.useful_site.label='Activity park';
$('views').replaceChildren();const select=document.createElement('select');select.id='view-select';select.setAttribute('aria-label','Jump to a building');const custom=document.createElement('option');custom.value='';custom.textContent='Jump to a building';custom.disabled=true;select.append(custom);if(option.id==='option-05')for(const name of ['sports','events','entry','stage','soccer_spectators','useful_site','parking','gardens'])delete presets[name];destinationMap=new Map(getCampusDestinations(campusPlan,getCampusTour(option.id)).map(d=>[d.id,d]));for(const d of destinationMap.values()){if(presets[d.id])continue;presets[d.id]={...d.pose,label:d.label,walk:d.pose.walk??d.pose.p[1]<=1.9,dissolve:true};}campusNavigation.rebuild(campusPlan,getCampusTour(option.id));for(const [name,view] of Object.entries(presets)){const choice=document.createElement('option');choice.value=name;choice.textContent=labels[name]||view.label||name;select.append(choice);}select.onchange=()=>selectView(select.value);$('views').append(select);}
async function loadOption(id){const option=manifest.options.find(item=>item.id===id);if(!option)return;if(option.modelAvailable===false){toast('This 3D option is unavailable.');return;}if(captureBusy){toast('Finishing the image save…');return;}const epoch=++generation;selectedOption=option;clearModel();state.option=option.id;const modelHref=new URL(assetURL(option.model));if(option.model_sha256)modelHref.searchParams.set('v',option.model_sha256.slice(0,16));state.modelURL=modelHref.href;state.error=null;showSummary(option);setStatus('Opening '+option.title,'Loading this planning option in 3D…');$('progress').removeAttribute('value');$('progress').hidden=false;refreshDownloads(option,epoch);try{const planResponse=await fetch(assetURL(option.plan||option.id+'-plan.json'),{cache:'no-cache'});if(!planResponse.ok)throw new Error('The campus room plan could not load.');const loadedPlan=await planResponse.json();if(epoch!==generation)return;const distanceReady=loadTreeDistanceGeometry();const additionReady=option.id==='option-05'?loadCampusAdditions({assets,status:text=>$('load-detail').textContent=text}):Promise.resolve(null);const gltf=await new GLTFLoader().loadAsync(state.modelURL,event=>{if(epoch!==generation)return;if(event.total){$('progress').max=event.total;$('progress').value=event.loaded;$('load-detail').textContent='Loading the 3D option · '+Math.min(100,Math.round(event.loaded/event.total*100))+'%';}});if(epoch!==generation){disposeModel(gltf.scene);return;}await distanceReady;if(epoch!==generation){disposeModel(gltf.scene);return;}const loadedAdditions=await additionReady;if(epoch!==generation){disposeModel(gltf.scene);if(loadedAdditions){disposeModel(loadedAdditions.hall.scene);for(const group of loadedAdditions.groups)disposeModel(group);}return;}model=gltf.scene;additions=loadedAdditions;if(additions){state.replacedInteriorObjects=additions.attachHall(model);integratedNavigation=createIntegratedNavigation({getBaseTour,getBaseDestinations,placement:additions.placement,baseModelSha256:option.model_sha256});state.integration={shells:additions.placement.hills.shells,pairs:additions.groups.length,site:additions.prepareSite(model),hallSHA:additions.placement.hall.sha256,hillsSHA:additions.placement.hills.sha256,placement:additions.placement.hills.nativeOffsets};}model.updateMatrixWorld(true);model.traverse(object=>{if(isRoofObject(object))roofs.push(object);if(object.isLight&&!object.userData.integratedLight){if(object.isPointLight||object.isSpotLight)modelLights.push({light:object,intensity:object.intensity});object.intensity=0;object.visible=false;}if(object.isMesh){state.meshes++;object.castShadow=![].concat(object.material).some(m=>m.transmission>.01);object.receiveShadow=true;for(const material of [].concat(object.material))if(material.emissive&&(material.emissive.r>0||material.emissive.g>0||material.emissive.b>0)&&!emissionMaterials.has(material))emissionMaterials.set(material,material.emissiveIntensity);}});state.authoredRoofs=roofs.length;state.lights=modelLights.length;const collisionStart=performance.now();collision=createNavigationCollision(model);state.navigationCollision={...collision.stats,buildMs:performance.now()-collisionStart};renderer.domElement.dataset.collisionStats=JSON.stringify(state.navigationCollision);clickTravel=createClickToGo({camera,collision,onPose:p=>{const offset=new THREE.Vector3(...p).sub(camera.position);camera.position.add(offset);controls.target.add(offset);camera.lookAt(controls.target);camera.updateMatrixWorld();navigation.sync();},onBlocked:toast,requestRender});batchStaticGeometry(model);connectTreeDistanceGeometry(model);treeVisibility.prepare(treeDetailMeshes);if(additions){additions.attachHills(model);for(const group of additions.groups)group.traverse(o=>{if(o.userData.section_hide)roofs.push(o);});}const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());state.bounds={min:bounds.min.toArray(),max:bounds.max.toArray()};const radius=Math.max(size.x,size.z)*.56;sun.target.position.copy(center);sun.position.copy(center).add(new THREE.Vector3(-230,380,-220));Object.assign(sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:1,far:1400});sun.shadow.camera.updateProjectionMatrix();campusPlan=loadedPlan;buildViews(bounds,option);scene.add(model);nightLighting.setSources(modelLights);setLighting(state.lighting);selectView('overview',true);renderer.shadowMap.needsUpdate=true;$('load-detail').textContent='Preparing the selected option…';if(additions){$('load-detail').textContent='Preparing performance hall lighting…';const indoorCamera=camera.clone();for(const id of ['performance-hall','hills-interior-1','hills-interior-2']){const indoorView=integratedNavigation.presets[id];if(!indoorView)continue;indoorCamera.position.fromArray(indoorView.p);indoorCamera.lookAt(new THREE.Vector3(...indoorView.t));indoorCamera.updateMatrixWorld();try{additions.lighting(indoorCamera,state.lighting==='night');await renderer.compileAsync(scene,indoorCamera);}finally{additions.lighting(camera,state.lighting==='night');}}}await renderer.compileAsync(scene,camera);if(epoch!==generation)return;draw();state.loaded=true;buildInteriorEntrances(option);navigation.setEnabled(true);state.error=null;document.body.dataset.loaded='true';$('loading').hidden=true;for(const id of ['systems-toggle','shadows-toggle','day','night','zoom-in','zoom-out','spin','capture','turn','move','home','hands','tour-start','walk-forward','walk-back','walk-left','walk-right'])$(id).disabled=false;$('roofs-toggle').disabled=!roofs.length;toggleSystems(false);$('systems-toggle').disabled=!systems.length;$('glb-download').href=state.modelURL;$('glb-download').download=option.model.split('/').at(-1);$('glb-download').hidden=false;$('glb-download').textContent=additions?'Original campus model · 3D':'Current option · 3D';$('inside-hills').disabled=!additions;const url=new URL(location.href);url.searchParams.set('option',id);history.replaceState(null,'',url);requestRender();}catch(error){if(epoch===generation)showError(error);}}
function buildPicker(){const picker=$('option-picker');picker.replaceChildren();for(const option of manifest.options.filter(option=>option.id==='option-05')){const button=document.createElement('button'),number=document.createElement('span'),title=document.createElement('span'),parking=document.createElement('small');button.className='option-choice';button.dataset.option=option.id;button.setAttribute('role','radio');button.setAttribute('aria-checked','false');number.className='option-number';number.textContent='OPTION '+option.id.replace('option-','');title.className='option-title';title.textContent=option.title;parking.textContent=option.parking?.strategy==='garage'?'Garage only':'Surface only';button.append(number,title,parking);button.onclick=()=>loadOption(option.id);picker.append(button);}$('option-counter').textContent='Selected design';$('compare-open').disabled=false;$('compare-menu').disabled=false;}
async function buildComparison(){const body=$('comparison-rows');body.replaceChildren();for(const option of manifest.options){const row=document.createElement('tr'),nameCell=document.createElement('td'),button=document.createElement('button');button.textContent=option.id.replace('option-','')+' · '+option.title;button.onclick=()=>{$('comparison').close();loadOption(option.id);};if(option.modelAvailable===false){nameCell.textContent=button.textContent+' (comparison only)';}else nameCell.append(button);row.append(nameCell);const f=option.facts||{},values=[option.design||'—',parkingLabel(option),Number.isFinite(f.main_halls)?integer(f.main_halls):'—',Number.isFinite(f.building_area_sf)?integer(f.building_area_sf)+' sq ft':'—',Number.isFinite(f.site_area_acres)?decimal(f.site_area_acres)+' acres':'—'];for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}const drawing=document.createElement('td');drawing.textContent='Preparing package';row.append(drawing);body.append(row);if(option.downloads?.pdf){const href=new URL(assetURL(option.downloads.pdf));if(option.download_sha256?.pdf)href.searchParams.set('v',option.download_sha256.pdf.slice(0,16));fetch(href,{method:'HEAD',cache:'no-cache'}).then(response=>{if(!response.ok)return;const link=document.createElement('a');link.href=href;link.download=option.downloads.pdf.split('/').at(-1);link.textContent='Dimensioned plan';drawing.replaceChildren(link);}).catch(()=>{});}}}
$('panel-toggle').onclick=()=>{
 const collapsed=document.body.classList.toggle('panel-collapsed');$('panel-toggle').setAttribute('aria-expanded',String(!collapsed));
 if(state.loaded&&isSiteView(state.selectedView))selectView(state.selectedView,true);else requestRender();
};
$('previous-option').onclick=()=>{$('more').open=false;loadOption('option-02');};
function openSheet(id){if(id==='comparison')refreshComparisonDownload();if(id==='preview'&&selectedOption)refreshGallery(selectedOption,generation);$(id).showModal();$('more').open=false;}document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());for(const id of ['comparison','assumptions','preview'])$(id).addEventListener('click',event=>{if(event.target===$(id)){const r=$(id).getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$(id).close();}});$('compare-open').onclick=()=>openSheet('comparison');$('compare-menu').onclick=()=>openSheet('comparison');$('assumptions-open').onclick=()=>openSheet('assumptions');$('scope-note').onclick=()=>openSheet('assumptions');$('preview-open').onclick=()=>openSheet('preview');
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}function downloadBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function centerFullSiteCapture(w,h){
  const direction=camera.position.clone().sub(controls.target).normalize(),center=new THREE.Vector3(...state.bounds.min).add(new THREE.Vector3(...state.bounds.max)).multiplyScalar(.5);
  const horizontal=new THREE.Vector3().crossVectors(camera.up,direction);if(horizontal.lengthSq()<1e-10)horizontal.set(1,0,0);horizontal.normalize();
  const vertical=new THREE.Vector3().crossVectors(direction,horizontal).normalize(),tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/camera.zoom;
  const projected=[];
  const framing=state.campusBounds||state.bounds;
  for(const x of [framing.min[0],framing.max[0]])for(const y of [framing.min[1],framing.max[1]])for(const z of [framing.min[2],framing.max[2]]){
    const delta=new THREE.Vector3(x,y,z).sub(center);projected.push({x:delta.dot(horizontal),y:delta.dot(vertical),depth:delta.dot(direction)});
  }
  const extents=distance=>{const xx=projected.map(p=>p.x/((distance-p.depth)*tanV*camera.aspect)),yy=projected.map(p=>p.y/((distance-p.depth)*tanV));return {left:Math.min(...xx),right:Math.max(...xx),bottom:Math.min(...yy),top:Math.max(...yy)};};
  const fits=e=>Math.max(e.right-e.left,e.top-e.bottom)<=1.84;
  let lo=Math.max(...projected.map(p=>p.depth))+camera.near*2,hi=Math.max(50,lo+50);
  while(!fits(extents(hi)))hi*=2;
  for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(fits(extents(mid)))hi=mid;else lo=mid;}
  const distance=hi,e=extents(distance);camera.clearViewOffset();camera.far=Math.max(camera.far,distance+new THREE.Vector3(...state.bounds.max).sub(new THREE.Vector3(...state.bounds.min)).length()*1.2);
  camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);
  // Center the projected campus silhouette, without the interactive UI margins.
  camera.setViewOffset(w,h,(e.left+e.right)*w/4,-(e.bottom+e.top)*h/4,w,h);camera.updateMatrixWorld(true);
}
$('capture').onclick=async()=>{
  if(!state.loaded||captureBusy||tour?.active)return;if(transition){toast('Wait until this view opens, then save it.');return;}
  const savedCamera=camera.clone(),savedTarget=controls.target.clone(),savedTransition=transition,savedAutoRotate=controls.autoRotate,savedEnabled=controls.enabled,savedMaxDistance=controls.maxDistance;
  const captureTargets=[composer.renderTarget1,composer.renderTarget2],savedSamples=captureTargets.map(target=>target.samples);
  const savedSpinLabel=$('spin').textContent,savedSpinPressed=$('spin').getAttribute('aria-pressed'),fullSite=isSiteView(state.selectedView)&&!!state.bounds;
  clickTravel?.stop();navigation.stopInput();if(transition?.dissolve){$('tour-fade').hidden=true;$('tour-fade').style.opacity='0';}transition=null;stopSpin();controls.enabled=false;captureBusy=true;if(frameId){cancelAnimationFrame(frameId);frameId=null;}
  const ratio=renderer.getPixelRatio(),size=renderer.getSize(new THREE.Vector2()),limit=Math.min(3840,renderer.capabilities.maxTextureSize),scale=limit/Math.max(size.x,size.y),w=Math.round(size.x*scale),h=Math.round(size.y*scale);
  $('capture').disabled=true;
  try{
    // Preserve the established high-resolution export path and its memory budget.
    for(const target of captureTargets){if(target.samples!==0){target.samples=0;target.dispose();}}
    renderer.setPixelRatio(1);renderer.setSize(w,h,false);composer.setPixelRatio(1);composer.setSize(w,h);camera.aspect=w/h;if(fullSite)centerFullSiteCapture(w,h);else camera.updateProjectionMatrix();draw();
    const blob=await new Promise((resolve,reject)=>renderer.domElement.toBlob(value=>value?resolve(value):reject(new Error('Image export failed')),'image/png'));
    downloadBlob(blob,'Worldwide Stages - '+selectedOption.id+' - '+new Date().toISOString().replace(/[:.]/g,'-')+'.png');state.lastCapture={width:w,height:h,bytes:blob.size,option:selectedOption.id,composition:fullSite?'centered full site':'current angle'};toast('Image saved · '+w+' × '+h);
  }catch(error){console.error(error);toast('Image could not be saved. Please try again.');}
  finally{
    captureTargets.forEach((target,i)=>{if(target.samples!==savedSamples[i]){target.samples=savedSamples[i];target.dispose();}});
    renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);composer.setPixelRatio(ratio);composer.setSize(size.x,size.y);
    camera.copy(savedCamera);controls.target.copy(savedTarget);controls.autoRotate=savedAutoRotate;controls.enabled=savedEnabled;controls.maxDistance=savedMaxDistance;transition=savedTransition;$('spin').textContent=savedSpinLabel;$('spin').setAttribute('aria-pressed',savedSpinPressed);
    captureBusy=false;navigation.setEnabled(state.loaded&&!handControls.state.running&&handControls.state.phase!=='loading');$('capture').disabled=false;if(host.clientWidth!==size.x||host.clientHeight!==size.y)resize();else{draw();requestRender();}
  }
};
function cleanMode(enabled){document.body.classList.toggle('clean',enabled);$('restore').hidden=!enabled;$('more').open=false;}$('clean').onclick=()=>cleanMode(true);$('restore').onclick=()=>cleanMode(false);document.addEventListener('keydown',event=>{if(tour?.active){if(event.key==='Escape'){event.preventDefault();tour.stop('ended');}return;}if(event.key==='Escape')cleanMode(false);if(event.key.toLowerCase()==='h'&&!event.metaKey&&!event.ctrlKey)cleanMode(!document.body.classList.contains('clean'));});function fullscreenFeedback(){
  const enabled=!!document.fullscreenElement;
  document.documentElement.dataset.fullscreenMode=enabled?'on':'off';
  $('fullscreen').textContent=enabled?'Exit full screen':'Full screen';
  resize();
}
$('fullscreen').onclick=async()=>{
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({navigationUI:'hide'});
    fullscreenFeedback();
  }catch{
    document.documentElement.dataset.fullscreenMode='unavailable';
    cleanMode(true);toast('Controls hidden for an unobstructed view');
  }
  $('more').open=false;
};
document.addEventListener('fullscreenchange',fullscreenFeedback);
document.addEventListener('pointerdown',event=>{if(!$('more').contains(event.target))$('more').open=false;});document.addEventListener('visibilitychange',()=>{if(document.hidden){clickTravel?.stop();tour?.stop('tab hidden');if(frameId)cancelAnimationFrame(frameId);frameId=null;}else requestRender();});
async function start(){try{const response=await fetch(new URL('./assets/options.json',import.meta.url),{cache:'no-cache'});if(!response.ok)throw new Error('Planning index unavailable');manifest=await response.json();if(!Array.isArray(manifest.options)||!manifest.options.length)throw new Error('No planning options in the index');state.manifest=manifest;buildPicker();buildComparison();refreshComparisonDownload();$('assumptions-list').replaceChildren();const inputs=manifest.assumptions?.length?manifest.assumptions:['Site boundaries, ownership, topography, zoning and setbacks are unresolved.','Structure, foundations, fire safety, accessibility and engineering design need licensed review.','Utility capacity, including the requested power allowance, remains unverified.'];for(const input of inputs){const li=document.createElement('li');li.textContent=input;$('assumptions-list').append(li);}const requested=new URLSearchParams(location.search).get('option');await loadOption(manifest.options.some(option=>option.id===requested&&option.modelAvailable!==false)?requested:'option-05');}catch(error){showError(error);}}
state.selectOption=loadOption;state.selectView=selectView;state.setLighting=setLighting;loadPhotographedSky();start();

if(new URL(location.href).searchParams.has('performance'))performanceCheck=createPerformanceCheck({
 getSnapshot:()=>({fixedView:{camera:camera.position.toArray(),target:controls.target.toArray(),viewport:[host.clientWidth,host.clientHeight],drawingBuffer:[renderer.domElement.width,renderer.domElement.height],pixelRatio:renderer.getPixelRatio(),roofs:$('roofs-toggle').checked,systems:$('systems-toggle').checked,lighting:state.lighting,model:state.modelURL},gpu:renderTiming.state,gpuSamples:renderTiming.samples,treeVisibility:state.treeVisibility,tourFrames:tourFrameTiming.state,lastCapture:state.lastCapture,renderCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,hardware:renderer.domElement.dataset.graphicsProcessor,depthMode:state.depthMode,shadowRefreshes:state.shadowRefreshes,loaded:state.loaded}),
 requestRender, onStart:()=>{if(!state.loaded||transition||tour?.active)throw Error('Wait for a stationary loaded view.');stopSpin();navigation?.stopInput();renderTiming.clear();}, onStop:()=>requestRender()
});
