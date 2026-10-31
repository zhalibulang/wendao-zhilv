/* ============================================================
   wd-v25.js —— 问道之旅·25日版 核心扩展
   ------------------------------------------------------------
   本文件承载 v25 全部新增逻辑，index.html 只做最小挂载。
   依赖 index.html 既有全局：st / save / D / dsChat / DS_PROFILES /
   AI_CHANNELS / AI_CHANNEL_BY_ID / toast / TASK_UNITS25。
   ------------------------------------------------------------
   目录：
   [0] 全局小工具与状态
   [1] 模型分档（高价 R1 / 低价 flash）与通路注册
   [2] 口译 AI 出题 aiGenInterp25（+ 本地模拟 mockInterp25）
   [3] 笔试 AI 出题·细致讲解 aiGenQuiz25（+ 本地模拟 mockQuiz25）
   ============================================================ */
(function(){
"use strict";
/* 本文件在 index.html 内联主脚本之前加载，必须等 load 后再触碰
   st / DS_PROFILES / AI_CHANNELS 等全局，故整体放入 init 延迟执行 */
function init(){
/* v109：CSV 文本库回灌——csv/*.csv 改完跑 `node tools/csv-import.mjs` 生成 csv-overrides.js，
   这里的覆盖值优先于 game-data 里的原文（游戏内「修订模式」存的本机改动再优先于 CSV）。 */
function _cntWords(s){ return (String(s||"").match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g)||[]).length; }
function _applyCsvOverrides(){
  const O=window.WD_CSV; if(!O||typeof O!=="object") return;
  let nOral=0, nPt=0;
  /* v113：整节覆盖（oralSec）——改文/改小标题小注/删段/加段 都走这里。
     v117：本机修订不再无脑清空，而是按时间戳裁决（CSV 导入时间 O.stamp）：
       · 修订早于 CSV → 删掉，保证改了 CSV 就立刻生效
       · 修订晚于 CSV → 保留，并把它的富文本贴回新段落（加粗/字色等样式不再丢） */
  const _plainOf=h=>{ try{ const t=(typeof _htmlToText==="function")?_htmlToText(String(h||"")):String(h||"").replace(/<[^>]*>/g," "); return t.replace(/\s+/g," ").trim(); }catch(e){ return String(h||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim(); } };
  const _rebuildSec=(sec)=>{
    sec.text=sec.paragraphs.map(x=>x.text||"").join("\n\n");
    const sents=[]; sec.paragraphs.forEach((pp,i)=>_oralSplitSent(pp.text||"").forEach(t=>sents.push({n:sents.length+1,text:t,pi:i})));
    sec.sentences=sents; sec.sents=sents.length; sec.words=_cntWords(sec.text);
  };
  const ovAt=+O.stamp||0;
  const _reconcileLocal=(aid,si,paras)=>{
    try{
      if(!st||!st.edits) return;
      const base="fullp:"+aid+":"+si+":", whole="full:"+aid+":"+si, whole2="fullsec:"+aid+":"+si;
      Object.keys(st.edits).forEach(k=>{
        const arr=st.edits[k]||[]; const rawAt=(arr[0]||{}).at;
        /* 修订时间是 ISO 字符串；兼容历史/数字时间戳，解析不出就按 0 处理 */
        const at=typeof rawAt==="number"?rawAt:(Date.parse(rawAt||"")||0);
        if(k===whole){ if(at&&ovAt&&at<ovAt) delete st.edits[k]; return; }
        if(k===whole2){
          /* 只在能确定「修订确实早于 CSV」时才删。以前写成 `!at||!ovAt||at<ovAt`，
             at 解析失败(0) 就把整片修订删掉——用户保存的稿子刷新一次就消失，代价太大。
             宁可多留一份（最坏是 CSV 改动没立刻压过它），也不能误删。 */
          if(at&&ovAt&&at<ovAt) delete st.edits[k];
          return;
        }
        if(k.indexOf(base)!==0) return;
        const pi=+k.slice(base.length), p=paras[pi];
        const et=String((arr[0]||{}).text||"");
        if(!et){ delete st.edits[k]; return; }
        /* 措辞与 CSV 一致 → 这条修订只是加了样式，保留（跨导入也不丢富文本）；
           措辞变了且修订早于 CSV → CSV 赢，删掉旧修订 */
        const same = !!(p && _plainOf(et)===String(p.text||"").replace(/\s+/g," ").trim());
        if(same) return;
        if(at&&ovAt&&at<ovAt) delete st.edits[k];
      });
    }catch(e){}
  };
  /* 把「措辞与 CSV 相同、只是带样式」的修订贴回段落，恢复富文本 */
  const _restoreRich=(aid,si,paras)=>{
    try{
      if(!st||!st.edits) return;
      const base="fullp:"+aid+":"+si+":";
      Object.keys(st.edits).forEach(k=>{
        if(k.indexOf(base)!==0) return;
        const pi=+k.slice(base.length), p=paras[pi]; if(!p) return;
        const et=String(((st.edits[k]||[])[0]||{}).text||""); if(!et) return;
        if(/<[a-z][\s\S]*?>/i.test(et)&&_plainOf(et)===String(p.text||"").replace(/\s+/g," ").trim()) p.text=et;
      });
    }catch(e){}
  };
  if(O.oralSec){
    Object.keys(O.oralSec).forEach(k=>{
      const a=k.split("|"), aid=a[0], si=+a[1];
      const o=(D.oralFull||[]).find(x=>x.id===aid); if(!o) return;
      const sec=(o.sections||[])[si]; if(!sec) return;
      const list=O.oralSec[k]; if(!Array.isArray(list)||!list.length) return;
      sec.paragraphs=list.map((p,i)=>({ n:i+1, text:String(p.text||""), head:String(p.head||""), note:String(p.note||"") }));
      _reconcileLocal(aid,si,sec.paragraphs); _restoreRich(aid,si,sec.paragraphs);
      _rebuildSec(sec); nOral++;
    });
  }
  if(O.oral){
    Object.keys(O.oral).forEach(k=>{
      const a=k.split("|"), aid=a[0], si=+a[1], pi=+a[2];
      const o=(D.oralFull||[]).find(x=>x.id===aid); if(!o) return;
      const sec=(o.sections||[])[si]; if(!sec) return;
      const txt=String(O.oral[k]||"").trim(); if(!txt) return;
      if(!Array.isArray(sec.paragraphs)||!sec.paragraphs.length) sec.paragraphs=[{n:1,text:sec.text||"",head:sec.h||""}];
      const p=sec.paragraphs[pi]; if(!p||(p.text||"")===txt) return;
      p.text=txt; nOral++;
      sec.text=sec.paragraphs.map(x=>x.text||"").join("\n\n");
      const sents=[]; sec.paragraphs.forEach((pp,i)=>_oralSplitSent(pp.text||"").forEach(t=>sents.push({n:sents.length+1,text:t,pi:i})));
      sec.sentences=sents; sec.sents=sents.length; sec.words=_cntWords(sec.text);
    });
  }
  if(O.points){
    const lib=D.pointsLib||[];
    Object.keys(O.points).forEach(id=>{
      const p=lib.find(x=>x.id===id); const n=O.points[id]; if(!p||!n) return;
      if(n.text!=null) p.text=n.text;
      if(n.title!=null) p.title=n.title;
      if(n.module!=null) p.module=n.module;
      if(n.anchor!=null) p.anchor=n.anchor;
      if(n.exam_tip!=null) p.exam_tip=n.exam_tip;
      if(n.star!=null) p.star=n.star;
      nPt++;
    });
  }
  if(O.oralLib){
    const lib=D.oralLib||[];
    Object.keys(O.oralLib).forEach(id=>{
      const x=lib.find(v=>v.id===id), n=O.oralLib[id]; if(!x||!n) return;
      if(n.topic!=null) x.topic=n.topic;
      if(n.en!=null) x.en=n.en;
      if(n.zh!=null) x.zh=n.zh;
    });
  }
  if(O.bank&&(O.bank.vocab||O.bank.numbers||O.bank.methods)){
    window.INTERP_BANK={ vocab:O.bank.vocab||[], numbers:O.bank.numbers||[], methods:O.bank.methods||[] };
  }
  if(nOral||nPt) try{ console.log("[WD_CSV] 已回灌：导游词节/段 "+nOral+" · 考点 "+nPt); save(); }catch(e){}
}
try{ _applyCsvOverrides(); }catch(e){ console.warn("[WD_CSV]",e); }
/* v109：导游词官方原文快照——「回退本节改动」用它还原运行库（本会话保存过的修订会就地改库，必须留底） */
try{ if(!window.__wdOralOrig) window.__wdOralOrig=JSON.parse(JSON.stringify((D&&D.oralFull)||[])); }catch(e){}

/* ==================== [0] 全局小工具与状态 ==================== */
function v25st(){
  if(!st.v25||typeof st.v25!=="object"){
    st.v25={ startDate:null, plan:null, dailyOv:{},
      interpBank:[],      /* AI 口译题库：{sig,dir,src,ref,points,tip,from,day} */
      quizCache:{},       /* 单元 id → 已出笔试题 */
      qzVer:0,            /* 出题提示词版本：改提示词 +1 触发旧题缓存作废重生成 */
      _planVer:0,          /* 排期算法版本：与 PLAN_VER 不符即清当日/未来日排期缓存 */
      cards:{ added:[], edited:{}, deleted:[], completed:[] },  /* 藏经阁用户卡片改动；completed=已随单元学完的用户卡 */
      settings:{ tier:"auto" } }; /* tier: auto|r1|flash（展示用，职责分工固定） */
  }
  return st.v25;
}
function _sig(s){ /* 题目去重签名：归一化后取前 40 字符 */
  let h=0; const t=String(s||"").replace(/\s+/g,"").toLowerCase().slice(0,40);
  for(let i=0;i<t.length;i++){ h=((h<<5)-h+t.charCodeAt(i))|0; }
  return "s"+Math.abs(h).toString(36);
}
/* ==================== 全局科目配色（侧栏卡片/主区聚焦卡/chips/掌握度条统一用色） ==================== */
const SUBJ_COLORS={
  "科目一":"#e05d6b",  /* 政策法规 · 绯红 */
  "科目二":"#e0913d",  /* 导游业务 · 暖橙 */
  "科目三":"#4aa96c",  /* 全国知识 · 松绿 */
  "科目四":"#3a9bbd",  /* 北京知识 · 湖青 */
  "科目五":"#9d7bd8",  /* 导游服务能力 · 堇紫 */
  "S1":"#e05d6b","S2":"#e0913d","S3":"#4aa96c","S4":"#3a9bbd","S5":"#9d7bd8",
  "trans":"#d87093"    /* 传译语料 · 粉 */
};
function subjColor(subj){ /* 支持全名/S 代码/单元对象；未知回落暖灰 */
  if(!subj) return "#8a8078";
  if(SUBJ_COLORS[subj]) return SUBJ_COLORS[subj];
  const s=String(subj);
  const m=s.match(/科目([一二三四五])/);
  if(m) return SUBJ_COLORS["科目"+m[1]];
  const c=s.match(/S([1-5])/); if(c) return SUBJ_COLORS["S"+c[1]];
  if(/口译|传译/.test(s)) return SUBJ_COLORS.trans;
  return "#8a8078";
}
function _jsonFrom(raw){ /* 宽松 JSON 提取（与 genQuizBank 同款兜底） */
  try{ return JSON.parse(String(raw).replace(/^```json\s*|```$/g,"").trim()); }
  catch(e){ const m=String(raw).match(/\{[\s\S]*\}/); if(m) return JSON.parse(m[0]); throw e; }
}

/* ==================== [1] 模型分档与通路注册 ==================== */
/* 两档调用模式（设置页展示真源）：
   - R1 档（高价 deepseek-reasoner）：仅 25 日全局规划，整个周期 1~2 次
   - flash 档（低价 deepseek-chat）：每日调整 + 全部出题/评测/讲解，高频但单价低 */
const V25_TIERS={
  r1:   { label:"R1 长期规划档", model:"deepseek-reasoner", price:"高价", use:"25 日全局任务规划（每周期≤2次）" },
  flash:{ label:"flash 日常档",  model:"deepseek-chat",     price:"低价", use:"每日微调 / 出题 / 评测 / 讲解（高频）" }
};
/* DS_PROFILES / AI_CHANNELS 定义于 index.html 内联脚本（加载晚于本文件）：
   立即尝试合并；未就绪则在 load 后补合并一次。裸引用会让 init 抛错、引擎永不挂载。 */
(function aiTiersMerge(){
  const prof={
    plan25:   { model:"deepseek-reasoner", max_tokens:16000 },                     /* reasoner 不支持 temperature/response_format；16000 给思考过程留足空间，避免正文被 reasoning 挤空 */
    planDaily:{ temperature:0.4, max_tokens:2000, response_format:{type:"json_object"} },
    interpGen:{ temperature:0.85, max_tokens:3000, response_format:{type:"json_object"} },
    quizgen25:{ temperature:0.7, max_tokens:8000, response_format:{type:"json_object"} }
  };
  const chans=[
    { id:"plan25",    label:"25日全局规划（R1 高价）",  model:"deepseek-reasoner", prof:"plan25",    where:"aiPlan25 @wd-v25.js",     trig:"首次进入 1 次；进度大偏差时重算", fb:"按默认节奏：前14日每日约4新+复习（加重），后11日复习递增" },
    { id:"planDaily", label:"每日任务微调（flash 低价）",model:"deepseek-chat",     prof:"planDaily", where:"aiPlanDaily25 @wd-v25.js", trig:"每日首次进入 1 次",               fb:"沿用 R1 骨架不调整" },
    { id:"interpGen", label:"口译 AI 出题（flash 低价）",model:"deepseek-chat",     prof:"interpGen", where:"aiGenInterp25 @wd-v25.js", trig:"每个口译任务单元 1 次（4 题）",   fb:"种子卡模板变换（本地模拟题）" },
    { id:"quizgen25", label:"笔试 AI 出题·细解（flash）",model:"deepseek-chat",     prof:"quizgen25", where:"aiGenQuiz25 @wd-v25.js",   trig:"每个笔试任务单元 1 次",           fb:"锚点判断题（本地模拟题）" }
  ];
  function merge(){
    try{ if(typeof DS_PROFILES!=="undefined") Object.assign(DS_PROFILES,prof); }catch(e){}
    try{ if(typeof AI_CHANNELS!=="undefined"&&typeof AI_CHANNEL_BY_ID!=="undefined")
      chans.forEach(c=>{ if(!AI_CHANNEL_BY_ID[c.id]){ AI_CHANNELS.push(c); AI_CHANNEL_BY_ID[c.id]=c; } }); }catch(e){}
  }
  merge();
  if(document.readyState==="complete") setTimeout(merge,0);
  else window.addEventListener("load", merge);
})();

/* ==================== [2] 口译 AI 出题 ==================== */
/* 参考资产库：口译 = AI 查阅「术语 263 + 数字 60 + 方法 16」＋ 71 段示范篇章，据此每日出新题。
   71 示范卡已在任务单元里（保证全学过一遍）；其余靠 AI/本地模拟持续出新，不机械背题。 */
function _interpBank(){ return (window.INTERP_BANK||{vocab:[],numbers:[],methods:[]}); }
/* 口译种子卡 = pointsLib 里 module 含「口译」的卡（71 示范 + 旧 8 条 INT） */
function _interpSeeds(){
  return (D.pointsLib||[]).filter(p=>/口译/.test(p.module||""));
}
/* 种子卡源文/参考译文：优先显式字段（新卡带 direction/src/ref），回退 text 解析（旧 INT 无方向） */
function _seedSrcRef(p){
  if(p.src && p.ref){ const dir=p.direction==="e2c"?"e2c":"c2e"; return {dir, src:p.src, ref:p.ref}; }
  const lines=String(p.text||"").split("\n").filter(Boolean);
  const en=lines[0]||"", zh=(String(p.text).match(/【中文对照】(.+)/)||[])[1]||lines[1]||"";
  const dir=Math.random()<.5?"e2c":"c2e";
  return {dir, src:dir==="c2e"?zh:en, ref:dir==="c2e"?en:zh};
}
/* 轮换取专有名词 + 方法指导，供 AI 出题参照（保证题源不断、贴合考纲专名） */
let _bankCursor=0;
function _interpGuide(){
  const B=_interpBank();
  let guide="";
  try{ const m=(B.methods||[]).find(x=>/发音|流畅|完整|分值|评分/.test((x.t||"")+(x.zh||"")))||(B.methods||[])[0];
    if(m) guide=String(m.zh||"").slice(0,420); }catch(e){}
  const vocab=B.vocab||[];
  const properNouns=[];
  if(vocab.length){ const k=28; for(let i=0;i<k;i++){ const it=vocab[(_bankCursor+i)%vocab.length]; if(it) properNouns.push(it.en+(it.zh?"/"+it.zh:"")); } _bankCursor=(_bankCursor+k)%vocab.length; }
  return {guide, properNouns, B};
}
async function aiGenInterp25(n, opts){
  n=n||4; opts=opts||{};
  const v=v25st();
  const seeds=_interpSeeds();
  if(!seeds.length) throw new Error("无口译种子语料");
  const {guide, properNouns}=_interpGuide();
  const recent=new Set(v.interpBank.slice(-40).map(x=>x.sig));
  const samples=seeds.slice(0,5).map(p=>{ const s=_seedSrcRef(p); return (s.dir==="c2e"?s.src:s.ref).slice(0,80); }).filter(Boolean);
  const sys="你是北京导游资格考试科目五口试的口译出题专家。参照考纲要求的场景与给定术语库，出"+n+"道现场口译真题风的新题。\n"
    +"1. 方向均衡：中译英(c2e)与英译中(e2c)各半\n"
    +"2. 场景限定：北京景点讲解、导游服务规范、突发事件处理、传统文化与城市概况\n"
    +"3. 长度适中：英文句 25~70 词，中文句 40~90 字；信息密度高、适合现场口译\n"
    +"4. 专有名词优先采用给定词表（景点/机构/文化/餐饮/应急/服务类），可穿插数字读法\n"
    +"5. 每题给出参考译文、≥3 个采分点（关键词/结构）、一句备考提示\n"
    +"6. 题目两两不重复，且不得与示范原句雷同；只输出 JSON\n"
    +(guide?("考试结构与评分指导（参照其口径出题）：\n"+guide+"\n"):"");
  const user="示范风格（定风格，勿照抄）：\n"+samples.join("\n")
    +(properNouns.length?("\n专有名词词表（优先选用）："+properNouns.join("、")):"")
    +'\n输出 JSON：{"items":[{"dir":"c2e","src":"中文句","ref":"English reference","points":["采分点1","采分点2","采分点3"],"tip":"备考提示"}]}';
  const raw=await dsChat([{role:"system",content:sys},{role:"user",content:user}],{kind:"interpGen",ch:"interpGen"});
  const o=_jsonFrom(raw); const arr=Array.isArray(o)?o:(o.items||[]);
  const out=[];
  for(const z of arr){
    if(!z||!z.src||!z.ref) continue;
    const dir=z.dir==="e2c"?"e2c":"c2e";
    const sig=_sig(z.src);
    if(recent.has(sig)) continue;
    out.push({ sig, dir, src:String(z.src), ref:String(z.ref),
      points:Array.isArray(z.points)?z.points.map(String).slice(0,5):[],
      tip:String(z.tip||""), from:"ai", day:st.day||1 });
    recent.add(sig);
  }
  if(!out.length) throw new Error("AI 口译题全部被去重（重试即可）");
  v.interpBank.push(...out); save();
  return out;
}
/* 本地模拟（测试阶段/无密钥）：示范篇章换方向 + 术语/数字微题流转，题源大且不重样 */
function mockInterp25(n){
  n=n||4;
  const seeds=_interpSeeds();
  const B=_interpBank();
  const v=v25st(); const recent=new Set(v.interpBank.slice(-40).map(x=>x.sig));
  const out=[];
  const push=(dir,src,ref,tip)=>{ if(!src||!ref) return; const sig=_sig(src); if(recent.has(sig)) return;
    recent.add(sig); out.push({sig,dir,src,ref,points:["关键专有名词","数字/年代准确","句式完整通顺"],tip,from:"mock",day:st.day||1}); };
  for(const p of seeds){
    if(out.length>=n) break;
    const s=_seedSrcRef(p);
    push(s.dir, s.src, s.ref, "【模拟题】配置密钥后由 AI 参照资产库出新");
    if(out.length>=n) break;
    push(s.dir==="c2e"?"e2c":"c2e", s.ref, s.src, "【模拟题·反向】配置密钥后由 AI 出新");
  }
  for(const it of (B.vocab||[])){
    if(out.length>=n) break; const c2e=Math.random()<.5;
    push(c2e?"c2e":"e2c", c2e?it.zh:it.en, c2e?it.en:it.zh, "【术语口译】"+(it.note||("专有名·"+(it.cat||"术语"))));
  }
  for(const it of (B.numbers||[])){
    if(out.length>=n) break;
    push("c2e", it.zh, it.en, "【数字口译】"+(it.ctx||"").slice(0,40));
  }
  if(out.length){ v.interpBank.push(...out); save(); }
  return out;
}

/* ==================== [3] 笔试 AI 出题·细致讲解 ==================== */
/* 在既有 genQuizBank 骨架上强化讲解：每题 why 含考点回顾+逐项分析+记忆锚。 */
/* 分批出题：每批 ≤8 个考点（约 18 题）。整单元一次出 50+ 题会被 max_tokens 截断导致 JSON 解析
   失败、静默回落离线题（v25-56 前 quizgen25 通路断裂的根因）；分批后单批输出小而稳，且并行发起。
   部分批次失败保留成功批；全部失败才 throw（调用方回落本地题）。 */
async function aiGenQuiz25(pids, n){
  pids=(pids||[]).filter(pid=>(D.pointsLib||[]).some(p=>p.id===pid));
  if(!pids.length) throw new Error("本单元无考点可出");
  n=n||_quizTarget(pids.length);
  const PER=8, chunks=[];
  for(let i=0;i<pids.length;i+=PER) chunks.push(pids.slice(i,i+PER));
  const rs=await Promise.allSettled(chunks.map((ck,ci)=>_aiGenQuizBatch25(ck, Math.max(ck.length, Math.round(2.2*ck.length)))));
  const ok=[]; let fails=0;
  const seen=new Set();   /* 跨批去重（同题干可能在不同批出现） */
  rs.forEach(r=>{
    if(r.status!=="fulfilled"){ fails++; return; }
    for(const z of r.value){ const k=_sig(z.q); if(seen.has(k)) continue; seen.add(k); ok.push(z); }
  });
  if(!ok.length) throw new Error("AI出题全部批次失败"+(fails?("（"+fails+" 批）"):""));
  if(fails) console.warn("[v25] AI 出题 "+fails+"/"+chunks.length+" 批失败，本轮实得 "+ok.length+" 题（重进单元可补齐）");
  if(ok.length>n) ok.length=n;   /* 硬性截断：AI 可能超发（要求 53 给出 71），一律按 b=2.2a 上限收口 */
  return ok;
}
async function _aiGenQuizBatch25(pids, n){
  const knowledge=pids.map(pid=>{
    const p=D.pointsLib.find(x=>x.id===pid);
    return "【"+pid+"】"+p.title+"\n"+String(p.text||"")+(p.anchor?("\n记忆锚："+p.anchor):"")+(p.exam_tip?("\n命题指引："+p.exam_tip):"");
  }).join("\n");
  const sys="你是全国导游资格考试的资深命题专家，只以给定考点为素材命题，不超纲、不编造。\n"
    +"【命题核心】考『理解与对应关系』，不考死记口号；每道题都要有唯一确定的答案与区分度，像真实考场题。\n"
    +"【题型侧重】按真实笔试题型分布，以判断题(judge)、单选题(choice)、多选题(multi) 为主：\n"
    +"  · 判断题：针对考点中的具体事实（数字/主体/程序/定义）作正误设问；\n"
    +"  · 单选题：四个选项必须围绕同一考点同一条文，问『正确的一项』或『错误的一项』，严禁跨考点跨法条拼凑选项；\n"
    +"  · 多选题：2~3 个正确项，考查同一制度下的并列要点；\n"
    +"  · 填空题(blank)慎用：仅当答案是唯一确定的硬事实（具体数字、年代、专有名称）才可出，题干只挖一处、答案唯一；政治口号、会议纲领、套话一律不出填空；\n"
    +"  · 选错误项(wrongone)：3 个正确项 + 1 个篡改项，四项必须同属一个考点。\n"
    +"【硬性红线】① 选项互斥、正确集合唯一，禁止多个可认定正确；② 政治理论/政策类考点优先 judge/choice/multi；③ 同考点多题换角度换措辞，两两不重复；④ 数字、文件名、文号必须与考点原文一致；⑤ 禁止「以上各项均正确/均错误」这类元选项，四个选项必须是四句独立的实质陈述；⑥ 每个干扰项必须有合理迷惑性（概念近似、半对半错、数字微篡），禁止把另一思想/另一考点的专属定位原样搬来当干扰项（张冠李戴式一眼假）。\n"
    +"【细致讲解】每题 why 三段式（≤150字）：①考点回顾 ②逐项分析（每个非正确项点明错在哪/属哪考点）③记忆锚或口诀。\n"
    +"只输出 JSON。";
  const sample=[{kind:"choice",q:"关于《国务院办公厅关于进一步加强旅游市场综合监管的通知》（国办函〔2025〕95号），以下说法正确的是？",opts:["确立“属地管理、部门联动、各司其职、齐抓共管”原则，明确11个部门监管职责","该项监管工作由文化和旅游部独立完成","发文文号为国办发〔2016〕5号","自2026年1月1日起施行"],a:"确立“属地管理、部门联动、各司其职、齐抓共管”原则，明确11个部门监管职责",why:"①考点回顾：95号文综合监管原则与部门职责；②逐项分析：A符合原文；B错在“独立”——实为文旅部牵头、部门联动；C是已被95号取代的旧文号；D施行日期错误——印发之日起施行；③记忆锚：95号管市场。",pid:"S1-03-02"}];
  const user="待命题考点（标题+正文+记忆锚）：\n"+knowledge
    +'\n\n样题标杆（请出风格相同、内容不同的题）：\n'+JSON.stringify(sample)
    +'\n\n请输出 JSON：{"questions":['+n+'道题]}。每题字段：kind(judge/blank/choice/multi/wrongone)、q（blank 用____只挖一处）、'
    +'opts（choice/multi/wrongone 给4项完整陈述）、a（judge布尔；blank唯一答案字符串；choice正确项文本；wrongone错误项文本；multi正确项文本数组≥2）、'
    +'accept（仅blank，数组，含别名）、why（三段式细解）、pid（必须用给定考点id之一）。';
  const raw=await dsChat([{role:"system",content:sys},{role:"user",content:user}],{kind:"quizgen25",ch:"quizgen25"});
  const o=_jsonFrom(raw); const arr=Array.isArray(o)?o:(o.questions||[]);
  const pidSet=new Set(pids); const seen=new Set(); const out=[];
  for(const z of arr){
    if(!z||!z.kind||!z.q) continue;
    const k=_sig(z.q); if(seen.has(k)) continue; seen.add(k);
    if(!pidSet.has(z.pid)) z.pid=pids[0];
    z.why=String(z.why||("出处：考点 "+z.pid)).slice(0,240);
    out.push(z);
  }
  if(!out.length) throw new Error("AI出题格式异常");
  return out;
}
/* 本地模拟出题：复用旧版完整题型引擎（judge/blank/choice/multi/wrongone），
   2.2×n 全覆盖 + 同考点题型轮换 + 同模块干扰句，离线也全通 */
function _quizTarget(n){ return Math.max(n, Math.round(2.2*n)); }
function mockQuiz25(pids, n){
  pids=(pids||[]).filter(pid=>(D.pointsLib||[]).some(p=>p.id===pid));
  if(!pids.length) return [];
  n=n||_quizTarget(pids.length);
  const pool=pids.slice();
  const mods=new Set(pool.map(pid=>{const p=D.pointsLib.find(x=>x.id===pid); return p?p.module:"";}).filter(Boolean));
  const sentencePool=(D.pointsLib||[]).filter(p=>!pool.includes(p.id)&&p.module&&mods.has(p.module))
    .map(p=>{ const s=ptKeySentence(p); return s?{s,pid:p.id}:null; }).filter(Boolean);
  const FORMS=["judge","blank","choice","multi","wrongone"];
  const seen=new Set(), formsByPid={}, blankUsed={};
  const pickForm=pid=>{ const a=formsByPid[pid]||(formsByPid[pid]=FORMS.slice().sort(()=>Math.random()-.5)); return a.shift()||FORMS[Math.floor(Math.random()*FORMS.length)]; };
  const annotate=z=>{ if(!z) return z; const pt=D.pointsLib.find(p=>p.id===z.pid);
    z.why="【离线题】①考点回顾："+((pt&&pt.title)||z.pid)+"；②逐项分析：对照考点原文与正确项；③记忆锚："+((pt&&pt.anchor)||"通读本条三遍")+"。配置密钥后由 AI 出题并逐项辨析。";
    return z; };
  const make=(pid,form)=>{ const pt=D.pointsLib.find(x=>x.id===pid); if(!pt) return null;
    const kw=extractKeyWords(pt.text,pt.exam_tip,pt.anchor);
    /* 干扰项只从当前考点同 module 里捞，杜绝跨模块张冠李戴（单元可能横跨多个模块） */
    const myPool=sentencePool.filter(e=>{ const op=D.pointsLib.find(x=>x.id===e.pid); return op&&op.module===pt.module; });
    const z=genQuestion(form||pickForm(pid),pt,kw,pid,myPool,blankUsed[pid]||[]);
    if(z&&z.kind==="blank"&&z.a)(blankUsed[pid]=blankUsed[pid]||[]).push(z.a);
    return z?annotate(z):null; };
  const out=[];
  /* ① 全覆盖：每考点先 1 题 */
  for(const pid of pool){ const z=make(pid); if(z){ const k=quizNormKey(z); if(!seen.has(k)){ seen.add(k); out.push(z); } } }
  /* ② 加权补足到 2.5×n */
  let guard=0;
  while(out.length<n&&pool.length&&guard<n*12){ guard++;
    const pid=pool[Math.floor(Math.random()*pool.length)];
    const z=make(pid,pickForm(pid)); if(z){ const k=quizNormKey(z); if(!seen.has(k)){ seen.add(k); out.push(z); } } }
  return out;
}

/* 时政单元优先用静态题库（90 题）——时政事实时效性强，现成题比 AI 现编更稳 */
function shizhengQuiz(pids){
  const bank=(typeof window!=="undefined"?window.SHIZHENG_BANK:null)||[];
  const set=new Set(pids||[]);
  const arr=bank.filter(q=>set.has(q.pid));
  if(!arr.length) return mockQuiz25(pids);  /* 无静态题 → 回落本地模拟 */
  return arr.map(q=>{
    const t=String(q.type||"judge");
    const why=String(q.why||"");
    const pid=q.pid||(pids[0]||"");
    if(t==="judge"){
      const a=q.a===true||q.a==="true";
      return { kind:"judge", q:String(q.q)+"（判断正误）", a, pid, fact:a?String(q.q):"", why };
    }
    const opts=(Array.isArray(q.opts)?q.opts:[]).map(String);
    if(t==="multi"){
      const as=Array.isArray(q.a)?q.a.map(String):[String(q.a)];
      const aIdx=as.map(x=>opts.indexOf(x)).filter(i=>i>=0);
      return { kind:"multi", q:String(q.q), opts, aIdx, a:aIdx.map(i=>opts[i]), pid, why };
    }
    /* single → choice */
    let a=String(q.a); if(!opts.includes(a)) a=opts[0]||a;
    return { kind:"choice", q:String(q.q), opts, a, pid, why };
  });
}

/* ==================== 题单预热缓存（混合出题） ====================
   出题策略：本地引擎先出全量基座（judge/blank 模板题质量稳、全覆盖），AI 出约一半高质量
   choice/multi 混入，题干去重、洗牌后控制在 2.2a；所有仍带本地模板解析的题再批量走 AI
   重写三段式解析（quizwhy25 通路）——解析必须由 AI 生成，失败才保留本地模板 why。
   单元弹窗一打开就后台预热，进试炼零等待；重复进入直接吃 quizCache，绝不重复调 AI。
   _quizWarm：会话内存级在途 Promise 池（Promise 不可入存档）——同一单元并发请求自动合并为一次调用。 */
const _quizWarm={};
const _qOk=z=>!!z&&!!z.q&&String(z.q).length>=8&&((z.kind==="multi")?(Array.isArray(z.a)?z.a.length>0:!!z.a):!!z.a);
function warmQuiz25(u){
  if(!u||!u.items) return Promise.resolve([]);
  const v=v25st();
  if(v.qzVer!==3){ v.qzVer=3; v.quizCache={}; }   /* 出题提示词升级+超发截断修复 → 作废 v56 及更早的旧题缓存 */
  const cacheKey="u"+u.n;
  const cached=v.quizCache[cacheKey];
  /* 判定口径=全部题都是本地模板解析才算纯离线缓存（值得重出）；混合缓存（AI 题+部分 AI 解析）
     即使个别题解析回落了本地模板也直接复用——重出只会白白烧 token */
  const isMockCache=Array.isArray(cached)&&cached.length&&cached.every(z=>/【离线题】/.test((z&&z.why)||""));
  if(Array.isArray(cached)&&cached.length&&!(dsReady()&&isMockCache)) return Promise.resolve(cached);
  if(_quizWarm[cacheKey]) return _quizWarm[cacheKey];   /* 已在出题中 → 复用同一 Promise，不重复调 AI */
  const pids=u.items.map(x=>x.id).filter(id=>(D.pointsLib||[]).some(p=>p.id===id));
  if(!pids.length) return Promise.resolve([]);
  const isShizheng=pids.every(pid=>/^S1-02/.test(pid));
  const gen=(async()=>{
    /* 时政：静态题打底（时效事实现成题比 AI 现编稳），解析照样走 AI */
    if(isShizheng){
      const qs=shizhengQuiz(pids).filter(_qOk).slice(0, _quizTarget(pids.length));   /* 静态题同样按 2.2a 收口 */
      if(dsReady()&&qs.length){ try{ await aiWhy25(qs); }catch(e){ console.warn("[v25] 时政解析 AI 化失败，保留本地解析：",(e&&e.message)||e); } }
      return qs;
    }
    const local=mockQuiz25(pids).filter(_qOk);   /* 全量基座：全覆盖 + 同模块干扰句 */
    if(!dsReady()) return local.slice(0, _quizTarget(pids.length));   /* 离线：本地题即终态（同样按 2.2a 收口） */
    let ai=[];
    try{ ai=(await aiGenQuiz25(pids, Math.max(4, Math.round(pids.length*1.1)))).filter(_qOk); }
    catch(e){ console.warn("[v25] AI 出题失败，本单元全量本地题：",(e&&e.message)||e); }
    const aiSigs=new Set(ai.map(z=>_sig(z.q)));
    const merged=ai.concat(local.filter(z=>!aiSigs.has(_sig(z.q))));
    const final=merged.slice().sort(()=>Math.random()-.5).slice(0, _quizTarget(pids.length));  /* 洗牌混匀再截到 2.2a */
    if(final.length){ try{ await aiWhy25(final); }catch(e){ console.warn("[v25] 解析 AI 化失败，保留本地解析：",(e&&e.message)||e); } }
    return final;
  })();
  const p=gen.then(qs=>{
    v.quizCache[cacheKey]=qs; try{ save(); }catch(e){}
    delete _quizWarm[cacheKey];
    return qs;
  }).catch(e=>{ delete _quizWarm[cacheKey]; throw e; });
  _quizWarm[cacheKey]=p;
  return p;
}

/* ==================== 批量 AI 解析（quizwhy25） ====================
   把带本地模板解析（【离线题】）或无解析的题分批（≤12 题/批）发给 AI 重写三段式 why：
   ①考点回顾 ②逐项分析（错项点明错因） ③记忆锚。就地替换 z.why；失败保留本地 why。
   素材只带本批涉及的考点原文，输出 JSON {"answers":[{i,why}]}。 */
async function aiWhy25(qs){
  const need=(qs||[]).map((z,i)=>({z,i})).filter(e=>e.z&&(e.z.pid)&&(/【离线题】/.test((e.z.why)||"")||!(e.z.why&&String(e.z.why).length)));
  if(!need.length) return 0;
  const pidList=[...new Set(need.map(e=>e.z.pid))];
  const knowledge=pidList.map(pid=>{
    const p=(D.pointsLib||[]).find(x=>x.id===pid);
    return p?("【"+pid+"】"+p.title+"\n"+String(p.text||"")+(p.anchor?("\n记忆锚："+p.anchor):"")):("");
  }).filter(Boolean).join("\n");
  const groups=[];
  for(let i=0;i<need.length;i+=12) groups.push(need.slice(i,i+12));
  const rs=await Promise.allSettled(groups.map(g=>_aiWhyBatch25(g,knowledge)));
  let done=0; rs.forEach(r=>{ if(r.status==="fulfilled") done+=r.value; });
  return done;
}
function _aiWhyBatch25(group, knowledge){
  const sys="你是全国导游资格考试的资深讲师，负责给已出的题目写细致解析。每题 why 三段式（合计≤130字）：①考点回顾一句；②逐项分析——选择题/选错误项要给每个错误项点明错在哪（概念近似/数字篡改/张冠李戴等），判断题要指出关键表述错在哪，多选题说明漏选/多选项的坑，填空题说明该答案为何成立；③给一个记忆锚或口诀。解析必须与考点素材一致，不得编造。只输出 JSON。";
  const list=group.map((e,j)=>({i:j, kind:e.z.kind, q:String(e.z.q), opts:e.z.opts||undefined, a:e.z.a, pid:e.z.pid}));
  const user="考点素材：\n"+knowledge
    +'\n\n待解析题目（i=序号）：\n'+JSON.stringify(list)
    +'\n\n输出 JSON：{"answers":[{"i":0,"why":"三段式解析"},...]}，answers 必须覆盖每一道题，i 与题目序号一致。';
  return dsChat([{role:"system",content:sys},{role:"user",content:user}],{kind:"quizwhy25",ch:"quizwhy25"}).then(raw=>{
    const o=_jsonFrom(raw); const arr=Array.isArray(o)?o:((o&&o.answers)||[]);
    let ok=0;
    arr.forEach(x=>{
      const e=group[(x&&x.i)];
      if(e&&x&&x.why){ e.z.why=String(x.why).slice(0,240); ok++; }
    });
    if(!ok) throw new Error("解析返回为空");
    return ok;
  });
}

/* ==================== [4] 任务引擎：单元加载与分类 ==================== */
/* 单元 = planning/task-units.json 的运行时版（task-units.js → TASK_UNITS25）。
   笔试单元（科目一~四）整单元一次 AI 出题；科目五单元按卡片逐张推进，
   卡片级类型自动分流：口译 interp / 英文复述 oral / 中文复述 recite。 */
/* ==================== [4b] 用户卡片：注入语料 + 合并进任务单元 ==================== */
/* 藏经阁「新增卡片」落在 st.v25.cards.added（S 类=考点/口试卡进 pointsLib，
   oral=修诵句进 oralLib），出题/修诵/星盘即全通；deleted 为内置卡 uid 列表
   （"point:S1-01" 等），pointsLib 类同步从任务单元摘除。均运行时生效，不动数据文件。 */
function cardMins(c){
  const t=String(c.text||"");
  if(/科目五/.test(c.subject||"")){
    const words=(t.match(/[A-Za-z]+/g)||[]).length;
    if(words>=4) return Math.round((words/100+2.5)*10)/10;  /* 朗读100词/分+跟读+复述+自评 */
    return Math.round((t.replace(/\s/g,"").length/300+2)*10)/10; /* 默读300字/分+中文复述 */
  }
  return Math.round((t.replace(/\s/g,"").length/300+1.5)*10)/10; /* 默读+审题作答 */
}
/* 中文景点讲解卡（S5-01~S5-06，共 78 条「修诵句」要点卡）已确认废弃：以 oralFull 全文为唯一源。
   这里保留开关但不再删除库内数据——只从「任务排期」里剔除，藏经阁/复习仍可查阅。 */
const V25_DEPRECATE_ZH_TOUR = false;

/* 导游词改按「节」建任务：tools/build-oral.mjs 生成 ORAL:<aid>:<节> 单元（1 节 = 1 quest）。
   景点讲解闪卡（中文/英文）不再单独占任务单元，避免同一段内容被拆成几十张卡重复排期；
   卡片数据仍留在 pointsLib，供藏经阁与星盘复习查看。 */
const V25_TOUR_SECTION_MODE = true;
let _tourPidSet=null, _modMap=null, _modLen=-1;
function _cardIndex(){
  const lib=D.pointsLib||[];
  if(!_modMap||_modLen!==lib.length){
    _modMap=new Map(); _tourPidSet=new Set();
    lib.forEach(p=>{ _modMap.set(p.id,p.module||""); if(/景点讲解/.test(p.module||"")) _tourPidSet.add(p.id); });
    _modLen=lib.length;
  }
}
function _isTourPid(id){ _cardIndex(); return _tourPidSet.has(id); }
function _modOf(id){ _cardIndex(); return _modMap.get(id)||""; }
function _delPids(){ /* deleted(uid 列表) → pointsLib id 集合 */
  const v=v25st();
  const s=new Set(((v.cards&&v.cards.deleted)||[]).filter(u=>String(u).indexOf("point:")===0).map(u=>String(u).slice(6)));
  /* 静态废弃：备考方法论/元内容（教怎么学而非考点本身），不再作为考点进入排期与出题 */
  ["S1-02-01","S1-02-02","S1-02-03","S1-02-04"].forEach(id=>s.add(id));
  /* 阶段二开关：废弃中文景点讲解卡（不进入排期/背诵，英文闪卡成为唯一背诵卡） */
  if(V25_DEPRECATE_ZH_TOUR){
    (D.pointsLib||[]).forEach(p=>{ if(/^S5-0[1-6]-/.test(p.id||"")) s.add(p.id); });
  }
  return s;
}
function injectCards(){
  const v=v25st(); v.cards=v.cards||{added:[],edited:{},deleted:[]};
  const del=_delPids();
  const lib=D.pointsLib=D.pointsLib||[];
  (v.cards.added||[]).forEach(c=>{
    if(!c||!c.id||del.has(c.id)) return;
    if(c.cat==="oral"){
      D.oralLib=D.oralLib||[];
      if(!D.oralLib.some(x=>x.id===c.id)) D.oralLib.push({id:c.id, topic:c.module||"自录修诵句", en:c.text||"", zh:c.zh||""});
      return;
    }
    if(lib.some(p=>p.id===c.id)) return;
    lib.push({ id:c.id, title:c.title||c.id, subject:c.subject||"科目五 导游服务能力（现场考试）",
      module:c.module||"用户补充", text:c.text||"", anchor:c.anchor||"",
      context:"用户新增卡片", source:"藏经阁·用户新增", status:"✅", exam_tip:"", origin:"",
      version:"v25-user", collected:String(c.created||"").slice(0,10), star:String(c.star||"2"), anchor_type:"" });
  });
  if(del.size) D.pointsLib=lib.filter(p=>!del.has(p.id));
}
function allUnits(){
  const del=_delPids();
  const U=(window.TASK_UNITS25||[]).concat(window.TASK_UNITS25_EXT||[]).map(u=>({ n:u.n, subj:u.subj, mods:(u.mods||[]).slice(),
    items:(u.items||[]).filter(it=>!del.has(it.id)&&!(V25_TOUR_SECTION_MODE&&_isTourPid(it.id)))
      .map(it=>({ id:it.id, title:it.title, mins:it.mins,
        p0:it.p0, p1:it.p1, parts:it.parts, part:it.part,   /* 导游词节片：段落切片 + 子任务序号 */
        words:it.words, sents:it.sents, paras:it.paras })) }))
    .map(u=>{
      u.mins=Math.round(u.items.reduce((a,it)=>a+(+it.mins||0),0));
      /* 模块标签按「仍留在单元里的条目」重算：景点讲解闪卡被移出后，不能让卡片继续挂着「英文闪卡」名头 */
      const mm=[]; u.items.forEach(it=>{ const m=_modOf(it.id); if(m&&mm.indexOf(m)<0) mm.push(m); });
      if(mm.length) u.mods=mm;
      return u;
    })
    .filter(u=>u.items.length);
  /* 用户新增 S 类卡并入单元：同科目末单元装得下（≤35 分钟）就并进去，否则开新单元 */
  const v0=v25st();
  let maxN=U.reduce((a,u)=>Math.max(a,u.n),0);
  /* 新单元编号用峰值计数器（只升不降）：防止单元被删空后编号复用、顶撞 done 完成记录 */
  if(!v0.nextUnitN||v0.nextUnitN<=maxN) v0.nextUnitN=maxN+1;
  const skipC=new Set((v0.cards&&v0.cards.completed)||[]);
  const doneU=v0.done||{};
  ((v0.cards&&v0.cards.added)||[]).forEach(c=>{
    if(!c||!c.id||c.cat==="oral"||del.has(c.id)||skipC.has(c.id)) return;
    if(U.some(u=>u.items.some(x=>x.id===c.id))) return;
    const mins=cardMins(c), item={id:c.id, title:c.title||c.id, mins};
    /* ① 已固化单元号：直接回家（用户单元重建时补壳）。
       家若已完成，卡早已随 unitDone 进 completed 被跳过，故这里家必然未完成 */
    if(c.unit){
      let home=U.find(u=>u.n===c.unit);
      if(!home){ home={ n:c.unit, subj:c.subject||"科目五 导游服务能力（现场考试）", mods:[], mins:0, items:[] }; U.push(home); }
      home.items.push(item); home.mins=Math.round(home.mins+mins);
      if(!home.mods.includes(c.module||"用户补充")) home.mods.push(c.module||"用户补充");
      return;
    }
    /* ② 首次分配并固化单元号：只并入「未完成」的同科目单元（≤35 分钟），否则开新单元 */
    let tgt=null;
    for(let i=U.length-1;i>=0;i--){ if(U[i].subj===c.subject&&U[i].mins+mins<=35&&!doneU[U[i].n]){ tgt=U[i]; break; } }
    if(!tgt){ tgt={ n:v0.nextUnitN++, subj:c.subject||"科目五 导游服务能力（现场考试）",
      mods:[], mins:0, items:[] }; U.push(tgt); }
    tgt.items.push(item); tgt.mins=Math.round(tgt.mins+mins);
    if(!tgt.mods.includes(c.module||"用户补充")) tgt.mods.push(c.module||"用户补充");
    c.unit=tgt.n; save();
  });
  U.sort((a,b)=>a.n-b.n);
  syncPlanSeq(U);
  return U;
}
function syncPlanSeq(U){ /* 单元增删后保持 R1 规划序一致：失效编号剔除，新编号插到未放号处 */
  const v=v25st(); if(!v.plan||!Array.isArray(v.plan.seq)) return;
  const inU=new Set(U.map(u=>u.n));
  const seq=v.plan.seq.filter(n=>inU.has(n));
  const missing=U.map(u=>u.n).filter(n=>!seq.includes(n));
  if(missing.length) seq.splice(Math.min(v.introduced||0,seq.length),0,...missing);
  if(seq.length!==v.plan.seq.length||missing.length){ v.plan.seq=seq; save(); }
}
/* v109：每日口译新题单元（虚拟号段 90000+day）——
   口译是「能力训练」，不是「背完这 18 道示例题就没了」。口译库只是示范，
   每天的口译任务应当由 AI 现场出新题（旧题按 sig 去重，永不复用同一道）。
   虚拟单元不进 TASK_UNITS25，因此不占「总进度」分母，也不需要落库建卡。 */
const DYN_BASE=90000, DYN_MINS=12;
function _dynSeedId(){
  const p=(D.pointsLib||[]).find(x=>/口译/.test(x.module||"")&&x.id);
  return p?p.id:null;
}
function _dynUnit(n){
  const seed=_dynSeedId();
  return { n:n, subj:"科目五 导游服务能力（现场考试）", mods:["口译"], mins:DYN_MINS,
    dynInterp:true, dynDay:n-DYN_BASE,
    items:[{ id:seed||("DYN"+n), title:"口译 · 每日新题（AI 现出）", mins:DYN_MINS }] };
}
function unitByN(n){ if(+n>=DYN_BASE) return _dynUnit(+n); return allUnits().find(u=>u.n===+n); }
function isS5(subj){ return /科目五/.test(subj||""); }
function unitKind(u){ return isS5(u.subj)?"s5":"quiz"; }
function cardKind(p){
  if(!p) return "recite";
  if(!isS5(p.subject)) return "quiz";
  if(/口译/.test(p.module||"")) return "interp";
  if(p.qa_answer) return "qa";      /* 问答题：读题→口述作答→对照，不再当复述 */
  const first=String(p.text||"").split("\n")[0];
  return ((first.match(/[A-Za-z]+/g)||[]).length>=4)?"oral":"recite";
}
/* 科目五（面试）三类细分：①导游词（景点讲解）②知识问答（含综合能力·服务规范·法规·时政）
   ③口译。面板上同色「科目五」任务据此区分（左栏条目、主区任务卡统一取此色与标签）。 */
const S5_CATS={
  tour:  { label:"导游词",   color:"#e0913d" },
  know:  { label:"知识问答", color:"#3a9bbd" },
  interp:{ label:"口译",     color:"#d87093" }
};
function _s5ItemCat(p){
  const mod=(p&&p.module)||"";
  if(/口译/.test(mod)) return "interp";
  if(/景点讲解/.test(mod)) return "tour";
  return "know";
}
function s5Cat(u){
  if(!isS5(u&&u.subj)) return null;
  const lib=D.pointsLib||[]; const c={tour:0,know:0,interp:0};
  (u.items||[]).forEach(it=>{ const p=lib.find(x=>x.id===it.id); if(p) c[_s5ItemCat(p)]++; });
  if(!c.tour&&!c.know&&!c.interp){ const m=(u.mods||[]).join("|"); /* 用户新增卡等未入库条目：退回按模块名判 */
    return /景点讲解/.test(m)?"tour":/口译/.test(m)?"interp":"know"; }
  if(c.tour>c.know&&c.tour>=c.interp) return "tour";
  if(c.interp>c.know&&c.interp>c.tour) return "interp";
  return "know";
}
/* 当日任务排序铁律：导游词类（景点讲解）任务自动靠前，排第 1 的必为导游词任务；
   两段导游词之间必须安插其他任务（不得前后相连）；其余任务保持原有相对顺序不变。 */
function _dayArrange(list, isTour){
  const t=list.filter(isTour), o=list.filter(x=>!isTour(x)), out=[];
  while(t.length){ out.push(t.shift()); if(o.length) out.push(o.shift()); }
  return out.concat(o);
}

/* ==================== [5] 每日任务单（默认节奏骨架） ==================== */
/* 节奏：全部单元按「起始日 → 11/16」的动态天数线性均摊（不设每日上限，保证每个 quest 都能排进任务单），
   11/17~11/20 只复习不收新；复习按 WD_PLANNER 自适应记忆曲线（与 SRS 统一；表现好拉长、表现差压缩），到期才进当日。
   任务单当日落库不重摇。 */
function todayStr(){ return new Date().toISOString().slice(0,10); }
/* ==================== [5a] 动态日期锚点（天数不写死） ====================
   第一截止日 11/16：全部单元必须学完；学不完 → 计算保底任务量（每日最少推多少 + 保底集合）
   最终截止日 11/20：复习强化收尾
   周期天数 = 起始日 → 截止日的真实间隔，跨年自动顺延次年。 */
const WD_DL1={m:11,d:16}, WD_DL2={m:11,d:20};
function _dlDate(y,t){ return new Date(y,t.m-1,t.d); }
function _fmtD(dt){ return (dt.getMonth()+1)+" 月 "+dt.getDate()+" 日"; }
function planHorizon(){
  const v=v25st(); const start=String(v.startDate||todayStr()).slice(0,10);
  const s0=new Date(start+"T00:00:00");
  if(isNaN(s0.getTime())) return {start,N1:20,N2:25,dl1:"11 月 16 日",dl2:"11 月 20 日",day:1,daysLeft:20,daysLeft2:25};
  /* 年份取法：起始日已过今年 11/20（最终截止）→ 顺延明年；否则一律用今年，避免过期后排出"一年的计划" */
  let y=s0.getFullYear();
  if(s0>_dlDate(y,WD_DL2)) y++;
  const d1=_dlDate(y,WD_DL1), d2=_dlDate(y,WD_DL2);
  const dayN=dt=>Math.round((dt-s0.getTime())/86400000)+1;   /* 起始日 = 第 1 天 */
  const N1=Math.max(1,dayN(d1)), N2=Math.max(N1,dayN(d2));
  const day=Math.max(1,Math.min(N2,st.day||1));
  return { start, N1, N2, dl1:_fmtD(d1), dl2:_fmtD(d2), day,
           daysLeft:Math.max(1,N1-day+1), daysLeft2:Math.max(1,N2-day+1) };
}
/* 保底账目：距 11/16 还剩几天、每天最少要推几个、按课时容量装不装得下 */
function planFloor(){
  const H=planHorizon(), U=allUnits(), v=v25st();
  const remain=Math.max(0,U.length-Object.keys(v.done||{}).length);
  const perDay=Math.max(1,Math.ceil(U.length/H.N1));        /* 满额均摊：日新学量 */
  const need=Math.max(1,Math.ceil(remain/H.daysLeft));      /* 现实需要：日新学量 */
  const avgMin=U.length? (U.reduce((a,u)=>a+(u.mins||15),0)/U.length) : 15;
  const capDay=Math.max(perDay, Math.round(180/Math.max(6,avgMin)));  /* 日承载上限：约 180 分钟 ÷ 单元均时 */
  const fits=remain<=H.daysLeft*perDay;                     /* 按均摊节奏装得下 */
  return { H, remain, perDay, need, capDay, fits, overflow:Math.max(0,remain-H.daysLeft*perDay) };
}
/* 按时长（分钟）均摊到第 day 天的累计新学量：按学习顺序累加单元分钟，直到触到「总分钟 × day/N1」，
   返回应已放号的单元个数（游标）。这样每天的新学负担按「总学习时长」对齐，而不是按「单元个数」——
   单元数少但单时长的科目不会让某天被塞满。 */
function _orderTotalMin(order){ return order.reduce((a,u)=>a+(u.mins||15),0); }
/* 今日分钟预算：剩余未完成分钟 ÷ 剩余学习天数。
   逾期不叠加——昨天的欠账先占今天的预算，剩余额度才排新学，这样每天的实际负担按总时长摊平。 */
function _dayBudgetMin(day){
  const H=planHorizon(), order=planOrder(), done=v25st().done||{};
  const remain=order.reduce((a,u)=>a+(done[u.n]?0:(u.mins||15)),0);
  return Math.max(20, Math.round(remain/Math.max(1,H.N1-day+1)));
}
function plannedNewByDay(d){
  const order=planOrder();
  if(!order.length) return 0;
  const t=Math.max(0,Math.min(1,(+d||0)/planHorizon().N1));
  const target=_orderTotalMin(order)*t;
  let acc=0, i=0;
  for(;i<order.length;i++){ acc+=order[i].mins||15; if(acc>=target) break; }
  return Math.min(order.length, i+1);
}
/* 进度代：done 数或放号游标变化即失效未来日预排缓存 */
function _planGen(v){ return Object.keys(v.done||{}).length+":"+(v.introduced||0); }
function sheet(day){
  const _H=planHorizon();
  day=Math.max(1,Math.min(_H.N2,+day||1));
  const v=v25st(); v.sheets=v.sheets||{}; v._fcache=v._fcache||{};
  if(v._planVer!==PLAN_VER){ v.sheets={}; v._fcache={}; v._planVer=PLAN_VER; v.introduced=0; }  /* 排期算法升级 → 清缓存+放号游标，按新口径重排 */
  const PLAN=window.WD_PLANNER;
  const key="d"+day, cur=st.day||1;
  /* 当日/历史日：落库不重摇；未来日：动态预排（不落库，进度一变即重算） */
  if(day<=cur){
    if(v.sheets[key]&&v.sheets[key].items) return v.sheets[key];
  } else {
    const c=v._fcache[key];
    if(c&&c.gen===_planGen(v)&&c.sh&&c.sh.items) return c.sh;
  }
  const U=allUnits(), order=planOrder(), done=v.done||{};
  const isFuture=day>cur;
  /* 未来日：以「按节奏应已放号」的累计量作基线，且不低于实际已放号游标（否则预排会把昨天的单元再排一遍）；
     当日/历史日：用实际放号游标 */
  const introduced=isFuture? Math.min(Math.max(plannedNewByDay(day-1), v.introduced||0), order.length) : Math.min(v.introduced||0, order.length);
  const items=[];
  let PA={ ahead:0, behind:0, scenario:"steady", lagScale:1 };  /* 函数作用域默认值：超过截止日或无单元时仍安全 */
  if(day<=_H.N2&&U.length){
    /* —— 进度差分析（WD_PLANNER 统一入口，ahead/lag/steady 三场景）—— */
    const doneN=Object.keys(done).length;
    const pToday=plannedNewByDay(Math.min(_H.N1,Math.max(1,day-1)));
    PA = PLAN? PLAN.progressAnalysis(doneN, introduced, day, pToday)
             : { ahead:Math.max(0,doneN-pToday), behind:Math.max(0,pToday-doneN), scenario:"steady", lagScale:1 };
    /* ① 补做（仅「今日」）：已放号但未完成的单元优先回到今日；历史日按窗口还原、未来日不补做 */
    if(day===cur) order.slice(0,introduced).filter(u=>!done[u.n]).forEach(u=>items.push({u:u.n,kind:"new"}));
    /* ② 新学量按「分钟」而不是「单元个数」分配：
       - 非今日（历史/未来）：按全期分钟均摊的累计窗口 [p(day-1), p(day)) 还原该日排程；
       - 今日：预算 = 剩余未完成分钟 ÷ 剩余天数，欠账先占预算、余量才排新学（逾期不叠加，日负担因此摊平）。 */
    let i=introduced;
    if(day!==cur){
      const lo=plannedNewByDay(day-1), hi=plannedNewByDay(day);
      for(let k=lo;k<hi&&k<order.length;k++){ const u=order[k]; if(!done[u.n]) items.push({u:u.n,kind:"new"}); }
      i=hi;
    } else {
      const adj = PA.scenario==="ahead" ? -0.15 : PA.scenario==="lag" ? 0.15 : 0;
      const capMin=Math.max(20, Math.round(_dayBudgetMin(day)*(1+adj)));
      let used=items.reduce((a,x)=>a+((unitByN(x.u)||{}).mins||15),0);
      while(i<order.length&&used<capMin){
        const u=order[i++]; if(done[u.n]) continue;
        items.push({u:u.n,kind:"new"}); used+=(u.mins||15);
      }
      v.introduced=i;   /* 未来日预演放号游标不落库，避免污染当日节奏 */
    }

    /* ②b 设计原则：口译类、知识问答类每天至少各 1 个（学习期内）。
       优先从计划序前方补一个未学单元；该类已无未学单元时，取「最久没练」的一个做回潮，保证每天都有这类内容。 */
    if(day<=_H.N1){
      const _has=cat=>items.some(x=>{ const u=unitByN(x.u); return !!u&&s5Cat(u)===cat; });
      /* 历史日的「已学池」取该日附近稍宽的窗口——当天的几个单元里可能恰好没有口译，允许从相邻几天借一个做回潮 */
      const _learnedIdx = day<cur ? Math.max(1,plannedNewByDay(Math.min(_H.N1,day+2))) : (v.introduced||0);
      for(const cat of ["interp","know"]){
        if(_has(cat)) continue;
        let j=-1;
        if(day>=cur) for(let k=i;k<order.length;k++){ const u=order[k]; if(!done[u.n]&&s5Cat(u)===cat){ j=k; break; } }
        if(j>=0){
          items.push({u:order[j].n, kind:"new"});
          if(day===cur){ v.introduced=Math.max(v.introduced||0, j+1); i=Math.max(i, j+1); }
          continue;
        }
        /* 口译不做「回潮复习旧单元」——口译是能力训练，题必须每天是新的；
           知识问答是记忆类，允许按最久未练回潮 */
        if(cat==="interp"){
          items.push({u:DYN_BASE+day, kind:"new"});
          continue;
        }
        const pool=order.slice(0,Math.min(order.length,_learnedIdx)).filter(u=>s5Cat(u)===cat);
        if(!pool.length) continue;
        pool.sort((a,b)=>{ const ta=(done[a.n]&&(done[a.n].lastRev||done[a.n].day))||0, tb=(done[b.n]&&(done[b.n].lastRev||done[b.n].day))||0; return ta-tb; });
        items.push({u:pool[0].n, kind:"rev"});
      }
    }

    /* ③ 复习/测试候选池：用 WD_PLANNER 自适应间隔 + 优先级加权 */
    const inU=new Set(U.map(u=>u.n));
    const dueList=[];   /* 到期（含自适应压缩/拉伸） */
    const backList=[];  /* 兜底（最久未碰） */
    const _srsGet = (typeof srsGet==="function") ? srsGet : function(){return null;};
    Object.keys(done).forEach(k=>{
      const n=+k; if(!inU.has(n)) return;
      const u0=unitByN(n); if(!u0) return;
      const rec=done[n]; const last=rec.lastRev||rec.day||day;
      const dt=day-last; const revs=rec.revs||0;
      let due=false;
      if(PLAN){
        /* WD_PLANNER：自适应间隔——与 SRS 档位对齐，表现差压缩、表现好拉长 */
        if(PLAN.isDueToday(u0, done, day, _srsGet)) due=true;
        else if(dt>=15) due=true;  /* >15 天强制到期 */
      } else {
        due=[1,2,4,7,15].includes(dt)||dt>15;  /* 无 planner 回落旧硬编码 */
      }
      const kind=(revs>0&&unitKind(u0)==="quiz")?"test":"rev";
      const entry={unit:u0, n, kind, dt, due, revs};
      (due? dueList : backList).push(entry);
    });

    /* 用 WD_PLANNER 优先级引擎排序 dueList（subjWeight×lag×mastery×due） */
    let dueSorted=dueList;
    if(PLAN){
      const ctx=PLAN.buildContext(U, done, day, { srsGet:_srsGet });
      const ranked=PLAN.rankCandidates(dueList.map(c=>({unit:c.unit, kind:c.kind})), {
        masters: ctx.masters, lagging: ctx.lagging,
        progress: PA, todayDay: day, done
      });
      dueSorted=ranked.map(r=>({ unit:r.unit, n:r.unit.n, kind:r.kind, score:r.score, _br:r.breakdown, due:true }));
    } else {
      dueSorted.sort((a,b)=>b.dt-a.dt);  /* 最久优先（旧兜底） */
    }

    /* ④ 复习：SRS 到期的全部进当日，不设条数上限 */
    let picked=0;
    for(const c of dueSorted){
      if(items.some(x=>x.u===c.n)) continue;
      items.push({u:c.n, kind:c.kind});
      picked++;
    }
    /* ⑥ 科目交错（至少 3 个不同科目；连续同科 ≤1 次） */
    if(PLAN&&items.length>=2){
      const rankedItems=items.map(it=>({ unit:unitByN(it.u)||{n:it.u,subj:""}, n:it.u, kind:it.kind, score:0, breakdown:{} }));
      const interleaved=PLAN.interleaveBySubj(rankedItems, items.length);
      /* 只重排，不改内容 */
      items.length=0;
      interleaved.forEach(r=>items.push({u:r.n, kind:r.kind}));
    }
    /* ⑦ 可解释审计日志（仅当日落库时记一条；未来日预排不记） */
    if(day<=cur&&PLAN){
      const picks=dueSorted.slice(0,picked).concat(items.slice(0,1).map(x=>({unit:unitByN(x.u), n:x.u, kind:x.kind, score:0, breakdown:{}})));
      v.adjustLog=PLAN.makeAdjustLog(day, PA.scenario, PA, picks);
    }
  }
  const finalCap=Infinity;  /* 不设每日任务上限 */
  /* 当日任务铁律排序：导游词类靠前（第 1 个必为导游词），两段导游词之间安插其他任务 */
  const _ordered=_dayArrange(items, it=>{ const u=unitByN(it.u); return !!u&&s5Cat(u)==="tour"; });
  const sh={ day, items:_ordered.slice(0,finalCap), made:todayStr(), done:{} };
  if(day<=cur){ v.sheets[key]=sh; save(); }
  else { v._fcache[key]={sh:sh, gen:_planGen(v)}; }
  return sh;
}

/* ==================== [5b] 双模型调度：R1 全局规划 / flash 每日微调 ==================== */
/* 职责边界（铁律，不交叉）：
   - R1（高价 deepseek-reasoner）：25 日全局单元顺序，首进 1 次，大偏差或手动重算，每周期≤2 次
   - flash（低价 deepseek-chat）：每日首次进入微调当日任务单顺序，每天 1 次
   测试阶段无密钥：两者均有本地骨架兜底，全流程可玩。 */
/* 规划逻辑版本号：排期算法每次变更 +1，检测到旧版规划自动重排（…导游词不相连+按篇目节号推进=19，取消每日上限+25日线性均摊=20，按 11/16 第一截止日 + 11/20 最终截止日动态算天数、保底任务量=21，口译/知识问答每天至少各1个+按时长均摊=22，今日按「剩余分钟÷剩余天数」预算、逾期不叠加、历史日按窗口还原=23，排期版本变更同时重置放号游标=24，历史日口译/知识问答缺口用相邻日窗口回潮补齐=25） */
const PLAN_VER=25;
/* 单元考频星级（0~3，来自单元内考点的 star 均值，越高=越常考） */
function _unitStar(u){
  try{
    const lib=D.pointsLib||[];
    let s=0,c=0;
    (u.items||[]).forEach(it=>{ const p=lib.find(x=>x.id===it.id); if(p){ s+=Math.max(1,Math.min(3,+(p.star)||1)); c++; } });
    return c?Math.round(s/c*10)/10:1;
  }catch(e){ return 1; }
}
/* 排序铁律（设计原则）：
   1) 不同科目的 quest 穿插——笔试按比例撒进面试之间，避免连科疲劳；
   2) 导游词背诵线按「篇目 → 节号」自然序连续推进，不跳节；
   3) 两段导游词不直接相连——每背完一节必插入一个其他科目 quest 再继续；
   4) 口译类（interp）、知识问答类（know）全程均匀分布——每一小段都要持续见到两类，不能整类扎堆到某几天。 */
/* 把 b 均匀铺进 a（数量多的 a 作主序），返回合并序列；单侧为空时回退原序，保证两类都不在局部断供 */
function _mergeEven(a,b){
  if(!a.length) return b.slice();
  if(!b.length) return a.slice();
  const big=a.length>=b.length?a:b, small=a.length>=b.length?b:a;
  const N=big.length, M=small.length, out=[]; let s=0;
  for(let i=0;i<N;i++){
    out.push(big[i]);
    while(s<M && (s+1)*N <= (i+1)*M){ out.push(small[s]); s++; }
  }
  while(s<M) out.push(small[s++]);
  return out;
}
function _balancedOrder(U){
  const oral=U.filter(u=>/科目五/.test(u.subj||""));
  const written=U.filter(u=>/科目[一二三四]/.test(u.subj||""));
  const isTour=u=>/景点讲解|英文闪卡/.test((u.mods||[]).join("|"));
  const tour=oral.filter(isTour), nTour=oral.filter(u=>!isTour(u));
  /* 口译 / 知识问答 拆开、各自按考频排，再均匀合并——保证两类在全程交替出现，不整类扎堆（铁律 4） */
  const interp=nTour.filter(u=>/口译/.test((u.mods||[]).join("|")));
  const know=nTour.filter(u=>!/口译/.test((u.mods||[]).join("|")));
  interp.sort((a,b)=>_unitStar(b)-_unitStar(a));
  know.sort((a,b)=>_unitStar(b)-_unitStar(a));
  const mix=_mergeEven(know, interp);   /* know 数量占优作主序，interp 均匀铺进 */
  const buckets={};
  written.forEach(u=>{ const k=(u.subj.match(/科目[一二三四]/)||["科目一"])[0]; (buckets[k]=buckets[k]||[]).push(u); });
  Object.keys(buckets).forEach(k=>buckets[k].sort((a,b)=>_unitStar(b)-_unitStar(a)));
  /* 笔试科目按优先级穿插：科目二/三/四均匀轮转，科目一（政策法规/时政）压到后期突击 */
  const KEYS=["科目二","科目三","科目四"].filter(k=>buckets[k]&&buckets[k].length);
  const LAST="科目一";
  let wi=0;
  const out=[];
  const nextW=()=>{
    for(let s=0;s<KEYS.length;s++){ const k=KEYS[(wi+s)%KEYS.length]; if(buckets[k]&&buckets[k].length){ const u=buckets[k].shift(); wi=(wi+s+1)%KEYS.length; return u; } }
    if(buckets[LAST]&&buckets[LAST].length) return buckets[LAST].shift();
    return null;
  };
  /* ①基础序列：导游词与「口译+知识问答」1:1 交替——两段导游词之间永远有一个其他面试 quest */
  const base=[]; let ri=0;
  for(let i=0;i<tour.length;i++){ base.push(tour[i]); if(ri<mix.length) base.push(mix[ri++]); }
  while(ri<mix.length) base.push(mix[ri++]);
  /* ②笔试匀撒到整条序列：从第 1 位起每 ~7 个插一个，保证开局即见笔试科目、全程不扎堆也不断档 */
  const wTotal=Object.values(buckets).reduce((a,b)=>a+b.length,0);
  let wn=0;
  for(let i=0;i<=base.length;i++){
    while(wn<wTotal&&i>=Math.round(wn*(base.length+1)/wTotal)){ const w=nextW(); if(!w) break; out.push(w); wn++; }
    if(i<base.length) out.push(base[i]);
  }
  let w; while((w=nextW())) out.push(w);
  return out;
}
function planOrder(){
  const v=v25st(); const U=allUnits();
  if(v.plan&&Array.isArray(v.plan.seq)&&v.plan.seq.length===U.length&&v.plan.ver===PLAN_VER){
    const byN=new Map(U.map(u=>[u.n,u]));
    const arr=v.plan.seq.map(n=>byN.get(n)).filter(Boolean);
    if(arr.length===U.length) return arr;
  }
  return _balancedOrder(U); /* 无规划或旧版规划 → 面试背诵前置 + 科内考频排序 */
}
/* 该科目「临近任务」：计划序里第一个未完成的该科单元（全完成后回落到第一个，供复习） */
function _nearestUnitOf(subj){
  const norm=subj==="S1"?"科目一":subj==="S2"?"科目二":subj==="S3"?"科目三":subj==="S4"?"科目四":subj==="S5"?"科目五":subj;
  const U=allUnits(), v=v25st(), done=v.done||{}, order=planOrder();
  for(const u of order){ if((u.subj||"").indexOf(norm)===0 && !done[u.n]) return u.n; }
  for(const u of order){ if((u.subj||"").indexOf(norm)===0) return u.n; }
  return U.length?U[0].n:1;
}
/* ==================== [5c] 科目失衡检测：超前修习自由度下的动态再平衡 ==================== */
function _subjKey(s){ return String(s||"").replace(/（现场考试）/,"").trim().split(/\s+/)[0]; }
/* 各科完成率：{科目:{tot,done,rate}} */
function subjStats(){
  const U=allUnits(), done=v25st().done||{}; const m={};
  U.forEach(u=>{ const k=_subjKey(u.subj)||"其他"; m[k]=m[k]||{tot:0,done:0}; m[k].tot++; if(done[u.n]) m[k].done++; });
  Object.keys(m).forEach(k=>{ m[k].rate=m[k].tot?Math.round(m[k].done/m[k].tot*100)/100:0; });
  return m;
}
/* 滞后科目：完成率低于全局加权均值 ≥12 个百分点且尚有剩余 */
function laggingSubjs(){
  const m=subjStats(); const ks=Object.keys(m);
  const totN=ks.reduce((a,k)=>a+m[k].tot,0); if(ks.length<2||!totN) return [];
  const avg=ks.reduce((a,k)=>a+m[k].rate*m[k].tot,0)/totN;
  return ks.filter(k=>m[k].rate<=avg-0.12&&m[k].done<m[k].tot).sort((a,b)=>m[a].rate-m[b].rate);
}
function _balanceLine(){ /* 给规划 prompt 的进度账目行 */
  const m=subjStats();
  const line=Object.keys(m).map(k=>k+" "+Math.round(m[k].rate*100)+"%("+m[k].done+"/"+m[k].tot+")").join("，");
  const lag=laggingSubjs();
  return line+(lag.length?"；滞后："+lag.join("、")+"——复习/测试位优先补给这些科目":"；分布均衡");
}
async function aiPlan25(){
  const v=v25st(); const U=allUnits(); if(!U.length) throw new Error("无任务单元");
  const gens=(v.plan&&v.plan.gens)||0;
  if(gens>=2) throw new Error("本周期 R1 全局规划已达 2 次上限（高价通路限频）");
  const doneN=Object.keys(v.done||{}).length;
  const PLAN=(typeof window!=="undefined")?window.WD_PLANNER:null;
  const wOf=subj=>{ if(!PLAN||!PLAN.subjWeights) return ""; const x=PLAN.subjWeights(subj); return x?x.importance.toFixed(2):""; };
  const dOf=subj=>{ if(!PLAN||!PLAN.subjWeights) return ""; const x=PLAN.subjWeights(subj); return x?x.difficulty.toFixed(2):""; };
  /* 科目掌握度（完成率 + 答题正确率 + SRS 档位），让规划师能判断强弱项而非只看剩多少 */
  let masteryLine="";
  try{
    if(PLAN&&PLAN.subjMastery){
      const srsGet0=(typeof srsGet==="function")?srsGet:()=>null;
      const m=PLAN.subjMastery(U, v.done||{}, {srsGet:srsGet0});
      masteryLine=Object.keys(m).map(k=>k+" 掌握度"+m[k].mastery+"%（完成"+Math.round(m[k].rate*100)+"%）").join("，");
    }
  }catch(e){}
  const _H=planHorizon(), _F=planFloor();
  const _pace="今天是 "+_H.start+"（第 "+_H.day+" 天），距第一截止日 "+_H.dl1+"（第 "+_H.N1+" 天）还剩 "+_H.daysLeft+" 天，距最终截止日 "+_H.dl2+"（第 "+_H.N2+" 天）还剩 "+_H.daysLeft2+" 天；"
    +"总量 "+U.length+" 个单元，按满额均摊需每天 "+_F.perDay+" 个，按剩余量现算每天需 "+_F.need+" 个（日承载上限约 "+_F.capDay+" 个）。";
  const sys="你是导游资格考试资深备考规划师，为「当前日期 → 11 月 16 日第一截止日 → 11 月 20 日最终截止日」这段真实时间排定学习单元先后次序。天数按真实日期动态计算，不要套用固定天数。\n"
    +_pace+"\n"
    +"排期分两层：① 科目层——面试(科目五)独立考试、决定成败、优先级最高；笔试四科（政策法规/导游业务/全国基础/地方基础）分值各 50 分均等、不分高低；② 科内层——每科内部按考频 freq(0~3) 从高到低排，高频考点优先、低频靠后（科内低频≠不学，只是靠后安排、仍须全部覆盖）。\n"
    +"硬约束（必须满足）：1. 面试背诵类（科目五，尤其 6 篇导游词）必须前置——前期密集铺开首轮，靠记忆曲线在第一截止日前回潮 2-3 遍；"
    +"2. 全部新单元最迟于第一截止日 "+_H.dl1+" 前覆盖完，"+_H.dl1+" 之后只做复习强化 + 全真演练，严禁截止后安排新学；"
    +"3. 科内高频单元靠前、低频靠后；4. 长短单元交错避免负担失衡；5. 已完成单元保持相对顺序留在前段；"
    +"6. 不同科目必须穿插——同一科目的单元不得连续成串（导游词尤为严格：两节之间必须夹其他科目任务，且按篇目/节号自然序推进）。\n"
    +"7. 每天至少各安排 1 个「口译类」和 1 个「知识问答类」单元（学习期内直到该类耗尽），两类在全程均匀分布、不整类扎堆；\n"
    +"8. 每日新学量按「总学习分钟 ÷ 学习天数」均匀切分（按时长分配，不是按单元个数）——单时长短的单元可适当多排、单时长长的单元少排，保证每天负担大致相当。\n"
    +"保底任务量（必须计算并写进 intro）：若按剩余天数×每日可承载量装不下 "+U.length+" 个单元，必须给出「保底口径」——明确 11/16 前至少要完成多少个单元、按什么取舍（建议：导游词 55 节全保、其余按科目重要性×考频由高到低截取），并把数字写进【最低保底】一节。\n"
    +"优先级参考：①分值层面——面试(科目五)独立、决定成败、重要性最高；笔试四科（政策法规/导游业务/全国基础/地方基础）分值各 50 分、完全均等；②复习节奏——面试背诵前置反复，法规纯记忆可突击靠后（但分值不低，仍须全部覆盖，不得跳过）。\n"
    +"只输出 JSON，不要输出任何额外文字或 markdown 围栏。";
  const user="单元清单（#=编号，重要=该科重要性0~1，难=该科难度0~1，freq=该单元考频0~3，mins=估时分钟）：\n"
    +U.map(u=>"#"+u.n+" "+String(u.subj).replace(/（现场考试）/,"")
        +(PLAN?(" 重要"+wOf(u.subj)):"")+(PLAN?(" 难"+dOf(u.subj)):"")
        +" freq"+_unitStar(u)
        +"｜"+u.mods.join("/")+"｜"+u.mins+"min"+((v.done&&v.done[u.n])?"｜已完成":"")).join("\n")
    +"\n当前第 "+(st.day||1)+"/"+_H.N2+" 天（第一截止日 "+_H.dl1+" 前必须学完全部），已完成 "+doneN+"/"+U.length+" 单元。"
    +"\n科目进度账目："+_balanceLine()
    +(masteryLine?"\n科目掌握度："+masteryLine:"")
    +"\n若科目失衡（有人超前修习导致分布偏斜），排期时让滞后科目的单元尽量靠前补进度。"
    +'\n输出 JSON（严格此结构）：{"seq":[全部 '+U.length+' 个单元编号，不重不漏，按执行先后排序],"note":"一句话总结(≤60字)","intro":"【整体思路】…\\n【时间安排】…\\n【重点科目】…\\n【最低保底】…（每节≤60字、用换行分隔，是供用户阅读的规划说明）"}';
  const raw=await dsChat([{role:"system",content:sys},{role:"user",content:user}],{kind:"plan25",ch:"plan25"});
  const o=_jsonFrom(raw);
  /* 稳健提取 seq：R1 可能把 seq 拆成字符串、或在 o.plan 里嵌套 */
  let seq=(o.seq||(o.plan&&o.plan.seq)||[]);
  seq=(typeof seq==="string")?seq.split(/[,\s，、]+/):seq;
  seq=(seq||[]).map(Number).filter(n=>U.some(u=>u.n===n));
  const uniq=[...new Set(seq)];
  if(uniq.length!==U.length) throw new Error("R1 规划缺漏（返回 "+uniq.length+"/"+U.length+" 个单元），未采用");
  v.plan={ seq:uniq, note:String(o.note||"").slice(0,120), intro:String(o.intro||"").slice(0,800),
    from:"r1", mock:false, ver:PLAN_VER, made:todayStr(), dayMade:st.day||1, gens:gens+1 };
  save(); return v.plan;
}
function mockPlan25(reason){
  const v=v25st(); const U=allUnits();
  const H=planHorizon(), F=planFloor();
  const floorTxt=F.fits
    ? "按现有节奏每天 "+F.perDay+" 个可在 "+H.dl1+" 前学完（余量约 "+(H.daysLeft*F.perDay-F.remain)+" 个），无需削减任务量。"
    : "时间装不下 "+U.length+" 个单元：每天至少需 "+F.need+" 个（上限约 "+F.capDay+"），"+H.dl1+" 前保底完成 "+Math.min(U.length,H.daysLeft*F.capDay)+" 个，剩余顺延到 "+H.dl2+" 前复习消化；取舍顺序 导游词全覆盖 → 科目二 → 科目三 → 科目四 → 科目一。";
  v.plan={ seq:_balancedOrder(U).map(u=>u.n), mock:true, from:"local", ver:PLAN_VER, gens:(v.plan&&v.plan.gens)||0,
    note:"本地骨架：导游词按篇目/节号推进且两段之间必隔其他单元，口译/知识问答每天各至少1个均匀分布，笔试匀撒全程，按总分钟均摊到每天，科内按考频优先、前重后轻",
    intro:"【整体思路】导游词（景点讲解）按篇目、节号顺序推进，每背完一节必插入其他科目任务再继续；口译、知识问答两类全程均匀分布、每天各至少 1 个；笔试（科目一~四）均匀撒在全程，不同科目交替出现，科内高频考点优先；每日新学量按「总分钟 ÷ 学习天数」均匀切分（按时长分配，不按单元个数）。\n"
      +"【时间安排】"+H.start+" 起算共 "+H.N2+" 天：第 1~"+H.N1+" 天（至 "+H.dl1+"）学完全部 "+U.length+" 个单元，第 "+(H.N1+1)+"~"+H.N2+" 天（至 "+H.dl2+"）复习强化 + 全真演练。\n"
      +"【重点科目】面试服务能力、导游业务。\n"
      +"【最低保底】"+floorTxt
      +(reason?("（R1 未采用："+String(reason).slice(0,40)+"）"):"（配置密钥后由 R1 输出更精细排期与说明）"),
    made:todayStr(), dayMade:st.day||1 };
  save(); return v.plan;
}
async function aiPlanDaily25(day){
  const v=v25st(); const sh=sheet(day);
  if(!sh.items.length) return null;
  v.dailyOv=v.dailyOv||{};
  const dk="d"+day;
  if(v.dailyOv[dk]) return v.dailyOv[dk];
  const rows=sh.items.map(it=>({kind:it.kind,u:unitByN(it.u)})).filter(x=>x.u);
  let dueN=0; try{ dueN=srsDueKeys().length; }catch(e){}
  /* 场景感知：用 WD_PLANNER 统一判定 ahead/lag/steady */
  const PLAN=window.WD_PLANNER;
  const done=v.done||{}, cur=st.day||1; const U=allUnits();
  const doneN=Object.keys(done).length;
  const PA = PLAN? PLAN.progressAnalysis(doneN, v.introduced||0, day, plannedNewByDay(Math.min(planHorizon().N1,Math.max(1,day-1))))
                 : { scenario:"steady", ahead:0, behind:0, lagScale:1 };
  const scenCmd = PA.scenario==="ahead"
    ?"【场景：超前修习】用户进度领先 "+PA.ahead+" 日——复习/测试位可适度让位，让用户休整。"
    : PA.scenario==="lag"
    ?"【场景：进度滞后】用户落后 "+PA.behind+" 日——复习/测试位里优先换入滞后科目，帮用户 catch-up。"
    :"【场景：节奏平稳】无特殊倾斜。";
  /* 候选池：自适应到期 + 科目重要性×滞后程度双因子 */
  const inItems=new Set(sh.items.map(x=>x.u));
  const cand=[];
  U.forEach(u=>{
    if(inItems.has(u.n)||!done[u.n]) return;
    const rec=done[u.n], last=rec.lastRev||rec.day||cur, dt=cur-last;
    let due=false;
    if(PLAN){ due=PLAN.isDueToday(u, done, cur, (typeof srsGet==="function")?srsGet:()=>null) || dt>=15; }
    else { due=[1,2,4,7,15].includes(dt)||dt>15; }
    if(due) cand.push({u:u.n, kind:((rec.revs||0)>0&&unitKind(u)==="quiz")?"test":"rev", dt, revs:rec.revs||0, subj:_subjKey(u.subj)});
  });
  /* 用 WD_PLANNER 优先级引擎给候选池排序 */
  if(PLAN){
    const ctx=PLAN.buildContext(U, done, cur, { srsGet:(typeof srsGet==="function")?srsGet:()=>null });
    const ranked=PLAN.rankCandidates(cand.map(c=>({unit:unitByN(c.u), kind:c.kind})), {
      masters: ctx.masters, lagging: ctx.lagging, progress: PA, todayDay:cur, done
    });
    cand.sort((a,b)=>{
      const ra=ranked.find(r=>r.n===a.u), rb=ranked.find(r=>r.n===b.u);
      return (rb?rb.score:0)-(ra?ra.score:0);
    });
  } else {
    const lag=laggingSubjs();
    const lagIdx=c=>{ const i=lag.indexOf(c.subj); return i<0?99:i; };
    cand.sort((a,b)=>{ const la=lagIdx(a), lb=lagIdx(b); return la!==lb?la-lb:b.dt-a.dt; });
  }
  const candTop=cand.slice(0,6);
  const sys="你是备考陪跑教练。今日任务单已由全局规划排定，你只做细节微调：\n"
    +scenCmd+"\n"
    +"1. 重排顺序（状态要求高的放前面）；\n"
    +"2. 最多替换 2 个「复习/测试」位为候选池更优单元（新学位严禁增删改动）；\n"
    +"3. 滞后科目优先、高重要性科目优先；\n"
    +"4. 候选池不合适则不替换。\n只输出 JSON。";
  const user="第 "+day+"/"+planHorizon().N2+" 天（第一截止日 "+planHorizon().dl1+"），星盘到期 "+dueN+" 张。今日任务单：\n"
    +rows.map((x,i)=>(i+1)+". #"+x.u.n+" ["+(x.kind==="new"?"新学":x.kind==="test"?"测试":"复习")+"] "+String(x.u.subj).replace(/（现场考试）/,"")+"｜"+x.u.mods.join("/")+"｜"+x.u.mins+"min").join("\n")
    +"\n科目进度账目："+_balanceLine()
    +(candTop.length?"\n候选池（可替换复习/测试位，优先级已由规划引擎预排）：\n"+candTop.map(x=>"#"+x.u+" ["+(x.kind==="test"?"测试":"复习")+"] "+x.subj+" 距上次 "+x.dt+" 天").join("\n"):"\n候选池：空")
    +'\n输出 JSON：{"order":[当日全部单元编号（含替换后的）…],"swap":[{"out":被换下的单元号,"in":换上的候选单元号}…]（最多2个，可空）,"note":"一句话说明（≤40字）"}';
  const raw=await dsChat([{role:"system",content:sys},{role:"user",content:user}],{kind:"planDaily",ch:"planDaily"});
  const o=_jsonFrom(raw);
  /* 应用 swap：只接受「换出=当日复习/测试位，换入=候选池内」的合法替换 */
  const swaps=(Array.isArray(o.swap)?o.swap:[]).slice(0,2);
  let swapped=0;
  swaps.forEach(sw=>{
    const outN=+sw.out, inN=+sw.in;
    const oi=sh.items.findIndex(x=>x.u===outN&&x.kind!=="new");
    const candOK=candTop.some(c=>c.u===inN);
    if(oi>=0&&candOK&&!sh.items.some(x=>x.u===inN)){
      sh.items[oi]={u:inN, kind: (cand.find(c=>c.u===inN)||{}).kind==="test"?"test":"rev"};
      swapped++;
    }
  });
  /* order 校验：必须与（替换后）当日集合完全同集，只接受重排 */
  const cur2=sh.items.map(x=>x.u).slice().sort((a,b)=>a-b).join(",");
  const ord=(o.order||[]).map(Number);
  if(ord.length===sh.items.length&&ord.slice().sort((a,b)=>a-b).join(",")===cur2){
    const byN={}; sh.items.forEach(it=>byN[it.u]=it);
    sh.items=ord.map(n=>byN[n]); /* 只接受同集重排，杜绝 AI 增删 */
  }
  const rec={ at:new Date().toISOString(), scenario:PA.scenario,
    note:(swapped?("替换 "+swapped+" 项；"):"")+String(o.note||"已校核当日任务单").slice(0,80) };
  v.dailyOv[dk]=rec; save(); return rec;
}
function mockDaily25(day){
  const v=v25st(); v.dailyOv=v.dailyOv||{};
  const sh=sheet(day);
  /* 本地失衡微调（无密钥兜底）：最多把 2 个复习/测试位换成滞后科目的到期候选，铁律与 AI 版一致 */
  let swapped=0, names=[];
  if(sh.items.length){
    const lag=laggingSubjs();
    if(lag.length){
      const inItems=new Set(sh.items.map(x=>x.u));
      const done=v.done||{}, cur=st.day||1;
      const cand=[];
      allUnits().forEach(u=>{
        if(inItems.has(u.n)||!done[u.n]) return;
        const rec=done[u.n], last=rec.lastRev||rec.day||cur, dt=cur-last;
        if([1,2,4,7,15].includes(dt)||dt>15) cand.push({u:u.n, subj:_subjKey(u.subj), dt:dt});
      });
      const picks=cand.filter(c=>lag.includes(c.subj)).sort((a,b)=>b.dt-a.dt).slice(0,2);
      picks.forEach(p=>{
        const oi=sh.items.findIndex(x=>x.kind!=="new"&&x.u!==p.u
          &&_subjKey((unitByN(x.u)||{}).subj||"")!==p.subj);   /* 换出非滞后科的复习位才有意义 */
        if(oi>=0&&!sh.items.some(x=>x.u===p.u)){
          const u0=unitByN(p.u);
          const isTest=(done[p.u].revs||0)>0&&u0&&unitKind(u0)==="quiz";
          sh.items[oi]={u:p.u, kind:isTest?"test":"rev"};
          swapped++; names.push("#"+p.u+"（"+p.subj+"）");
        }
      });
    }
  }
  const rec={ at:new Date().toISOString(), mock:true,
    note: swapped?("本地失衡微调：复习位→"+names.join("、")):"本地骨架：顺序不变（配置密钥后由 flash 每日微调）" };
  v.dailyOv["d"+day]=rec; save(); return rec;
}
/* ==================== [5d] AI 调控账目：卡池增删记账 + 每日一结算 ==================== */
/* 卡片新增/删除都会改变任务总量：记账即失效未来日预排；自然日推进时 settleAcct 结算，
   重算剩余负荷并标记重排（R1 名额未用尽则触发全局重算，否则沿用 seq 修剪 + flash 每日微调）。 */
function acctNote(t, detail){
  const v=v25st(); v.acct=v.acct||{events:[], settles:0};
  v.acct.events=(v.acct.events||[]).filter(Boolean);
  v.acct.events.push({t:String(t||"").slice(0,8), detail:String(detail||"").slice(0,60), at:new Date().toISOString(), day:st.day||1});
  v._fcache={};          /* 总量已变，未来日预排立即重算 */
  save();
}
function settleAcct(){
  const v=v25st();
  if(!v.acct||!(v.acct.events||[]).length) return false;
  const U=allUnits(), doneN=Object.keys(v.done||{}).length;
  const nDel=v.acct.events.filter(e=>e.t==="del").length;
  const nAdd=v.acct.events.filter(e=>e.t==="add").length;
  v.acct.events=[];
  v.acct.settles=(v.acct.settles||0)+1;
  if(v.plan&&!v.plan.mock) v.plan.stale=true;   /* 有 R1 名额时下轮 renderBoard 触发重算 */
  v.acct.lastNote="第"+(st.day||1)+"日结算：删"+nDel+"补"+nAdd+"，任务池余 "+(U.length-doneN)+"/"+U.length+" 单元";
  try{ toast(nDel?("账目已结算：移除 "+nDel+" 张卡，任务池余 "+(U.length-doneN)+" 单元，节奏已重排")
                 :("账目已结算：新增 "+nAdd+" 张卡已接入任务规划")); }catch(e){}
  save(); return true;
}
/* 编排入口：renderBoard 每次渲染时调用；需要才发起，全程异步不阻塞渲染
   触发条件（新增滞后临界场景）：
     - behind > config.lagCritical(4) → 触发 aiPlan25 全局重算
     - ahead/lag 场景 → aiPlanDaily25 prompt 注入场景指令 */
function ensurePlan25(day, sh, stream){
  const v=v25st(); v.dailyOv=v.dailyOv||{};
  if(v._planning) return;
  const PLAN=window.WD_PLANNER;
  const dk="d"+day;
  const behind=plannedNewByDay(day)-(v.introduced||0);
  const lagWarn = PLAN? PLAN.config.lagWarn:2;
  const lagCrit = PLAN? PLAN.config.lagCritical:4;
  const needPlan=!v.plan
    ||(v.plan&&v.plan.ver!==PLAN_VER)                            /* 排期算法版本升级 → 本地骨架直接重排，不耗 R1 */
    ||(v.plan&&!v.plan.mock&&v.plan.stale&&dsReady()&&(v.plan.gens||1)<2)  /* 账目结算：删卡/增卡后重排 */
    ||(v.plan&&!v.plan.mock&&dsReady()&&((v.plan.gens||1)<2)&&behind>lagCrit); /* 滞后≥4 日触发全局重算 */
  const needDaily=!needPlan&&day<=25&&sh.items.length&&!v.dailyOv[dk];
  if(!needPlan&&!needDaily) return;
  v._planning=true;
  let job;
  if(needPlan){
    /* 首次/版本升级/无密钥 → 本地骨架（我已内置高质量排法，不耗 R1）；仅已有 R1 规划的重算才回 R1 */
    const useR1=dsReady()&&v.plan&&!v.plan.mock&&v.plan.ver===PLAN_VER;
    job=useR1? aiPlan25().catch(e=>{ const msg=String(e&&e.message||e);
      if(!v.plan){ return mockPlan25(msg); }
      v.plan.stale=false; v.plan.lastErr=msg; save();
      return v.plan; })
             : Promise.resolve(mockPlan25());
  }else{
    job=dsReady()? aiPlanDaily25(day).catch(e=>{ v.dailyOv[dk]={at:new Date().toISOString(),note:"微调失败，沿用骨架",err:String(e&&e.message||e)}; save(); })
                 : Promise.resolve(mockDaily25(day));
  }
  Promise.resolve(job).then(()=>{ v._planning=false; save();
    try{ if(stream&&stream.isConnected&&typeof view!=="undefined"&&view==="v25") renderBoard(); }catch(e){} });
}

/* ==================== [6a] 语音朗读（TTS）——系统 TTS 三层优化 ==================== */
/* 铁律：只朗读内容文本（考点原文/导游词/题面/参考答案），按钮、标签、提示等 UI 文案一律不读。
   三层策略：
   · 系统 TTS：voice 质量分级挑选（Premium/Enhanced/Google/Natural 优先）+ 长文本分句队列播放
     （规避 Chrome 长文本 ~15 秒截断 bug，逐句连播体验无缝）
   · HD 英文（可选开关）：Kokoro-82M 神经语音（af_heart，A 级音色）经 esm.sh 在浏览器本地推理，
     模型走 hf-mirror.com 镜像（国内可达），首次约 85MB、Transformers.js 自动浏览器缓存后离线可用；
     加载或合成失败自动回退系统 TTS
   · 中文：Kokoro 中文音色仅 D 级（川口音），继续走系统 TTS（本机普通话音色最稳）
   语速英文 0.9、中文 1.0；voice 选择持久化 localStorage 供下次直接命中。 */
const TTS_STORE="wdzx.tts";
const TTS_HD_KEY="wdzx.ttsHD";
const TTS_SEG_MAX=160;   /* 单句上限（字符），超过按逗号二级切分 */
let _ttsVoices=[]; let _ttsHooked=false;
let _ttsCur=null;   /* 防 GC：Chrome 会回收局部 utterance 导致静默无声（crbug 679437），必须模块级持有 */
let _ttsHdInst=null; let _ttsHdAudio=null; let _ttsHdLoading=null; let _ttsHdFailed=false; let _ttsHdPct=0; let _ttsHdPromise=null;
/* 播放会话：系统队列与 HD 播放共用（stopped/el/lang），ttsStop 一停全停 */
const _ttsQ={ items:[], i:0, el:null, lang:"", stopped:true, paused:false, rate:1, suppress:false };

function _ttsLoadVoices(){
  try{
    const synth=window.speechSynthesis; if(!synth) return;
    _ttsVoices=synth.getVoices()||[];
    if(!_ttsHooked&&typeof synth.onvoiceschanged!=="undefined"){
      synth.onvoiceschanged=()=>{ _ttsVoices=synth.getVoices()||[]; }; _ttsHooked=true;
    }
  }catch(e){}
}
function _ttsPrefs(){ try{ return JSON.parse(localStorage.getItem(TTS_STORE)||"{}"); }catch(e){ return {}; } }
function _ttsSavePrefs(p){ try{ localStorage.setItem(TTS_STORE,JSON.stringify(p)); }catch(e){} }

/* voice 质量分级：macOS/iOS Premium/Enhanced、Edge Natural、Chrome/Android Google 神经音最自然。
   汉语包专项：本地化名称也要命中（macOS「婷婷（增强版）」带"增强"），并压低粤语音色避免配错。
   整蛊音黑名单：Eddy/Rocko/Grandma 等系统玩笑音一律 -100，绝不自动选中。 */
function _ttsVoiceScore(v){
  const n=String(v.name||"");
  let s=0;
  if(/^(eddy|flo|reed|rocko|shelley|sandy|grandma|grandpa|alvin|jester|bahh|bubbles|cellos|organ|superstar|trinoids|whisper|wobble|zarvox|albert|fred|kathy|ralph|hysterical|junior|deranged|nervous|good news|bad news|boing|karoo|bad news|toulouse|otis|macin talk)/i.test(n)) s-=100;
  if(/premium/i.test(n)||/高级/.test(n)) s+=40;
  else if(/enhanced/i.test(n)||/增强/.test(n)) s+=30;
  if(/natural/i.test(n)) s+=25;
  if(/google/i.test(n)) s+=20;
  if(/siri/i.test(n)) s+=12;
  if(/neural/i.test(n)) s+=10;
  if(/^(samantha|aria|jenny|ava|allison|xiaoxiao|yunxi|yunyang|xiaoyi)/i.test(n)) s+=8;
  if(/^(tingting|ting-ting|meijia|sinji|sin-ji|yaoyao|kangkang|huihui|yu-shu|yunjian|yunhan|shuyu|li-mu|liang|yue|yuet|moon)/i.test(n)) s+=8;
  if(/^(婷婷|美嘉|善怡|雨舒|云健|云汉|书宇|志明|丽敏|莉莉|月|悦|云)/.test(n)) s+=10;   /* macOS 中文本地化名 + 苹果新包「月」「悦」「云」——不带"高级/增强"字样但音质高 */
  if(/^(xiaoxiao|xiaoyi|yunxi|yunyang|yunjian)/i.test(n)) s+=4;   /* Edge 汉语神经音再加分 */
  if(/(mandarin|普通话|普通话（中国大陆）)/i.test(n+v.lang)) s+=4;  /* 真普通话 > 方言腔 */
  if(v.localService) s+=15;   /* 本地声音优先：Chrome 的 Google 云声音离线/网络差时无声 */
  if(/(cantonese|粤语|廣東話|广东话)/i.test(n)||/^yue/i.test(v.lang||"")) s-=10;
  return s;
}
function ttsPickVoice(lang){
  if(!_ttsVoices.length) _ttsLoadVoices();
  const wantZh=/^zh/i.test(lang||"");
  const family=_ttsVoices.filter(v=>wantZh?/^zh/i.test(v.lang):/^en/i.test(v.lang));
  if(!family.length) return null;
  const p=_ttsPrefs();
  /* 分语言偏好；旧全局 voice 字段仅当【语族匹配】才回落——否则存过的中文声音会被拿去读英文 */
  let saved=wantZh?p.voiceZh:p.voiceEn;
  if(!saved&&p.voice){
    const lv=_ttsVoices.find(v=>v.name===p.voice);
    if(lv&&(wantZh?/^zh/i.test(lv.lang):/^en/i.test(lv.lang))) saved=p.voice;
  }
  /* 用户手选的优先，且在【整个语族】里找：选了美嘉(zh-TW)读普通话文本也照用，不做子语言收窄 */
  const savedV=saved?family.find(v=>v.name===saved):null;
  if(savedV) return savedV;
  /* 无手选时才按子语言收窄挑最佳（zh-CN 文本优先 zh-CN 声音） */
  let pool=family;
  if(wantZh){
    const exact=lang?family.filter(v=>v.lang.toLowerCase()===String(lang).toLowerCase()):[];
    const cn=family.filter(v=>/^zh[-_]cn/i.test(v.lang));
    if(exact.length) pool=exact;
    else if(cn.length&&/^zh-cn/i.test(String(lang))) pool=cn;
  }
  const best=pool.slice().sort((a,b)=>_ttsVoiceScore(b)-_ttsVoiceScore(a))[0]||null;
  if(best){ /* 自愈：旧存档声音已不存在时更新（合并写，别覆盖另一语言的偏好） */
    try{ const np=_ttsPrefs(); if(wantZh) np.voiceZh=best.name; else np.voiceEn=best.name; localStorage.setItem(TTS_STORE,JSON.stringify(np)); }catch(e){}
  }
  return best;
}
/* —— 音色管理（设置页用）：列出/手选/试听/自检 —— */
function ttsVoiceList(){
  _ttsLoadVoices();
  /* 等级判定用 name+voiceURI 双源：部分苹果新包（如「月」）名字不带"高级/增强"字样，
     URI 里可能带；仍探不到就标"标准"——上层只按它排序，不再据此过滤 */
  return _ttsVoices.map(v=>{
    const s=String(v.name||"")+" "+String(v.voiceURI||"");
    return { name:v.name, lang:v.lang, local:!!v.localService,
      grade:/premium|高级/i.test(s)?"高级":/enhanced|增强/i.test(s)?"增强":/natural|neural|google/i.test(s)?"神经网络":/siri/i.test(s)?"Siri":"标准",
      zh:/^zh/i.test(v.lang) };
  })
  .sort((a,b)=>(b.zh-a.zh)||(_ttsVoiceScore(b)-_ttsVoiceScore(a)));
}
function ttsGetVoicePref(lang){ const p=_ttsPrefs(); return /^zh/i.test(lang||"")?(p.voiceZh||p.voice||""):(p.voiceEn||p.voice||""); }
function ttsSetVoicePref(lang, name){
  try{ const p=_ttsPrefs(); if(/^zh/i.test(lang||"")) p.voiceZh=name||""; else p.voiceEn=name||""; localStorage.setItem(TTS_STORE,JSON.stringify(p)); }catch(e){}
}
function ttsPreview(name){ /* 试听指定声音：短句即点即听 */
  _ttsLoadVoices();
  const v=_ttsVoices.find(x=>x.name===name);
  if(!v){ toast("找不到该声音——可能浏览器还没加载完，稍后再试"); return; }
  _ttsHalt(); ttsStopMarks();
  const zh=/^zh/i.test(v.lang);
  const u=new SpeechSynthesisUtterance(zh?"你好，这是当前选择的朗读音色，比你听到的更清晰吗？":"Hello, this is the selected reading voice. Does it sound better?");
  u.voice=v; u.lang=v.lang; u.rate=zh?1.0:0.9;
  let started=false; _ttsCur=u;
  u.onstart=()=>{ started=true; };
  u.onerror=(e)=>{ const c=e&&e.error||""; if(c&&c!=="interrupted"&&c!=="canceled") toast("试听失败（"+c+"）"); };
  const synth=window.speechSynthesis;
  synth.speak(u); try{ synth.resume(); }catch(e){}
  setTimeout(()=>{ if(!started&&_ttsCur===u){ _ttsCur=null; toast("该声音 1.6 秒内没出声——换一个试试，或点「朗读自检」看详情"); } },1600);
}
function ttsDiag(){ /* 一键自检：声音列表/当前选中/引擎状态，供设置页展示 */
  _ttsLoadVoices();
  const synth=window.speechSynthesis;
  const vz=ttsPickVoice("zh-CN"), ve=ttsPickVoice("en-US");
  const fm=v=>v?(v.name+"（"+v.lang+(v.localService?"·本地":"·网络")+"）"):"未找到任何声音";
  const zhAll=_ttsVoices.filter(v=>/^zh/i.test(v.lang));
  const gradeOf=v=>/premium|高级/i.test(v.name)?"高级":/enhanced|增强/i.test(v.name)?"增强":/natural|neural|google/i.test(v.name)?"神经网络":/siri/i.test(v.name)?"Siri":"标准";
  /* 原始声音全量清单——不过滤，让用户看到浏览器实际暴露了哪些
     用户下载的"月""Kate""Jamie"等如果在浏览器里根本不出现，说明是浏览器/Mac 限制，不是过滤问题 */
  const rawAll=_ttsVoices.map(v=>({name:v.name,lang:v.lang,local:!!v.localService,grade:gradeOf(v)}));
  /* 同时打印到 Console 方便 DevTools 查看完整 JSON */
  console.log("[TTS-DIAG] 原始声音全量清单：", JSON.stringify(rawAll));
  return { total:_ttsVoices.length,
    zh:zhAll.length,
    en:_ttsVoices.filter(v=>/^en/i.test(v.lang)).length,
    zhEnh:zhAll.filter(v=>/premium|高级|enhanced|增强/i.test(v.name)).length,
    zhNames:zhAll.slice(0,12).map(v=>v.name+"["+gradeOf(v)+"]"),
    pickZh:fm(vz), pickEn:fm(ve),
    speaking:synth?!!synth.speaking:false, paused:synth?!!synth.paused:false,
    hd:ttsHdOn()?(_ttsHdInst?"已就绪":"加载中/失败"):"已关闭",
    rawList:rawAll,  /* 完整原始清单——设置页自检弹窗会显示 */
    ver:(typeof V25!=="undefined"&&V25.VER)||"" };
}

/* —— 分句：中文按 。！？；切，英文按 .!?+大写开头 切；超长句按逗号聚合，无标点按空格硬切兜底 —— */
function _ttsSplitSentences(s){
  const out=[];
  const push=t=>{ t=String(t||"").trim(); if(t) out.push(t); };
  const hardSlice=t=>{                       /* 无标点超长兜底：按空格/固定长度硬切 */
    let rest=t;
    while(rest.length>TTS_SEG_MAX){
      let cut=rest.lastIndexOf(" ",TTS_SEG_MAX);
      if(cut<TTS_SEG_MAX*0.6) cut=TTS_SEG_MAX;
      push(rest.slice(0,cut)); rest=rest.slice(cut);
    }
    push(rest);
  };
  const segs=String(s||"").split(/(?<=[。！？；!?])\s*|(?<=[.!?])\s+(?=[A-Z"'（(一-鿿])/g);
  for(const raw of segs){
    const seg=raw.trim();
    if(!seg) continue;
    if(seg.length<=TTS_SEG_MAX){ push(seg); continue; }
    let cur="";
    for(const p of seg.split(/(?<=[，,、])/g)){
      if(p.length>TTS_SEG_MAX){ if(cur){ push(cur); cur=""; } hardSlice(p); }
      else if(cur&&(cur+p).length>TTS_SEG_MAX){ push(cur); cur=p; }
      else cur+=p;
    }
    if(cur) push(cur);
  }
  return out.length?out:[String(s)];
}

function ttsSpeak(text, lang, el, _noHd){
  const synth=window.speechSynthesis;
  const s=String(text||"").replace(/【中文对照】[\s\S]*$/,"").trim();
  if(!synth){ toast("当前环境不支持语音朗读——建议用 Chrome/Edge/Safari"); return; }
  if(!s) return;
  /* 重入保护：正在播时再次点击 → 先设 stopped 让前一个尽快退出，等它 resolve 再启新的
     HD 是 async 循环，_ttsHalt 设 _ttsQ.stopped 后 generate() 可能还在跑，
     必须等它真正 resolve 才能启下一个，否则两个 async 循环争抢 Audio 对象会卡死 */
  if(_ttsHdPromise){
    _ttsQ.stopped=true;  /* 告诉前一个 HD 循环退出 */
    try{ _ttsHdPromise.then(()=>{ _ttsHdPromise=null; ttsSpeak(text,lang,el,_noHd); }); }catch(e){}
    return;  /* 让前一个跑完再递归启新的 */
  }
  /* 语言判定（v116 按用户明确规则）：朗读首选永远是英文，只有文本里真的出现汉字才用中文声道。
     以前用「连续 3 个字母」判定，纯数字段（如 1406、720,000）会被误判成中文而切到汉语朗读。 */
  const hasZh=/[\u4e00-\u9fff]/.test(s);
  const detectedLang=hasZh?"zh-CN":"en-US";
  if(lang&&/^en/i.test(lang)===hasZh){  /* 调用方传的 lang 和文本内容不一致 → 修正并警告 */
    console.warn("[TTS] lang 参数 "+lang+" 与文本内容不符（hasZh="+hasZh+"），修正为 "+detectedLang+" text="+s.slice(0,50));
  }
  lang=detectedLang;
  _ttsHalt(); ttsStopMarks(); _ttsHdBadge(false);   /* 系统声道起播：高清徽标必须熄灭 */
  /* HD 英文：开关开启且引擎就绪 → Kokoro 神经语音；未就绪则后台预热，本次先用系统 TTS，不打断用户 */
  if(/^en/i.test(lang)&&ttsHdOn()&&!_noHd){
    if(_ttsHdInst){
      const p=_ttsHdPlay(_ttsHdInst, s, el);
      _ttsHdPromise=p.catch(()=>{});  /* 存生命周期 Promise，下一次 ttsSpeak 会等它 resolve 再启新的 */
      return;
    }
    ttsHdEnsure().catch(()=>{});
  }
  else if(/^en/i.test(lang)&&!ttsHdOn()&&!_noHd&&!_ttsSysHint){  /* 用户显式关了高清：只提醒一次 */
    _ttsSysHint=true; toast("英文当前用系统语音——想要神经语音音质，到 设置→实验特性 打开「高清英文朗读」");
  }
  _ttsQ.items=_ttsSplitSentences(s); _ttsQ.i=0;
  _ttsQ.el=el||null; _ttsQ.lang=lang; _ttsQ.stopped=false; _ttsQ.rate=ttsGetRate(); _ttsQ.suppress=false;
  if(el) el.classList.add("tts-speaking");
  /* cancel() 后立刻 speak() 会被 Chrome 静默吞掉——稍等一拍再起播 */
  setTimeout(()=>{ if(!_ttsQ.stopped) _ttsPlayNext(synth); },60);
}
function _ttsPlayNext(synth, bare){
  if(_ttsQ.stopped||_ttsQ.paused) return;
  if(_ttsQ.i>=_ttsQ.items.length){ if(_ttsQ.el) _ttsQ.el.classList.remove("tts-speaking"); return; }
  const seg=_ttsQ.items[_ttsQ.i++];
  try{
    const u=new SpeechSynthesisUtterance(seg);
    /* bare 自愈重试也必须调 ttsPickVoice（不带用户偏好、自动挑最高分的），绝不 voice=null——
       Mac 中文 locale 的浏览器默认声道恰恰是中文声音，voicenull 会绕过所有语族兜底，英文就被串成中文 */
    let v=ttsPickVoice(_ttsQ.lang);
    /* 列表未就绪再拉一次，避免被自动挑到脏偏好 */
    if(!v){ _ttsLoadVoices(); v=ttsPickVoice(_ttsQ.lang); }
    /* 语族错配兜底：无论存档怎么脏，中文声音绝不允许被挂到英文朗读上（反之亦然） */
    if(v&&((/^zh/i.test(_ttsQ.lang)&&!/^zh/i.test(v.lang))||(/^en/i.test(_ttsQ.lang)&&!/^en/i.test(v.lang)))) v=null;
    /* 终极兜底：v 仍为 null（Chrome voiceschanged 还没触发、或声音列表为空）时，
       硬编码挑一个默认声音——绝不放 null 给 utterance.voice（Mac 中文 locale 的默认声道就是中文声音！） */
    if(!v){
      const fallbackVoices={
        zh:["Tingting","Meijia","Sinji","YaoYao","Huihui","Kangkang","Li-Mu","Shanshan"],
        en:["Samantha","Aaron","Daniel","Alex","Karen","Moira","Tessa","Vicki"]
      };
      const wantZh=/^zh/i.test(_ttsQ.lang);
      const names=wantZh?fallbackVoices.zh:fallbackVoices.en;
      const all=window.speechSynthesis&&window.speechSynthesis.getVoices?window.speechSynthesis.getVoices():[];
      v=all.find(x=>names.some(n=>new RegExp(n,"i").test(x.name)));
      if(!v) v=all.find(x=>wantZh?/^zh/i.test(x.lang):/^en/i.test(x.lang));
    }
    if(v){ u.voice=v; u.lang=v.lang; } else u.lang=_ttsQ.lang;
    u.rate=(/^zh/i.test(u.lang||_ttsQ.lang)?1:0.9)*(_ttsQ.rate||1); u.pitch=1;
    /* 诊断日志——在 Chrome DevTools Console 搜 [TTS] 就能看到每次挂的声音 */
    console.log("[TTS] lang="+_ttsQ.lang+" pickVoice="+ (v?(v.name+"/"+v.lang):"null") +" → utterance.voice="+(u.voice?(u.voice.name+"/"+u.lang):"null")+" utterance.lang="+u.lang+" text="+(seg.slice(0,40)));
    let started=false;
    u.onstart=()=>{ started=true; _ttsCur=u; };
    u.onend=()=>{ if(_ttsCur===u) _ttsCur=null; if(!_ttsQ.stopped&&!_ttsQ.suppress) _ttsPlayNext(synth); };
    u.onerror=(e)=>{ if(_ttsCur===u) _ttsCur=null;
      if(_ttsQ.el) _ttsQ.el.classList.remove("tts-speaking");
      const code=e&&e.error||"";                 /* 朗读中断要给出原因，不再静默装死 */
      if(code&&code!=="interrupted"&&code!=="canceled") toast("语音中断（"+code+"）——可再点一次 🔊 重试"); };
    _ttsCur=u;                                  /* 持有引用，防 Chrome GC 吞声 */
    synth.speak(u);
    try{ synth.resume(); }catch(e){}            /* Chrome 卡在 paused 态的解卡惯用法 */
    setTimeout(()=>{                            /* 无响应自愈：1.6s 没 onstart → cancel 后重试（始终有 voice，绝不放 null） */
      if(!_ttsQ.stopped&&!_ttsQ.paused&&!started&&_ttsCur===u){
        _ttsCur=null;
        try{ synth.cancel(); }catch(e){}
        _ttsQ.i--;                              /* 回退当前段，换浏览器默认语言声道重放（带 voice） */
        setTimeout(()=>{ if(!_ttsQ.stopped&&!_ttsQ.paused) _ttsPlayNext(synth); },100);
      }
    },1600);
  }catch(e){
    if(_ttsQ.el) _ttsQ.el.classList.remove("tts-speaking");
    toast("语音朗读启动失败："+(e&&e.message||e));
  }
}
function _ttsHalt(){ /* 停系统队列 + HD 音频；不清高亮（由调用方决定） */
  _ttsQ.stopped=true; _ttsQ.paused=false; _ttsQ.items=[]; _ttsQ.i=0; _ttsCur=null;
  try{
    const synth=window.speechSynthesis;
    if(synth){ synth.cancel(); synth.resume(); }  /* resume：解 Chrome「上次暂停后 cancel 仍卡 paused」的残留态 */
  }catch(e){}
  try{
    if(_ttsHdAudio){ _ttsHdAudio.pause(); if(_ttsHdAudio.src&&_ttsHdAudio.src.indexOf("blob:")===0) URL.revokeObjectURL(_ttsHdAudio.src); _ttsHdAudio=null; }
  }catch(e){}
}
function ttsStop(){ /* 停止发声 + 清高亮（面板关闭/切换内容时调用） */
  _ttsHalt(); ttsStopMarks();
}
/* 暂停/继续：系统队列（synth.pause/resume）与 HD 音频（Audio.pause/play）双通道 */
function ttsPause(){
  if(_ttsQ.stopped) return;
  _ttsQ.paused=true;
  try{ window.speechSynthesis&&window.speechSynthesis.pause(); }catch(e){}
  try{ if(_ttsHdAudio) _ttsHdAudio.pause(); }catch(e){}
}
function ttsResume(){
  if(!_ttsQ.paused) return;
  _ttsQ.paused=false;
  const synth=window.speechSynthesis;
  try{ synth&&synth.resume(); }catch(e){}
  try{ if(_ttsHdAudio) _ttsHdAudio.play().catch(()=>{}); }catch(e){}
  /* 暂停落在起播前的 60ms 窗口时 resume 无从恢复——补一脚起播 */
  setTimeout(()=>{ try{
    if(synth&&!synth.speaking&&!synth.paused&&!_ttsQ.stopped&&!_ttsQ.paused&&_ttsQ.i<_ttsQ.items.length) _ttsPlayNext(synth);
  }catch(e){} },80);
}
/* 朗读控制条：⏸ 暂停 / ⏯ 继续 / ⏹ 停止——跟在任何 🔊 按钮后面，bindTtsCtl 一键绑定 */
function ttsCtlHtml(){
  return '<span class="ttsctl" style="display:inline-flex;gap:2px;margin-left:4px;align-items:center">'
    +'<span class="ttshd" style="display:none;font-size:10px;font-weight:700;color:#fff;background:#7c5cff;border-radius:4px;padding:0 4px;letter-spacing:.5px" title="当前走 Kokoro 神经语音（高清）">✨高清</span>'
    +'<button class="btn sm" data-tc="speed" type="button" title="语速：循环 0.75→1→1.25→1.5→2，朗读中点击立即生效" style="padding:1px 7px;font-weight:700">×'+ttsGetRate()+'</button>'
    +'<button class="btn sm" data-tc="pause" type="button" title="暂停朗读" style="padding:1px 7px">⏸</button>'
    +'<button class="btn sm" data-tc="resume" type="button" title="继续朗读" style="padding:1px 7px">⏯</button>'
    +'<button class="btn sm" data-tc="stop" type="button" title="停止朗读" style="padding:1px 7px">⏹</button></span>';
}
function _ttsHdBadge(on){ /* 高清播放中点亮所有控制条的徽标——让用户看清当前走的哪个引擎 */
  try{ document.querySelectorAll(".ttsctl .ttshd").forEach(x=>x.style.display=on?"":"none"); }catch(e){}
}
let _ttsSysHint=false;  /* 「英文走系统语音」提醒一次性标记，防刷屏 */
/* —— 语速：设置页滑杆 + 朗读控制条 ×按钮 共用一份偏好（0.5~2.0，默认 1.0） —— */
function ttsGetRate(){ try{ const r=+(_ttsPrefs().rate); return (r>=0.5&&r<=2)?r:1; }catch(e){ return 1; } }
function ttsSetRate(r, live){
  r=Math.min(2,Math.max(0.5,+r||1));
  try{ const p=_ttsPrefs(); p.rate=r; localStorage.setItem(TTS_STORE,JSON.stringify(p)); }catch(e){}
  _ttsQ.rate=r;
  try{ document.querySelectorAll('.ttsctl [data-tc="speed"]').forEach(b=>b.textContent="×"+r); }catch(e){}
  try{ const sv=document.querySelector("#ttsRateVal"); if(sv) sv.textContent="×"+r;
       const si=document.querySelector("#ttsRate"); if(si&&document.activeElement!==si) si.value=r; }catch(e){}
  /* 系统语音：朗读中改动 → 重读当前段立即生效；HD（Audio 已合成）从下一段生效，段长仅数秒 */
  if(live&&!_ttsQ.stopped&&_ttsQ.items.length&&_ttsQ.i>0&&window.speechSynthesis&&!_ttsHdAudio){
    const synth=window.speechSynthesis;
    _ttsQ.i=Math.max(0,_ttsQ.i-1); _ttsCur=null; _ttsQ.suppress=true;
    try{ synth.cancel(); }catch(e){}
    setTimeout(()=>{ _ttsQ.suppress=false; if(!_ttsQ.stopped&&!_ttsQ.paused) _ttsPlayNext(synth); },120);
  }
  return r;
}
const _TTS_RATES=[0.75,1,1.25,1.5,2];
function ttsRateCycle(){  /* 控制条 ×按钮：循环切换预设语速，朗读中点击立即生效 */
  const cur=_ttsQ.rate||ttsGetRate();
  let ni=_TTS_RATES.findIndex(x=>x>=cur-0.01)+1; if(ni>=_TTS_RATES.length) ni=0;
  return ttsSetRate(_TTS_RATES[ni],true);
}
function bindTtsCtl(host){
  if(!host) return;
  host.querySelectorAll(".ttsctl [data-tc]").forEach(b=>b.onpointerdown=(e)=>{
    try{SFX.tap();}catch(_e){}
    const a=b.dataset.tc;
    if(a==="pause") ttsPause(); else if(a==="resume") ttsResume(); else if(a==="speed") ttsRateCycle(); else { ttsStop(); }
  });
}
function ttsStopMarks(){ try{ document.querySelectorAll(".tts-speaking").forEach(x=>x.classList.remove("tts-speaking")); }catch(e){} }

/* —— HD 英文引擎（Kokoro-82M via esm.sh；国内可达性按「探针→大下载」三级源回退） —— */
const TTS_KOKORO_ID="onnx-community/Kokoro-82M-v1.0-ONNX";
const TTS_KOKORO_SHA="1939ad2a8e416c0acfeecc08a694d14ef25f2231"; /* v1.0 固定提交，用于直取路径 */
const TTS_HOSTS=[ /* 依次尝试：镜像标准路径 → 镜像直取路径（绕 /resolve/ 307）→ 官方源（VPN 环境） */
  { host:"https://hf-mirror.com/", tpl:"{model}/resolve/{revision}/" },
  { host:"https://hf-mirror.com/", tpl:"api/resolve-cache/models/{model}/"+TTS_KOKORO_SHA+"/" },
  { host:"https://huggingface.co/", tpl:"{model}/resolve/{revision}/" }
];
function ttsHdOn(){ try{
  /* file:// 协议下 IndexedDB/fetch 不稳定，Kokoro 模型每次重下还可能失败——自动关 HD */
  if(/^file:/.test(location.protocol)) return false;
  const d=localStorage.getItem(TTS_HD_KEY);
  /* 默认关——Kokoro 88MB 模型下载慢、易失败（99% 卡壳），让用户先用好系统高级语音包（月/美嘉等），
     想试高清再手动开。开了失败就回退系统 TTS，下次进来 HD 还是关的（不反复打扰） */
  return d==="1";
}catch(e){ return /^file:/.test(location.protocol)?false:true; } }
function ttsHdSet(on){
  try{ localStorage.setItem(TTS_HD_KEY,on?"1":"0"); }catch(e){}   /* off 必须显式记 0：默认开的开关不能靠 removeItem */
  if(on&&!_ttsHdInst&&!_ttsHdLoading) ttsHdEnsure().catch(()=>{});
}
function ttsHdPct(){ return Math.min(99,Math.round(_ttsHdPct)); }
function ttsHdStatus(){ /* off|loading|ready|cached|failed —— 供设置页显示 */
  if(_ttsHdInst) return ttsHdOn()?"ready":"cached";
  if(ttsHdOn()) return _ttsHdFailed?"failed":"loading";
  return "off";
}
function _ttsHdFire(type,detail){ try{ document.dispatchEvent(new CustomEvent(type,{detail})); }catch(e){} }
function ttsHdEnsure(){
  if(_ttsHdInst) return Promise.resolve(_ttsHdInst);
  if(_ttsHdLoading) return _ttsHdLoading;
  _ttsHdFailed=false; _ttsHdPct=0;
  const _hdTimeout=(p,ms,tag)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(tag+"超时（"+Math.round(ms/1000)+"s）——网络可能无法访问该源")),ms))]);
  _ttsHdLoading=(async()=>{
    /* ?deps= 令 kokoro-js 内部的 transformers 解析到同一实例，env 改动才对其生效 */
    /* import() 无超时会永远挂起（esm.sh 不可达时状态卡"下载中"）——必须限时 */
    const tf=await _hdTimeout(import("https://esm.sh/@huggingface/transformers@3.7.5"),30000,"esm.sh 模块加载");
    try{ tf.env.allowLocalModels=false; }catch(e){}
    const mod=await _hdTimeout(import("https://esm.sh/kokoro-js@1.2.1?deps=@huggingface/transformers@3.7.5"),30000,"esm.sh 模块加载");
    let lastErr=null;
    for(const h of TTS_HOSTS){
      const base=h.host+h.tpl.replaceAll("{model}",TTS_KOKORO_ID).replaceAll("{revision}","main");
      /* 15s 小文件探针：快速判定该源是否可达，避免大下载卡在坏源上 */
      try{
        const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),15000);
        const r=await fetch(base+"config.json",{signal:ctl.signal}); clearTimeout(timer);
        if(!r.ok) throw new Error("probe HTTP "+r.status);
      }catch(e){ lastErr=e; continue; }
      try{
        tf.env.remoteHost=h.host; tf.env.remotePathTemplate=h.tpl;
        const inst=await mod.KokoroTTS.from_pretrained(TTS_KOKORO_ID,{
          dtype:"q8", device:"wasm",
          progress_callback:p=>{ /* 下载/加载进度 → 设置页实时显示 */
            if(p&&p.status==="progress"&&p.total){ _ttsHdPct=Math.max(_ttsHdPct,(p.loaded/p.total)*100); _ttsHdFire("tts-hd-progress",{pct:_ttsHdPct,file:p.file}); }
          }
        });
        _ttsHdInst=inst; _ttsHdLoading=null;
        _ttsHdFire("tts-hd-ready");
        return inst;
      }catch(e){ lastErr=e; }
    }
    _ttsHdLoading=null; _ttsHdFailed=true;
    /* 失败不写 localStorage("0")——用户偏好仍是开，下次进来自动重试 IndexedDB 缓存（权重其实已下载一次）。
       写 0 会导致下次 HD 是关的、根本不走 HD 路径、也不会用已缓存的权重 */
    /* 打印完整 error 对象到 Console——卡 99% 多半是 from_pretrained 的 verify/load 阶段，不是网络问题 */
    console.error("[TTS-HD] 加载失败完整错误对象：", lastErr);
    console.error("[TTS-HD] 错误堆栈：", lastErr && lastErr.stack ? lastErr.stack : "无 stack");
    console.error("[TTS-HD] 错误 name/message/cause：", lastErr ? {name:lastErr.name, message:lastErr.message, cause:lastErr.cause} : lastErr);
    _ttsHdFire("tts-hd-failed",String(lastErr&&lastErr.message||lastErr));
    try{ toast("高清英文引擎加载失败——已自动回退系统语音；按 ⌥⌘J 打开 DevTools 搜 [TTS-HD] 看完整错误"); }catch(e){}
    throw lastErr;
  })();
  return _ttsHdLoading;
}
async function _ttsHdPlay(inst, text, el){
  _ttsHalt(); _ttsHdBadge(true);   /* 点亮「✨高清」徽标：明确告知用户当前走神经语音 */
  _ttsQ.el=el||null; _ttsQ.lang="en-US"; _ttsQ.stopped=false; _ttsQ.rate=ttsGetRate(); _ttsQ.suppress=false;
  if(el) el.classList.add("tts-speaking");
  try{
    const segs=_ttsSplitSentences(text);
    for(const seg of segs){
      if(_ttsQ.stopped) return;
      while(_ttsQ.paused&&!_ttsQ.stopped){ await new Promise(r=>setTimeout(r,150)); }  /* 段间暂停：挂着等恢复 */
      const buf=await inst.generate(seg,{ voice:"af_heart", speed:(_ttsQ.rate||1) });
      if(_ttsQ.stopped) return;
      while(_ttsQ.paused&&!_ttsQ.stopped){ await new Promise(r=>setTimeout(r,150)); }
      const blob=(buf&&typeof buf.toBlob==="function")?buf.toBlob():new Blob([buf.toWav()],{type:"audio/wav"});
      await new Promise((resolve,reject)=>{
        const a=new Audio(URL.createObjectURL(blob));
        _ttsHdAudio=a;
        a.onended=()=>{ try{URL.revokeObjectURL(a.src);}catch(e){} resolve(); };
        a.onerror=()=>{ try{URL.revokeObjectURL(a.src);}catch(e){} reject(new Error("HD 音频播放失败")); };
        a.play().catch(reject);
      });
    }
    _ttsHdAudio=null;
    if(el&&!_ttsQ.stopped) el.classList.remove("tts-speaking");
  }catch(e){
    _ttsHdBadge(false);
    if(el) el.classList.remove("tts-speaking");
    if(!_ttsQ.stopped){ _ttsHalt(); toast("高清英文本次合成失败——这段临时用系统语音朗读，可再点一次 🔊 重试高清"); ttsSpeak(text,"en-US",el,true); }  /* 回退不再静默 */
  }
}

