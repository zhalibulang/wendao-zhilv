/* ============================================================
   wd-sync.js —— 多设备存档同步（v64）
   通道：GitHub 私有 Gist（单文件 wendao-bundle.json）
   密文：AES-GCM，密钥由加入口令（缺省=房间号派生）PBKDF2 12 万轮
   合并：以 _syncAt 较新的一端为基底，并集合并所有进度型字段
   另含：完整备份文件导出/导入（不依赖网络）
   仅读写 localStorage，不依赖游戏运行时；mergeBundle 可独立单测。
   ============================================================ */
(function(){
"use strict";
const SAVE_KEY="wendao_v2_save", CFG_KEY="wdzx.cfg.v1", SYNC_KEY="wdzx.sync.v1";
const GIST_FILE="wendao-bundle.json";
const API="https://api.github.com";
const PUSH_MIN_GAP=15000, PUSH_DEBOUNCE=25000, MAX_BUNDLE=950000;

/* ---------- 小工具 ---------- */
function lsGet(k){ try{return localStorage.getItem(k);}catch(e){return null;} }
function lsSet(k,v){ try{localStorage.setItem(k,v);}catch(e){} }
function clone(o){ return o===undefined?undefined:JSON.parse(JSON.stringify(o)); }
function b64url(buf){ const b=String.fromCharCode.apply(null,new Uint8Array(buf));
  return btoa(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function unb64url(s){ s=s.replace(/-/g,"+").replace(/_/g,"/");
  while(s.length%4) s+="=";
  return Uint8Array.from(atob(s),c=>c.charCodeAt(0)); }
function sha256Hex(str){
  const enc=new TextEncoder().encode(str);
  return crypto.subtle.digest("SHA-256",enc).then(buf=>{
    return Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,"0")).join("");
  });
}
async function deriveKey(passphrase, saltHex){
  const ikm=new TextEncoder().encode(passphrase);
  const salt=new Uint8Array(saltHex.match(/.{2}/g).map(h=>parseInt(h,16)));
  const base=await crypto.subtle.importKey("raw",ikm,"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:120000,hash:"SHA-256"},
    base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function encryptObj(obj, gid, pw){
  const saltHex=await sha256Hex("wendao45-salt#"+gid);
  const key=await deriveKey(pw||("wendao45#"+gid), saltHex);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(JSON.stringify(obj)));
  const blob=new Uint8Array(ct.byteLength+12);
  blob.set(iv,0); blob.set(new Uint8Array(ct),12);
  return JSON.stringify({v:1,enc:b64url(blob.buffer)});
}
async function decryptStr(payload, gid, pw){
  const o=JSON.parse(payload); if(!o||!o.enc) throw new Error("bad payload");
  const saltHex=await sha256Hex("wendao45-salt#"+gid);
  const key=await deriveKey(pw||("wendao45#"+gid), saltHex);
  const blob=unb64url(o.enc), iv=blob.slice(0,12), ct=blob.slice(12);
  const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ---------- 同步配置（独立键，不随重置消失） ---------- */
function syncCfg(){ try{return Object.assign({auto:true},JSON.parse(lsGet(SYNC_KEY)||"{}"));}catch(e){return {auto:true};} }
function saveSyncCfg(c){ lsSet(SYNC_KEY,JSON.stringify(c)); }

/* ---------- 合并 ---------- */
/* 记录型 map：值为 ISO 时间字符串取晚；布尔取或；对象按基底优先+补缺 */
function mergeRecord(a,b){
  const out={};
  Object.keys(a||{}).forEach(k=>{ out[k]=clone(a[k]); });
  Object.keys(b||{}).forEach(k=>{
    if(!(k in out)){ out[k]=clone(b[k]); return; }
    const x=out[k], y=b[k];
    if(typeof x==="string"&&typeof y==="string"){ if(/^\d{4}-/.test(x)&&/^\d{4}-/.test(y)){ if(y>x) out[k]=y; } }
    else if(typeof x==="boolean"||typeof y==="boolean"){ out[k]=x||y; }
    else if(x&&y&&typeof x==="object"&&typeof y==="object"&&!Array.isArray(x)&&!Array.isArray(y)){
      /* 有 at 字段按 at 新旧，否则基底优先补缺失键 */
      if(x.at&&y.at){ if(y.at>x.at) out[k]=clone(y); }
      else deepFill(x,y);
    }
  });
  return out;
}
/* 基底优先：只从 other 补基底缺失的键（递归） */
function deepFill(base,other){
  if(!other||typeof other!=="object"||Array.isArray(other)) return base;
  Object.keys(other).forEach(k=>{
    if(!(k in base)||base[k]===null||base[k]===undefined){ base[k]=clone(other[k]); }
    else if(base[k]&&typeof base[k]==="object"&&!Array.isArray(base[k])
            &&other[k]&&typeof other[k]==="object"&&!Array.isArray(other[k])){
      deepFill(base[k],other[k]);
    }
  });
  return base;
}
function unionById(aArr,bArr,idKey){
  const seen=new Set(), out=[];
  (aArr||[]).concat(bArr||[]).forEach(x=>{ if(!x||typeof x!=="object") return;
    const id=x[idKey]!==undefined?x[idKey]:JSON.stringify(x);
    if(seen.has(id)) return; seen.add(id); out.push(x); });
  return out;
}
/* 主存档合并：_syncAt 新者为基底，进度型字段并集，数值取大 */
function mergeSave(ra,rb){
  const a=ra||{}, b=rb||{};
  const ta=a._syncAt||"", tb=b._syncAt||"";
  const base=(tb>ta)?clone(b):clone(a), other=(tb>ta)?a:b;
  const out=base;
  /* 数值型进度取大（杜绝回退） */
  ["coin","xp","day","unlocked","gameDay","hp","energy","arenaClears","quizOk"].forEach(k=>{
    const va=+a[k], vb=+b[k];
    if(!isNaN(va)||!isNaN(vb)) out[k]=Math.max(isNaN(va)?0:va,isNaN(vb)?0:vb);
  });
  /* 记录型 map 并集 */
  ["done","skipped","accepted","goods","costumes","cgUnlocked","ach","fav","notes",
   "gdIssued","storyThemeOV","cutsceneOV","questProg"].forEach(k=>{
    if(a[k]||b[k]) out[k]=mergeRecord(a[k],b[k]);
  });
  /* SRS：每张卡 due 取晚、tier 取高 */
  const srs={};
  [a.srs,b.srs].forEach(src=>{ if(!src) return; Object.keys(src).forEach(k=>{
    const x=src[k]; if(!x||typeof x!=="object") return;
    if(!srs[k]){ srs[k]=clone(x); return; }
    const y=srs[k];
    if((x.due||0)>(y.due||0)) Object.assign(y,x);
    if(+(x.tier||0)>+(y.tier||0)) y.tier=x.tier;
  }); });
  if(a.srs||b.srs) out.srs=srs;
  /* 错题：按 考点+时间 去重并集（保留近 400） */
  if(Array.isArray(a.wrong)||Array.isArray(b.wrong)){
    const all=(a.wrong||[]).concat(b.wrong||[]);
    const seen=new Set(); out.wrong=[];
    all.forEach(w=>{ const sig=(w&&(w.pid+"|"+(w.at||"")+"|"+(w.q||"")))||JSON.stringify(w);
      if(seen.has(sig)) return; seen.add(sig); out.wrong.push(w); });
    if(out.wrong.length>400) out.wrong=out.wrong.slice(-400);
  }
  /* 自录问契/自定义道具与 CG/剧情点/私聊：并集 */
  if(Array.isArray(a.myOral)||Array.isArray(b.myOral)) out.myOral=unionById(a.myOral,b.myOral,"uid");
  if(Array.isArray(a.customItems)||Array.isArray(b.customItems)) out.customItems=unionById(a.customItems,b.customItems,"id");
  if(Array.isArray(a.customCgs)||Array.isArray(b.customCgs)) out.customCgs=unionById(a.customCgs,b.customCgs,"id");
  const pp=out.plotPoints||{total:0,byDay:{},byNaturalDay:{},triggered:{}};
  [a.plotPoints,b.plotPoints].forEach(src=>{ if(!src) return;
    pp.total=Math.max(+pp.total||0,+src.total||0);
    ["byDay","byNaturalDay","triggered"].forEach(f=>{
      pp[f]=pp[f]||{}; Object.keys(src[f]||{}).forEach(k=>{
        const x=src[f][k], y=pp[f][k];
        pp[f][k]=(typeof x==="number")?Math.max(+x||0,+y||0):(x>y?x:y);
      });
    });
  });
  if(a.plotPoints||b.plotPoints) out.plotPoints=pp;
  /* 私聊：逐 NPC 拼接去重（按消息 id；无 id 按 at+role+text），单档≤1000 */
  const pc={};
  [a.privateChat,b.privateChat].forEach(src=>{ if(!src) return; Object.keys(src).forEach(npc=>{
    pc[npc]=pc[npc]||[]; pc[npc]=pc[npc].concat(src[npc]||[]);
  }); });
  if(a.privateChat||b.privateChat){
    Object.keys(pc).forEach(npc=>{
      const seen=new Set(); const u=[];
      pc[npc].forEach(m=>{ const sig=m.id||(m.at+"|"+m.role+"|"+m.text);
        if(seen.has(sig)) return; seen.add(sig); u.push(m); });
      u.sort((x,y)=>(x.at||"").localeCompare(y.at||""));
      pc[npc]=u.slice(-1000);
    });
    out.privateChat=pc;
  }
  /* 任务口条缓存：同任务取 cueV 更高者 */
  if(a.questLines||b.questLines){
    const ql={};
    [a.questLines,b.questLines].forEach(src=>{ if(!src) return; Object.keys(src).forEach(k=>{
      if(!ql[k]){ ql[k]=clone(src[k]); return; }
      if((+src[k].cueV||0)>(+ql[k].cueV||0)) ql[k]=clone(src[k]);
    }); });
    out.questLines=ql;
  }
  /* 其余键（对话流/运行时排程/题池等）：基底优先，补远端有而本地无的 */
  deepFill(out,other);
  out._syncAt=new Date(Math.max(new Date(ta||0).getTime()||0,new Date(tb||0).getTime()||0,Date.now()-1)).toISOString();
  return out;
}
/* 配置合并：_syncAt 新者为基底，深补缺；hist 数组去重拼接 */
function mergeCfg(ra,rb){
  const a=ra||{}, b=rb||{};
  const ta=a._syncAt||"", tb=b._syncAt||"";
  const base=(tb>ta)?clone(b):clone(a), other=(tb>ta)?a:b;
  deepFill(base,other);
  const h=(a.hist||[]).concat(b.hist||[]);
  base.hist=[...new Set(h)].slice(-30);
  base._syncAt=new Date().toISOString();
  return base;
}
function mergeBundle(local,remote){
  return {
    save:mergeSave(local.save,remote.save),
    cfg:mergeCfg(local.cfg,remote.cfg),
    at:new Date().toISOString()
  };
}

/* ---------- Gist 网络层 ---------- */
function gistFetch(path,opt){
  const c=syncCfg();
  opt=opt||{};
  const headers=Object.assign({"Accept":"application/vnd.github+json"},opt.headers||{});
  const token=opt.token||c.token;
  if(token) headers["Authorization"]="Bearer "+token;
  const ctrl=new AbortController();
  const tm=setTimeout(()=>ctrl.abort(),+(opt.timeout||20000));
  return fetch(API+path,{method:opt.method||"GET",headers,body:opt.body,signal:ctrl.signal})
    .then(async r=>{
      clearTimeout(tm);
      const txt=await r.text();
      let o=null; try{ o=txt?JSON.parse(txt):null; }catch(e){}
      if(!r.ok){ const e=new Error((o&&o.message)||("HTTP "+r.status)); e.status=r.status; throw e; }
      return o;
    });
}
function bundleFromLS(){
  let save=null, cfg=null;
  try{ save=JSON.parse(lsGet(SAVE_KEY)||"null"); }catch(e){}
  try{ cfg=JSON.parse(lsGet(CFG_KEY)||"null"); }catch(e){}
  /* 同步前脱敏：密钥与违规日志绝不出本机 */
  if(save){ delete save.dsKey; delete save.clauseLog; }
  return {v:1,at:new Date().toISOString(),save,cfg};
}
function sizeOfBundle(){ return (lsGet(SAVE_KEY)||"").length+(lsGet(CFG_KEY)||"").length; }

const WDSync={
  /* ---------- 纯逻辑（可独立单测/外部复用） ---------- */
  mergeSave, mergeCfg, mergeBundle,
  /* ---------- 配置/状态 ---------- */
  enabled(){ const c=syncCfg(); return !!(c.token&&c.gid); },
  status(){
    const c=syncCfg();
    return {enabled:this.enabled(), auto:c.auto!==false, gid:c.gid||"",
      lastPush:c.lastPush||"", lastPull:c.lastPull||"", size:sizeOfBundle()};
  },
  joinCode(){
    const c=syncCfg(); if(!c.token||!c.gid) return "";
    return b64url(new TextEncoder().encode(JSON.stringify({t:c.token,g:c.gid,p:c.pw||""})));
  },
  parseJoinCode(code){
    try{
      const o=JSON.parse(new TextDecoder().decode(unb64url(String(code).trim())));
      if(!o||!o.t||!o.g) throw 0;
      return {token:o.t, gid:o.g, pw:o.p||""};
    }catch(e){ throw new Error("加入码无效"); }
  },
  /* ---------- 主机：创建私有 Gist 并首次上传 ---------- */
  async create(token,pw){
    const b=bundleFromLS(); if(!b.save) throw new Error("本机还没有旅程存档，先开始游戏再开通同步");
    const ts=new Date().toISOString();
    if(b.save) b.save._syncAt=ts;
    if(b.cfg) b.cfg._syncAt=ts;
    const enc=await encryptObj(b,"__create__",pw||""); /* 占位 gid，创建后改密重写 */
    const g=await gistFetch("/gists",{method:"POST",token,
      body:JSON.stringify({description:"问道之旅 · 多设备存档同步（自动生成，请勿手改）",public:false,
        files:{[GIST_FILE]:{content:enc}}})});
    const gid=g.id;
    /* 以真实 gid 重新加密并 PATCH */
    const enc2=await encryptObj(b,gid,pw||"");
    await gistFetch("/gists/"+gid,{method:"PATCH",token,body:JSON.stringify({files:{[GIST_FILE]:{content:enc2}}})});
    saveSyncCfg({token:token.trim(),gid,pw:pw||"",auto:true,lastPush:new Date().toISOString()});
    this._markMemory(ts);
    return gid;
  },
  /* ---------- 客机：加入码加入，立即拉取 ---------- */
  async join(code){
    const jc=this.parseJoinCode(code);
    saveSyncCfg({token:jc.token,gid:jc.gid,pw:jc.pw,auto:true});
    const r=await this.pullNow(true);
    return r;
  },
  leave(){ saveSyncCfg({auto:syncCfg().auto}); },
  setAuto(on){ const c=syncCfg(); c.auto=!!on; saveSyncCfg(c); },
  /* ---------- 上传 ---------- */
  async pushNow(){
    const c=syncCfg(); if(!c.token||!c.gid) throw new Error("未开通同步");
    const now=new Date().getTime();
    if(this._lastPushAt&&now-this._lastPushAt<PUSH_MIN_GAP) return {skipped:true};
    this._lastPushAt=now;
    const b=bundleFromLS();
    const ts=new Date().toISOString();
    if(b.save) b.save._syncAt=ts;
    if(b.cfg) b.cfg._syncAt=ts;
    const raw=JSON.stringify(b);
    if(raw.length>MAX_BUNDLE) throw new Error("档案过大（"+(raw.length/1048576).toFixed(1)+"MB），请先精简上传图片后再同步");
    const enc=await encryptObj(b,c.gid,c.pw||"");
    await gistFetch("/gists/"+c.gid,{method:"PATCH",body:JSON.stringify({files:{[GIST_FILE]:{content:enc}}})});
    c.lastPush=new Date().toISOString(); saveSyncCfg(c);
    this._markMemory(ts);
    return {ok:true,at:c.lastPush};
  },
  /* 同步后把时间戳写进内存态，避免下一次本地 save 把它抹掉 */
  _markMemory(ts){
    try{ if(window.markSaveSyncAt) window.markSaveSyncAt(ts); }catch(e){}
    try{ if(window.WDCfg&&WDCfg.all){ const c=WDCfg.all(); c._syncAt=ts; } }catch(e){}
  },
  /* ---------- 下载+合并+落盘（不重载，由调用方决定刷新） ---------- */
  async pullNow(){
    const c=syncCfg(); if(!c.token||!c.gid) throw new Error("未开通同步");
    const g=await gistFetch("/gists/"+c.gid);
    const content=g&&g.files&&g.files[GIST_FILE]&&g.files[GIST_FILE].content;
    if(!content) throw new Error("云端档案为空");
    const remote=await decryptStr(content,c.gid,c.pw||"");
    if(!remote||(!remote.save&&!remote.cfg)) throw new Error("云端档案格式异常");
    const local=bundleFromLS();
    const merged=mergeBundle(local,remote);
    if(merged.save) lsSet(SAVE_KEY,JSON.stringify(merged.save));
    if(merged.cfg) lsSet(CFG_KEY,JSON.stringify(merged.cfg));
    c.lastPull=new Date().toISOString(); saveSyncCfg(c);
    this._markMemory(merged.save&&merged.save._syncAt||new Date().toISOString());
    return {ok:true,merged};
  },
  /* ---------- 自动同步（防抖+最小间隔+离线/页面隐藏保活） ---------- */
  schedulePush(){
    const c=syncCfg();
    if(c.auto===false||!c.token||!c.gid||this._pushTimer) return;
    this._pushTimer=setTimeout(()=>{ this._pushTimer=null; this.pushNow().catch(e=>console.warn("[sync push]",e.message)); },PUSH_DEBOUNCE);
  },
  flush(){
    const c=syncCfg();
    if(c.auto===false||!c.token||!c.gid) return;
    if(this._pushTimer){ clearTimeout(this._pushTimer); this._pushTimer=null; }
    try{
      const b=bundleFromLS();
      const ts=new Date().toISOString();
      if(b.save) b.save._syncAt=ts;
      if(b.cfg) b.cfg._syncAt=ts;
      encryptObj(b,c.gid,c.pw||"").then(enc=>{
        fetch(API+"/gists/"+c.gid,{method:"PATCH",keepalive:true,
          headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+c.token,"Content-Type":"application/json"},
          body:JSON.stringify({files:{[GIST_FILE]:{content:enc}}})}).catch(()=>{});
        c.lastPush=ts; saveSyncCfg(c); this._markMemory(ts);
      }).catch(()=>{});
    }catch(e){}
  },
  /* ---------- 启动时拉取（超时即放弃，绝不阻塞进入游戏） ---------- */
  async startup(timeoutMs){
    if(!this.enabled()) return null;
    try{
      const r=await Promise.race([
        this.pullNow(),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),timeoutMs||9000))
      ]);
      return r;
    }catch(e){ console.warn("[sync boot]",e.message); return {error:e.message}; }
  },
  /* ---------- 备份文件（明文 JSON，不经网络） ---------- */
  exportFile(){
    const b=bundleFromLS();
    b.at=new Date().toISOString();
    const blob=new Blob([JSON.stringify(b,null,1)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="wendao-backup-"+new Date().toISOString().slice(0,10)+".json";
    a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  },
  async importFile(file){
    const txt=await file.text();
    let o; try{ o=JSON.parse(txt); }catch(e){ throw new Error("备份文件无法解析"); }
    if(!o||(!o.save&&!o.cfg)) throw new Error("不是有效的备份文件");
    if(o.save&&!o.save.player) throw new Error("存档内容缺失");
    const local=bundleFromLS();
    const merged=mergeBundle(local,o);
    if(merged.save) lsSet(SAVE_KEY,JSON.stringify(merged.save));
    if(merged.cfg) lsSet(CFG_KEY,JSON.stringify(merged.cfg));
    this._markMemory(merged.save&&merged.save._syncAt||new Date().toISOString());
    return {ok:true};
  },
  /* ---------- 二维码（本地 qrcode-generator 渲染，密文不出本机） ---------- */
  qr(el,text,size){
    if(!el) return false;
    try{
      const qrcode=window.qrcode;
      if(!qrcode) throw 0;
      const qr=qrcode(0,"M"); qr.addData(text); qr.make();
      const n=qr.getModuleCount();
      const cs=Math.max(2,Math.floor((size||220)/n));
      const dim=n*cs;
      const cells=[];
      for(let r=0;r<n;r++)for(let c=0;c<n;c++){ if(qr.isDark(r,c)) cells.push(`<rect x="${c*cs}" y="${r*cs}" width="${cs}" height="${cs}"/>`); }
      el.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" style="background:#fff;border-radius:8px"><rect width="${dim}" height="${dim}" fill="#fff"/>${cells.join("")}</svg>`;
      return true;
    }catch(e){
      el.innerHTML='<div class="note" style="border-left-color:var(--gold)">二维码库未加载——请手动复制加入码到新设备。</div>';
      return false;
    }
  }
};
window.WDSync=WDSync;
/* 关页面/切后台时尽力保活上传一次 */
try{ window.addEventListener("pagehide",()=>WDSync.flush()); }catch(e){}
})();
