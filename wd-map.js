/* ==================== 问道之旅 · 主页像素地图模块（独立可复用 · v2） ====================
   window.WDMap —— 2D 像素风游戏地图 + NPC 像素头像
   低耦合设计：仅依赖 init(ctx) 注入的 {D, NPC, getSt, stage?}，无任何宿主全局变量。
   --------------------------------------------------------------------------------------
   v2 重制要点：
     · 静态地形离屏缓存（山/河/建筑/山道/地碑只画一次），每帧仅绘动态元素（灯火/雾/精灵）
     · 相机系统：滚轮/捏合缩放(1–3x)、拖拽平移、边界钳制、双击/按钮复位，focal-point 缩放
     · 图层开关：名牌 / 雾效 / 山道（localStorage 持久化；解锁门禁不受图层影响）
     · resize/转屏自适应：ResizeObserver（含降级）+ DPR 重配 + 静态层重建
     · 外部素材统一：assets/player、assets/npc 图片同时替换 canvas 精灵、列表与对话头像
     · 生命周期：切视图 unmount 停 RAF；页面隐藏自动暂停
   公共 API：init / mount / unmount / avatarURL / npcVisible / applyOverrides
             setLayer / getLayers / zoomIn / zoomOut / resetView / U(纯函数，供单测)
   ====================================================================================== */
(function(){
"use strict";
const COLS=16, ROWS=12, ZMIN=1, ZMAX=3, LAYER_KEY="wdzx.mapLayers.v1";

/* ---------- NPC 像素头像（12×12 字符矩阵，每字符=1逻辑像素） ---------- */
const SPR={
  /* 青玄先生 · 掌灯真人：青袍白须，手提金灯 */
  qingxuan:{c:{H:"#2aa8b8",F:"#f2d5b0",E:"#1a0f2e",W:"#e8f0e0",B:"#1d7a86",L:"#ffd23f",l:"#8a6a2a"},p:[
    "....HHHH....",
    "...HHHHHH...",
    "...FFFFFF...",
    "...FEFFEF...",
    "...FFFFFF...",
    "...WWWWWW...",
    "..BBWWWWB.l.",
    ".BBBBBBBLLl.",
    ".BBBBBBBB.l.",
    ".BBBBBBBB...",
    ".BB....BB...",
    "............"]},
  /* 司马青衫 · 山河剑客：蓝衫束发，背负长剑 */
  smq:{c:{H:"#2b2b45",F:"#f2d5b0",E:"#1a0f2e",B:"#3a6ea8",s:"#ffd23f",S:"#cfd8e0",h:"#8a5a2a"},p:[
    "....HHHH....",
    "...HHHHHH...",
    "...FFFFFF...",
    "...FEFFEF...",
    "...FFFFFF...",
    "....FFFF....",
    "..S.BBBB....",
    ".ShBBBBBB...",
    ".S.BBBBs....",
    ".S.BBBB.....",
    "...BB.BB....",
    "............"]},
  /* 铁面先生 · 律法塔镇塔尊者：黑铁面甲，金纹暗袍 */
  tiemian:{c:{H:"#1a1230",M:"#4a4a5a",E:"#ff5252",B:"#2d2440",T:"#ffd23f"},p:[
    "....HHHH....",
    "...HHHHHH...",
    "...MMMMMM...",
    "...MEMMEM...",
    "...MMMMMM...",
    "....MMMM....",
    "..HBBBBBBH..",
    ".HBBBBBBBB..",
    ".HBTBBBBTH..",
    ".HBBBBBBBH..",
    ".BB....BB...",
    "............"]},
  /* 柳如烟 · 幻纱行首座：粉纱垂鬓，面纱掩容 */
  liuruyan:{c:{H:"#5a2a4a",F:"#f5d8c8",E:"#1a0f2e",V:"#ffb8d8",B:"#e07aa8"},p:[
    "....HHHH....",
    "...HHHHHH...",
    "..HHFFFFHH..",
    "..HFEFFEFH..",
    "..HFFFFFFH..",
    "..HVVVVVVH..",
    "..HBBBBBBH..",
    ".HBBBBBBBH..",
    ".HBBBBBBBH..",
    ".HBBBBBBBH..",
    "..BB....BB..",
    "............"]},
  /* 墨小骨 · 藏经阁机关童子：纸白骨小童，墨色小帽 */
  moxiaogu:{c:{H:"#2b2b2b",F:"#f5f0e0",E:"#1a1a1a",R:"#ff9fb0",B:"#4a4a52",k:"#1a1a1a"},p:[
    "....HHHH....",
    "...HHHHHH...",
    "...FFFFFF...",
    "...FEFFEF...",
    "...RFFRFF...",
    "....FFFF....",
    "...BBBBBB...",
    "..BBkBBkBB..",
    "..BBBBBBBB..",
    "...BBBBBB...",
    "...B....B...",
    "............"]},
  /* 玄机夫人 · 观星者：紫衣星饰，头顶星芒 */
  xuanji:{c:{S:"#ffd23f",H:"#3a2a5a",F:"#f2d5b0",E:"#1a0f2e",B:"#6a3fa0",T:"#3df0ff",o:"#3df0ff"},p:[
    "...S.SS.S...",
    "....HHHH....",
    "...HHHHHH...",
    "...HFFFFH...",
    "...FEFFEF...",
    "...HFFFFH...",
    "....FFFF....",
    "..oBBBBBBo..",
    ".oBBTBBTBo..",
    "..BBBBBBBB..",
    "..BB....BB..",
    "............"]},
  /* 玩家 · 执灯行者 */
  _player:{c:{H:"#ff5fa8",F:"#f2d5b0",E:"#1a0f2e",B:"#7a3dbf",L:"#ffd23f",l:"#8a6a2a"},p:[
    "....HHHH....",
    "...HHHHHH...",
    "...FFFFFF...",
    "...FEFFEF...",
    "...FFFFFF...",
    "....FFFF..l.",
    "..BBBBBB.LLl",
    ".BBBBBBBB.l.",
    ".BBBBBBBB...",
    ".BBBBBBBB...",
    ".BB....BB...",
    "............"]}
};

/* ---------- NPC 地图布点（tile 坐标）与所属幕 ---------- */
const SPOTS={
  qingxuan:{x:3.2,y:6.9},   // 城门灯下（第一幕 · 山河游学）
  smq:{x:5.4,y:5.3},        // 山河桥上（游历剑客）
  moxiaogu:{x:7.3,y:5.2},   // 藏经阁门口（机关童子）
  tiemian:{x:8.6,y:4.3},    // 律法塔门前（第二幕）
  liuruyan:{x:10.2,y:6.8},  // 市集纱幔（第三幕）
  xuanji:{x:11.7,y:4.3}     // 观星台（第四幕）
};
const NPC_ACT={qingxuan:1,smq:1,moxiaogu:2,tiemian:2,liuruyan:3,xuanji:4};
const ACT_X=[[0,6.2],[6.2,9.4],[9.4,11],[11,12.8],[12.8,16]];
/* 玩家行进路径（随进度推进） */
const WAY=[[1.8,7.6],[3.2,6.2],[4.4,5.8],[5.6,6.4],[6.6,5.4],[7.6,4.6],[8.8,5.4],[9.8,6.2],[10.6,5.4],[11.4,5.6],[12.2,5.8],[13.2,6.2],[14.2,6.4]];
const TAP_R=1.55; // 点击命中半径（tile）

/* ---------- 模块私有工具（不依赖宿主） ---------- */
function qs(s,el){ return (el||document).querySelector(s); }
function hash(s){ let h=0; s=String(s); for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))>>>0; } return h; }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function storageGet(k){ try{ return window.localStorage.getItem(k); }catch(e){ return null; } }
function storageSet(k,v){ try{ window.localStorage.setItem(k,v); }catch(e){} }

