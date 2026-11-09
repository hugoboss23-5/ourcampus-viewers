/** 2026-10-04. Conservative display packing for the existing static tree tiles.
 * One full permutation is uploaded: visible prefix, then every culled instance.
 * Shadows expand count only. No attribute swap/upload happens inside a render.
 * Root must update the selected tree geometry BEFORE update(camera), render the
 * same camera without XR/secondary-camera passes, and wrap the native-geometry
 * shadow callback in withFullInstances(). Call dispose() before model disposal.
 * Raycast instanceId remains Three's packed index; sourceIndex(mesh, id) maps it
 * back to the original tile index. Counts refer to primitive instances, not trees.
 * Native bounds and source arrays never change. Shared geometry must remain static;
 * normal Three attribute version changes are checked. Direct unversioned geometry
 * array edits violate that ownership contract and require preparing a new model.
 */
import * as THREE from 'three';

const sameArray=(a,b)=>a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
const finiteArray=a=>a.every(Number.isFinite);
const fail=message=>{throw Error('Tree visibility: '+message);};
function attributeRecord(attribute,size,label){
 if(!attribute?.isInstancedBufferAttribute||attribute.isInterleavedBufferAttribute||attribute.itemSize!==size||attribute.normalized||attribute.meshPerAttribute!==1||!(attribute.array instanceof Float32Array)||!finiteArray(attribute.array))fail('unsupported '+label);
 return {attribute,array:attribute.array,version:attribute.version,copy:attribute.array.slice()};
}
function geometryRecord(geometry){
 if(!geometry?.isBufferGeometry||Object.values(geometry.morphAttributes||{}).some(a=>a.length)||Object.values(geometry.attributes).some(a=>a.isInstancedBufferAttribute))fail('unsupported deforming geometry');
 const position=geometry.getAttribute('position');
 if(!position||position.itemSize!==3||position.isInterleavedBufferAttribute||position.isGLBufferAttribute||!finiteArray(position.array))fail('unsupported positions');
 const bounds=new THREE.Box3().setFromBufferAttribute(position),sphere=bounds.getBoundingSphere(new THREE.Sphere());
 if(!Number.isFinite(sphere.radius)||sphere.radius<0)fail('invalid geometry bounds');
 const attrs=[...Object.entries(geometry.attributes),['index',geometry.index]].filter(([,a])=>a).map(([name,a])=>({name,attribute:a,array:a.array,version:a.version,count:a.count}));
 return {geometry,sphere,attrs};
}
function unchangedGeometry(record){
 const entries=[...Object.entries(record.geometry.attributes),['index',record.geometry.index]].filter(([,a])=>a);
 if(entries.length!==record.attrs.length||entries.some(([name,a],i)=>{const old=record.attrs[i];return name!==old.name||a!==old.attribute||a.array!==old.array||a.version!==old.version||a.count!==old.count;}))fail('source geometry changed; prepare again');
}
function affine(matrix){
 const e=matrix.elements;
 if(!finiteArray(e)||e[3]!==0||e[7]!==0||e[11]!==0||e[15]!==1)fail('non-finite/non-affine instance transform');
}
// Bound the largest singular value using the max absolute row sum of A^T A.
// Unlike max column length, this remains conservative for affine shear.
function stretch(matrix){
 const e=matrix.elements;let bound=0;
 for(let i=0;i<3;i++){let row=0;for(let j=0;j<3;j++)row+=Math.abs(e[i*4]*e[j*4]+e[i*4+1]*e[j*4+1]+e[i*4+2]*e[j*4+2]);bound=Math.max(bound,row);}
 return Math.sqrt(bound);
}

