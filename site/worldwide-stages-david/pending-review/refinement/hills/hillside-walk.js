import * as THREE from 'three';
import {moveInSpace,pathAtDistance,pathLength} from './walk-space.mjs';

// An architectural walkthrough, not a free-flight camera or egress simulation.
export function createHillsideWalk({camera,canvas,contract,requestRender,onMode,onExit,onDoors}){
  let hall=null,feet=null,yaw=0,pitch=0,route=null,lastTime=0,drag=null;
  const keys=new Set(),eyeHeight=contract.eyeHeightM||1.7;
  const bar=document.getElementById('walk-controls');
  const status=document.getElementById('walk-status');
  const toThree=p=>new THREE.Vector3(p[0],p[2],-p[1]);
  const active=()=>hall!==null;
  function pose(){
    camera.position.copy(toThree([feet[0],feet[1],feet[2]+eyeHeight]));
    const horizontal=Math.cos(pitch);
    const target=toThree([feet[0]+Math.sin(yaw)*horizontal,feet[1]+Math.cos(yaw)*horizontal,feet[2]+eyeHeight+Math.sin(pitch)]);
    camera.lookAt(target);camera.updateMatrixWorld();
  }
  function clearInput(){keys.clear();drag=null;lastTime=0;}
  function space(){return {polygons:hall.walkPolygons||[hall.floorPolygon],obstacles:[...(hall.columns||[]),...(hall.obstacles||[])],floorZ:contract.floorTopZ};}
  function step(forward=0,sideways=0){
    if(!active()||route)return;
    const delta=[Math.sin(yaw)*forward+Math.cos(yaw)*sideways,Math.cos(yaw)*forward-Math.sin(yaw)*sideways];
    const next=moveInSpace(feet,delta,space());
    if(Math.hypot(next[0]-feet[0],next[1]-feet[1])<.005)status.textContent='Wall or column ahead · turn to continue';
    else status.textContent='Inside '+hall.id+' · empty shell';
    feet=next;pose();requestRender();
  }
  function turn(amount){if(!active()||route)return;yaw+=amount;pose();requestRender();}
  function enter(id='A1',animate=true){
    const selected=contract.halls.find(h=>h.id===id);if(!selected)return;
    clearInput();hall=selected;onMode(true);onDoors(true);bar.hidden=false;
    yaw=0;pitch=0;
    if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      route={points:hall.frontPath,distance:0,total:pathLength(hall.frontPath)};feet=[...hall.frontPath[0]];
      status.textContent='Entering '+id+' through its front door';
    }else{route=null;feet=[...hall.frontPath.at(-1)];status.textContent='Inside '+id+' · empty shell';}
    pose();canvas.focus({preventScroll:true});requestRender();
  }
  function stop(){clearInput();route=null;hall=null;bar.hidden=true;onMode(false);}
  function update(now){
    if(!active())return false;
    const dt=lastTime?Math.min((now-lastTime)/1000,.1):1/60;lastTime=now;
    if(route){
      route.distance=Math.min(route.total,route.distance+dt*5);
      feet=pathAtDistance(route.points,route.distance);
      const ahead=pathAtDistance(route.points,Math.min(route.total,route.distance+2));
      if(Math.hypot(ahead[0]-feet[0],ahead[1]-feet[1])>.01)yaw=Math.atan2(ahead[0]-feet[0],ahead[1]-feet[1]);
      if(route.distance>=route.total){route=null;yaw=0;status.textContent='Inside '+hall.id+' · empty shell';}
      pose();return route!==null;
    }
    let forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
    let sideways=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
    const rotation=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
    if(rotation){yaw+=rotation*dt*1.25;pose();}
    const magnitude=Math.max(1,Math.hypot(forward,sideways));
    if(forward||sideways)step(forward*dt*2.5/magnitude,sideways*dt*2.5/magnitude);
    return keys.size>0;
  }
  canvas.tabIndex=0;
  const moveKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  window.addEventListener('keydown',e=>{if(!active())return;if(e.code==='Escape'){e.preventDefault();stop();onExit();}else if(moveKeys.has(e.code)){e.preventDefault();keys.add(e.code);requestRender();}});
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',clearInput);
  document.addEventListener('visibilitychange',clearInput);
  canvas.addEventListener('pointerdown',e=>{if(active()&&!route){drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});
  canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId||!active())return;yaw+=(e.clientX-drag.x)*.003;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-drag.y)*.003,-1.2,1.2);drag.x=e.clientX;drag.y=e.clientY;pose();requestRender();});
  canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
  canvas.addEventListener('wheel',e=>{if(active()&&!route){e.preventDefault();step(Math.sign(-e.deltaY)*.65);}}, {passive:false});
  for(const b of document.querySelectorAll('[data-walk]'))b.onclick=()=>{
    if(b.dataset.walk==='forward')step(1.5);
    else if(b.dataset.walk==='back')step(-1.5);
    else if(b.dataset.walk==='left')turn(-Math.PI/12);
    else if(b.dataset.walk==='right')turn(Math.PI/12);
    else if(b.dataset.walk==='other'){const next=contract.halls.find(h=>h.id!==hall?.id);if(next)enter(next.id,false);}
    else if(b.dataset.walk==='exit'){stop();onExit();}
  };
  return {enter,stop,update,get active(){return active();},get busy(){return !!route||keys.size>0;},get snapshot(){return {hall:hall?.id||null,feet:feet&&[...feet],yaw,pitch,entering:!!route};}};
}