/* 相机纯函数（抽出便于单测）
   rectW/H=地图像素尺寸（已乘缩放）；vpW/H=视口像素；x/y=地图左上角在视口坐标 */
const U={
  clamp, hash,
  clampPan(rectW,rectH,vpW,vpH,x,y){
    const cx = rectW<=vpW ? (vpW-rectW)/2 : clamp(x, vpW-rectW, 0);
    const cy = rectH<=vpH ? (vpH-rectH)/2 : clamp(y, vpH-rectH, 0);
    return {x:cx,y:cy};
  },
  /* 以 (fx,fy) 为锚点缩放：保持锚点下的世界坐标不动 */
  zoomAt(z,u,vpW,vpH,pan,fx,fy,factor){
    const nz=clamp(z*factor,ZMIN,ZMAX);
    const wx=(fx-pan.x)/(u*z), wy=(fy-pan.y)/(u*z);
    const p=U.clampPan(COLS*u*nz,ROWS*u*nz,vpW,vpH, fx-wx*u*nz, fy-wy*u*nz);
    return {z:nz,x:p.x,y:p.y};
  },
  /* 视口像素 → 世界 tile 坐标 */
  toWorld(fx,fy,u,z,pan){ return {x:(fx-pan.x)/(u*z), y:(fy-pan.y)/(u*z)}; },
  toScreen(wx,wy,u,z,pan){ return {x:wx*u*z+pan.x, y:wy*u*z+pan.y}; },
  hitNpc(wx,wy){
    let best=null, bd=TAP_R;
    for(const id in SPOTS){
      const s=SPOTS[id], d=Math.hypot(wx-s.x,wy-s.y);
      if(d<bd){ bd=d; best=id; }
    }
    return best;
  },
  defaultLayers(){ return {tags:true,fog:true,path:true}; },
  loadLayers(){
    let l=null;
    try{ l=JSON.parse(storageGet(LAYER_KEY)||"null"); }catch(e){ l=null; }
    const d=U.defaultLayers();
    if(l&&typeof l==="object"){ return {tags:l.tags!==false,fog:l.fog!==false,path:l.path!==false}; }
    return d;
  }
};

/* ---------- 运行时状态 ---------- */
let CTX=null, raf=0, hostEl=null, cv=null, c2=null, opts=null, ro=null;
let T0=Date.now();
let dpr=1, cssW=360, cssH=270, u=22;          // u=基础 tile 的 CSS 像素
let staticCv=null, staticBuilt=false;
let layers=U.defaultLayers();
const cam={z:1,x:0,y:0};                       // z=缩放；x/y=地图左上角视口坐标(px)
const _avCache={};
const _probeCache={};
const _extImg={};                             // 外部素材图片（canvas 精灵也用它）
const _sprCv={};                              // 像素精灵预渲染缓存（12×12 小画布，按 id+ghost 复用）
let resizeTimer=0;

/* 手势状态 */
const pointers=new Map();
let gesture="none", startPan=null, pinch0=null, downInfo=null, lastTap={t:0,x:0,y:0};

function probeImg(src){
  if(_probeCache[src]!==undefined) return Promise.resolve(_probeCache[src]);
  if(typeof Image==="undefined") return Promise.resolve(null);
  return new Promise(res=>{
    const im=new Image();
    im.onload=()=>{ _probeCache[src]=src; res(src); };
    im.onerror=()=>{ _probeCache[src]=null; res(null); };
    im.src=src;
  });
}

