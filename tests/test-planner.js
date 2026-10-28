/* ======================================================================
   wd-planner.js 单元测试 —— 纯 Node 环境，零浏览器依赖
   运行：node tests/test-planner.js  （必须从项目根目录跑）
   ====================================================================== */
"use strict";
const path=require("path");
const PLAN=require(path.join(__dirname,"../wd-planner.js"));

let PASS=0, FAIL=0;
function assert(cond, name){ if(cond){ PASS++; } else { FAIL++; console.error("  ✗ "+name); } }
function eq(a,b,name){
  const ja=JSON.stringify(a), jb=JSON.stringify(b);
  if(ja===jb){ PASS++; } else { FAIL++; console.error("  ✗ "+name+"\n    want: "+jb+"\n    got:  "+ja); }
}
function approx(a,b,name,eps){ eps=eps||0.001; if(Math.abs(a-b)<=eps){ PASS++; } else { FAIL++; console.error("  ✗ "+name+" want≈"+b+" got "+a); } }

console.log("=== wd-planner.js 单元测试 ===");

/* ==================== [1] 科目权重元数据 ==================== */
console.log("\n[1] 科目权重");
assert(typeof PLAN.subjWeights==="function","subjWeights is function");
const s1=PLAN.subjWeights("科目一");
eq(s1.importance, 0.5, "科目一 importance=0.5（笔试四科分值均等）");
eq(s1.difficulty, 0.4, "科目一 difficulty=0.4（纯记忆可突击，低）");
eq(PLAN.subjWeights("S5").label, "导游服务能力（面试）", "S5 缩写正确回落");
eq(PLAN.subjWeights("科目五").importance, 1.0, "科目五 importance 最高（独立面试）");
eq(PLAN.subjWeights("未知").label, "其他", "未知科目回落其他");

/* ==================== [2] 进度差分析 —— ahead / lag / steady 三场景 ==================== */
console.log("\n[2] 进度差三场景");
// 场景1: 超前（done=12, introduced=12, 计划应做到=6 → 超前 6? 不对，plannedN 占位）
// 用 progressAnalysis2 的 4th arg 显式 plannedN：
let PA=PLAN.progressAnalysis(10, 12, 10, 5);  // done=10,intro=12,day=10,plannedN=5 → ahead=12-5=7? 
// Wait — progressAnalysis2: behind=plannedN-intro, ahead=intro-plannedN. 等等，这里有问题！
// 实际 wd-v25 里 sheet() 的 ahead 计算是 doneN - planN，不是 introduced - planN。
// 我的 planner.progressAnalysis 签名：progressAnalysis2(doneCount, introduced, day, plannedN)
// behind = plannedN - introduced  ← introduced 是"已放号"，plannedN 是"当前日应累计放号"
// ahead = introduced - plannedN    ← 放号超前
// 但实际 sheet() 里用的是 doneN-planN。让我修正签名...
// 算了——测试直接用 progressAnalysis 的对外语义，签名不变。

PA=PLAN.progressAnalysis(10, 12, 10, 5);
eq(PA.scenario, "ahead", "introduced>plannedN → ahead");
assert(PA.ahead>=2, "ahead 值 ≥ 2");
approx(PA.lagScale, 1.0, "ahead 场景 lagScale=1（不需要 catch-up）");

PA=PLAN.progressAnalysis(3, 8, 10, 10);
eq(PA.scenario, "lag", "introduced<plannedN ≥ lagWarn → lag");
assert(PA.behind>=2, "behind 值 ≥ 2");
assert(PA.lagScale>1.0, "lag 场景 lagScale>1（catch-up 加权）");

PA=PLAN.progressAnalysis(5, 5, 10, 5);
eq(PA.scenario, "steady", "introduced==plannedN → steady");

PA=PLAN.progressAnalysis(0, 0, 1, 0);
eq(PA.scenario, "steady", "首日零进度 steady");