/* ==================== [6] 进度记录 ==================== */
function unitDone(n, ok, all){
  const v=v25st(); v.done=v.done||{};
  const day=Math.min(25, st.day||1);
  /* v109：虚拟「每日口译新题」单元（90000+day）不进进度账——
     它不在 TASK_UNITS25 里，写进 done 会让「完成数 / 放号分析 / 剩余分钟」全部虚高。
     这里只标当日打卡 + 给奖励，完成状态仍落在日卡 s.done 上。 */
  if(+n>=DYN_BASE){
    Object.keys(v.sheets||{}).forEach(k=>{ const s=v.sheets[k];
      if(s&&s.items&&s.items.some(it=>it.u===n)){ s.done=s.done||{}; s.done[n]=true; } });
    v.dynDone=v.dynDone||{}; v.dynDone[day]=1;
    if(v.runs&&v.runs[n]!=null) delete v.runs[n];
    const gx=Math.round(DYN_MINS*2), gc=Math.round(DYN_MINS*0.8);
    st.xp=(st.xp||0)+gx; st.coin=(st.coin||0)+gc;
    save();
    try{ toast("今日口译完成 · +"+gx+" 修行 · +"+gc+" 灵铢","gold"); refreshStat(false); }catch(e){}
    return { firstPass:true, gainXp:gx, gainCoin:gc, revs:0 };
  }
  let firstPass=false;
  if(!v.done[n]){
    firstPass=true;
    const u=unitByN(n); /* 先取单元（标完成前用户卡还在单元里），登记卡片级完成档案 */
    v.done[n]={ day, ok, all, at:new Date().toISOString(), revs:0 };
    const adds=(v.cards&&v.cards.added)||[];
    if(u&&adds.length){ v.cards.completed=v.cards.completed||[];
      u.items.forEach(it=>{ if(adds.some(c=>c.id===it.id)&&!v.cards.completed.includes(it.id)) v.cards.completed.push(it.id); }); }
  }
  else { const r=v.done[n]; r.lastRev=day; r.revs=(r.revs||0)+1; r.ok=ok; r.all=all; r.at=new Date().toISOString(); }
  if(v.runs&&v.runs[n]!=null) delete v.runs[n]; /* 完成即撤下「进行中」标记 */
  /* 提前修习联动：该单元出现在哪张日卡（含未来日），哪张就标完成 */
  Object.keys(v.sheets||{}).forEach(k=>{ const s=v.sheets[k];
    if(s&&s.items&&s.items.some(it=>it.u===n)){ s.done=s.done||{}; s.done[n]=true; } });
  v._fcache={}; /* 进度已变，未来 3 日预排下次读取时按新状态重算 */
  /* v25 成长奖励：首通足额（约 2 修行值/分钟、0.8 灵铢/分钟），复习减半 */
  const u0=unitByN(n);
  const mins=u0?u0.mins:10;
  const mult=firstPass?1:0.5;
  const gainXp=Math.max(1,Math.round(mins*2*mult));
  const gainCoin=Math.max(1,Math.round(mins*0.8*mult));
  st.xp=(st.xp||0)+gainXp;
  st.coin=(st.coin||0)+gainCoin;
  save();
  try{
    toast((firstPass?"单元初通 · ":"温故知新 · ")+"+"+gainXp+" 修行 · +"+gainCoin+" 灵铢","gold");
    if(firstPass){ checkAch(); checkLevelUp(); }
    refreshStat(false);
  }catch(e){}
  return { firstPass, gainXp, gainCoin, revs:(v.done[n]&&v.done[n].revs)||0 };
}