function drawSpriteMatrix(g,spr,px,ox,oy,ghost){
  spr.p.forEach((row,ry)=>{
    for(let rx=0;rx<row.length;rx++){
      const col=spr.c[row[rx]]; if(!col) continue;
      g.fillStyle=ghost?"#5a5578":col;
      g.fillRect(ox+rx*px, oy+ry*px, px, px);
    }
  });
}
/* 精灵位图缓存：矩阵像素只画一次，逐帧 drawImage（~280 fillRect → 7 drawImage） */
function spriteCanvas(id,ghost){
  const key=id+(ghost?"_g":"_n");
  if(_sprCv[key]) return _sprCv[key];
  const c=document.createElement("canvas"); c.width=12; c.height=12;
  const g=c.getContext("2d");
  drawSpriteMatrix(g,SPR[id]||SPR.qingxuan,1,0,0,ghost);
  return _sprCv[key]=c;
}

const WDMap={
  U,

  init(ctx){ CTX=ctx; layers=U.loadLayers(); },

  /* NPC 头像 dataURL（缓存，供对话流/面板复用） */
  avatarURL(id,scale){
    const s=scale||3, key=id+"_"+s;
    if(_avCache[key]) return _avCache[key];
    if(_extImg[id]) return _extImg[id].src;
    const spr=SPR[id]||SPR.qingxuan;
    const c=document.createElement("canvas"); c.width=12*s; c.height=12*s;
    const g=c.getContext("2d");
    spr.p.forEach((row,ry)=>{ for(let rx=0;rx<row.length;rx++){
      const col=spr.c[row[rx]]; if(!col) continue;
      g.fillStyle=col; g.fillRect(rx*s,ry*s,s,s);
    }});
    return _avCache[key]=c.toDataURL();
  },

  /* ================= 挂载 / 卸载 ================= */
  mount(host,opts_){
    opts=opts_||{};
    this.unmount();
    hostEl=host;
    layers=U.loadLayers();
    this._resetCam();
    host.innerHTML=`
      <div class="mapinfo">
        <span>第 <b>${CTX.getSt().day}</b>/45 日 · ${esc(CTX.D.acts[this._curAct()])}</span>
        <span class="dim">点击 NPC 头像，即刻对话 · 滚轮/双指可缩放</span>
      </div>
      <div class="mapctl" id="wdmapCtl">
        <button type="button" data-ly="tags">名牌</button>
        <button type="button" data-ly="fog">雾效</button>
        <button type="button" data-ly="path">山道</button>
        <span class="msc"></span>
        <button type="button" id="zmMinus" aria-label="缩小">－</button>
        <span id="zmPct">100%</span>
        <button type="button" id="zmPlus" aria-label="放大">＋</button>
        <button type="button" id="zmReset" class="zmr">复位</button>
      </div>
      <canvas id="wdmapCv" role="img" aria-label="问道之旅像素地图，点击 NPC 可对话"
        style="width:100%;aspect-ratio:${COLS}/${ROWS};image-rendering:pixelated;display:block;touch-action:pan-y;border:2px solid var(--border-lit,#4a2d7a);box-shadow:3px 3px 0 #000;background:#141026"></canvas>
      <div class="maplegend">
        <span><i class="lg lit"></i>已现身</span><span><i class="lg fog"></i>雾中人影</span><span><i class="lg me"></i>你的位置</span>
      </div>
      <div class="mapnpcs">${CTX.D.npcs.map(n=>{
        const unlocked=this.npcVisible(n.id);
        return `<button class="mapnpc${unlocked?"":" lock"}" data-npc="${n.id}" type="button">
          <img src="${this.avatarURL(n.id,3)}" alt=""><span>${unlocked?esc(n.name):"？？？"}</span></button>`;
      }).join("")}</div>
      <div class="playercard">
        <div class="pport"><img id="pportImg" src="${this.avatarURL("_player",4)}" alt=""></div>
        <div class="pbody">
          <div class="pname">${esc(CTX.getSt().player)}<em>${esc(CTX.stats?CTX.stats().title:"行路人")}</em></div>
          <div class="pstats">${(()=>{
            const s=CTX.stats?CTX.stats():{};
            const total=(CTX.D.quests&&CTX.D.quests.length)||274;
            const st=CTX.getSt();
            return `<span>Lv.<b>${s.lv!=null?s.lv:1}</b></span><span>修行 <b>${st.xp}</b></span><span>铜钱 <b>${st.coin}</b></span><span>连击 <b>${s.streak||0}</b> 日</span><span>交付 <b>${Object.keys(st.done||{}).length}</b>/${total}</span>`;
          })()}</div>
          <div class="pgear"><span class="gslot">武器<i>待启</i></span><span class="gslot">法器<i>待启</i></span><span class="gslot">护符<i>待启</i></span><span class="gslot">行囊<i>待启</i></span></div>
        </div>
      </div>`;
    cv=qs("#wdmapCv",host); c2=cv.getContext("2d");
    this._bindControls(host);
    this._configure();
    this._bindGestures();
    this._observeResize();
    if(document.addEventListener) document.addEventListener("visibilitychange",this._onVis);
    const loop=()=>{ this._frame(); raf=requestAnimationFrame(loop); };
    raf=requestAnimationFrame(loop);
    this.applyOverrides(host);
  },

  unmount(){
    if(raf){ cancelAnimationFrame(raf); raf=0; }
    if(resizeTimer){ clearTimeout(resizeTimer); resizeTimer=0; }
    if(ro){ try{ro.disconnect();}catch(e){} ro=null; }
    if(document.removeEventListener) document.removeEventListener("visibilitychange",this._onVis);
    if(window.removeEventListener){
      window.removeEventListener("resize",this._onWinResize);
      window.removeEventListener("orientationchange",this._onWinResize);
    }
    pointers.clear(); gesture="none"; startPan=null; pinch0=null; downInfo=null;
    staticCv=null; staticBuilt=false;
    hostEl=null; cv=null; c2=null;
  },

  /* ================= 图层开关 ================= */
  getLayers(){ return Object.assign({},layers); },
  /* 只读相机状态（缩放/平移） */
  getView(){ return {z:cam.z,x:cam.x,y:cam.y}; },
  setLayer(k,v){
    if(!(k in layers)) return layers;
    layers[k]=!!v; storageSet(LAYER_KEY,JSON.stringify(layers));
    if(hostEl) this._syncCtl();
    if(k==="path") this._buildStatic();      // 山道烘焙在静态层
    return layers;
  },
  _syncCtl(){
    if(!hostEl) return;
    hostEl.querySelectorAll("#wdmapCtl [data-ly]").forEach(b=>{
      b.classList.toggle("on",!!layers[b.dataset.ly]);
    });
    const zp=qs("#zmPct",hostEl); if(zp) zp.textContent=Math.round(cam.z*100)+"%";
    const zr=qs("#zmReset",hostEl); if(zr) zr.style.display=cam.z>1.01?"inline-block":"none";
  },

  /* ================= 相机 ================= */
  _resetCam(){ cam.z=1; cam.x=0; cam.y=0; },
  resetView(){ this._zoomTo(1,cssW/2,cssH/2,true); },
  zoomIn(){ this._zoomTo(cam.z*1.3,cssW/2,cssH/2,false); },
  zoomOut(){ this._zoomTo(cam.z/1.3,cssW/2,cssH/2,false); },
  _zoomTo(factor,fx,fy,absolute){
    const want=absolute?clamp(factor,ZMIN,ZMAX):clamp(cam.z*factor,ZMIN,ZMAX);
    const next=U.zoomAt(cam.z,u,cssW,cssH,cam,fx,fy,cam.z>0?want/cam.z:1);
    cam.z=next.z; cam.x=next.x; cam.y=next.y;
    this._syncCtl();
  },

  /* ================= 尺寸 / 自适应 ================= */
  _configure(){
    const w=(hostEl&&hostEl.clientWidth)||cssW||360;
    dpr=Math.min(3,window.devicePixelRatio||1);
    cssW=w;
    u=Math.max(14,Math.floor(cssW/COLS));
    cssH=Math.round(cssW*ROWS/COLS);
    if(cv){
      cv.width=Math.round(cssW*dpr);
      cv.height=Math.round(cssH*dpr);
    }
    this._buildStatic();
    const p=U.clampPan(COLS*u*cam.z,ROWS*u*cam.z,cssW,cssH,cam.x,cam.y);
    cam.x=p.x; cam.y=p.y;
    this._syncCtl();
  },
  _observeResize(){
    this._onWinResize=()=>{ if(resizeTimer)clearTimeout(resizeTimer); resizeTimer=setTimeout(()=>{ if(hostEl)this._configure(); },150); };
    if(!window.addEventListener) return;
    if(typeof ResizeObserver!=="undefined"&&hostEl){
      ro=new ResizeObserver(this._onWinResize);
      ro.observe(hostEl);
    }
    window.addEventListener("resize",this._onWinResize);
    window.addEventListener("orientationchange",this._onWinResize);
  },
  _onVis(){
    if(document.hidden){
      if(raf){ cancelAnimationFrame(raf); raf=0; }
    }else if(!raf&&hostEl){
      const loop=()=>{ WDMap._frame(); raf=requestAnimationFrame(loop); };
      raf=requestAnimationFrame(loop);
    }
  },

  /* ================= 静态地形离屏缓存 ================= */
  _buildStatic(){
    if(!c2) return;
    /* 离屏层尺寸精确等于地图逻辑尺寸（COLS*u × ROWS*u，乘 DPR），
       避免源画布与目标矩形不一致导致缩放后静态层/动态层错位 */
    const c=document.createElement("canvas");
    c.width=Math.round(COLS*u*dpr); c.height=Math.round(ROWS*u*dpr);
    const g=c.getContext("2d");
    g.setTransform(dpr,0,0,dpr,0,0);
    g.imageSmoothingEnabled=false;
    paintStatic(g,u,layers);
    staticCv=c; staticBuilt=true;
  },

  /* ================= 手势 ================= */
  _bindControls(host){
    host.querySelectorAll("#wdmapCtl [data-ly]").forEach(b=>{
      b.onpointerdown=e=>{ e.stopPropagation(); this.setLayer(b.dataset.ly,!layers[b.dataset.ly]); };
    });
    const plus=qs("#zmPlus",host), minus=qs("#zmMinus",host), reset=qs("#zmReset",host);
    if(plus) plus.onpointerdown=e=>{ e.stopPropagation(); this.zoomIn(); };
    if(minus) minus.onpointerdown=e=>{ e.stopPropagation(); this.zoomOut(); };
    if(reset) reset.onpointerdown=e=>{ e.stopPropagation(); this.resetView(); };
    host.querySelectorAll(".mapnpc").forEach(b=>{
      b.onpointerdown=()=>{
        const id=b.dataset.npc;
        if(this.npcVisible(id)) opts.onNpcTap&&opts.onNpcTap(id);
        else { const a=NPC_ACT[id]; opts.onFogTap&&opts.onFogTap(id,a); }
      };
    });
    this._syncCtl();
  },

  _localPoint(e){
    const r=cv.getBoundingClientRect();
    return {x:e.clientX-r.left, y:e.clientY-r.top};
  },

  _bindGestures(){
    cv.onpointerdown=e=>{
      try{ cv.setPointerCapture(e.pointerId); }catch(err){}
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const p=this._localPoint(e);
      if(pointers.size===2){
        gesture="pinch"; downInfo=null;
        const pts=Array.from(pointers.values());
        pinch0={d:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)};
      }else if(pointers.size===1){
        gesture="maybe";
        downInfo={x:p.x,y:p.y,moved:false,t:Date.now(),kind:e.pointerType||"mouse"};
        startPan={x:cam.x,y:cam.y,cx:p.x,cy:p.y};
      }
    };
    cv.onpointermove=e=>{
      if(!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const p=this._localPoint(e);
      if(gesture==="pinch"&&pointers.size>=2){
        const pts=Array.from(pointers.values());
        const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
        if(pinch0&&d>0&&pinch0.d>0){
          const mid={x:(pts[0].x+pts[1].x)/2-cv.getBoundingClientRect().left,
                     y:(pts[0].y+pts[1].y)/2-cv.getBoundingClientRect().top};
          this._zoomTo(d/pinch0.d,mid.x,mid.y,false);
          pinch0.d=d;
        }
        return;
      }
      if(downInfo){
        const dx=p.x-downInfo.x, dy=p.y-downInfo.y;
        if(Math.abs(dx)>8||Math.abs(dy)>8){
          // 触摸时纵向位移交给页面滚动（touch-action:pan-y），横向且已放大才平移
          if(downInfo.kind==="touch"&&Math.abs(dy)>Math.abs(dx)){ gesture="scroll"; return; }
          if(cam.z>1.01||downInfo.kind==="mouse"){ gesture="pan"; downInfo.moved=true; }
        }
        if(gesture==="pan"&&startPan){
          const np=U.clampPan(COLS*u*cam.z,ROWS*u*cam.z,cssW,cssH,
            startPan.x+(p.x-startPan.cx), startPan.y+(p.y-startPan.cy));
          cam.x=np.x; cam.y=np.y;
        }
      }
    };
    const end=e=>{
      const wasGesture=gesture, wasDown=downInfo;
      pointers.delete(e.pointerId);
      if(pointers.size<2){ pinch0=null; if(wasGesture==="pinch") gesture="none"; }
      if(pointers.size===1&&wasGesture==="pinch"){
        // 捏合后留一指：不平移，等其抬起
        gesture="none"; downInfo=null; return;
      }
      if(pointers.size>0) return;
      if(wasDown&&!wasDown.moved&&wasGesture!=="pinch"&&wasGesture!=="scroll"&&wasGesture!=="pan"){
        this._handleTap(wasDown.x,wasDown.y);
      }
      gesture="none"; downInfo=null; startPan=null;
    };
    cv.onpointerup=end;
    cv.onpointercancel=end;
    cv.onpointerleave=end;
    /* 双击/双触复位 */
    cv.ondblclick=e=>{ e.preventDefault(); const p=this._localPoint(e); this._zoomTo(1,p.x,p.y,true); };
    /* 滚轮缩放（需非 passive 才能 preventDefault） */
    cv.addEventListener("wheel",e=>{
      e.preventDefault();
      const p=this._localPoint(e);
      this._zoomTo(e.deltaY<0?1.18:1/1.18,p.x,p.y,false);
    },{passive:false});
  },

  _handleTap(px,py){
    const now=Date.now();
    const dt=now-lastTap.t, dd=Math.hypot(px-lastTap.x,py-lastTap.y);
    lastTap={t:now,x:px,y:py};
    if(dt<300&&dd<18&&cam.z>1.01){ this._zoomTo(1,px,py,true); return; } // 双触复位
    const w=U.toWorld(px,py,u,cam.z,cam);
    const id=U.hitNpc(w.x,w.y);
    if(!id) return;
    if(this.npcVisible(id)) opts.onNpcTap&&opts.onNpcTap(id);
    else opts.onFogTap&&opts.onFogTap(id,NPC_ACT[id]);
  },

  /* ================= 外部素材替换（canvas/列表/对话流统一） -------------------
     玩家立绘：assets/player/player-<阶段1-5>.png，无则 assets/player/player.png
     NPC 头像：assets/npc/<npcId>.png ---------------------------------------- */
  applyOverrides(host){
    const v=String(T0);
    const takeImage=(src,key)=>probeImg(src).then(s=>{
      if(!s) return null;
      const im=new Image(); im.src=s;
      _extImg[key]=im;
      delete _avCache[key+"_3"]; delete _avCache[key+"_4"]; delete _avCache[key+"_2"];
      return s;
    });
    /* 玩家：阶段换装 → 同时进 canvas 精灵与状态卡 */
    const stage=(CTX.stage?CTX.stage():1);
    takeImage("assets/player/player-"+stage+".png?v="+v,"_player")
      .catch(()=>null)
      .then(s=>s||takeImage("assets/player/player.png?v="+v,"_player").catch(()=>null))
      .then(s=>{ if(!s)return; const im=qs("#pportImg",host); if(im) im.src=s; });
    /* NPC：列表头像 + canvas 精灵 + 广播（对话流换头像） */
    CTX.D.npcs.forEach(n=>{
      probeImg("assets/npc/"+n.id+".png?v="+v).then(s=>{
        if(!s) return;
        const im=new Image(); im.src=s; _extImg[n.id]=im;
        delete _avCache[n.id+"_3"]; delete _avCache[n.id+"_4"]; delete _avCache[n.id+"_2"];
        const li=host.querySelector('.mapnpc[data-npc="'+n.id+'"] img');
        if(li) li.src=s;
        document.body.dispatchEvent(new CustomEvent("wdavatar",{detail:n.id}));
      });
    });
  },

  /* NPC 是否已现身（所属幕解锁） */
  npcVisible(id){
    const st=CTX.getSt(), D=CTX.D;
    const act=NPC_ACT[id]||1;
    let start=46;
    D.days.forEach(d=>{ if(d.act==="act"+act&&d.day<start) start=d.day; });
    return st.unlocked>=start;
  },

  _curAct(){
    const st=CTX.getSt(), D=CTX.D;
    let a=1;
    D.days.forEach(d=>{ if(st.day>=d.day&&d.act){ const n=+d.act.slice(3); if(n>a) a=n; } });
    return "act"+a;
  },

  /* ================= 帧渲染 ================= */
  _frame(){
    if(!c2||!CTX) return;
    if(!staticBuilt) this._buildStatic();
    const t=Date.now()-T0;
    c2.setTransform(dpr,0,0,dpr,0,0);
    c2.imageSmoothingEnabled=false;
    c2.fillStyle="#141026";
    c2.fillRect(0,0,cssW,cssH);
    c2.save();
    c2.translate(cam.x,cam.y);
    c2.scale(cam.z,cam.z);
    if(staticCv) c2.drawImage(staticCv,0,0,COLS*u,ROWS*u);
    paintDynamic(c2,u,t,{
      CTX, layers, ext:_extImg,
      visible:id=>WDMap.npcVisible(id),
      curAct:WDMap._curAct()
    });
    c2.restore();
  }
};

