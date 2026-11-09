/** 2026-10-03. Fixed-count view-local pool for real authored punctual lights.
 * Selected intensity, color, range, decay and cone are preserved. This is a
 * bounded rendering selection, not a lighting-design/photometric certificate.
 * Caller captures full intensity BEFORE disabling imported lights, then passes
 * {light, intensity}. Source lights must already be hidden; none are mutated here.
 */
import {Group,PointLight,SpotLight,Vector3} from 'three';
export function createCampusNightLighting({scene,budget=18,intervalMs=250,holdMs=800,hysteresis=.8,requestRender=()=>{}}={}){
 if(!scene?.add||!Number.isInteger(budget)||budget<1||budget>18)throw new Error('Night lighting needs a scene and 1–18 slots.');
 if(!Number.isFinite(intervalMs)||intervalMs<0||!Number.isFinite(holdMs)||holdMs<0||!Number.isFinite(hysteresis)||hysteresis<=0||hysteresis>1)throw new Error('Invalid night selection timing.');
 const group=new Group();group.name='View-local authored night lights';scene.add(group);
 let records=[],slots=[],night=false,disposed=false,lastUpdate=-Infinity,lastEye=null,lastTarget=null,pendingAt=null,wakeTimer=null;
 const v=new Vector3(),targetWorld=new Vector3();
 const state={night:false,authoredSources:0,pointSlots:0,spotSlots:0,selected:[],status:'No authored point or spot lights',selectionChanges:0,nextSelectionAt:null};
 const position=p=>p?.isVector3?p.clone():new Vector3(...p);
 function cancelWake(){if(wakeTimer!==null)clearTimeout(wakeTimer);wakeTimer=null;pendingAt=null;state.nextSelectionAt=null;}
 function clearModel(){
  cancelWake();
  for(const slot of slots){group.remove(slot.proxy);if(slot.proxy.isSpotLight)group.remove(slot.proxy.target);slot.proxy.dispose();}
  records=[];slots=[];lastEye=lastTarget=null;lastUpdate=-Infinity;
  Object.assign(state,{authoredSources:0,pointSlots:0,spotSlots:0,selected:[],status:'No authored point or spot lights',selectionChanges:0});
 }
 function setSources(sources=[]){
  if(disposed)throw new Error('Night lighting was disposed.');
  const seen=new Set();
  const next=sources.map((row,i)=>{
   const light=row.light,intensity=row.intensity??light?.intensity;
   if(!light?.isPointLight&&!light?.isSpotLight)throw new Error('Only authored point/spot lights are accepted.');
   if(seen.has(light))throw new Error('An authored light was supplied twice.');seen.add(light);
   if(light.layers.mask!==1)throw new Error('Non-default light layers need a separately verified pool.');
   if(light.visible!==false)throw new Error('Disable imported light visibility before installing its pool source.');
   if(!Number.isFinite(intensity)||intensity<0)throw new Error('Authored candela must be finite and nonnegative.');
   if(light.castShadow||light.map)throw new Error('Shadowed/textured punctual sources need a separately verified pool.');
   return {light,intensity,index:i,type:light.isSpotLight?'spot':'point',id:light.uuid||String(i),position:new Vector3(),direction:new Vector3(),color:light.color.clone(),distance:light.distance,decay:light.decay,angle:light.angle,penumbra:light.penumbra};
  });
  clearModel();records=next;state.authoredSources=records.length;
  const points=records.filter(r=>r.type==='point'&&r.intensity>0).length,spots=records.filter(r=>r.type==='spot'&&r.intensity>0).length,total=Math.min(budget,points+spots);
  let pointSlots=spots===0?total:points===0?0:Math.max(1,Math.min(points,total-1,Math.round(total*points/(points+spots))));
  let spotSlots=Math.min(spots,total-pointSlots);pointSlots=Math.min(points,total-spotSlots);
  for(const [type,count]of [['point',pointSlots],['spot',spotSlots]])for(let i=0;i<count;i++){
   const proxy=type==='point'?new PointLight(0xffffff,0):new SpotLight(0xffffff,0);proxy.name='Authored night '+type+' slot '+i;proxy.visible=true;proxy.castShadow=false;group.add(proxy);if(proxy.isSpotLight)group.add(proxy.target);slots.push({type,proxy,record:null,boundAt:-Infinity});
  }
  Object.assign(state,{pointSlots,spotSlots,status:total?'Authored sources ready':'No authored point or spot lights'});
  return {...state};
 }
 function setNight(enabled){cancelWake();night=!!enabled;state.night=night;lastUpdate=-Infinity;for(const s of slots)s.proxy.intensity=night?(s.record?.intensity??0):0;state.status=records.length?(night?'Night selection active':'Daytime lights off'):'No authored point or spot lights';}
 function refreshRecord(r){
  r.light.getWorldPosition(r.position);
  if(r.type==='spot'){r.light.target.getWorldPosition(targetWorld);r.direction.copy(targetWorld).sub(r.position);if(r.direction.lengthSq()===0)throw new Error('Authored spot has no valid direction.');r.direction.normalize();}
  // Source light itself is hidden by the caller. Retain actual parent visibility.
  for(let p=r.light.parent;p;p=p.parent)if(!p.visible)return false;
  return r.intensity>0;
 }
 function apply(slot,record,now){
  if(slot.record!==record){slot.boundAt=now;state.selectionChanges++;}
  slot.record=record;const light=slot.proxy;light.intensity=night&&record?record.intensity:0;
  if(!record)return;
  light.position.copy(group.worldToLocal(v.copy(record.position)));light.color.copy(record.color);light.distance=record.distance;light.decay=record.decay;light.layers.mask=record.light.layers.mask;
  if(light.isSpotLight){light.angle=record.angle;light.penumbra=record.penumbra;targetWorld.copy(record.position).add(record.direction);light.target.position.copy(group.worldToLocal(targetWorld));light.target.updateMatrixWorld();}
  light.updateMatrixWorld();
 }
 function update({cameraPosition,target,now=performance.now(),force=false}={}){
  if(disposed||!night||!slots.length)return false;
  const eye=position(cameraPosition),focus=target?position(target):eye.clone();if(![...eye.toArray(),...focus.toArray(),now].every(Number.isFinite))throw new Error('Night-light view must be finite.');
  if(!force&&now-lastUpdate<intervalMs)return false;
  if(!force&&lastEye&&eye.distanceToSquared(lastEye)<4&&focus.distanceToSquared(lastTarget)<4&&(pendingAt===null||now<pendingAt))return false;
  cancelWake();lastUpdate=now;lastEye=eye.clone();lastTarget=focus.clone();group.updateWorldMatrix(true,true);
  const eligible=records.filter(refreshRecord),eyeWeight=eye.distanceTo(focus)<40?.75:.25,score=r=>Math.sqrt(eyeWeight*r.position.distanceToSquared(eye)+(1-eyeWeight)*r.position.distanceToSquared(focus));
  let changed=false;
  for(const type of ['point','spot']){
   const pool=slots.filter(s=>s.type===type),candidates=eligible.filter(r=>r.type===type),chosen=new Set(),tiles=new Map();
   const tile=r=>Math.floor(r.position.x/20)+','+Math.floor(r.position.z/20);
   for(const slot of pool){
    let best=null,bestScore=Infinity;
    const locked=slot.record&&candidates.includes(slot.record)&&now-slot.boundAt<holdMs&&!chosen.has(slot.record);
    if(locked){best=slot.record;pendingAt=Math.min(pendingAt??Infinity,slot.boundAt+holdMs);}
    else for(const r of candidates){if(chosen.has(r))continue;const incumbent=pool.some(s=>s.record===r),cost=score(r)*(incumbent?hysteresis:1)+8*(tiles.get(tile(r))||0);if(cost<bestScore||(cost===bestScore&&r.index<(best?.index??Infinity))){best=r;bestScore=cost;}}
    if(best){chosen.add(best);tiles.set(tile(best),(tiles.get(tile(best))||0)+1);}
    changed=changed||slot.record!==best;apply(slot,best,now);
   }
  }
  if(pendingAt!==null){pendingAt=Math.max(pendingAt,lastUpdate+intervalMs);state.nextSelectionAt=pendingAt;wakeTimer=setTimeout(()=>{wakeTimer=null;if(!disposed&&night)requestRender();},Math.max(0,pendingAt-now));}
  state.selected=slots.filter(s=>s.record).map(s=>({sourceId:s.record.id,sourceIndex:s.record.index,type:s.type,intensityCandela:s.record.intensity,worldPosition:s.record.position.toArray()}));return changed;
 }
 function dispose(){if(disposed)return;clearModel();scene.remove(group);disposed=true;}
 return {setSources,setNight,update,clearModel,dispose,state,get slotLights(){return slots.map(s=>s.proxy);}};
}
