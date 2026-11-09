/** 2026-10-03. Whole-building drone orbits; V2 interior eye trajectories retained.
 * Hall centers measured from saved plan floor bodies. No native geometry edits. */
import {campusTours as v2Tours,makeTourTransit} from './tour-paths-v2.js';
export {makeTourTransit};
export const campusTours=structuredClone(v2Tours);
const hallCenters={"option-02": {"sports": [57.72, 7, -71.46], "events": [166.24, 7, -92.72]}, "option-05": {"sports": [55.72, 7, -120.8], "events": [157.72, 7, -120.8]}};
for(const [optionId,tour] of Object.entries(campusTours)){
 tour.version=3;
 for(const chapter of tour.chapters){
  if(['sports-exterior','events-exterior'].includes(chapter.id)){
   const hall=chapter.id.split('-')[0],center=hallCenters[optionId][hall];
   chapter.title=(hall==='sports'?'Sports':'Events')+' hall: the whole building';
   chapter.caption='A wide drone circuit shows the complete hall, its four facades and its roof in the campus setting.';
   chapter.poses=Array.from({length:33},(_,i)=>{const angle=2*Math.PI*i/32;return {p:[center[0]+200*Math.cos(angle),100,center[2]+200*Math.sin(angle)],t:[...center],seconds:i===0?.5:55/32,easing:'linear',...(i===0?{title:chapter.title,caption:chapter.caption}:{})};});
  }else if(['sports-inside','events-inside'].includes(chapter.id)){
   for(const pose of chapter.poses){let dx=pose.t[0]-pose.p[0],dz=pose.t[2]-pose.p[2],length=Math.hypot(dx,dz);
    if(length<1e-7){const center=hallCenters[optionId][chapter.id.split('-')[0]];dx=center[0]-pose.p[0];dz=center[2]-pose.p[2];length=Math.hypot(dx,dz);if(length<1e-7){dx=1;dz=0;length=1;}}
    const reach=Math.max(length,20);pose.t=[pose.p[0]+dx/length*reach,2.5,pose.p[2]+dz/length*reach];
   }
  }else if(['office','kitchen'].includes(chapter.id)){for(const pose of chapter.poses)pose.t=[pose.t[0],2,pose.t[2]];}
 }
 // Any explicit route must retain both exact p/t endpoint joins after retargeting.
 for(let i=0;i<tour.chapters.length;i++){const chapter=tour.chapters[i];if(chapter.entry==='route'){chapter.approach[0]=structuredClone(tour.chapters[i-1].poses.at(-1));chapter.approach[chapter.approach.length-1]=structuredClone(chapter.poses[0]);}}
}
export function getCampusTour(optionId){return campusTours[optionId]||null;}