/* ##########################################################################
   # 地形绘制（全部 tile 坐标，g 为已变换到「基础缩放」坐标系的 context）   #
   ########################################################################## */
function F(g,u,x,y,w,h,col){ g.fillStyle=col; g.fillRect(Math.round(x*u),Math.round(y*u),Math.ceil(w*u),Math.ceil(h*u)); }
function P(g,u,x,y,w,h,col){ g.fillStyle=col; g.fillRect(Math.round(x*u),Math.round(y*u),Math.max(1,Math.round(w*u)),Math.max(1,Math.round(h*u))); }

function drawMountains(g,u){
  const m=(cx,cy,w,h)=>{
    F(g,u,cx,cy,w,h,"#2a1a4a");
    F(g,u,cx+w*0.2,cy+h*0.25,w*0.6,h*0.75,"#33205c");
    F(g,u,cx+w*0.38,cy+h*0.1,w*0.24,h*0.3,"#4a2d7a");
    P(g,u,cx+w*0.44,cy+h*0.12,w*0.1,h*0.08,"#8a7ab8");
  };
  m(0.2,1.2,3.2,2.6); m(2.4,2.2,2.6,2.2); m(0.6,9.6,2.8,2.2);
  m(12.9,1.0,2.6,2.0); m(14.6,2.4,1.4,1.4);
}
function drawTree(g,u,cx,cy){
  P(g,u,cx+0.3,cy+0.55,0.4,0.4,"#4a3020");
  P(g,u,cx,cy,1,0.55,"#1d5a3a");
  P(g,u,cx+0.2,cy-0.25,0.6,0.35,"#2a7a4a");
}
function drawWaterBase(g,u){
  F(g,u,4.9,0,1.1,12,"#12304a");
  F(g,u,5.6,4.2,1.1,3.2,"#12304a");
  F(g,u,4.75,10.6,1.4,1.4,"#12304a");
  P(g,u,5.05,3.4,0.55,0.12,"#1d5a7a"); P(g,u,5.05,7.6,0.55,0.12,"#1d5a7a");
}
function drawBridge(g,u){
  F(g,u,4.55,6.05,2.4,0.5,"#4a3020");
  P(g,u,4.55,5.8,0.25,0.85,"#5a4028"); P(g,u,6.7,5.8,0.25,0.85,"#5a4028");
  P(g,u,4.55,6.55,2.4,0.14,"#2a1a10");
}
function drawGate(g,u){
  F(g,u,0.6,5.6,2.6,3.2,"#3a2a5e");
  F(g,u,1.3,6.6,1.2,2.2,"#141026");
  P(g,u,0.6,5.3,2.6,0.4,"#4a2d7a");
  P(g,u,1.55,5.85,0.7,0.3,"#ffd23f");
  P(g,u,1.0,7.4,0.16,1.4,"#4a2d7a"); P(g,u,2.6,7.4,0.16,1.4,"#4a2d7a");
}
function drawArchive(g,u){
  F(g,u,6.7,2.6,2.0,1.9,"#2a1a4a");
  F(g,u,6.5,2.2,2.4,0.5,"#6a3fa0");
  P(g,u,7.0,3.1,0.5,0.5,"#ffd23f"); P(g,u,7.9,3.1,0.5,0.5,"#ffd23f");
  P(g,u,7.35,3.9,0.7,0.6,"#141026");
  P(g,u,7.3,2.28,0.9,0.32,"#e8f0e0");
}
function drawTower(g,u){
  for(let i=0;i<4;i++){
    const wy=0.4+i*0.85, ww=1.1-i*0.14;
    F(g,u,8.35-ww/2,wy,ww,0.72,"#2d2440");
    P(g,u,8.35-ww/2,wy+0.62,ww,0.12,"#4a4a5a");
    P(g,u,8.35-0.14,wy+0.2,0.28,0.3,"#ffd23f");
  }
}
function drawMarketBase(g,u){
  F(g,u,9.5,7.2,1.15,0.9,"#4a3020");
  F(g,u,10.6,7.9,1.0,0.7,"#4a3020");
  P(g,u,9.7,7.5,0.2,0.2,"#ffd23f"); P(g,u,10.85,8.15,0.2,0.2,"#7fff7f");
}
function drawObservatoryBase(g,u){
  F(g,u,11.15,3.3,1.5,0.9,"#2a1a4a");
  P(g,u,11.0,3.1,1.8,0.3,"#4a2d7a");
  P(g,u,11.3,2.2,0.9,0.9,"#141026");
}
function drawGolden(g,u){
  F(g,u,13.3,5.4,2.0,2.4,"#2a1a4a");
  P(g,u,13.1,5.1,2.4,0.4,"#b8902a");
  F(g,u,13.9,6.2,0.9,1.6,"#b8902a");
  P(g,u,14.0,6.35,0.7,1.3,"#ffd23f");
  P(g,u,13.5,5.55,1.6,0.3,"#1a0f2e"); P(g,u,13.7,5.6,1.2,0.2,"#ffd23f");
}
function drawPath(g,u){
  const seg=[[1.9,8.4,3.2,8.0],[3.2,8.0,4.4,7.4],[4.4,7.4,5.6,7.2],[5.6,7.2,6.6,6.6],[6.6,6.6,7.6,6.1],
    [7.6,6.1,8.8,5.5],[8.8,5.5,9.8,6.5],[9.8,6.5,10.8,6.0],[10.8,6.0,11.7,5.2],[11.7,5.2,12.6,5.4],[12.6,5.4,14.3,7.3]];
  seg.forEach(s=>{
    const x1=s[0],y1=s[1],x2=s[2],y2=s[3], steps=Math.ceil(Math.hypot(x2-x1,y2-y1)*3);
    for(let i=0;i<=steps;i++){
      P(g,u,x1+(x2-x1)*i/steps-0.14,y1+(y2-y1)*i/steps-0.14,0.3,0.3,"#3a2a5e");
    }
  });
}
function drawActLabels(g,u){
  const marks=[[1.0,10.9,"壹"],[7.2,1.0,"贰"],[9.8,10.9,"叁"],[11.3,1.0,"肆"],[13.6,9.9,"伍"]];
  marks.forEach(m=>{
    const x=m[0],y=m[1],ch=m[2];
    P(g,u,x,y,0.9,0.9,"#241845");
    g.strokeStyle="#4a2d7a"; g.lineWidth=1;
    g.strokeRect(Math.round(x*u)+0.5,Math.round(y*u)+0.5,Math.round(u*0.9)-1,Math.round(u*0.9)-1);
    g.fillStyle="#9a8abe"; g.font=Math.round(u*0.62)+"px sans-serif";
    g.textAlign="center"; g.textBaseline="middle";
    g.fillText(ch,(x+0.45)*u,(y+0.5)*u);
  });
}