/* ==================== [7] 执行流公共 ==================== */
const _QNORM=s=>String(s).replace(/[\s，。、；：""''！？（）()·—…《》<>]/g,"").toLowerCase();
function _finBtn(host, ov, u, ok, all, html){
  host.innerHTML=html+'<div style="margin-top:10px"><button class="btn primary" id="v25fin" type="button">完成单元</button></div>';
  const b=ov.querySelector("#v25fin");
  if(b) b.onpointerdown=()=>{ _finNow(host, ov, u, ok, all); };
}
/* 立即结算单元：不依赖流程是否走到最后一步。
   语音识别不可用、或用户不想逐句走完时，用它收尾（手动完成）。 */
function _finNow(host, ov, u, ok, all){
  try{SFX.tap();}catch(e){}
  const r=unitDone(u.n, ok, all)||{};
  /* 必须直接 remove：panel 的关闭按钮只绑了 onpointerdown，c.click() 触发的是 click，
     不会关掉旧面板——旧面板留在屏上、总结面板叠在它上面，用户就在两个面板之间来回循环。 */
  _closePanel(ov);
  _taskSummary(u, ok, all, r);
}
/* 统一关闭 panel：移除节点并撤掉 body 遮罩态（panel 内的 MutationObserver 也会补一次，这里主动做更稳） */
function _closePanel(ov){
  try{ if(ov&&ov.remove) ov.remove(); }catch(e){}
  try{ if(!document.querySelector(".ov")) document.body.classList.remove("ov-open"); }catch(e){}
}
/* —— 任务开篇预告（旧版流程节点①）—— */
function _taskPreview(u){
  const v=v25st(); const rec=v.done&&v.done[u.n];
  const quiz=unitKind(u)==="quiz";
  const pids=u.items.map(it=>(D.pointsLib||[]).find(p=>p.id===it.id)).filter(Boolean);
  const interN=pids.filter(p=>/口译/.test(p.module||"")).length;
  const qaN=pids.filter(p=>p.qa_answer).length;
  const oralN=pids.length-interN-qaN;
  const tap=rec?("已复习 "+(rec.revs||0)+" 次"+(rec.ok!=null?" · 上次答对 "+(rec.all?Math.round(100*rec.ok/rec.all)+"%":"—"):"")):"首次学习";
  const isOralSec=/^ORAL:/.test(String((u.items[0]||{}).id||""));
  const oIt=u.items[0]||{};
  let sub;
  if(isOralSec){
    const vol=(oIt.paras!=null)?('本次覆盖 '+oIt.paras+' 段 / '+(oIt.sents||0)+' 句 / '+(oIt.words||0)+' 词 · '):'';
    sub=vol+'整段读 → 分句精读 → 分句复述 → 整段重读 → 整段复述';
  }
  else if(quiz) sub="笔试考点 "+pids.length+" 个";
  else { const parts=[]; if(interN) parts.push("口译 "+interN+" 道"); if(qaN) parts.push("问答 "+qaN+" 道"); if(oralN) parts.push("复述/讲解 "+oralN+" 段"); sub=parts.join(" · "); }
  const mods=v25Base(u);
  const headHtml=isOralSec
    ? '<div style="margin-bottom:10px"><div style="font-size:19px;font-weight:700;line-height:1.45;color:var(--fg)">'+esc(oIt.title||"")+'</div>'
      +'<div style="font-size:11px;color:var(--dim);margin-top:3px">导游词背诵 · 单元 #'+u.n+'</div></div>'
    : '<h2>今日任务预告 · 单元 #'+u.n+'</h2>';
  const ov=panel(headHtml+'<div id="v25pv" style="margin-top:8px"></div>');
  const host=ov.querySelector("#v25pv");
  host.innerHTML='<div style="font-size:13px;color:var(--dim)">'+esc(String(u.subj||"").replace(/（现场考试）/,""))+'</div>'
    +'<div style="font-size:16px;font-weight:700;margin:6px 0 0">【'+(quiz?"笔试":"面试")+'】</div>'
    +(mods?'<div style="font-size:12.5px;color:var(--dim);margin:2px 0 8px">'+esc(mods)+'</div>':"")
    +'<div style="margin:6px 0 14px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;line-height:2">'
    +'<div>· 内容：'+esc(sub)+'</div>'
    +'<div>· 预计 '+u.mins+' 分钟</div>'
    +'<div>· '+tap+'</div></div>'
    +'<div style="display:flex;gap:8px"><button class="btn primary" id="v25go" type="button">开始任务 →</button>'
    +'<button class="btn sm ghost" id="v25back" type="button">暂不</button></div>';
  host.querySelector("#v25go").onpointerdown=()=>{ try{SFX.tap();}catch(e){}
    ov.remove(); if(quiz) runQuizUnit(u); else runS5Unit(u); };
  host.querySelector("#v25back").onpointerdown=()=>{ try{SFX.tap();}catch(e){} ov.remove(); };
}
function v25Base(u){ const m=(u.mods||[]).slice(0,3).join(" / "); return (u.mods||[]).length>3?m+" …":m; }
/* —— 任务结尾总结（旧版流程节点③）—— */
function _taskSummary(u, ok, all, r){
  const quiz=unitKind(u)==="quiz";
  const pct=all?Math.round(100*ok/all):0;
  const ov=panel('<h2>任务完成 · 单元 #'+u.n+'</h2><div id="v25sum" style="margin-top:8px"></div>');
  const host=ov.querySelector("#v25sum");
  host.innerHTML='<div style="text-align:center;padding:6px 0 2px">'
    +'<div style="font-size:26px;color:var(--ok);font-weight:700">'+esc((u.subj||"").replace(/（现场考试）/,""))+'</div>'
    +'<div style="font-size:13px;color:var(--dim);margin-top:6px">'+(quiz?('答对 '+ok+'/'+all+' · 正确率 '+pct+'%'):('完成 '+all+' 张卡 · 已自评入档'))+'</div></div>'
    +'<div style="margin:12px 0;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;line-height:2">'
    +'<div>· '+(r.firstPass?'首次通过':'温故知新')+' · +'+(r.gainXp||0)+' 修行 · +'+(r.gainCoin||0)+' 灵铢</div>'
    +'<div>· 要点已入星盘，按间隔复习节奏到期自动回到任务单</div></div>'
    +'<button class="btn primary" id="v25done" type="button">确认</button>';
  host.querySelector("#v25done").onpointerdown=()=>{ try{SFX.tap();}catch(e){} ov.remove(); try{render();}catch(e){ renderBoard(); } };
}
function runUnit(n){
  const u=unitByN(n); if(!u){ toast("单元不存在"); return; }
  _taskPreview(u);   /* 开篇预告 → (开始) → 执行流 → (完成) → 结尾总结 */
}

