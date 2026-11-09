// 2026-10-04. Cut an actual opening in the two flat campus ground meshes.
// Interpolate every original vertex attribute; retain transforms and materials.
import * as THREE from 'three';
export function cutGroundRectangle(mesh, bounds) {
 const source=mesh.geometry, attributes=Object.entries(source.attributes), index=source.index;
 const result=Object.fromEntries(attributes.map(([key])=>[key,[]]));
 const vertex=i=>{const value={};for(const [key,a]of attributes)value[key]=Array.from({length:a.itemSize},(_,j)=>a.array[i*a.itemSize+j]);const p=new THREE.Vector3(...value.position).applyMatrix4(mesh.matrixWorld);value.site=[p.x,-p.z];return value;};
 const lerp=(a,b,t)=>{const value={};for(const key of [...attributes.map(([k])=>k),'site'])value[key]=a[key].map((v,i)=>v+(b[key][i]-v)*t);return value;};
 const planes=[[0,bounds[0],1],[0,bounds[2],-1],[1,bounds[1],1],[1,bounds[3],-1]];
 const split=(poly,[axis,edge,sign])=>{const inside=[],outside=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a.site[axis]-edge)*sign,db=(b.site[axis]-edge)*sign;(da>=0?inside:outside).push(a);if((da<0)!==(db<0)){const hit=lerp(a,b,da/(da-db));inside.push(hit);outside.push(hit);}}return [inside,outside];};
 const emit=poly=>{for(let i=1;i<poly.length-1;i++)for(const v of [poly[0],poly[i],poly[i+1]])for(const [key]of attributes)result[key].push(...v[key]);};
 const count=index?index.count:source.attributes.position.count;
 for(let i=0;i<count;i+=3){let remaining=[0,1,2].map(j=>vertex(index?index.getX(i+j):i+j));for(const plane of planes){if(remaining.length<3)break;const [inside,outside]=split(remaining,plane);emit(outside);remaining=inside;}}
 const geometry=new THREE.BufferGeometry();for(const [key,a]of attributes)geometry.setAttribute(key,new THREE.BufferAttribute(new a.array.constructor(result[key]),a.itemSize,a.normalized));geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;
 return {name:mesh.name,beforeTriangles:count/3,afterTriangles:geometry.attributes.position.count/3,bounds};
}