function paintStatic(g,u,L){
  F(g,u,0,0,COLS,ROWS,"#1c1236");
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){ if((x+y)%2) P(g,u,x,y,1,1,"#1f1440"); }
  drawMountains(g,u);
  [[4.0,4.6],[0.9,3.9],[6.3,9.8],[12.4,8.9],[3.0,10.6],[15.0,4.6]].forEach(t=>drawTree(g,u,t[0],t[1]));
  P(g,u,12.1,1.9,0.3,0.9,"#4a2d7a"); P(g,u,12.6,2.3,0.3,0.5,"#4a2d7a"); P(g,u,13.1,2.0,0.3,0.8,"#4a2d7a");
  if(L.path) drawPath(g,u);
  drawWaterBase(g,u);
  drawBridge(g,u);
  drawGate(g,u);
  drawArchive(g,u);
  drawTower(g,u);
  drawMarketBase(g,u);
  drawObservatoryBase(g,u);
  drawGolden(g,u);
  drawActLabels(g,u);
}

/* ---------- 动态层（每帧）：水波/灯火/棚幔/星轨/雾/NPC/玩家 ---------- */
function drawSpriteFlex(g,u,id,x,y,ghost,scale){
  const s=1.14*scale;
  const im=(window.WDMap._extFor&&window.WDMap._extFor(id))||spriteCanvas(id,ghost);
  g.imageSmoothingEnabled=false;
  g.drawImage(im,(x-s/2)*u,(y-s*0.92)*u,s*u,s*u);
}

