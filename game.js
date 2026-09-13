import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070504);
scene.fog = new THREE.Fog(0x070504, 12, 90);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';
camera.position.set(0, 1.7, 18);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xc9b7aa, 0x21130d, 1.4));
const lamp = new THREE.PointLight(0xffbd80, 70, 40);
lamp.position.set(0, 5, 0); lamp.castShadow = true; scene.add(lamp);

const mats = {
  floor: new THREE.MeshStandardMaterial({color:0x65452f, roughness:.92}),
  wall: new THREE.MeshStandardMaterial({color:0x92705a, roughness:.95}),
  wood: new THREE.MeshStandardMaterial({color:0x2a1912, roughness:.9}),
  granny: new THREE.MeshStandardMaterial({color:0x3e8b49}),
  skin: new THREE.MeshStandardMaterial({color:0xd79a82}),
  hair: new THREE.MeshStandardMaterial({color:0x707070}),
  red: new THREE.MeshBasicMaterial({color:0xff1515}),
  blue: new THREE.MeshStandardMaterial({color:0x438ee8})
};
const blockers=[];
function cube(x,y,z,w,h,d,mat,block=true){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);if(block)blockers.push({x,z,w,d});return m;}
cube(0,-.2,-10,52,.4,70,mats.floor,false);
function wall(x,z,w,d){cube(x,2.5,z,w,5,d,mats.wall,true)}
wall(-26,-10,1,70); wall(26,-10,1,70); wall(0,25,52,1); wall(0,-45,52,1);
wall(-12,5,1,20); wall(12,5,1,20); wall(-12,-20,1,28); wall(12,-20,1,28);
wall(-7,-10,10,1); wall(7,-10,10,1); wall(-15,-32,18,1); wall(15,-32,18,1); wall(0,-39,18,1);
wall(-20,-25,10,1); wall(20,-25,10,1);
cube(-7,1,-2,4,2,2,mats.wood); cube(7,1,-2,4,2,2,mats.wood);
cube(-18,1,-18,4,2,2,mats.wood); cube(18,1,-18,4,2,2,mats.wood); cube(0,1,-29,5,2,2,mats.wood);

// Granny is a proper articulated character now: feet, legs and arms move while she walks.
const granny = new THREE.Group(); scene.add(granny);
const body=new THREE.Mesh(new THREE.CylinderGeometry(.58,.82,2.1,12),mats.granny); body.position.y=1.05; body.castShadow=true; granny.add(body);
const head=new THREE.Mesh(new THREE.SphereGeometry(.46,16,12),mats.skin); head.position.y=2.45; head.castShadow=true; granny.add(head);
const hair=new THREE.Mesh(new THREE.SphereGeometry(.5,16,12,0,Math.PI*2,0,Math.PI*.62),mats.hair); hair.position.y=2.7; hair.scale.set(1.08,1.12,1.08); granny.add(hair);
for(const x of [-.15,.15]){const e=new THREE.Mesh(new THREE.SphereGeometry(.055,8,8),mats.red);e.position.set(x,2.5,.4);granny.add(e)}
const mouth=new THREE.Mesh(new THREE.BoxGeometry(.38,.12,.05),mats.skin); mouth.position.set(0,2.29,.43); granny.add(mouth);
function limb(w,h,d,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.castShadow=true;return m}
const leftLeg=new THREE.Group(), rightLeg=new THREE.Group(), leftArm=new THREE.Group(), rightArm=new THREE.Group();
leftLeg.position.set(-.28,.82,0); rightLeg.position.set(.28,.82,0); leftArm.position.set(-.7,1.55,0); rightArm.position.set(.7,1.55,0);
const ll=limb(.3,.95,.34,mats.granny), rl=limb(.3,.95,.34,mats.granny), la=limb(.28,1.05,.3,mats.granny), ra=limb(.28,1.05,.3,mats.granny);
ll.position.y=-.45; rl.position.y=-.45; la.position.y=-.52; ra.position.y=-.52;
leftLeg.add(ll); rightLeg.add(rl); leftArm.add(la); rightArm.add(ra); granny.add(leftLeg,rightLeg,leftArm,rightArm);

