/* ==================== 问道之旅 · 对话模块（独立可复用） ====================
   window.WDChat —— 对话生成 / NPC 角色成长 / 世界观装配 / 降级兜底
   低耦合设计：不直接引用页面全局，全部依赖经 init(ctx) 注入：
     CTX = {
       D, NPC,                 // 数据（game-data.js 的 GAME_DATA 与 npc 映射）
       getSt, save,            // 存档读写（getter 保持引用最新）
       dsChat, dsReady,        // DeepSeek 调用与可用性
       level,                  // 等级计算
     }
   页面侧仅保留 UI 粘合，本模块可在任何宿主中复用。
   ========================================================================= */
(function(){
"use strict";
let CTX=null;

/* ---------- 工具 ---------- */
function hash(s){ let h=0; for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))>>>0;} return h; }
function now(){ return new Date().toISOString(); }

const WDChat={

  /* 依赖注入（幂等，可重复初始化） */
  init(ctx){ CTX=ctx; },

  /* ---------- 结构化游戏背景信息（世界观/机制/NPC/叙事约束） ---------- */
  worldBrief(){
    const {D}=CTX;
    return {
      游戏名:"问道之旅 · 四十五日（北京导游资格考试游戏化复习）",
      游戏目的:"玩家在游戏中备考北京导游资格证。做任务就是网络游戏行为：研习新考点=开荒新副本，复习=回炉重刷副本并重新封印苏醒的旧妖，题组试炼=砍怪打谜题妖，英文背诵=施法吟咒，大试炼=攻城团战，巡夜=日常巡逻任务。玩家与NPC是游戏世界里并肩作战的关系（队友/接头人/引路人），绝非老师与学生——没有人在上课，大家在同一个江湖里打怪升级。",
      世界观:"现代京城被『遗忘之雾』笼罩，唯有『问道录』可照见旧京文脉。玩家是执灯求道的行路人（准导游），在六位仙侠引灯人（NPC：掌灯真人/山河剑客/镇塔尊者/幻纱行首座/机关童子/观星者）引导下，用四十五日历经五个幕次——山河游学、律法塔、行会风云、遗迹探秘、金榜台前，最终赴考。",
      隐喻系统:"每个复习任务都是一个游戏化关卡：新学任务=秘境探幽/残卷修复；复习任务=封印重临（知识封印松动，妖物探头，回去再钉一钉）；题组练习=谜题斩妖（妖兽拦路，以题作剑）；英文背诵=咒文吟诵（咒不成声，护罩不生）；大试炼=攻城之战（守关妖王）；线索卡=符文拓印；行囊准备=法器整备；巡夜记忆卡=夜巡驱雾。难度层级按稀有度：common=雾卒、fine=妖将、epic=妖王。",
      游戏机制:["读卷：翻页研习考点，关键词高亮、记忆锚助记","试炼：是非+填空，答错录入星盘错题","吟游：英文导游词朗读、录音、打字复述自评","巡夜：按1/3/7/15日间隔重刷记忆卡","五幕四十五日任务链，主线环环前置解锁","修行=经验值升级，铜钱可在集市兑换"],
      NPC基础信息:D.npcs.map(n=>({id:n.id,姓名:n.name,称号:n.title,背景:n.intro})),
      叙事约束:"NPC 是游戏NPC不是教师：像网游NPC那样简短、有性格、有江湖气地说话；对话服务当日任务目标，不剧透未解锁环节，不跑题，不出现考试答案；禁止教书先生式表达（掌握了/要记住/同学们/认真听讲/布置作业/劳逸结合等）。",
      语言要求:"像真人玩家交流：口语化、句子长短错落、可用游戏黑话（开荒/副本/掉落/翻车/通关/团战）；严禁AI腔——不用'首先/其次/总之/综上/值得注意的是'，不排比堆砌，不空洞夸奖（非常棒/说得好），不自我总结，不问'还有什么可以帮你的'；单句≤60字；禁现代网络梗；不提AI/模型/接口；玩家只通过点选操作，不进行自由文本对话。"
    };
  },

  /* ---------- 网络检索（中文维基 API；不通时静默返回 null） ---------- */
  async webSearch(query){
    try{
      const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),4000);
      const r=await fetch("https://zh.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=3&srsearch="+encodeURIComponent(query),{signal:ctl.signal});
      clearTimeout(t);
      const j=await r.json();
      return (j.query&&j.query.search||[]).map(x=>("【"+x.title+"】"+x.snippet.replace(/<[^>]+>/g,"").slice(0,110))).join("\n")||null;
    }catch(e){ return null; }
  },

  /* ---------- 本地资料库关键词匹配 ---------- */
  knowledge(text){
    const {D}=CTX;
    const kw=text.replace(/@[^\s]+/g,"").trim().toLowerCase();
    if(!kw) return "（无特定关键词）";
    const pts=D.pointsLib.filter(p=>p.text&&p.text.toLowerCase().includes(kw)).slice(0,3)
      .map(p=>p.id+"："+p.text.slice(0,80)).join("\n");
    const orals=D.oralLib.filter(o=>(o.en||"").toLowerCase().includes(kw)||(o.zh||"").toLowerCase().includes(kw)).slice(0,2)
      .map(o=>o.id+"："+(o.zh||o.en||"").slice(0,80)).join("\n");
    let result="";
    if(pts) result+="考点：\n"+pts+"\n";
    if(orals) result+="导游词：\n"+orals+"\n";
    return result||"（未找到直接匹配的知识点，可结合角色背景自由发挥）";
  },

  /* ---------- 与某 NPC 的历史互动记录（对话流持久化数据裁剪） ---------- */
  historyOf(npcId,limit){
    const st=CTX.getSt();
    const arr=(st.dialogue||[]).filter(m=>m&&(m.role==="npc"&&m.npc===npcId||m.role==="player"));
    return arr.slice(-(limit||8)).map(m=>({role:m.role,text:(m.text||"").slice(0,60),at:m.at}));
  },

  /* ---------- NPC 成长数据 ---------- */
  growthOf(npcId){
    const st=CTX.getSt();
    st.npcGrowth=st.npcGrowth||{};
    return st.npcGrowth[npcId]=st.npcGrowth[npcId]||{talks:0,traits:[],speech:"",shift:"",story:[],evolved:null,lv:0};
  },

  /* 故事线追加（里程碑事件；保留最近 12 条） */
  storyAppend(npcId,ev){
    if(!ev) return;
    const g=this.growthOf(npcId);
    g.story.push({at:now(),ev:String(ev).slice(0,100)});
    if(g.story.length>12) g.story=g.story.slice(-12);
    CTX.save();
  },

  /* 对话计数：每 5 次互动自动推演一次成长（异步，不阻塞对话流） */
  bumpTalk(npcId){
    const g=this.growthOf(npcId);
    g.talks=(g.talks||0)+1; g.lastAt=now();
    CTX.save();
    if(g.talks%5===0){ this.evolve(npcId,false); }
  },

  /* ---------- NPC 角色成长推演（AI 依互动历史迭代性格/语言/行为+故事线） ---------- */
  async evolve(npcId,manual){
    if(!CTX.dsReady()) return null;
    const {NPC}=CTX, npc=NPC[npcId]; if(!npc) return null;
    const st=CTX.getSt();
    const persona=st.personas[npcId]&&st.personas[npcId].card;
    const g=this.growthOf(npcId);
    const recent=this.historyOf(npcId,12);
    if(!recent.length) return null;
    if(!manual&&g.talks<5) return null;
    const sys="你是游戏『问道之旅·四十五日』的角色导演。基于NPC人设与其和玩家的最近互动，推演这个角色的自然成长：性格的细微变化、语言表达方式的演进、行为模式的适应性调整，并续写个人故事线。变化必须渐进自然不突兀，保留原人设基调，符合仙侠游戏世界观。严禁AI腔。只输出JSON。";
    const user="游戏背景：\n"+JSON.stringify(this.worldBrief())
      +"\n\n角色：\n"+JSON.stringify({姓名:npc.name,称号:npc.title,背景:npc.intro})
      +(persona?("\n已确认人设："+JSON.stringify(persona)):"")
      +"\n\n成长现状：累计对话"+(g.talks||0)+"次"
      +(g.traits&&g.traits.length?("，性格特质："+g.traits.join("、")):"")
      +(g.speech?("；语言演进："+g.speech):"")
      +(g.shift?("；行为倾向："+g.shift):"")
      +(g.story&&g.story.length?("\n既有故事线："+g.story.slice(-3).map(s=>s.ev).join(" → ")):"")
      +"\n\n最近互动摘要：\n"+recent.map(m=>(m.role==="player"?"玩家：":"该NPC：")+m.text).join("\n")
      +"\n\n请输出JSON：{traits:[性格特质数组，3-4个短语，每个≤12字，体现细微演进]、speech:string(语言表达方式的演进，≤40字)、shift:string(行为模式的适应性调整，≤40字)、story:string(个人故事线新篇章，≤80字，与最近互动内容相关，第一人称)}";
    try{
      const raw=await CTX.dsChat([{role:"system",content:sys},{role:"user",content:user}],true);
      let o;
      try{ o=JSON.parse(raw.replace(/^```json|```$/g,"").trim()); }
      catch(e){ const m=raw.match(/\{[\s\S]*\}/); if(!m) throw e; o=JSON.parse(m[0]); }
      if(Array.isArray(o.traits)&&o.traits.length) g.traits=o.traits.slice(0,4).map(t=>String(t).slice(0,14));
      if(o.speech) g.speech=String(o.speech).slice(0,60);
      if(o.shift) g.shift=String(o.shift).slice(0,60);
      if(o.story) g.story.push({at:now(),ev:String(o.story).slice(0,100)});
      if(g.story.length>12) g.story=g.story.slice(-12);
      g.evolved=now(); g.lv=(g.lv||0)+1;
      CTX.save();
      return o;
    }catch(e){ return null; }
  },

  /* ---------- system prompt（人设 + 成长状态注入） ---------- */
  sysPrompt(npcId,brief){
    const {NPC}=CTX, npc=NPC[npcId]||NPC.qingxuan;
    const g=this.growthOf(npcId);
    let sys="你是游戏『问道之旅·四十五日』里的游戏NPC「"+npc.name+"」（"+npc.title+"）。这不是课堂：玩家是并肩刷任务的游戏者，你们是同一游戏世界里的角色，绝非师生。像网络游戏NPC那样说话——简短、有性格、有江湖气，句子长短错落。严禁AI腔：不用'首先/其次/总之/综上/值得注意的是'，不排比堆砌，不空洞夸奖（非常棒/说得好），不自我总结，不问'还有什么可以帮你的'，不解释自己是什么身份。严禁教书先生口吻（掌握了/要记住/同学们/认真复习/布置作业/劳逸结合）。谈知识用仙侠比喻（考点=封印符文，错题=妖物，背诵=咒文，复习=回炉重刷副本）。"+(brief?"这是多人召唤场景，回复务必精炼≤80字，只说你最有资格说的一段。":"单次回复≤160字。")+"禁现代网络梗，不提AI/模型/接口。";
    if(g&&(g.traits&&g.traits.length||g.speech||g.shift)){
      sys+="\n角色当前成长状态（保持原人设基调下自然体现，不刻意宣告变化）："
        +(g.traits&&g.traits.length?"性格特质："+g.traits.join("、")+"；":"")
        +(g.speech?"语言演进："+g.speech+"；":"")
        +(g.shift?"行为倾向："+g.shift:"");
    }
    if(g&&g.story&&g.story.length){
      sys+="\n角色近期故事线："+g.story.slice(-2).map(s=>s.ev).join("；");
    }
    return sys;
  },

  /* ---------- 上下文组装（世界观+角色+成长+人设+进度+历史+资料+检索） ---------- */
  buildContext(npcId,userText,web){
    const {NPC}=CTX, npc=NPC[npcId]||NPC.qingxuan;
    const st=CTX.getSt();
    const persona=st.personas[npcId]&&st.personas[npcId].card;
    const g=this.growthOf(npcId);
    const hist=this.historyOf(npcId,6);
    let ctx="游戏背景：\n"+JSON.stringify(this.worldBrief())
      +"\n\n角色信息："+JSON.stringify({姓名:npc.name,称号:npc.title,背景:npc.intro})
      +(persona?("\n已确认人设："+JSON.stringify(persona)):"")
      +"\n\n当前游戏状态：第"+st.day+"日，已解锁至第"+st.unlocked+"日，修行"+st.xp+"，等级Lv."+CTX.level()
      +"\n\n与玩家的历史互动（近期）："
      +(hist.length?hist.map(m=>(m.role==="player"?"玩家说":"你说")+"："+m.text).join("\n"):"（暂无）")
      +"\n\n游戏资料库（本地优先，与检索冲突时以此为准）："
      +this.knowledge(userText);
    if(web) ctx+="\n\n网络检索补充（供参考，不确定可不采用）：\n"+web;
    return ctx;
  },

  /* ---------- 降级话术：AI 不可用时依人设本地接话 ---------- */
  fallback(npcId,userText){
    const {NPC}=CTX;
    const pool={
      qingxuan:["雾重，云端的话传不下来。先记这条：{k}。灯再亮时，细说与你听。","我的灯暂时照不进云雾。库里翻到一条：{k}","灯花跳了跳——云路未通。且收下这条旧讯：{k}"],
      smq:["剑意被雾滞在半途。山道上拾得一条旧讯：{k}","雾锁山河，剑没出鞘。先记下：{k}"],
      tiemian:["塔中回声断了。卷宗里查到一条：{k}。塔门再开时，当面细核。","铁面无声，雾断回音。卷宗旧录：{k}"],
      liuruyan:["纱幕后听不真切，只拾到一句：{k}","雾漫纱帘。帘内递出一张字条：{k}"],
      moxiaogu:["机关匣卡壳了，吱呀——掉出一页：{k}","发条锈住了！翻出半页旧档：{k}"],
      xuanji:["星轨被云遮住，卦象里只剩一行：{k}","云厚星隐。卦面仅显一语：{k}"]
    };
    const none={qingxuan:"此问须待灯亮再答。",smq:"此问须待雾散，再与你拆招。",tiemian:"此问须回塔查阅卷宗。",liuruyan:"此问且记下，帘内再叙。",moxiaogu:"此问须待机关匣修好。",xuanji:"此问须待云开观星。"};
    const arr=pool[npcId]||pool.qingxuan;
    const tpl=arr[hash(String(userText)+Math.floor(Date.now()/6e4))%arr.length];
    // 知识点摘录：资料库无命中时回退到该 NPC 的专属占位句
    let k=none[npcId]||none.qingxuan;
    const kb=this.knowledge(userText);
    if(kb&&!kb.startsWith("（")){
      const lines=kb.split("\n").filter(l=>l.includes("："));
      if(lines.length) k=lines[lines.length-1].split("：").slice(1).join("：").slice(0,66)||k;
    }
    return tpl.replace("{k}",k).replace(/。。+/g,"。").replace(/！！+/g,"！").replace(/？？+/g,"？");
  },

  /* ---------- 对话生成主入口 ----------
     返回 {text, degraded}；永不 reject——AI 不可用/失败时自动降级为本地话术，
     保证群聊不断流（调用方无需再写 catch 兜底）。 */
  async respond(npcId,userText,brief){
    const {NPC}=CTX, npc=NPC[npcId]||NPC.qingxuan;
    if(!CTX.dsReady()) return {text:this.fallback(npcId,userText),degraded:true};
    try{
      const web=await this.webSearch(userText.replace(/@[^\s，。,,]+/g,"").trim());
      const sys=this.sysPrompt(npcId,brief);
      const context=this.buildContext(npcId,userText,web);
      const raw=await CTX.dsChat([
        {role:"system",content:sys},
        {role:"user",content:context+"\n\n玩家说："+userText+"\n\n以"+npc.name+"的身份像游戏NPC一样回应——把它当成一次队内喊话，不是答疑课。"}
      ],false);
      const text=(raw||"").trim();
      this.bumpTalk(npcId);
      return {text:text||this.fallback(npcId,userText),degraded:!text};
    }catch(e){
      return {text:this.fallback(npcId,userText),degraded:true};
    }
  }
};

window.WDChat=WDChat;
})();
