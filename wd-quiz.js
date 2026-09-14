/* ==========================================================================
   wd-quiz.js —— 问道之旅 · 智能提问交互模块（WDQuiz）
   职责：基于记忆卡匣内容与 NPC 职能深度融合的主动提问交互机制
     · 问题生成：语义分析记忆内容，认知递进（事实回忆→概念理解→应用分析）
     · NPC 匹配：职能标签体系，按记忆内容分类自动匹配最适合的 NPC
     · 难度梯度：三级（基础/进阶/挑战），基于用户能力模型动态调整
     · 交互流程：对话式问答、即时反馈分析、学习进度追踪、复习周期动态调整
   低耦合：不引用页面全局；加载即自洽；变更通过 WDQuiz.ask() 入口调用。
   存储域：wdzx.quiz.v1（用户能力模型与提问历史）。
   ========================================================================== */
(function(){
"use strict";
const KEY="wdzx.quiz.v1", VER=1, DAY=864e5;

/* 问题类型库：三大维度，每维度3种问法模板 */
const Q_TYPES={
  recall:{label:"事实回忆",lv:1,templates:[
    "「{keyword}」的核心定义是什么？用一句话说出关键词。",
    "{keyword}中，最重要的一个数字/日期/名称是什么？",
    "别人问起{keyword}，你最先想到的三个词是什么？"
  ]},
  understand:{label:"概念理解",lv:2,templates:[
    "为什么{keyword}要这样规定？背后的逻辑是什么？",
    "{keyword}和{topic}的关系是什么？它们如何互相影响？",
    "如果{keyword}的某个条件变了，结果会怎样？为什么？"
  ]},
  apply:{label:"应用分析",lv:3,templates:[
    "在实际导游场景中，{keyword}这条规则该如何运用？举一个例子。",
    "游客问到{keyword}时，你会怎么讲解？组织一段30秒的解说词。",
    "{keyword}这条知识点，最容易在哪类考题中出现？为什么？"
  ]}
};

/* NPC 职能标签体系：与记忆内容分类的映射关系 */
const NPC_TOPIC_MAP={
  smq:{topics:["S1","S2","长城","十三陵","山河","地貌","地形"],label:"山河导游"},
  tiemian:{topics:["S3","法条","法规","法律","政策","条例","处罚","合同","规定"],label:"律法导游"},
  liuruyan:{topics:["S4","行会","旅行社","接待","沟通","客人","服务","礼仪","人际"],label:"接待导游"},
  moxiaogu:{topics:["S5","故宫","天坛","遗迹","机关","建筑","文物","年表","历史"],label:"古迹导游"},
  xuanji:{topics:["S6","错题","星盘","复习","记忆","背诵","英文","单词","卦"],label:"记忆导游"},
  qingxuan:{topics:["主线","剧情","背景","故事","世界观","文脉","符文"],label:"文脉导游"},
  yunheng:{topics:["引路","操作","下一步","开始","指引","求助"],label:"引路导游"}
};

let db=null;

function defaults(){ return {ver:VER, byPid:{}, hist:[], lastAsk:"", session:{streak:0,bestStreak:0,total:0,correct:0}}; }
function sanitize(){
  if(!db.byPid||typeof db.byPid!=="object") db.byPid={};
  if(!Array.isArray(db.hist)) db.hist=[];
  if(!db.session||typeof db.session!=="object") db.session={streak:0,bestStreak:0,total:0,correct:0};
  Object.keys(db.byPid).forEach(k=>{
    const p=db.byPid[k];
    if(!p||typeof p!=="object"){ delete db.byPid[k]; return; }
    if(typeof p.lv!=="number") p.lv=1;
    if(typeof p.asked!=="number") p.asked=0;
    if(typeof p.correct!=="number") p.correct=0;
    if(typeof p.lastAt!=="string") p.lastAt="";
  });
  if(db.hist.length>200) db.hist.length=200;
}
function load(){
  try{
    const r=localStorage.getItem(KEY);
    if(r){ const o=JSON.parse(r);
      if(o&&o.ver===VER){ db=Object.assign(defaults(),o); sanitize(); return; }
    }
  }catch(e){}
  db=defaults();
}
function save(){ try{ localStorage.setItem(KEY,JSON.stringify(db)); }catch(e){} }

/* 从考点文本提取关键词（语义分析简化版：取核心名词短语） */
function extractKeyword(text){
  if(!text) return "";
  const t=String(text);
  /* 取前30字，去除标点，提取核心短语 */
  const clean=t.replace(/[，。、；：""''（）()\[\]【】\s]+/g," ").trim();
  /* 优先取「是/为/指」之前的内容（定义句的主语） */
  const defMatch=clean.match(/([^是为]{2,12})[是为指]/);
  if(defMatch) return defMatch[1].trim();
  /* 否则取前8字 */
  return clean.slice(0,8);
}

/* 提取知识点 topic（前缀分类，如 S1-01 → S1） */
function pidTopic(pid){
  if(!pid) return "杂";
  const m=pid.match(/^([A-Z]+\d*)/);
  return m?m[1]:"杂";
}

/* 按 pid 匹配最适合的 NPC */
function matchNpc(pid,text){
  const topic=pidTopic(pid);
  const fullText=(pid+" "+(text||"")).toLowerCase();
  /* 优先按 pid 前缀匹配 */
  for(const id in NPC_TOPIC_MAP){
    if(NPC_TOPIC_MAP[id].topics.some(t=>topic===t||topic.startsWith(t))) return id;
  }
  /* 其次按文本内容匹配 */
  for(const id in NPC_TOPIC_MAP){
    if(NPC_TOPIC_MAP[id].topics.some(t=>fullText.includes(t.toLowerCase()))) return id;
  }
  /* 兜底：玄机（记忆导游） */
  return "xuanji";
}

/* 获取 pid 的能力模型（难度档1-3，默认1） */
function getAbility(pid){
  if(!db.byPid[pid]) db.byPid[pid]={lv:1,asked:0,correct:0,lastAt:""};
  return db.byPid[pid];
}

/* 根据能力模型选择问题类型（认知递进） */
function selectQType(pid){
  const a=getAbility(pid);
  /* 正确率低→基础回忆；中等→概念理解；高→应用分析 */
  const rate=a.asked>0?a.correct/a.asked:0;
  if(a.asked===0||rate<0.4) return "recall";      /* 初学或掌握差：事实回忆 */
  if(rate<0.7) return "understand";                /* 中等：概念理解 */
  return "apply";                                  /* 掌握好：应用分析 */
}

/* 生成一道智能提问 */
function genQuestion(point){
  if(!point) return null;
  const pid=point.id||"未知";
  const text=point.text||"";
  const keyword=extractKeyword(text);
  const topic=pidTopic(pid);
  const typeKey=selectQType(pid);
  const type=Q_TYPES[typeKey];
  const tpl=type.templates[Math.floor(Math.random()*type.templates.length)];
  const q=tpl.replace(/\{keyword\}/g,keyword).replace(/\{topic\}/g,topic);
  const npcId=matchNpc(pid,text);
  return {
    pid:pid, q:q, type:typeKey, typeLabel:type.label, lv:type.lv,
    keyword:keyword, topic:topic, npcId:npcId,
    npcLabel:NPC_TOPIC_MAP[npcId]?NPC_TOPIC_MAP[npcId].label:"记忆导游",
    refText:text, at:new Date().toISOString()
  };
}

/* 从记忆卡匣（巡夜复习卡）选题 */
function pickFromCards(cards,n){
  if(!cards||!cards.length) return [];
  const pool=cards.slice();
  const out=[],used=new Set();
  /* 优先选错题多的、久未提问的 */
  pool.sort((a,b)=>{
    const aa=getAbility(a.id),bb=getAbility(b.id);
    const aPri=(aa.asked===0?100:0)+(aa.asked-aa.correct)*10;
    const bPri=(bb.asked===0?100:0)+(bb.asked-bb.correct)*10;
    return bPri-aPri;
  });
  for(const it of pool){
    if(out.length>=(n||5)) break;
    if(used.has(it.id)) continue;
    used.add(it.id);
    const q=genQuestion(it);
    if(q) out.push(q);
  }
  return out;
}

/* 从星盘错题选题（错题优先） */
function pickFromWrong(wrongs,pointsLib,n){
  if(!wrongs||!wrongs.length) return [];
  const out=[],used=new Set();
  for(const w of wrongs){
    if(out.length>=(n||5)) break;
    if(used.has(w.pid)) continue;
    used.add(w.pid);
    const p=pointsLib.find(x=>x.id===w.pid);
    if(p){
      const q=genQuestion(p);
      if(q) out.push(q);
    }
  }
  return out;
}

/* 记录回答结果，更新能力模型 */
function recordAnswer(pid,correct){
  const a=getAbility(pid);
  a.asked++; a.lastAt=new Date().toISOString();
  if(correct){
    a.correct++;
    a.lv=Math.min(3,a.lv+1);   /* 答对升级 */
    db.session.streak++;
    db.session.correct++;
  } else {
    a.lv=Math.max(1,a.lv-1);   /* 答错降级 */
    db.session.streak=0;
  }
  db.session.total++;
  if(db.session.streak>db.session.bestStreak) db.session.bestStreak=db.session.streak;
  db.hist.unshift({pid:pid,ok:!!correct,at:a.lastAt,lv:a.lv});
  if(db.hist.length>200) db.hist.length=200;
  db.lastAsk=a.lastAt;
  save();
}

/* 学习进度摘要 */
function progress(){
  const s=db.session;
  const rate=s.total>0?Math.round(s.correct/s.total*100):0;
  const pids=Object.keys(db.byPid);
  const mastered=pids.filter(p=>{const a=db.byPid[p];return a.asked>=3&&a.correct/a.asked>=0.7;}).length;
  const learning=pids.filter(p=>{const a=db.byPid[p];return a.asked>=1&&a.correct/a.asked<0.7;}).length;
  return {
    total:s.total, correct:s.correct, rate:rate,
    streak:s.streak, bestStreak:s.bestStreak,
    mastered:mastered, learning:learning, totalPids:pids.length
  };
}

/* 根据复习效果动态调整复习周期（错题多→缩短，掌握好→延长） */
function reviewInterval(pid){
  const a=getAbility(pid);
  const rate=a.asked>0?a.correct/a.asked:0;
  if(rate>=0.8) return 7;   /* 掌握好：7日后复习 */
  if(rate>=0.5) return 3;  /* 中等：3日后 */
  return 1;                 /* 差：明日复习 */
}

const WDQuiz={
  init(){ load(); },
  /* 主入口：生成一批智能提问（混合记忆卡匣+错题） */
  ask(cards,wrongs,pointsLib,n){
    const nq=n||5;
    const fromWrong=pickFromWrong(wrongs,pointsLib,Math.ceil(nq/2));
    const fromCard=pickFromCards(cards,nq-fromWrong.length);
    return [...fromWrong,...fromCard].slice(0,nq);
  },
  /* 生成单题 */
  one(point){ return genQuestion(point); },
  /* 记录回答 */
  record(pid,correct){ recordAnswer(pid,correct); },
  /* 进度摘要 */
  progress(){ return progress(); },
  /* 复习周期建议 */
  interval(pid){ return reviewInterval(pid); },
  /* NPC 匹配 */
  matchNpc(pid,text){ return matchNpc(pid,text); },
  /* 能力模型 */
  ability(pid){ return getAbility(pid); },
  /* 导出/导入 */
  export(){ return JSON.stringify(db,null,1); },
  import(text){
    let o; try{ o=JSON.parse(text); }catch(e){ throw new Error("E_QUIZ_JSON"); }
    if(!o||o.ver!==VER) throw new Error("E_QUIZ_VER");
    db=Object.assign(defaults(),o); sanitize(); save(); return true;
  },
  _db:()=>db,
  Q_TYPES:Q_TYPES,
  NPC_TOPIC_MAP:NPC_TOPIC_MAP
};
window.WDQuiz=WDQuiz;
})();
