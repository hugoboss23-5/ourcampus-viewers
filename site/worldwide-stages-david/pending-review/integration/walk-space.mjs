// 2026-10-04. Native XY metres; explicit room polygons and column bounds.
export function inPolygon(x,y,polygon){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const [ax,ay]=polygon[i],[bx,by]=polygon[j];
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
}
export function clearPosition(x,y,space,radius=.3){
  // Check the full user envelope conservatively against the room boundary.
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8;
    if(!space.polygons.some(p=>inPolygon(x+Math.cos(a)*radius,y+Math.sin(a)*radius,p)))return false;
  }
  return !(space.obstacles||[]).some(({bounds:[x0,y0,x1,y1]})=>{
    const nx=Math.max(x0,Math.min(x1,x)),ny=Math.max(y0,Math.min(y1,y));
    return (x-nx)**2+(y-ny)**2<radius*radius;
  });
}
export function moveInSpace(position,delta,space,radius=.3){
  let [x,y]=position;const count=Math.max(1,Math.ceil(Math.hypot(...delta)/.08));
  const dx=delta[0]/count,dy=delta[1]/count;
  // Substeps prevent crossing a thin wall/column during a long frame.
  for(let i=0;i<count;i++){
    if(clearPosition(x+dx,y+dy,space,radius)){x+=dx;y+=dy;}
    else{
      if(clearPosition(x+dx,y,space,radius))x+=dx;
      if(clearPosition(x,y+dy,space,radius))y+=dy;
    }
  }
  return [x,y,space.floorZ];
}
export function pathAtDistance(points,distance){
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(...b.map((v,k)=>v-a[k]));
    if(distance<=length){const t=length?distance/length:1;return a.map((v,k)=>v+(b[k]-v)*t);}
    distance-=length;
  }
  return [...points.at(-1)];
}
export const pathLength=points=>points.slice(1).reduce((sum,b,i)=>sum+Math.hypot(...b.map((v,k)=>v-points[i][k])),0);