/* ==================== [8] 笔试执行流：AI 出题 + 三段式细解 + 错题入星盘 ==================== */
/* 任务内编辑：有用户校订→富文本渲染（标注重点/笔记）；无→空串（上层走打字机原文） */
function _pointDisp(p){
  if(!p) return "";
  const id="point:"+p.id;
  let edited=false; try{ edited=(typeof editVer==="function")&&editVer(id).length>0; }catch(e){}
  if(edited){ try{ return rich(getEdit(id, p.text||"")); }catch(e){ return esc(p.text||""); } }
  return "";
}
/* oralLib 英文导游词段落的富文本读取 —— editId 形如 "oral:TAM-02:en" */
function _oralDisp(oralId){
  if(!oralId) return "";
  const id="oral:"+oralId+":en";
  let edited=false; try{ edited=(typeof editVer==="function")&&editVer(id).length>0; }catch(e){}
  if(!edited) return "";
  try{
    const orig=originalOf(id)||"";
    return rich(getEdit(id, orig));
  }catch(e){ return ""; }
}
/* 绑定 [data-oral-edit] 按钮到 openEditor —— editId 自动拼成 oral:XXX:en，body 从 oralLib 取 */
function _bindOralEdits(host, redraw){
  if(!host||!host.querySelectorAll) return;
  host.querySelectorAll("[data-oral-edit]").forEach(b=>{
    b.onpointerdown=()=>{ try{SFX.tap();}catch(e){}
      const oralId=b.dataset.oralEdit;
      const sec=(D.oralLib||[]).find(x=>x.id===oralId);
      if(!sec){ toast("未找到该导游词段落"); return; }
      try{
        openEditor({ uid:"oral:"+oralId+":en", editId:"oral:"+oralId+":en", id:oralId, title:oralId+"（英文）", cat:"oral", catLabel:"英文导游词 · "+oralId, body:sec.en||"", onSaved:()=>{ try{ if(redraw) redraw(); }catch(e){} } });
      }catch(e){ toast("编辑器暂不可用"); }
    };
  });
}
/* 把 host 内的 [data-edit] 按钮绑定到 openEditor（富文本校订/笔记） */
function _bindEdits(host, redraw){
  if(!host||!host.querySelectorAll) return;
  host.querySelectorAll("[data-edit]").forEach(b=>{
    b.onpointerdown=()=>{ try{SFX.tap();}catch(e){}
      const pid=b.dataset.edit;
      const pt=(D.pointsLib||[]).find(x=>x.id===pid);
      if(!pt){ toast("该考点已不在库中"); return; }
      try{
        openEditor({ uid:"point:"+pid, editId:"point:"+pid, id:pid, title:pt.title||pid, cat:(pid.slice(0,2)==="S5")?"qoff":"pts", catLabel:pt.module||"考点", body:pt.text||"", onSaved:()=>{ try{ if(redraw) redraw(); }catch(e){} } });
      }catch(e){ toast("编辑器暂不可用"); }
    };
  });
}
/* —— 统一返回历史栈：每次「进入新页面前」push 旧页的重放闭包；
   「← 返回」pop 重放（=严谨回退上一步操作），栈空才关闭面板回主界面 —— */
