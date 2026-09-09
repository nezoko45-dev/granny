// Browser-side Peer-compatible transport backed by the Granny WebSocket server.
// Unlike PeerJS, player traffic never goes directly between browsers.
(() => {
  const rooms = new Map();
  const socketUrl = () => {
    const p = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${p}//${location.host}/ws`;
  };
  class Conn {
    constructor(owner, remoteId, roomId) {
      this.owner=owner; this.peer=remoteId; this.roomId=roomId; this.open=false;
      this.handlers={open:[],data:[],close:[],error:[]};
    }
    on(type,fn){(this.handlers[type] ||= []).push(fn);return this;}
    emit(type,arg){for(const fn of this.handlers[type]||[])try{fn(arg)}catch(e){console.error(e)}}
    send(data){this.owner._send({type:'data',room:this.roomId,to:this.peer,data});}
    _open(){if(!this.open){this.open=true;this.emit('open');}}
    _close(){if(this.open){this.open=false;this.emit('close');}}
  }
  class Peer {
    constructor(id){
      this.id=id || null; this.open=false; this.socket=null; this.handlers={open:[],connection:[],error:[]}; this.conns=new Map();
      this.socket=new WebSocket(socketUrl());
      this.socket.onopen=()=>{this._send({type:'register',requestedId:this.id});};
      this.socket.onmessage=e=>this._message(JSON.parse(e.data));
      this.socket.onerror=e=>this._emit('error',e);
      this.socket.onclose=()=>{this.open=false;for(const c of this.conns.values())c._close();};
    }
    on(type,fn){(this.handlers[type] ||= []).push(fn);return this;}
    _emit(type,arg){for(const fn of this.handlers[type]||[])try{fn(arg)}catch(e){console.error(e)}}
    _send(m){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(m));}
    connect(remoteId){
      const c=new Conn(this,remoteId,null); this._send({type:'connect',to:remoteId});
      c.roomId=rooms.get(this.id)||'public'; this.conns.set(remoteId,c);
      return c;
    }
    _message(m){
      if(m.type==='welcome'){this.id=m.id;this.open=true;this._emit('open',this.id);}
      if(m.type==='incoming'){const c=new Conn(this,m.from,m.room);c.roomId=m.room;this.conns.set(m.from,c);this._emit('connection',c);c._open();}
      if(m.type==='connected'){const c=this.conns.get(m.to);if(c){c.roomId=m.room;c._open();}}
      if(m.type==='data'){const c=this.conns.get(m.from);if(c)c.emit('data',m.data);}
      if(m.type==='left'){const c=this.conns.get(m.id);if(c){c.emit('data',{type:'leave',id:m.id});c._close();this.conns.delete(m.id);}}
    }
    destroy(){try{this.socket?.close()}catch{}this.open=false;}
  }
  window.Peer=Peer;
})();