function drawNameTag(g,u,npc,name,x,y,dim){
  g.font="600 "+Math.round(u*0.52)+"px sans-serif";
  g.textAlign="center"; g.textBaseline="bottom";
  const tx=Math.round(x*u), ty=Math.round(y*u)-2;
  const label=dim?"？？？":name;
  const w=g.measureText(label).width+Math.round(u*0.4);
  g.fillStyle=dim?"rgba(20,16,38,0.75)":"rgba(16,12,32,0.92)";
  g.fillRect(tx-w/2,ty-u*0.68,w,u*0.72);
  g.strokeStyle=dim?"rgba(90,85,120,0.6)":"rgba(122,61,191,0.9)";
  g.lineWidth=Math.max(1,u/14);
  g.strokeRect(tx-w/2,ty-u*0.68,w,u*0.72);
  g.fillStyle=dim?"#8a85a8":"#3df0ff";
  g.fillText(label,tx,ty);
}

function paintDynamic(g,u,t,arg){
  const CTX=arg.CTX, st=CTX.getSt(), D=CTX.D;
  /* 水波 */
  for(let i=0;i<7;i++){
    const wy=(i*1.75+((t/600)%1.75))%12;
    P(g,u,5.05+0.15*Math.sin(wy*2),wy,0.55,0.12,"#1d5a7a");
  }
  P(g,u,5.3,((t/900)%12),0.18,0.1,"#3df0ff");
  /* 城门灯柱呼吸 */
  let glow=0.5+0.5*Math.sin(t/500);
  P(g,u,2.95,6.2,0.22,0.3,"#ffd23f");
  g.fillStyle="rgba(255,210,63,"+(0.10+0.10*glow)+")";
  g.fillRect(Math.round(2.6*u),Math.round(5.6*u),u*1.2,u*1.4);
  /* 律法塔顶灯 */
  const tg=0.5+0.5*Math.sin(t/400);
  P(g,u,8.22,0.12,0.34,0.3,"#ff5fa8");
  g.fillStyle="rgba(255,95,168,"+(0.08+0.10*tg)+")";
  g.fillRect(Math.round(7.7*u),0,u*1.3,u*1.1);
  /* 市集棚幔交替 */
  P(g,u,9.38,6.9,1.4,0.4,(Math.floor(t/800)%2)?"#e07aa8":"#ffb8d8");
  P(g,u,10.5,7.6,1.2,0.35,(Math.floor(t/800)%2)?"#ffb8d8":"#e07aa8");
  /* 观星台星轨 */
  g.strokeStyle="#3df0ff"; g.lineWidth=Math.max(1,u/10);
  const r=u*0.55, cx=11.75*u, cy=2.65*u;
  g.beginPath(); g.arc(cx,cy,r,0,7); g.stroke();
  const a=t/1200;
  P(g,u,11.75+Math.cos(a)*0.55-0.07,2.65+Math.sin(a)*0.55-0.07,0.14,0.14,"#ffd23f");
  /* 金榜台辉光 */
  const gg=0.5+0.5*Math.sin(t/600);
  g.fillStyle="rgba(255,210,63,"+(0.06+0.10*gg)+")";
  g.fillRect(Math.round(13.0*u),Math.round(4.6*u),u*2.6,u*3.4);

  /* NPC 精灵（名牌图层可关；现身与否的门禁独立于雾图层） */
  for(const id in SPOTS){
    const s=SPOTS[id], vis=arg.visible(id);
    const bob=Math.sin(t/700+hash(id)%7)*0.12;
    drawSpriteFlex(g,u,id,s.x,s.y+bob,!vis,1);
    if(arg.layers.tags) drawNameTag(g,u,CTX.NPC[id],(CTX.NPC[id]||{}).name,s.x,s.y-0.66+bob,!vis);
  }

  /* 遗忘之雾（视觉层可关；关闭后未解锁 NPC 仍为灰影「？？？」，不破坏解锁门禁） */
  if(arg.layers.fog){
    const actX={act1:0,act2:1,act3:2,act4:3,act5:4};
    const unlocked={};
    D.days.forEach(d=>{ if(st.unlocked>=d.day) unlocked[d.act]=true; });
    for(const aa in actX){
      if(unlocked[aa]) continue;
      const range=ACT_X[actX[aa]], x1=range[0],x2=range[1];
      for(let i=0;i<3;i++){
        const fx=x1+((t/11000+i*0.7+i*i*0.13)%1)*(x2-x1-1.6);
        const fy=(i*4+(t/6000)%4)%ROWS-1;
        g.fillStyle="rgba(190,200,235,0.05)";
        g.beginPath();
        g.arc(Math.round((fx+0.8)*u),Math.round((fy+1)*u),u*0.85,0,7);
        g.fill();
      }
      g.fillStyle="rgba(150,160,210,0.07)";
      g.fillRect(Math.round(x1*u),0,Math.ceil((x2-x1)*u),ROWS*u);
    }
  }

  /* 玩家执灯标记：沿路径推进 + 呼吸光 */
  const idx=Math.min(WAY.length-1,Math.round((st.unlocked-1)/44*(WAY.length-1)));
  const wx=WAY[idx][0],wy=WAY[idx][1], pb=0.5+0.5*Math.sin(t/450);
  g.fillStyle="rgba(255,95,168,"+(0.10+0.12*pb)+")";
  g.beginPath(); g.arc(Math.round(wx*u),Math.round(wy*u),u*(0.9+0.15*pb),0,7); g.fill();
  drawSpriteFlex(g,u,"_player",wx,wy,false,0.95);
}

