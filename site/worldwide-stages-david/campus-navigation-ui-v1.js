/** 2026-10-03. Named destinations from saved 05 room records and certified V3 poses.
 * Interior jumps require the caller's dissolve; these are not wall-crossing flights. */
import {Vector3} from 'three';
const roomKinds=[['kitchen','Kitchen'],['office','Offices'],['dining','Dining'],['gym','Gym'],['basketball','Basketball'],['exhibition','Exhibition']];
export function getCampusDestinations(plan,tour){
 if(plan?.option?.id!=='option-05'||tour?.optionId&&tour.optionId!=='option-05')return [];
 const result=[];
 for(const [kind,label]of roomKinds){const spaces=kind==='basketball'?(plan.courts||[]).filter(c=>c.sport==='basketball'&&c.location==='indoor'):(plan.spaces||[]).filter(s=>s.kind===kind);if(!spaces.length)continue;const space=spaces[0],world=space.world_center,center=[world[0],1.7,-world[1]],chapter=tour.chapters.find(c=>c.id===(kind==='office'?'office':kind==='kitchen'?'kitchen':['gym','basketball'].includes(kind)?'sports-inside':'events-inside'));if(!chapter)continue;
 const matching=chapter.poses.filter(p=>new RegExp(kind==='office'?'office':kind==='basketball'?'basketball':kind,'i').test((p.title||'')+' '+(p.caption||''))),pool=matching.length?matching:chapter.poses,pose=pool.reduce((a,b)=>Math.hypot(a.p[0]-center[0],a.p[2]-center[2])<Math.hypot(b.p[0]-center[0],b.p[2]-center[2])?a:b);
 result.push({id:kind,label,chapterId:chapter.id,entry:'dissolve',pose:structuredClone(pose),anchor:[center[0],Math.min(4.2,(space.height||3.2)+.5),center[2]],sourceName:space.name,worldCenter:[...world]});
 }
 for(const hall of plan.option.halls||[]){const [x,y]=hall.origin_xy,[w,l]=hall.dims_m,angle=(hall.rotation_deg||0)*Math.PI/180,cx=x+w/2*Math.cos(angle)-l/2*Math.sin(angle),cy=y+w/2*Math.sin(angle)+l/2*Math.cos(angle),chapter=tour.chapters.find(c=>c.id===(hall.id==='sports-hall'?'sports-exterior':'events-exterior')),polygon=[[0,0],[w,0],[w,l],[0,l]].map(([px,py])=>[x+px*Math.cos(angle)-py*Math.sin(angle),y+px*Math.sin(angle)+py*Math.cos(angle)]);if(chapter)result.push({id:hall.id,label:hall.id==='sports-hall'?'Sports hall':'Events hall',chapterId:chapter.id,entry:'dissolve',pose:structuredClone(chapter.poses[0]),anchor:[cx,22,-cy],sourceName:hall.id,sourcePolygon:polygon,sourceBounds:[Math.min(...polygon.map(p=>p[0])),Math.min(...polygon.map(p=>p[1])),Math.max(...polygon.map(p=>p[0])),Math.max(...polygon.map(p=>p[1]))],sourceHeight:hall.clear_height_m||0});}
 const outdoor=plan.option.outdoor_activity||{};
 const addOutdoor=(id,label,bounds,height,offset,chapterId,status='Saved physical allocation')=>{if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite))return;const x=(bounds[0]+bounds[2])/2,y=(bounds[1]+bounds[3])/2;result.push({id,label,chapterId,entry:'dissolve',pose:{p:[x+offset[0],height,-y+offset[1]],t:[x,2,-y],seconds:.5,easing:'linear'},anchor:[x,4,-y],sourceName:label,sourceBounds:[...bounds],geometryStatus:status,requiredClearanceModelSha256:tour.modelSha256});};
 for(const [i,pitch]of (outdoor.soccer||[]).entries())addOutdoor(pitch.id||`soccer-${i+1}`,`Soccer field ${i+1}`,pitch.play_bounds_m,75,[65,70],'soccer');
 const lot=plan.option.parking?.lots?.[0];if(lot)addOutdoor('solar-parking',plan.solar_revision?'Solar parking':'Parking lot',lot.bounds_m,150,[110,110],'parking',plan.solar_revision?'Saved solar parking revision':'Actual surface parking; photovoltaic canopy revision pending final native model');
 if(outdoor.venue)addOutdoor('amphitheater','Amphitheater',outdoor.venue.bounds_m,95,[100,80],'stage');
 const zones=(plan.landscape?.zones||[]).filter(z=>z.kind==='overflow'&&Array.isArray(z.bounds_m));if(zones.length){const bounds=[Math.min(...zones.map(z=>z.bounds_m[0])),Math.min(...zones.map(z=>z.bounds_m[1])),Math.max(...zones.map(z=>z.bounds_m[2])),Math.max(...zones.map(z=>z.bounds_m[3]))];addOutdoor('festival-activity-park','Festival / activity park',bounds,95,[90,90],'landscape','Saved dry event-overflow lawns and shade areas');}
 return result;
}
// Selection is over projected saved place bounds, not an expensive mesh raycast.
export function pointInCampusPolygon(x,y,polygon){
 let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
function hull(points){
 const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const half=values=>{const result=[];for(const p of values){while(result.length>1&&cross(result.at(-2),result.at(-1),p)<=0)result.pop();result.push(p);}return result;};
 return half(sorted).slice(0,-1).concat(half(sorted.reverse()).slice(0,-1));
}
export function createCampusNavigationUI({getDestinations=getCampusDestinations,listRoot,labelRoot,canvas,camera,onJump,isEnabled=()=>true,isAnchorVisible=()=>true}={}){
 let destinations=[],regions=[],projected=[],buttons=[],pointer=null,pressed=null,hovered=null,disposed=false;
 const svg=labelRoot?document.createElementNS('http://www.w3.org/2000/svg','svg'):null,outline=svg?document.createElementNS('http://www.w3.org/2000/svg','polygon'):null;
 const tip=labelRoot?document.createElement('span'):null;
 if(svg){svg.setAttribute('aria-hidden','true');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden';outline.setAttribute('fill','#2fd8ff');outline.setAttribute('fill-opacity','.07');outline.setAttribute('stroke','#7fe9ff');outline.setAttribute('stroke-opacity','.65');outline.setAttribute('stroke-width','1.5');outline.setAttribute('stroke-linejoin','round');svg.append(outline);labelRoot.append(svg);}
 if(tip){tip.style.cssText='position:absolute;pointer-events:none;max-width:210px;padding:4px 7px;border-radius:5px;border:1px solid #7fe9ff40;background:#05070dbb;color:#e7f7ff;font:11px/1.35 system-ui,sans-serif;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px #0002';tip.setAttribute('aria-hidden','true');labelRoot.append(tip);}
 function hide(){hovered=null;if(svg)svg.style.display='none';if(tip)tip.hidden=true;}
 function activate(d){if(isEnabled())onJump(d);}
 function clear(){for(const b of buttons)b.remove();buttons=[];listRoot?.replaceChildren();destinations=[];regions=[];projected=[];pressed=null;hide();}
 function rebuild(plan,tour){
  clear();destinations=getDestinations(plan,tour);
  for(const d of destinations){
   const b=Array.isArray(d.sourceBounds)?d.sourceBounds:null;
   const polygon=d.sourcePolygon||(b?.length===4?[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]]:null);
   if(polygon?.length>=3&&polygon.every(p=>p.length===2&&p.every(Number.isFinite)))regions.push({d,polygon,height:Math.max(0,d.sourceHeight||0)});
   const parent=listRoot||labelRoot;if(!parent)continue;
   const button=document.createElement('button');button.type='button';button.textContent=d.label;button.dataset.destination=d.id;button.onclick=()=>activate(d);
   if(!listRoot){const concealed='position:absolute;left:12px;top:12px;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap';button.style.cssText=concealed;button.onfocus=()=>{button.style.cssText='position:absolute;left:12px;top:12px;width:auto;height:auto;padding:6px 9px;border:1px solid #7fe9ff80;border-radius:6px;background:#05070dee;color:#e7f7ff;font:12px system-ui;pointer-events:auto';};button.onblur=()=>{button.style.cssText=concealed;};}
   parent.append(button);buttons.push(button);
  }
  update();return destinations;
 }
 function pick(clientX,clientY){
  if(!isEnabled()||!labelRoot)return null;const r=labelRoot.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;
  return projected.find(p=>pointInCampusPolygon(x,y,p.points)&&isAnchorVisible(p.d.anchor,p.d))||null;
 }
 function show(p){
  if(!p||!pointer||pressed?.dragged){hide();return;}hovered=p.d;
  if(svg){svg.style.display='block';outline.setAttribute('points',p.points.map(v=>v.join(',')).join(' '));}
  if(tip){const r=labelRoot.getBoundingClientRect();tip.textContent=p.d.label;tip.hidden=false;tip.style.left=Math.max(8,Math.min(r.width-tip.offsetWidth-8,pointer.x-r.left+12))+'px';tip.style.top=Math.max(8,Math.min(r.height-30,pointer.y-r.top+14))+'px';}
 }
 function update(){
  if(disposed)return;const enabled=isEnabled();for(const b of buttons){b.disabled=!enabled;b.tabIndex=enabled?0:-1;}
  if(!enabled||!canvas||!labelRoot){hide();return;}
  const c=canvas.getBoundingClientRect(),r=labelRoot.getBoundingClientRect();projected=[];
  for(const region of regions){
   const points=[];let clipped=false;for(const height of region.height?[0,region.height]:[.15])for(const [x,y]of region.polygon){const q=new Vector3(x,height,-y).project(camera);if(!Number.isFinite(q.x)||!Number.isFinite(q.y)||q.z< -1||q.z>1){clipped=true;break;}points.push([c.left-r.left+(q.x*.5+.5)*c.width,c.top-r.top+(-q.y*.5+.5)*c.height]);}
   if(clipped)continue;const polygon=hull(points);if(polygon.length<3)continue;const area=Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
   projected.push({d:region.d,points:polygon,area});
  }
  projected.sort((a,b)=>a.area-b.area);if(pointer)show(pick(pointer.x,pointer.y));else hide();
 }
 const move=e=>{pointer={x:e.clientX,y:e.clientY};if(pressed&&Math.hypot(e.clientX-pressed.x,e.clientY-pressed.y)>=5)pressed.dragged=true;show(pick(e.clientX,e.clientY));};
 const down=e=>{if(e.button!==0)return;pointer={x:e.clientX,y:e.clientY};const p=pick(e.clientX,e.clientY);pressed={id:e.pointerId,x:e.clientX,y:e.clientY,d:p?.d,dragged:false};show(p);};
 const up=e=>{const start=pressed;pressed=null;if(!start||start.id!==e.pointerId||start.dragged||Math.hypot(e.clientX-start.x,e.clientY-start.y)>=5)return;const p=pick(e.clientX,e.clientY);if(p?.d===start.d&&p?.d)activate(p.d);if(e.pointerType==='touch'){pointer=null;hide();}};
 const leave=()=>{pointer=null;hide();},cancel=()=>{pressed=null;leave();};
 const listeners={pointermove:move,pointerdown:down,pointerup:up,pointerleave:leave,pointercancel:cancel};
 for(const [event,handler]of Object.entries(listeners))canvas?.addEventListener(event,handler,{passive:true});hide();
 // The campus viewer calls dispose between model loads, then reuses this UI.
 return {rebuild,update,dispose:clear,destroy(){disposed=true;clear();for(const [event,handler]of Object.entries(listeners))canvas?.removeEventListener(event,handler);svg?.remove();tip?.remove();},get destinations(){return destinations;}};
}
