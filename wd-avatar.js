/* ==========================================================================
   wd-avatar.js —— 问道之旅 · 像素头像（WDAvatar）
   职责：唯一保留的像素精灵资产——供对话流/配置中心/人设面板生成 12×12 位图
        dataURL（PNG，按 scale 放大）。无 DOM 依赖、无画布挂载、无定时器，
        可在任意宿主与 node 测试环境中复用。
   优先级由调用方组合：配置中心自定义头像(WDCfg) → WDAvatar 像素兜底 → 文字。
   ========================================================================== */
(function(){
"use strict";

/* ---------- NPC 像素头像（12×12 字符矩阵，每字符=1逻辑像素） ---------- */
const SPR={
  /* 云汀 · 圣女：月白衣裙青绦，双鬓簪灯 */
  yunting:{c:{H:"#2a1f3f",F:"#f5e8d8",E:"#1a0f2e",V:"#7de8e0",B:"#e8e2f5",L:"#ffd23f",s:"#3df0ff"},p:[
    "....HHHH....",
    "...HHHHHH...",
    "..HHFFFFHH..",
    "..HFEFFEFH..",
    "..HFFFFFFH..",
    "..HVLVLVH...",
    "...sBBBBs...",
    "..BBBBBBBB..",
    "..BBBBBBBB..",
    "..BBBBBBBB..",
    "...B....B...",
    "............"]},
  /* 晚棠 · 英语导游：蓝衫束发，背负长剑 */
  wantang:{c:{H:"#2b2b45",F:"#f2d5b0",E:"#1a0f2e",B:"#3a6ea8",s:"#ffd23f",S:"#cfd8e0",h:"#8a5a2a"},p:[
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
  /* 沈昭 · 藏经阁阁主：玄色直裾，金纹暗袍 */
  shenzhao:{c:{H:"#1a1230",M:"#4a4a5a",E:"#ff5252",B:"#2d2440",T:"#ffd23f"},p:[
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
  /* 程绣 · 旅行社老板：粉纱垂鬓，利落外衫 */
  chengxiu:{c:{H:"#5a2a4a",F:"#f5d8c8",E:"#1a0f2e",V:"#ffb8d8",B:"#e07aa8"},p:[
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
  /* 缇娜 · 次元精灵：紫衣星饰，头顶星芒 */
  tina:{c:{S:"#ffd23f",H:"#3a2a5a",F:"#f2d5b0",E:"#1a0f2e",B:"#6a3fa0",T:"#3df0ff",o:"#3df0ff"},p:[
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
    "............"]},
  /* 紫宸 · 故宫镇殿精灵：乌发金步摇，朱红宫装，琉璃绿袖缘（占位像素画） */
  gugong:{c:{H:"#1f1428",F:"#f2d5b0",E:"#1a0f2e",V:"#ffd23f",B:"#a83232",T:"#3df0a0",L:"#ffd23f"},p:[
    "....HHHH....",
    "...HHHHHH...",
    "..HHFFFFHH..",
    "..HFEFFEFH..",
    "..HFFFFFFH..",
    "..HVFFFFVH..",
    "...BBBBBB...",
    "..BBBBBBBB..",
    "..BTBBBBTB..",
    "..BBBBBBBB..",
    "...BB..BB...",
    "............"]}
};

const _cache={};

/* v74：旧 NPC id → 新 id（遗留存档/消息仍可能带旧 id）；v76 起事实源统一为 npc-registry.js LEGACY_NPCS */
const AV_ALIAS=(window.WDRegistry&&window.WDRegistry.legacyMap)?window.WDRegistry.legacyMap():{};

const WDAvatar={
  SPR,
  ALIAS:AV_ALIAS,
  /* NPC/玩家头像 dataURL（PNG，scale=每逻辑像素边长，默认 3 → 36×36）；结果按 key 缓存 */
  avatarURL(id,scale){
    const s=scale||3, key=id+"_"+s;
    if(_cache[key]) return _cache[key];
    const spr=SPR[id]||SPR[AV_ALIAS[id]]||SPR.yunting;
    const c=document.createElement("canvas"); c.width=12*s; c.height=12*s;
    const g=c.getContext("2d");
    spr.p.forEach((row,ry)=>{ for(let rx=0;rx<row.length;rx++){
      const col=spr.c[row[rx]]; if(!col) continue;
      g.fillStyle=col; g.fillRect(rx*s,ry*s,s,s);
    }});
    return _cache[key]=c.toDataURL();
  },
  ids(){ return Object.keys(SPR); }
};
window.WDAvatar=WDAvatar;
})();
