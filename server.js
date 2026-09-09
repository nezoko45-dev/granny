import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = process.env.PORT || 3000;
const players = new Map();
const granny = { x: 0, z: -24, chasing: false, roaming: true, timer: 0, targetId: null };
let roamTarget = { x: 0, z: -24 };
let lastTick = Date.now();
let roamPick = 0;

const walls = [
  [-26,-10,1,70],[26,-10,1,70],[0,25,52,1],[0,-45,52,1],
  [-12,5,1,20],[12,5,1,20],[-12,-20,1,28],[12,-20,1,28],
  [-7,-10,10,1],[7,-10,10,1],[-15,-32,18,1],[15,-32,18,1],
  [0,-39,18,1],[-20,-25,10,1],[20,-25,10,1],
  [-7,-2,4,2],[7,-2,4,2],[-18,-18,4,2],[18,-18,4,2],[0,-29,5,2]
];
function blocked(x,z,r=.45){ return walls.some(([wx,wz,w,d]) => x>wx-w/2-r && x<wx+w/2+r && z>wz-d/2-r && z<wz+d/2+r); }
function valid(x,z){ return x>-24.5&&x<24.5&&z>-43.5&&z<23.5&&!blocked(x,z,.45); }
function pickRoam(){
  for(let i=0;i<100;i++){
    const x=Math.random()*46-23,z=Math.random()*64-42;
    if(valid(x,z)){roamTarget={x,z};return;}
  }
  roamTarget={x:0,z:-24};
}
function nearestTarget(){
  let best=null,bestScore=Infinity;
  for(const p of players.values()){
    if(p.hidden) continue;
    const d=Math.hypot(p.x-granny.x,p.z-granny.z);
    if(d<bestScore){bestScore=d;best=p;}
  }
  return best;
}
function moveGranny(target,dt,speed){
  const dx=target.x-granny.x,dz=target.z-granny.z,d=Math.hypot(dx,dz);
  if(d<.35){return true;}
  const step=Math.min(d,speed*dt),nx=granny.x+dx/d*step,nz=granny.z+dz/d*step;
  if(valid(nx,granny.z)) granny.x=nx;
  if(valid(granny.x,nz)) granny.z=nz;
  return false;
}
function tick(){
  const now=Date.now(),dt=Math.min(.1,(now-lastTick)/1000);lastTick=now;
  const target=nearestTarget();
  if(target){
    const d=Math.hypot(target.x-granny.x,target.z-granny.z);
    if(d<42){
      granny.chasing=true;granny.roaming=false;granny.targetId=target.id;
      if(granny.timer<=0) granny.timer=11;
    }
  }
  if(granny.chasing){
    const t=players.get(granny.targetId);
    if(!t || t.hidden){granny.chasing=false;granny.roaming=true;granny.timer=0;granny.targetId=null;pickRoam();}
    else{
      granny.timer=Math.max(0,granny.timer-dt);
      if(granny.timer<=0){granny.chasing=false;granny.roaming=true;granny.targetId=null;pickRoam();}
      else moveGranny(t,dt,4.2);
    }
  } else {
    granny.roaming=true;
    if(Date.now()-roamPick>6000 || moveGranny(roamTarget,dt,2.2)){roamPick=Date.now();pickRoam();}
  }
  for(const p of players.values()){
    if(Math.hypot(p.x-granny.x,p.z-granny.z)<1.25) p.caught=true;
  }
}
function snapshot(){return JSON.stringify({type:'state',granny:{x:granny.x,z:granny.z,chasing:granny.chasing,roaming:granny.roaming,timer:granny.timer},players:[...players.values()].map(p=>({id:p.id,x:p.x,z:p.z,hidden:p.hidden,caught:p.caught}))});}
function broadcast(){const msg=snapshot();for(const p of players.values())if(p.ws.readyState===1)p.ws.send(msg);}
const server=http.createServer(async(req,res)=>{
  if(req.url==='/'||req.url==='/index.html'){
    try{const html=await readFile(new URL('./index.html',import.meta.url));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);}
    catch{res.writeHead(500);res.end('Could not load index.html');}
    return;
  }
  res.writeHead(404);res.end('Not found');
});
const wss=new WebSocketServer({server});
wss.on('connection',ws=>{
  const id=randomUUID();
  const p={id,ws,x:0,z:18,hidden:false,caught:false};
  players.set(id,p);
  ws.send(JSON.stringify({type:'welcome',id}));
  ws.on('message',raw=>{
    try{
      const m=JSON.parse(raw.toString());
      if(m.type==='input'){
        p.x=Number.isFinite(m.x)?Math.max(-25,Math.min(25,m.x)):p.x;
        p.z=Number.isFinite(m.z)?Math.max(-44,Math.min(24,m.z)):p.z;
        p.hidden=!!m.hidden;
      }
      if(m.type==='restart') p.caught=false;
    }catch{}
  });
  ws.on('close',()=>players.delete(id));
  ws.on('error',()=>players.delete(id));
});
setInterval(()=>{tick();broadcast();},50);
server.listen(PORT,()=>console.log(`Granny backend listening on port ${PORT}`));
