/* ==========================================================================
   wd-cfg.js —— 问道之旅 · 配置中心（WDCfg）
   职责：NPC/用户头像（校验+居中裁剪+压缩）、称呼偏好+历史、自称/自我描述、
        NPC 语气·风格·深度分析、角色初始属性分配、JSON 导入导出、修改历史。
   低耦合：不引用页面全局；加载即校验拒收异常；变更发 wd:cfg 事件实时生效。
   存储域：wdzx.cfg.v1（schema 版本化）。
   ========================================================================== */
(function(){
"use strict";
const KEY="wdzx.cfg.v1", VER=1;
const MAX_BYTES=5*1024*1024, MIN_SIDE=200, OUT=240, QUALITY=0.86;
const PRESET_ADDR=["道友","少侠","上仙","掌门"];
const PRESET_SELF=["我","在下","本座","贫道"];
const ATTR_BUDGET=12, ATTR_MIN=1;

let cfg=null;
/* v58：图片解码超时——个别浏览器/WebView 对特定格式（HEIC 伪装、损坏图）会出现
   img 既不 onload 也不 onerror 的永久挂起，导致界面一直停在“处理中…” */
const DECODE_TIMEOUT=30000;

function defaults(){
  return {ver:VER, npcAvatar:{}, userAvatar:null, npcPortrait:{}, cgImages:{}, itemIcons:{},
    address:"", addressHist:[], selfName:"", bio:"",
    style:{tone:"",humor:"",depth:""},
    attr:{str:2,agi:2,int:2}, hist:[], rejected:0,
    npcNames:{}, npcTitles:{}, npcPersonas:{}, customWorldBrief:"",
    aiDocument:"", directorDoc:""};
}
function sanitize(recount){
  if(!cfg.npcAvatar||typeof cfg.npcAvatar!=="object"){ if(recount&&cfg.npcAvatar!==undefined)cfg.rejected++; cfg.npcAvatar={}; }
  if(!cfg.npcPortrait||typeof cfg.npcPortrait!=="object"){ if(recount&&cfg.npcPortrait!==undefined)cfg.rejected++; cfg.npcPortrait={}; }
  if(!cfg.cgImages||typeof cfg.cgImages!=="object"){ if(recount&&cfg.cgImages!==undefined)cfg.rejected++; cfg.cgImages={}; }
  if(!cfg.itemIcons||typeof cfg.itemIcons!=="object"){ if(recount&&cfg.itemIcons!==undefined)cfg.rejected++; cfg.itemIcons={}; }
  if(!Array.isArray(cfg.addressHist)){ if(recount)cfg.rejected++; cfg.addressHist=[]; }
  if(!cfg.style||typeof cfg.style!=="object"){ if(recount&&cfg.style!==undefined)cfg.rejected++; cfg.style={tone:"",humor:"",depth:""}; }
  if(!cfg.attr||typeof cfg.attr!=="object"){ if(recount&&cfg.attr!==undefined)cfg.rejected++; cfg.attr={str:2,agi:2,int:2}; }
  ["str","agi","int"].forEach(k=>{ if(typeof cfg.attr[k]!=="number"||!(cfg.attr[k]>=0)){ if(recount)cfg.rejected++; cfg.attr[k]=2; } });
  if(!Array.isArray(cfg.hist)){ if(recount)cfg.rejected++; cfg.hist=[]; }
  if(typeof cfg.address!=="string")cfg.address="";
  if(typeof cfg.selfName!=="string")cfg.selfName="";
  if(typeof cfg.bio!=="string")cfg.bio="";
  if(!cfg.npcNames||typeof cfg.npcNames!=="object"){ if(recount&&cfg.npcNames!==undefined)cfg.rejected++; cfg.npcNames={}; }
  if(!cfg.npcTitles||typeof cfg.npcTitles!=="object"){ if(recount&&cfg.npcTitles!==undefined)cfg.rejected++; cfg.npcTitles={}; }
  if(!cfg.npcPersonas||typeof cfg.npcPersonas!=="object"){ if(recount&&cfg.npcPersonas!==undefined)cfg.rejected++; cfg.npcPersonas={}; }
  if(typeof cfg.customWorldBrief!=="string")cfg.customWorldBrief="";
  if(typeof cfg.aiDocument!=="string")cfg.aiDocument="";
  if(typeof cfg.directorDoc!=="string")cfg.directorDoc="";
}
/* v58：配额失败必须上抛——旧实现 try/catch 静默吞错，会导致“提示上传成功但刷新后立绘丢失” */
function save(){ localStorage.setItem(KEY,JSON.stringify(cfg)); }
/* v58g：导出保留 alpha 的 dataURL——JPEG 不支持透明，透明 PNG 经 JPEG 编码后
   四周会被压成纯黑（立绘黑底事故根因）。优先 WebP（带透明且体积小），
   不支持时回退 PNG；质量参数仅 WebP 生效。 */
function toAlphaDataURL(canvas,quality){
  let url="";
  try{
    url=canvas.toDataURL("image/webp",quality||0.9);
    if(url&&url.indexOf("data:image/webp")===0) return url;
  }catch(e){}
  return canvas.toDataURL("image/png");
}
function emit(keys){ try{ window.dispatchEvent(new CustomEvent("wd:cfg",{detail:{keys:keys||[]}})); }catch(e){} }
function summ(v){ const s=typeof v==="string"?v:JSON.stringify(v); return s==null?"":String(s).slice(0,40); }
function histPush(k,from,to,reason){
  cfg.hist.unshift({t:new Date().toISOString(),k:k,from:summ(from),to:summ(to),r:reason||""});
  if(cfg.hist.length>60)cfg.hist.length=60;
}
/* NPC 听音辨调：依据自我描述关键词推断 语气/风格/深度 */
function analyzeBio(text){
  const t=String(text||""), sc={formal:0,casual:0,humor:0,serious:0,deep:0,basic:0};
  (t.match(/您|请|贵|敬|职业|备考|考试|证书|上岸|规范/g)||[]).forEach(()=>sc.formal++);
  (t.match(/哈|嘿|玩|梗|乐|嗨|呀|啦|嘛/g)||[]).forEach(()=>sc.casual++);
  (t.match(/幽默|段子|搞笑|有趣|逗|乐子/g)||[]).forEach(()=>sc.humor++);
  (t.match(/严谨|认真|冲刺|努力|自律|踏实|稳/g)||[]).forEach(()=>sc.serious++);
  (t.match(/原理|深入|进阶|逻辑|为什么|本质|体系|溯源/g)||[]).forEach(()=>sc.deep++);
  (t.match(/入门|基础|小白|新手|简单|先会|口诀/g)||[]).forEach(()=>sc.basic++);
  const pick=(a,b,ka,kb)=>{ if(sc[ka]===0&&sc[kb]===0)return""; return sc[ka]>=sc[kb]?a:b; };
  return {tone:pick("formal","casual","formal","casual"),
          humor:pick("humor","serious","humor","serious"),
          depth:pick("deep","basic","deep","basic")};
}
/* v58b 统一读图：校验 → FileReader 读成 data: URL → Image 解码（全程 30s 超时）。
   不用 URL.createObjectURL(blob:)——老 WebKit/WKWebView 中 file input 分离或照片处于
   安全作用域/iCloud 占位时，blob: URL 解码会永久挂起（按钮一直“处理中”）；
   data: URL 数据内联、无生命周期绑定，兼容性最稳。onStage(s) 回报 read/decode 阶段。 */
function loadImageFile(file,opt){
  opt=opt||{};
  return new Promise((res,rej)=>{
    if(!file) return rej(new Error("E_CFG_NOFILE"));
    if(!/image\/(png|jpe?g)/.test(file.type)) return rej(new Error("E_CFG_TYPE"));
    if(file.size>MAX_BYTES) return rej(new Error("E_CFG_SIZE"));
    const stage=opt.onStage||function(){};
    let timer=setTimeout(failTimeout,DECODE_TIMEOUT);
    function failTimeout(){ try{console.warn("[立绘上传] 读取/解码超时",file.name,file.type,file.size);}catch(e){} rej(new Error("E_CFG_DECODE_TIMEOUT")); }
    function done(fn){ clearTimeout(timer); fn(); }
    stage("read");
    const fr=new FileReader();
    fr.onerror=()=>done(()=>rej(new Error("E_CFG_READ")));
    fr.onload=()=>{
      stage("decode");
      const img=new Image();
      img.onload=()=>done(()=>res(img));
      img.onerror=()=>done(()=>rej(new Error("E_CFG_DECODE")));
      img.src=String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}
/* 图片管线：JPG/PNG ≤5MB、≥200px → 居中裁剪+缩放(默认240px JPEG) → dataURL（重编码抹除 EXIF/GPS）
   zoom: 裁剪缩放系数(1=cover)——配置中心的简易裁剪。失败 reject Error(E_CFG_*) */
function processImageFile(file,opt){
  opt=opt||{};
  return loadImageFile(file,opt).then(img=>{
    const side=Math.min(img.naturalWidth,img.naturalHeight);
    const minSide=opt.minSide||MIN_SIDE;
    if(side<minSide) throw new Error("E_CFG_SMALL");
    const out=opt.size||OUT, zoom=Math.max(1,Math.min(3,opt.zoom||1));
    const cv=document.createElement("canvas"); cv.width=out; cv.height=out;
    const g=cv.getContext("2d");
    const k=(out/side)*zoom, w=img.naturalWidth*k, h=img.naturalHeight*k;
    g.imageSmoothingEnabled=true;
    g.drawImage(img,(out-w)/2,(out-h)/2,w,h);
    const url2=toAlphaDataURL(cv,QUALITY);
    return {url:url2, w:img.naturalWidth, h:img.naturalHeight, kb:Math.round(url2.length/1024)};
  });
}
/* 立绘管线：JPG/PNG ≤5MB、≥200px → 等比缩放到高≤900px（不裁剪，保全身构图）→ dataURL（重编码抹除 EXIF） */
function processPortraitFile(file,opt){
  opt=opt||{};
  return loadImageFile(file,opt).then(img=>{
    const w0=img.naturalWidth, h0=img.naturalHeight;
    const minSide=opt.minSide||MIN_SIDE;
    if(Math.min(w0,h0)<minSide) throw new Error("E_CFG_SMALL");
    const maxH=opt.maxH||900, maxW=opt.maxW||720;
    const k=Math.min(1, maxH/h0, maxW/w0), w=Math.round(w0*k), h=Math.round(h0*k);
    const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
    const g=cv.getContext("2d"); g.imageSmoothingEnabled=true;
    g.drawImage(img,0,0,w,h);
    const url2=toAlphaDataURL(cv,0.85);
    return {url:url2, w:w0, h:h0, kb:Math.round(url2.length/1024)};
  });
}
function load(){
  try{
    const r=localStorage.getItem(KEY);
    if(r){ const o=JSON.parse(r);
      if(o&&o.ver===VER){ cfg=Object.assign(defaults(),o); sanitize(true); return; }
    }
  }catch(e){}
  cfg=defaults();
}
const WDCfg={
  init(){ load(); },
  /* 同步快照（对话 prompt 每次调用时读取，<1ms） */
  ready(){ return cfg?{address:cfg.address,selfName:cfg.selfName,bio:cfg.bio,style:cfg.style,attr:cfg.attr}:null; },
  all(){ return cfg; },
  get(path){ return path.split(".").reduce((o,x)=>o&&o[x],cfg); },
  set(path,val,reason){
    /* v58：先留整态快照——save() 若因 localStorage 配额等失败，整体回滚并抛出 E_CFG_QUOTA，
       杜绝“提示上传成功，重载后立绘/头像消失”的内存态/落盘态背离。 */
    const bak=JSON.stringify(cfg);
    const keys=path.split("."), last=keys.pop();
    let o=cfg; keys.forEach(x=>{ o=o[x]=o[x]||{}; });
    const from=o[last];
    if(path==="address"&&val&&cfg.address&&val!==cfg.address&&cfg.addressHist.indexOf(cfg.address)<0){
      cfg.addressHist.unshift(cfg.address); if(cfg.addressHist.length>8)cfg.addressHist.length=8;
    }
    o[last]=val;
    histPush(path,from,val,reason);
    try{ save(); }
    catch(e){ cfg=JSON.parse(bak); throw new Error("E_CFG_QUOTA"); }
    emit([path]);
  },
  addressPresets:PRESET_ADDR,
  selfPresets:PRESET_SELF,
  analyzeBio:analyzeBio,
  attrBudget(){ return ATTR_BUDGET; },
  attrMin(){ return ATTR_MIN; },
  attrSum(){ const a=cfg.attr; return a.str+a.agi+a.int; },
  /* 属性派生上限（预览与状态栏共用） */
  attrCaps(){ const a=cfg.attr; return {hp:80+a.str*4, energy:20+a.agi*2, xpBonus:a.int*3}; },
  avatarURL(id){ return id==="_player"?(cfg.userAvatar||null):(cfg.npcAvatar[id]||null); },
  setAvatar(id,file,zoom,onStage){
    const self=this;
    return processImageFile(file,{zoom:zoom||1,onStage:onStage}).then(r=>{
      if(id==="_player") self.set("userAvatar",r.url,"我的头像");
      else self.set("npcAvatar."+id,r.url,"NPC头像");
      return r;
    });
  },
  clearAvatar(id){ if(id==="_player") this.set("userAvatar",null,"移除我的头像"); else this.set("npcAvatar."+id,null,"移除NPC头像"); },
  /* NPC 立绘：等比缩放不裁剪（保全身构图），用于任务对话页左侧立绘位 */
  portraitURL(id){ return cfg.npcPortrait[id]||null; },
  setPortrait(id,file,onStage){
    const self=this;
    return processPortraitFile(file,{onStage:onStage}).then(r=>{ self.set("npcPortrait."+id,r.url,"NPC立绘"); return r; });
  },
  clearPortrait(id){ this.set("npcPortrait."+id,null,"移除NPC立绘"); },
  /* v59：剧情 CG 图（等比缩放，宽≤1280）——忆境/过场展示用，id=cg 键 */
  cgImageURL(id){ return cfg.cgImages[id]||null; },
  setCGImage(id,file,onStage){
    const self=this;
    return processPortraitFile(file,{onStage:onStage,maxW:1280,maxH:900}).then(r=>{ self.set("cgImages."+id,r.url,"剧情CG"); return r; });
  },
  clearCGImage(id){ this.set("cgImages."+id,null,"移除剧情CG"); },
  /* v59：道具图标（方形裁剪 128px）——集市网格用 */
  itemIconURL(id){ return cfg.itemIcons[id]||null; },
  setItemIcon(id,file,onStage){
    const self=this;
    return processImageFile(file,{zoom:1,onStage:onStage,size:128,minSide:64}).then(r=>{ self.set("itemIcons."+id,r.url,"道具图标"); return r; });
  },
  clearItemIcon(id){ this.set("itemIcons."+id,null,"移除道具图标"); },
  /* NPC 名字/人设自定义：用户可覆写 NPC 名称并提供基准描述供 AI 生成角色设定 */
  npcName(id,original){ return (cfg.npcNames&&cfg.npcNames[id])||original||""; },
  npcTitle(id,original){ return (cfg.npcTitles&&cfg.npcTitles[id])||original||""; },
  npcPersona(id){ return (cfg.npcPersonas&&cfg.npcPersonas[id])||""; },
  setNpcName(id,name){ this.set("npcNames."+id,(name||"").slice(0,12),"NPC改名"); },
  setNpcTitle(id,title){ this.set("npcTitles."+id,(title||"").slice(0,16),"NPC改称号"); },
  setNpcPersona(id,desc){ this.set("npcPersonas."+id,(desc||"").slice(0,300),"NPC人设描述"); },
  /* 游戏背景信息用户自定义：DeepSeek 对话的 worldBrief 可被用户直接编辑覆写 */
  customWorldBrief(){ return cfg.customWorldBrief||""; },
  setWorldBrief(text){ this.set("customWorldBrief",(text||"").slice(0,8000),"编辑游戏背景信息"); },
  /* AI 接口文档用户自定义：完整覆写 sysPrompt 的约束条款（行为边界/语气/自主权/回复结构/语言要求等）。
     留空 → 使用系统默认约束；非空 → 完全替代默认约束段，AI 以用户文档为准。
     这是统一 AI 互动思路的唯一编辑入口。 */
  aiDocument(){ return cfg.aiDocument||""; },
  setAiDocument(text){ this.set("aiDocument",(text||"").slice(0,12000),"编辑AI接口文档"); },
  /* 导演工作标准用户自定义：非空时完全替代 directorPlan 的默认系统 prompt。
     留空 → 使用系统默认导演标准；非空 → 用户的工作标准为准。 */
  directorDoc(){ return cfg.directorDoc||""; },
  setDirectorDoc(text){ this.set("directorDoc",(text||"").slice(0,8000),"编辑导演工作标准"); },
  export(){
    return JSON.stringify({ver:VER, exportedAt:new Date().toISOString(), cfg:cfg},null,1);
  },
  import(text){
    let o; try{ o=JSON.parse(text); }catch(e){ throw new Error("E_CFG_JSON"); }
    const c=o&&(o.cfg||o);
    if(!c||typeof c!=="object") throw new Error("E_CFG_SHAPE");
    const bak=JSON.stringify(cfg);
    cfg=Object.assign(defaults(),c); cfg.ver=VER; sanitize(true);
    try{ save(); }catch(e){ cfg=JSON.parse(bak); throw new Error("E_CFG_QUOTA"); }
    emit(["*"]); return true;
  },
  _testGet:()=>cfg
};
window.WDCfg=WDCfg;
})();
