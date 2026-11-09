/** 2026-10-04. Mouse and campus keyboard navigation adapter; original camera/model/render quality retained.
 * Integrate update(dt) into the existing frame loop. Walk uses a fixed eye for
 * look, horizontal translation for wheel/right-drag/buttons, and no pointer lock.
 * canMove is an optional real scene collision/grade hook, not a collision claim.
 */
import {Vector3,MathUtils} from 'three';
export function createNavigationControls({camera,orbitControls,element,requestRender=()=>{},markCustom=()=>{},canInteract=()=>true,canMove=null,onModeChange=()=>{},onBlocked=()=>{},speed=6.5,eyeY=1.7,isInsideBuilding=()=>false}={}) {
 if(!camera||!orbitControls||!element)throw new Error('Navigation needs the current camera, orbit controls and canvas');
 const state={mode:'orbit',enabled:true,moving:false,dragging:false,eyeY,lastBlocked:false};
 const held=new Set(),keyboard=new Set(),listeners=[];let drag=null,yaw=0,pitch=0,lookDistance=8,disposed=false,movementStartedAt=null;
 const up=new Vector3(0,1,0),forward=new Vector3(),right=new Vector3(),direction=new Vector3();
 const actions=new Set(['forward','back','left','right']);
 const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));};
 const movementActive=()=>!disposed&&state.enabled&&canInteract();
 const active=()=>movementActive()&&state.mode==='walk';
 function keyboardBlocked(e){const editable=t=>!!(t?.isContentEditable||t?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));if(editable(e.target)||editable(globalThis.document?.activeElement))return true;if(globalThis.document?.querySelector?.('dialog[open]'))return true;return [...(globalThis.document?.querySelectorAll?.('[aria-modal="true"]')||[])].some(m=>!m.hidden&&m.getAttribute?.('aria-hidden')!=='true'&&!m.closest?.('[hidden]'));}
 function emit(){onModeChange({...state});}
 function begin(){markCustom();camera.clearViewOffset?.();camera.updateProjectionMatrix?.();}
 function synchronize(){camera.getWorldDirection(direction);yaw=Math.atan2(-direction.x,-direction.z);pitch=Math.asin(MathUtils.clamp(direction.y,-1,1));}
 function orient(){direction.set(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));orbitControls.target.copy(camera.position).addScaledVector(direction,lookDistance);camera.lookAt(orbitControls.target);camera.updateMatrixWorld();}
 function stopInput(){held.clear();keyboard.clear();movementStartedAt=null;state.moving=false;if(drag){try{element.releasePointerCapture(drag.id);}catch{}drag=null;}state.dragging=false;}
 function tryMove(f,s){
  if(!movementActive())return false;
  forward.set(-Math.sin(yaw),0,-Math.cos(yaw));right.crossVectors(forward,up).normalize();
  const from=camera.position.clone(),to=from.clone().addScaledVector(forward,f).addScaledVector(right,s);to.y=state.mode==='walk'?state.eyeY:from.y;
  if(canMove){const result=canMove({from:from.toArray(),to:to.toArray(),mode:state.mode,radius:.25});
   if(result===false){state.lastBlocked=true;onBlocked();return false;}
   if(Array.isArray(result)&&result.length===3&&result.every(Number.isFinite))to.fromArray(result);
  }
  if(!to.toArray().every(Number.isFinite))return false;
  to.y=state.mode==='walk'?Math.max(state.eyeY,to.y):from.y;state.lastBlocked=false;const offset=to.clone().sub(from);camera.position.copy(to);if(state.mode==='walk')orient();else{orbitControls.target.add(offset);camera.lookAt(orbitControls.target);camera.updateMatrixWorld();}requestRender();return true;
 }
 function setMode(mode,{height=eyeY,target=null}={}){
  if(!['walk','orbit'].includes(mode))throw new Error('Unknown navigation mode');if(mode==='walk'&&(!Number.isFinite(height)||height<.25))throw new Error('Walk eye height is invalid');stopInput();begin();
  // Clear old OrbitControls damping/auto-rotation impulses before fixed-eye use.
  const pos=camera.position.clone(),quat=camera.quaternion.clone(),priorTarget=orbitControls.target.clone(),damping=orbitControls.enableDamping;
  orbitControls.autoRotate=false;orbitControls.enableDamping=false;orbitControls.update();camera.position.copy(pos);camera.quaternion.copy(quat);orbitControls.target.copy(priorTarget);orbitControls.enableDamping=damping;
  state.mode=mode;
  if(mode==='walk'){
   state.eyeY=height;camera.position.y=height;synchronize();orient();
  }else if(target){orbitControls.target.fromArray(target);camera.lookAt(orbitControls.target);}
  orbitControls.enabled=state.enabled&&mode==='orbit';element.style.cursor=mode==='walk'?'grab':'grab';emit();requestRender();
 }
 function setEnabled(value){state.enabled=!!value;if(!state.enabled)stopInput();orbitControls.enabled=state.enabled&&state.mode==='orbit';emit();}
 function look(dx,dy){if(!active())return;begin();yaw-=dx*.004;pitch=MathUtils.clamp(pitch-dy*.004,-Math.PI*.47,Math.PI*.47);orient();requestRender();}
 function pointerDown(e){
  if(!active()||![0,2].includes(e.button)||drag)return;e.preventDefault();e.stopImmediatePropagation();begin();element.focus({preventScroll:true});synchronize();drag={id:e.pointerId,button:e.button,x:e.clientX,y:e.clientY};state.dragging=true;try{element.setPointerCapture(e.pointerId);}catch{}
 }
 function pointerMove(e){
  if(!active()||!drag||drag.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
  if(drag.button===0)look(dx,dy);else{begin();tryMove(-dy*.025,dx*.025);}
 }
 function pointerEnd(e){if(!drag||drag.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();try{element.releasePointerCapture(drag.id);}catch{}drag=null;state.dragging=false;}
 function wheel(e){if(!active()||e.ctrlKey||e.metaKey)return;e.preventDefault();e.stopImmediatePropagation();begin();synchronize();const scale=e.deltaMode===1?16:e.deltaMode===2?element.clientHeight:1;tryMove(MathUtils.clamp(-e.deltaY*scale*.012,-2,2),0);}
 const keyAction={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
 function keyDown(e){if(!movementActive()||e.ctrlKey||e.metaKey||e.altKey||keyboardBlocked(e)){stopInput();return;}const action=keyAction[e.code];if(!action)return;e.preventDefault();e.stopImmediatePropagation();if(keyboard.has(e.code))return;if(!held.size&&!keyboard.size){begin();synchronize();movementStartedAt=performance.now();}keyboard.add(e.code);state.moving=true;requestRender();}
 function keyUp(e){if(!keyAction[e.code])return;const owned=keyboard.delete(e.code);state.moving=held.size>0||keyboard.size>0;if(!state.moving)movementStartedAt=null;if(owned){e.preventDefault();e.stopImmediatePropagation();}}
 listen(element,'pointerdown',pointerDown,{capture:true});listen(element,'pointermove',pointerMove,{capture:true});listen(element,'pointerup',pointerEnd,{capture:true});listen(element,'pointercancel',pointerEnd,{capture:true});listen(element,'lostpointercapture',e=>{if(drag?.id===e.pointerId){drag=null;state.dragging=false;}},{capture:true});
 listen(element,'wheel',wheel,{capture:true,passive:false});listen(element,'contextmenu',e=>{if(active()){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
 listen(globalThis.window||element,'keydown',keyDown,{capture:true});listen(globalThis.window||element,'keyup',keyUp,{capture:true});listen(globalThis.window||element,'blur',stopInput);listen(element,'blur',stopInput);if(globalThis.document){listen(document,'visibilitychange',()=>{if(document.hidden)stopInput();});listen(document,'pointerdown',e=>{if(e.target!==element&&!element.contains?.(e.target))stopInput();},{capture:true});}
 return {state,setMode,setEnabled,
  // Called after a preset/tour/manual camera replacement; no stale look angles.
  sync(){stopInput();synchronize();if(state.mode==='walk'){state.eyeY=camera.position.y;orient();}requestRender();},
  move(action,distance=.8){if(!actions.has(action))throw new Error('Unknown walk direction');if(!active())return false;begin();synchronize();return tryMove(action==='forward'?distance:action==='back'?-distance:0,action==='right'?distance:action==='left'?-distance:0);},
  startMove(action){if(!actions.has(action))throw new Error('Unknown walk direction');if(!active())return;begin();synchronize();if(!held.size&&!keyboard.size)movementStartedAt=performance.now();held.add(action);state.moving=true;requestRender();},
  stopMove(action){held.delete(action);state.moving=held.size>0||keyboard.size>0;if(!state.moving)movementStartedAt=null;},stopInput,
  update(dt,now=performance.now()){if(!movementActive()||(keyboard.size&&keyboardBlocked({target:globalThis.document?.activeElement}))){stopInput();return false;}if(!held.size&&!keyboard.size)return false;let elapsed=dt;if(movementStartedAt!==null){elapsed=Math.min(dt,Math.max(0,(now-movementStartedAt)/1000));movementStartedAt=null;}let f=0,s=0;const a=new Set([...held,...[...keyboard].map(code=>keyAction[code])]);f=Number(a.has('forward'))-Number(a.has('back'));s=Number(a.has('right'))-Number(a.has('left'));const n=Math.hypot(f,s);if(n){if(state.mode==='orbit')synchronize();const movementSpeed=isInsideBuilding()?speed:state.mode==='walk'?15:MathUtils.clamp(camera.position.distanceTo(orbitControls.target)*.12,20,120),d=movementSpeed*MathUtils.clamp(elapsed,0,.25)/n;tryMove(f*d,s*d);}state.moving=true;requestRender();return true;},
  dispose(){if(disposed)return;stopInput();disposed=true;for(const remove of listeners)remove();}
 };
}
