/* ======================================================================
   wd-planner.js —— 问道之旅·AI 任务规划引擎（v30 重构）
   ======================================================================
   定位：纯逻辑模块，不触碰 DOM；依赖全局 st / D / （可选）srsAll / srsGet。
        在浏览器和 Node 测试环境均可加载。
   职责：
     ┌─ 科目权重元数据（importance × difficulty 双维）
     ├─ 科目掌握度（完成率 + 答题正确率 + SRS 档位均值 → 0~100）
     ├─ 进度差分析（超前 / 滞后场景识别）
     ├─ 记忆曲线对齐（与 SRS 统一 + 自适应伸缩）
     ├─ 优先级调度引擎（importance × difficulty × lag × mastery × due）
     └─ 可解释审计日志（每笔调整都有结构化 why）
   设计原则：
     1. 纯函数优先——输入显式、输出显式、不隐式读 window
     2. 可配置——所有权重常量化，planner.config.xxx 可热更
     3. 可解释——planner.explain(decision) 输出人类可读的调整理由
     4. 独立于 AI——所有算法在本地可算；AI 只做「全局排序/定性建议」
   ====================================================================== */
(function(root, factory){
  if(typeof module==="object" && module.exports){ module.exports=factory(); }
  else { window.WD_PLANNER=factory(); }
})(typeof window!=="undefined"?window:this, function(){
"use strict";

/* ==================== [0] 科目权重配置（可热更） ==================== */
/* 依据全国导游资格考试官方大纲（2026 文旅部笔试大纲）：
   · 《政策与法律法规》+《导游业务》合并 1 卷，各占 50%（各 50 分）
   · 《全国导游基础知识》+《地方导游基础知识》合并 1 卷，各占 50%（各 50 分）
   · 面试《导游服务能力》独立现场考试，不通过即整体不合格
   结论：笔试四科分值均等（importance 相等）；面试（科目五）独立、背诵量大、通过率低 → importance 最高。
   复习节奏/难度用 difficulty 表达：法规纯记忆可突击 → 难度低；面试背诵口译 → 难度最高。 */
const SUBJ_WEIGHTS={
  "科目一":{ importance:0.5,  difficulty:0.4,  label:"政策与法律法规" },
  "科目二":{ importance:0.5,  difficulty:0.6,  label:"导游业务" },
  "科目三":{ importance:0.5,  difficulty:0.6,  label:"全国导游基础知识" },
  "科目四":{ importance:0.5,  difficulty:0.65, label:"地方导游基础知识" },
  "科目五":{ importance:1.0,  difficulty:0.9,  label:"导游服务能力（面试）" },
  "其他":  { importance:0.5,  difficulty:0.6,  label:"其他" }
};
function _subjKey(s){ return String(s||"").replace(/（现场考试）/,"").trim().split(/\s+/)[0]; }
function subjWeights(subj){
  const k=_subjKey(subj)||"其他";
  if(SUBJ_WEIGHTS[k]) return SUBJ_WEIGHTS[k];
  /* S1~S5 缩写回落 */
  if(/^S[1-5]$/.test(k)) return SUBJ_WEIGHTS["科目"+"一二三四五"[+k[1]-1]]||SUBJ_WEIGHTS["其他"];
  return SUBJ_WEIGHTS["其他"];
}

/* ==================== [1] 配置对象（可调参、可解释） ==================== */
const config={
  /* 优先级权重（5 因子加权）—— 运行时可通过 planner.config.xxx 调整 */
  priority:{
    importance: 0.30,   // 科目重要性
    difficulty: 0.15,   // 科目难度（难的排前面更稳妥，但也会让用户怕）
    lag:        0.25,   // 科目滞后程度（越大越该追）
    mastery:    0.20,   // 科目掌握度缺口（1-avgMastery）
    due:        0.10    // SRS 到期紧迫度（越到期越该现在）
  },
  /* 进度差阈值 */
  aheadCap:     2,      /* 超前 ≥2 日 → 新学上限 -2（让位复习） */
  lagWarn:      1,      /* 滞后 ≥1 日即加量（提前加重，不拖后） */
  lagCritical:  4,      /* 滞后 ≥4 日 → 触发 R1 全局重算 */
  lagScaleMax:  2,      /* 滞后时 catch-up 优先级加权上限（+200%） */
  /* 记忆曲线基准间隔（天）—— 与 SRS_TIERS=[1,3,7,14,30] 对齐 */
  baseIntervals:[1, 3, 7, 14, 30],   /* 笔试类（知识记忆）间隔 */
  oralIntervals:[1, 3, 5, 8, 12],    /* 面试背诵类（导游词/口译）更密：20 天内回潮 2-3 遍 */
  /* 自适应伸缩系数：表现好→拉长×1.3，表现差→压缩×0.6 */
  goodStretch: 1.3,
  poorCompress:0.6,
  /* 单日上/下限 */
  itemsPerDayMin: 4,
  itemsPerDayMax: 7
};

/* ==================== [2] 科目掌握度（0~100） ==================== */
/* 合成公式：掌握度 = 0.30×完成率 + 0.40×答题正确率 + 0.30×SRS 档位归一化 */
function subjMastery(U, done, opts){
  opts=opts||{};
  const srsGet=opts.srsGet||function(){return null;};   // 可 mock
  const quizStats=opts.quizStats||{};                     // { subjKey:{ok,total} }
  const m={};
  U.forEach(u=>{
    const k=_subjKey(u.subj)||"其他";
    m[k]=m[k]||{tot:0,done:0,srsSum:0,srsN:0,lapses:0};
    m[k].tot++;
    if(done[u.n]){
      m[k].done++;
      /* 该单元关联的所有 pointsLib 卡——取 SRS 档位均值（0~5 归一化到 0~1） */
      (u.items||[]).forEach(it=>{
        const r=srsGet(it.id);
        if(r){ m[k].srsSum+=Math.min(5,Math.max(0,r.tier||0)); m[k].srsN++; m[k].lapses+=(r.lapses||0); }
      });
    }
  });
  Object.keys(m).forEach(k=>{
    const x=m[k];
    const rate=x.tot?x.done/x.tot:0;
    let srsNorm=x.srsN?x.srsSum/(5*x.srsN):(rate>0?0.5:0);  /* 做过但没 SRS 记录 → 默认 0.5 档 */
    const q=quizStats[k];
    let qRate=0;
    if(q && q.total){
      qRate=(q.ok||0)/q.total;
    } else if(rate>0) qRate=0.7;  /* 完成了但没答题记录 → 默认中等 */
    x.rate=rate; x.srsNorm=srsNorm; x.qRate=qRate;
    x.mastery=Math.round((0.30*rate+0.40*qRate+0.30*srsNorm)*100);
  });
  return m;
}

/* ==================== [3] 进度差分析 ==================== */
/* 返回：{ ahead:number, behind:number, scenario:"ahead"|"lag"|"steady", lagScale:number }
   ahead > 0 → 用户领先计划曲线（提前修习），应让位给复习
   behind > 0 → 用户落后计划曲线，应加量 catch-up */
function progressAnalysis(doneCount, introduced, plannedTodayDay, todayDay){
  const day=Math.min(24,Math.max(1,todayDay||1));
  const plannedN=Math.round((arguments[4]!=null?arguments[4]:(function(){/* plannedNewByDay 占位 */;})())||0);
  /* plannedNewByDay 的替代：与 wd-v25.js 保持一致 */
  return progressAnalysis2(doneCount, introduced, day, arguments[4]/*plannedN*/);
}
function progressAnalysis2(doneCount, introduced, day, plannedN){
  day=Math.min(24,Math.max(1,day||1));
  const behind=Math.max(0, Math.round(plannedN)-(introduced||0));
  const ahead =Math.max(0,(introduced||0)-Math.round(plannedN));
  /* 边界：introduced=0 → 用户尚未启动 → 不算滞后 */
  if(!introduced) return { ahead:0, behind:0, scenario:"steady", lagScale:1 };
  let scenario="steady";
  if(ahead>=config.aheadCap) scenario="ahead";
  else if(behind>=config.lagWarn) scenario="lag";
  const lagScale= scenario==="lag" ? Math.min(config.lagScaleMax, 1+behind*0.25) : 1;
  return { ahead, behind, scenario, lagScale };
}

/* ==================== [4] 记忆曲线：到期日计算（与 SRS 对齐 + 自适应伸缩） ==================== */
/* 取代 sheet() 里硬编码的 [1,2,4,7,15]。
   base=与 SRS 对齐的五档；good/bad=根据最近答题表现伸缩间隔。 */
function adaptiveInterval(tier, opts){
  opts=opts||{};
  const iv=opts.dense?config.oralIntervals:config.baseIntervals;
  const base=iv[Math.min(iv.length-1,Math.max(0,(tier||1)-1))]||1;
  const avgGrade=opts.avgGrade;  /* 0~2 均值，2=清晰，1=模糊，0=想不起 */
  const recentLapse=!!opts.recentLapse;
  if(recentLapse){ return opts.dense?1:2; }  /* lapse → 强制尽快回潮（背诵类次日就回） */
  if(typeof avgGrade==="number"){
    if(avgGrade>=1.6) return Math.max(2, Math.round(base*config.goodStretch));
    if(avgGrade<1.0)  return Math.max(1, Math.round(base*config.poorCompress));
  }
  return base;
}
/* 判断某单元今天是否到期（= 应进入今日候选池） */
function isDueToday(unitN, done, todayDay, srsGet){
  /* unitN 可以是 number（单元编号） 或 unit 对象（带 n+items）—— 两种形态都支持 */
  const u=(typeof unitN==="object" && unitN!==null)?unitN:null;
  const key=u ? unitN.n : unitN;
  const rec=done[key]; if(!rec) return false;  /* 未完成 → 不属于复习/测试 */
  const last=rec.lastRev||rec.day||todayDay;
  const dt=todayDay-last;
  const isOral = u && /科目五|S5|面试|口译|复述|背诵/.test(u.subj||"");
  let maxTier=0, lapse=false, sumG=0, cnt=0;
  if(u){
    (u.items||[]).forEach(it=>{
      const r=srsGet?.(it.id);
      if(r){
        if(r.tier>maxTier) maxTier=r.tier;
        if(r.pending||((r.lapses||0)>0 && (todayDay-(r.lastAt||last))<=2)) lapse=true;
        sumG += r.tier>=3?2:r.tier>=2?1:0; cnt++;
      }
    });
  }
  const avgG=cnt?sumG/cnt:null;
  const interval=adaptiveInterval(maxTier||2, { avgGrade:avgG, recentLapse:lapse, dense:isOral });
  return dt>=interval || lapse;
}

/* ==================== [5] 优先级调度引擎 ==================== */
/* 输入：候选单元数组 + 上下文，返回已加权排序的数组（含 score / breakdown） */
function rankCandidates(candidates, ctx){
  ctx=ctx||{};
  const {
    masters={},          /* subjKey → {mastery, rate, srsNorm} */
    lagging=[],          /* 滞后科目列表 */
    progress={scenario:"steady", lagScale:1},
    todayDay=1,
    done={}
  }=ctx;
  const W=config.priority;
  return candidates.map(c=>{
    const u=c.unit||c;
    const subjK=_subjKey(u.subj);
    const sw=subjWeights(u.subj);
    const m=masters[subjK]||{mastery:50, rate:0.5};
    const lagScore=lagging.indexOf(subjK)>=0 ? (1 - (m.rate||0)) : 0;
    const dueScore=c.due?1:0.3;  /* 到期=满，未到期=基础分 */
    /* 五因子加权求和 */
    const raw=
      W.importance * sw.importance +
      W.difficulty * sw.difficulty +
      W.lag        * lagScore +
      W.mastery    * (1 - (m.mastery||50)/100) +
      W.due        * dueScore;
    /* 滞后场景整体放大权重 */
    const score=(raw*(progress.lagScale||1));
    return {
      unit:u, n:u.n, score:Math.round(score*1000)/1000,
      breakdown:{
        importance: sw.importance.toFixed(2),
        difficulty: sw.difficulty.toFixed(2),
        lag: lagScore.toFixed(2),
        mastery: ((1-(m.mastery||50)/100)).toFixed(2),
        due: dueScore.toFixed(2),
        scale: (progress.lagScale||1).toFixed(2)
      },
      kind:c.kind
    };
  }).sort((a,b)=>b.score-a.score);
}

/* ==================== [6] 可解释审计日志 ==================== */
/* 每次 sheet() 生成后，planner.explain(adjustLog) 输出人类可读的理由。 */
function makeAdjustLog(day, scenario, progress, picks){
  return {
    day, at:new Date().toISOString(), scenario,
    progress:{ ahead:progress.ahead, behind:progress.behind, lagScale:progress.lagScale },
    picks:picks.map(p=>({
      n:p.n, subj:_subjKey((p.unit||{}).subj), kind:p.kind,
      score:p.score, why:p.breakdown
    }))
  };
}
function explain(log){
  if(!log) return "无调整日志";
  const parts=["【第 "+log.day+" 日规划】场景："+log.scenario
    +"（超前"+log.progress.ahead+"日 / 滞后"+log.progress.behind+"日 / 加权×"+log.progress.lagScale.toFixed(2)+")"];
  log.picks.forEach(p=>{
    const why=[];
    if(+p.why.lag>0.1) why.push("科目滞后需追");
    if(+p.why.mastery>0.3) why.push("掌握度缺口大");
    if(+p.why.due>=0.9) why.push("今日SRS到期");
    if(+p.why.importance>0.8) why.push("高重要性");
    if(+p.why.difficulty>0.7) why.push("难度偏高");
    parts.push("  #"+p.n+" "+p.subj+" ["+p.kind+"] score="+p.score+" — "+(why.join("、")||"常规候选"));
  });
  return parts.join("\n");
}

/* ==================== [7] 科目交错（保证单日多科目，避免连科疲劳） ==================== */
/* 在 rankCandidates 产出的有序列表里做「科目去重补位」——
   取前 N 条保证同科目不连续、单日至少 3 个不同科目。 */
function interleaveBySubj(ranked, targetCount){
  const buckets={};   /* subjKey → [ranked items] */
  ranked.forEach(r=>{
    const k=_subjKey((r.unit||{}).subj);
    buckets[k]=buckets[k]||[]; buckets[k].push(r);
  });
  const keys=Object.keys(buckets);
  /* 按桶大小升序——小桶先放，防止最后剩一堆同科 */
  keys.sort((a,b)=>buckets[a].length-buckets[b].length);
  const out=[];
  let guards=0;
  while(out.length<targetCount && guards<targetCount*3){
    let placed=false;
    for(const k of keys){
      if(!buckets[k].length) continue;
      const lastK=out.length?_subjKey((out[out.length-1].unit||{}).subj):"";
      /* 允许连续同科 ≤ 1 次；否则跳着放 */
      if(k===lastK && out.length>=2 && _subjKey((out[out.length-2].unit||{}).subj)===k) continue;
      out.push(buckets[k].shift()); placed=true;
      if(out.length>=targetCount) break;
    }
    if(!placed) break;  /* 所有桶都拿不出来了 */
    guards++;
  }
  /* 如果交错后还没凑够，直接从剩余里按 rank 填 */
  if(out.length<targetCount){
    const remaining=ranked.filter(r=>!out.includes(r));
    out.push(...remaining.slice(0,targetCount-out.length));
  }
  return out.slice(0,targetCount);
}

/* ==================== 导出 ==================== */
return {
  config,
  subjWeights,
  _subjKey,
  subjMastery,
  progressAnalysis: progressAnalysis2,
  adaptiveInterval,
  isDueToday,
  rankCandidates,
  makeAdjustLog,
  explain,
  interleaveBySubj,
  /* 便捷组合：给定 allUnits + done + todayDay → 输出今日候选（不做最终 cap，由 sheet() 控制） */
  buildContext(allUnits, done, todayDay, opts){
    opts=opts||{};
    const subjs=opts.quizStats||{};
    const srsGet=opts.srsGet;
    const masters=subjMastery(allUnits, done, { srsGet, quizStats:subjs });
    const lagging=Object.keys(masters).filter(k=>{
      const m=masters[k]; const avg=Object.values(masters).reduce((a,x)=>a+(x.rate||0)*x.tot,0)/Object.values(masters).reduce((a,x)=>a+x.tot,1);
      return (m.rate||0)<=avg-0.12 && m.done<m.tot;
    });
    return { masters, lagging };
  }
};
});
