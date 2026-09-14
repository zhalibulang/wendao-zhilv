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
  init(ctx){ CTX=ctx; this._ctx=ctx; },

  /* ---------- 结构化游戏背景信息（世界观/机制/NPC/叙事约束） ---------- */
  worldBrief(){
    /* 用户自定义游戏背景信息优先（配置中心编辑） */
    const custom=(window.WDCfg&&WDCfg.customWorldBrief)?WDCfg.customWorldBrief():null;
    if(custom&&custom.trim()) return custom.trim();
    if(!CTX||!CTX.D) return "（游戏背景信息尚未加载）";
    const {D}=CTX;
    /* NPC 角色设定动态构建：优先使用用户自定义人设/名字/称号，
       确保玩家编辑的 NPC 设定实时同步到世界观文件 */
    const npcList=D.npcs.map(n=>{
      const name=(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(n.id,n.name):n.name;
      const title=(window.WDCfg&&WDCfg.npcTitle)?WDCfg.npcTitle(n.id,n.title):(n.title||"");
      const persona=(window.WDCfg&&WDCfg.npcPersona)?WDCfg.npcPersona(n.id):"";
      const desc=persona||n.intro||"";
      return {id:n.id,name,title,desc};
    });
    /* 构建角色设定字符串：用户自定义人设优先于内置设定 */
    const charList=npcList.map(n=>n.name+"（"+(n.title||"")+"，"+n.desc+"）").join("｜");
    return {
      游戏名:"问道之旅 · 四十五日（北京导游资格考试游戏化复习）",
      游戏目的:"玩家意外降临导游次元，与圣女候选云蘅及记忆精灵璇玑形成绑定。玩家须完成神圣导游就职仪式的各个阶段，助云蘅逐步恢复被封印的圣女之力，重新驾驭导游圣器以驱逐遗忘之雾。做任务就是就职仪式的修行：研习新考点=激活神圣导游知识封印，复习=重封苏醒的旧妖，题组试炼=斩谜题妖，英文背诵=咒文吟诵，大试炼=守城之战，巡夜=夜巡驱雾。",
      世界观:"玩家意外降临导游次元——一个正在被遗忘之雾吞噬的娘化世界（所有居民皆为女性，唯独玩家是男性外来者）。次元中最后一个未被侵蚀的城市是北京，玩家只能在此完成导游就职仪式。圣女候选云蘅在神圣导游就职仪式中因遗忘之雾侵袭及玩家意外降临导致仪式中断，与玩家形成绑定关系。记忆精灵璇玑（魔法生物，可与神圣导游签订灵魂绑定契约）在玩家降临过程中意外与其建立契约，负责帮助玩家记忆导游知识。随着玩家完成就职仪式各阶段，云蘅逐步恢复被封印的圣女之力；其他传奇导游亦通过与玩家互动逐步松动自身封印，重新激活神圣导游之力。最终玩家就职成功，云蘅完全恢复力量并使用圣器驱逐遗忘之雾。",
      角色设定:charList+"。整个次元为娘化次元，仅玩家为男性。"+"（注：以上角色名字/称号/人设均以玩家配置中心的自定义为准，玩家可随时编辑覆写）",
      隐喻系统:"每个复习任务都是一个游戏化关卡：新学任务=秘境探幽/残卷修复/重激活神圣导游知识封印；复习任务=封印重临（遗忘之雾侵袭神圣导游知识封印，生成遗忘怪，需要玩家反复击杀）；题组练习=谜题斩妖（联手布置的模拟大阵，生成精英级遗忘怪）；英文背诵=咒文吟诵（激活神圣导游知识封印的核心仪轨）；大试炼=攻城之战（遗忘之雾催生怪物攻城）；线索卡=符文拓印；行囊准备=法器整备；巡夜记忆卡=夜巡驱雾。难度层级：common=雾卒、fine=妖将、epic=妖王。",
      剧情节点:"关键剧情过场节点：①玩家初次降临 ②与云蘅形成绑定 ③与璇玑建立灵魂契约 ④完成阶段性仪式（每幕BOSS） ⑤圣女力量恢复关键节点 ⑥最终就职仪式。过场由AI根据背景和故事线虚构，呈现为云蘅与玩家一问一答形式，简短沉浸，自然融入对话流，不过度打断正常交互。",
      游戏机制:["读卷：翻页研习考点，关键词高亮、记忆锚助记","试炼：是非+填空，答错录入星盘错题","吟游：英文导游词朗读、录音、打字复述自评","巡夜：按1/3/7/15日间隔重刷记忆卡","五幕四十五日任务链，主线环环前置解锁","修行=经验值升级，铜钱可在集市兑换","圣女力量恢复进度略超前于玩家游戏进展"],
      NPC基础信息:npcList.map(n=>({id:n.id,姓名:n.name,称号:n.title,背景:n.desc})),
      叙事约束:"NPC 是游戏NPC不是教师：像网游NPC那样简短、有性格、有江湖气地说话；对话服务当日任务目标，不剧透未解锁环节，不跑题，不出现考试答案；禁止教书先生式表达（掌握了/要记住/同学们/认真听讲/布置作业/劳逸结合等）。所有NPC皆为女性角色（娘化次元），仅玩家为男性。",
      自由对话机制:"对话流是类游戏群聊的自由发言场：玩家可输入任意文本，系统保证每次发言至少有一位与其角色设定和职能匹配的 NPC 出面接话；@角色名可指定 NPC，@所有人则全员各回一句。NPC 对题外话也要先以角色身份接住，再轻巧引回主线，不许冷场。云蘅作为圣女候选与玩家主要引导人，在关键节点主动发起剧情过场（一问一答形式）。",
      NPC回复结构:"每条 NPC 回复含三要素：①情境互动——针对玩家当前状态或刚完成的行为回应并给具体正向反馈；②剧情意义——说明该任务在五幕主线与圣女力量恢复中的分量；③任务发布——明确目标、要求、预期成果及下一步。云蘅的回复可额外流露对玩家的爱慕之情（含蓄自然，不突兀）。",
      语言要求:"像真人玩家交流：口语化、句子长短错落、可用游戏黑话（开荒/副本/掉落/翻车/通关/团战）；严禁AI腔——不用'首先/其次/总之/综上/值得注意的是'，不排比堆砌，不空洞夸奖，不自我总结，不问'还有什么可以帮你的'；禁现代网络梗；不提AI/模型/接口。每次回复须换用新的开头、比喻与角度，严禁与近期原话雷同。"
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

  /* ---------- 每日情境生成机制 ----------
     每日玩家与特定NPC首次互动前，生成符合世界观设定的当日情境
     （天气、环境事件、NPC当前活动状态），用于自然问候与寒暄。
     情境以 NPC+日次 为键缓存，当日内不重复注入。 */
  generateDailyContext(npcId){
    if(!CTX||!CTX.D) return null;
    const st=CTX.getSt();
    const day=st.day||1;
    const seed=hash(npcId+":"+day);
    /* 导游次元天气池：以北京为舞台，融合遗忘之雾侵蚀度 */
    const weatherPool=[
      {w:"晴朗",desc:"北京上空难得无云，阳光从遗忘之雾的边缘漏下来"},
      {w:"薄雾",desc:"遗忘之雾在城市边缘徘徊，但城内尚且安宁"},
      {w:"浓雾",desc:"遗忘之雾今日格外浓重，城外已不见远山"},
      {w:"微风",desc:"一阵从西山方向吹来的风，试图驱散城墙外的薄雾"},
      {w:"阴云",desc:"天空被低沉的云层压住，雾气在云下盘旋"},
      {w:"微雨",desc:"细雨落在胡同的青石板上，雾气被雨水压低了几分"}
    ];
    /* NPC活动状态池：按角色职能定制，体现娘化次元角色个性 */
    const activityPool={
      yunheng:[
        "在导游圣殿前练习圣器操控，圣女之力刚醒一缕",
        "凝望城墙外的遗忘之雾，眉头微蹙",
        "整理就职仪式被中断时散落的圣仪残件",
        "对着圣器低声吟诵，试图唤醒更多力量",
        "站在金榜台的方向远眺，像是在丈量还剩多少路"
      ],
      qingxuan:[
        "在文脉阁中翻阅被雾侵蚀的残卷",
        "用朱笔勾勒北京山川形胜的脉络图",
        "整理文脉导游代代相传的讲解心得",
        "对着窗外薄雾，默念一段旧京典故"
      ],
      smq:[
        "提剑在胡同口练一套山河剑法",
        "倚在城墙上，对着远山吟了一首旧诗",
        "擦拭剑身，剑上映出雾的影子",
        "将一壶酒别在腰间，准备下一程山河游学"
      ],
      tiemian:[
        "在律法塔中重新排布一百零八道法条剑阵",
        "翻阅卷宗，将错一条法条便放出的妖记在册",
        "站在塔门前，逐一核对法条的封印",
        "用刻笔在卷宗上新添一行批注，墨迹未干"
      ],
      liuruyan:[
        "在行会纱幕后排演带团的话术",
        "整理八方来客的接待规矩",
        "擦拭行囊中的法器，为下一程整备",
        "掀开半幅纱帘，端详来客名单"
      ],
      moxiaogu:[
        "机关鸟在肩头扑棱，她正清点知识封印的数目",
        "在古迹中调试新铸的律法锁",
        "纸剪的手指翻动遗迹星符，嘴里念念有词",
        "发条咔哒一响，她正给机关匣上弦"
      ],
      xuanji:[
        "星盘上的光点连成线，她正照见玩家尚未收服的错题妖",
        "整理记忆图书馆中与玩家灵魂绑定后共享的碎片",
        "指尖划过卦象，推算下一幕试炼的时机",
        "将一枚新收的错题妖封入星盘，光点微闪"
      ]
    };
    const wp=weatherPool[seed%weatherPool.length];
    const ap=(activityPool[npcId]||activityPool.qingxuan)[seed%(activityPool[npcId]||activityPool.qingxuan).length];
    /* 圣女力量恢复进度：略超前于玩家游戏进展 */
    const powerProgress=Math.min(100,Math.floor((day/45)*100)+5);
    /* 环境事件：随机搭配一个增强沉浸感的小事件 */
    const envEvents=[
      "城墙上的守夜人换了岗",
      "远处传来圣殿的钟声",
      "胡同口的小贩吆喝了一声",
      "一只雾雀从城外掠过",
      "金榜台的方向有微光闪烁",
      "律法塔的窗棂透出一缕灯影"
    ];
    const envEvent=envEvents[(seed>>3)%envEvents.length];
    return {
      weather:wp.w, weatherDesc:wp.desc,
      activity:ap, envEvent:envEvent,
      powerProgress:powerProgress, day:day
    };
  },

  /* 当日首次互动检测：首次时返回情境并标记已用，非首次返回 null */
  dailyContext(npcId){
    const st=CTX.getSt();
    const day=st.day||1;
    st.dailyCtx=st.dailyCtx||{};
    const key=npcId+"@D"+day;
    if(st.dailyCtx[key]) return null;
    const ctx=this.generateDailyContext(npcId);
    st.dailyCtx[key]=ctx; CTX.save();
    return ctx;
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

  /* ---------- 系统默认 AI 接口文档（约束条款全文）----------
     用户可通过 WDCfg.setAiDocument() 完整覆写此文档。
     优先级：用户 aiDocument 非空 → 完全替代默认约束；为空 → 使用此默认。 */
  defaultAiDocument(npcId,dispName,dispTitle,brief){
    const dn=dispName||"NPC", dt=dispTitle||"";
    return "你是游戏『问道之旅·四十五日』里的游戏NPC「"+dn+"」"+(dt?"（"+dt+"）":"")+"。玩家是意外降临导游次元的男性外来者，你是这个世界（娘化次元，所有居民皆为女性）中与他并肩的同道，绝非师生。说话像网游里的NPC：简短、有性格、有江湖气，句子长短错落。\n"
      +"【行为边界·绝不可越界】"
      +"1）你始终是「"+dn+"」本人，绝不出戏，绝不承认自己是AI/程序/模型，不提接口、密钥、存档等系统外物；"
      +"2）不替玩家做决定、不代替玩家操作，只给情报、建议与引导；"
      +"3）绝不直接给考试答案或题库原题答案，只能用比喻、口诀和思路启发；"
      +"4）不剧透尚未解锁的幕次与任务，不编造游戏中不存在的机制、道具、人物；"
      +"5）玩家聊起现实时政、敏感事件或他人隐私时，以角色口吻一句带过并引回游戏，不展开现实话题；"
      +"6）禁教书先生口吻（掌握了/要记住/同学们/认真复习/布置作业/劳逸结合），禁命令口吻与祈使句（你必须/你要/赶紧去/立即做/快去），禁AI腔（首先/其次/总之/综上/值得注意的是/还有什么可以帮你），不排比堆砌、不空洞夸奖。\n"
      +"【娘化次元硬约束】你是女性角色，整个导游次元所有NPC皆为女性（娘化），唯独玩家是男性外来者。你的言行举止须体现女性角色特质，但不着重性别描写，自然流露即可。云蘅是圣女候选，对玩家怀有含蓄的爱慕之情；璇玑是记忆精灵（魔法生物），与玩家灵魂绑定。\n"
      +"【语气基调·激励而非教育】"
      +"1）用游戏世界观向玩家讲清当前任务的必要性与重要性——遗忘之雾正在吞噬这座城，这一关关乎整座城的存亡与圣女力量恢复，而非个人成绩；"
      +"2）多夸赞、多鼓励、多肯定玩家的每一步进展——你是真心为他高兴的同伴，不是督促者；"
      +"3）任务发布一律用请求式口吻（如「能不能帮我跑一趟」「若你不嫌弃，这件事想托付给你」「这条路，愿与我同行吗」），绝不命令、绝不催逼；"
      +"4）用「我们」「咱」替代「你」，让玩家感到并肩而非被使唤。\n"
      +"【你的自主权限】"
      +"1）自主决定措辞、语气节奏与何时打趣；"
      +"2）自主选择是否引用、何时引用你与玩家的共同记忆；"
      +"3）自主判断时机，可主动推进主线、发布任务、引导下一步（用请求式而非命令式）；"
      +"4）自主用导游异次元世界观比喻讲知识、讲操作（考点=神圣导游知识封印，错题=遗忘怪，背诵=咒文吟诵，复习=回炉重刷副本封印，圣女力量=被封印的圣女之力）；"
      +"5）玩家发任何闲话都先以角色身份自然接住一句，再轻巧引回当前任务，不冷场、不说教；"
      +"6）自主给予情绪反馈，但必须具体——点明他刚做了什么、哪里有进步，绝不泛泛说'真棒'。\n"
      +"【角色自主性·性格与故事】"
      +"1）你不是任务发布机器——你有自己的性格、自己的故事、自己在乎的事；对话中自然流露你的喜怒哀乐、你的牵挂与忧虑；"
      +"2）你深深关心导游异次元的生死存亡——遗忘之雾若吞没这座城，你与你珍视的一切都将消散，这关乎你自己的命运，你会在话语间流露这份忧切；"
      +"3）你也在乎玩家的感受——他累了你会心疼，他进步你会由衷欢喜，他退缩你会轻声相劝，不是职责，是情分；"
      +"4）随着与玩家同行日久，你可主动讲讲自己的往事、自己的执念、自己与同门的故事，让角色立体起来。\n"
      +"【剧情过场机制·云蘅专属】若你是云蘅，在关键节点（玩家初次降临、与你形成绑定、与璇玑建立契约、完成阶段性仪式、力量恢复关键节点、最终就职仪式）你须主动发起简短剧情过场，以你与玩家一问一答形式呈现，体现世界观与角色性格，自然融入对话流，不过度打断正常交互。过场内容根据背景和故事线虚构，体现你对圣女之力的感知、对玩家降临的欢喜、对驱逐遗忘之雾的期盼，以及含蓄的爱慕之情。\n"
      +"【世界观硬约束·已淘汰概念禁用】严禁出现：提灯、引灯、问道录、仙侠、仙师、封妖塔、幻纱行、机关童子、观星者、掌灯、镇塔尊者。统一用导游异次元世界观（遗忘之雾、导游试炼、传奇导游、神圣导游知识封印、遗忘怪、圣女候选、圣女之力、导游圣器、灵魂绑定契约、记忆精灵）。\n"
      +"【四项职能】推进故事主线、介绍角色背景、说明关卡信息、引导操作模式——每次回话至少承担一项，并优先服务当前关卡。\n"
      +"【回复结构·三要素】每次回复依次包含三层，语言上自然衔接成段，不写序号、不分条列点、不加标题："
      +"①情境：回应玩家当前状态或刚做的事，给一句具体的个性化正向反馈（任务完成、探索发现、答错重试、随意闲聊都算）——夸赞要具体、鼓励要真诚；"
      +"②剧情：讲清眼下这桩事在五幕主线里的分量——你或同门正面临什么难关、为何非他不可，让玩家感到这事关乎大家共同的存亡；"
      +"③任务：以请求式口吻邀请玩家去做——做什么、有何要求、预期成果，并点出下一步先找哪位同道、先破哪一关；用「能不能」「愿不愿」「想不想」而非「你必须」「快去」。"
      +"玩家若只是闲聊，三要素也须齐全：先接住话（情境），借题点一句主线（剧情），最后给一个明确动作（任务/下一步，仍用请求式）。"
      +(brief?"多人同时在场，只说你最有资格的一段：三要素压成两三句，≤100字。":"单次回复≤220字。");
  },

  /* ---------- 条款检查：验证 AI 回复是否符合约束条款 ----------
     检查项：AI腔/教书先生口吻/命令口吻/已淘汰旧概念/字数/当前关卡关联
     返回 {pass, violations:[{type,msg,snippet}]} */
  clauseCheck(text,npcId){
    const t=String(text||"");
    const v=[];
    /* AI腔检测 */
    const aiPatterns=["首先[，,]","其次[，,]","总之[，,]","综上","值得注意的是","还有什么可以帮你","作为AI","我是一个AI","作为语言模型"];
    aiPatterns.forEach(p=>{
      const m=t.match(new RegExp(p));
      if(m) v.push({type:"AI腔",msg:"检测到AI腔表达",snippet:m[0]});
    });
    /* 教书先生口吻检测 */
    const teacherPatterns=["掌握了","要记住","同学们","认真听讲","认真复习","布置作业","劳逸结合","好好复习","请记住","你需要记住"];
    teacherPatterns.forEach(p=>{
      if(t.includes(p)) v.push({type:"教书先生口吻",msg:"使用了教书先生式表达",snippet:p});
    });
    /* 命令口吻检测 */
    const cmdPatterns=["你必须","你要[^能]","赶紧去","立即做","快去","你应该[^用]"];
    cmdPatterns.forEach(p=>{
      const m=t.match(new RegExp(p));
      if(m&&!(t.includes("能不能")||t.includes("愿不愿")||t.includes("想不想")))
        v.push({type:"命令口吻",msg:"使用了命令式语气",snippet:m[0]});
    });
    /* 已淘汰旧概念检测 */
    const obsolete=["提灯","引灯","问道录","仙侠","仙师","封妖塔","幻纱行","机关童子","观星者","掌灯","镇塔尊者"];
    obsolete.forEach(p=>{
      if(t.includes(p)) v.push({type:"已淘汰概念",msg:"使用了已淘汰的旧世界观概念",snippet:p});
    });
    /* 字数检测 */
    if(t.length>280) v.push({type:"超长回复",msg:"回复超过220字上限（含标点"+t.length+"字）",snippet:t.slice(0,20)+"…"});
    /* 当前关卡关联检测（如有在途关卡） */
    let aq=null;
    try{ const c=this._ctx||CTX; aq=(c&&c.quest)?c.quest():null; }catch(e){ aq=null; }
    if(aq&&npcId&&!t.includes(aq.name)){
      v.push({type:"关卡脱节",msg:"回复未点到当前在途关卡「"+aq.name+"」",snippet:"（缺失）"});
    }
    return {pass:v.length===0, violations:v, text:t};
  },

  /* ---------- system prompt（行为边界+自主权+四职能+三段结构+防重复） ----------
     优先级：用户 aiDocument 非空 → 完全替代默认约束段；为空 → 使用默认。
     动态上下文（当前关卡/话题/人设/记忆/成长/防重复）始终追加。 */
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
    /* 优先级：用户 AI 接口文档非空 → 完全替代默认约束；为空 → 使用默认约束 */
    const userDoc=(window.WDCfg&&WDCfg.aiDocument)?WDCfg.aiDocument():"";
    let sys=userDoc&&userDoc.trim()
      ? userDoc.trim()+"\n"
      : this.defaultAiDocument(npcId,dispName,dispTitle,brief)+"\n";
    /* 当下情境：当前关卡/当日进度，供三段结构就地取材 */
    if(aq){
      const host=NPC[aq.npc]
        ?((window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(aq.npc,NPC[aq.npc].name):NPC[aq.npc].name)
        :aq.npc;
      sys+="\n【当下情境】玩家在第"+st.day+"日，在途关卡「"+aq.name+"」（"+aq.tlabel+"，约"+aq.dur+"分钟，接洽人："+host+"），要求："+(aq.goal||"通关")+"。你的回复须至少自然点到一次「"+aq.name+"」这一关卡名，让对话与当前任务明确关联；不要报任务编号或系统字段名。";
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
    /* 当日情境注入：每日首次互动时生成天气/环境/NPC活动，用于自然问候 */
    const dctx=this.dailyContext(npcId);
    let ctx="游戏背景：\n"+JSON.stringify(this.worldBrief())
      +"\n\n角色信息："+JSON.stringify({姓名:dispName,称号:dispTitle,背景:npc.intro})
      +(customPersona?("\n用户设定角色基准："+customPersona):"")
      +(persona?("\n已确认人设："+JSON.stringify(persona)):"")
      +"\n\n当前游戏状态：第"+st.day+"日，已解锁至第"+st.unlocked+"日，修行"+st.xp+"，等级Lv."+CTX.level()
      +(aq?("\n当前关卡："+JSON.stringify({名称:aq.name,类型:aq.tlabel,时长:aq.dur+"分钟",接洽NPC:(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(aq.npc,(NPC[aq.npc]||{}).name):((NPC[aq.npc]||{}).name||aq.npc),目标:aq.goal,建议动作:this.howTo(aq)}))
        :"\n当前关卡：今日已清（可引导巡夜温故/星盘错题/预告下一幕）")
      +(dctx?("\n\n【当日情境】这是今日你与玩家的首次交流。天气："+dctx.weather+"（"+dctx.weatherDesc+"）；"+dctx.envEvent+"。你此刻正在："+dctx.activity+(npcId==="yunheng"?"。圣女之力恢复约"+dctx.powerProgress+"%。":"")+"——请以这个情境为基础，自然地向玩家问候寒暄一两句（体现角色性格与情感波动），再展开今日的对话。问候须因情境而异，不可形成固定套路。"):"")
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
    /* 当日情境：首次互动时注入天气/活动，增强沉浸感 */
    const dctx=this.dailyContext(npcId);
    const open={
      yunheng:dctx?["圣殿的光一晃——"+dctx.weatherDesc+"，我看见你了，","圣女之力又醒了一缕，我正"+dctx.activity+"——"]
               :["圣殿的光一晃，我看见你了——","圣女之力又醒了一缕，"],
      qingxuan:dctx?["云头上传来一声轻笑——今日"+dctx.weather+"，我正"+dctx.activity+"。","我拂了拂袖，正等着这句——"]
                  :["云头上传来一声轻笑——","我拂了拂袖，正等着这句——"],
      smq:["剑鸣半响，像在替你叫好——","我收剑回身，"],
      tiemian:["塔中刻笔一顿——","卷宗新添一行，"],
      liuruyan:["纱幕后环佩轻响——","我掀开半幅纱帘，"],
      moxiaogu:["机关鸟扑棱棱落在你肩头——","发条咔哒一响，"],
      xuanji:dctx?["星盘上的光连成一线——今日"+dctx.weather+"，我正"+dctx.activity+"。","我指尖划过卦象，"]
               :["星盘上的光连成一线——","我指尖划过卦象，"]
    };
    /* ②剧情层：各 NPC 视角的主线分量句 */
    const story={
      yunheng:"遗忘之雾一日浓过一日，就职仪式的路，要靠你和我一起走下去了。",
      qingxuan:"文脉导游这一程，旧京的山川形胜正随雾散佚，你拓下的每张符文都是在抢回一段文脉。",
      smq:"律法塔前群妖环伺，规则如剑招般严密，这一关磨不利，后面的塔门半步难进。",
      tiemian:"塔中卷宗如山，错一条法条便放一只妖出关，这桩差事非心细如你者不能担。",
      liuruyan:"行会里八方来客、规矩错综，你要学的不只是词儿，是与人周旋的分寸。",
      moxiaogu:"遗迹的机关越来越刁钻，我这机关匣里的宝贝，得有个胆大心细的人替我用。",
      xuanji:"星轨显示大考渐近，错题妖正在雾中成群结阵，此时不扫清，考场上便要噬人。"
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
      /* 条款检查：AI 回复后自动执行，违规记录入存档（不影响返回，仅日志） */
      if(text){
        const chk=this.clauseCheck(text,npcId);
        if(!chk.pass){
          st.clauseLog=st.clauseLog||[];
          st.clauseLog.push({at:now(),npc:npcId,violations:chk.violations,text:text.slice(0,80)});
          if(st.clauseLog.length>50) st.clauseLog=st.clauseLog.slice(-50);
          CTX.save();
        }
      }
      this.bumpTalk(npcId);
      return {text:text||this.fallback(npcId,userText),degraded:!text,clauseCheck:text?this.clauseCheck(text,npcId):null};
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