let _hist=[];
function histReset(){ _hist=[]; }
function histPush(fn){ _hist.push(fn); }
function histBack(){
  while(_hist.length){
    const fn=_hist.pop();
    try{ fn(); return true; }catch(e){ /* 该页重放失败（如卡片已删）→ 继续弹上一层 */ }
  }
  return false;
}
/* 右下角「← 返回」浮动按钮：历史栈回退上一步（阶段/题目/卡片逐层退），栈空关面板回主界面 */
function _addBack(ov){
  if(!ov||!ov.querySelector) return;
  const dlg=ov.querySelector(".dlg"); if(!dlg) return;
  const b=document.createElement("button");
  b.type="button"; b.className="btn sm ghost"; b.textContent="← 返回";
  Object.assign(b.style,{position:"absolute",bottom:"12px",right:"14px",zIndex:"12"});
  dlg.appendChild(b);
  b.onpointerdown=()=>{ try{SFX.tap();}catch(e){} if(histBack()) return; ov.remove(); try{ if(typeof render==="function") render(); }catch(e){} try{ window.V25&&window.V25.refreshBoard&&window.V25.refreshBoard(); }catch(e){} };
  return b;
}
function runQuizUnit(u){
  const v=v25st(); histReset(); _markRun(u);
  const pids=u.items.map(x=>x.id).filter(id=>(D.pointsLib||[]).some(p=>p.id===id));
  const ov=panel('<h2 class="v25crumb"><span class="v25crumb-n">单元 #'+u.n+'</span><span class="v25crumb-m">'+(pids.length+' 个考点 · 约 '+u.mins+' 分钟')+'</span></h2><div id="v25q" style="margin-top:10px"></div>');
  { const dlgEl=ov.querySelector(".dlg"); if(dlgEl) dlgEl.style.paddingBottom="62px"; }   /* 右下角浮动「返回」占位，避免压住末行内容 */
  const host=ov.querySelector("#v25q");
  _addBack(ov);
  const pts=pids.map(pid=>D.pointsLib.find(p=>p.id===pid)).filter(Boolean);
  try{ warmQuiz25(u); }catch(e){}   /* 弹窗一打开就后台预热题单——读原文期间 AI 出题并行完成，进试炼零等待 */
  function drawRead(i){
    if(!ov.isConnected) return;
    const p=pts[i];
    if(!p){ startQuiz(); return; }   /* 越界=进入出题 */
    const disp=_pointDisp(p);   /* 藏经阁校订版富文本（无校订为空串 → 走打字机）；须在图文分离前声明 */
    /* 备考要览：先按分句符切分原文 → 逐段转义 → 段内首个「短标签：」加粗 → 段间换行。
       顺序很关键：split 必须在 esc 之前；加粗字符集也必须排除 ; ——实体（&quot; 等）以 ; 收尾，
       不排除的话正则会长距离跨越实体边界，把引号连同标签一起加粗成乱码。 */
    const tipHtml=p.exam_tip?String(p.exam_tip).split(/[；;]/).map(seg=>esc(seg).replace(/([^；;：:\s]{2,10})[：:]/g,'<b>$1</b> ').trim()).filter(Boolean).join("<br>"):"";
    /* 图文分离：校订富文本里的配图抽到标题下独立图区（.v25gallery），正文不夹图；无图不渲染图区 */
    const _rdRaw=(typeof disp==="string")?disp:"";
    const _rd=/<[a-z][\s\S]*?>/i.test(_rdRaw)? rich(_rdRaw) : esc(_rdRaw);
    const _sp=/\x3Cimg/i.test(_rd)? (typeof splitPointImgs==="function"? splitPointImgs(_rd) : {body:_rd,imgs:[]}) : {body:_rd,imgs:[]};
    const _gal=(typeof pointGalleryHtml==="function")? pointGalleryHtml(_sp.imgs) : "";
    host.innerHTML=
      '<div class="v25rd">'
        +'<div class="v25rd-bar">'
          +'<span class="v25rd-step">原文阅读</span>'
          +'<span class="v25rd-count">考点 '+(i+1)+' / '+pts.length+'</span>'
          +'<span class="v25rd-rule"></span>'
          +'<button class="btn sm" id="v25tts" type="button">🔊 朗读原文</button>'+ttsCtlHtml()
        +'</div>'
        +'<div class="v25rd-head">'
          +'<h3 class="v25rd-title">'+esc(p.title||p.id)+'</h3>'
          +(p.subject?'<span class="v25tag v25tag-subj">'+esc(p.subject)+'</span>':"")
        +'</div>'
        +(_gal
          ? '<div class="v25spread">'+_gal+'<div class="v25rd-paper" id="v25readfull"></div></div>'
          : '<div class="v25rd-paper" id="v25readfull"></div>')
        +(p.anchor?'<div class="v25note v25note-a"><span class="v25tag v25tag-anchor">记忆锚</span><span class="v25anchor-body">'+esc(p.anchor)+'</span></div>':"")
        +(p.exam_tip?'<div class="v25note v25note-t"><span class="v25tag v25tag-tip">备考要览</span><span class="v25tip-body">'+tipHtml+'</span></div>':"")
        +'<div class="v25rd-hint"></div>'
        +'<div class="v25rd-acts">'
          +'<button class="btn sm primary" id="v25readnext" type="button">'+(i+1>=pts.length?"开始答题":"下一考点 →")+'</button>'
          +'<button class="btn sm" id="v25fullskip" type="button">立即显示全文</button>'
          +'<button class="btn sm ghost" id="v25skip" type="button">跳过阅读，直接答题</button>'
          +'<button class="btn sm ghost" data-edit="'+esc(p.id)+'" type="button">✎ 编辑 / 笔记</button>'
        +'</div>'
      +'</div>';
    const rf=ov.querySelector("#v25readfull");
    bindTtsCtl(ov);
    const tb=ov.querySelector("#v25tts"); if(tb) tb.onpointerdown=()=>{ try{SFX.tap();}catch(e){} const t=(typeof _htmlToText==="function")?_htmlToText(_pointDisp(p)||p.text||""):(p.text||""); ttsSpeak(t,"zh-CN",rf); };
    let twSkip=null;
    const hintEl=ov.querySelector(".v25rd-hint");
    const setHint=(t)=>{ if(hintEl) hintEl.textContent=t||""; };
    if(rf){
      if(_sp.body){ rf.innerHTML=_sp.body; }   /* 校订→富文本（图已抽离）；无→打字机（点击正文=展开全文+进入下一条） */
      else { twSkip=_twType(rf, p.text||""); }
      rf.style.cursor="pointer";
      let fullShown=!!_sp.body;   /* 已是富文本全文（无打字机）时，轻点直接翻下一条 */
      setHint(disp?"轻点正文 · 进入下一考点":"轻点正文 · 立即显示全文");
      rf.onpointerdown=(ev)=>{
        if(ev&&ev.target){ const t=ev.target; if(/BUTTON|INPUT|TEXTAREA|A|SELECT/i.test(t.tagName)) return; }
        try{SFX.tap();}catch(e){}
        if(!fullShown){ twSkip&&twSkip(); twSkip=null; fullShown=true; setHint("轻点正文 · 进入下一考点"); return; }
        histPush(()=>drawRead(i)); drawRead(i+1);
      };
      const fs=ov.querySelector("#v25fullskip");
      if(fs) fs.onpointerdown=()=>{ try{SFX.tap();}catch(e){} twSkip&&twSkip(); twSkip=null; fullShown=true; setHint("轻点正文 · 进入下一考点"); };
    }
    _bindEdits(host, ()=>drawRead(i));
    const nb=ov.querySelector("#v25readnext"); if(nb) nb.onpointerdown=()=>{ try{SFX.tap();}catch(e){} histPush(()=>drawRead(i)); drawRead(i+1); };
    const sk=ov.querySelector("#v25skip"); if(sk) sk.onpointerdown=()=>{ try{SFX.tap();}catch(e){} histPush(()=>drawRead(i)); startQuiz(); };
  }
  function startQuiz(){
    const cacheKey="u"+u.n, cached=v.quizCache[cacheKey];
    const instant=Array.isArray(cached)&&cached.length&&!cached.every(z=>/【离线题】/.test((z&&z.why)||""));
    host.innerHTML='<div class="v25qz"><div class="v25res-wait">✦ '+(instant
      ?"题单已就绪，正在装载…"
      :"正在出题…（"+(dsReady()?"AI 出题·含逐项辨析；先去读原文，回来即不用等":"本地模拟题·配置密钥后升级 AI 辨析")+"）")+'</div></div>';
    warmQuiz25(u).then(qs=>{
      if(!ov.isConnected) return;
      go(qs.slice().sort(()=>Math.random()-.5));
    }).catch(e=>{
      if(ov.isConnected) host.innerHTML='<div class="v25qz"><div class="v25res v25res-no">出题失败：'+esc(String((e&&e.message)||e))+'——关闭后重试即可。</div></div>';
    });
  }
  const go=(qs)=>{
    if(!ov.isConnected) return;
    if(!qs||!qs.length){ host.innerHTML='<div class="v25qz"><div class="v25res v25res-no">题池生成失败——关闭后重试即可。</div></div>'; return; }
    let qi=0, ok=0, lastAns=null;   /* lastAns：已答题重放用——返回到已答题时显示当时的解析页，不重复计分 */
    const KL={judge:"是非",blank:"填空",choice:"单选",multi:"多选",wrongone:"选错误项"};
    function draw(){
      if(!ov.isConnected) return;
      if(qi>=qs.length){
        histPush(()=>{ qi=qs.length-1; draw(); });   /* 小结页可退回最后一题解析 */
        _finBtn(host, ov, u, ok, qs.length,
          '<div class="v25qz"><div class="v25res v25res-ok"><div class="v25res-hd">✦ 本单元完成</div>'
          +'答对 '+ok+' / '+qs.length+'（正确率 '+Math.round(ok/Math.max(1,qs.length)*100)+'%）——错题已录入星盘，待回潮日再见。</div></div>');
        return;
      }
      const z=qs[qi];
      if(lastAns&&lastAns.qi===qi){ showResult(z, lastAns.val, lastAns.good); return; }  /* 返回重放：直接显示当时的解析 */
      let h='<div class="v25q-bar"><span class="v25rd-step">试炼</span><span class="v25rd-count">第 '+(qi+1)+' / '+qs.length+' 题</span><span class="v25rd-rule"></span><span class="v25q-kind">'+(KL[z.kind]||"题")+'</span></div>'
        +'<div class="v25q-stem">'+esc(z.q)+'</div>';
      if(z.kind==="judge") h+='<div class="v25q-opts v25q-judge"><button class="btn optbtn" data-a="true" type="button">✔ 对</button><button class="btn optbtn" data-a="false" type="button">✘ 错</button></div>';
      else if(z.kind==="blank") h+='<input id="v25blank" class="v25q-blank" placeholder="在此写下答案…" autocomplete="off"><div style="margin-top:10px"><button class="btn sm primary" id="v25sub" type="button">提交</button></div>';
      else { const multi=z.kind==="multi";
        h+='<div class="v25q-opts">'+(z.opts||[]).map(o=>'<label class="optcard"><input type="'+(multi?"checkbox":"radio")+'" name="v25opt" value="'+esc(o)+'"><span class="optcard-t">'+esc(o)+'</span></label>').join("")+'</div>'
          +'<div style="margin-top:10px"><button class="btn sm primary" id="v25sub" type="button">提交</button></div>'; }
      h+='<div id="v25why" style="margin-top:12px"></div>';
      host.innerHTML='<div class="v25qz">'+h+'</div>';
      function showResult(z, val, good){
        const aTxt=z.kind==="judge"?(z.a===true||z.a==="true"?"对":"错"):(Array.isArray(z.a)?z.a.join("、"):String(z.a));
        const why=ov.querySelector("#v25why");
        why.innerHTML='<div class="v25res v25res-'+(good?"ok":"no")+'">'
          +'<div class="v25res-hd">'+(good?"✔ 回答正确":"✘ 正确答案："+esc(aTxt))+'</div>'
          +(z.why?esc(z.why):"")+'</div>'
          +'<div style="margin-top:10px"><button class="btn sm primary" id="v25next" type="button">'+((qi+1>=qs.length)?"查看小结":"下一题")+'</button></div>';
        host.querySelectorAll("input,button").forEach(b=>{ if(b.id!=="v25next") b.disabled=true; });
        const nb=ov.querySelector("#v25next"); if(nb) nb.onpointerdown=()=>{ try{SFX.tap();}catch(e){} const cur=qi; histPush(()=>{ qi=cur; draw(); }); qi++; draw(); };
      }
      const answer=(val)=>{
        let good=false;
        if(z.kind==="judge") good=(z.a===true&&val==="true")||(z.a===false&&val==="false")||(_QNORM(z.a)===_QNORM(val));
        else if(z.kind==="blank"){ const acc=[z.a].concat(z.accept||[]).map(_QNORM); good=acc.includes(_QNORM(val)); }
        else if(z.kind==="multi"){ const want=new Set((Array.isArray(z.a)?z.a:[z.a]).map(_QNORM)); const got=new Set(val.map(_QNORM)); good=want.size===got.size&&[...want].every(x=>got.has(x)); }
        else good=_QNORM(z.a)===_QNORM(val);
        if(good){ ok++; st.quizOk=(st.quizOk||0)+1; try{srsReview(z.pid,2);}catch(e){} } else { try{srsLapse(z.pid);}catch(e){} }
        lastAns={qi:qi, val:val, good:good};
        showResult(z, val, good);
      };
      if(z.kind==="judge") host.querySelectorAll("[data-a]").forEach(b=>b.onpointerdown=()=>answer(b.dataset.a));
      else { const sub=ov.querySelector("#v25sub");
        if(sub) sub.onpointerdown=()=>{
          if(z.kind==="blank"){ const inp=ov.querySelector("#v25blank"); answer(inp?inp.value:""); }
          else answer([...host.querySelectorAll("input[name=v25opt]:checked")].map(x=>x.value));
        }; }
    }
    draw();
  };
  drawRead(0);
}

/* ==================== [9] 口译执行流：种子卡 + AI 持续出新 + AI 评测 —— 统一 v25rd 卡片 —— */
function renderInterpQ(host, item, next){
  const dirLabel = item.dir==="e2c"?"英译中":"中译英";
  const srcLabel = item.from==="mock"?" · 模拟题":item.from==="ai"?" · AI 新题":"";
  host.innerHTML=
    '<div class="v25rd">'
      +'<div class="v25rd-bar">'
        +'<span class="v25rd-step">口译</span>'
        +'<span class="v25rd-count">'+dirLabel+srcLabel+'</span>'
        +'<span class="v25rd-rule"></span>'
        +'<button class="btn sm" id="v25itts" type="button">🔊 读原文</button>'+ttsCtlHtml()
      +'</div>'
      +'<div class="v25rd-head">'
        +'<h3 class="v25rd-title">'+dirLabel+'</h3>'
      +'</div>'
      +'<div class="v25rd-paper" style="max-height:none;font-size:15px">'+esc(item.src)+'</div>'
      +'<div style="margin-top:12px">'
        +'<textarea data-sp-patch="1" id="v25mine" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:14px;line-height:1.8;background:rgba(255,250,240,.5);resize:vertical" placeholder="写下你的译文，或点语音输入"></textarea>'
      +'</div>'
      +'<div class="v25rd-acts">'
        +'<button class="btn sm primary" id="v25sub" type="button">提交译文</button>'
        +'<button class="btn sm" id="v25asr" type="button">🎙 语音输入</button>'
      +'</div>'
      +'<div id="v25rev" style="margin-top:10px"></div>'
    +'</div>';
  { const tb=host.querySelector("#v25itts"); bindTtsCtl(host);
    if(tb) tb.onpointerdown=()=>{ try{SFX.tap();}catch(e){} ttsSpeak(item.src, item.dir==="e2c"?"en-US":"zh-CN", host.querySelector(".v25rd-paper")); }; }
  let rec=null; const asrBtn=host.querySelector("#v25asr"); const ta=host.querySelector("#v25mine");
  asrBtn.onpointerdown=()=>{
    if(rec){ try{rec.stop();}catch(e){} rec=null; asrBtn.textContent="🎙 语音输入"; return; }
    const dft=asrDraftBinder(ta);
    rec=asrOnce(item.dir==="e2c"?"zh-CN":"en-US",(fin,inter)=>dft.feed(fin,inter),e=>toast(e),()=>ta.isConnected&&host.isConnected);
    if(rec){ try{rec.start(); asrBtn.textContent="■ 停止"; }catch(e){ toast("语音识别启动失败——可直接打字"); } }
  };
  host.querySelector("#v25sub").onpointerdown=()=>{
    if(rec){ try{rec.stop();}catch(e){} rec=null; }
    const mine=ta.value.trim();
    const rev=host.querySelector("#v25rev");
    rev.innerHTML='<div class="note" style="border-left-color:var(--cyber);font-size:13px;line-height:1.8"><b>参考译文</b><br>'+esc(item.ref)
      +(item.points&&item.points.length?'<br><span style="color:var(--dim)">采分点：'+esc(item.points.join("；"))+'</span>':"")
      +(item.tip?'<br><span style="color:var(--dim)">'+esc(item.tip)+'</span>':"")+'</div>'
      +'<div id="v25ai" style="margin-top:6px"></div>'
      +'<div style="margin-top:8px;display:flex;gap:8px">'
      +'<button class="btn sm" data-g="2" type="button">大体无碍</button><button class="btn sm" data-g="1" type="button">断续可修</button><button class="btn sm" data-g="0" type="button">需加强</button></div>';
    if(mine&&dsReady()){ try{ aiTransReview(item.src,mine,item.ref,item.dir,item.key,rev.querySelector("#v25ai"),()=>{}); }catch(e){} }
    rev.querySelectorAll("[data-g]").forEach(b=>b.onpointerdown=()=>{ try{srsReview(item.key,+b.dataset.g);}catch(e){} next(); });
  };
}

/* ==================== [10] 复述执行流（英文 oral / 中文 recite 共用） ==================== */
/* 打字机（旧版逐字显示恢复）：速度接入原有 twSpeed() 调速（默认 200ms，配置页滑杆可调），
   每 tick 揭示 2 字符；返回 skip 供「立即显示全文」打断 */
/* 打字机：纯文本逐字揭示；富文本先打纯文本，打完换成带样式的正文
   opts.forceSpd/forceStep 可覆盖 twSpeed() 全局配置（整段阅读提速用，逐句精读/复述保留用户设置） */
function _twType(el, text, onDone, opts){
  let i=0, done=false, fired=false;
  opts = opts || {};
  let spd = opts.forceSpd || 200; try{ if(!opts.forceSpd && typeof twSpeed==="function") spd=twSpeed()||200; }catch(e){}
  const step = opts.forceStep || (text.length>400 ? 3 : 2);
  const fin=()=>{ if(fired) return; fired=true; try{ if(onDone) onDone(); }catch(e){} };
  (function tick(){
    if(done||!el||!el.isConnected) return;
    if(i>=text.length){ fin(); return; }
    i=Math.min(text.length, i+step);
    el.textContent=text.slice(0,i);
    el.scrollTop=el.scrollHeight;
    setTimeout(tick, spd);
  })();
  return ()=>{ done=true; if(el) el.textContent=text; fin(); };
}
function drawRecite(host, p, next, lang){
  const text=String(p.text||"").trim();
  const en=lang==="en-US";
  const mod=p.module||"";
  /* 分类纠正：只有「景点讲解·」才是导游词；综合能力/风物特产/服务规范/时政等是「知识卡」 */
  const isTour=/景点讲解/.test(mod);
  const label = en ? (isTour?"英文导游词":"英文知识卡") : (isTour?"中文景点讲解":"中文知识点");
  /* 检测是否挂到 oralLib 英文导游词（title 里带 TAM-02/GUG-01 等编号） */
  let oralId=null, oralSec=null;
  try{
    const m=String(p.title||"").match(/\b(TAM|GUG|TAN|SUM|WAL|TOM)-(\d{1,2})\b/);
    if(m){
      oralId=m[1]+"-"+String(m[2]).padStart(2,"0");
      oralSec=(D.oralLib||[]).find(s=>s.id===oralId);
    }
  }catch(e){}
  const hasOralEn = !!(en && oralSec && oralSec.en);
  /* 句级拆分：导游词按句切分，走「全段阅读→逐句精读→全段复述」三段式 */
  const bodyText = hasOralEn ? String(oralSec.en).trim() : text;
  const zhText = hasOralEn ? String(oralSec.zh||"").trim() : text.replace(/【中文对照】[^\n]*$/,"").trim();
  const sents=_oralSplitSent(bodyText).filter(s=>s.length>1);
  const useSentence = isTour && sents.length>=2;
  /* disp：优先 oral 英文编辑记录，fallback point 中文 */
  const disp = (hasOralEn ? _oralDisp(oralId) : "") || _pointDisp(p);
  /* 阶段① 全段阅读（打字机）—— 统一用 v25rd 卡片 + 图文分离 */
  function renderRead(){
    /* 图文分离：富文本里的配图抽到标题下独立图区 */
    const _rdRaw=(typeof disp==="string")?disp:"";
    const _rd=/<[a-z][\s\S]*?>/i.test(_rdRaw)? rich(_rdRaw) : esc(_rdRaw);
    const _sp=/\x3Cimg/i.test(_rd)? (typeof splitPointImgs==="function"? splitPointImgs(_rd) : {body:_rd,imgs:[]}) : {body:_rd,imgs:[]};
    const _gal=(typeof pointGalleryHtml==="function")? pointGalleryHtml(_sp.imgs) : "";
    /* 编辑按钮：有 oralId → 绑 oral 英文编辑；否则绑 point 中文编辑 */
    const editBtnHtml = hasOralEn
      ? '<button class="btn sm ghost" data-oral-edit="'+esc(oralId)+'" type="button" title="编辑英文">✎ 编辑英文</button>'
      : '<button class="btn sm ghost" data-edit="'+esc(p.id)+'" type="button">✎ 编辑/笔记</button>';
    host.innerHTML=
      '<div class="v25rd">'
        +'<div class="v25rd-bar">'
          +'<span class="v25rd-step">'+label+' · 全段阅读</span>'
          +'<span class="v25rd-rule"></span>'
          +'<button class="btn sm" id="v25tts" type="button">🔊 朗读</button>'+ttsCtlHtml()
        +'</div>'
        +'<div class="v25rd-head">'
          +'<h3 class="v25rd-title">'+esc(p.title||p.id)+'</h3>'
          +(p.module?'<span class="v25tag v25tag-subj">'+esc(p.module)+'</span>':"")
        +'</div>'
        +(_gal
          ? '<div class="v25spread">'+_gal+'<div class="v25rd-paper" id="v25full"></div></div>'
          : '<div class="v25rd-paper" id="v25full"></div>')
        +(hasOralEn && !disp && zhText? '<div style="font-size:12px;color:var(--dim);line-height:1.8;margin-top:6px;border-left:2px solid var(--line);padding-left:8px">【中文对照】'+esc(zhText)+'</div>':"")
        +'<div class="v25rd-acts">'
          +'<button class="btn sm primary" id="v25rec" type="button">🎙 '+(useSentence?"开始逐句精读":"开始复述")+'</button>'
          +'<button class="btn sm" id="v25twskip" type="button">立即显示全文</button>'
          +editBtnHtml+'</div>'
      +'</div>';
    const full=host.querySelector("#v25full");
    if(disp){ full.innerHTML=_sp.body; full.style.cursor="default"; } else { const sk=_twType(full, bodyText); full.style.cursor="pointer"; full.title="点击立即显示全文"; full.onpointerdown=(ev)=>{ try{SFX.tap();}catch(e){} if(ev&&ev.target){ const t=ev.target; if(/BUTTON|INPUT|TEXTAREA|A|SELECT/i.test(t.tagName)) return; } sk&&sk(); }; }
    const tb=host.querySelector("#v25tts"); bindTtsCtl(host); if(tb) tb.onpointerdown=()=>{ try{SFX.tap();}catch(e){} const t=(typeof _htmlToText==="function")?_htmlToText(disp||bodyText):bodyText; ttsSpeak(t, lang, full); };
    _bindEdits(host, ()=>renderRead());
    _bindOralEdits(host, ()=>renderRead());
    host.querySelector("#v25twskip").onpointerdown=()=>{ try{SFX.tap();}catch(e){} full.innerHTML=disp?_sp.body:esc(bodyText); };
    host.querySelector("#v25rec").onpointerdown=()=>{ try{SFX.tap();}catch(e){} histPush(renderRead); if(useSentence){ renderSentence(0); } else { renderRetell(); } };
  }
  /* 阶段② 逐句精读+复述（仅导游词） */
  function renderSentence(i){
    if(i>=sents.length){ histPush(()=>renderSentence(Math.max(0,sents.length-1))); renderRetell(); return; }
    const s=String(sents[i]||"").trim();
    /* 从该卡的富文本编辑记录里抽出配图 */
    let gal="";
    if(disp && /\x3Cimg/i.test(disp)){
      const _sp=(typeof splitPointImgs==="function"? splitPointImgs(disp) : {body:disp,imgs:[]});
      gal=_sp.imgs.length && (typeof pointGalleryHtml==="function")? pointGalleryHtml(_sp.imgs) : "";
    }
    /* 编辑按钮 */
    const editBtnHtml = hasOralEn
      ? '<button class="btn sm ghost" data-oral-edit="'+esc(oralId)+'" type="button" style="margin-left:6px">✎ 编辑英文</button>'
      : '<button class="btn sm ghost" data-edit="'+esc(p.id)+'" type="button" style="margin-left:6px">✎ 编辑</button>';
    /* 正文区：有图 → v25spread（gallery 左，paper#v25sent 右）；无图 → 单独 paper#v25sent */
    const bodyBlock = gal
      ? '<div class="v25spread">'+gal+'<div class="v25rd-paper" id="v25sent" style="min-height:40px;font-size:15px"></div></div>'
      : '<div class="v25rd-paper" id="v25sent" style="min-height:40px;font-size:15px"></div>';
    host.innerHTML=
      '<div class="v25rd">'
        +'<div class="v25rd-bar">'
          +'<span class="v25rd-step">'+label+' · 逐句精读</span>'
          +'<span class="v25rd-count">'+(i+1)+'/'+sents.length+'</span>'
          +'<span class="v25rd-rule"></span>'
          +'<button class="btn sm" id="v25stts" type="button">🔊 读本句</button>'+ttsCtlHtml()
        +'</div>'
        +'<div class="v25rd-head">'
          +'<h3 class="v25rd-title">'+esc(p.title||p.id)+'</h3>'
          +editBtnHtml
        +'</div>'
        +bodyBlock
        +'<div class="v25rd-acts">'
          +'<button class="btn sm" id="v25sprev" type="button">◀ 上一句</button>'
          +'<button class="btn sm primary" id="v25srec" type="button">🎙 复述本句</button>'
          +'<button class="btn sm" id="v25snext" type="button">跳过本句 →</button>'
        +'</div>'
        +'<div id="v25shost" style="margin-top:4px"></div>'
      +'</div>';
    const se=host.querySelector("#v25sent");
    if(se){ const sk=_twType(se, s); se.style.cursor="pointer"; se.title="点击立即显示"; se.onpointerdown=(ev)=>{ try{ if(ev&&ev.target){ const t=ev.target; if(/BUTTON|INPUT|TEXTAREA|A|SELECT/i.test(t.tagName)) return; } SFX.tap();}catch(e){} sk&&sk(); }; }
    bindTtsCtl(host);
    host.querySelector("#v25stts").onpointerdown=()=>{ try{SFX.tap();}catch(e){} ttsSpeak(s, lang, se); };
    _bindEdits(host, ()=>renderSentence(i));
    _bindOralEdits(host, ()=>renderSentence(i));
    host.querySelector("#v25sprev").onpointerdown=()=>{ try{SFX.tap();}catch(e){} renderSentence(Math.max(0,i-1)); };
    host.querySelector("#v25snext").onpointerdown=()=>{ try{SFX.tap();}catch(e){} histPush(()=>renderSentence(i)); renderSentence(i+1); };
    host.querySelector("#v25srec").onpointerdown=()=>{
      try{SFX.tap();}catch(e){}
      const sh=host.querySelector("#v25shost");
      sh.innerHTML='<textarea data-sp-patch="1" id="v25ssaid" rows="2" style="width:100%;padding:8px;margin-top:4px" placeholder="复述本句（可打字或语音）"></textarea>'
        +'<div style="margin-top:6px;display:flex;gap:8px"><button class="btn sm primary" id="v25sok" type="button">完成本句</button>'
        +'<button class="btn sm" id="v25sasr" type="button">🎙 语音</button></div>';
      const ta=sh.querySelector("#v25ssaid"); let rec=null;
      sh.querySelector("#v25sasr").onpointerdown=()=>{ if(rec){ try{rec.stop();}catch(x){} rec=null; return; } const dft=asrDraftBinder(ta); rec=asrOnce(lang,(f,it)=>dft.feed(f,it),e=>toast(e),()=>ta.isConnected&&host.isConnected); if(rec){ try{rec.start();}catch(e){ toast("语音识别不可用——请打字"); } } };
      sh.querySelector("#v25sok").onpointerdown=()=>{ try{SFX.tap();}catch(e){} if(rec){ try{rec.stop();}catch(x){} } try{srsReview(p.id,2);}catch(x){} histPush(()=>renderSentence(i)); renderSentence(i+1); };
    };
  }
  /* 阶段③ 全段复述 —— 偷看原文展示含图富文本 */
  function renderRetell(){
    /* 偷看原文：单卡含图富文本 */
    let peekHtml="";
    if(disp){
      const _rd=/\x3Cimg/i.test(disp)? (typeof splitPointImgs==="function"? splitPointImgs(disp) : {body:disp,imgs:[]}) : {body:disp,imgs:[]};
      const gal=(typeof pointGalleryHtml==="function")? pointGalleryHtml(_rd.imgs) : "";
      peekHtml = gal
        ? '<div class="v25spread">'+gal+'<div class="v25rd-paper" style="max-height:none">'+_rd.body+'</div></div>'
        : '<div class="v25rd-paper" style="max-height:none">'+_rd.body+'</div>';
    } else {
      peekHtml = '<div class="v25rd-paper" style="max-height:none">'+esc(bodyText)+'</div>';
      if(hasOralEn && zhText) peekHtml += '<div style="font-size:12px;color:var(--dim);margin:4px 0;border-left:2px solid var(--line);padding-left:8px">【中文对照】'+esc(zhText)+'</div>';
    }
    host.innerHTML=
      '<div class="v25rd">'
        +'<div class="v25rd-bar">'
          +'<span class="v25rd-step">'+label+' · '+(isTour?"全段复述":"脱稿复述")+'</span>'
          +'<span class="v25rd-rule"></span>'
        +'</div>'
        +'<div class="v25rd-head">'
          +'<h3 class="v25rd-title">'+esc(p.title||p.id)+'</h3>'
        +'</div>'
        +'<div style="margin-top:4px">'
          +'<textarea data-sp-patch="1" id="v25said" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:14px;line-height:1.8;background:rgba(255,250,240,.5);resize:vertical" placeholder="复述内容实时上屏，也可直接打字"></textarea>'
        +'</div>'
        +'<div class="v25rd-acts">'
          +'<button class="btn sm primary" id="v25recagain" type="button">🎙 语音复述</button>'
          +'<button class="btn sm" id="v25typed" type="button">我已复述，查看对照</button>'
          +'<button class="btn sm" id="v25repeek" type="button">👁 偷看原文</button>'
        +'</div>'
        +'<div id="v25peek" style="margin-top:6px"></div>'
        +'<div id="v25score" style="margin-top:8px"></div>'
      +'</div>';
    const ta=host.querySelector("#v25said"); const btn=host.querySelector("#v25recagain");
    let rec=null;
    function score(){
      if(rec){ try{rec.stop();}catch(e){} rec=null; btn.textContent="🎙 语音复述"; }
      const said=ta.value||""; let cov=0;
      if(en){ const rw=new Set((bodyText.toLowerCase().match(/[a-z]+/g)||[])); const sw=new Set((said.toLowerCase().match(/[a-z]+/g)||[]));
        cov=rw.size?Math.round(100*[...rw].filter(w=>sw.has(w)).length/rw.size):0; }
      else { const rc=new Set((bodyText.match(/[一-鿿]/g)||[])); const sc=new Set((said.match(/[一-鿿]/g)||[]));
        cov=rc.size?Math.round(100*[...rc].filter(c=>sc.has(c)).length/rc.size):0; }
      const box=host.querySelector("#v25score");
      box.innerHTML='<div class="note" style="border-left-color:'+(cov>=70?"var(--ok)":cov>=40?"var(--gold)":"var(--danger)")+';font-size:13px">要点覆盖率约 '+cov+'%'
        +(cov>=70?"——复述完整":cov>=40?"——大意已到，细节再补":"——建议看着原文再来一遍")+'</div>'
        +'<div style="margin-top:8px;display:flex;gap:8px">'
        +'<button class="btn sm" data-g="2" type="button">清晰</button><button class="btn sm" data-g="1" type="button">模糊</button><button class="btn sm" data-g="0" type="button">想不起来</button></div>';
      box.querySelectorAll("[data-g]").forEach(b=>b.onpointerdown=()=>{ try{srsReview(p.id,+b.dataset.g);}catch(e){} next(); });
    }
    btn.onpointerdown=()=>{
      if(rec){ score(); return; }
      const dft=asrDraftBinder(ta);
      rec=asrOnce(lang,(fin,inter)=>dft.feed(fin,inter),e=>toast(e),()=>ta.isConnected&&host.isConnected);
      if(rec){ try{rec.start(); btn.textContent="■ 完成"; }catch(e){ toast("语音识别启动失败——可直接打字"); } }
    };
    host.querySelector("#v25typed").onpointerdown=score;
    host.querySelector("#v25repeek").onpointerdown=()=>{ try{SFX.tap();}catch(e){} host.querySelector("#v25peek").innerHTML=peekHtml; };
  }
  renderRead();
}

