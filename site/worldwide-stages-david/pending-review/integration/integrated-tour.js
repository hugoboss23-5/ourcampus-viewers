/** 2026-10-04. Camera data only. No renderer, model, DOM or source-tour mutation.
 * Placement contract: geometry/placement-contract.json; coordinates in native XYZ.
 * New stops require actual loaded overlays and a browser framing/lighting check.
 */
const clone=value=>structuredClone(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const point=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
export const LOCAL_VIEWS=Object.freeze({
  audience:{p:[22.86,29,1.68],t:[22.86,61,3.3],fov:52},
  foyer:{p:[37,18,1.7],t:[14,6,2.8],fov:60},
  garden:{p:[39,-30,1.75],t:[21,-6,3],fov:52},
  arrival:{p:[61.8,-18,1.706],t:[64,38,3],fov:41.112090439166934},
  singleArrival:{p:[42,-24,1.706],t:[40,40,3],fov:41.112090439166934},
  insideA1:{p:[52,39,.5],t:[36,65,1.2],fov:50.22966910699457},
  insideA2:{p:[76,39,.5],t:[92,65,1.2],fov:50.22966910699457}
});
export function nativeToThree(value,offset=[0,0,0]){
  if(!point(value)||!point(offset))throw Error('Invalid native camera coordinate');
  return [value[0]+offset[0],value[2]+offset[2],-value[1]-offset[1]];
}
export function createIntegratedNavigation({getBaseTour,getBaseDestinations,placement,baseModelSha256}={}){
  if(typeof getBaseTour!=='function'||typeof getBaseDestinations!=='function')throw Error('Original navigation functions are required');
  const original=getBaseTour('option-05');
  if(!original||!hash(original.modelSha256)||baseModelSha256&&baseModelSha256!==original.modelSha256)throw Error('Base campus camera hash mismatch');
  const contract=clone(placement),hall=contract?.hall,hills=contract?.hills;
  const singleHill=hills?.shells===1,onePair=hills?.shells===2;
  const validCount=Array.isArray(hills?.nativeOffsets)&&((singleHill||onePair)?hills.nativeOffsets.length===1:hills.shells===6&&hills.nativeOffsets.length===3);
  if(!hash(hall?.sha256)||!point(hall.nativeOffset)||!hash(hills?.sha256)||!validCount||!hills.nativeOffsets.every(point))throw Error('Complete hall and supported hillside placement contract required');
  // Optional final-frame cameras from the geometry owner, in native XYZ.
  const nativeCamera=view=>({p:view.position,t:view.target,fov:2*Math.atan(36/(2*view.lensMm*1.6))*180/Math.PI});
  const hillViews={arrival:singleHill?LOCAL_VIEWS.singleArrival:LOCAL_VIEWS.arrival,insideA1:LOCAL_VIEWS.insideA1,insideA2:LOCAL_VIEWS.insideA2,
    ...(hills.views?.arrival?{arrival:nativeCamera(hills.views.arrival)}:{}),
    ...(hills.views?.interior?{insideA1:nativeCamera(hills.views.interior)}:{}),...(hills.viewsNative||{})};
  for(const view of Object.values(hillViews))if(!point(view?.p)||!point(view?.t)||!Number.isFinite(view?.fov)||view.fov<=0||view.fov>=180)throw Error('Invalid hillside camera contract');
  if(contract.coordinateMapping!=='nativeXYZ -> Three[x,z,-y]')throw Error('Unsupported overlay coordinate mapping');
  for(const item of [hall,hills])if(item.rotation||item.rotationDeg||item.rotationNativeZDegrees||(item.scale!==undefined&&item.scale!==1))throw Error('Camera contract supports translations only');
  const tour=clone(original),added=[],presets={};
  tour.version=5;
  tour.overlayModelSha256={hall:hall.sha256,hills:hills.sha256};
  tour.overlayPlacement={hall:clone(hall.nativeOffset),hills:clone(hills.nativeOffsets)};
  tour.overlayCameraStatus='SOURCE_COORDINATES_CHECKED; INTEGRATED_BROWSER_REVIEW_REQUIRED';
  function stop(id,title,caption,view,offset,{chapterId=id,interiorKind=null,pairIndex=null,hallId=null,anchorNative=view.t}={}){
    const pose={p:nativeToThree(view.p,offset),t:nativeToThree(view.t,offset),seconds:10,easing:'linear',walk:false,fixedCamera:true,fov:view.fov};
    const presentation={roofs:true,systems:false,interiorKind,pairIndex,hallId};
    const chapter={id:chapterId,title,caption,entry:'dissolve',exit:'dissolve',presentation,poses:[clone(pose)]};
    const destination={id,label:title,chapterId,entry:'dissolve',pose:clone(pose),anchor:nativeToThree(anchorNative,offset),...(id.startsWith('hills-pair-')?{sourceBounds:[offset[0],offset[1],offset[0]+128,offset[1]+104]}:{}),presentation:clone(presentation),sourceName:title,geometryStatus:'Integrated design study; visual framing requires browser review',requiredClearanceModelSha256:original.modelSha256,overlayModelSha256:interiorKind==='performance'||id.startsWith('performance')?hall.sha256:hills.sha256};
    added.push(destination);presets[id]={...clone(pose),label:title,dissolve:true,presentation:clone(presentation)};
    return chapter;
  }
  const audience=stop('performance-hall','Garden Performance Hall','The selected performance room, with movable seating facing the stage. Seated sightlines and acoustic design remain under review.',LOCAL_VIEWS.audience,hall.nativeOffset,{chapterId:'events-inside',interiorKind:'performance'});
  const foyer=stop('performance-foyer','Performance hall foyer','The garden-facing foyer provides the arrival and intermission space.',LOCAL_VIEWS.foyer,hall.nativeOffset,{interiorKind:'performance'});
  const garden=stop('performance-garden','Performance hall garden','The garden approach connects the selected hall to its outdoor terrace.',LOCAL_VIEWS.garden,hall.nativeOffset);
  // 2026-10-04: actual moving shots, above the chairs and inside the saved room.
  // Keep click-to-enter presets unchanged; only the automatic tour moves.
  const movingPose=(p,t,seconds,fov)=>({p:nativeToThree(p,hall.nativeOffset),t:nativeToThree(t,hall.nativeOffset),seconds,easing:'linear',fov});
  audience.poses=[
    movingPose([22.86,29,3],[22.86,61,3.3],.25,52),
    movingPose([12,40,3.3],[22.86,61,3.3],12,52),
    movingPose([12,53,3.3],[22.86,63,3],12,52),
    movingPose([22.86,54,3],[22.86,63,3],10,52)
  ];
  foyer.poses=[
    movingPose([37,18,1.7],[14,6,2.8],.25,60),
    movingPose([36,10,2.3],[18,5,2.3],10,60)
  ];
  garden.poses=[
    movingPose([39,-30,3],[21,-6,3],.25,52),
    movingPose([22,-28,4],[21,-6,3],5,52),
    movingPose([10,-24,4],[21,-6,3],5,52)
  ];
  const eventIndex=tour.chapters.findIndex(c=>c.id==='events-inside');
  if(eventIndex<0)throw Error('Existing events interior chapter is missing');
  tour.chapters.splice(eventIndex,1,audience,foyer,garden);
  const hillChapters=[];
  hills.nativeOffsets.forEach((offset,i)=>{
    const pair=i+1;
    hillChapters.push(stop(`hills-pair-${pair}`,singleHill?'Hillside building':onePair?'Hillside data center':`Hillside pair ${pair}`,singleHill?'One planted shell beside the soccer fields. This is the selected campus placement study.':onePair?'Two halls joined by a shared garden approach in the existing campus landscape beside the soccer fields.':'Two planted shells in a proposed northern expansion. Placement is conceptual; the existing recreation areas remain.',hillViews.arrival,offset,{pairIndex:i,anchorNative:singleHill?[40,38,12]:[64,38,12]}));
    for(const [j,view] of (singleHill?[hillViews.insideA1]:[hillViews.insideA1,hillViews.insideA2]).entries()){
      const number=i*2+j+1;
      hillChapters.push(stop(`hills-interior-${number}`,singleHill?'Inside hillside shell':onePair?`Inside hillside hall ${j?'A2':'A1'}`:`Inside hillside shell ${number}`,'A roof-on view of the empty shell. Structure, roof cover, services and equipment layout remain to be designed.',view,offset,{interiorKind:'hills',pairIndex:i,hallId:j?'A2':'A1'}));
    }
  });
  for(const chapter of hillChapters){
    const i=chapter.presentation.pairIndex,offset=hills.nativeOffsets[i];
    const point=(p,t,seconds)=>({p:nativeToThree(p,offset),t:nativeToThree(t,offset),seconds,easing:'linear',fov:52,walk:false,fixedCamera:true});
    if(!chapter.presentation.interiorKind){
      chapter.poses=Array.from({length:33},(_,n)=>{const a=-Math.PI/2+2*Math.PI*n/32;return point([64+95*Math.cos(a),52+95*Math.sin(a),45],[64,52,3],n?1:.2);});
    }else{
      const mirror=p=>chapter.presentation.hallId==='A2'?[128-p[0],p[1],p[2]]:p;
      chapter.poses=[[[52,39,.5],.2],[[55,53,.8],6],[[55,72,.8],7],[[44,78,.8],5]].map(([p,seconds])=>point(mirror(p),mirror([40,64,1.1]),seconds));
    }
  }
  // Parking already enters by dissolve. Inserting here leaves every retained
  // explicit route and every original non-events camera pose exactly unchanged.
  const parkingIndex=tour.chapters.findIndex(c=>c.id==='parking');
  if(parkingIndex<0||tour.chapters[parkingIndex].entry!=='dissolve')throw Error('Safe tour insertion point has changed');
  tour.chapters.splice(parkingIndex,0,...hillChapters);
  function getCampusTour(optionId){return optionId==='option-05'?tour:getBaseTour(optionId);}
  function getCampusDestinations(plan,selectedTour=getCampusTour(plan?.option?.id)){
    const base=getBaseDestinations(plan,selectedTour);
    if(plan?.option?.id!=='option-05')return base;
    return [...base.filter(d=>!['dining','exhibition'].includes(d.id)).map(d=>d.id==='events-hall'?{...d,label:'Events and performance hall'}:d),...clone(added)];
  }
  return {getCampusTour,getCampusDestinations,presets:clone(presets),destinations:clone(added),placement:contract};
}
