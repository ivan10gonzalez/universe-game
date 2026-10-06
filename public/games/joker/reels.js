/* The renderer consumes a result; it never chooses or modifies a paid outcome. */
(function(root){
 const H=123,Y=426,columns=[[20,192,104],[194,362,278],[364,531,447],[534,701,618],[704,868,790]];
 const art={
  star:{box:[29,868,139,113]},mask:{atlas:'symbols',box:[1,858,157,154],scale:.87},
  ruby:{box:[216,875,116,108]},emerald:{box:[380,875,133,108]},
  orb:{box:[565,879,105,104]},gem:{box:[738,877,101,96]},
  bonus:{atlas:'symbols',box:[365,866,157,141],scale:.88},clubs:{atlas:'symbols',box:[557,731,140,132],scale:.88}
 };
 const initial=[['gem','star','mask'],['ruby','ruby','ruby'],['emerald','emerald','ruby'],['orb','orb','star'],['gem','gem','star']];
 let atlases={},background=null;const sprites=new Map(),streaks=new Map();
 function configure(images){atlases=images;sprites.clear();streaks.clear();background=null;}
 function surface(w,h){const s=document.createElement('canvas');s.width=Math.ceil(w);s.height=Math.ceil(h);return s;}
 // Flood only exterior purple pixels. The coloured outline and interior of each
 // symbol remain intact, unlike the polygon cuts used by the earlier version.
 function matte(s){const c=s.getContext('2d'),im=c.getImageData(0,0,s.width,s.height),d=im.data,w=s.width,h=s.height,seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
  const visit=i=>{if(i<0||i>=w*h||seen[i])return;seen[i]=1;const p=i*4,r=d[p],g=d[p+1],b=d[p+2];if((b>r*1.025&&g<b*.59)||(b>r*.96&&g<b*.56&&r<78)){queue[tail++]=i;d[p+3]=0;}};
  for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
  while(head<tail){const i=queue[head++],x=i%w;visit(i-w);visit(i+w);if(x)visit(i-1);if(x<w-1)visit(i+1);}
  c.putImageData(im,0,0);return s;
 }
 function sprite(image,kind){if(sprites.has(kind))return sprites.get(kind);const a=art[kind],raw=surface(a.box[2],a.box[3]);raw.getContext('2d').drawImage(a.atlas?atlases[a.atlas]:image,...a.box,0,0,raw.width,raw.height);matte(raw);const scale=a.scale||1,s=surface(raw.width*scale,raw.height*scale);s.getContext('2d').drawImage(raw,0,0,s.width,s.height);sprites.set(kind,s);return s;}
 function drawSymbol(ctx,image,kind,cx,y,smear=0){const s=sprite(image,kind);if(smear){const key=kind+':'+smear;let strip=streaks.get(key);if(!strip){strip=surface(s.width+8,s.height+smear*2+8);const p=strip.getContext('2d');p.filter='blur(1.5px)';p.globalCompositeOperation='lighter';const count=21;p.globalAlpha=1/count;for(let i=0;i<count;i++)p.drawImage(s,4,4+2*smear*i/(count-1));streaks.set(key,strip);}ctx.drawImage(strip,cx-strip.width/2,y+(H-strip.height)/2);}
  else ctx.drawImage(s,cx-s.width/2,y+(H-s.height)/2);
 }
 function progress(t){t=Math.max(0,Math.min(1,t));const a=.045,b=.9,area=a/2+b-a+(1-b)/2;if(t<a)return t*t/(2*a*area);if(t<b)return (a/2+t-a)/area;const u=t-b;return (a/2+b-a+u-u*u/(2*(1-b)))/area;}
 function plan(before,result,fast,reduced){return result.map((end,c)=>{const steps=reduced?0:24+c*8,keys=Object.keys(art),sequence=Array.from({length:steps+6},(_,i)=>keys[(i*7+c*3+Math.floor(i/3))%keys.length]);before[c].forEach((k,r)=>sequence[steps+r]=k);end.forEach((k,r)=>sequence[r]=k);return {steps,sequence,duration:reduced?150:(fast?520:1120)+c*(fast?120:350)};});}
 function backdrop(ctx,image,c,moving){const [left,right]=columns[c],width=right-left;
  if(!background){background=surface(37,29);background.getContext('2d').drawImage(image,212,852,37,29,0,0,37,29);}
  ctx.fillStyle='#700891';ctx.fillRect(left,Y,width,H*3);
  ctx.save();ctx.globalAlpha=moving?.2:.9;ctx.fillStyle=ctx.createPattern(background,'repeat');ctx.fillRect(left,Y,width,H*3);ctx.restore();
  const shade=ctx.createLinearGradient(left,0,right,0);shade.addColorStop(0,'#22003199');shade.addColorStop(.18,'#22003100');shade.addColorStop(.8,'#22003100');shade.addColorStop(1,'#22003199');ctx.fillStyle=shade;ctx.fillRect(left,Y,width,H*3);
 }
 function draw(ctx,image,grid,spins,elapsed){for(let c=0;c<5;c++){const [left,right,cx]=columns[c],spin=spins?.[c],active=spin&&elapsed<spin.duration;
   ctx.save();ctx.beginPath();ctx.rect(left,Y,right-left,H*3);ctx.clip();backdrop(ctx,image,c,active);
   if(active){const t=elapsed/spin.duration,d=spin.steps*progress(t),smear=t<.035?0:t>.965?0:t>.925?20:60;for(let j=Math.floor(-d)-2;j<Math.ceil(3-d)+2;j++){const k=spin.sequence[j+spin.steps];if(k)drawSymbol(ctx,image,k,cx,Y+(j+d)*H,smear);}}
   else grid[c].forEach((k,r)=>drawSymbol(ctx,image,k,cx,Y+r*H));
   const light=ctx.createLinearGradient(0,Y,0,Y+H*3);light.addColorStop(0,'#f2d1ec65');light.addColorStop(.1,'#fff0');light.addColorStop(.85,'#19002200');light.addColorStop(1,'#19002266');ctx.fillStyle=light;ctx.fillRect(left,Y,right-left,H*3);ctx.restore();
  }for(const [x,w] of [[178,21],[353,14],[526,15],[695,17]])ctx.drawImage(image,x,741,w,372,x,423,w,372);}
 const api={progress,plan,draw,initial,configure};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReelView=api;
})(globalThis);