/* —— 同景点连续讲解卡合组：整段三段式「全段阅读 → 逐句精读+复述 → 全段复述」 —— */
function drawReciteGroup(host, ps, next){
  const p0=ps[0];
  /* 挂接英文导游词：卡 title 带语料编号（如 TAM-02）→ oralLib 125 句语料对应句（en+zh 双语） */
  function _oralSec(p){
    try{
      const m=String(p.title||"").match(/\b(TAM|GUG|TAN|SUM|WAL|TOM)-(\d{1,2})\b/);
      if(!m) return null;
      const id=m[1]+"-"+String(m[2]).padStart(2,"0");
      const hit=(D.oralLib||[]).find(s=>s.id===id);
      const enTxt=hit?String(hit.en||"").trim():"";
      return enTxt?{en:enTxt,zh:String(hit.zh||"").trim()}:null;
    }catch(e){ return null; }
  }
  const secs=ps.map(_oralSec);
  /* 额外提取 oralId（如 "TAM-02"）供编辑按钮绑定用 */
  const oralIds=secs.map(o=>{
    if(!o) return null;
    try{
      const m=String(ps[secs.indexOf(o)].title||"").match(/\b(TAM|GUG|TAN|SUM|WAL|TOM)-(\d{1,2})\b/);
      return m?(m[1]+"-"+String(m[2]).padStart(2,"0")):null;
    }catch(e){ return null; }
  });
  const en=secs.some(Boolean);                 /* 组内任一卡挂到英文导游词 → 全组按英文导游词走（中文只做对照） */
  const lang=en?"en-US":"zh-CN";
  const label=en?"英文导游词":"中文景点讲解";
  /* 每卡正文：英文组取语料英文句（卡内中文作对照），disp 优先 oral 英文编辑记录；中文组取整段 */
  const fulls=ps.map((p,i)=>{
    const t=String(p.text||"").trim();
    const zh=t.replace(/【中文对照】[^\n]*$/,"").trim();
    const oralId=oralIds[i];
    if(en){
      const o=secs[i];
      /* 优先 oral 英文编辑记录，fallback point 中文编辑记录，最后空串走打字机 */
      const disp=_oralDisp(oralId) || _pointDisp(p);
      return { p:p, oralId:oralId, text:t, disp:disp, body:o?o.en:(t.split("\n")[0]||"").trim(), zh:zh||o&&o.zh||"" };
    }
    return { p:p, oralId:null, text:t, disp:_pointDisp(p), body:zh, zh:"" };
  });
  const whole=en ? fulls.map(f=>f.body).join(" ") : fulls.map(f=>f.body).join("\n");
  /* 合并分句（带所属卡下标） */
  const sents=[];
  fulls.forEach((f,pi)=>{
    (en ? _oralSplitSent(f.body) : f.body.split(/(?<=[。！？])/))
      .map(s=>s.trim()).filter(s=>s.length>1).forEach(s=>sents.push({s:s, pi:pi}));
  });
  /* 阶段① 全段阅读：全部段落一次铺开（含中文对照），打字机逐段连打，点击正文/按钮一键展开全文 —— 统一用 v25rd 卡片 + 图文分离 */
  function renderRead(){
    /* 每卡独立做图文分离 */
    const cardParts = fulls.map((f,fi)=>{
      if(f.disp){
        const _rdRaw=f.disp;
        const _rd=/<[a-z][\s\S]*?>/i.test(_rdRaw)? rich(_rdRaw) : esc(_rdRaw);
        const _sp=/\x3Cimg/i.test(_rd)? (typeof splitPointImgs==="function"? splitPointImgs(_rd) : {body:_rd,imgs:[]}) : {body:_rd,imgs:[]};
        const _gal=(typeof pointGalleryHtml==="function")? pointGalleryHtml(_sp.imgs) : "";
        return { f, fi, hasDisp:true, body:_sp.body, gal:_gal, zh:f.zh };
      }
      return { f, fi, hasDisp:false, body:"", gal:"", zh:f.zh };
    });
    const cardsHtml = cardParts.map(c=>{
      const f=c.f, fi=c.fi;
      /* 编辑按钮：英文组有 oralId → 绑 oral 英文编辑；否则绑 point 中文编辑 */
      const editBtn = (en && f.oralId)
        ? '<button class="btn sm" data-oral-edit="'+esc(f.oralId)+'" type="button" style="margin-left:4px;padding:1px 8px;font-size:11px" title="编辑英文">✎</button>'
        : '<button class="btn sm" data-edit="'+esc(f.p.id)+'" type="button" style="margin-left:4px;padding:1px 8px;font-size:11px">✎</button>';
      const headRow='<div style="font-size:11px;color:var(--gold);margin-bottom:4px;display:flex;align-items:center">'+esc(f.p.id+' · '+(f.p.title||""))+'<button class="btn sm" data-tts="g'+fi+'" type="button" style="margin-left:auto;padding:1px 8px;font-size:11px">🔊</button>'+editBtn+'</div>';
      if(c.hasDisp){
        const zhBlock = en && !/中文对照/.test(f.disp) && c.zh
          ? '<div style="font-size:12px;color:var(--dim);line-height:1.8;margin-top:4px;border-left:2px solid var(--line);padding-left:8px">【中文对照】'+esc(c.zh)+'</div>'
          : '';
        /* 有图 → v25spread 两栏（gallery 左、paper 右）；无图 → 单 paper */
        const bodyBlock = c.gal
          ? '<div class="v25spread">'+c.gal+'<div class="v25rd-paper" style="max-height:none">'+c.body+'</div></div>'
          : '<div class="v25rd-paper" style="max-height:none">'+c.body+'</div>';
        return '<div style="margin-bottom:12px">'+headRow+bodyBlock+zhBlock+'</div>';
      }
      /* 无富文本 → 打字机 */
      const twBlock = '<div class="v25rd-paper" data-tw="'+fi+'" style="max-height:none;min-height:24px;cursor:pointer;font-size:14.5px" title="点击立即显示全文"></div>';
      const zhBlock = en && c.zh
        ? '<div style="font-size:12px;color:var(--dim);line-height:1.8;margin-top:4px;border-left:2px solid var(--line);padding-left:8px">【中文对照】'+esc(c.zh)+'</div>'
        : '';
      return '<div style="margin-bottom:12px">'+headRow+twBlock+zhBlock+'</div>';
    }).join('');
    host.innerHTML=
      '<div class="v25rd">'
        +'<div class="v25rd-bar">'
          +'<span class="v25rd-step">'+label+' · 全段阅读</span>'
          +'<span class="v25rd-count">共 '+ps.length+' 段</span>'
          +'<span class="v25rd-rule"></span>'
          +'<button class="btn sm" id="v25gtts" type="button">🔊 连读全篇</button>'+ttsCtlHtml()
        +'</div>'
        +'<div class="v25rd-head">'
          +'<h3 class="v25rd-title">'+esc(p0.title||p0.id)+'</h3>'
        +'</div>'
        +'<div style="max-height:340px;overflow:auto">'+cardsHtml+'</div>'
        +'<div class="v25rd-acts">'
          +'<button class="btn sm primary" id="v25gsent" type="button">🎙 开始逐句精读（共 '+sents.length+' 句）</button>'
          +'<button class="btn sm" id="v25gskip" type="button">立即显示全文</button>'
        +'</div>'
      +'</div>';
    const gwrap=host.querySelector("[style*='max-height:340px']");
    _bindEdits(host, ()=>renderRead());
    _bindOralEdits(host, ()=>renderRead());
    /* 打字机逐段连打（速度走配置页滑杆）；skip 一键展开全部 */
    let skipAll=null;
    (function(){
      const queue=[];
      fulls.forEach((f,fi)=>{
        const el=host.querySelector("[data-tw='"+fi+"']");
        if(el) queue.push({el:el, text:en?f.body:f.text});
      });
      if(!queue.length) return;
      let qi=0, dead=false, cur=null;
      const next=()=>{ if(dead||qi>=queue.length) return; const q=queue[qi++]; cur=_twType(q.el, q.text, ()=>next()); };
      next();
      skipAll=()=>{ if(dead) return; dead=true; const c=cur; queue.forEach(q=>{ q.el.textContent=q.text; }); c&&c(); };
    })();
    if(skipAll){
      gwrap.onpointerdown=(e)=>{ try{ if(e.target&&e.target.closest&&e.target.closest("button")) return; }catch(_e){} skipAll(); };
      host.querySelector("#v25gskip").onpointerdown=()=>{ try{SFX.tap();}catch(e){} skipAll(); };
    } else { const sb=host.querySelector("#v25gskip"); if(sb) sb.remove(); }
    bindTtsCtl(host); host.querySelector("#v25gtts").onpointerdown=()=>{ try{SFX.tap();}catch(e){} ttsSpeak((typeof _htmlToText==="function")?_htmlToText(whole):whole, lang, gwrap); };
    host.querySelectorAll("[data-tts^='g']").forEach(b=>b.onpointerdown=()=>{ try{SFX.tap();}catch(e){} const f=fulls[+b.dataset.tts.slice(1)]; const card=b.closest('[style*="margin-bottom:12px"]')||b.parentElement.parentElement; const tgt=card?card.querySelector(".v25rd-paper"):null; ttsSpeak(f.body, lang, tgt); });
    host.querySelector("#v25gsent").onpointerdown=()=>{ try{SFX.tap();}catch(e){} histPush(renderRead); renderSentence(0); };
  }
  /* 阶段② 逐句精读+复述 —— 核心逻辑：配图展示该段落图片，正文打字机只打当前句，两者共存 */
  function renderSentence(i){
    if(i>=sents.length){ histPush(()=>renderSentence(Math.max(0,sents.length-1))); renderRetell(); return; }
    const it=sents[i], f=fulls[it.pi], p=f.p;
    /* 从该段落的富文本编辑记录里抽出配图 */
    let gal="";
    if(f.disp && /\x3Cimg/i.test(f.disp)){
      const _sp=(typeof splitPointImgs==="function"? splitPointImgs(f.disp) : {body:f.disp,imgs:[]});
      gal=_sp.imgs.length && (typeof pointGalleryHtml==="function")? pointGalleryHtml(_sp.imgs) : "";
    }
    /* 编辑按钮：优先 oral 英文 */
    const editBtnHtml = (en && f.oralId)
      ? '<button class="btn sm ghost" data-oral-edit="'+esc(f.oralId)+'" type="button" style="margin-left:6px">✎ 编辑英文</button>'
      : '<button class="btn sm ghost" data-edit="'+esc(p.id)+'" type="button" style="margin-left:6px">✎ 编辑</button>';
    /* 正文区：有图 → v25spread（gallery 左，paper#v25sent 右）；无图 → 单独 paper#v25sent */
    const bodyBlock = gal
      ? '<div class="v25spread">'+gal+'<div class="v25rd-paper" id="v25sent" style="min-height:40px;font-size:15px"></div></div>'
      : '<div class="v25rd-paper" id="v25sent" style="min-height:40px;font-size:15px"></div>';
    host.innerHTML=
      '<div class="v25rd">'
        +'<div class="v25rd-bar">'
          +'<span class="v25rd-step">'+label+' · 逐句精读</span>'
          +'<span class="v25rd-count">'+(i+1)+'/'+sents.length+'</span>'
          +'<span class="v25rd-rule"></span>'
          +'<button class="btn sm" id="v25stts" type="button">🔊 读本句</button>'+ttsCtlHtml()
        +'</div>'
        +'<div class="v25rd-head">'
          +'<h3 class="v25rd-title">'+esc(p.id+' · '+(p.title||""))+'</h3>'
          +editBtnHtml
        +'</div>'
        +bodyBlock
        +'<div class="v25rd-acts">'
          +'<button class="btn sm" id="v25sprev" type="button">◀ 上一句</button>'
          +'<button class="btn sm primary" id="v25srec" type="button">🎙 复述本句</button>'
          +'<button class="btn sm" id="v25snext" type="button">跳过本句 →</button>'
        +'</div>'
        +'<div id="v25shost" style="margin-top:4px"></div>'
      +'</div>';
    const se=host.querySelector("#v25sent");
    if(se){ const sk=_twType(se, it.s); se.style.cursor="pointer"; se.title="点击立即显示"; se.onpointerdown=(ev)=>{ try{ if(ev&&ev.target){ const t=ev.target; if(/BUTTON|INPUT|TEXTAREA|A|SELECT/i.test(t.tagName)) return; } SFX.tap();}catch(e){} sk&&sk(); }; }
    bindTtsCtl(host);
    host.querySelector("#v25stts").onpointerdown=()=>{ try{SFX.tap();}catch(e){} ttsSpeak(it.s, lang, se); };
    /* 自动朗读：进入句级页即播报本句（已切页时旧节点脱离，不再补播） */
    setTimeout(()=>{ try{ if(host.isConnected&&se&&se.isConnected) ttsSpeak(it.s, lang, se); }catch(e){} },240);
    _bindEdits(host, ()=>renderSentence(i));
    _bindOralEdits(host, ()=>renderSentence(i));
    host.querySelector("#v25sprev").onpointerdown=()=>{ try{SFX.tap();}catch(e){} renderSentence(Math.max(0,i-1)); };
    host.querySelector("#v25snext").onpointerdown=()=>{ try{SFX.tap();}catch(e){} histPush(()=>renderSentence(i)); renderSentence(i+1); };
    host.querySelector("#v25srec").onpointerdown=()=>{
      try{SFX.tap();}catch(e){}
      ttsStop();
      const sh=host.querySelector("#v25shost");
      sh.innerHTML='<textarea data-sp-patch="1" id="v25ssaid" rows="2" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:14px;line-height:1.8;background:rgba(255,250,240,.5);resize:vertical;margin-top:4px" placeholder="复述本句（可打字或语音）"></textarea>'
        +'<div style="margin-top:6px;display:flex;gap:8px"><button class="btn sm primary" id="v25sok" type="button">完成本句</button>'
        +'<button class="btn sm" id="v25sasr" type="button">🎙 语音</button></div>';
      const ta=sh.querySelector("#v25ssaid"); let rec=null;
      sh.querySelector("#v25sasr").onpointerdown=()=>{ if(rec){ try{rec.stop();}catch(x){} rec=null; return; } const dft=asrDraftBinder(ta); rec=asrOnce(lang,(fin,it2)=>dft.feed(fin,it2),e=>toast(e),()=>ta.isConnected&&host.isConnected); if(rec){ try{rec.start();}catch(e){ toast("语音识别不可用——请打字"); } } };
      sh.querySelector("#v25sok").onpointerdown=()=>{ try{SFX.tap();}catch(e){} if(rec){ try{rec.stop();}catch(x){} } try{srsReview(p.id,2);}catch(x){} histPush(()=>renderSentence(i)); renderSentence(i+1); };
    };
  }
  /* 阶段③ 全段复述：整篇对照 + 自评 —— 偷看原文时展示含图富文本 */
  function renderRetell(){
    /* 偷看用：汇总有富文本的段落（每卡独立图文分离） */
    const peekHtml = fulls.map((f,fi)=>{
      if(f.disp){
        const _rd=/\x3Cimg/i.test(f.disp)? (typeof splitPointImgs==="function"? splitPointImgs(f.disp) : {body:f.disp,imgs:[]}) : {body:f.disp,imgs:[]};
        const gal=(typeof pointGalleryHtml==="function")? pointGalleryHtml(_rd.imgs) : "";
        const body= gal
          ? '<div class="v25spread" style="margin-bottom:8px">'+gal+'<div class="v25rd-paper" style="max-height:none">'+_rd.body+'</div></div>'
          : '<div class="v25rd-paper" style="max-height:none;margin-bottom:8px">'+_rd.body+'</div>';
        return body;
      }
      const tw = '<div class="v25rd-paper" style="max-height:none;margin-bottom:8px">'+esc(f.body)+'</div>';
      const zh = en && f.zh ? '<div style="font-size:12px;color:var(--dim);margin:4px 0 8px;border-left:2px solid var(--line);padding-left:8px">【中文对照】'+esc(f.zh)+'</div>' : '';
      return tw+zh;
    }).join('');
    host.innerHTML=
      '<div class="v25rd">'
        +'<div class="v25rd-bar">'
          +'<span class="v25rd-step">'+label+' · 全段复述</span>'
          +'<span class="v25rd-count">'+ps.length+' 段</span>'
          +'<span class="v25rd-rule"></span>'
        +'</div>'
        +'<div class="v25rd-head">'
          +'<h3 class="v25rd-title">'+esc(p0.title||p0.id)+'</h3>'
        +'</div>'
        +'<div style="margin-top:4px">'
          +'<textarea data-sp-patch="1" id="v25said" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:14px;line-height:1.8;background:rgba(255,250,240,.5);resize:vertical" placeholder="复述内容实时上屏，也可直接打字"></textarea>'
        +'</div>'
        +'<div class="v25rd-acts">'
          +'<button class="btn sm primary" id="v25recagain" type="button">🎙 语音复述</button>'
          +'<button class="btn sm" id="v25typed" type="button">我已复述，查看对照</button>'
          +'<button class="btn sm" id="v25repeek" type="button">👁 偷看原文</button>'
        +'</div>'
        +'<div id="v25peek" style="margin-top:6px"></div>'
        +'<div id="v25score" style="margin-top:8px"></div>'
      +'</div>';
    const ta=host.querySelector("#v25said"); const btn=host.querySelector("#v25recagain");
    let rec=null;
    function score(){
      if(rec){ try{rec.stop();}catch(e){} rec=null; btn.textContent="🎙 语音复述"; }
      const said=ta.value||""; let cov=0;
      if(en){ const rw=new Set((whole.toLowerCase().match(/[a-z]+/g)||[])); const sw=new Set((said.toLowerCase().match(/[a-z]+/g)||[]));
        cov=rw.size?Math.round(100*[...rw].filter(w=>sw.has(w)).length/rw.size):0; }
      else { const rc=new Set((whole.match(/[一-鿿]/g)||[])); const sc=new Set((said.match(/[一-鿿]/g)||[]));
        cov=rc.size?Math.round(100*[...rc].filter(c=>sc.has(c)).length/rc.size):0; }
      const box=host.querySelector("#v25score");
      box.innerHTML='<div class="note" style="border-left-color:'+(cov>=70?"var(--ok)":cov>=40?"var(--gold)":"var(--danger)")+';font-size:13px">要点覆盖率约 '+cov+'%'
        +(cov>=70?"——复述完整":cov>=40?"——大意已到，细节再补":"——建议看着原文再来一遍")+'</div>'
        +'<div style="margin-top:8px;display:flex;gap:8px">'
        +'<button class="btn sm" data-g="2" type="button">清晰</button><button class="btn sm" data-g="1" type="button">模糊</button><button class="btn sm" data-g="0" type="button">想不起来</button></div>';
      box.querySelectorAll("[data-g]").forEach(b=>b.onpointerdown=()=>{ ps.forEach(p=>{ try{srsReview(p.id,+b.dataset.g);}catch(x){} }); next(); });
    }
    btn.onpointerdown=()=>{
      if(rec){ score(); return; }
      const dft=asrDraftBinder(ta);
      rec=asrOnce(lang,(fin,inter)=>dft.feed(fin,inter),e=>toast(e),()=>ta.isConnected&&host.isConnected);
      if(rec){ try{rec.start(); btn.textContent="■ 完成"; }catch(e){ toast("语音识别启动失败——可直接打字"); } }
    };
    host.querySelector("#v25typed").onpointerdown=score;
    host.querySelector("#v25repeek").onpointerdown=()=>{ try{SFX.tap();}catch(e){} host.querySelector("#v25peek").innerHTML=peekHtml; };
  }
  renderRead();
}

/* —— 问答执行流：读题 → 口述作答 → 对照答案 + 自评（独立于复述/口译）—— 统一 v25rd 卡片 + 图文分离 —— */
function drawQA(host, p, next){
  const q=String(p.text||"").trim(), ans=String(p.qa_answer||"").trim();
  const qEn=String(q).split("\n")[0]||"";
  const qZh=(String(q).match(/【中文对照】(.+)/)||[])[1]||"";
  const aEn=String(ans).split("\n")[0]||"";
  const aZh=(String(ans).match(/【中文对照】(.+)/)||[])[1]||"";
  const disp=_pointDisp(p);
  /* 图文分离 */
  const _rdRaw=(typeof disp==="string")?disp:"";
  const _rd=/<[a-z][\s\S]*?>/i.test(_rdRaw)? rich(_rdRaw) : esc(_rdRaw);
  const _sp=/\x3Cimg/i.test(_rd)? (typeof splitPointImgs==="function"? splitPointImgs(_rd) : {body:_rd,imgs:[]}) : {body:_rd,imgs:[]};
  const _gal=(typeof pointGalleryHtml==="function")? pointGalleryHtml(_sp.imgs) : "";
  const questionHtml = disp
    ? (_gal
        ? '<div class="v25spread">'+_gal+'<div class="v25rd-paper" style="max-height:none">'+_sp.body+'</div></div>'
        : '<div class="v25rd-paper" style="max-height:none">'+_sp.body+'</div>')
    : ('<div class="v25rd-paper" style="max-height:none;font-weight:600">'+esc(qEn)+'</div>'+(qZh?'<div style="font-size:12.5px;color:var(--dim);margin-top:6px;border-left:2px solid var(--line);padding-left:8px">'+esc(qZh)+'</div>':""));
  host.innerHTML=
    '<div class="v25rd">'
      +'<div class="v25rd-bar">'
        +'<span class="v25rd-step">问答</span>'
        +'<span class="v25rd-rule"></span>'
        +'<button class="btn sm" id="v25qatts" type="button">🔊 读题目</button>'+ttsCtlHtml()
      +'</div>'
      +'<div class="v25rd-head">'
        +'<h3 class="v25rd-title">'+esc(p.title||p.id)+'</h3>'
        +'<button class="btn sm ghost" data-edit="'+esc(p.id)+'" type="button">✎ 编辑/笔记</button>'
      +'</div>'
      +questionHtml
      +'<div style="margin-top:12px">'
        +'<textarea data-sp-patch="1" id="v25said" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:14px;line-height:1.8;background:rgba(255,250,240,.5);resize:vertical" placeholder="先用英语口述作答，也可直接打字"></textarea>'
      +'</div>'
      +'<div class="v25rd-acts">'
        +'<button class="btn sm primary" id="v25qaSay" type="button">🎙 口述作答</button>'
        +'<button class="btn sm" id="v25qaSee" type="button">我答完了，看对照</button>'
      +'</div>'
      +'<div id="v25qaA" style="margin-top:10px"></div>'
    +'</div>';
  _bindEdits(host, ()=>drawQA(host,p,next));
  { const tb=host.querySelector("#v25qatts"); bindTtsCtl(host);
    if(tb){ const tgt=host.querySelector(".v25rd-paper");
      tb.onpointerdown=()=>{ try{SFX.tap();}catch(e){} ttsSpeak(qEn, "en-US", tgt); }; } }
  let rec=null; const btn=host.querySelector("#v25qaSay"); const ta=host.querySelector("#v25said");
  function reveal(){
    if(rec){ try{rec.stop();}catch(e){} rec=null; btn.textContent="🎙 口述作答"; }
    const box=host.querySelector("#v25qaA");
    box.innerHTML='<div class="note" style="border-left-color:var(--cyber);font-size:13px;line-height:1.9"><b>参考答案</b><br>'+esc(aEn)
      +(aZh?'<br><span style="color:var(--dim)">【中文对照】</span>'+esc(aZh):"")
      +(p.anchor?'<br><span style="color:var(--dim)">关键词：'+esc(p.anchor)+'</span>':"")+'</div>'
      +'<div style="margin-top:8px;display:flex;gap:8px">'
      +'<button class="btn sm" data-g="2" type="button">答到了</button><button class="btn sm" data-g="1" type="button">答偏了</button><button class="btn sm" data-g="0" type="button">没想起来</button></div>';
    box.querySelectorAll("[data-g]").forEach(b=>b.onpointerdown=()=>{ try{srsReview(p.id,+b.dataset.g);}catch(e){} next(); });
  }
  btn.onpointerdown=()=>{
    if(rec){ reveal(); return; }
    const dft=asrDraftBinder(ta);
    rec=asrOnce("en-US",(fin,inter)=>dft.feed(fin,inter),e=>toast(e),()=>ta.isConnected&&host.isConnected);
    if(rec){ try{rec.start(); btn.textContent="■ 完成，看对照"; }catch(e){ toast("语音识别启动失败——可直接打字"); } }
  };
  host.querySelector("#v25qaSee").onpointerdown=reveal;
}

/* ==================== 导游词「篇 → 节 → 段 → 句」节级任务 ====================
   1 节 = 1 个 quest。交互五步：
   ① 整段阅读（本节全文，打字机）② 分句阅读&修订 ③ 分句复述
   ④ 整段重读 ⑤ 整段复述（遮盖原文 → 点击复原 → 逐字对照）
   图片与文字分区显示（图区随窗体缩放），复述完毕给出逐字级 diff（缺词标红、多词标蓝）。 */
function _oralArt(aid){ return (D.oralFull||[]).find(o=>o.aid===aid)||null; }
function _oralSecParse(it){
  const m=/^ORAL:([A-Za-z]{3}):(\d+)(?::(\d+))?$/.exec(String((it&&it.id)||""));
  if(!m) return null;
  const art=_oralArt(m[1]); if(!art) return null;
  const idx=+m[2]-1, sec=(art.sections||[])[idx];
  if(!sec) return null;
  const all=_oralParas(sec);
  const p0=(it&&typeof it.p0==="number")?it.p0:0;
  const p1=(it&&typeof it.p1==="number")?it.p1:all.length;
  return {art:art, sec:sec, idx:idx, part:(it&&it.part)||0, parts:(it&&it.parts)||1, p0:p0, p1:p1};
}
function _oralParas(sec){
  if(Array.isArray(sec.paragraphs)&&sec.paragraphs.length) return sec.paragraphs;
  return [{n:1, text:String(sec.text||sec.en||"").trim()}];
}
/* 段落正文：优先玩家校订版（fullp:<篇>:<节>:<段>），否则官方原文 */
function _oralParaRaw(art,si,pi,fallback){
  try{ return getEdit("fullp:"+art.id+":"+si+":"+pi, fallback); }catch(e){ return fallback; }
}
/* 富文本 → 正文 HTML + 独立图区 + 打字机用纯文本 */
function _oralSplit(raw){
  const isHtml=/<[a-z][\s\S]*?>/i.test(String(raw||""));
  const safe=isHtml?rich(raw):esc(raw);
  const sp=isHtml&&typeof splitPointImgs==="function"?splitPointImgs(safe):{body:safe, imgs:[]};
  /* 纯文本：块级标签/换行转空格，避免朗读与逐字对照时单词粘连 */
  const plain=_htmlToText(String(raw||"").replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?>/gi," ")).replace(/\s+/g," ").trim();
  return { body:sp.body, gal:typeof pointGalleryHtml==="function"?pointGalleryHtml(sp.imgs):"", plain:plain, isHtml:isHtml };
}
/* 打字机：纯文本逐字揭示；富文本先打纯文本，打完换成带样式的正文 */
function _oralType(el, v, onDone, opts){
  let fired=false;
  const fin=()=>{ if(fired) return; fired=true; if(el) el.innerHTML=v.body; try{ onDone&&onDone(); }catch(e){} };
  if(!v.isHtml) return _twType(el, v.plain, fin, opts);
  const sk=_twType(el, v.plain, fin, opts);
  return ()=>{ try{ sk&&sk(); }catch(e){} fin(); };
}
/* v103：英文分句（与 tools/build-oral.mjs 的 splitSentences 保持一致）
   ① 句末标点后可能先跟右引号/右括号（如 “Purple Forbidden City.”），旧正则只看 .!? 后是否紧跟空格，
      遇到 ” 就切不开，把两句合成一句；
   ② 过短的句子（英文 <5 词 / 中文 <6 字）并入下一句，避免「Good morning, everyone!」单独成一条任务。 */
function _oralSplitSent(text){
  const t=String(text||"").replace(/\s+/g," ").trim();
  if(!t) return [];
  const out=[]; let cur="";
  const isEnd=ch=>ch==="."||ch==="!"||ch==="?"||ch==="。"||ch==="！"||ch==="？";
  const isCloser=ch=>ch==='"'||ch==="'"||ch==="”"||ch==="’"||ch===")"||ch==="]"||ch==="」"||ch==="』"||ch==="）"||ch==="】";
  for(let i=0;i<t.length;i++){
    const ch=t[i]; cur+=ch;
    if(!isEnd(ch)) continue;
    if(ch==="."&&/\d/.test(t[i-1]||"")&&/\d/.test(t[i+1]||"")) continue; /* 3.5 不切 */
    let j=i+1;
    while(j<t.length&&isCloser(t[j])){ cur+=t[j]; j++; }
    const nx=t[j]||"";
    if(j>=t.length||nx===" "||/[\u4e00-\u9fffA-Z0-9“"‘'(]/.test(nx)){ out.push(cur.trim()); cur=""; i=j-1; }
  }
  if(cur.trim()) out.push(cur.trim());
  const wc=s=>(s.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g)||[]).length;
  const cc=s=>(s.match(/[\u4e00-\u9fff]/g)||[]).length;
  const merged=[];
  for(let k=0;k<out.length;k++){
    const s=out[k];
    const short=/[\u4e00-\u9fff]/.test(s)?cc(s)<6:wc(s)<5;
    if(short&&k+1<out.length){ out[k+1]=s+" "+out[k+1]; continue; }
    merged.push(s);
  }
  return merged;
}
/* 逐词/逐字对照：LCS 求最长公共子序列，缺词=原文有而没说、多词=说了但原文没有
   kind：0=一致（黑字）｜1=漏掉的原文→蓝字 .v25diff-miss｜2=多说的内容→红底删除线 .v25diff-extra
   v102：比对前统一小写并丢弃标点——「Forbidden City.」与「forbidden city」视为完全一致，
        大小写、句号逗号等标点差异不再标色（只在原文里保留正常标点显示）。 */
function _oralTok(s){
  /* 只取词：英文单词（含撇号缩写）/数字/单个汉字；标点与空白一律不进比对序列 */
  return String(s||"").match(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+(?:\.\d+)?|[\u4e00-\u9fff]/g)||[];
}
function _oralKey(t){ return String(t).toLowerCase().replace(/[’‘]/g,"'"); }
/* v109：识别容错——语音识别把 auto 听成 Otto、sand 听成 send 是常事，
   这里的对照是判「你有没有说对内容」，不是判「识别引擎有多准」。
   词形相近（首字母相同且长度差≤2，或编辑距离≤2 的长词）视为同一词，不标色、不扣分。 */
function _oralNear(x,y){
  if(!x||!y) return false;
  if(x===y) return true;
  const la=x.length, lb=y.length;
  if(Math.abs(la-lb)>2) return false;
  if(/[\u4e00-\u9fff]/.test(x)||/[\u4e00-\u9fff]/.test(y)) return false;
  if(la<=2||lb<=2) return false;
  if(x[0]!==y[0]) return false;
  const d=(()=>{ const A=x,B=y,n=A.length,m=B.length; let prev=Array.from({length:m+1},(_,j)=>j),cur=new Array(m+1);
    for(let i=1;i<=n;i++){ cur[0]=i; for(let j=1;j<=m;j++) cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(A[i-1]===B[j-1]?0:1)); const t=prev; prev=cur; cur=t; } return prev[m]; })();
  return d<=2;
}
function _oralDiffHtml(ref, said, tolerant){
  const rawA=_oralTok(ref), rawB=_oralTok(said);
  const a=rawA.map(_oralKey), b=rawB.map(_oralKey), n=a.length, m=b.length;
  const eq=(i,j)=> a[i]===b[j] || (tolerant&&_oralNear(a[i],b[j]));
  const w=m+1, dp=new Uint32Array((n+1)*(m+1));
  for(let i=n-1;i>=0;i--){
    const row=i*w, nx=(i+1)*w;
    for(let j=m-1;j>=0;j--) dp[row+j]=eq(i,j)?dp[nx+j+1]+1:Math.max(dp[nx+j],dp[row+j+1]);
  }
  const out=[]; let i=0,j=0;
  while(i<n&&j<m){
    if(eq(i,j)){ out.push([rawA[i],0]); i++; j++; }
    else if(dp[(i+1)*w+j]>=dp[i*w+j+1]){ out.push([rawA[i],1]); i++; }
    else { out.push([rawB[j],2]); j++; }
  }
  while(i<n) out.push([rawA[i++],1]);
  while(j<m) out.push([rawB[j++],2]);
  let s="";
  out.forEach((t,idx)=>{
    const tok=t[0], kind=t[1], prev=idx?out[idx-1][0]:"";
    const cjk=/[\u4e00-\u9fff]/;
    const needSpace=idx&&!cjk.test(prev)&&!cjk.test(tok);
    if(needSpace) s+=" ";
    if(kind===1) s+='<mark class="v25diff-miss">'+esc(tok)+'</mark>';
    else if(kind===2) s+='<span class="v25diff-extra">'+esc(tok)+'</span>';
    else s+=esc(tok);
  });
  return s;
}
/* ==================== 复述语速统计（v104） ====================
   每次复述落地一条 {t,w,d,mod}：词数 w、时长 d(秒)、模式 mod(sent=分句 / whole=整段)。
   语速 WPM = w/(d/60)；本地持久化最近 200 条，供复述页即时反馈 + 独立统计区画趋势 + 时长预估。 */
/* —— v109：录音回放（先录音 → 整体识别 → 可回放核对）——
   浏览器的语音识别不能喂音频文件，所以录音只用于「回放自评」；识别仍走原生整段终稿模式。
   录音只保留最后一条（开始新录音即清掉旧的），提供「清除」按钮随时删，不长期保存。 */
let _micMR=null,_micChunks=[],_micURL=null,_micStream=null,_micCb=null;
function micRecSupported(){ return !!(window.MediaRecorder&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia); }
function micRecClear(){
  try{ if(_micURL){ URL.revokeObjectURL(_micURL); _micURL=null; } }catch(e){}
  _micChunks=[];
}
function micRecStart(cb, onReady){
  micRecClear(); _micCb=cb||null;
  let fired=false;
  const ready=()=>{ if(fired) return; fired=true; try{ onReady&&onReady(); }catch(e){} };
  if(!micRecSupported()||!navigator.mediaDevices.getUserMedia){ ready(); return false; }
  navigator.mediaDevices.getUserMedia({audio:true}).then(st=>{
    _micStream=st;
    try{
      const mr=new MediaRecorder(st);
      mr.ondataavailable=e=>{ if(e.data&&e.data.size) _micChunks.push(e.data); };
      mr.onstop=()=>{
        try{ st.getTracks().forEach(t=>t.stop()); }catch(_){}
        _micStream=null;
        if(!_micChunks.length) return;
        const blob=new Blob(_micChunks,{type:_micChunks[0].type||"audio/webm"});
        _micURL=URL.createObjectURL(blob);
        if(_micCb) _micCb(_micURL);
      };
      _micMR=mr; mr.start();
    }catch(e){ try{ st.getTracks().forEach(t=>t.stop()); }catch(_){} }
    ready();
  }).catch(()=>{ /* 录不了就只做识别，不打断流程 */
    ready();
  });
  return true;
}
function micRecStop(){
  const mr=_micMR; _micMR=null;
  if(mr&&mr.state!=="inactive"){ try{ mr.stop(); }catch(e){} }
  else { try{ if(_micStream){ _micStream.getTracks().forEach(t=>t.stop()); _micStream=null; } }catch(e){} }
}
function _reciteStats(){
  try{ return JSON.parse(localStorage.getItem("wd_recite_stats")||'{"h":[]}'); }catch(e){ return {h:[]}; }
}
function wdReciteTick(words, durSec, mod){
  try{
    const s=_reciteStats();
    s.h.push({t:Date.now(), w:Math.max(0,Math.round(+words||0)), d:Math.max(0.5,Math.round((+durSec||0.5)*10)/10), mod:mod||"sent"});
    if(s.h.length>200) s.h=s.h.slice(-200);
    localStorage.setItem("wd_recite_stats", JSON.stringify(s));
  }catch(e){}
}
function _reciteWpm(x){ return (x&&x.d>0)? Math.round(x.w/(x.d/60)) : 0; }
function wdReciteSummary(){
  const s=_reciteStats(), h=s.h||[];
  const tot=h.reduce((a,x)=>a+x.w,0), totD=h.reduce((a,x)=>a+x.d,0);
  return { n:h.length, tot, totD, avgWpm: totD>0? Math.round(tot/(totD/60)) : 0, recent:h.slice(-12) };
}
/* 英文词数（与导游词口径一致：单词/数字） */
function _reciteWords(s){ return (String(s||"").match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g)||[]).length; }
/* 复述完成后的即时统计条（本次 + 累计平均） */
function wdReciteInlineHtml(words, durSec){
  const w=Math.max(0,Math.round(+words||0)), d=Math.max(0.5,+durSec||0.5);
  const wpm=_reciteWpm({w:w,d:d}), sum=wdReciteSummary();
  return '<div class="v25recite-stat" style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--dim)">'
    +'<span>本次复述 '+w+' 词 · '+Math.round(d)+' 秒 · <b style="color:var(--gold)">'+wpm+' WPM</b></span>'
    +'<span>累计平均 <b style="color:var(--gold)">'+sum.avgWpm+' WPM</b>（'+sum.n+' 次）</span>'
    +'</div>';
}
/* 独立统计区：最近 12 次语速柱状 + 趋势 + 时长预估（挂到任务面板导游词卡旁） */
function wdReciteStatHtml(){
  const sum=wdReciteSummary();
  if(!sum.n) return '<div style="font-size:12px;color:var(--dim);line-height:1.8">还没有复述记录——练一次「分句复述 / 整段复述」后，这里会呈现你的语速变化与时长预估。</div>';
  const rec=sum.recent;
  const maxW=Math.max(60, ...rec.map(_reciteWpm));
  const bars=rec.map(x=>{
    const w=_reciteWpm(x), h=Math.max(6, Math.round(w/maxW*100));
    return '<div style="flex:1;min-width:6px;display:flex;flex-direction:column;align-items:center;gap:2px" title="'+w+' WPM · '+x.w+' 词 · '+x.d+' 秒">'
      +'<span style="font-size:9px;color:var(--dim)">'+w+'</span>'
      +'<div style="width:70%;max-width:20px;height:'+h+'px;background:linear-gradient(180deg,var(--gold),#b8923a);border-radius:3px"></div>'
      +'</div>';
  }).join('');
  const latest=_reciteWpm(rec[rec.length-1]);
  const prev=rec.length>=2?_reciteWpm(rec[rec.length-2]):latest;
  const trend=latest-prev;
  let est="";
  try{
    let totalW=0; (D.oralFull||[]).forEach(o=>{ totalW+=(o.words||0); });
    if(totalW&&sum.avgWpm) est='<div style="font-size:11.5px;color:var(--dim);margin-top:6px">按当前平均语速，六篇导游词全文（约 '+_fmtNum(totalW)+' 词）通读一遍约 <b style="color:var(--gold)">'+Math.max(1,Math.round(totalW/sum.avgWpm))+' 分钟</b>。</div>';
  }catch(e){}
  return '<div>'
    +'<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:8px">'
      +'<span>累计语速 <b style="color:var(--gold);font-size:15px">'+sum.avgWpm+'</b> WPM · '+sum.n+' 次 · '+sum.tot+' 词</span>'
      +'<span>最近 <b style="color:var(--gold)">'+latest+'</b> WPM '
        +(trend>0?'<span style="color:var(--ok)">▲ '+trend+'</span>':trend<0?'<span style="color:var(--danger)">▼ '+(-trend)+'</span>':'<span style="color:var(--dim)">— 稳定</span>')+'</span>'
    +'</div>'
    +'<div style="display:flex;align-items:flex-end;gap:3px;height:64px;padding:2px 0">'+bars+'</div>'
    +est
    +'</div>';
}
function _fmtNum(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g,","); }
function _oralCover(bodyHtml){
  return '<div class="v25rd-paper v25cover v25covbox" style="max-height:none">'
    +'<div class="v25cover-txt">'+bodyHtml+'</div>'
    +'<button class="btn sm v25cover-btn" type="button" id="v25reveal">👁 点击复原原文</button>'
    +'</div>';
}
function _bindOralCover(host){
  const b=host.querySelector("#v25reveal"); if(!b) return;
  b.onpointerdown=(e)=>{ try{ e.preventDefault(); e.stopPropagation(); SFX.tap(); }catch(x){}
    const c=b.parentElement; if(!c) return;
    /* v126：复原 ↔ 重新遮盖 来回切换，想再看一遍原文、或再遮回去重试同一句都可以 */
    const covered=c.classList.toggle("v25cover");
    b.textContent=covered?"👁 点击复原原文":"🙈 重新遮盖";
  };
}
/* v127：重新遮盖（「再试」共用）——加回模糊层、确保「复原原文」按钮在位可点。
   整段复述的「偷看原文」会把复原按钮整个删掉，这里要能补回来。 */
