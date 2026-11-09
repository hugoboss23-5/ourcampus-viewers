// 2026-10-04. Actual saved modules, translation only. No source mesh reduction.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {moveInSpace,inPolygon} from './walk-space.mjs';
import {cutGroundRectangle} from './site-ground-cut.js';
export async function loadCampusAdditions({assets,status=()=>{}}){
 const loader=new GLTFLoader(),url=name=>new URL('integrated-20261004/'+name,assets).href;
 const placement=await fetch(url('placement-contract.json'),{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Campus additions index failed');return r.json();});
 const contract=await fetch(new URL('./walk-contract.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Hillside room plan failed');return r.json();});
 status('Opening the performance hall and planted hill…');
 const [hall,pair]=await Promise.all([loader.loadAsync(url('performance-additions.glb')+'?v='+placement.hall.sha256.slice(0,12)),loader.loadAsync(url(placement.hills.asset||'hillside-pair.glb')+'?v='+placement.hills.sha256.slice(0,12))]);
 hall.scene.position.fromArray(placement.hall.threeTranslation);
 const hallLights=[],hallEmission=new Map(),hillLights=[],groups=[],rooms=[];
 const prepare=(root,kind)=>root.traverse(o=>{o.userData.integratedKind=kind;if(kind==='performance'&&/ceiling/i.test(o.name))o.userData.kind='roof';if(o.isMesh){o.castShadow=[].concat(o.material).every(m=>!m.transparent&&!(m.transmission>0));o.receiveShadow=true;}if(o.isLight){o.userData.integratedLight=true;o.userData.originalIntensity=o.userData.originalIntensity??o.intensity;o.intensity=0;o.visible=false;o.castShadow=false;}});
 prepare(hall.scene,'performance');
 hall.scene.traverse(o=>{if(o.isSpotLight&&/stage[ _]wash/i.test(o.name)&&hallLights.length<3)hallLights.push(o);if(o.isMesh)for(const m of [].concat(o.material))if(m.emissive)hallEmission.set(m,m.emissiveIntensity);});
 placement.hills.threeTranslations.forEach((offset,i)=>{
  const group=i===0?pair.scene:pair.scene.clone(true);group.position.fromArray(offset);group.name=placement.hills.shells===1?'Data center hill':'Hillside pair '+(i+1);prepare(group,'hills');groups.push(group);
  group.traverse(o=>{if(o.isLight)hillLights.push({light:o,pairIndex:i,hallId:o.name.startsWith('A2')?'A2':'A1'});});
  for(const h of contract.halls.filter(h=>placement.hills.shells!==1||h.id==='A1'))rooms.push({...h,pairIndex:i,offset:placement.hills.nativeOffsets[i],id:'hills-pair-'+(i+1),shellId:h.id,space:{polygons:[h.floorPolygon],obstacles:[...(h.columns||[]),...(h.obstacles||[])],floorZ:-1.2}});
 });
 function atHill(p){if(p.y<-.9||p.y>4.3)return null;return rooms.find(r=>inPolygon(p.x-r.offset[0],-p.z-r.offset[1],r.floorPolygon))||null;}
 function moveHill({from,to,radius=.3}){const r=atHill(new THREE.Vector3(...from));if(!r)return null;const local=[from[0]-r.offset[0],-from[2]-r.offset[1]],delta=[to[0]-from[0],from[2]-to[2]],moved=moveInSpace(local,delta,r.space,radius);return [moved[0]+r.offset[0],.5,-moved[1]-r.offset[1]];}
 function attachHall(base){const removed=[];base.traverse(o=>{if(placement.hall.hideMainNamePrefixes.some(p=>(o.userData.name||o.name).startsWith(p)))removed.push(o);});for(const o of removed)o.removeFromParent();base.add(hall.scene);return removed.map(o=>o.name);}
 function prepareSite(base){
  const removed=[],cuts=[];base.updateMatrixWorld(true);
  if(placement.hills.instances===1){
   base.traverse(o=>{if(/\bgarden-(2[6-9]|3[0-4])\b/.test(o.userData.name||o.name))removed.push(o);});
   for(const o of removed)o.removeFromParent();
   const groundNames=['option-05 assumed site platform','30 acre outdoor activity allocation'];
   base.traverse(o=>{if(o.isMesh&&groundNames.includes(o.userData.name||o.name))cuts.push(cutGroundRectangle(o,placement.hills.groundCutBoundsXY));});
   if(cuts.length!==2)throw Error('The hillside ground opening could not be prepared');
  }
  return {removed:removed.map(o=>o.name),cuts};
 }
 function attachHills(base){for(const g of groups)base.add(g);base.updateMatrixWorld(true);}
 function lighting(camera,night){const room=atHill(camera.position);const p=camera.position,insideHall=p.x>112&&p.x<203.44&&p.z<-70&&p.z>-171.6&&p.y<11.3;
  for(const {light,pairIndex,hallId}of hillLights){const on=!!room&&room.pairIndex===pairIndex&&room.shellId===hallId;light.visible=on;light.intensity=on*light.userData.originalIntensity*.003;}
  for(const light of hallLights){light.visible=insideHall;light.intensity=insideHall?Math.min(light.userData.originalIntensity,3500)*(night?1:.65):0;}
  for(const [m,original]of hallEmission)m.emissiveIntensity=insideHall?original:night?Math.max(original,2):original*.05;
  return room?'hills':insideHall?'performance':null;
 }
 return {placement,attachHall,prepareSite,attachHills,atHill,moveHill,lighting,hall,groups,roomCount:rooms.length,disposeUnattached(){for(const r of [hall.scene,...groups])r.removeFromParent();}};
}
