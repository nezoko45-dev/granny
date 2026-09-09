import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = process.env.PORT || 3000;
const peers = new Map();
const server=http.createServer(async(req,res)=>{
  if(req.url==='/'||req.url==='/index.html'){
    try{const html=await readFile(new URL('./index.html',import.meta.url));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html)}catch{res.writeHead(500);res.end('Could not load index.html')}
    return;
  }
  if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,players:peers.size}));return;}
  res.writeHead(404);res.end('Not found');
});
const wss=new WebSocketServer({server,path:'/ws'});
function send(ws,msg){if(ws.readyState===1)ws.send(JSON.stringify(msg))}
function announceLeave(id){for(const p of peers.values())send(p.ws,{type:'left',id})}
wss.on('connection',ws=>{
  let id=randomUUID();
  const peer={id,ws};peers.set(id,peer);send(ws,{type:'welcome',id});
  ws.on('message',raw=>{try{
    const m=JSON.parse(raw.toString());
    if(m.type==='register'){
      const requested=typeof m.requestedId==='string'&&m.requestedId.length<128?m.requestedId:null;
      if(requested){if(peers.has(requested)&&peers.get(requested)!==peer){send(ws,{type:'error',error:'unavailable-id'});return}peers.delete(id);id=requested;peer.id=id;peers.set(id,peer)}
      send(ws,{type:'welcome',id});return;
    }
    if(m.type==='connect'){
      const target=peers.get(m.to);if(!target){send(ws,{type:'connect-error',to:m.to,error:'peer-unavailable'});return}
      send(target.ws,{type:'incoming',from:id,room:'public'});send(ws,{type:'connected',to:target.id,room:'public'});return;
    }
    if(m.type==='data'){const target=peers.get(m.to);if(target)send(target.ws,{type:'data',from:id,data:m.data});return;}
  }catch{}});
  ws.on('close',()=>{if(peers.get(id)===peer){peers.delete(id);announceLeave(id)}});
  ws.on('error',()=>{if(peers.get(id)===peer){peers.delete(id);announceLeave(id)}});
});
server.listen(PORT,()=>console.log(`Granny multiplayer backend listening on port ${PORT}`));