export function createTreeVisibility(){
 let entries=[],prepared=false,fullActive=false;
 const records=new Map(),frustum=new THREE.Frustum(),projection=new THREE.Matrix4(),local=new THREE.Matrix4(),world=new THREE.Matrix4(),sphere=new THREE.Sphere();
 const stats={prepared:false,tiles:0,sourceInstances:0,visibleInstances:0,culledInstances:0};
 function prepare(meshes){
  if(prepared||fullActive)fail('dispose before preparing another model');
  if(!Array.isArray(meshes)||new Set(meshes).size!==meshes.length)fail('expected distinct tree meshes');
  const geometries=new Map();
  const next=meshes.map(mesh=>{
   if(!mesh?.isInstancedMesh||mesh.userData.kind!=='specified_grove_tree_visual'||mesh.morphTexture||mesh.morphTargetInfluences?.length||mesh.customDepthMaterial||mesh.customDistanceMaterial||Object.hasOwn(mesh,'onBeforeRender')||Object.hasOwn(mesh,'onBeforeShadow'))fail('unsupported tree tile');
   const material=mesh.material;
   if(Array.isArray(material)||!material?.isMeshStandardMaterial||material.displacementMap||Object.hasOwn(material,'onBeforeCompile'))fail('unsupported tree material');
   const native=mesh.userData.nativeTreeGeometry,distant=mesh.userData.distanceTreeGeometry;
   if(!native||!distant||![native,distant].includes(mesh.geometry))fail('missing or unexpected tree geometry');
   for(const geometry of new Set([native,distant]))if(!geometries.has(geometry))geometries.set(geometry,geometryRecord(geometry));
   const matrix=attributeRecord(mesh.instanceMatrix,16,'instance matrix'),color=mesh.instanceColor?attributeRecord(mesh.instanceColor,3,'instance color'):null,count=mesh.count;
   if(!Number.isInteger(count)||count<0||count>mesh.instanceMatrix.count||(color&&count>color.attribute.count)||!mesh.boundingSphere||!mesh.userData.nativeTreeSphere)fail('invalid full source count or missing native bounds');
   for(let i=0;i<count;i++){local.fromArray(matrix.copy,i*16);affine(local);}
   const displayMatrix=matrix.attribute.clone().setUsage(THREE.DynamicDrawUsage),displayColor=color?color.attribute.clone().setUsage(THREE.DynamicDrawUsage):null;
   return {mesh,count,matrix,color,displayMatrix,displayColor,material,native,distant,geometryRecords:geometries,bounds:mesh.boundingSphere,boundsCopy:mesh.boundingSphere.clone(),nativeSphere:mesh.userData.nativeTreeSphere,nativeSphereCopy:mesh.userData.nativeTreeSphere.clone(),order:Uint32Array.from({length:count},(_,i)=>i),visible:count};
  });
  for(const e of next){e.mesh.instanceMatrix=e.displayMatrix;e.mesh.instanceColor=e.displayColor;records.set(e.mesh,e);}
  entries=next;prepared=true;Object.assign(stats,{prepared:true,tiles:entries.length,sourceInstances:entries.reduce((sum,e)=>sum+e.count,0)});stats.visibleInstances=stats.sourceInstances;stats.culledInstances=0;
  return {...stats};
 }
 function check(e){
  const m=e.mesh;
  if(m.instanceMatrix!==e.displayMatrix||m.instanceColor!==e.displayColor||m.count!==e.visible||m.material!==e.material||m.userData.nativeTreeGeometry!==e.native||m.userData.distanceTreeGeometry!==e.distant||![e.native,e.distant].includes(m.geometry))fail('tile ownership or source identity changed');
  if(m.boundingSphere!==e.bounds||!m.boundingSphere.equals(e.boundsCopy)||m.userData.nativeTreeSphere!==e.nativeSphere||!e.nativeSphere.equals(e.nativeSphereCopy))fail('native broadphase bounds changed');
  for(const a of [e.matrix,e.color].filter(Boolean))if(a.attribute.array!==a.array||a.attribute.version!==a.version||!sameArray(a.array,a.copy))fail('source instance data changed; prepare again');
 }
 function update(camera){
  if(fullActive)fail('cannot update during a full-instance pass');
  if(!prepared)return {...stats};
  if(!camera?.isCamera||camera.isArrayCamera||(!camera.isPerspectiveCamera&&!camera.isOrthographicCamera)||camera.coordinateSystem!==THREE.WebGLCoordinateSystem)fail('one WebGL camera is required');
  camera.updateWorldMatrix(true,false);projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  if(!finiteArray(projection.elements)||projection.determinant()===0)fail('invalid camera projection');
  frustum.setFromProjectionMatrix(projection,THREE.WebGLCoordinateSystem,camera.reversedDepth);
  if(frustum.planes.some(p=>!finiteArray([...p.normal.toArray(),p.constant])))fail('invalid camera frustum');
  const checked=new Set(),plans=[];
  for(const e of entries){
   check(e);for(const g of [e.native,e.distant])if(!checked.has(g)){unchangedGeometry(e.geometryRecords.get(g));checked.add(g);}
   e.mesh.updateWorldMatrix(true,false);affine(e.mesh.matrixWorld);
   const sourceSphere=e.geometryRecords.get(e.mesh.geometry).sphere,visible=[],hidden=[];
   for(let i=0;i<e.count;i++){
    local.fromArray(e.matrix.copy,i*16);world.multiplyMatrices(e.mesh.matrixWorld,local);
    sphere.center.copy(sourceSphere.center).applyMatrix4(world);sphere.radius=sourceSphere.radius*stretch(world);
    // One centimetre plus scale-relative float32 slack prevents edge clipping.
    sphere.radius+=.01+32*2**-23*(1+Math.abs(sphere.center.x)+Math.abs(sphere.center.y)+Math.abs(sphere.center.z)+sphere.radius+camera.position.length());
    (frustum.intersectsSphere(sphere)?visible:hidden).push(i);
   }
   plans.push({entry:e,order:visible.concat(hidden),visible:visible.length});
  }
  let visibleTotal=0;
  for(const {entry:e,order,visible}of plans){
   if(!sameArray(e.order,order)){
    for(let i=0;i<order.length;i++){const original=order[i];e.displayMatrix.array.set(e.matrix.copy.subarray(original*16,original*16+16),i*16);if(e.color)e.displayColor.array.set(e.color.copy.subarray(original*3,original*3+3),i*3);}
    e.order.set(order);e.displayMatrix.needsUpdate=true;if(e.displayColor)e.displayColor.needsUpdate=true;
   }
   e.visible=visible;e.mesh.count=visible;visibleTotal+=visible;
  }
  stats.visibleInstances=visibleTotal;stats.culledInstances=stats.sourceInstances-visibleTotal;return {...stats};
 }
 function withFullInstances(callback){
  if(typeof callback!=='function'||callback.constructor?.name==='AsyncFunction'||fullActive)fail('a synchronous, non-nested full-instance callback is required');
  for(const e of entries)check(e);
  fullActive=true;
  try{for(const e of entries)e.mesh.count=e.count;const result=callback();if(result?.then)fail('full-instance callback returned a promise');return result;}
  finally{for(const e of entries)e.mesh.count=e.visible;fullActive=false;}
 }
 function sourceIndex(mesh,packedIndex){const e=records.get(mesh);if(!e||!Number.isInteger(packedIndex)||packedIndex<0||packedIndex>=e.count)fail('invalid instance lookup');return e.order[packedIndex];}
 function sourceCount(mesh){const e=records.get(mesh);if(!e)fail('unknown tile');return e.count;}
 function dispose(){
  if(fullActive)fail('cannot dispose during a full-instance pass');
  for(const e of entries){check(e);e.mesh.dispose();e.mesh.instanceMatrix=e.matrix.attribute;e.mesh.instanceColor=e.color?.attribute??null;e.mesh.count=e.count;}
  entries=[];records.clear();prepared=false;Object.assign(stats,{prepared:false,tiles:0,sourceInstances:0,visibleInstances:0,culledInstances:0});
 }
 return {prepare,update,withFullInstances,sourceIndex,sourceCount,dispose,get stats(){return {...stats};}};
}