const me = {x:0,z:18};
let socket, myId=null, keys={}, started=false, lastSent=0, remotePlayers=new Map();
const statusEl=document.querySelector('#status'), countEl=document.querySelector('#players'), startEl=document.querySelector('#start'), roomEl=document.querySelector('#room');
const worldPlayers=new Map();
function remote(id){if(remotePlayers.has(id))return remotePlayers.get(id);const g=new THREE.Group();const b=new THREE.Mesh(new THREE.CapsuleGeometry(.38,.9,4,8),mats.blue);b.position.y=1;g.add(b);scene.add(g);remotePlayers.set(id,g);return g}
function removeRemote(id){const g=remotePlayers.get(id);if(g){scene.remove(g);remotePlayers.delete(id)}}
function connect(){
  const proto=location.protocol==='https:'?'wss':'ws';
  socket=new WebSocket(`${proto}://${location.host}/ws`);
  socket.onopen=()=>{socket.send(JSON.stringify({type:'join'}));roomEl.textContent='Connected to Granny server';};
  socket.onclose=()=>{statusEl.textContent='SERVER OFFLINE';setTimeout(connect,1500)};
  socket.onerror=()=>{};
  socket.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}
    if(m.type==='welcome'){myId=m.id;countEl.textContent=`PLAYERS ${m.players}/16`}
    if(m.type==='state'){
      countEl.textContent=`PLAYERS ${m.players}/16`;
      statusEl.textContent=m.granny.state==='CHASE'?'GRANNY IS CHASING YOU':'GRANNY IS ROAMING';
      granny.userData.targetX=m.granny.x; granny.userData.targetZ=m.granny.z;
      for(const p of m.playersState){if(p.id===myId)continue;const g=remote(p.id);g.userData.targetX=p.x;g.userData.targetZ=p.z;worldPlayers.set(p.id,p)}
      for(const id of remotePlayers.keys())if(!m.playersState.some(p=>p.id===id))removeRemote(id);
    }
  };
}
function hit(x,z,r=.42){for(const b of blockers)if(x>b.x-b.w/2-r&&x<b.x+b.w/2+r&&z>b.z-b.d/2-r&&z<b.z+b.d/2+r)return true;return false}
function move(dt){if(!started)return;let x=(keys.KeyD?1:0)-(keys.KeyA?1:0),z=(keys.KeyW?1:0)-(keys.KeyS?1:0);if(!x&&!z)return;const l=Math.hypot(x,z);x/=l;z/=l;const f=new THREE.Vector3(-Math.sin(camera.rotation.y),0,-Math.cos(camera.rotation.y)),r=new THREE.Vector3(Math.cos(camera.rotation.y),0,-Math.sin(camera.rotation.y));const dir=f.multiplyScalar(z).add(r.multiplyScalar(x)).normalize();const speed=(keys.ShiftLeft||keys.ShiftRight)?7:4;const nx=camera.position.x+dir.x*speed*dt,nz=camera.position.z+dir.z*speed*dt;if(!hit(nx,camera.position.z))camera.position.x=nx;if(!hit(camera.position.x,nz))camera.position.z=nz;camera.position.x=THREE.MathUtils.clamp(camera.position.x,-25,25);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-44,24);me.x=camera.position.x;me.z=camera.position.z;}
function sendPosition(){if(socket?.readyState===1&&myId)socket.send(JSON.stringify({type:'move',x:me.x,z:me.z,rotation:camera.rotation.y}))}
function begin(){started=true;startEl.classList.add('hidden');renderer.domElement.requestPointerLock();sendPosition()}
document.querySelector('#play').onclick=begin;
document.addEventListener('pointerlockchange',()=>{if(started&&document.pointerLockElement!==renderer.domElement)startEl.classList.remove('hidden')});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===renderer.domElement){camera.rotation.y-=e.movementX*.0022;camera.rotation.x=Math.max(-1.45,Math.min(1.45,camera.rotation.x-e.movementY*.0022))}});
document.addEventListener('keydown',e=>{keys[e.code]=true;if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(e.code))e.preventDefault()});
document.addEventListener('keyup',e=>keys[e.code]=false);document.addEventListener('blur',()=>keys={});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
connect();
let last=performance.now();
function animateCharacter(dt){
  const tx=granny.userData.targetX, tz=granny.userData.targetZ;
  if(Number.isFinite(tx)&&Number.isFinite(tz)){
    const dx=tx-granny.position.x,dz=tz-granny.position.z,dist=Math.hypot(dx,dz);
    const smoothing=1-Math.exp(-18*dt);
    granny.position.x=THREE.MathUtils.lerp(granny.position.x,tx,smoothing);
    granny.position.z=THREE.MathUtils.lerp(granny.position.z,tz,smoothing);
    const moving=dist>.035;
    if(moving){
      const desired=Math.atan2(dx,dz);
      let delta=THREE.MathUtils.euclideanModulo(desired-granny.rotation.y+Math.PI,Math.PI*2)-Math.PI;
      granny.rotation.y+=delta*Math.min(1,12*dt);
      granny.userData.walkTime=(granny.userData.walkTime||0)+dt*(granny.userData.state==='CHASE'?9:5.5);
    }
    const t=granny.userData.walkTime||0;
    const movingNow=dist>.035;
    const stride=movingNow?Math.sin(t)*.55:0;
    leftLeg.rotation.x=stride; rightLeg.rotation.x=-stride;
    leftArm.rotation.x=-stride*.72; rightArm.rotation.x=stride*.72;
    body.position.y=1.05+(movingNow?Math.abs(Math.sin(t*2))*.035:0);
  }
}
function animateRemote(dt){
  const smoothing=1-Math.exp(-18*dt);
  for(const g of remotePlayers.values()){
    const tx=g.userData.targetX,tz=g.userData.targetZ;if(!Number.isFinite(tx)||!Number.isFinite(tz))continue;
    const dx=tx-g.position.x,dz=tz-g.position.z,dist=Math.hypot(dx,dz);g.position.x=THREE.MathUtils.lerp(g.position.x,tx,smoothing);g.position.z=THREE.MathUtils.lerp(g.position.z,tz,smoothing);
    if(dist>.03)g.rotation.y+= (THREE.MathUtils.euclideanModulo(Math.atan2(dx,dz)-g.rotation.y+Math.PI,Math.PI*2)-Math.PI)*Math.min(1,12*dt);
  }
}
function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;move(dt);animateCharacter(dt);animateRemote(dt);if(now-lastSent>50){sendPosition();lastSent=now}renderer.render(scene,camera);requestAnimationFrame(frame)}
requestAnimationFrame(frame);