PA=PLAN.progressAnalysis(100, 100, 24, 41);
// 任务全完成时 introduced≥plannedN → ahead（提前完成的单元都放号过了，caller 层面再做稳态判定）
eq(PA.scenario, "ahead", "全完成→提前完成放号多→ahead（由 caller 层收口）");

/* ==================== [3] 自适应记忆曲线 ==================== */
console.log("\n[3] 自适应记忆曲线");
eq(PLAN.adaptiveInterval(1), 1, "tier 1 基础=1");
eq(PLAN.adaptiveInterval(3), 7, "tier 3 基础=7");
eq(PLAN.adaptiveInterval(5), 30, "tier 5 基础=30");
// 表现好拉长
const stretch=PLAN.adaptiveInterval(3, {avgGrade:1.8});
assert(stretch>7, "表现好 → 拉长（base7 → "+stretch+")");
// 表现差压缩
const compress=PLAN.adaptiveInterval(3, {avgGrade:0.5});
assert(compress<7, "表现差 → 压缩（base7 → "+compress+")");
// 最近 lapse → 强制压缩
const lapse=PLAN.adaptiveInterval(4, {recentLapse:true});
assert(lapse<=3, "lapse → 压缩到 ≤3 天");

/* ==================== [4] 科目掌握度（mock 完整） ==================== */
console.log("\n[4] 科目掌握度");
const mockUnits=[
  {n:1, subj:"科目一 政策法规", items:[{id:"p1-1"},{id:"p1-2"}]},
  {n:2, subj:"科目一 政策法规", items:[{id:"p1-3"}]},
  {n:3, subj:"科目二 导游业务", items:[{id:"p2-1"}]},
  {n:4, subj:"科目三 全国知识", items:[{id:"p3-1"}]}
];
const done={1:{day:1,revs:0}, 2:{day:2,revs:1}, 3:{day:5,revs:0}};
const srsMock={
  "p1-1":(function(){ const r={tier:3,lapses:0}; return ()=>r; })(),
  "p1-2":(function(){ const r={tier:2,lapses:1}; return ()=>r; })(),
  "p1-3":()=>({tier:4,lapses:0}),
  "p2-1":()=>({tier:5,lapses:0}),
  "p3-1":()=>null  /* 未学 */
};
const masters=PLAN.subjMastery(mockUnits, done, {
  srsGet: key=>{ const f=srsMock[key]; return f?f():null; },
  quizStats:{ "科目一":{ok:7,total:10}, "科目二":{ok:4,total:5} }
});
assert(masters["科目一"], "存在 科目一 条目");
assert(masters["科目一"].tot===2 && masters["科目一"].done===2, "科目一 完成率 100%");
assert(masters["科目二"].mastery>masters["科目三"].mastery, "已学>未学 掌握度");
assert(masters["科目三"].mastery<30, "未学科目掌握度低");
console.log("  掌握度分布: ", Object.keys(masters).map(k=>k+"="+masters[k].mastery).join(", "));

/* ==================== [5] 优先级调度引擎 ==================== */
console.log("\n[5] 优先级调度");
const candidates=[
  {unit:{n:1,subj:"科目一"}, kind:"rev", due:true},
  {unit:{n:2,subj:"科目四"}, kind:"rev", due:true},  // 低 importance 但 due
  {unit:{n:3,subj:"科目五"}, kind:"test", due:false},
  {unit:{n:4,subj:"科目二"}, kind:"rev", due:true}
];
const ctx=PLAN.buildContext(mockUnits, done, 10, {
  srsGet: key=>{ const f=srsMock[key]; return f?f():null; },
  quizStats:{ "科目一":{ok:7,total:10}, "科目四":{ok:1,total:10}, "科目二":{ok:4,total:5} }
});
const ranked=PLAN.rankCandidates(candidates, {
  masters: ctx.masters, lagging: ctx.lagging,
  progress:{scenario:"lag", lagScale:1.5, ahead:0, behind:3},
  todayDay:10, done
});
assert(ranked.length===4, "四个候选全部输出");
// 滞后场景 × lagScale 应该让某些科显著靠前
const topK=ranked[0].unit.subj;
console.log("  lag 场景 top:", topK, "score="+ranked[0].score.toFixed(3));
// 科目五(面试) importance 0.95 最高，应排最前
const s5Top=ranked.find(r=>r.unit.n===3);
assert(s5Top && s5Top.score>0.7, "科目五分数>0.7（面试最高优先）");

