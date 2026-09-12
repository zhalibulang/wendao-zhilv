/* ==================== 问道之旅 · 主页像素地图模块（独立可复用） ====================
   window.WDMap —— 2D 像素风游戏地图 + NPC 像素头像
   低耦合设计：依赖经 init(ctx) 注入 {D, NPC, getSt}；交互经 mount(host, opts) 回调。
   功能：
     · canvas 像素 tilemap（城门/山河/律法塔/藏经阁/市集/观星台/金榜台）
     · 六位 NPC 像素头像（12×12 矩阵手绘，职业特征配色）
     · 未解锁幕次以「遗忘之雾」遮罩，NPC 显影/雾中人影
     · 玩家执灯标记沿路径随进度推进
     · 点击 NPC 头像触发对话（opts.onNpcTap）
     · 响应式（DPR 适配）· avatarURL 供对话流复用头像
   ========================================================================= */
(function(){
"use strict";
const COLS=16, ROWS=12, BASE=16;   // 地图 16×12 tile，基准 tile 16 逻辑像素

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
/* 幕次横向区域（tile x 范围） */
const ACT_X=[[0,6.2],[6.2,9.4],[9.4,11],[11,12.8],[12.8,16]];
/* 玩家行进路径（随进度推进） */
const WAY=[[1.8,7.6],[3.2,6.2],[4.4,5.8],[5.6,6.4],[6.6,5.4],[7.6,4.6],[8.8,5.4],[9.8,6.2],[10.6,5.4],[11.4,5.6],[12.2,5.8],[13.2,6.2],[14.2,6.4]];

let CTX=null, raf=0, hostEl=null, cv=null, c2=null, opts=null, tile=16, T0=Date.now();
const _avCache={};
const _probed={};       // 素材探测去重（每会话一次）
const _probeCache={};   // 探测结果（URL 或 null）

function esc(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
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

function drawSprite(ctx,spr,px,ox,oy,ghost){
  spr.p.forEach((row,ry)=>{
    for(let rx=0;rx<row.length;rx++){
      const col=spr.c[row[rx]]; if(!col) continue;
      ctx.fillStyle=ghost?"#5a5578":col;
      ctx.fillRect(ox+rx*px, oy+ry*px, px, px);
    }
  });
}

const WDMap={
  init(ctx){ CTX=ctx; },

  /* NPC 头像 dataURL（缓存，供对话流/面板复用） */
  avatarURL(id,scale){
    const s=scale||3, key=id+"_"+s;
    if(_avCache[key]) return _avCache[key];
    const spr=SPR[id]||SPR.qingxuan;
    const c=document.createElement("canvas"); c.width=12*s; c.height=12*s;
    const g=c.getContext("2d");
    spr.p.forEach((row,ry)=>{ for(let rx=0;rx<row.length;rx++){
      const col=spr.c[row[rx]]; if(!col) continue;
      g.fillStyle=col; g.fillRect(rx*s,ry*s,s,s);
    }});
    return _avCache[key]=c.toDataURL();
  },

  /* ---------- 地图挂载 ---------- */
  mount(host,opts_){
    opts=opts_||{};
    this.unmount();
    hostEl=host;
    const st=CTX.getSt();
    const w=host.clientWidth||360;
    /* 高分辨率渲染：内部按 devicePixelRatio 放大，CSS 定宽高比，杜绝低分辨率拉伸 */
    const dpr=Math.min(3,window.devicePixelRatio||1);
    const cssTile=Math.max(15,Math.floor(w/COLS));
    tile=Math.round(cssTile*dpr);
    const W=tile*COLS, H=tile*ROWS;
    host.innerHTML=`
      <div class="mapinfo">
        <span>第 <b>${st.day}</b>/45 日 · ${esc(CTX.D.acts[curAct()])}</span>
        <span class="dim">点击 NPC 头像，即刻对话</span>
      </div>
      <canvas id="wdmapCv" width="${W}" height="${H}" style="width:100%;aspect-ratio:${COLS}/${ROWS};image-rendering:pixelated;display:block;border:2px solid var(--border-lit);box-shadow:3px 3px 0 #000;background:#141026"></canvas>
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
          <div class="pname">${esc(st.player)}<em>${esc(CTX.stats?CTX.stats().title:"行路人")}</em></div>
          <div class="pstats">${(()=>{
            const s=CTX.stats?CTX.stats():{};
            return `<span>Lv.<b>${s.lv!=null?s.lv:1}</b></span><span>修行 <b>${st.xp}</b></span><span>铜钱 <b>${st.coin}</b></span><span>连击 <b>${s.streak||0}</b> 日</span><span>交付 <b>${Object.keys(st.done||{}).length}</b>/274</span>`;
          })()}</div>
          <div class="pgear"><span class="gslot">武器<i>待启</i></span><span class="gslot">法器<i>待启</i></span><span class="gslot">护符<i>待启</i></span><span class="gslot">行囊<i>待启</i></span></div>
        </div>
      </div>`;
    cv=$("#wdmapCv",host);
    c2=cv.getContext("2d");
    // 点击命中检测：距离 < 1.4 tile 视为命中 NPC
    cv.onpointerdown=e=>{
      const r=cv.getBoundingClientRect();
      const mx=(e.clientX-r.left)/r.width*COLS, my=(e.clientY-r.top)/r.height*ROWS;
      let best=null,bd=9;
      for(const id in SPOTS){
        const s=SPOTS[id], d=Math.hypot(mx-s.x,my-s.y);
        if(d<bd){ bd=d; best=id; }
      }
      if(best&&bd<1.6){
        if(this.npcVisible(best)) opts.onNpcTap&&opts.onNpcTap(best);
        else { const a=NPC_ACT[best]; opts.onFogTap&&opts.onFogTap(best,a); }
      }
    };
    host.querySelectorAll(".mapnpc").forEach(b=>{
      b.onpointerdown=()=>{
        const id=b.dataset.npc;
        if(this.npcVisible(id)) opts.onNpcTap&&opts.onNpcTap(id);
        else opts.onFogTap&&opts.onFogTap(id,NPC_ACT[id]);
      };
    });
    const loop=()=>{ draw(); raf=requestAnimationFrame(loop); };
    raf=requestAnimationFrame(loop);
    // 外部素材探测：assets/ 下有设计图即替换占位像素（上传 GitHub 即生效，零代码改动）
    this.applyOverrides(host);
  },
  unmount(){ if(raf){ cancelAnimationFrame(raf); raf=0; } hostEl=null; cv=null; c2=null; },

  /* ---------- 外部素材替换机制 ----------
     玩家立绘：assets/player/player-<阶段1-5>.png，无则 assets/player/player.png
     NPC 头像：assets/npc/<npcId>.png（qingxuan/smq/tiemian/liuruyan/moxiaogu/xuanji）
     探测成功 → 替换页内 <img> 与对话流头像缓存，并广播 wdavatar 事件 */
  applyOverrides(host){
    const v=String(T0); // 会话级版本参数，规避陈旧缓存
    // 玩家立绘（按称号阶段换装）
    const stage=CTX.stage?CTX.stage():1;
    probeImg("assets/player/player-"+stage+".png?v="+v)
      .then(s=>s||probeImg("assets/player/player.png?v="+v))
      .then(s=>{
        if(!s) return;
        const im=document.getElementById("pportImg");
        if(im) im.src=s;
        _avCache["_player_4"]=s;
      });
    // NPC 头像
    CTX.D.npcs.forEach(n=>{
      const rawKey="assets/npc/"+n.id+".png";
      if(_probed[n.id]){ const got=_probeCache[rawKey]; if(got){ const im=host.querySelector('.mapnpc[data-npc="'+n.id+'"] img'); if(im) im.src=got; } return; }
      _probed[n.id]=1;
      probeImg(rawKey+"?v="+v).then(s=>{
        if(!s) return;
        _probeCache[rawKey]=s;
        _avCache[n.id+"_3"]=s; _avCache[n.id+"_4"]=s;
        const im=host.querySelector('.mapnpc[data-npc="'+n.id+'"] img');
        if(im) im.src=s;
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
  }
};

function curAct(){
  const st=CTX.getSt(), D=CTX.D;
  let a=1;
  D.days.forEach(d=>{ if(st.day>=d.day&&d.act){ const n=+d.act.slice(3); if(n>a) a=n; } });
  return "act"+a;
}

/* ---------- 地形绘制 ---------- */
function fill(x,y,w,h,col){ c2.fillStyle=col; c2.fillRect(Math.round(x*tile),Math.round(y*tile),Math.ceil(w*tile),Math.ceil(h*tile)); }
function px(x,y,w,h,col){ c2.fillStyle=col; c2.fillRect(Math.round(x*tile),Math.round(y*tile),Math.max(1,Math.round(w*tile)),Math.max(1,Math.round(h*tile))); }

function drawMountain(cx,cy,w,h){
  // 层叠像素山
  const base=Math.round(cy*tile);
  fill(cx,cy,w,h,"#2a1a4a");
  fill(cx+w*0.2,cy+h*0.25,w*0.6,h*0.75,"#33205c");
  fill(cx+w*0.38,cy+h*0.1,w*0.24,h*0.3,"#4a2d7a");
  px(cx+w*0.44,cy+h*0.12,w*0.1,h*0.08,"#8a7ab8");
}
function drawTree(cx,cy){
  px(cx+0.3,cy+0.55,0.4,0.4,"#4a3020");
  px(cx,cy,1,0.55,"#1d5a3a");
  px(cx+0.2,cy-0.25,0.6,0.35,"#2a7a4a");
}
function drawWater(t){
  // 河流：蜿蜒竖向，波光随时间
  fill(4.9,0,1.1,12,"#12304a");
  fill(5.6,4.2,1.1,3.2,"#12304a");
  fill(4.75,10.6,1.4,1.4,"#12304a");
  for(let i=0;i<7;i++){
    const wy=(i*1.75+((t/600)%1.75))%12;
    px(5.05+0.15*Math.sin(wy*2),wy,0.55,0.12,"#1d5a7a");
  }
  px(5.3,(t/900%12),0.18,0.1,"#3df0ff");
}
function drawBridge(){
  fill(4.55,6.05,2.4,0.5,"#4a3020");
  px(4.55,5.8,0.25,0.85,"#5a4028"); px(6.7,5.8,0.25,0.85,"#5a4028");
  px(4.55,6.55,2.4,0.14,"#2a1a10");
}
function drawGate(t){
  // 城门（起点）：石墙+门洞+匾
  fill(0.6,5.6,2.6,3.2,"#3a2a5e");
  fill(1.3,6.6,1.2,2.2,"#141026");
  px(0.6,5.3,2.6,0.4,"#4a2d7a");
  px(1.55,5.85,0.7,0.3,"#ffd23f"); // 匾额
  px(1.0,7.4,0.16,1.4,"#4a2d7a"); px(2.6,7.4,0.16,1.4,"#4a2d7a");
  // 门旁灯柱（呼吸光）
  const glow=0.5+0.5*Math.sin(t/500);
  px(2.95,6.2,0.22,0.3,"#ffd23f");
  c2.fillStyle="rgba(255,210,63,"+(0.10+0.10*glow)+")";
  c2.fillRect(Math.round(2.6*tile),Math.round(5.6*tile),tile*1.2,tile*1.4);
}
function drawArchive(){
  // 藏经阁：两层小楼+墨字匾
  fill(6.7,2.6,2.0,1.9,"#2a1a4a");
  fill(6.5,2.2,2.4,0.5,"#6a3fa0");
  px(7.0,3.1,0.5,0.5,"#ffd23f"); px(7.9,3.1,0.5,0.5,"#ffd23f");
  px(7.35,3.9,0.7,0.6,"#141026");
  px(7.3,2.28,0.9,0.32,"#e8f0e0");
}
function drawTower(t){
  // 律法塔：五层铁塔+顶层金灯
  for(let i=0;i<4;i++){
    const wy=0.4+i*0.85, ww=1.1-i*0.14;
    fill(8.35-ww/2,wy,ww,0.72,"#2d2440");
    px(8.35-ww/2,wy+0.62,ww,0.12,"#4a4a5a");
    px(8.35-0.14,wy+0.2,0.28,0.3,"#ffd23f");
  }
  const g=0.5+0.5*Math.sin(t/400);
  px(8.22,0.12,0.34,0.3,"#ff5fa8");
  c2.fillStyle="rgba(255,95,168,"+(0.08+0.10*g)+")";
  c2.fillRect(Math.round(7.7*tile),0,tile*1.3,tile*1.1);
}
function drawMarket(t){
  // 市集：两顶粉纱棚+摊位
  fill(9.5,7.2,1.15,0.9,"#4a3020");
  px(9.38,6.9,1.4,0.4,(Math.floor(t/800)%2)?"#e07aa8":"#ffb8d8");
  fill(10.6,7.9,1.0,0.7,"#4a3020");
  px(10.5,7.6,1.2,0.35,(Math.floor(t/800)%2)?"#ffb8d8":"#e07aa8");
  px(9.7,7.5,0.2,0.2,"#ffd23f"); px(10.85,8.15,0.2,0.2,"#7fff7f");
}
function drawObservatory(t){
  // 观星台：高台+环形星盘
  fill(11.15,3.3,1.5,0.9,"#2a1a4a");
  px(11.0,3.1,1.8,0.3,"#4a2d7a");
  px(11.3,2.2,0.9,0.9,"#141026");
  c2.strokeStyle="#3df0ff"; c2.lineWidth=Math.max(1,tile/10);
  const r=tile*0.55, cx=(11.75)*tile, cy=(2.65)*tile;
  c2.beginPath(); c2.arc(cx,cy,r,0,7); c2.stroke();
  const a=t/1200;
  px(11.75+Math.cos(a)*0.55-0.07,2.65+Math.sin(a)*0.55-0.07,0.14,0.14,"#ffd23f");
}
function drawGolden(t){
  // 金榜台：终点高台+金门
  fill(13.3,5.4,2.0,2.4,"#2a1a4a");
  px(13.1,5.1,2.4,0.4,"#b8902a");
  fill(13.9,6.2,0.9,1.6,"#b8902a");
  px(14.0,6.35,0.7,1.3,"#ffd23f");
  const g=0.5+0.5*Math.sin(t/600);
  c2.fillStyle="rgba(255,210,63,"+(0.06+0.10*g)+")";
  c2.fillRect(Math.round(13.0*tile),Math.round(4.6*tile),tile*2.6,tile*3.4);
  px(13.5,5.55,1.6,0.3,"#1a0f2e"); px(13.7,5.6,1.2,0.2,"#ffd23f");
}
function drawPath(){
  // 山道：串联各地点
  const seg=[[1.9,8.4,3.2,8.0],[3.2,8.0,4.4,7.4],[4.4,7.4,5.6,7.2],[5.6,7.2,6.6,6.6],[6.6,6.6,7.6,6.1],
    [7.6,6.1,8.8,5.5],[8.8,5.5,9.8,6.5],[9.8,6.5,10.8,6.0],[10.8,6.0,11.7,5.2],[11.7,5.2,12.6,5.4],[12.6,5.4,14.3,7.3]];
  seg.forEach(s=>{
    const [x1,y1,x2,y2]=s, steps=Math.ceil(Math.hypot(x2-x1,y2-y1)*3);
    for(let i=0;i<=steps;i++){
      px(x1+(x2-x1)*i/steps-0.14,y1+(y2-y1)*i/steps-0.14,0.3,0.3,"#3a2a5e");
    }
  });
}
function drawScenery(){
  // 山景点缀（左山河、右遗迹残柱）
  drawMountain(0.2,1.2,3.2,2.6); drawMountain(2.4,2.2,2.6,2.2); drawMountain(0.6,9.6,2.8,2.2);
  drawMountain(12.9,1.0,2.6,2.0); drawMountain(14.6,2.4,1.4,1.4);
  drawTree(4.0,4.6); drawTree(0.9,3.9); drawTree(6.3,9.8); drawTree(12.4,8.9); drawTree(3.0,10.6); drawTree(15.0,4.6);
  // 遗迹残柱（第四幕点缀）
  px(12.1,1.9,0.3,0.9,"#4a2d7a"); px(12.6,2.3,0.3,0.5,"#4a2d7a"); px(13.1,2.0,0.3,0.8,"#4a2d7a");
}
function drawFog(t){
  // 遗忘之雾：未解锁幕区漂移雾块（轻量半透，保证地形可辨）
  const st=CTX.getSt(), D=CTX.D;
  const actX={act1:0,act2:1,act3:2,act4:3,act5:4};
  const unlocked={};
  D.days.forEach(d=>{ if(st.unlocked>=d.day) unlocked[d.act]=true; });
  for(const a in actX){
    if(unlocked[a]) continue;
    const [x1,x2]=ACT_X[actX[a]];
    for(let i=0;i<3;i++){
      const fx=x1+((t/11000+i*0.7+i*i*0.13)%1)*(x2-x1-1.6);
      const fy=(i*4+(t/6000)%4)%ROWS-1;
      c2.fillStyle="rgba(190,200,235,0.05)";
      c2.beginPath();
      c2.arc(Math.round((fx+0.8)*tile),Math.round((fy+1)*tile),tile*0.85,0,7);
      c2.fill();
    }
    c2.fillStyle="rgba(150,160,210,0.07)";
    c2.fillRect(Math.round(x1*tile),0,Math.ceil((x2-x1)*tile),ROWS*tile);
  }
}
function drawActLabel(){
  // 幕次地碑
  const st=CTX.getSt(), D=CTX.D;
  const marks=[[1.0,10.9,"壹"],[7.2,1.0,"贰"],[9.8,10.9,"叁"],[11.3,1.0,"肆"],[13.6,9.9,"伍"]];
  marks.forEach(([x,y,ch])=>{
    px(x,y,0.9,0.9,"#241845");
    c2.strokeStyle="#4a2d7a"; c2.lineWidth=1;
    c2.strokeRect(Math.round(x*tile)+0.5,Math.round(y*tile)+0.5,Math.round(tile*0.9)-1,Math.round(tile*0.9)-1);
    c2.fillStyle="#9a8abe"; c2.font=Math.round(tile*0.62)+"px sans-serif";
    c2.textAlign="center"; c2.textBaseline="middle";
    c2.fillText(ch,(x+0.45)*tile,(y+0.5)*tile);
  });
}
function drawNameTag(id,x,y,dim){
  const n=CTX.NPC[id]; if(!n) return;
  c2.font="600 "+Math.round(tile*0.52)+"px sans-serif";
  c2.textAlign="center"; c2.textBaseline="bottom";
  const tx=Math.round(x*tile), ty=Math.round(y*tile)-2;
  const label=dim?"？？？":n.name;
  const w=c2.measureText(label).width+Math.round(tile*0.4);
  c2.fillStyle=dim?"rgba(20,16,38,0.75)":"rgba(16,12,32,0.92)";
  c2.fillRect(tx-w/2,ty-tile*0.68,w,tile*0.72);
  c2.strokeStyle=dim?"rgba(90,85,120,0.6)":"rgba(122,61,191,0.9)";
  c2.lineWidth=Math.max(1,tile/14);
  c2.strokeRect(tx-w/2,ty-tile*0.68,w,tile*0.72);
  c2.fillStyle=dim?"#8a85a8":"#3df0ff";
  c2.fillText(label,tx,ty);
}
function draw(){
  if(!c2||!CTX) return;
  const t=Date.now()-T0, st=CTX.getSt();
  c2.imageSmoothingEnabled=false;
  // 地面底色 + 细网格
  fill(0,0,COLS,ROWS,"#1c1236");
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){ if((x+y)%2) px(x,y,1,1,"#1f1440"); }
  drawScenery();
  drawPath();
  drawWater(t);
  drawBridge();
  drawGate(t);
  drawArchive();
  drawTower(t);
  drawMarket(t);
  drawObservatory(t);
  drawGolden(t);
  drawActLabel();
  // NPC：现身者像素像+名牌+浮动；未解锁幕区为雾影
  // 精灵 12×12 矩阵 → 每格 tile*0.095，整像约 1.14 tile，居中于布点
  for(const id in SPOTS){
    const s=SPOTS[id], vis=WDMap.npcVisible(id);
    const bob=Math.sin(t/700+hash(id)%7)*0.12;
    drawSprite(c2,SPR[id]||SPR.qingxuan,tile*0.095,(s.x-0.57)*tile,(s.y-0.57+bob)*tile,!vis);
    drawNameTag(id,s.x,s.y-0.66+bob,!vis);
  }
  drawFog(t);
  // 玩家执灯标记（随进度沿路径推进 + 呼吸光）
  const idx=Math.min(WAY.length-1,Math.round((st.unlocked-1)/44*(WAY.length-1)));
  const [wx,wy]=WAY[idx], pb=0.5+0.5*Math.sin(t/450);
  c2.fillStyle="rgba(255,95,168,"+(0.10+0.12*pb)+")";
  c2.beginPath(); c2.arc(Math.round(wx*tile),Math.round(wy*tile),tile*(0.9+0.15*pb),0,7); c2.fill();
  drawSprite(c2,SPR._player,tile*0.09,(wx-0.54)*tile,(wy-0.60)*tile,false);
}

window.WDMap=WDMap;
})();