/* 供 paintDynamic 取外部图片 */
WDMap._extFor=function(id){ const im=_extImg[id]; return (im&&im.complete&&im.naturalWidth>0)?im:null; };

/* ---------- 控件样式（模块自注入，保证独立复用） ---------- */
(function injectStyle(){
  if(typeof document==="undefined"||document.getElementById("wdmap-style")) return;
  const s=document.createElement("style");
  s.id="wdmap-style";
  s.textContent=`
  .mapctl{display:flex;align-items:center;gap:6px;margin:0 0 8px;flex-wrap:wrap}
  .mapctl button{font:inherit;font-size:11.5px;color:var(--fg2,#9a8abe);background:var(--bg2,#241845);border:1px solid var(--border,#3a2a5e);padding:3px 10px;cursor:pointer;letter-spacing:.08em;box-shadow:1px 1px 0 #000;touch-action:manipulation}
  .mapctl button:active{transform:translate(1px,1px)}
  .mapctl button.on{color:#141026;background:var(--cyber,#3df0ff);border-color:var(--cyber,#3df0ff);font-weight:600}
  .mapctl #zmPct{font-size:11px;color:var(--dim,#6a608a);min-width:38px;text-align:center;font-variant-numeric:tabular-nums}
  .mapctl .zmr{display:none}
  .mapctl .msc{flex:1}`;
  document.head.appendChild(s);
})();

window.WDMap=WDMap;
})();
