/* ==========================================================================
   wd-mem.js —— 问道之旅 · NPC 记忆系统（WDMem）
   为每个 NPC 维护独立互动档案：
     · 学习时长（分钟级，按「当前对话NPC」归属，心跳入账）
     · 任务进度（entered 在途 / done 已完成 两态）
     · 通关记录（含一次性通关 onePass 标识、具体通关时长 durS 秒级）
     · 错题分类（按知识点章节 topic 聚类 + 难度 lv 分档）
     · 任务完成时间（ISO 秒级时间戳）
   反馈：内存态同步读取（<1ms，满足 <100ms 指标），localStorage 防抖落盘(2s)。
   数据质量：加载 schema 校验拒收并计数；每日备份旋转 ×5；可视化接口 quality()/stats()。
   存储域：wdzx.mem.v1 + wdzx.mem.bak.0..4。
   ========================================================================== */
(function(){
"use strict";
const KEY="wdzx.mem.v1", BAK="wdzx.mem.bak.", DAY=864e5;
let db=null, activeNpc=null, flushTimer=0;

function npcRec(id){
  if(!id) id="yunheng";
  let r=db.byNpc[id];
  if(!r){ r=db.byNpc[id]={meet:0,talks:0,lastMeet:"",lastTalk:"",learnMin:0,entered:{},done:{},wrongs:{}}; db.byNpc[id]=r; }
  return r;
}
function recOk(r){
  return r&&typeof r==="object"
    &&typeof r.meet==="number"&&typeof r.talks==="number"&&typeof r.learnMin==="number"
    &&r.entered&&typeof r.entered==="object"&&r.done&&typeof r.done==="object"&&r.wrongs&&typeof r.wrongs==="object";
}
function sanitize(){
  const bad=[];
  Object.keys(db.byNpc||{}).forEach(id=>{
    const r=db.byNpc[id];
    if(!recOk(r)){ bad.push(id); return; }
    ["meet","talks","learnMin"].forEach(k=>{ if(typeof r[k]!=="number"||!(r[k]>=0))r[k]=0; });
    ["lastMeet","lastTalk"].forEach(k=>{ if(typeof r[k]!=="string")r[k]=""; });
    Object.keys(r.entered).forEach(k=>{ if(typeof r.entered[k]!=="string"){ delete r.entered[k]; db.rejected++; } });
    Object.keys(r.done).forEach(k=>{ const d=r.done[k];
      if(!d||typeof d!=="object"||typeof d.t!=="string"){ delete r.done[k]; db.rejected++; } });
    Object.keys(r.wrongs).forEach(k=>{ const w=r.wrongs[k];
      if(!w||typeof w.n!=="number"){ delete r.wrongs[k]; db.rejected++; } });
  });
  db.rejected+=bad.length;
  bad.forEach(id=>{ delete db.byNpc[id]; });
}
function defaults(){ return {ver:1, byNpc:{}, lastBak:"", rejected:0}; }
function load(){
  try{
    const r=localStorage.getItem(KEY);
    if(r){ const o=JSON.parse(r);
      if(o&&o.ver===1){ db=Object.assign(defaults(),o); if(typeof db.rejected!=="number")db.rejected=0; if(!db.byNpc||typeof db.byNpc!=="object")db.byNpc={}; sanitize(); return; }
    }
  }catch(e){}
  db=defaults();
}
function flushNow(){ try{ localStorage.setItem(KEY,JSON.stringify(db)); }catch(e){} }
function flush(){ if(flushTimer) return; flushTimer=setTimeout(()=>{ flushTimer=0; flushNow(); },2000); }
/* 每日备份旋转：bak.0←今日，旧链后移，共 5 份 */
function rotateBackup(){
  const today=new Date().toISOString().slice(0,10);
  if(db.lastBak===today) return;
  try{
    for(let i=4;i>0;i--){ const p=localStorage.getItem(BAK+(i-1)); if(p) localStorage.setItem(BAK+i,p); }
    localStorage.setItem(BAK+"0",JSON.stringify(db));
    db.lastBak=today; flushNow();
  }catch(e){}
}
function fmtDur(s){
  if(s<60) return Math.round(s)+"秒";
  if(s<3600) return Math.floor(s/60)+"分"+(s%60?Math.round(s%60)+"秒":"");
  return Math.round(s/360)/10+"小时";
}
const WDMem={
  init(){ load(); rotateBackup(); },
  /* 当前对话 NPC：学习时长心跳归属对象 */
  setActive(npcId){ activeNpc=npcId||null; },
  active(){ return activeNpc; },
  /* 心跳入账（分钟，可小数）；同步内存 + 防抖落盘 */
  tick(minutes){
    if(!activeNpc||!(minutes>0)) return;
    const r=npcRec(activeNpc);
    r.learnMin=Math.min(1e5,Math.round((r.learnMin+minutes)*100)/100);
    flush();
  },
  meet(npcId){ const r=npcRec(npcId); r.meet++; r.lastMeet=new Date().toISOString(); flush(); },
  talk(npcId){ const r=npcRec(npcId); r.talks++; r.lastTalk=new Date().toISOString(); this.setActive(npcId); flush(); },
  /* 任务进入（未完成态） */
  enter(npcId,qid){
    if(!qid) return;
    const r=npcRec(npcId); r.entered[qid]=new Date().toISOString(); flush();
  },
  /* 任务完成：自动依 entered 时间戳计算通关时长；onePass=一次性通关标识 */
  finish(npcId,qid,info){
    if(!qid) return;
    info=info||{};
    const r=npcRec(npcId);
    const ts=r.entered[qid];
    const durS=ts?Math.max(0,Math.min(86400,Math.round((Date.now()-new Date(ts).getTime())/1000))):(info.durS|0||0);
    delete r.entered[qid];
    const prev=r.done[qid];
    r.done[qid]={t:new Date().toISOString(), durS:durS, onePass:!!info.onePass, count:(prev&&prev.count||0)+1};
    flush();
  },
  /* 错题入库（topic=知识点章节前缀，lv=难度档或 null） */
  wrong(npcId,topic,lv){
    const r=npcRec(npcId);
    const t=topic||"杂";
    const w=r.wrongs[t]=r.wrongs[t]||{n:0,lv:{}};
    w.n++;
    const key=lv?("lv"+lv):"u";
    w.lv[key]=(w.lv[key]||0)+1;
    flush();
  },
  /* 答对移除（星盘闭环） */
  right(npcId,topic){
    const r=npcRec(npcId);
    const w=topic&&r.wrongs[topic];
    if(w&&w.n>0) w.n--;
    flush();
  },
  enteredAt(qid){ return db.byNpc[activeNpc||""]&&db.byNpc[activeNpc].entered[qid]||null; },
  /* AI 认知摘要：注入 prompt（同步，<1ms） */
  digest(npcId){
    const r=db.byNpc[npcId];
    const hasWrong=r&&Object.keys(r.wrongs).some(k=>r.wrongs[k].n>0);
    if(!r||(r.talks===0&&r.meet===0&&!Object.keys(r.done).length&&!Object.keys(r.entered).length&&r.learnMin===0&&!hasWrong)) return "";
    const parts=[];
    if(r.talks) parts.push("对话"+r.talks+"次");
    if(r.learnMin>=1) parts.push("同行修习约"+Math.round(r.learnMin)+"分钟");
    const doneIds=Object.keys(r.done);
    if(doneIds.length){
      let one=0, best=1e9;
      doneIds.forEach(q=>{ const d=r.done[q]; if(d.onePass)one++; if(d.durS>0&&d.durS<best)best=d.durS; });
      parts.push("已共同净化"+doneIds.length+"个任务"+(one?("（"+one+"次一次通关）"):"")+(best<1e9?("·最快"+fmtDur(best)):""));
    }
    const ent=Object.keys(r.entered);
    if(ent.length) parts.push("在途"+ent.length+"个未完成");
    const wt=Object.keys(r.wrongs).map(k=>[k,r.wrongs[k].n]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,2);
    if(wt.length) parts.push("错题集中于"+wt.map(x=>x[0]+"×"+x[1]).join("、"));
    if(r.lastTalk){
      const d=Math.floor((Date.now()-new Date(r.lastTalk).getTime())/DAY);
      if(d>=7) parts.push("已久违七日有余");
      else if(d>=1) parts.push(d+"日前别过");
      else parts.push("今日才见过面");
    }
    return parts.join("·");
  },
  /* 数据可视化/监控接口 */
  stats(){ return JSON.parse(JSON.stringify(db)); },
  quality(){
    let bytes=0;
    try{ bytes=(localStorage.getItem(KEY)||"").length; }catch(e){}
    return {rejected:db.rejected, lastBak:db.lastBak, bytesKB:Math.round(bytes/102.4)/10, npcCount:Object.keys(db.byNpc).length};
  },
  backupNow(){ db.lastBak=""; rotateBackup(); },
  /* v29（重置修复）：全量重置——取消 pending flush，内存态归零，清主键与备份链（供 #rst 调用，消除防抖竞态） */
  resetAll(){
    if(flushTimer){ clearTimeout(flushTimer); flushTimer=0; }
    db=defaults(); activeNpc=null;
    try{ localStorage.removeItem(KEY); }catch(e){}
    for(let i=4;i>=0;i--){ try{ localStorage.removeItem(BAK+i); }catch(e){} }
    flushNow();
  },
  export(){ return JSON.stringify(db,null,1); },
  import(text){
    let o; try{ o=JSON.parse(text); }catch(e){ throw new Error("E_MEM_JSON"); }
    if(!o||o.ver!==1||!o.byNpc||typeof o.byNpc!=="object") throw new Error("E_MEM_SHAPE");
    db=Object.assign(defaults(),o); if(typeof db.rejected!=="number")db.rejected=0; sanitize();
    flushNow(); return true;
  },
  _flushNow:flushNow,
  _rec:npcRec
};
window.WDMem=WDMem;
})();
