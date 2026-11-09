/** 2026-10-03. Stage-subject correction proposal from actual saved05 platform bounds.
 * High stage orbit uses the current saved model's complete bounds certificate; new model and actual subject view require fresh review.
 * Native geometry remains untouched; all other held V3 poses are preserved. */
import {campusTours as v3Tours,makeTourTransit} from './tour-paths-v3.js';
export {makeTourTransit};
export const campusTours=structuredClone(v3Tours);
const tour=campusTours['option-05'];
if(tour){tour.version=4;const stage=tour.chapters.find(c=>c.id==='stage'),landscape=tour.chapters.find(c=>c.id==='landscape');
 stage.entry='dissolve';stage.exit='dissolve';delete stage.approach;
 stage.title='Covered stage and audience tiers';stage.caption='The stage platform and permanent roof sit together beyond the sports halls, facing the amphitheater tiers.';
 stage.poses=Array.from({length:17},(_,i)=>{const a=2*Math.PI*i/16;return {p:[66+70*Math.cos(a),35,-204.0779712+70*Math.sin(a)],t:[66,3,-204.0779712],seconds:i?1:.5,easing:'linear',...(i?{}:{title:stage.title,caption:stage.caption})};});
 if(landscape){landscape.entry='dissolve';delete landscape.approach;}
 tour.stageSubject={source:'Actual saved05 plan stage platform',worldBounds:[45,195.0779712,.74,87,213.0779712,1.20],targetThree:[66,3,-204.0779712],changedPathClearanceStatus:'CURRENT_MODEL_HIGH_ORBIT_CLEAR; SUBJECT_VIEW_PENDING; NEW_MODEL_RECHECK' };
}
export function getCampusTour(optionId){return campusTours[optionId]||null;}
