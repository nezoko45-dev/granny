import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 3000);
const MAX_PLAYERS = 16;
const CHASE_DISTANCE = 45;
const CHASE_RELEASE_DISTANCE = 55;
const TICK_MS = 50;
const GRANNY_SPEED = 3.2;
const CHASE_SPEED = 5.8;
const ROAM_SPEED = 2.0;
const bounds = { minX:-25, maxX:25, minZ:-44, maxZ:24 };

const players = new Map();
const granny = { x:0, z:-24, state:'ROAM', targetId:null, roamX:0, roamZ:-24 };
const walls = [
  [-26,-10,1,70],[26,-10,1,70],[0,25,52,1],[0,-45,52,1],
  [-12,5,1,20],[12,5,1,20],[-12,-20,1,28],[12,-20,1,28],
  [-7,-10,10,1],[7,-10,10,1],[-15,-32,18,1],[15,-32,18,1],[0,-39,18,1],
  [-20,-25,10,1],[20,-25,10,1]
];

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const game = await readFile(new URL('./game.js', import.meta.url), 'utf8');
const server = http.createServer((req,res)=>{
  if(req.url==='/'||req.url==='/index.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);return;}
  if(req.url==='/game.js'){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});res.end(game);return;}
  if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,players:players.size,maxPlayers:MAX_PLAYERS,granny:granny.state}));return;}
  res.writeHead(404);res.end('Not found');
});
const wss = new WebSocketServer({server,path:'/ws'});
const send=(ws,msg)=>{if(ws.readyState===1)ws.send(JSON.stringify(msg))};
const broadcast=msg=>{for(const p of players.values())send(p.ws,msg)};
function collides(x,z,r=.5){for(const [wx,wz,w,d] of walls)if(x>wx-w/2-r&&x<wx+w/2+r&&z>wz-d/2-r&&z<wz+d/2+r)return true;return false}
function clampPlayer(x,z){return {x:Math.max(bounds.minX+.7,Math.min(bounds.maxX-.7,x)),z:Math.max(bounds.minZ+.7,Math.min(bounds.maxZ-.7,z))}}
function validMove(p,x,z){const q=clampPlayer(x,z);if(!collides(q.x,p.z)&&!collides(p.x,q.z)){p.x=q.x;p.z=q.z}}
function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z)}
function pickTarget(){
  let best=null;
  for(const p of players.values()){
    const score=(Date.now()-p.lastMoveAt<5000?100000:0) + p.speed*100 + p.noise;
    if(!best || score>best.score)best={p,score};
  }
  return best?.p || null;
}
function chooseRoam(){
  const p=pickTarget();
  if(p){granny.roamX=p.x;granny.roamZ=p.z;return}
  granny.roamX=(Math.random()*40)-20; granny.roamZ=(Math.random()*54)-30;
}
function moveToward(x,z,tx,tz,speed){const dx=tx-x,dz=tz-z,d=Math.hypot(dx,dz);if(d<.001)return;const step=Math.min(speed*TICK_MS/1000,d);const nx=x+dx/d*step,nz=z+dz/d*step;if(!collides(nx,nz,.55)){granny.x=nx;granny.z=nz;return}if(!collides(x+dx/d*step,z,.55))granny.x=x+dx/d*step;else if(!collides(x,z+dz/d*step,.55))granny.z=z+dz/d*step}
function updateGranny(){
  const current=granny.targetId?players.get(granny.targetId):null;
  if(current && distance(granny,current)<=CHASE_RELEASE_DISTANCE){
    granny.state='CHASE';
  }else{
    const nearby=[...players.values()].filter(p=>distance(granny,p)<=CHASE_DISTANCE);
    if(nearby.length){nearby.sort((a,b)=>b.noise-a.noise);granny.targetId=nearby[0].id;granny.state='CHASE'}
    else {granny.targetId=null;granny.state='ROAM';if(Math.hypot(granny.x-granny.roamX,granny.z-granny.roamZ)<1.5)chooseRoam();}
  }
  if(granny.state==='CHASE'){
    const target=players.get(granny.targetId);if(target)moveToward(granny.x,granny.z,target.x,target.z,CHASE_SPEED);
  }else{
    const target=pickTarget();if(target){granny.roamX=target.x;granny.roamZ=target.z}moveToward(granny.x,granny.z,granny.roamX,granny.roamZ,ROAM_SPEED);
  }
}
function snapshot(){return {type:'state',players:players.size,granny:{x:Number(granny.x.toFixed(3)),z:Number(granny.z.toFixed(3)),state:granny.state,targetId:granny.targetId},playersState:[...players.values()].map(p=>({id:p.id,x:Number(p.x.toFixed(3)),z:Number(p.z.toFixed(3)),rotation:p.rotation}))}}

wss.on('connection',ws=>{
  if(players.size>=MAX_PLAYERS){send(ws,{type:'error',error:'server-full',maxPlayers:MAX_PLAYERS});ws.close();return}
  const id=randomUUID();const p={id,ws,x:0,z:18,rotation:0,lastMoveAt:Date.now(),speed:0,noise:0,lastX:0,lastZ:18};players.set(id,p);send(ws,{type:'welcome',id,players:players.size,maxPlayers:MAX_PLAYERS});broadcast(snapshot());
  ws.on('message',raw=>{let m;try{m=JSON.parse(raw.toString())}catch{return}
    if(m.type==='move'){
      const now=Date.now(),oldX=p.x,oldZ=p.z;const x=Number(m.x),z=Number(m.z);if(!Number.isFinite(x)||!Number.isFinite(z))return;
      validMove(p,x,z);p.rotation=Number.isFinite(m.rotation)?m.rotation:0;const moved=Math.hypot(p.x-oldX,p.z-oldZ);p.speed=moved/(Math.max(1,now-p.lastMoveAt)/1000);if(moved>.02)p.lastMoveAt=now;p.noise=Math.min(1,p.speed/7);p.lastX=p.x;p.lastZ=p.z;
    }
  });
  const cleanup=()=>{if(players.delete(id)){if(granny.targetId===id)granny.targetId=null;broadcast(snapshot())}};
  ws.on('close',cleanup);ws.on('error',cleanup);
});
setInterval(()=>{updateGranny();broadcast(snapshot())},TICK_MS);
server.listen(PORT,'0.0.0.0',()=>console.log(`Granny server listening on ${PORT} — max ${MAX_PLAYERS} players`));