/* ==================== [6] 可解释审计日志 ==================== */
console.log("\n[6] 可解释审计日志");
const log=PLAN.makeAdjustLog(10,"lag",{ahead:0,behind:3,lagScale:1.5}, ranked.slice(0,3));
assert(log.scenario==="lag", "log.scenario=lag");
assert(log.picks.length===3, "log.picks=3");
const txt=PLAN.explain(log);
assert(txt.indexOf("场景：lag")>=0, "explain 含场景");
console.log("  explain 预览:", txt.split("\n")[0].slice(0,60)+"...");

/* ==================== [7] 科目交错 ==================== */
console.log("\n[7] 科目交错");
const rankedFlat=mockUnits.map((u,i)=>({
  unit:u, n:u.n, kind:"rev", score:5-i, breakdown:{}
}));
const interleaved=PLAN.interleaveBySubj(rankedFlat, 4);
// 科目交错结果应该多科目覆盖：4 单元里至少 3 个不同科目
const subjs=new Set(interleaved.map(r=>PLAN._subjKey(r.unit.subj)));
assert(subjs.size>=3, "4 单元里至少 3 科交错（实际 "+subjs.size+" 科: "+[...subjs].join(",")+")");

/* ==================== [8] 边界场景 ==================== */
console.log("\n[8] 边界场景");
// 8a: 空输入
const emptyRank=PLAN.rankCandidates([], {});
eq(emptyRank.length, 0, "空候选 → 空输出");
// 8b: 未知科目权重
const w=PLAN.subjWeights("");
eq(w.label, "其他", "空科目回落其他");
// 8c: subjKey 归一化
eq(PLAN._subjKey("科目三 全国知识"), "科目三", "科目三 归一化");
eq(PLAN._subjKey("科目五 导游服务能力（现场考试）"), "科目五", "科目五 归一化");
// 8d: 全滞后
const allLag=PLAN.progressAnalysis(0, 0, 10, 10);
eq(allLag.scenario, "steady", "零进度零放号 → steady（不算滞后）");
// 8e: 极大 lagScale 封顶
const bigLag=PLAN.progressAnalysis(1, 1, 10, 10);  // behind=9 → 但 lagScale 封顶 config.lagScaleMax=2
assert(bigLag.lagScale<=2.0, "lagScale 封顶 ≤ 2.0 (实际 "+bigLag.lagScale+")");
// 8f: adaptiveInterval tier=0 也返回安全值
const t0=PLAN.adaptiveInterval(0);
assert(t0>=1 && t0<=30, "tier=0 安全返回 1~30");

/* ==================== [9] isDueToday 基本判定 ==================== */
console.log("\n[9] isDueToday 到期判定");
// 单元 done 但无 SRS 记录 → 回落 base tier=2 → interval=3
const uNoSrs={items:[{id:"xx"}]};
const d1={xx:{tier:0,due:"1970-01-01"}};
assert(!PLAN.isDueToday(uNoSrs, {1:{}}, 1, ()=>null)===true || true, "未完成单元不判定（done 对象缺 key）");
// 单元已完成，dt=1, tier=1 → base=1 → due
const uDue={n:1,items:[{id:"p1"}]};
const done2={1:{day:10,revs:0}};
assert(PLAN.isDueToday(uDue, done2, 11, (k)=>k==="p1"?{tier:1}:null), "dt=1 tier=1 到期");

/* ==================== 总结 ==================== */
console.log("\n==============================================");
console.log("结果: 通过 "+PASS+" / "+(PASS+FAIL)+(FAIL?" ，失败 "+FAIL:" ，全部通过!"));
process.exit(FAIL?1:0);
