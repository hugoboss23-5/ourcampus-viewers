// 2026-10-03. Moving circuits and interior walkthroughs of the saved campus.
// Exterior flights use separate vertical and horizontal legs, never a spline
// shortcut through a hall. Closed-door indoor visits use an explicit fade.
export function createCampusTour({camera,controls,ui,requestRender,onStart,onEnd,onChapter,reducedMotion=false}){
 let active=false,steps=[],stepIndex=0,elapsed=0,lastNow=null,savedDamping=true,shownChapter=null;
 const pose=()=>({p:camera.position.toArray(),t:controls.target.toArray()});
 const validPose=value=>value&&['p','t'].every(key=>Array.isArray(value[key])&&value[key].length===3&&value[key].every(Number.isFinite))&&value.p[1]>=.25&&Math.hypot(...value.p.map((n,i)=>n-value.t[i]))>1e-7;
 const validPoint=value=>validPose(value)&&Number.isFinite(value.seconds)&&value.seconds>0&&(value.easing===undefined||['linear','smooth'].includes(value.easing))&&['title','caption'].every(key=>value[key]===undefined||typeof value[key]==='string'&&value[key].trim().length>0);
 const samePose=(a,b)=>['p','t'].every(key=>a[key].every((n,i)=>Math.abs(n-b[key][i])<1e-7));
 const smooth=t=>t*t*t*(t*(t*6-15)+10);
 const mix=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
 function setPose(value){camera.position.fromArray(value.p);controls.target.fromArray(value.t);camera.lookAt(controls.target);camera.updateMatrixWorld();}
 function showChapter(chapter,index,total){
  if(shownChapter===chapter.id)return;shownChapter=chapter.id;
  ui.title.textContent=chapter.title;ui.caption.textContent=chapter.caption;
  ui.counter.textContent=String(index+1).padStart(2,'0')+' / '+String(total).padStart(2,'0');
  ui.root.dataset.chapter=chapter.id;onChapter?.(chapter,index);
 }
 function enterStep(){
  const step=steps[stepIndex];
  if(step.chapter)showChapter(step.chapter,step.chapterIndex,step.total);
  if(step.to.title)ui.title.textContent=step.to.title;
  if(step.to.caption)ui.caption.textContent=step.to.caption;
  if(step.from)setPose(step.from);
  ui.fade.style.opacity=step.kind==='fade-in'?'1':'0';
 }
 function finish(reason='ended'){
  if(!active)return;
  active=false;lastNow=null;steps=[];ui.fade.style.opacity='0';ui.fade.hidden=true;ui.root.hidden=true;
  document.body.classList.remove('touring');document.body.dataset.tourActive='false';
  controls.enabled=true;controls.enableDamping=savedDamping;controls.update();
  onEnd?.(reason);requestRender();
 }
 function start(tour){
  if(active||!tour?.chapters?.length)return false;
  const chapters=tour.chapters;
  const entries=new Set(['overflight','dissolve','route']),exits=new Set(['overflight','dissolve','route']);
  if(!Number.isFinite(tour.transitAltitude)||tour.transitAltitude<80||new Set(chapters.map(c=>c.id)).size!==chapters.length||chapters.some(c=>['id','title','caption'].some(key=>typeof c[key]!=='string'||!c[key].trim())||!entries.has(c.entry)||!exits.has(c.exit)||!Array.isArray(c.poses)||!c.poses.length||c.poses.some(p=>!validPoint(p))))throw new Error('Campus tour path is incomplete');
  for(const [index,chapter] of chapters.entries())if(chapter.entry==='route'){
   if(index===0||chapters[index-1].exit==='dissolve'||!Array.isArray(chapter.approach)||chapter.approach.length<2||chapter.approach.some(p=>!validPoint(p))||!samePose(chapter.approach[0],chapters[index-1].poses.at(-1))||!samePose(chapter.approach.at(-1),chapter.poses[0]))throw new Error('Campus tour route has an unverified join');
  }
  let previous=pose(),previousChapter=null;steps=[];
  for(const [index,chapter] of chapters.entries()){
   const first=chapter.poses[0],label={chapter,chapterIndex:index,total:chapters.length};
   if(index===0||reducedMotion||chapter.entry==='dissolve'||previousChapter?.exit==='dissolve'){
    steps.push({kind:'fade-out',from:previous,to:previous,duration:.7});
    steps.push({kind:'fade-in',from:first,to:first,duration:.8,...label});
   }else if(chapter.entry==='route'){
    let from=previous;
    for(const [i,destination] of chapter.approach.entries()){
     if(i===0)continue;
     steps.push({kind:'move',from,to:destination,duration:destination.seconds,easing:destination.easing,...(i===1?label:{})});from=destination;
    }
   }else{
    const altitude=Math.max(tour.transitAltitude,previous.p[1],first.p[1]);
    const rise={p:[previous.p[0],altitude,previous.p[2]],t:[...previous.t]};
    const across={p:[first.p[0],altitude,first.p[2]],t:[...first.t]};
    for(const [from,to,duration,extra] of [[previous,rise,2.7,{}],[rise,across,4.5,label],[across,first,3.0,{}]]){
     if(from.p.some((n,i)=>Math.abs(n-to.p[i])>1e-7)||from.t.some((n,i)=>Math.abs(n-to.t[i])>1e-7))steps.push({kind:'move',from,to,duration,...extra});
     else if(extra.chapter)steps.push({kind:'move',from,to,duration:.1,...extra});
    }
   }
   let from=first;
   for(const destination of chapter.poses){
    steps.push({kind:'move',from,to:reducedMotion?first:destination,duration:destination.seconds,easing:destination.easing});
    from=reducedMotion?first:destination;
   }
   previous=from;previousChapter=chapter;
  }
  steps.push({kind:'hold',from:previous,to:previous,duration:1.2});
  // A valid pair of endpoints can still look in opposite directions and
  // collapse the view halfway through. Reject that join before any UI changes.
  for(const step of steps){
   const a=step.from.p.map((n,i)=>n-step.from.t[i]),b=step.to.p.map((n,i)=>n-step.to.t[i]-a[i]),bb=b.reduce((sum,n)=>sum+n*n,0);
   const fraction=bb?Math.max(0,Math.min(1,-a.reduce((sum,n,i)=>sum+n*b[i],0)/bb)):0;
   if(Math.hypot(...a.map((n,i)=>n+fraction*b[i]))<1e-7)throw new Error('Campus tour camera direction collapses along its route');
  }
  savedDamping=controls.enableDamping;
  onStart?.();controls.enabled=false;controls.enableDamping=false;controls.update();
  camera.clearViewOffset();camera.updateProjectionMatrix();
  active=true;stepIndex=0;elapsed=0;lastNow=null;shownChapter=null;
  document.body.classList.add('touring');document.body.classList.remove('clean');document.body.dataset.tourActive='true';
  ui.root.hidden=false;ui.fade.hidden=false;showChapter(chapters[0],0,chapters.length);ui.end.focus({preventScroll:true});enterStep();requestRender();return true;
 }
 function update(now){
  if(!active)return false;
  // Do not leap through chapters after a stalled frame or a background tab.
  const delta=lastNow===null?0:Math.max(0,Math.min(.25,(now-lastNow)/1000));lastNow=now;elapsed+=delta;
  let step=steps[stepIndex];
  while(elapsed>=step.duration){
   elapsed-=step.duration;setPose(step.to);stepIndex++;
   if(stepIndex===steps.length){finish('complete');return false;}
   enterStep();step=steps[stepIndex];
  }
  const t=Math.min(1,elapsed/step.duration),eased=step.easing==='linear'?t:smooth(t);
  if(step.kind==='fade-out')ui.fade.style.opacity=String(eased);
  else if(step.kind==='fade-in')ui.fade.style.opacity=String(1-eased);
  else setPose({p:mix(step.from.p,step.to.p,eased),t:mix(step.from.t,step.to.t,eased)});
  ui.progress.value=(stepIndex+t)/steps.length;
  ui.root.dataset.phase=step.kind;ui.root.dataset.step=String(stepIndex);return true;
 }
 ui.end.onclick=()=>finish('ended');
 return {start,update,stop:finish,get active(){return active;}};
}
