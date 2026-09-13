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
    /* 用户自定义游戏背景信息优先（配置中心编辑） */
    const custom=(window.WDCfg&&WDCfg.customWorldBrief)?WDCfg.customWorldBrief():null;
    if(custom&&custom.trim()) return custom.trim();
    if(!CTX||!CTX.D) return "（游戏背景信息尚未加载）";
    const {D}=CTX;
    return {
      游戏名:"问道之旅 · 四十五日（北京导游资格考试游戏化复习）",
      游戏目的:"玩家在游戏中备考北京导游资格证。做任务就是网络游戏行为：研习新考点=开荒新副本，复习=回炉重刷副本并重新封印苏醒的旧妖，题组试炼=砍怪打谜题妖，英文背诵=施法吟咒，大试炼=攻城团战，巡夜=日常巡逻任务。玩家与NPC是游戏世界里并肩作战的关系（队友/接头人/引路人），绝非老师与学生——没有人在上课，大家在同一个江湖里打怪升级。",
      世界观:"玩家所在的自在世界意外跌入到『导游异次元』，该次元正受到遗忘之雾的入侵，如果不能解除『遗忘之雾』笼罩，整个世界都将毁于一旦。而玩家自身也只有帮助本世界恢复常态之后才能重返家园。现在，玩家作为导游次元的外来者，恰好是最后一个可以通关『导游试炼』以驱逐『遗忘之雾』的人选。因此，在本世界的几位传奇导游的帮助下引导下，用四十五日历经五个幕次——山河游学、律法塔、行会风云、遗迹探秘、金榜台前，最终赴考。",
      隐喻系统:"每个复习任务都是一个游戏化关卡：新学任务=秘境探幽/残卷修复/重激活神圣导游知识封印；复习任务=封印重临（遗忘之雾侵袭神圣导游知识封印，生成遗忘怪，需要玩家反复击杀）；题组练习=谜题斩妖（仙人联手布置的模拟大阵，生成精英级遗忘怪，帮助提升技艺）；英文背诵=咒文吟诵（激活神圣导游知识封印的核心仪轨之一）；大试炼=攻城之战（遗忘之雾催生怪物攻城事件，需玩家战斗守城）；线索卡=符文拓印；行囊准备=法器整备；巡夜记忆卡=夜巡驱雾。难度层级按稀有度：common=雾卒、fine=妖将、epic=妖王。",
      游戏机制:["读卷：翻页研习考点，关键词高亮、记忆锚助记","试炼：是非+填空，答错录入星盘错题","吟游：英文导游词朗读、录音、打字复述自评","巡夜：按1/3/7/15日间隔重刷记忆卡","五幕四十五日任务链，主线环环前置解锁","修行=经验值升级，铜钱可在集市兑换"],
      NPC基础信息:D.npcs.map(n=>({id:n.id,
        姓名:(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(n.id,n.name):n.name,
        称号:(window.WDCfg&&WDCfg.npcTitle)?WDCfg.npcTitle(n.id,n.title):(n.title||""),
        背景:n.intro})),
      叙事约束:"NPC 是游戏NPC不是教师：像网游NPC那样简短、有性格、有江湖气地说话；对话服务当日任务目标，不剧透未解锁环节，不跑题，不出现考试答案；禁止教书先生式表达（掌握了/要记住/同学们/认真听讲/布置作业/劳逸结合等）。",
      自由对话机制:"对话流是类游戏群聊的自由发言场：玩家可输入任意文本（提问、报战况、闲聊均可），系统保证每次发言至少有一位与其角色设定和职能匹配的 NPC 出面接话；@角色名可指定 NPC，@所有人则全员各回一句。NPC 对题外话也要先以角色身份接住，再轻巧引回主线，不许冷场。",
      NPC回复结构:"每条 NPC 回复含三要素：①情境互动——针对玩家当前状态或刚完成的行为回应并给具体正向反馈；②剧情意义——说明该任务在五幕主线中的分量与角色面临的挑战；③任务发布——明确目标、要求、预期成果及下一步（找哪位 NPC、先破哪一关）。",
      语言要求:"像真人玩家交流：口语化、句子长短错落、可用游戏黑话（开荒/副本/掉落/翻车/通关/团战）；严禁AI腔——不用'首先/其次/总之/综上/值得注意的是'，不排比堆砌，不空洞夸奖（非常棒/说得好），不自我总结，不问'还有什么可以帮你的'；禁现代网络梗；不提AI/模型/接口。每次回复须换用新的开头、比喻与角度，严禁与近期原话雷同。"
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
    const sys="你是游戏『问道之旅·四十五日』的角色导演。基于NPC人设与其和玩家的最近互动，推演这个角色的自然成长：性格的细微变化、语言表达方式的演进、行为模式的适应性调整，并续写个人故事线。变化必须渐进自然不突兀，保留原人设基调，符合导游异次元世界观。严禁AI腔。只输出JSON。";
    const dN=(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(npcId,npc.name):npc.name;
    const dT=(window.WDCfg&&WDCfg.npcTitle)?WDCfg.npcTitle(npcId,npc.title):(npc.title||"");
    const user="游戏背景：\n"+JSON.stringify(this.worldBrief())
      +"\n\n角色：\n"+JSON.stringify({id:npcId,姓名:dN,称号:dT,背景:npc.intro})
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

  /* ---------- 该 NPC 近期自己的原话（防重复机制数据源） ---------- */
  recentReplies(npcId,limit){
    const st=CTX.getSt();
    return (st.dialogue||[]).filter(m=>m&&m.role==="npc"&&m.npc===npcId)
      .slice(-(limit||5)).map(m=>(m.text||"").slice(0,90));
  },

  /* 当前关卡行动指引（降级话术用；按任务类型给具体动作） */
  howTo(aq){
    if(!aq) return "去巡夜重刷记忆卡，或上星盘会会错题妖";
    const t=(aq.tlabel||"")+"|"+(aq.type||"");
    if(/英文|吟游/.test(t)) return "把咒文吟上几遍、录一遍音再自评";
    if(/试炼|题组|大试炼/.test(t)) return "备上题剑进关，以题作剑斩妖";
    if(/复习/.test(t)) return "回炉重刷，把松动的封印再钉牢";
    if(/行囊|整备/.test(t)) return "先把法器行囊整备齐整";
    return "翻开卷页，把新符文逐张拓熟";
  },

  /* ---------- system prompt（行为边界+自主权+四职能+三段结构+防重复） ---------- */
  sysPrompt(npcId,brief){
    const {NPC}=CTX, npc=NPC[npcId]||NPC.qingxuan;
    const g=this.growthOf(npcId);
    const st=CTX.getSt();
    const aq=CTX.quest&&CTX.quest();
    /* 自定义名字/人设（WDCfg 未挂载则用原名） */
    const cfg=window.WDCfg&&window.WDCfg.ready?window.WDCfg.ready():null;
    const dispName=(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(npcId,npc.name):npc.name;
    const dispTitle=(window.WDCfg&&WDCfg.npcTitle)?WDCfg.npcTitle(npcId,npc.title):(npc.title||"");
    const persona=(window.WDCfg&&WDCfg.npcPersona)?WDCfg.npcPersona(npcId):"";
    let sys="你是游戏『问道之旅·四十五日』里的游戏NPC「"+dispName+"」"+(dispTitle?"（"+dispTitle+"）":"")+"。玩家是与你并肩刷任务的同道，你们同处一个游戏世界，绝非师生。说话像网游里的NPC：简短、有性格、有江湖气，句子长短错落。\n"
      +"【行为边界·绝不可越界】"
      +"1）你始终是「"+dispName+"」本人，绝不出戏，绝不承认自己是AI/程序/模型，不提接口、密钥、存档等系统外物；"
      +"2）不替玩家做决定、不代替玩家操作，只给情报、建议与引导；"
      +"3）绝不直接给考试答案或题库原题答案，只能用比喻、口诀和思路启发；"
      +"4）不剧透尚未解锁的幕次与任务，不编造游戏中不存在的机制、道具、人物；"
      +"5）玩家聊起现实时政、敏感事件或他人隐私时，以角色口吻一句带过并引回游戏，不展开现实话题；"
      +"6）禁教书先生口吻（掌握了/要记住/同学们/认真复习/布置作业/劳逸结合），禁AI腔（首先/其次/总之/综上/值得注意的是/还有什么可以帮你），不排比堆砌、不空洞夸奖。\n"
      +"【你的自主权限】"
      +"1）自主决定措辞、语气节奏与何时打趣；"
      +"2）自主选择是否引用、何时引用你与玩家的共同记忆；"
      +"3）自主判断时机，可主动推进主线、发布任务、催促下一步；"
      +"4）自主用导游异次元世界观比喻讲知识、讲操作（考点=神圣导游知识封印，错题=遗忘怪，背诵=咒文吟诵，复习=回炉重刷副本封印）；"
      +"5）玩家发任何闲话都先以角色身份自然接住一句，再轻巧引回当前任务，不冷场、不说教；"
      +"6）自主给予情绪反馈，但必须具体——点明他刚做了什么、哪里有进步，绝不泛泛说'真棒'。\n"
      +"【世界观硬约束·已淘汰概念禁用】严禁出现：提灯、引灯、问道录、仙侠、仙师、封妖塔、幻纱行、机关童子、观星者、掌灯、镇塔尊者。统一用导游异次元世界观（遗忘之雾、导游试炼、传奇导游、神圣导游知识封印、遗忘怪）。\n"
      +"【四项职能】推进故事主线、介绍角色背景、说明关卡信息、引导操作模式——每次回话至少承担一项，并优先服务当前关卡。\n"
      +"【回复结构·三要素】每次回复依次包含三层，语言上自然衔接成段，不写序号、不分条列点、不加标题："
      +"①情境：回应玩家当前状态或刚做的事，给一句具体的个性化正向反馈（任务完成、探索发现、答错重试、随意闲聊都算）；"
      +"②剧情：讲清眼下这桩事在五幕主线里的分量——你或同门正面临什么难关、为何非他不可；"
      +"③任务：明确发布——做什么、有何要求、预期成果，并点出下一步先找哪位同道、先破哪一关。"
      +"玩家若只是闲聊，三要素也须齐全：先接住话（情境），借题点一句主线（剧情），最后给一个明确动作（任务/下一步）。"
      +(brief?"多人同时在场，只说你最有资格的一段：三要素压成两三句，≤100字。":"单次回复≤220字。");
    /* 当下情境：当前关卡/当日进度，供三段结构就地取材 */
    if(aq){
      const host=NPC[aq.npc]
        ?((window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(aq.npc,NPC[aq.npc].name):NPC[aq.npc].name)
        :aq.npc;
      sys+="\n【当下情境】玩家在第"+st.day+"日，在途关卡「"+aq.name+"」（"+aq.tlabel+"，约"+aq.dur+"分钟，接洽人："+host+"），要求："+(aq.goal||"通关")+"。";
    }else{
      sys+="\n【当下情境】玩家在第"+st.day+"日，今日关卡已清——可引导其巡夜温故、上星盘清错题，或预告下一幕。";
    }
    /* 本章互动话题（NPC 职能重构：全角色×四章矩阵） */
    const topic=CTX.actTopic&&CTX.actTopic(npcId);
    if(topic) sys+="\n本章（当前幕）你正与玩家同行的话题：「"+topic+"」——你的话可自然贴着它。";
    /* 配置中心：玩家称呼/自称 + NPC语气·风格·深度策略 + 自定义人设 */
    if(cfg){
      const how=cfg.address?("\n你须称呼玩家为「"+cfg.address+"」"):"";
      const self=cfg.selfName?("\n玩家自称「"+cfg.selfName+"」"):"";
      const st2=cfg.style||{};
      sys+="\n【对话策略】"+how+self
        +(st2.tone?("；语气："+(st2.tone==="formal"?"正式恭敬":"随意亲近")):"")
        +(st2.humor?("；风格："+(st2.humor==="humor"?"幽默诙谐":"严肃凝练")):"")
        +(st2.depth?("；深度："+(st2.depth==="deep"?"进阶（可谈原理与延伸）":"基础（只讲结论与口诀）")):"")
        +"。";
    }
    /* 用户自定义人设描述：作为 AI 生成角色设定的参考依据 */
    if(persona) sys+="\n【用户设定的角色基准】"+persona+"——你的言行须贴合此描述，作为角色塑造的第一参考。";
    /* NPC 记忆画像（WDMem 未挂载则跳过）——具体反馈与记忆引用的数据源 */
    const mem=window.WDMem&&window.WDMem.digest?window.WDMem.digest(npcId):null;
    if(mem) sys+="\n【你与这位玩家的记忆】"+mem+"（情绪反馈须从中取具体事实，自然引用，不要罗列数据）";
    if(g&&(g.traits&&g.traits.length||g.speech||g.shift)){
      sys+="\n角色当前成长状态（保持原人设基调下自然体现，不刻意宣告变化）："
        +(g.traits&&g.traits.length?"性格特质："+g.traits.join("、")+"；":"")
        +(g.speech?"语言演进："+g.speech+"；":"")
        +(g.shift?"行为倾向："+g.shift:"");
    }
    if(g&&g.story&&g.story.length){
      sys+="\n角色近期故事线："+g.story.slice(-2).map(s=>s.ev).join("；");
    }
    /* 防重复硬约束：注入该 NPC 近期原话，禁止复用开头/句式/结尾 */
    const mine=this.recentReplies(npcId,5);
    if(mine.length){
      sys+="\n【防重复·硬约束】以下是你近期的原话："+mine.map((t,i)=>"〔"+(i+1)+"〕"+t).join("")
        +"——禁止复用其中任何句子的开头（前6字）、句式套路与结尾措辞；必须换一个新角度、新比喻或新切口表达，且本次首字不得与最近一条相同。";
    }
    return sys;
  },

  /* ---------- 上下文组装（世界观+角色+成长+人设+进度+历史+资料+检索） ---------- */
  buildContext(npcId,userText,web){
    const {NPC}=CTX, npc=NPC[npcId]||NPC.qingxuan;
    const st=CTX.getSt();
    const aq=CTX.quest&&CTX.quest();
    const persona=st.personas[npcId]&&st.personas[npcId].card;
    const customPersona=(window.WDCfg&&WDCfg.npcPersona)?WDCfg.npcPersona(npcId):"";
    const dispName=(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(npcId,npc.name):npc.name;
    const dispTitle=(window.WDCfg&&WDCfg.npcTitle)?WDCfg.npcTitle(npcId,npc.title):(npc.title||"");
    const hist=this.historyOf(npcId,6);
    let ctx="游戏背景：\n"+JSON.stringify(this.worldBrief())
      +"\n\n角色信息："+JSON.stringify({姓名:dispName,称号:dispTitle,背景:npc.intro})
      +(customPersona?("\n用户设定角色基准："+customPersona):"")
      +(persona?("\n已确认人设："+JSON.stringify(persona)):"")
      +"\n\n当前游戏状态：第"+st.day+"日，已解锁至第"+st.unlocked+"日，修行"+st.xp+"，等级Lv."+CTX.level()
      +(aq?("\n当前关卡："+JSON.stringify({名称:aq.name,类型:aq.tlabel,时长:aq.dur+"分钟",接洽NPC:(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(aq.npc,(NPC[aq.npc]||{}).name):((NPC[aq.npc]||{}).name||aq.npc),目标:aq.goal,建议动作:this.howTo(aq)}))
        :"\n当前关卡：今日已清（可引导巡夜温故/星盘错题/预告下一幕）")
      +"\n\n与玩家的历史互动（近期）："
      +(hist.length?hist.map(m=>(m.role==="player"?"玩家说":"你说")+"："+m.text).join("\n"):"（暂无）")
      +"\n\n游戏资料库（本地优先，与检索冲突时以此为准）："
      +this.knowledge(userText);
    if(web) ctx+="\n\n网络检索补充（供参考，不确定可不采用）：\n"+web;
    return ctx;
  },

  /* ---------- 降级话术：AI 不可用时本地三段式接话（情境+剧情+任务） ---------- */
  fallback(npcId,userText){
    const {NPC}=CTX;
    const npc=NPC[npcId]||NPC.qingxuan;
    const aq=CTX.quest&&CTX.quest();
    const st=CTX.getSt();
    /* ①情境层：按 NPC 人设的接住句，两套切口轮换，防开头重复 */
    const open={
      yunheng:["灯影一晃，我看见你了——","引路灯为你多亮了一寸，"],
      qingxuan:["云头上传来一声轻笑——","我拂了拂袖，正等着这句——"],
      smq:["剑鸣半响，像在替你叫好——","我收剑回身，"],
      tiemian:["塔中刻笔一顿——","卷宗新添一行，"],
      liuruyan:["纱幕后环佩轻响——","我掀开半幅纱帘，"],
      moxiaogu:["机关鸟扑棱棱落在你肩头——","发条咔哒一响，"],
      xuanji:["星盘上的光连成一线——","我指尖划过卦象，"]
    };
    /* ②剧情层：各 NPC 视角的主线分量句 */
    const story={
      yunheng:"遗忘之雾一日浓过一日，导游试炼的路，要靠你这盏灯接下去。",
      qingxuan:"文脉导游这一程，旧京的山川形胜正随雾散佚，你拓下的每张符文都是在抢回一段文脉。",
      smq:"律法塔前群妖环伺，规则如剑招般严密，这一关磨不利，后面的塔门半步难进。",
      tiemian:"塔中卷宗如山，错一条法条便放一只妖出关，这桩差事非心细如你者不能担。",
      liuruyan:"行会里八方来客、规矩错综，你要学的不只是词儿，是与人周旋的分寸。",
      moxiaogu:"遗迹的机关越来越刁钻，我这机关匣里的宝贝，得有个胆大心细的人替我用。",
      xuanji:"星轨显示大考渐近，错题妖正在雾中成群结阵，此时不扫清，考场上便要噬灯。"
    };
    const oa=open[npcId]||open.qingxuan;
    const tick=Math.floor(Date.now()/36e5); // 每小时换切口
    const first=oa[(hash(String(userText))+tick)%oa.length];
    // 情境：玩家的话 + 具体反馈（过长截断并闭合引号，避免书名号/引号悬尾）
    let quote=String(userText).replace(/^@[^\s，。,,\s]+\s*/,"").replace(/[「」『』]/g,"").trim();
    if(quote.length>16) quote=quote.slice(0,16)+"…";
    const say="你这句「"+quote+"」我记下了";
    // ③任务层：当前关卡 / 无关卡时的温故指引
    let task;
    if(aq){
      const host=NPC[aq.npc];
      const hn=host?((window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(host.id,host.name):host.name):aq.npc;
      task=(host&&host.id!==npcId?("先去寻"+hn+"接下「"):("这就去会会「"))+aq.name+"」——"+this.howTo(aq)+"，通关可得 "+aq.xp+" 修行、"+aq.coin+" 铜钱。";
    }else{
      task="今日关卡已清，去巡夜重刷几张记忆卡，或上星盘会会错题妖，稳住道行。";
    }
    // 资料库有命中则在情境层补一条知识点，保证提问有实质回应
    let extra="";
    const kb=this.knowledge(userText);
    if(kb&&!kb.startsWith("（")){
      const lines=kb.split("\n").filter(l=>l.includes("："));
      if(lines.length) extra="库里恰好有一条："+lines.slice(-1)[0].split("：").slice(1).join("：").slice(0,52)+"。";
    }
    return first+say+"。"+extra+(story[npcId]||story.qingxuan)+task;
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
      const dispName=(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(npcId,npc.name):npc.name;
      const raw=await CTX.dsChat([
        {role:"system",content:sys},
        {role:"user",content:context+"\n\n玩家说："+userText+"\n\n以"+dispName+"的身份回应：自然成段地走完情境、剧情、任务三层，不写序号不分条，像群聊里的一次队内喊话，不是答疑课。"}
      ],false);
      let text=(raw||"").trim();
      if(text) text=this.deRepeat(npcId,text);
      this.bumpTalk(npcId);
      return {text:text||this.fallback(npcId,userText),degraded:!text};
    }catch(e){
      return {text:this.fallback(npcId,userText),degraded:true};
    }
  },

  /* ---------- 输出后去重：与近期原话开头撞车则微调开头 ---------- */
  deRepeat(npcId,text){
    const mine=this.recentReplies(npcId,3);
    if(!mine.length) return text;
    const last=mine[mine.length-1]||"";
    if(last&&text.slice(0,4)===last.slice(0,4)){
      const npc=CTX.NPC[npcId]||CTX.NPC.qingxuan;
      const lead=["哎，","且慢——","听好，","话说回来，","正是——"];
      return lead[hash(text)%lead.length]+text;
    }
    return text;
  }
};

window.WDChat=WDChat;
})();