function _recoverCover(host){
  const c=host.querySelector(".v25covbox"); if(!c) return;
  c.classList.add("v25cover");
  let b=c.querySelector("#v25reveal");
  if(!b){
    b=document.createElement("button");
    b.type="button"; b.className="btn sm v25cover-btn"; b.id="v25reveal";
    c.appendChild(b);
  }
  b.textContent="👁 点击复原原文";
  b.onpointerdown=(e)=>{ try{ e.preventDefault(); e.stopPropagation(); SFX.tap(); }catch(x){}
    const p=b.parentElement; if(!p) return;
    const covered=p.classList.toggle("v25cover");
    b.textContent=covered?"👁 点击复原原文":"🙈 重新遮盖";
  };
}
/* 节级任务入口：1 个单元 = 1 个节片（超长节按段落均分为 (1/n)…(n/n) 子任务） */
function runOralSectionUnit(u){
  const it=u.items[0];
  const ref=_oralSecParse(it);
  if(!ref){ toast("该节导游词未找到"); return; }
  _markRun(u);
  const ov=panel('<h2>'+esc(it.title||(ref.art.name+' · 第'+(ref.idx+1)+'节'))+'</h2><div id="v25o" style="margin-top:8px"></div>');
  const host=ov.querySelector("#v25o");
  { const dlgEl=ov.querySelector(".dlg"); if(dlgEl) dlgEl.style.paddingBottom="62px"; }  /* 右下角「返回」占位 */
  _addBack(ov); histReset();
  drawOralFlow(host, ref.art, ref.sec, ref.idx, ref.p0, ref.p1, ()=>{
    /* 与修习室共用节级进度：本节（任意片）走完即点亮分站 */
    try{ const p=oralProg(ref.art.aid); if(p.sectionDone.indexOf(ref.idx)<0){ p.sectionDone.push(ref.idx); save(); } }catch(e){}
    _finBtn(host, ov, u, 1, 1,
      '<div class="v25qz"><div class="v25res v25res-ok"><div class="v25res-hd">✦ 本节完成</div>'
      +esc(it.title||(ref.art.name+' 第'+(ref.idx+1)+'节'))+' 已走完五步：整段读 → 分句精读 → 分句复述 → 整段重读 → 整段复述。</div></div>');
  });
}
function drawOralFlow(host, art, sec, si, p0, p1, done){
  const allParas=_oralParas(sec);
  const paras=allParas.slice(p0,p1);              /* 本子任务覆盖的段落（节内绝对段号 p.n 不变） */
  const paOf=p=>(p&&typeof p.n==="number")?p.n-1:0;   /* 段落节内绝对下标 */
  /* 句子列表：由本片段落直接切分，句子带 pa（节内绝对段下标）供修订定位
     v109：改为可重建——修订正文后必须按新稿重切句，否则复述对照仍在用旧句子 */
  const sents=[];
  const rebuildSents=()=>{
    sents.length=0;
    paras.forEach(p=>{
      _oralSplitSent(_htmlToText(_oralParaRaw(art,si,paOf(p),p.text))).forEach(t=>sents.push({ n:sents.length+1, text:t, pa:paOf(p) }));
    });
  };
  rebuildSents();
  /* v117：整片修订/CSV 会整体替换 sec.paragraphs——原地重挂段落数组，后续步骤才读得到新段落对象
     注意 _oralParas(sec) 返回的就是 sec.paragraphs 本体，必须先拷贝再清空：
     否则 allParas.length=0 会把整节原文抹掉（v116 的 bug：第2节变成「0 句」空白页） */
  /* v120：整片修订存档（fullsec）必须在进页时应用。
     之前它只在「保存」当场写进内存，刷新后存档完全不生效，正文退回 CSV/原文——
     用户看到的就是「修订版本不见了」。这里把存档解析成段落写回，并逐段与原文比对：
     文字一致就沿用原 HTML，加粗/字色等富文本不会因为套用修订而丢。 */
  const applySecSaved=()=>{
    try{
      const arrSec=(st&&st.edits&&st.edits["fullsec:"+art.id+":"+si])||[];
      const arrFull=(st&&st.edits&&st.edits["full:"+art.id+":"+si])||[];
      /* 两种入口保存的整节稿都认：fullsec（整体修订，带小标题/小注标记）优先，其次 full（整节纯文本） */
      const src=arrSec.length?String((arrSec[0]||{}).text||""):(arrFull.length?String((arrFull[0]||{}).text||""):"");
      if(!src) return;
      const ap=_oralParas(sec);
      if(!ap.length) return;
      /* 只在整节视图套用：分页子任务只序列化了本片，整节存档硬套会打乱分页 */
      if(p0!==0||p1!==ap.length) return;
      let blocks=_parseSecText(_htmlLines(src).join("\n"));
      if(!blocks.length) return;
      /* 旧版 full（整节纯文本）存档可能只有单换行，解析出来会并成 1 块。
         这时绝不能真去套用——那会把十几段压成一段。先按空行重分，分不出就放弃、保持原文。 */
      if(!arrSec.length&&blocks.length===1&&ap.length>1){
        const alt=String(src).split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
        if(alt.length>1) blocks=alt.map(t=>({head:"",note:"",text:t}));
        else return;
      }
      const plainOf=x=>_htmlToText(String(x||"")).replace(/\s+/g," ").trim();
      const oldRaw=ap.map(p=>String(_oralParaRaw(art,si,paOf(p),p.text)||""));
      const oldPlain=oldRaw.map(plainOf);
      const oldMeta=ap.map(p=>({head:p.head||"",note:p.note||""}));
      const used=[];
      const np=blocks.map((b,i)=>{
        const keep=blocks.length===ap.length?(oldMeta[i]||{head:"",note:""}):{head:"",note:""};
        let text=b.text;
        const bt=String(b.text||"").replace(/\s+/g," ").trim();
        const j=oldPlain.findIndex((t,k)=>!used[k]&&t===bt);
        if(j>=0){ used[j]=1; text=oldRaw[j]; }
        return { n:i+1, text:text, head:b.head||keep.head, note:b.note||keep.note };
      });
      let changed=(np.length!==ap.length);
      if(!changed) np.forEach((p,i)=>{ if(p.text!==ap[i].text||p.head!==(ap[i].head||"")||p.note!==(ap[i].note||"")) changed=true; });
      if(!changed) return;   /* 已应用过：不要每帧重建段落对象 */
      sec.paragraphs=np;
      sec.text=np.map(x=>x.text||"").join("\n\n");
    }catch(e){ console.warn("[fullsec]",e); }
  };
  const resyncParas=()=>{
    applySecSaved();
    const ap=_oralParas(sec).slice();
    if(!ap.length) return;
    /* 套用存档可能删段/加段，分页上界要跟着收，否则会截掉多出来的段 */
    if(p1>ap.length) p1=ap.length;
    allParas.length=0; ap.forEach(p=>allParas.push(p));
    paras.length=0; ap.slice(p0,p1).forEach(p=>paras.push(p));
  };
  /* v113：整片修订稿 序列化 / 解析 / 写回（段落空行分隔；【小标题】/【小注】标记行可改汉字注释；删块=删段，加块=加段） */
  const _secSerialize=()=>{
    const lines=[];
    paras.forEach(p=>{
      /* 用 _htmlLines 而不是 _htmlToText：富文本正文可能是 <div>行</div><div>行</div>，
         直接剥标签会把这些行拼成一行（保存后段落内的换行全丢） */
      const raw=_htmlLines(_oralParaRaw(art,si,paOf(p),p.text)).join("\n").trim();
      if(p.head) lines.push("【小标题】"+p.head);
      if(p.note) lines.push("【小注】"+p.note);
      lines.push(raw,"");
    });
    return lines.join("\n").trim();
  };
  const _htmlLines=html=>_htmlToText(String(html||"")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/(?:div|p|li|h[1-6]|blockquote)\s*>/gi,"\n")
    .replace(/<(?:div|p|li|h[1-6]|blockquote)(?:\s[^>]*)?>/gi,""))
    .split("\n");
  const _parseSecText=text=>{
    const blocks=[]; let cur=null;
    const flush=()=>{ if(cur&&(String(cur.text).trim()||cur.head||cur.note)) blocks.push(cur); cur=null; };
    /* 自愈：标记行后面粘了英文正文（历史稿在 contenteditable 里被折叠换行所致）时，
       把「中文标签」和「英文正文」切开，否则整行会被当成小注，正文整段变灰字消失 */
    const splitLab=v=>{
      const s=String(v||"").trim();
      const m=s.match(/^([\u4e00-\u9fff][\u4e00-\u9fff0-9\s，。、；：·（）()《》「」『』“”‘’—\-~～]*?)([A-Za-z“"'(][\s\S]{40,})$/);
      if(m&&m[1].trim()) return {lab:m[1].trim(), rest:m[2].trim()};
      return {lab:s, rest:""};
    };
    String(text||"").split("\n").forEach(raw=>{
      const t=raw.trim();
      const mH=t.match(/^【小标题】\s?([\s\S]*)$/), mN=t.match(/^【小注】\s?([\s\S]*)$/);
      if(mH){ const r=splitLab(mH[1]); cur=cur||{head:"",note:"",text:""}; cur.head=r.lab; if(r.rest) cur.text+=(cur.text?" ":"")+r.rest; return; }
      if(mN){ const r=splitLab(mN[1]); cur=cur||{head:"",note:"",text:""}; cur.note=r.lab; if(r.rest) cur.text+=(cur.text?" ":"")+r.rest; return; }
      if(!t){ flush(); return; }
      cur=cur||{head:"",note:"",text:""};
      cur.text+=(cur.text?" ":"")+t;
    });
    flush();
    return blocks;
  };
  try{ window.__wdParseSecText=_parseSecText; }catch(e){}
  const _applySecEdit=eid=>{
    const blocks=_parseSecText(_htmlLines(getEdit(eid,"")).join("\n"));
    if(!blocks.length){ toast("内容为空，未应用"); return; }
    const old=paras.map(p=>({head:p.head||"",note:p.note||""}));
    /* v116：富文本保真——某块纯文本与原文某段一致时，直接保留那段的原 HTML，
       避免「只改小注/改别的段」就把整片加粗、字色等样式拍平成纯文本 */
    const oldRaw=paras.map(p=>String(_oralParaRaw(art,si,paOf(p),p.text)||""));
    const oldPlain=oldRaw.map(x=>_htmlToText(x).replace(/\s+/g," ").trim());
    const used=[];
    const np=blocks.map((b,i)=>{
      /* 段数没变且某块没写标记行 → 沿用原来的小标题/小注，防止误丢 */
      const keep=blocks.length===old.length?(old[i]||{head:"",note:""}):{head:"",note:""};
      let text=b.text;
      const bt=b.text.replace(/\s+/g," ").trim();
      const j=oldPlain.findIndex((t,k)=>!used[k]&&t===bt);
      if(j>=0){ used[j]=1; text=oldRaw[j]; }   /* 原样保留（含富文本标签） */
      return { n:0, text, head:b.head||keep.head, note:b.note||keep.note };
    });
    const ap=_oralParas(sec);
    const before=ap.slice(0,p0), after=ap.slice(p1);
    np.forEach((p,i)=>{ p.n=before.length+i+1; });
    const after2=after.map((p,i)=>Object.assign({},p,{n:before.length+np.length+i+1}));
    sec.paragraphs=before.concat(np,after2);
    sec.text=sec.paragraphs.map(x=>x.text||"").join("\n\n");
    /* v124：整片修订镜像到 full:——藏经阁 / 修习室 / 通篇考核统一读 full:，
       这里把修正后的整节纯文本同步过去，刷新后四处读到同一份稿，不再「改完就丢」 */
    try{
      if(!st.edits) st.edits={};
      const fk="full:"+art.id+":"+si;
      const joined=_htmlToText(sec.paragraphs.map(x=>x.text||"").join("\n\n")).trim();
      if(joined){
        const farr=st.edits[fk]||(st.edits[fk]=[]);
        if(!farr.length||farr[0].text!==joined) farr.unshift({at:new Date().toISOString(), text:joined});
      }
    }catch(e){}
    /* 本片段的逐段旧修订已并入整片稿，清掉避免新旧两个源打架 */
    try{ Object.keys(st.edits||{}).forEach(k=>{ if(k.indexOf("fullp:"+art.id+":"+si+":")===0) delete st.edits[k]; }); save(); }catch(e){}
    resyncParas(); rebuildSents();
  };
  const name=art.name+' · 第'+(si+1)+'节';
  let idx=0;                          /* 分句下标；五步流程靠 render* 直接切页 */
  let reciteT0=null;                  /* v104：复述计时起点（分句/整段复述进入时打点，完成时结算语速） */
  /* 单麦约定：整个流程同一时刻只允许一个识别器、一个朗读；切页/换模式先收干净，避免抢麦克风 */
  let liveRec=null, autoTtsT=null;
  /* v109：复述区的「录音 → 整体识别 → 回放」按钮绑定（分句复述 / 整段复述共用）
     - 按下：开始录音（可回放，只留最后一条）＋ 启动「非连续、无草稿」识别
     - 停止：识别器把这一整段一次性给终稿，不再逐字回填，因此不会重复复写
     - 计时：从按下那一刻开始，停止时冻结语音时长交给语速统计（比「首次按键」更贴近真实语速） */
  const _bindReciteMic=(ta,asrBtn,stEl,lang,onDur,alive)=>{
    let rec=null, t0=0;
    const dft=(typeof asrDraftBinder==="function")?asrDraftBinder(ta):null;
    const say=t=>{ if(stEl) stEl.textContent=String(t||""); };
    const stopRec=()=>{
      if(!rec) return false;
      try{ rec.stop(); }catch(e){}
      rec=null; asrBtn.textContent="🎙 语音输入";
      if(onDur) onDur((Date.now()-t0)/1000);
      say("已停止——识别到的内容已填进输入框");
      return true;
    };
    asrBtn.onpointerdown=()=>{
      try{SFX.tap();}catch(e){}
      if(stopRec()) return;
      ta.value=""; t0=Date.now(); reciteT0=null;
      if(dft&&dft.reset) dft.reset();
      asrBtn.textContent="■ 停止";
      say("正在听……你说的词会边听边实时上屏");
      try{ ta.focus(); }catch(_){}
      /* v126：改用 asrOnce 实时识别（同分句阅读）——一边说一边逐词上屏，
         不再是「说完整句才一次性出结果」，也不再「没说完就停」。
         实时草稿上屏会触发 input 事件，计时从第一个词落地就开始，而不是等输入结束才打点。 */
      rec=asrOnce(lang,(fin,inter)=>{
        if(dft) dft.feed(fin,inter);
        if(String(ta.value||"").trim() && !reciteT0) reciteT0=Date.now();
        const cur=String(ta.value||"").trim();
        say(cur?("已听到："+cur.slice(-40)):"正在听……");
      },e=>{ rec=null; asrBtn.textContent="🎙 语音输入"; say(e); },
      alive||(()=>ta.isConnected));
      if(!rec){ asrBtn.textContent="🎙 语音输入"; return; }
      try{ rec.start(); }catch(e){ rec=null; asrBtn.textContent="🎙 语音输入"; say("启动失败——可直接打字"); }
    };
    /* 结算前调用：还在识别就拦一下，避免「识别草稿」晚到覆盖对照结果 */
    return { busy:()=>!!rec, stop:stopRec };
  };
  const killAutoTts=()=>{ if(autoTtsT){ clearTimeout(autoTtsT); autoTtsT=null; } };
  const stopVoice=()=>{ killAutoTts(); if(liveRec){ try{ liveRec.stop(); }catch(e){} liveRec=null; } try{ micRecStop(); }catch(e){} ttsStop(); };
  const allPlain=()=>paras.map(p=>_htmlToText(_oralParaRaw(art,si,paOf(p),p.text))).join(" ");
  const bar=(step,count,extra)=>'<div class="v25rd-bar"><span class="v25rd-step">'+step+'</span><span class="v25rd-count">'+esc(count)+'</span><span class="v25rd-rule"></span>'+(extra||"")+'<button class="btn sm" data-v25now="1" type="button" style="margin-left:auto" title="跳过剩余环节，直接完成本节">✓ 完成本节</button></div>';
  /* 五步流程的「完成本节」：五步各自重建 host.innerHTML，事件委托挂在 host 上一直有效。
     语音识别不可用或不想逐句走完时，一键收尾，不必被流程卡死。 */
  if(!host.__v25NowBound){
    host.__v25NowBound=1;
    host.addEventListener("click",e=>{
      const b=e.target&&e.target.closest&&e.target.closest("[data-v25now]");
      if(!b) return;
      e.preventDefault(); e.stopPropagation();
      try{SFX.tap();}catch(x){}
      if(!confirm("跳过剩余环节，直接完成本节？")) return;
      stopVoice();
      try{ done(); }catch(x){ console.warn("[quickdone]",x); }
      const fb=host.querySelector("#v25fin"); if(fb&&fb.onpointerdown) fb.onpointerdown();
    });
  }
  const head=()=>'<div class="v25rd-head"><h3 class="v25rd-title">'+esc(name)+'</h3>'
    +'<span class="v25rd-count" style="font-size:12px">'+esc(sec.h||"")+' · '+sents.length+' 句</span></div>';

  /* ① / ④ 整段阅读：一段整体正文（v104 不分句，按自然段落衔接排版；打字机逐段连打；第二遍直接全文）
     v113：修订改为「整体修订」——一个编辑器改整个片段，可改正文/小标题/中文小注、删段、加段 */
  function renderRead(pass){
    stopVoice();
    /* v116：重进整段阅读也先对齐最新段落（别处改过全节后，闭包里的旧段落数组会过期） */
    resyncParas(); rebuildSents();
    const blocks=paras.map((p,pi)=>({p:p, pi:pi, v:_oralSplit(_oralParaRaw(art,si,paOf(p),p.text))}));
    const whole=blocks.map((b,i)=>{
      const sub=b.p.head?'<div class="v25subhead">'+esc(b.p.head)+'</div>':'';
      const note=b.p.note?'<div class="v25pnote">'+esc(b.p.note)+'</div>':'';
      const seg=pass===2
        ? '<div class="v25seg">'+b.v.body+'</div>'
        : '<div class="v25seg" data-p="'+i+'"></div>';
      return sub+note+(b.v.gal?'<div class="v25spread oral">'+b.v.gal+seg+'</div>':seg);
    }).join('');
    host.innerHTML='<div class="v25rd">'
      +bar(pass===2?'导游词 · 整段重读':'导游词 · 整段阅读','第 '+(si+1)+' 节 · '+(pass===2?'第 4 步':'第 1 步'),
        '<button class="btn sm" id="v25otts" type="button">🔊 连读本节</button>'
        +'<button class="btn sm ghost" id="v25osecedit" type="button">✎ 整体修订</button>'+ttsCtlHtml())
      +head()
      +'<div style="max-height:min(62vh,560px);overflow:auto;padding-right:2px">'
        +'<div class="v25rd-paper v25whole">'+whole+'</div>'
      +'</div>'
      +'<div class="v25rd-acts">'
        +(pass===2
          ?'<button class="btn sm primary" id="v25onext" type="button">开始整段复述 →</button>'
          :'<button class="btn sm primary" id="v25onext" type="button">开始分句精读（共 '+sents.length+' 句）→</button>'
            +'<button class="btn sm" id="v25oskip" type="button">立即显示全文</button>')
      +'</div></div>';
    bindTtsCtl(host);
    host.querySelector("#v25otts").onpointerdown=()=>{ try{SFX.tap();}catch(e){} ttsSpeak(allPlain(),'en-US',host.querySelector(".v25rd")); };
    /* v113：整体修订入口——序列化整片进编辑器；保存/回退/恢复原文后解析写回并重切句 */
    const secEditBtn=host.querySelector("#v25osecedit");
    if(secEditBtn) secEditBtn.onpointerdown=e=>{ try{ e.preventDefault(); e.stopPropagation(); SFX.tap(); }catch(x){}
      stopVoice();
      try{
        const eid="fullsec:"+art.id+":"+si;
        /* 库里已有逐段改动（与快照原文不同）且尚无整片存档 → 先把当前稿存为首版，免得编辑器打开的是过期快照 */
        try{ const curSer=_secSerialize(); if(!hasEdit(eid)&&curSer!==String(originalOf(eid)||"").trim()) saveEdit(eid,curSer); }catch(x){}
        /* 编辑器正文取「当前生效稿」，但已有整片存档时先过一遍解析再重组：
           历史存档如果因为换行被折叠导致【小注】行与正文粘连，这里会顺手修好结构，
           用户直接保存即可把正确结构固化，不必自己重敲 */
        const serializeBlocks=bs=>bs.map(b=>{
          const l=[]; if(b.head) l.push("【小标题】"+b.head); if(b.note) l.push("【小注】"+b.note);
          l.push(b.text,""); return l.join("\n");
        }).join("\n").trim();
        let openBody=_secSerialize();
        try{
          const saved=getEdit(eid,"");
          if(saved){
            const bs=_parseSecText(_htmlLines(saved).join("\n"));
            if(bs.length) openBody=serializeBlocks(bs);
          }
        }catch(x){}
        openEditor({ uid:eid, editId:eid, id:art.aid+"-S"+(si+1)+"-SEC",
          title:art.name+" 第"+(si+1)+"节 · 整体修订", cat:"full",
          catLabel:"导游词 · "+art.name+" · 段落按空行分隔；【小标题】/【小注】行可改可删；整段文字删掉即删段；保存为纯文本稿",
          body:openBody,
          onSaved:()=>{ try{ _applySecEdit(eid); renderRead(pass); }catch(x){ console.warn("[secedit]",x); } } });
      }catch(x){ toast("编辑器暂不可用"); }
    };
    /* 第一遍：逐段打字机；点击任一正文或按钮可一键展开 */
    let skipAll=null;
    if(pass!==2){
      const queue=blocks.map((b,i)=>({el:host.querySelector('[data-p="'+i+'"]'), v:b.v})).filter(x=>x.el);
      let dead=false, cur=null;
      const next=()=>{ if(dead||!queue.length) return; const q=queue.shift(); cur=_oralType(q.el,q.v,next,{forceSpd:20,forceStep:6}); };
      next();
      skipAll=()=>{ if(dead) return; dead=true; queue.forEach(q=>{ q.el.innerHTML=q.v.body; }); queue.length=0; const c=cur; c&&c(); };
      host.querySelectorAll('[data-p]').forEach(el=>{ el.onpointerdown=(e)=>{ try{ if(e.target&&/BUTTON|INPUT|A/i.test(e.target.tagName||"")) return; SFX.tap(); }catch(x){} skipAll&&skipAll(); }; });
      const sk=host.querySelector("#v25oskip");
      if(sk) sk.onpointerdown=()=>{ try{SFX.tap();}catch(e){} skipAll&&skipAll(); };
    }
    host.querySelector("#v25onext").onpointerdown=()=>{ try{SFX.tap();}catch(e){}
      if(pass===2){ histPush(()=>renderRead(2)); renderRetell(); }
      else { histPush(()=>renderRead(1)); idx=0; renderSentRead(0); }
    };
  }

  /* ② 分句阅读&修订：自动朗读当前句 + 一个「说」入口（跟读/复述两种模式）+ 语音识别 + 逐字对照 */
  function renderSentRead(i){
    stopVoice();
    /* v116：进页先按当前段落重挂数组、重切句——无论全文是从「整体修订」还是别的入口改的，
       分句都必须紧跟最新全文，不能沿用进流程时的旧句子 */
    resyncParas(); rebuildSents();
    if(i>=sents.length) i=Math.max(0,sents.length-1);
    const sn=sents[i], pa=sn.pa||0, p=allParas[pa]||{n:pa+1,text:sn.text};
    const raw=_oralParaRaw(art,si,pa,p.text);
    const ctx=_oralSplit(raw);
    host.innerHTML='<div class="v25rd">'
      +bar('导游词 · 分句精读',(i+1)+' / '+sents.length+' 句','<button class="btn sm" id="v25otts" type="button">🔊 重听本句</button>'+ttsCtlHtml())
      +head()
      +'<div class="v25sent-no">第 '+(i+1)+' 句 · 第 '+(pa+1)+' 段'+(p.head?' · '+esc(p.head):'')+'</div>'
      +'<div class="v25rd-paper" id="v25osent" style="min-height:56px;font-size:clamp(16px,4.4vw,19px)"></div>'
      +'<div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
        +'<span style="font-size:11.5px;color:var(--dim)">本句练习方式</span>'
        +'<button class="btn sm cur" id="v25mshadow" type="button">跟读 · 看原文</button>'
        +'<button class="btn sm ghost" id="v25mrecall" type="button">复述 · 遮原文</button>'
      +'</div>'
      +'<div id="v25saybox"></div>'
      +'<details class="v25ctx"><summary>本段上下文（第 '+(pa+1)+' 段）</summary>'
        +(ctx.gal?'<div class="v25spread oral">'+ctx.gal+'<div class="v25rd-paper" style="max-height:180px;cursor:default">'+ctx.body+'</div></div>':'<div class="v25rd-paper" style="max-height:180px;font-size:13px;cursor:default">'+ctx.body+'</div>')
      +'</details>'
      +'<div class="v25rd-acts">'
        +'<button class="btn sm" id="v25oprev" type="button">◀ 上一句</button>'
        +'<button class="btn sm" id="v25oedit" type="button">✎ 修订本段</button>'
        +'<button class="btn sm" id="v25ojump" type="button">跳到整段复述</button>'
        +'<button class="btn sm primary" id="v25onext" type="button">'+(i+1>=sents.length?'开始分句复述 →':'下一句 →')+'</button>'
      +'</div></div>';
    bindTtsCtl(host);
    const se=host.querySelector("#v25osent");
    const sk=_oralType(se,{plain:sn.text, body:esc(sn.text), isHtml:false});
    se.style.cursor="pointer"; se.title="点击立即显示本句";
    se.onpointerdown=()=>{ try{SFX.tap();}catch(e){} killAutoTts(); sk&&sk(); };

    /* 自动朗读：进页即读；离开/开始说话/切模式时立即取消，避免和识别抢麦 */
    killAutoTts();
    autoTtsT=setTimeout(()=>{ autoTtsT=null; try{ if(se.isConnected) ttsSpeak(sn.text,'en-US',se); }catch(e){} },260);
    host.querySelector("#v25otts").onpointerdown=()=>{ try{SFX.tap();}catch(e){} killAutoTts(); if(liveRec) stopVoice(); ttsSpeak(sn.text,'en-US',se); };

    /* 模式：跟读=原文可见；复述=原文模糊遮盖（可点复原） */
    let mode="shadow";
    const box=host.querySelector("#v25saybox");
    const ms=host.querySelector("#v25mshadow"), mr=host.querySelector("#v25mrecall");
    function paintMode(next){
      mode=next;
      sk&&sk();   /* 先把打字机收尾，再决定是否遮盖 */
      ms.classList.toggle("cur",mode==="shadow"); ms.classList.toggle("ghost",mode!=="shadow");
      mr.classList.toggle("cur",mode==="recall"); mr.classList.toggle("ghost",mode!=="recall");
      /* 遮盖：只包一层模糊，不重建 DOM（避免打字机节点被替换后读出失败） */
      let wrap=se.querySelector(".v25cover-txt");
      if(mode==="recall"){
        if(!wrap){ wrap=document.createElement("div"); wrap.className="v25cover-txt"; while(se.firstChild) wrap.appendChild(se.firstChild); se.appendChild(wrap); }
        se.classList.add("v25cover");
        if(!se.querySelector("#v25reveal")){
          const b=document.createElement("button"); b.className="btn sm v25cover-btn"; b.type="button"; b.id="v25reveal"; b.textContent="👁 点击复原原文";
          b.onpointerdown=(e)=>{ try{ e.preventDefault(); e.stopPropagation(); SFX.tap(); }catch(x){} se.classList.remove("v25cover"); b.remove(); };
          se.appendChild(b);
        }
      } else {
        se.classList.remove("v25cover");
        const b=se.querySelector("#v25reveal"); if(b) b.remove();
      }
      refreshPanel();
    }
    /* 说话面板：一个「开始说」按钮，说完自动收尾出对照 */
    let said="";
    function refreshPanel(){
      box.innerHTML='<div style="margin-top:10px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:rgba(255,250,240,.55)">'
        +'<div id="v25sayst" style="font-size:12.5px;color:var(--dim);margin-bottom:6px">'+(mode==="recall"?'复述模式：原文已遮住，凭记忆说本句，说完自动出逐字对照':'跟读模式：先听自动朗读，再跟着说一遍，说完自动出逐字对照')+'</div>'
        +'<textarea data-sp-patch="1" id="v25said2" rows="3" placeholder="点下面「🎙 开始说」直接说；也可以在这里打字修改" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:14px;line-height:1.8;background:#fff;resize:vertical">'+esc(said)+'</textarea>'
        +'<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">'
          +'<button class="btn sm primary" id="v25say" type="button">🎙 开始说</button>'
          +'<button class="btn sm" id="v25cmp" type="button">查看对照</button>'
          +'<button class="btn sm" id="v25rec" type="button">🔊 录音自评</button>'
        +'</div>'
        +'<div id="v25res2" style="margin-top:8px"></div>'
      +'</div>';
      const ta=box.querySelector("#v25said2"), sayBtn=box.querySelector("#v25say");
      ta.oninput=()=>{ said=ta.value; };
      box.querySelector("#v25cmp").onpointerdown=()=>{ try{SFX.tap();}catch(e){} stopVoice(); said=ta.value; showDiff(); };
      /* GPT/Gemini 式：持续监听 + 草稿实时上屏 + 停顿 2.6 秒自动收尾出对照 */
      let idleT=null, gotEcho=false;
      const finishSay=()=>{
        if(idleT){ clearTimeout(idleT); idleT=null; }
        if(!liveRec) return;
        stopVoice();                       /* 先停麦并落地草稿 */
        said=ta.value;
        sayBtn.textContent="🎙 开始说";
        if(box.querySelector("#v25sayst")) box.querySelector("#v25sayst").textContent=said.trim()?"说完自动收尾——下方是逐字对照":"没听到内容，可再说一次或直接打字";
        if(said.trim()) showDiff();
      };
      sayBtn.onpointerdown=()=>{
        try{SFX.tap();}catch(e){}
        try{ micRecStop(); }catch(_){}   /* v125：点识别时先收掉录音，避免两个都占麦克风 */
        { const rb=box.querySelector("#v25rec"); if(rb) rb.textContent="🔊 录音自评"; }
        if(liveRec){ finishSay(); return; }
        killAutoTts(); ttsStop();
        const st=box.querySelector("#v25sayst");
        said=""; ta.value="";
        gotEcho=false;
        const dft=asrDraftBinder(ta);
        liveRec=asrOnce('en-US',(fin,inter)=>{
          dft.feed(fin,inter); said=ta.value;
          if(inter||fin) gotEcho=true;
          if(st) st.textContent=inter?("识别中："+inter.slice(-46)):(fin?("已听到："+String(fin).slice(-46)):"正在听……");
          if(idleT) clearTimeout(idleT);
          idleT=setTimeout(finishSay,3500);
        },e=>{
          liveRec=null; if(sayBtn) sayBtn.textContent="🎙 开始说";
          if(st) st.textContent=e;
        },()=>ta.isConnected&&host.isConnected);
        if(!liveRec){ if(st) st.textContent="此浏览器无法调用语音识别——可直接在框里打字，再点「查看对照」"; return; }
        if(st) st.textContent="正在听……直接说本句，停一下会自动出对照";
        sayBtn.textContent="■ 停止";
        /* 光标先落进输入框，再启动识别；启动后再补一次 focus，确保打字/续说都不丢焦点 */
        try{ ta.focus(); }catch(_){}
        try{ liveRec.start(); }catch(x){ liveRec=null; sayBtn.textContent="🎙 开始说"; if(st) st.textContent="启动失败——可直接打字，再点「查看对照」"; }
        setTimeout(()=>{ try{ if(ta.isConnected&&!ta.value.trim()) ta.focus(); }catch(_){} },120);
        /* 麦克风已开却迟迟没有任何识别回包：主动释放麦克风并说明原因，不再干占着。
           v102：释放后读一次「实际用的麦克风」名字并显示——设备由浏览器决定，只能如实告知，
                 让「到底走的哪个麦」有数据可查，而不是靠猜。 */
        setTimeout(async ()=>{ try{
          if(liveRec&&!gotEcho){
            stopVoice(); sayBtn.textContent="🎙 开始说";
            let lb=null;
            try{ lb=(typeof window.__wdMicProbe==="function")?await window.__wdMicProbe():null; }catch(_){}
            const phone=/iPhone|iPad|连续互通|Continuity/i.test(String(lb||""));
            if(st&&st.isConnected) st.textContent="6 秒没有收到任何识别结果，已释放麦克风。"
              +"当前浏览器实际使用的麦克风："+(lb?("「"+lb+"」"):"读取失败")
              +(phone?"——这是手机/连续互通的麦，请在 系统设置→声音→输入 切回「MacBook 麦克风」":"")
              +"。常见原因：内置识别服务连不上（需联网/被网络屏蔽），或系统未授权麦克风。可直接在框里打字。";
          }
        }catch(_){} },6000);
      };
      /* v125：录音自评——只听自己的发音（不识别）。
         识别走「开始说」、录音走这里，两者共用同一支麦克风、不能同时开。 */
      const recBtn=box.querySelector("#v25rec");
      let recOn=false;
      recBtn.onpointerdown=()=>{
        try{SFX.tap();}catch(e){}
        const st=box.querySelector("#v25sayst");
        if(recOn){
          recOn=false; recBtn.textContent="🔊 录音自评";
          micRecStop();
          if(st) st.textContent="录音已停止——下面可回放你的发音，或点「开始说」做逐字对照";
          return;
        }
        recOn=true; recBtn.textContent="■ 停止录音";
        stopVoice();   /* 停识别，避免抢麦克风 */
        micRecStart(url=>{
          recOn=false; recBtn.textContent="🔊 录音自评";
          if(st) st.innerHTML='<span style="opacity:.7">你的发音：</span>'
            +'<button class="btn sm" id="v25pl" type="button" style="padding:0 8px;font-size:11px">▶ 回放</button> '
            +'<button class="btn sm" id="v25cl" type="button" style="padding:0 8px;font-size:11px">清除</button>';
          const pb=st.querySelector("#v25pl"), cl=st.querySelector("#v25cl");
          if(pb) pb.onpointerdown=()=>{ try{ new Audio(url).play(); }catch(_){} };
          if(cl) cl.onpointerdown=()=>{ micRecClear(); if(st) st.textContent="录音已清除"; };
        },()=>{
          if(st) st.textContent="录音中……跟读本句，说完点「■ 停止录音」听回放";
        });
      };
    }
    function showDiff(){
      const res=host.querySelector("#v25res2"); if(!res) return;
      const s=(said||"").trim();
      if(!s){ toast("还没说话——点「🎙 开始说」，或直接在框里打字"); return; }
      const cov=oralScore(s,sn.text);
      res.innerHTML='<div class="v25cov">本句'+(mode==="recall"?'复述':'跟读')+'覆盖率约 '+cov+'%（蓝色=漏掉的原文，红色=多说的内容）</div>'
        +'<div class="v25diffbox">'+_oralDiffHtml(sn.text,s)+'</div>';
    }
    ms.onpointerdown=()=>{ try{SFX.tap();}catch(e){} if(mode==="shadow") return; stopVoice(); said=""; paintMode("shadow"); };
    mr.onpointerdown=()=>{ try{SFX.tap();}catch(e){} if(mode==="recall") return; stopVoice(); said=""; paintMode("recall"); };
    paintMode("shadow");
    host.querySelector("#v25oprev").onpointerdown=()=>{ try{SFX.tap();}catch(e){} if(i>0){ stopVoice(); said=""; idx=i-1; renderSentRead(idx); } };
    host.querySelector("#v25oedit").onpointerdown=()=>{ try{SFX.tap();}catch(e){}
      stopVoice();
      try{
        const eid="fullp:"+art.id+":"+si+":"+pa;
        openEditor({ uid:eid, editId:eid, id:art.aid+'-S'+(si+1)+'-P'+(pa+1),
          title:art.name+' 第'+(si+1)+'节 第'+(pa+1)+'段', cat:"full",
          catLabel:'导游词 · '+art.name, body:raw, onSaved:()=>{ try{
            try{ if(st.edits) delete st.edits["fullsec:"+art.id+":"+si]; }catch(x){}
            rebuildSents(); renderSentRead(Math.min(i,sents.length-1)); }catch(x){} } });
      }catch(x){ toast("编辑器暂不可用"); }
    };
    host.querySelector("#v25ojump").onpointerdown=()=>{ try{SFX.tap();}catch(e){}
      stopVoice(); histPush(()=>renderSentRead(i)); renderRetell(); };
    host.querySelector("#v25onext").onpointerdown=()=>{ try{SFX.tap();}catch(e){}
      stopVoice();
      if(i+1>=sents.length){ histPush(()=>renderSentRead(i)); idx=0; renderSentRetell(0); }
      else { idx=i+1; renderSentRead(idx); }
    };
  }

  /* ③ 分句复述：遮盖原句 → 口述/打字 → 逐字对照 */
  function renderSentRetell(i){
    /* v116：同分句精读——进页先对齐最新段落再切句 */
    resyncParas(); rebuildSents();
    if(i>=sents.length) i=Math.max(0,sents.length-1);
    const sn=sents[i];
    stopVoice();   /* 切到复述页先收麦停朗读，免得盖住口述 */
    reciteT0=null; /* 每句重新计时，避免上一句没结算就把时间带过来 */
    const prevTxt=i>0?(sents[i-1]?sents[i-1].text:""):"";
    host.innerHTML='<div class="v25rd">'
      +bar('导游词 · 分句复述',(i+1)+' / '+sents.length+' 句','')
      +head()
      +(prevTxt?'<details class="v25ctx" style="margin-bottom:6px"><summary>上下文 · 上一句</summary><div style="padding:6px 8px;font-size:12.5px;color:var(--dim)">'+esc(prevTxt)+'</div></details>':'')
      +'<div class="v25sent-no">第 '+(i+1)+' 句 · 先遮盖原文，复述完再点开对照</div>'
      +_oralCover(esc(sn.text))
      +'<textarea data-sp-patch="1" id="v25said" rows="3" placeholder="复述本句（点「🎙 语音输入」开口说，也可直接打字）" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:14px;line-height:1.8;background:rgba(255,250,240,.5);resize:vertical"></textarea>'
      +'<div id="v25rstat" style="font-size:12px;color:var(--dim);margin:4px 0 0;min-height:16px"></div>'
      +'<div class="v25rd-acts" id="v25actsMain">'
        +'<button class="btn sm" id="v25oprev" type="button"'+(i>0?'':' disabled')+'>◀ 上一句</button>'
        +'<button class="btn sm" id="v25oasr" type="button">🎙 语音输入</button>'
        +'<button class="btn sm primary" id="v25ook" type="button">完成本句，查看对照</button>'
        +'<button class="btn sm" id="v25oskipone" type="button">下一句 ⏭</button>'
      +'</div>'
      +'<div id="v25ost"></div>'
      +'<div id="v25ores"></div></div>';
    _bindOralCover(host);
    const ta=host.querySelector("#v25said"), asrBtn=host.querySelector("#v25oasr"), stEl=host.querySelector("#v25ost");
    const advance=()=>{ stopVoice(); if(i+1>=sents.length) renderRead(2); else { idx=i+1; renderSentRetell(idx); } };
    /* v104：复述计时——首次输入（打字或开口）打点，完成后结算本句词数与 WPM
       计时条每 0.5 秒刷新，后台持续计算语速；页面被替换后自动停表，不留定时器 */
    const rstat=host.querySelector("#v25rstat");
    const markStart=()=>{ if(!reciteT0) reciteT0=Date.now(); };
    ta.addEventListener("input",markStart);
    let tick=setInterval(()=>{
      if(!rstat||!rstat.isConnected){ clearInterval(tick); return; }
      if(!reciteT0){ rstat.textContent=""; return; }
      const d=(Date.now()-reciteT0)/1000, w=_reciteWords(ta.value||""), wpm=d>0.8?Math.round(w/(d/60)):0;
      rstat.innerHTML='<span style="color:var(--gold)">⏱ '+Math.floor(d/60)+':'+String(Math.floor(d%60)).padStart(2,"0")+'</span>'
        +' · '+w+' 词 · 当前 <b style="color:var(--gold)">'+(wpm||"—")+'</b> WPM';
    },500);
    let speechDur=0;
    const mic=_bindReciteMic(ta,asrBtn,stEl,'en-US',d=>{ speechDur=d; },()=>ta.isConnected&&host.isConnected);
    host.querySelector("#v25oskipone").onpointerdown=()=>{ try{SFX.tap();}catch(e){} advance(); };
    host.querySelector("#v25oprev").onpointerdown=()=>{ try{SFX.tap();}catch(e){} if(i>0){ stopVoice(); idx=i-1; renderSentRetell(idx); } };
    host.querySelector("#v25ook").onpointerdown=()=>{
      try{SFX.tap();}catch(e){}
      if(mic&&mic.busy()){ toast("还在识别——先点「■ 停止」，等整句识别完再结算"); return; }
      stopVoice();
      const said=(ta.value||"").trim();
      if(!said){ toast("还没有内容——可以直接打字，或点「下一句」先跳过"); return; }
      /* v109：语音输入走容错对照（识别误差不算错），时长优先用录音实测时长 */
      const byVoice=speechDur>0.8;
      const cov=oralScore(said, sn.text, byVoice);
      const dur=byVoice?speechDur:(reciteT0?(Date.now()-reciteT0)/1000:0);
      speechDur=0;
      const w=_reciteWords(said);
      if(dur>0.8){ wdReciteTick(w,dur,"sent"); reciteT0=null; }
      host.querySelector("#v25ores").innerHTML=
        '<div class="v25cov">本句覆盖率约 '+cov+'%（蓝色=漏掉的原文，红色=多说的内容）'
          +(byVoice?'<span style="opacity:.6"> · 语音输入已按识别容错计</span>':'')+'</div>'
        +'<div class="v25diffbox">'+_oralDiffHtml(sn.text, said, byVoice)+'</div>'
        +(dur>0.8?wdReciteInlineHtml(w,dur):'')
        +'<div class="v25rd-acts">'
          +'<button class="btn sm" id="v25retry" type="button">🔄 再试本句</button>'
          +'<button class="btn sm" id="v25oprev2" type="button"'+(i>0?'':' disabled')+'>◀ 上一句</button>'
          +'<button class="btn sm primary" id="v25onext" type="button">'+(i+1>=sents.length?'进入整段重读 →':'下一句 →')+'</button>'
        +'</div>';
      /* v126：结算后收起中排按钮（语音/完成/下一句），避免出现两个「下一句」挤在一起 */
      const actMain=host.querySelector("#v25actsMain"); if(actMain) actMain.style.display="none";
      host.querySelector("#v25onext").onpointerdown=()=>{ try{SFX.tap();}catch(e){} advance(); };
      const p2=host.querySelector("#v25oprev2"); if(p2) p2.onpointerdown=()=>{ try{SFX.tap();}catch(e){} if(i>0){ stopVoice(); idx=i-1; renderSentRetell(idx); } };
      /* v127：再试本句——同一句可反复练：清对照结果、重新遮盖原文、恢复语音/完成按钮 */
      const rt=host.querySelector("#v25retry");
      if(rt) rt.onpointerdown=()=>{ try{SFX.tap();}catch(e){}
        host.querySelector("#v25ores").innerHTML="";
        const am=host.querySelector("#v25actsMain"); if(am) am.style.display="flex";
        ta.value=""; reciteT0=null; speechDur=0;
        if(stEl) stEl.textContent="";
        const rs=host.querySelector("#v25rstat"); if(rs) rs.textContent="";
        _recoverCover(host);
        try{ ta.focus(); }catch(_){}
      };
    };
  }

  /* ⑤ 整段复述：遮盖全节 → 复述 → 逐字对照 → 完成本节 */
  function renderRetell(){
    stopVoice();
    reciteT0=null;  /* 整段复述重新计时 */
    const fullHtml=paras.map(p=>{
      const v=_oralSplit(_oralParaRaw(art,si,paOf(p),p.text));
      return (p.head?'<div class="v25subhead">'+esc(p.head)+'</div>':'')+v.body;
    }).join('<br><br>');
    host.innerHTML='<div class="v25rd">'
      +bar('导游词 · 整段复述','第 '+(si+1)+' 节 · 第 5 步','')
      +head()
      +_oralCover(fullHtml)
      +'<textarea data-sp-patch="1" id="v25said" rows="4" placeholder="整段复述上屏，也可直接打字" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:14px;line-height:1.8;background:rgba(255,250,240,.5);resize:vertical"></textarea>'
      +'<div id="v25rstat" style="font-size:12px;color:var(--dim);margin:4px 0 0;min-height:16px"></div>'
      +'<div class="v25rd-acts">'
        +'<button class="btn sm" id="v25oasr" type="button">🎙 语音输入</button>'
        +'<button class="btn sm primary" id="v25ook" type="button">完成复述，查看对照</button>'
        +'<button class="btn sm" id="v25opeek" type="button">👁 偷看原文</button>'
      +'</div>'
      +'<div id="v25ost"></div>'
      +'<div id="v25ores"></div></div>';
    _bindOralCover(host);
    const ta=host.querySelector("#v25said"), asrBtn=host.querySelector("#v25oasr"), stEl=host.querySelector("#v25ost");
    /* v104：整段复述计时（同分句复述，只是结算口径为整节） */
    const rstat=host.querySelector("#v25rstat");
    const markStart=()=>{ if(!reciteT0) reciteT0=Date.now(); };
    ta.addEventListener("input",markStart);
    let tick=setInterval(()=>{
      if(!rstat||!rstat.isConnected){ clearInterval(tick); return; }
      if(!reciteT0){ rstat.textContent=""; return; }
      const d=(Date.now()-reciteT0)/1000, w=_reciteWords(ta.value||""), wpm=d>0.8?Math.round(w/(d/60)):0;
      rstat.innerHTML='<span style="color:var(--gold)">⏱ '+Math.floor(d/60)+':'+String(Math.floor(d%60)).padStart(2,"0")+'</span>'
        +' · '+w+' 词 · 当前 <b style="color:var(--gold)">'+(wpm||"—")+'</b> WPM';
    },500);
    let speechDur=0;
    const mic=_bindReciteMic(ta,asrBtn,stEl,'en-US',d=>{ speechDur=d; },()=>ta.isConnected&&host.isConnected);
    host.querySelector("#v25opeek").onpointerdown=()=>{
      try{SFX.tap();}catch(e){}
      const c=host.querySelector(".v25cover");
      if(c){ c.classList.remove("v25cover"); const b=c.querySelector("#v25reveal"); if(b) b.remove(); }
    };
    host.querySelector("#v25ook").onpointerdown=()=>{
      try{SFX.tap();}catch(e){}
      if(mic&&mic.busy()){ toast("还在识别——先点「■ 停止」，等整句识别完再结算"); return; }
      stopVoice();
      const said=(ta.value||"").trim();
      if(!said){ toast("先复述本节，或点「偷看原文」"); return; }
      const byVoice=speechDur>0.8;
      const cov=oralScore(said, allPlain(), byVoice);
      const dur=byVoice?speechDur:(reciteT0?(Date.now()-reciteT0)/1000:0);
      speechDur=0;
      const w=_reciteWords(said);
      if(dur>0.8){ wdReciteTick(w,dur,"whole"); reciteT0=null; }
      host.querySelector("#v25ores").innerHTML=
        '<div class="v25cov">全节覆盖率约 '+cov+'%（蓝色=漏掉的原文，红色=多说的内容）'
          +(byVoice?'<span style="opacity:.6"> · 语音输入已按识别容错计</span>':'')+'</div>'
        +'<div class="v25diffbox">'+_oralDiffHtml(allPlain(), said, byVoice)+'</div>'
        +(dur>0.8?wdReciteInlineHtml(w,dur):'')
        +'<div class="v25rd-acts">'
          +'<button class="btn sm" id="v25retryW" type="button">🔄 再试整段</button>'
          +'<button class="btn sm primary" id="v25ofin" type="button">完成本节 →</button>'
        +'</div>';
      host.querySelector("#v25ofin").onpointerdown=()=>{ try{SFX.tap();}catch(e){} done(); };
      /* v127：再试整段——整节可反复练：清对照、重新遮盖，语音/完成按钮本就可见 */
      const rw=host.querySelector("#v25retryW");
      if(rw) rw.onpointerdown=()=>{ try{SFX.tap();}catch(e){}
        host.querySelector("#v25ores").innerHTML="";
        ta.value=""; reciteT0=null; speechDur=0;
        if(stEl) stEl.textContent="";
        const rs=host.querySelector("#v25rstat"); if(rs) rs.textContent="";
        _recoverCover(host);
        try{ ta.focus(); }catch(_){}
      };
    };
  }

  renderRead(1);
}

/* —— 科目五单元：逐项推进；同景点连续讲解卡合组走整段三段式；含口译卡的单元收尾追加一轮 AI 新题 —— */
function runS5Unit(u){
  if(u&&u.dynInterp){ runDynInterpUnit(u); return; }
  if(u.items.length&&/^ORAL:/.test(String(u.items[0].id||""))){ runOralSectionUnit(u); return; }
  _markRun(u);
  const cards=u.items.map(it=>(D.pointsLib||[]).find(p=>p.id===it.id)).filter(Boolean);
  /* 预分组：连续、同 module 且属「景点讲解」的 recite/oral 卡合成一组（整段导游词），其余逐卡 */
  const flow=[]; let _i=0;
  while(_i<cards.length){
    const p=cards[_i], k=cardKind(p);
    if((k==="oral"||k==="recite") && /景点讲解/.test(p.module||"")){
      /* 景点讲解卡一律走 drawReciteGroup（含语料编号挂接英文导游词），单张也进组，杜绝单卡路径漏英文 */
      let _j=_i+1;
      while(_j<cards.length){
        const k2=cardKind(cards[_j]);
        if((k2==="oral"||k2==="recite") && cards[_j].module===p.module) _j++; else break;
      }
      flow.push({grp:true, ps:cards.slice(_i,_j)}); _i=_j; continue;
    }
    flow.push({p:p}); _i++;
  }
  const ov=panel('<h2>单元 #'+u.n+' · 面试（'+cards.length+' 张卡 · 约 '+u.mins+' 分钟）</h2><div id="v25s" style="margin-top:10px"></div>');
  const host=ov.querySelector("#v25s");
  _addBack(ov); histReset();
  let idx=0, aiRoundDone=!cards.some(p=>cardKind(p)==="interp");
  function draw(){
    if(!ov.isConnected) return;
    if(idx>=flow.length){
      if(!aiRoundDone){ aiRoundDone=true; aiInterpRound(host, draw); return; }
      histPush(()=>{ idx=Math.max(0,flow.length-1); draw(); });   /* 小结页可退回最后一卡 */
      _finBtn(host, ov, u, cards.length, cards.length,
        '<div class="v25qz"><div class="v25res v25res-ok"><div class="v25res-hd">✦ 本单元完成</div>'
        +cards.length+' 张卡全部走完——自评结果已入档，星盘到期自会回访。</div></div>');
      return;
    }
    const f=flow[idx]; const cur=idx;
    const adv=()=>{ histPush(()=>{ idx=cur; draw(); }); idx++; draw(); };   /* 推进前把当前卡页压栈，返回可回退 */
    const tag='<div style="font-size:11px;color:var(--dim);margin-bottom:6px">第 '+(idx+1)+'/'+flow.length+' 项</div>';
    host.innerHTML=tag;
    if(f.grp){
      drawReciteGroup(host, f.ps, adv);
    } else {
      const p=f.p, k=cardKind(p);
      if(k==="interp"){
        const s=_seedSrcRef(p);
        renderInterpQ(host, { key:p.id, dir:s.dir, src:s.src, ref:s.ref, tip:p.exam_tip||"", from:"seed" }, adv);
      } else if(k==="qa") drawQA(host, p, adv);
      else drawRecite(host, p, adv, k==="oral"?"en-US":"zh-CN");
    }
    host.insertAdjacentHTML("afterbegin", tag);
  }
  draw();
}
/* 口译 AI 加练轮：2 题（出新失败自动本地模拟），支撑「持续出新题」 */
function aiInterpRound(host, done){
  host.innerHTML='<div class="note">✦ 种子卡已完成——正在出 AI 加练题…（'+(dsReady()?"AI 出新":"本地模拟")+'）</div>';
  const gen=dsReady()? aiGenInterp25(2).catch(()=>mockInterp25(2)) : Promise.resolve(mockInterp25(2));
  gen.then(items=>{
    if(!host.isConnected) return;
    if(!items||!items.length){ done(); return; }
    let i=0;
    host.innerHTML='<div class="note" style="border-left-color:var(--gold)">加练 '+items.length+' 题（新题已入库，25 天不重样）</div>';
    const step=()=>{ if(i>=items.length){ done(); return; } renderInterpQ(host, items[i], ()=>{ i++; step(); }); };
    step();
  });
}

/* v109：每日口译新题单元——不进种子卡，直接让 AI 现场出 3 道新题（旧题按 sig 去重） */
function runDynInterpUnit(u){
  _markRun(u);
  const ov=panel('<h2>口译 · 每日新题（约 '+DYN_MINS+' 分钟）</h2><div id="v25s" style="margin-top:10px"></div>');
  const host=ov.querySelector("#v25s");
  _addBack(ov); histReset();
  host.innerHTML='<div class="note" style="border-left-color:var(--gold)">口译库里的题目只是示范用——这里每次都由 AI 现出新题（旧题去重，不会让你重复背同一道）。'
    +(dsReady()?"":" 当前未配置 AI 密钥，先用本地模拟题占位，配好密钥后自动换成真题风。")+'</div>';
  const gen=dsReady()? aiGenInterp25(3).catch(()=>mockInterp25(3)) : Promise.resolve(mockInterp25(3));
  gen.then(items=>{
    if(!host.isConnected) return;
    if(!items||!items.length){
      host.innerHTML='<div class="note">这次没能出题（网络或密钥问题）。可以先做别的任务，稍后再来——口译任务每天都会重试出新。</div>'
        +'<div style="margin-top:10px"><button class="btn primary" id="v25fin" type="button">先跳过</button></div>';
      const b=ov.querySelector("#v25fin");
      if(b) b.onpointerdown=()=>{ try{SFX.tap();}catch(e){} _closePanel(ov); };
      return;
    }
    let i=0;
    const step=()=>{
      if(i>=items.length){
        _finBtn(host, ov, u, items.length, items.length,
          '<div class="v25qz"><div class="v25res v25res-ok"><div class="v25res-hd">✦ 今日口译完成</div>'
          +'今天这 '+items.length+' 道已入题库（从没出过的题），下次再来会换一批新的。</div></div>');
        return;
      }
      host.innerHTML='<div class="note" style="border-left-color:var(--gold)">今日新题 '+items.length+' 道 · 第 '+(i+1)+' 道</div>';
      renderInterpQ(host, items[i], ()=>{ i++; step(); });
    };
    step();
  });
}
/* ==================== [11] 任务单渲染（修行视图） ==================== */
function renderBoard(){
  const stream=document.getElementById("stream"); if(!stream||typeof st==="undefined"||!st) return;
  const v=v25st(); const U=allUnits(); const day=st.day||1;
  /* 完成数只统计现存单元：防止删空单元后 done 残留导致分子虚高 */
  const doneMap=v.done||{}, doneN=U.filter(u=>doneMap[u.n]).length;
  const pct=U.length?Math.round(100*doneN/U.length):0;
  const dueN=(function(){ try{ return srsDueKeys().length; }catch(e){ return 0; } })();
  if(day>25){
    stream.innerHTML='<div style="padding:10px 4px"><div style="font-size:20px;color:var(--gold)">25 日周期已圆满</div>'
      +'<div class="note" style="margin-top:8px">全部 '+U.length+' 个单元完成 '+doneN+' 个。可随时到「演界」做全真演练保持手感，星盘错题会继续按回潮节奏到期。</div>'
      +'<div style="margin-top:10px"><button class="btn primary" id="v25arena" type="button">进入演界 · 全真演练</button></div></div>';
    const ab=stream.querySelector("#v25arena"); if(ab) ab.onpointerdown=()=>{ try{switchView("arena");}catch(e){} };
    return;
  }
  const sh=sheet(day);
  ensurePlan25(day, sh, stream);
  const estMins=sh.items.reduce((a,it)=>{ const u=unitByN(it.u); return a+(u?u.mins:0); },0);
  const doneToday=sh.items.filter(it=>sh.done&&sh.done[it.u]).length;
  let h='<div style="padding:8px 4px">'
    +'<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:baseline">'
    +'<span style="font-size:22px;color:var(--neon);font-weight:700">第 '+day+' 日 / 25</span>'
    +'<span>今日 <b>'+doneToday+'/'+sh.items.length+'</b> 单元 · 约 '+Math.round(estMins)+' 分钟</span>'
    +'<span title="'+U.length+' = 全库任务单元总数（把要背的全部考点按每单元约 25 分钟打包；你自己新增的训练卡并入或新增单元后会随之上浮，例如 97→98）">总进度 <b>'+doneN+'/'+U.length+'</b> 单元（'+pct+'%）</span></div>'
    +'<div style="height:8px;background:var(--bg3);border-radius:4px;margin:10px 0"><div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,var(--neon),var(--cyber));border-radius:4px"></div></div>';
  /* 25 日周期热力格：全完成=neon / 部分=gold / 今日=描边 / 未来=暗，悬停看日期 */
  const d0=v.startDate?new Date(v.startDate+"T00:00:00"):null;
  let cells="";
  for(let d=1;d<=25;d++){
    const s=(v.sheets||{})["d"+d];
    let bg="var(--bg3)", st2="";
    if(s&&s.items&&s.items.length){
      if(s.items.every(it=>s.done&&s.done[it.u])){ bg="var(--neon)"; st2=" · 全完成"; }
      else if(s.items.some(it=>s.done&&s.done[it.u])){ bg="var(--gold)"; st2=" · 部分完成"; }
      else if(d<day) st2=" · 未完成";
    }
    const dt=d0?new Date(d0.getTime()+(d-1)*864e5):null;
    cells+='<span title="第 '+d+' 日'+(dt?("（"+(dt.getMonth()+1)+"/"+dt.getDate()+"）"):"")+st2+'" style="width:12px;height:12px;border-radius:3px;background:'+bg+';'
      +(d>day?"opacity:.35;":"")+'border:1px solid '+(d===day?"var(--neon)":"transparent")+';box-sizing:border-box"></span>';
  }
  h+='<div style="display:flex;gap:2px;flex-wrap:wrap;margin:0 0 10px">'+cells+'</div>';
  if(!sh.items.length){
    h+='<div class="note" style="border-left-color:var(--gold)">收尾日——不派新单元。到「演界」做一套全真演练，再清一遍星盘到期卡即可。</div>'
      +'<div style="margin:10px 0"><button class="btn primary" id="v25arena" type="button">进入演界 · 全真演练</button></div>';
  } else {
    /* 今日负荷分段条：每段=一个任务的分钟占比，段色=科目色，完成即点亮 */
    h+='<div style="display:flex;gap:4px;margin:0 0 8px">'+sh.items.map(it=>{
      const u=unitByN(it.u); if(!u) return "";
      const wd=estMins?Math.max(7,Math.round(100*u.mins/estMins)):10;
      const dn2=!!(sh.done&&sh.done[it.u]);
      const sc=subjColor(u.subj);
      return '<span title="单元 #'+u.n+' · 约 '+u.mins+' 分钟" style="width:'+wd+'%;height:6px;border-radius:3px;background:'+(dn2?sc:"var(--bg3)")+'"></span>';
    }).join("")+'</div>';
    /* 今日任务卡：横排一行（卡数超出即横向滚动），整卡可点即进入修行（不再单设按钮）。
       排序铁律：未完成靠前、已完成靠后；组内导游词类靠前，且两段导游词之间安插其他任务 */
    const all=sh.items.map((it,i)=>{ const u=unitByN(it.u); if(!u) return null;
      const dn=!!(sh.done&&sh.done[it.u]);
      const run=!dn&&!!(v.runs&&v.runs[u.n]);
      return { it, i, u, dn, run };
    }).filter(Boolean);
    const isTour=c=>s5Cat(c.u)==="tour";
    const cards=_dayArrange(all.filter(c=>!c.dn),isTour).concat(_dayArrange(all.filter(c=>c.dn),isTour));
    if(!cards.length){
      h+='<div class="note" style="border-left-color:var(--gold)">今日无排程——雾里休整，或到「演界」自由演练。</div>';
    } else {
      h+='<div style="display:flex;gap:8px;overflow-x:auto;align-items:stretch;padding:4px 0 10px">'+cards.map((c,idx)=>{
        const u=c.u;
        /* 配色统一规则：主色永远=科目色，只用于左侧色条 + 科目小标签；类别（导游词/知识问答/口译/笔试）只做文字标签，
           不再让类别色覆盖科目色（原先把科目五导游词染成科目二的橙色，两个科目看起来一样） */
        const accent=subjColor(u.subj);
        const cat=s5Cat(u);
        const catLabel=cat?S5_CATS[cat].label:"笔试";
        const recN=doneMap[u.n];
        let extra="";
        if(c.it.kind==="rev"&&recN){ const gap=day-(recN.lastRev||recN.day||day);
          extra=(gap>0?gap+' 天前学过':'今天学过')+' · 第 '+((recN.revs||0)+1)+' 次复习'; }
        else if(c.it.kind==="new"&&!recN) extra="首次学习";
        else if(c.it.kind==="test") extra="重测校验";
        const stTxt=c.dn?"已完成":(c.run?"进行中":"待开始");
        const stCol=c.dn?"var(--ok)":(c.run?"var(--gold)":"var(--dim)");
        const isCur=(idx===0&&!c.dn);
        const isOralU=/^ORAL:/.test(String((u.items[0]||{}).id||""));
        const oTitle=(u.items[0]||{}).title||"";
        /* 标题统一：内容在前、编号后置。导游词=「篇 · 第N节「章节名」」；笔试=模块链 */
        const content=isOralU?oTitle:((u.mods||[]).join(" / ")||u.title||("单元 #"+u.n));
        const subjShort=String(u.subj||"").replace(/^科目([一二三四五]).*/,"科目$1").replace(/（.*$/,"");
        const chip=(t,col,brd)=>'<span style="font-size:9.5px;padding:0 5px;border-radius:8px;border:1px solid '+brd+';color:'+col+';white-space:nowrap">'+t+'</span>';
        const badge=chip(esc(subjShort),accent,accent)+chip(catLabel,"var(--dim)","var(--border)");
        const tip=subjShort+' '+catLabel+' · 单元 #'+u.n+(isOralU?' · '+oTitle:'');
        return '<div data-u="'+u.n+'" title="'+esc(tip)+'" style="cursor:pointer;flex:1 1 0;min-width:124px;max-width:280px;display:flex;flex-direction:column;gap:6px;padding:9px 10px 9px 12px;border:1px solid var(--border);border-left:3px solid '+accent+';border-radius:12px;background:'+(isCur?"rgba(255,255,255,.07)":"rgba(255,255,255,.03)")+';'+(c.dn?"opacity:.55;":"")+'">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;gap:4px">'
          +'<span style="font-size:10px;color:var(--dim);white-space:nowrap">今日 '+(idx+1)+'/'+cards.length+'</span>'
          +'<span style="font-size:9.5px;padding:0 5px;border-radius:8px;border:1px solid '+stCol+';color:'+stCol+';white-space:nowrap">'+stTxt+'</span></div>'
          +'<div style="font-size:13px;font-weight:600;line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">'+esc(content)+'</div>'
          +'<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">'+badge+'<span style="font-size:9.5px;color:var(--dim)">#'+u.n+'</span></div>'
          +'<div style="font-size:10px;color:var(--dim);line-height:1.55;word-break:break-word">'+u.items.length+' 条目 · 约 '+u.mins+' 分钟'+(extra?' · '+extra:'')+'</div>'
          +'</div>';
      }).join("")+'</div>';
      if(cards.every(c=>c.dn)) h+='<div class="note" style="border-left-color:var(--ok)">今日单元全部完成——回潮复习见「巡夜」，明日任务单已就绪。</div>';
    }
  }
  /* ===== 学情看板（原全局看板并入）：待回潮/错题/误译/掌握度，数字可点直达修炼场 ===== */
  const subSrs={};
  try{
    const srsOf=(ids)=>{ const today=srsToday(); let learned=0,solid=0,due=0;
      ids.forEach(k=>{ const r=st.srs&&st.srs[k]; if(!r||!r.tier)return;
        learned++; if(r.tier>=3)solid++; if(!r.pending&&r.due<=today)due++; });
      return {total:ids.length,learned,solid,due}; };
    ["S1","S2","S3","S4","S5"].forEach(s=>{
      subSrs[s]=srsOf((D.pointsLib||[]).filter(p=>(p.id||"").startsWith(s+"-")).map(p=>p.id));
    });
    subSrs.trans=srsOf((D.oralLib||[]).map(x=>x.id));
  }catch(e){}
  const wrongN=(st.wrong||[]).length, transN=Object.keys(st.transWrongs||{}).length;
  const kpi=(go,val,label,hot)=>'<div data-go="'+go+'" style="flex:1;min-width:84px;padding:10px 8px;border:1px solid var(--border);border-radius:8px;text-align:center;background:rgba(255,255,255,.03);cursor:pointer">'
    +'<div style="font-size:20px;font-weight:700;color:'+(hot?"var(--gold)":"var(--neon)")+'">'+val+'</div>'
    +'<div style="font-size:11px;color:var(--dim);margin-top:2px">'+label+'</div></div>';
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">'
    +kpi("night",dueN,"今日待回潮",dueN>0)
    +kpi("star",wrongN,"错题知识点",wrongN>0)
    +kpi("night",transN,"误译册",transN>0)
    +kpi("star",st.quizOk||0,"累计答对",false)+'</div>';
  /* 五科考点掌握度：进度条=已学/全部考点；金色「待回潮」可点进巡夜 */
  h+='<div style="margin:14px 0 2px;font-size:12px;color:var(--gold);letter-spacing:.08em">✦ 五科考点掌握度</div>'
    +'<div style="font-size:11px;color:var(--dim);margin-bottom:4px">点科目行进藏经阁看全部考点；点金色「待回潮」直接去巡夜复习</div>';
  ["S1","S2","S3","S4","S5"].forEach(s=>{
    const z=subSrs[s]; if(!z)return;
    const name=(typeof RT_SUBJ_NAME!=="undefined"&&RT_SUBJ_NAME[s])||(s==="S5"?"英文问契":("科目"+s.slice(1)));
    const pc=z.total?Math.round(100*z.learned/z.total):0;
    const sc=subjColor(s);
    h+='<div style="display:flex;align-items:center;gap:8px;margin:5px 0;padding:6px 8px;border:1px solid var(--border);border-radius:8px">'
      +'<span data-jump="'+_nearestUnitOf(s)+'" title="跳到该科目临近任务" style="font-size:12px;width:72px;cursor:pointer;color:'+sc+'">'+esc(name)+'</span>'
      +'<div data-jump="'+_nearestUnitOf(s)+'" title="跳到该科目临近任务" style="flex:1;height:7px;background:var(--bg3);border-radius:4px;overflow:hidden;cursor:pointer"><div style="height:100%;width:'+pc+'%;background:'+sc+';border-radius:4px"></div></div>'
      +'<span style="font-size:11px;color:var(--dim);width:64px;text-align:right">'+z.learned+'/'+z.total+'</span>'
      +(z.due?'<span data-go="night" style="font-size:11px;color:var(--gold);width:60px;text-align:right;cursor:pointer">'+z.due+' 待回潮</span>'
             :'<span style="font-size:11px;color:var(--dim);width:60px;text-align:right">'+z.solid+' 巩固</span>')
      +'</div>';
  });
  /* 传译语料 + 六篇修诵（独立修炼场入口） */
  let oLearned=0,oTotal=0;
  const six=(D.oralFull||[]).map(o=>{ const dn=oralSecDoneCount(o), tn=(o.sections||[]).length; oLearned+=dn; oTotal+=tn; return {o,dn,tn}; });
  const tz=subSrs.trans||{total:0,learned:0,due:0,solid:0}, tp=tz.total?Math.round(100*tz.learned/tz.total):0, op=oTotal?Math.round(100*oLearned/oTotal):0;
  h+='<div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 4px">'
    +'<div data-go="night" style="flex:1;min-width:220px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer">'
    +'<div style="font-size:12px;color:var(--gold);margin-bottom:4px">✦ 传译语料（'+tz.learned+'/'+tz.total+' 句已练）</div>'
    +'<div style="height:7px;background:var(--bg3);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+tp+'%;background:linear-gradient(90deg,#2aa198,var(--neon));border-radius:4px"></div></div>'
    +'<div style="font-size:11px;color:var(--dim);margin-top:4px">'+tz.solid+' 句巩固'+(tz.due?' · <b style="color:var(--gold)">'+tz.due+' 句待回潮</b>':'')+(transN?' · '+transN+' 句在误译册':'')+'</div></div>'
    +'<div data-go="oral" style="flex:1;min-width:220px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer">'
    +'<div style="font-size:12px;color:var(--gold);margin-bottom:4px">✦ 六篇导游词整段复述（'+oLearned+'/'+oTotal+' 节已诵）</div>'
    +'<div style="height:7px;background:var(--bg3);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+op+'%;background:linear-gradient(90deg,#b8923a,var(--gold));border-radius:4px"></div></div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">'+six.map(z=>'<span style="font-size:10.5px;padding:1px 7px;border-radius:9px;border:1px solid var(--border);color:'+(z.dn>=z.tn?"var(--ok)":"var(--dim)")+'">'+esc(z.o.name)+' '+z.dn+'/'+z.tn+'</span>').join("")+'</div></div></div>';
  /* 复述语速统计区（v104）：累计语速 / 最近 12 次趋势柱状 / 全文通读时长预估 */
  h+='<div style="margin:10px 0 4px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.03)">'
    +'<div style="font-size:12px;color:var(--gold);margin-bottom:6px">✦ 复述语速 · 时长预估</div>'
    +wdReciteStatHtml()
    +'</div>';
  /* 任务推进：五科单元完成度（与上面的考点掌握度不同口径：这是 25 日任务单的完成情况） */
  const bySubj={};
  U.forEach(u=>{ const k=(u.subj.match(/^科目[一二三四五]/)||["其他"])[0];
    (bySubj[k]=bySubj[k]||{full:u.subj,arr:[]}).arr.push(u); });
  h+='<div style="margin-top:14px;font-size:12px;color:var(--dim)">任务推进 · 五科单元（25 日任务单完成情况）</div>';
  Object.keys(bySubj).forEach(k=>{
    const g=bySubj[k]; const dn3=g.arr.filter(u=>doneMap[u.n]).length;
    const pc=g.arr.length?Math.round(100*dn3/g.arr.length):0;
    const ju=_nearestUnitOf(k);
    const sc=subjColor(k);
    h+='<div data-jump="'+ju+'" style="display:flex;align-items:center;gap:8px;margin:4px 0;cursor:pointer" title="跳到该科目临近任务 · '+esc(g.full)+'">'
      +'<span style="font-size:11px;width:52px;color:'+sc+'">'+esc(k)+'</span>'
      +'<div style="flex:1;height:6px;background:var(--bg3);border-radius:3px"><div style="height:100%;width:'+pc+'%;background:'+sc+';border-radius:3px"></div></div>'
      +'<span style="font-size:11px;color:var(--dim);width:52px;text-align:right">'+dn3+'/'+g.arr.length+'</span></div>';
  });
  const dn=(v.dailyOv||{})["d"+day];
  const _HH=planHorizon();
  h+='<div style="font-size:11px;color:var(--dim);margin-top:10px">节奏：第 1~'+_HH.N1+' 日覆盖全部 '+U.length+' 单元（'+_HH.dl1+' 前完成基础覆盖），第 '+(_HH.N1+1)+'~'+_HH.N2+' 日复习强化 + 全真演练（'+_HH.dl2+' 截止）。</div>'
    +'<div style="font-size:11px;color:var(--dim);margin-top:4px">'+(v.plan?('全局规划 · '+(v.plan.mock?'本地骨架':'R1 智能')+' · 第 '+((v.plan.gens)||1)+' 版：'+esc(v.plan.note||'')):(dsReady()?'全局规划：生成中…':'全局规划：本地骨架生成中…'))+'</div>'
    +(v.plan&&v.plan.lastErr?'<div style="font-size:11px;color:var(--danger);margin-top:4px">⚠ R1 最近一次重排未采用，现用方案沿用上一版：'+esc(v.plan.lastErr)+'</div>':'')
    +(v.plan&&v.plan.intro?'<div style="margin-top:6px;font-size:12px;line-height:1.75;color:var(--ink);background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px;padding:9px 11px;white-space:pre-line">'+esc(v.plan.intro)+'</div>':'')
    +(sh.items.length?'<div style="font-size:11px;color:var(--dim);margin-top:4px">flash 今日微调：'+(dn?esc(dn.note||'已校核'):(dsReady()?'校核中…':'本地校核'))+'</div>':'')
    +'</div>';
  stream.innerHTML=h;
  const ab=stream.querySelector("#v25arena"); if(ab) ab.onpointerdown=()=>{ try{switchView("arena");}catch(e){} };
  stream.querySelectorAll("[data-u]").forEach(b=>b.onpointerdown=()=>{ try{SFX.tap();}catch(e){} runUnit(+b.dataset.u); });
  stream.querySelectorAll("[data-go]").forEach(b=>b.onpointerdown=()=>{ try{SFX.tap();switchView(b.dataset.go);}catch(e){} });
  stream.querySelectorAll("[data-jump]").forEach(b=>b.onpointerdown=()=>{ try{SFX.tap();runUnit(+b.dataset.jump);}catch(e){} });
}
/* 引擎启动：登记启程日；若当前停在修行视图则立刻渲染；V25 就绪后重刷常设任务侧栏（boot 时它先于本引擎渲染，会停在「加载中」） */
function engineBoot(){
  const v=v25st();
  v._planning=false; /* 上次会话可能中断在规划途中 */
  try{ injectCards(); }catch(e){ console.error("[v25] 用户卡片注入失败",e); }
  if(!v.startDate) { v.startDate=todayStr(); save(); }
  try{ /* 页脚版本水印——让用户一眼确认跑的是什么版本 */
    const el=document.getElementById("v25ver");
    if(el){ el.textContent=VER+" "+(/^file:/.test(location.protocol)?"[file:// 协议，HD自动关]":""); el.title="引擎版本 "+VER+" · 点击跳到配置·实验特性·朗读自检"; el.style.cursor="pointer"; el.onpointerdown=()=>{ try{ document.querySelector('[data-act="cfg"]')?.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); document.querySelector('[data-tab="agent"]')?.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); document.querySelector('#ttsDiagBtn')?.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); }catch(e){} }; }
  }catch(e){}
  try{ if(typeof view!=="undefined"&&view==="v25") renderBoard(); }catch(e){}
  /* 首次解析时 index.html 的头部在 V25 就绪前已渲染过（那时天数只能取兜底 25），这里补一次，让天数按真实截止日刷新 */
  try{ if(typeof _renderGame==="function") _renderGame(); }catch(e){}
  try{ if(typeof renderSidePanel==="function") renderSidePanel(); }catch(e){}
}

/* 进入修行即标记「进行中」（已开始、尚未完成）：任务单据此显示状态；完成时自动撤下（见 unitDone）。
   只存一个布尔标记，不绑定日期——跨日仍沿用「未学完」的语义，避免日期比较导致状态丢失 */
function _markRun(u){ const v=v25st(); v.runs=v.runs||{}; v.runs[u.n]=1; try{ save(); }catch(e){} }
/* 面板关闭后刷新任务板：让「进行中/已完成」状态与排序即时反映（重绘代价很小，无需可见性判断） */
function refreshBoard(){
  try{ renderBoard(); }catch(e){}
}
/* 挂到 window 供引擎与面板调用 */
window.V25={ v25st, V25_TIERS, aiGenInterp25, mockInterp25, aiGenQuiz25, mockQuiz25, _sig,
  allUnits, unitByN, sheet, runUnit, renderBoard, refreshBoard, unitDone, engineBoot,
  planOrder, aiPlan25, mockPlan25, aiPlanDaily25, mockDaily25, ensurePlan25,
  planHorizon, planFloor,
  subjColor, SUBJ_COLORS, s5Cat, S5_CATS,
  VER:"v29",
  ttsSpeak, ttsStop, ttsPause, ttsResume, ttsCtlHtml, bindTtsCtl, ttsPickVoice, ttsHdOn, ttsHdSet, ttsHdStatus, ttsHdEnsure, ttsHdPct,
  ttsVoiceList, ttsGetVoicePref, ttsSetVoicePref, ttsPreview, ttsDiag, ttsGetRate, ttsSetRate, ttsRateCycle,
  injectCards, cardMins, acctNote, settleAcct, subjStats, laggingSubjs };
const VER="v29";  /* 局部常量——_fillVer() 等内部函数引用它，不能只挂在 window.V25 上 */
engineBoot();
/* 页脚版本水印延迟填充——engineBoot() 在 IIFE 执行时 DOM 里还没有 footer（wd-v25.js 是 body 内同步加载的），
   所以 getElementById("v25ver") 会返回 null。等到 DOM 就绪后再填，这样即使 index.html 模板是旧版（硬编码 "…"）也能被 JS 覆盖 */
function _fillVer(){
  try{
    const el=document.getElementById("v25ver");
    if(el){ el.textContent=VER+" "+(/^file:/.test(location.protocol)?"[file:// 协议，HD自动关]":""); el.title="引擎版本 "+VER+" · 点击跳到配置·实验特性·朗读自检"; el.style.cursor="pointer"; el.onpointerdown=()=>{ try{ document.querySelector('[data-act="cfg"]')?.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); document.querySelector('[data-tab="agent"]')?.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); document.querySelector('#ttsDiagBtn')?.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); }catch(e){} }; window.__fillVerDone=VER; }
    else { window.__fillVerFail="no-element-at "+location.protocol+" readyState="+document.readyState; }
  }catch(e){ window.__fillVerFail=String(e.message); }
}
window.__fillVer=_fillVer;  /* 暴露到全局方便调试 */
if(document.readyState==="complete"||document.readyState==="interactive") _fillVer();
else document.addEventListener("DOMContentLoaded",_fillVer);
/* render() 每次重绘游戏视图后 footer 模板会重新执行——那里有硬编码的 "…"，必须再填一次 */
const _origRender=typeof render==="function"?render:null;
if(_origRender){
  const _wrapRender=function(){ try{ _origRender.apply(this,arguments); }finally{ setTimeout(_fillVer,0); } };
  try{ render=_wrapRender; }catch(e){}
}
console.log("[v25] 核心扩展已加载：模型两档(R1/flash) · 口译AI出题 · 笔试细解出题 · 25日任务引擎已就绪");
}
if(document.readyState==="complete") init();
else window.addEventListener("load", init);
})();
