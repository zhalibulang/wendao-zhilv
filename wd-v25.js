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

/* ==================== [0] 全局小工具与状态 ==================== */
function v25st(){
  if(!st.v25||typeof st.v25!=="object"){
    st.v25={ startDate:null, plan:null, dailyOv:{},
      interpBank:[],      /* AI 口译题库：{sig,dir,src,ref,points,tip,from,day} */
      quizCache:{},       /* 单元 id → 已出笔试题 */
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
Object.assign(DS_PROFILES,{
  plan25:   { model:"deepseek-reasoner", max_tokens:8000 },                      /* reasoner 不支持 temperature/response_format */
  planDaily:{ temperature:0.4, max_tokens:2000, response_format:{type:"json_object"} },
  interpGen:{ temperature:0.85, max_tokens:3000, response_format:{type:"json_object"} },
  quizgen25:{ temperature:0.7, max_tokens:6000, response_format:{type:"json_object"} }
});
[
  { id:"plan25",    label:"25日全局规划（R1 高价）",  model:"deepseek-reasoner", prof:"plan25",    where:"aiPlan25 @wd-v25.js",     trig:"首次进入 1 次；进度大偏差时重算", fb:"按默认节奏：前14日每日2新+1复习，后11日复习递增" },
  { id:"planDaily", label:"每日任务微调（flash 低价）",model:"deepseek-chat",     prof:"planDaily", where:"aiPlanDaily25 @wd-v25.js", trig:"每日首次进入 1 次",               fb:"沿用 R1 骨架不调整" },
  { id:"interpGen", label:"口译 AI 出题（flash 低价）",model:"deepseek-chat",     prof:"interpGen", where:"aiGenInterp25 @wd-v25.js", trig:"每个口译任务单元 1 次（4 题）",   fb:"种子卡模板变换（本地模拟题）" },
  { id:"quizgen25", label:"笔试 AI 出题·细解（flash）",model:"deepseek-chat",     prof:"quizgen25", where:"aiGenQuiz25 @wd-v25.js",   trig:"每个笔试任务单元 1 次",           fb:"锚点判断题（本地模拟题）" }
].forEach(c=>{ if(!AI_CHANNEL_BY_ID[c.id]){ AI_CHANNELS.push(c); AI_CHANNEL_BY_ID[c.id]=c; } });

/* ==================== [2] 口译 AI 出题 ==================== */
/* 种子池：既有 8 条口译 + 18 条英文问答 + 72 条英文景点闪卡 + 用户补充材料。
   AI 以此定主题与难度，持续出新题；旧题签名回避，25 天不重样。 */
function _interpSeeds(){
  return (D.pointsLib||[]).filter(p=>/科目五/.test(p.subject||""))
    .filter(p=>/口译|问答/.test(p.module||"")||/^[A-Za-z]/.test(String(p.text||"").trim()));
}
async function aiGenInterp25(n, opts){
  n=n||4; opts=opts||{};
  const v=v25st();
  const seeds=_interpSeeds();
  if(!seeds.length) throw new Error("无口译种子语料");
  const topics=[...new Set(seeds.map(p=>p.module||p.title))].slice(0,12);
  const recent=new Set(v.interpBank.slice(-40).map(x=>x.sig));
  const samples=seeds.slice(0,6).map(p=>String(p.text).split("\n")[0].slice(0,90));
  const sys="你是北京导游资格考试科目五口试的口译出题专家。围绕给定主题与语料风格，出"+n+"道互译练习。\n"
    +"1. 方向均衡：中译英(c2e)与英译中(e2c)各半\n"
    +"2. 场景限定：北京景点讲解、导游服务规范、突发事件处理、传统文化与城市概况\n"
    +"3. 长度适中：英文句 25~70 词，中文句 40~90 字；每句信息密度高、适合现场口译\n"
    +"4. 每题给出参考译文、≥3 个采分点（关键词/结构）、一句备考提示\n"
    +"5. 题目两两不重复，且不得与语料原句雷同；只输出 JSON";
  const user="主题范围："+topics.join("；")
    +"\n语料示例（定风格，勿照抄）：\n"+samples.join("\n")
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
/* 本地模拟（测试阶段/无密钥）：种子句换方向 + 模板改写，保证流程全通 */
function mockInterp25(n){
  n=n||4;
  const seeds=_interpSeeds();
  const v=v25st(); const recent=new Set(v.interpBank.slice(-40).map(x=>x.sig));
  const out=[];
  for(const p of seeds){
    if(out.length>=n) break;
    const lines=String(p.text||"").split("\n").filter(Boolean);
    const en=lines[0]||"", zh=(String(p.text).match(/【中文对照】(.+)/)||[])[1]||lines[1]||"";
    if(!en||!zh) continue;
    const dir=out.length%2?"e2c":"c2e";
    const src=dir==="c2e"?zh:en, ref=dir==="c2e"?en:zh;
    const sig=_sig(src);
    if(recent.has(sig)) continue;
    out.push({ sig, dir, src, ref,
      points:["关键专有名词","数字/年代准确","句式完整通顺"],
      tip:"【模拟题】配置 DeepSeek 密钥后由 AI 持续出新题", from:"mock", day:st.day||1 });
    recent.add(sig);
  }
  if(out.length){ v.interpBank.push(...out); save(); }
  return out;
}

/* ==================== [3] 笔试 AI 出题·细致讲解 ==================== */
/* 在既有 genQuizBank 骨架上强化讲解：每题 why 含考点回顾+逐项分析+记忆锚。 */
async function aiGenQuiz25(pids, n){
  pids=(pids||[]).filter(pid=>(D.pointsLib||[]).some(p=>p.id===pid));
  if(!pids.length) throw new Error("本单元无考点可出");
  n=n||Math.min(8,Math.max(3,pids.length));
  const knowledge=pids.map(pid=>{
    const p=D.pointsLib.find(x=>x.id===pid);
    return pid+"："+String(p.text).slice(0,160)+(p.anchor?("（记忆锚："+p.anchor+"）"):"");
  }).join("\n");
  const sys="你是北京导游资格考试的出题专家。严格基于给定考点出题，不超纲。\n"
    +"1. 题型轮换：是非题(judge)、填空题(blank)、单选题(choice)、多选题(multi)、选错误项题(wrongone)；选项互斥、正确答案唯一\n"
    +"2. 同考点多题必须换角度换措辞，两两不重复\n"
    +"3. 【细致讲解】每题 why 字段三段式（≤150字）：①考点回顾（本题考什么）②逐项分析（对错原因，填空/判断可合并说明）③记忆锚或口诀\n"
    +"4. 只输出 JSON";
  const user="考点：\n"+knowledge
    +'\n\n输出 JSON：{"questions":['+n+'道题]}。每题字段：kind(judge/blank/choice/multi/wrongone)、q（填空用____占位）、'
    +'opts（choice/multi/wrongone 给4项）、a（judge布尔；blank字符串；choice正确项文本；wrongone错误项文本；multi正确项文本数组≥2）、'
    +'accept（仅blank，含别名）、why（三段式细解）、pid（给定考点id之一）。';
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
/* 本地模拟：锚点/原文判断题 + 简版讲解 */
function mockQuiz25(pids, n){
  pids=(pids||[]).filter(pid=>(D.pointsLib||[]).some(p=>p.id===pid));
  n=n||Math.min(5,Math.max(2,pids.length));
  const out=[];
  for(const pid of pids){
    if(out.length>=n) break;
    const p=D.pointsLib.find(x=>x.id===pid);
    const sent=String(p.text).split(/(?<=[。！？])/)[0]||String(p.text).slice(0,60);
    if(sent.length<8) continue;
    out.push({ kind:"judge", q:sent, a:true, pid,
      why:"【模拟题·细解示例】①考点回顾："+(p.title||pid)+"；②分析：题干与考点原文一致，故为对；③记忆锚："+(p.anchor||"通读本条三遍")+"。配置密钥后由 AI 出题。" });
  }
  return out;
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
function _delPids(){ /* deleted(uid 列表) → pointsLib id 集合 */
  const v=v25st();
  return new Set(((v.cards&&v.cards.deleted)||[]).filter(u=>String(u).indexOf("point:")===0).map(u=>String(u).slice(6)));
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
  const U=(window.TASK_UNITS25||[]).map(u=>({ n:u.n, subj:u.subj, mods:(u.mods||[]).slice(),
    items:(u.items||[]).filter(it=>!del.has(it.id)).map(it=>({id:it.id, title:it.title, mins:it.mins})) }))
    .map(u=>{ u.mins=Math.round(u.items.reduce((a,it)=>a+(+it.mins||0),0)*10)/10; return u; })
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
      home.items.push(item); home.mins=Math.round((home.mins+mins)*10)/10;
      if(!home.mods.includes(c.module||"用户补充")) home.mods.push(c.module||"用户补充");
      return;
    }
    /* ② 首次分配并固化单元号：只并入「未完成」的同科目单元（≤35 分钟），否则开新单元 */
    let tgt=null;
    for(let i=U.length-1;i>=0;i--){ if(U[i].subj===c.subject&&U[i].mins+mins<=35&&!doneU[U[i].n]){ tgt=U[i]; break; } }
    if(!tgt){ tgt={ n:v0.nextUnitN++, subj:c.subject||"科目五 导游服务能力（现场考试）",
      mods:[], mins:0, items:[] }; U.push(tgt); }
    tgt.items.push(item); tgt.mins=Math.round((tgt.mins+mins)*10)/10;
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
function unitByN(n){ return allUnits().find(u=>u.n===+n); }
function isS5(subj){ return /科目五/.test(subj||""); }
function unitKind(u){ return isS5(u.subj)?"s5":"quiz"; }
function cardKind(p){
  if(!p) return "recite";
  if(!isS5(p.subject)) return "quiz";
  if(/口译/.test(p.module||"")) return "interp";
  const first=String(p.text||"").split("\n")[0];
  return ((first.match(/[A-Za-z]+/g)||[]).length>=4)?"oral":"recite";
}

/* ==================== [5] 每日任务单（默认节奏骨架） ==================== */
/* 节奏：41 单元按累计曲线 24 日内放完（前密后疏），复习按艾宾浩斯
   1/2/4/7/15 日到期插入；每日约 3 单元（≈75-85 分钟），第 25 日收尾全真演练。
   任务单当日落库不重摇；s7 的 R1 全局规划与 flash 每日微调将改写此骨架。 */
function todayStr(){ return new Date().toISOString().slice(0,10); }
function plannedNewByDay(d){ const U=allUnits(); return d>=24?U.length:Math.round(U.length*d/24); }
function sheet(day){
  day=Math.max(1,Math.min(25,+day||1));
  const v=v25st(); v.sheets=v.sheets||{};
  const key="d"+day;
  if(v.sheets[key]&&v.sheets[key].items) return v.sheets[key];
  const U=allUnits(), order=planOrder(), done=v.done||{};
  const introduced=Math.min(v.introduced||0, order.length);
  const items=[];
  if(day<25&&U.length){
    /* ① 补做：已放号（规划顺序前缀）但未完成的单元优先回到今日 */
    order.slice(0,introduced).filter(u=>!done[u.n]).forEach(u=>items.push({u:u.n,kind:"new"}));
    /* ② 新学放号：按规划顺序（R1 排期或本地骨架）；累计曲线 − 已放号；
       当日新学（含补做）≤2 防爆量；已完成单元跳过不占号 */
    let fresh=Math.max(0,Math.min(plannedNewByDay(day)-introduced, order.length-introduced));
    fresh=Math.min(fresh, Math.max(0,2-items.length));
    let i=introduced, added=0;
    while(added<fresh&&i<order.length){ const u=order[i++]; if(!done[u.n]){ items.push({u:u.n,kind:"new"}); added++; } }
    v.introduced=i;
    /* ③ 复习补位：艾宾浩斯到期（超过 15 日未碰按逾期恒到期），最久优先
       inU 过滤现存单元：防止卡片删空单元后留下幽灵复习项 */
    const inU=new Set(U.map(u=>u.n));
    const revs=Object.keys(done).map(k=>{
      const rec=done[k]; const last=rec.lastRev||rec.day||day;
      return {n:+k, dt:day-last};
    }).filter(x=>inU.has(x.n)&&([1,2,4,7,15].includes(x.dt)||x.dt>15))
      .sort((a,b)=>b.dt-a.dt);
    for(const r of revs){ if(items.length>=3) break; if(!items.some(x=>x.u===r.n)) items.push({u:r.n,kind:"rev"}); }
    /* ④ 仍不足 3 且无新可放 → 取最久未碰的已完成单元兜底 */
    if(items.length<3){
      const back=Object.keys(done).map(Number)
        .filter(n=>inU.has(n)&&!items.some(x=>x.u===n))
        .sort((a,b)=>((done[a].lastRev||done[a].day)||0)-((done[b].lastRev||done[b].day)||0));
      for(const n of back){ if(items.length>=3) break; items.push({u:n,kind:"rev"}); }
    }
  }
  const sh={ day, items:items.slice(0,3), made:todayStr(), done:{} };
  v.sheets[key]=sh; save();
  return sh;
}

/* ==================== [5b] 双模型调度：R1 全局规划 / flash 每日微调 ==================== */
/* 职责边界（铁律，不交叉）：
   - R1（高价 deepseek-reasoner）：25 日全局单元顺序，首进 1 次，大偏差或手动重算，每周期≤2 次
   - flash（低价 deepseek-chat）：每日首次进入微调当日任务单顺序，每天 1 次
   测试阶段无密钥：两者均有本地骨架兜底，全流程可玩。 */
function planOrder(){
  const v=v25st(); const U=allUnits();
  if(v.plan&&Array.isArray(v.plan.seq)&&v.plan.seq.length===U.length){
    const byN=new Map(U.map(u=>[u.n,u]));
    const arr=v.plan.seq.map(n=>byN.get(n)).filter(Boolean);
    if(arr.length===U.length) return arr;
  }
  return U; /* 无规划/规划残缺 → 打包器自然序（科目成段） */
}
async function aiPlan25(){
  const v=v25st(); const U=allUnits(); if(!U.length) throw new Error("无任务单元");
  const gens=(v.plan&&v.plan.gens)||0;
  if(gens>=2) throw new Error("本周期 R1 全局规划已达 2 次上限（高价通路限频）");
  const doneN=Object.keys(v.done||{}).length;
  const sys="你是备考规划师，为 25 天冲刺排定学习单元的先后次序（第 24 日放完全部新单元，第 25 日全真演练收尾）。\n"
    +"原则：1. 同科目单元尽量成段，减少科目跳跃；2. 口试类（科目五）单元穿插在笔试各段之间，严禁堆到末尾；"
    +"3. 长短单元交错，避免连续重负担；4. 已完成单元保持相对顺序留在前段；5. 只输出 JSON。";
  const user="单元清单（n=编号，mins=估时分钟）：\n"
    +U.map(u=>"#"+u.n+" "+String(u.subj).replace(/（现场考试）/,"")+"｜"+u.mods.join("/")+"｜"+u.mins+"min"+((v.done&&v.done[u.n])?"｜已完成":"")).join("\n")
    +"\n当前第 "+(st.day||1)+"/25 日，已完成 "+doneN+"/"+U.length+" 单元。"
    +'\n输出 JSON：{"seq":[全部 '+U.length+' 个单元编号，不重不漏],"note":"排期思路一句话（≤60字）"}';
  const raw=await dsChat([{role:"system",content:sys},{role:"user",content:user}],{kind:"plan25",ch:"plan25"});
  const o=_jsonFrom(raw);
  const seq=(o.seq||[]).map(Number).filter(n=>U.some(u=>u.n===n));
  if(seq.length!==U.length||new Set(seq).size!==U.length) throw new Error("R1 规划缺漏，未采用");
  v.plan={ seq, note:String(o.note||"").slice(0,120), made:todayStr(), dayMade:st.day||1, gens:gens+1 };
  save(); return v.plan;
}
function mockPlan25(reason){
  const v=v25st(); const U=allUnits();
  v.plan={ seq:U.map(u=>u.n), mock:true, gens:(v.plan&&v.plan.gens)||0,
    note:"本地骨架：按科目自然分段，24 日放完"+(reason?"（AI 规划暂不可用："+String(reason).slice(0,40)+"）":"；配置密钥后由 R1 重排"),
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
  const sys="你是备考陪跑教练。今日任务单已排好，你只做细节微调：重排顺序（把状态要求高的放前面）、"
    +"或把当日某个复习单元与另一个到期复习单元对调。不得增删单元、不得把新学改成复习。只输出 JSON。";
  const user="第 "+day+"/25 日，星盘到期 "+dueN+" 张。今日任务单：\n"
    +rows.map((x,i)=>(i+1)+". #"+x.u.n+" ["+(x.kind==="new"?"新学":"复习")+"] "+String(x.u.subj).replace(/（现场考试）/,"")+"｜"+x.u.mods.join("/")+"｜"+x.u.mins+"min").join("\n")
    +'\n输出 JSON：{"order":[单元编号…必须与给定完全同集],"note":"一句话说明（≤40字）"}';
  const raw=await dsChat([{role:"system",content:sys},{role:"user",content:user}],{kind:"planDaily",ch:"planDaily"});
  const o=_jsonFrom(raw);
  const cur=sh.items.map(x=>x.u).slice().sort((a,b)=>a-b).join(",");
  const ord=(o.order||[]).map(Number);
  if(ord.length===sh.items.length&&ord.slice().sort((a,b)=>a-b).join(",")===cur){
    const byN={}; sh.items.forEach(it=>byN[it.u]=it);
    sh.items=ord.map(n=>byN[n]); /* 只接受同集重排，杜绝 AI 增删 */
  }
  const rec={ at:new Date().toISOString(), note:String(o.note||"已校核当日任务单").slice(0,80) };
  v.dailyOv[dk]=rec; save(); return rec;
}
function mockDaily25(day){
  const v=v25st(); v.dailyOv=v.dailyOv||{};
  const rec={ at:new Date().toISOString(), mock:true, note:"本地骨架：顺序不变（配置密钥后由 flash 每日微调）" };
  v.dailyOv["d"+day]=rec; save(); return rec;
}
/* 编排入口：renderBoard 每次渲染时调用；需要才发起，全程异步不阻塞渲染 */
function ensurePlan25(day, sh, stream){
  const v=v25st(); v.dailyOv=v.dailyOv||{};
  if(v._planning) return;
  const dk="d"+day;
  const behind=plannedNewByDay(day)-(v.introduced||0);
  const needPlan=!v.plan
    ||(v.plan.mock&&dsReady())                                   /* 骨架→密钥就位后升级 AI 规划 */
    ||(v.plan&&!v.plan.mock&&dsReady()&&((v.plan.gens||1)<2)&&behind>4); /* 大偏差重算（限频） */
  const needDaily=!needPlan&&day<=25&&sh.items.length&&!v.dailyOv[dk];
  if(!needPlan&&!needDaily) return;
  v._planning=true;
  let job;
  if(needPlan){
    job=dsReady()? aiPlan25().catch(e=>{ if(!v.plan) return mockPlan25(e&&e.message||e); return v.plan; })
                 : Promise.resolve(mockPlan25());
  }else{
    job=dsReady()? aiPlanDaily25(day).catch(e=>{ v.dailyOv[dk]={at:new Date().toISOString(),note:"微调失败，沿用骨架",err:String(e&&e.message||e)}; save(); })
                 : Promise.resolve(mockDaily25(day));
  }
  Promise.resolve(job).then(()=>{ v._planning=false; save();
    try{ if(stream&&stream.isConnected&&typeof view!=="undefined"&&view==="v25") renderBoard(); }catch(e){} });
}

/* ==================== [6] 进度记录 ==================== */
function unitDone(n, ok, all){
  const v=v25st(); v.done=v.done||{};
  const day=Math.min(25, st.day||1);
  if(!v.done[n]){
    const u=unitByN(n); /* 先取单元（标完成前用户卡还在单元里），登记卡片级完成档案 */
    v.done[n]={ day, ok, all, at:new Date().toISOString(), revs:0 };
    const adds=(v.cards&&v.cards.added)||[];
    if(u&&adds.length){ v.cards.completed=v.cards.completed||[];
      u.items.forEach(it=>{ if(adds.some(c=>c.id===it.id)&&!v.cards.completed.includes(it.id)) v.cards.completed.push(it.id); }); }
  }
  else { const r=v.done[n]; r.lastRev=day; r.revs=(r.revs||0)+1; r.ok=ok; r.all=all; r.at=new Date().toISOString(); }
  const sh=sheet(day); sh.done=sh.done||{}; sh.done[n]=true;
  save();
}

/* ==================== [7] 执行流公共 ==================== */
const _QNORM=s=>String(s).replace(/[\s，。、；：""''！？（）()·—…《》<>]/g,"").toLowerCase();
function _finBtn(host, ov, u, ok, all, html){
  host.innerHTML=html+'<div style="margin-top:10px"><button class="btn primary" id="v25fin" type="button">完成单元</button></div>';
  const b=ov.querySelector("#v25fin");
  if(b) b.onpointerdown=()=>{ try{SFX.tap();}catch(e){} unitDone(u.n, ok, all);
    const c=ov.querySelector(".close"); if(c) c.click(); renderBoard(); };
}
function runUnit(n){
  const u=unitByN(n); if(!u){ toast("单元不存在"); return; }
  if(unitKind(u)==="quiz") runQuizUnit(u); else runS5Unit(u);
}

/* ==================== [8] 笔试执行流：AI 出题 + 三段式细解 + 错题入星盘 ==================== */
function runQuizUnit(u){
  const v=v25st();
  const pids=u.items.map(x=>x.id).filter(id=>(D.pointsLib||[]).some(p=>p.id===id));
  const ov=panel('<h2>单元 #'+u.n+' · 笔试（'+pids.length+' 个考点 · 约 '+u.mins+' 分钟）</h2><div id="v25q" style="margin-top:10px"></div>');
  const host=ov.querySelector("#v25q");
  host.innerHTML='<div class="note">✦ 正在出题…（'+(dsReady()?"AI 出题·含细致讲解":"本地模拟题·配置密钥后升级 AI")+'）</div>';
  const go=(qs)=>{
    if(!ov.isConnected) return;
    if(!qs||!qs.length){ host.innerHTML='<div class="note" style="border-left-color:var(--danger)">题池生成失败——关闭后重试即可。</div>'; return; }
    let qi=0, ok=0;
    const KL={judge:"是非",blank:"填空",choice:"单选",multi:"多选",wrongone:"选错误项"};
    function draw(){
      if(!ov.isConnected) return;
      if(qi>=qs.length){
        _finBtn(host, ov, u, ok, qs.length,
          '<div class="note" style="border-left-color:var(--ok)">本单元完成：答对 '+ok+'/'+qs.length+'——错题已录入星盘，待回潮日再见。</div>');
        return;
      }
      const z=qs[qi];
      let h='<div style="font-size:12px;color:var(--dim);margin-bottom:6px">第 '+(qi+1)+'/'+qs.length+' 题 · '+(KL[z.kind]||"题")+'</div>'
        +'<div style="font-size:15px;line-height:1.8;margin-bottom:10px">'+esc(z.q)+'</div>';
      if(z.kind==="judge") h+='<div style="display:flex;gap:8px"><button class="btn sm" data-a="true" type="button">✔ 对</button><button class="btn sm" data-a="false" type="button">✘ 错</button></div>';
      else if(z.kind==="blank") h+='<input id="v25blank" style="width:100%;padding:8px" placeholder="输入答案" autocomplete="off"><div style="margin-top:8px"><button class="btn sm primary" id="v25sub" type="button">提交</button></div>';
      else { const multi=z.kind==="multi";
        h+='<div>'+(z.opts||[]).map(o=>'<label style="display:block;padding:6px 8px;border:1px solid var(--border);border-radius:8px;margin:4px 0;cursor:pointer"><input type="'+(multi?"checkbox":"radio")+'" name="v25opt" value="'+esc(o)+'" style="margin-right:6px">'+esc(o)+'</label>').join("")+'</div>'
          +'<div style="margin-top:8px"><button class="btn sm primary" id="v25sub" type="button">提交</button></div>'; }
      h+='<div id="v25why" style="margin-top:10px"></div>';
      host.innerHTML=h;
      const answer=(val)=>{
        let good=false;
        if(z.kind==="judge") good=(z.a===true&&val==="true")||(z.a===false&&val==="false")||(_QNORM(z.a)===_QNORM(val));
        else if(z.kind==="blank"){ const acc=[z.a].concat(z.accept||[]).map(_QNORM); good=acc.includes(_QNORM(val)); }
        else if(z.kind==="multi"){ const want=new Set((Array.isArray(z.a)?z.a:[z.a]).map(_QNORM)); const got=new Set(val.map(_QNORM)); good=want.size===got.size&&[...want].every(x=>got.has(x)); }
        else good=_QNORM(z.a)===_QNORM(val);
        if(good){ ok++; try{srsReview(z.pid,2);}catch(e){} } else { try{srsLapse(z.pid);}catch(e){} }
        const aTxt=z.kind==="judge"?(z.a===true||z.a==="true"?"对":"错"):(Array.isArray(z.a)?z.a.join("、"):String(z.a));
        const why=ov.querySelector("#v25why");
        why.innerHTML='<div class="note" style="border-left-color:'+(good?"var(--ok)":"var(--danger)")+';font-size:13px;line-height:1.8">'
          +(good?"✔ 回答正确":"✘ 正确答案："+esc(aTxt))+(z.why?"<br>"+esc(z.why):"")+'</div>'
          +'<div style="margin-top:8px"><button class="btn sm primary" id="v25next" type="button">'+((qi+1>=qs.length)?"查看小结":"下一题")+'</button></div>';
        host.querySelectorAll("input,button").forEach(b=>{ if(b.id!=="v25next") b.disabled=true; });
        const nb=ov.querySelector("#v25next"); if(nb) nb.onpointerdown=()=>{ qi++; draw(); };
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
  const cacheKey="u"+u.n, cached=v.quizCache[cacheKey];
  if(cached&&cached.length){ go(cached.slice().sort(()=>Math.random()-.5)); return; }
  const gen=dsReady()? aiGenQuiz25(pids).catch(()=>mockQuiz25(pids)) : Promise.resolve(mockQuiz25(pids));
  gen.then(qs=>{ v.quizCache[cacheKey]=qs; save(); go(qs); });
}

/* ==================== [9] 口译执行流：种子卡 + AI 持续出新 + AI 评测 ==================== */
function renderInterpQ(host, item, next){
  host.innerHTML='<div style="font-size:12px;color:var(--dim);margin-bottom:6px">口译 · '+(item.dir==="e2c"?"英译中":"中译英")+(item.from==="mock"?" · 模拟题":item.from==="ai"?" · AI 新题":"")+'</div>'
    +'<div style="font-size:15px;line-height:1.8;margin-bottom:10px">'+esc(item.src)+'</div>'
    +'<textarea id="v25mine" rows="3" style="width:100%;padding:8px" placeholder="写下你的译文，或点语音输入"></textarea>'
    +'<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">'
    +'<button class="btn sm primary" id="v25sub" type="button">提交译文</button>'
    +'<button class="btn sm" id="v25asr" type="button">🎙 语音输入</button></div>'
    +'<div id="v25rev" style="margin-top:10px"></div>';
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
function drawRecite(host, p, next, lang){
  const text=String(p.text||"").trim();
  const en=lang==="en-US";
  host.innerHTML='<div style="font-size:12px;color:var(--dim);margin-bottom:6px">'+(en?"英文复述":"中文讲解复述")+' · '+esc(p.title||p.id)+'</div>'
    +'<div class="note" style="max-height:200px;overflow:auto;font-size:14px;line-height:1.9">'+esc(text)+'</div>'
    +'<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">'
    +'<button class="btn sm primary" id="v25rec" type="button">🎙 开始复述</button>'
    +'<button class="btn sm" id="v25typed" type="button">我已复述，查看对照</button></div>'
    +'<textarea id="v25said" rows="3" style="width:100%;padding:8px;margin-top:8px" placeholder="复述内容实时上屏，也可直接打字"></textarea>'
    +'<div id="v25score" style="margin-top:8px"></div>';
  let rec=null; const btn=host.querySelector("#v25rec"); const ta=host.querySelector("#v25said");
  function score(){
    if(rec){ try{rec.stop();}catch(e){} rec=null; btn.textContent="🎙 开始复述"; }
    const said=ta.value||""; let cov=0;
    if(en){ const rw=new Set((text.toLowerCase().match(/[a-z]+/g)||[])); const sw=new Set((said.toLowerCase().match(/[a-z]+/g)||[]));
      cov=rw.size?Math.round(100*[...rw].filter(w=>sw.has(w)).length/rw.size):0; }
    else { const rc=new Set((text.match(/[一-鿿]/g)||[])); const sc=new Set((said.match(/[一-鿿]/g)||[]));
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
    if(rec){ try{rec.start(); btn.textContent="■ 完成，查看对照"; }catch(e){ toast("语音识别启动失败——可直接打字"); } }
  };
  host.querySelector("#v25typed").onpointerdown=score;
}

/* —— 科目五单元：逐卡推进；含口译卡的单元收尾追加一轮 AI 新题 —— */
function runS5Unit(u){
  const cards=u.items.map(it=>(D.pointsLib||[]).find(p=>p.id===it.id)).filter(Boolean);
  const ov=panel('<h2>单元 #'+u.n+' · 面试（'+cards.length+' 张卡 · 约 '+u.mins+' 分钟）</h2><div id="v25s" style="margin-top:10px"></div>');
  const host=ov.querySelector("#v25s");
  let idx=0, aiRoundDone=!cards.some(p=>cardKind(p)==="interp");
  function draw(){
    if(!ov.isConnected) return;
    if(idx>=cards.length){
      if(!aiRoundDone){ aiRoundDone=true; aiInterpRound(host, draw); return; }
      _finBtn(host, ov, u, cards.length, cards.length,
        '<div class="note" style="border-left-color:var(--ok)">本单元 '+cards.length+' 张卡全部完成——自评结果已入档，星盘到期自会回访。</div>');
      return;
    }
    const p=cards[idx], k=cardKind(p);
    const tag='<div style="font-size:11px;color:var(--dim);margin-bottom:6px">第 '+(idx+1)+'/'+cards.length+' 张</div>';
    const wrap=html=>{ host.innerHTML=tag; }; wrap();
    if(k==="interp"){
      const lines=String(p.text||"").split("\n").filter(Boolean);
      const en=lines[0]||"", zh=(String(p.text).match(/【中文对照】(.+)/)||[])[1]||lines[1]||"";
      const dir=Math.random()<.5?"c2e":"e2c";
      renderInterpQ(host, { key:p.id, dir, src:dir==="c2e"?zh:en, ref:dir==="c2e"?en:zh, tip:p.exam_tip||"", from:"seed" }, ()=>{ idx++; draw(); });
    } else drawRecite(host, p, ()=>{ idx++; draw(); }, k==="oral"?"en-US":"zh-CN");
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
    +'<span>总进度 <b>'+doneN+'/'+U.length+'</b>（'+pct+'%）</span>'
    +'<span style="color:var(--dim)">星盘到期 '+dueN+' 张</span></div>'
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
    /* 今日负荷分段条：每段=一个任务的分钟占比，完成即点亮 */
    h+='<div style="display:flex;gap:4px;margin:0 0 8px">'+sh.items.map(it=>{
      const u=unitByN(it.u); if(!u) return "";
      const wd=estMins?Math.max(7,Math.round(100*u.mins/estMins)):10;
      const dn2=!!(sh.done&&sh.done[it.u]);
      return '<span title="单元 #'+u.n+' · 约 '+u.mins+' 分钟" style="width:'+wd+'%;height:6px;border-radius:3px;background:'+(dn2?"var(--neon)":"var(--bg3)")+'"></span>';
    }).join("")+'</div>';
    h+=sh.items.map((it,i)=>{
      const u=unitByN(it.u); if(!u) return "";
      const isDone=!!(sh.done&&sh.done[it.u]);
      const kind=u.subj.replace(/（现场考试）/,"");
      /* 复习任务补艾宾浩斯间隔：几天前学过、第几次复习；新学标首次 */
      const rec=doneMap[it.u];
      let sub=esc(kind)+' · '+u.items.length+' 条目 · 约 '+u.mins+' 分钟';
      if(it.kind==="rev"&&rec){ const gap=day-(rec.lastRev||rec.day||day);
        sub+=' · '+(gap>0?gap+' 天前学过':'今天学过')+' · 第 '+((rec.revs||0)+1)+' 次复习'; }
      else if(it.kind==="new"&&!rec) sub+=' · 首次学习';
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:10px;margin:6px 0;'+(isDone?"opacity:.55":"")+'">'
        +'<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:'+(it.kind==="new"?"var(--neon)":"var(--gold)")+';color:#111;white-space:nowrap">'+(it.kind==="new"?"新学":"复习")+'</span>'
        +'<div style="flex:1;min-width:0"><div style="font-size:14px">单元 #'+u.n+' <span style="font-size:10px;padding:1px 6px;border-radius:8px;border:1px solid var(--border);color:var(--dim)">'+(unitKind(u)==="s5"?"口试":"笔试")+'</span> '+esc(u.mods.join(" / "))+'</div>'
        +'<div style="font-size:11px;color:var(--dim)">'+sub+'</div></div>'
        +(isDone?'<span style="color:var(--ok)">✓ 已完成</span>':'<button class="btn sm primary" data-u="'+u.n+'" type="button">开始</button>')
        +'</div>';
    }).join("");
  }
  /* 科目进度：五科完成度小条，哪科落后一眼看清 */
  const bySubj={};
  U.forEach(u=>{ const k=(u.subj.match(/^科目[一二三四五]/)||["其他"])[0];
    (bySubj[k]=bySubj[k]||{full:u.subj,arr:[]}).arr.push(u); });
  h+='<div style="margin-top:14px;font-size:12px;color:var(--dim)">科目进度</div>';
  Object.keys(bySubj).forEach(k=>{
    const g=bySubj[k]; const dn3=g.arr.filter(u=>doneMap[u.n]).length;
    const pc=g.arr.length?Math.round(100*dn3/g.arr.length):0;
    h+='<div style="display:flex;align-items:center;gap:8px;margin:4px 0" title="'+esc(g.full)+'">'
      +'<span style="font-size:11px;width:52px;color:var(--dim)">'+esc(k)+'</span>'
      +'<div style="flex:1;height:6px;background:var(--bg3);border-radius:3px"><div style="height:100%;width:'+pc+'%;background:var(--cyber);border-radius:3px"></div></div>'
      +'<span style="font-size:11px;color:var(--dim);width:52px;text-align:right">'+dn3+'/'+g.arr.length+'</span></div>';
  });
  const dn=(v.dailyOv||{})["d"+day];
  h+='<div style="font-size:11px;color:var(--dim);margin-top:10px">节奏：24 日放完全部 '+U.length+' 单元，复习按艾宾浩斯 1/2/4/7/15 日到期插入；第 25 日全真演练收尾。</div>'
    +'<div style="font-size:11px;color:var(--dim);margin-top:4px">R1 全局规划：'+(v.plan?esc(v.plan.note)+'（'+esc(v.plan.made)+' · 第 '+((v.plan.gens)||1)+' 版'+(v.plan.mock?' · 本地骨架':'')+'）':(dsReady()?'生成中…':'本地骨架生成中…'))+'</div>'
    +(sh.items.length?'<div style="font-size:11px;color:var(--dim);margin-top:4px">flash 今日微调：'+(dn?esc(dn.note||'已校核'):(dsReady()?'校核中…':'本地校核'))+'</div>':'')
    +'</div>';
  stream.innerHTML=h;
  const ab=stream.querySelector("#v25arena"); if(ab) ab.onpointerdown=()=>{ try{switchView("arena");}catch(e){} };
  stream.querySelectorAll("[data-u]").forEach(b=>b.onpointerdown=()=>{ try{SFX.tap();}catch(e){} runUnit(+b.dataset.u); });
}
/* 引擎启动：登记启程日；若当前停在修行视图则立刻渲染 */
function engineBoot(){
  const v=v25st();
  v._planning=false; /* 上次会话可能中断在规划途中 */
  try{ injectCards(); }catch(e){ console.error("[v25] 用户卡片注入失败",e); }
  if(!v.startDate) { v.startDate=todayStr(); save(); }
  try{ if(typeof view!=="undefined"&&view==="v25") renderBoard(); }catch(e){}
}

/* 挂到 window 供引擎与面板调用 */
window.V25={ v25st, V25_TIERS, aiGenInterp25, mockInterp25, aiGenQuiz25, mockQuiz25, _sig,
  allUnits, unitByN, sheet, runUnit, renderBoard, unitDone, engineBoot,
  planOrder, aiPlan25, mockPlan25, aiPlanDaily25, mockDaily25, ensurePlan25,
  injectCards, cardMins };
engineBoot();
console.log("[v25] 核心扩展已加载：模型两档(R1/flash) · 口译AI出题 · 笔试细解出题 · 25日任务引擎已就绪");
}
if(document.readyState==="complete") init();
else window.addEventListener("load", init);
})();
