/* ==================== 问道之旅 · 对话模块 v2（装配器重构版） ====================
   window.WDChat —— 对话生成 / NPC 角色成长 / 世界观装配 / 降级兜底
   v2 变更（依据 2026-09-14 检测报告 R1/R2/R4）：
     · 消息布局缓存友好：[system 稳定前缀] + [对话历史 turns] + [user 当前输入 + 动态尾巴]
       稳定前缀逐字节不变（世界观+约束+角色卡），命中 DeepSeek 上下文缓存（约 1/10 计价）
     · 约束单源：worldBrief 只保留世界观事实；行为约束唯一来源 = defaultAiDocument
     · 历史原生多轮：不再拼字符串，messages 数组原生传递（120 字/条 × 8 条）
     · 滚动摘要记忆：每 NPC summary(≤300字) + summaryUpTo 指针，>10 条后台压缩（R2.4）
     · 参数分档 / 流式 / 重试：由 index.html 的 dsChat v2 承担，本模块经 CTX.dsChat 调用
     · 降级引擎 v2：意图分类 × NPC 个性 × 情境 三维组合；情绪输入强制共情优先（R4.1）
     · clauseCheck 闭环：P0 违规净化 + 单次重试；P1 前端替换表；P2 截断（R4.2）
   低耦合：不直接引用页面全局（v1 遗留的 st 引用已全部改经 CTX）；依赖经 init(ctx) 注入：
     CTX = { D, NPC, REGISTRY?, getSt, save, dsChat, dsReady, level, actTopic?, quest? }
   ========================================================================== */
(function(){
"use strict";
let CTX=null;

/* ---------- 工具 ---------- */
function hash(s){ let h=0; for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))>>>0;} return h; }
function now(){ return new Date().toISOString(); }
function pick(arr,seed){ return arr[Math.abs(seed||Date.now())%arr.length]; }

/* ---------- 意图分类（降级引擎与共情优先用，R4.1） ---------- */
function classifyIntent(text){
  const t=String(text||"");
  if(/累|疲|乏|困|睡|歇|撑不住|不想学|想放弃|烦|焦虑|难受|emo|崩/i.test(t)) return "emotion-tired";
  if(/难过|伤心|失落|失败|挫败|考不过|没信心|怕|担心/.test(t)) return "emotion-down";
  if(/谢谢|感谢|太好了|开心|高兴|爽|通关|过了|成了|牛/.test(t)) return "emotion-joy";
  if(/怎么|如何|什么|为什么|哪|？|\?|吗$|呢$/.test(t)) return "question";
  if(/嗨|哈|聊|天气|无聊|随便|闲/.test(t)) return "chitchat";
  return "task";
}

const WDChat={

  /* 依赖注入（幂等，可重复初始化） */
  init(ctx){ CTX=ctx; this._ctx=ctx; },

  /* ---------- 世界观事实文件（v2：只保留事实，约束已并入 defaultAiDocument，WZ-005） ---------- */
  worldBrief(){
    /* 用户自定义游戏背景信息优先（配置中心编辑）——用户覆写时 AI 以此为唯一世界观事实源 */
    const custom=(window.WDCfg&&WDCfg.customWorldBrief)?WDCfg.customWorldBrief():null;
    if(custom&&custom.trim()) return custom.trim();
    if(!CTX||!CTX.D) return "（游戏背景信息尚未加载）";
    const {D}=CTX;
    /* v2：NPC 基础信息只保留当前会话相关者（调用方传入 focusNpcId 时进一步裁剪，WZ-002） */
    const npcList=D.npcs.map(n=>{
      const name=(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(n.id,n.name):n.name;
      const title=(window.WDCfg&&WDCfg.npcTitle)?WDCfg.npcTitle(n.id,n.title):(n.title||"");
      const persona=(window.WDCfg&&WDCfg.npcPersona)?WDCfg.npcPersona(n.id):"";
      const desc=persona||n.intro||"";
      return {id:n.id,name,title,desc};
    });
    const charList=npcList.map(n=>n.name+"（"+(n.title||"")+"，"+n.desc+"）").join("｜");
    return {
      游戏名:"问道之旅 · 四十五日（北京导游资格考试游戏化复习）",
      游戏目的:"玩家意外降临导游次元，与圣女候选云蘅及记忆精灵璇玑形成绑定。玩家须完成神圣导游就职仪式的各个阶段，助云蘅逐步恢复被封印的圣女之力，重新驾驭导游圣器以驱逐遗忘之雾。做任务就是就职仪式的修行：研习新考点=激活神圣导游知识封印，复习=重封苏醒的旧妖，题组试炼=斩谜题妖，英文背诵=咒文吟诵，大试炼=守城之战，巡夜=夜巡驱雾。",
      世界观:"玩家意外降临导游次元——一个正在被遗忘之雾吞噬的娘化世界（所有居民皆为女性，唯独玩家是男性外来者）。次元中最后一个未被侵蚀的城市是北京，玩家只能在此完成导游就职仪式。圣女候选云蘅在神圣导游就职仪式中因遗忘之雾侵袭及玩家意外降临导致仪式中断，与玩家形成绑定关系。记忆精灵璇玑（魔法生物，可与神圣导游签订灵魂绑定契约）在玩家降临过程中意外与其建立契约，负责帮助玩家记忆导游知识。随着玩家完成就职仪式各阶段，云蘅逐步恢复被封印的圣女之力；其他传奇导游亦通过与玩家互动逐步松动自身封印，重新激活神圣导游之力。最终玩家就职成功，云蘅完全恢复力量并使用圣器驱逐遗忘之雾。",
      角色设定:charList+"。整个次元为娘化次元，仅玩家为男性。"+"（注：以上角色名字/称号/人设均以玩家配置中心的自定义为准，玩家可随时编辑覆写）",
      隐喻系统:"每个复习任务都是一个游戏化关卡：新学任务=秘境探幽/残卷修复/重激活神圣导游知识封印；复习任务=封印重临（遗忘之雾侵袭神圣导游知识封印，生成遗忘怪，需要玩家反复击杀）；题组练习=谜题斩妖（联手布置的模拟大阵，生成精英级遗忘怪）；英文背诵=咒文吟诵（激活神圣导游知识封印的核心仪轨）；大试炼=攻城之战（遗忘之雾催生怪物攻城）；线索卡=符文拓印；行囊准备=法器整备；巡夜记忆卡=夜巡驱雾。难度层级：common=雾卒、fine=妖将、epic=妖王。",
      剧情节点:"关键剧情过场节点：①玩家初次降临 ②与云蘅形成绑定 ③与璇玑建立灵魂契约 ④完成阶段性仪式（每幕BOSS） ⑤圣女力量恢复关键节点 ⑥最终就职仪式。过场由AI根据背景和故事线虚构，呈现为云蘅与玩家一问一答形式，简短沉浸，自然融入对话流，不过度打断正常交互。",
      游戏机制:["读卷：翻页研习考点，关键词高亮、记忆锚助记","试炼：是非+填空，答错录入星盘错题","吟游：英文导游词朗读、录音、打字复述自评","巡夜：按1/3/7/15日间隔重刷记忆卡","五幕四十五日任务链，主线环环前置解锁","修行=经验值升级，铜钱可在集市兑换","圣女力量恢复进度略超前于玩家游戏进展"],
      NPC基础信息:npcList.map(n=>({id:n.id,姓名:n.name,称号:n.title,背景:n.desc}))
    };
  },

  /* ---------- 网络检索（v2：按需触发，WZ-015） ---------- */
  async webSearch(query){
    try{
      const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),4000);
      const r=await fetch("https://zh.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=3&srsearch="+encodeURIComponent(query),{signal:ctl.signal});
      clearTimeout(t);
      const j=await r.json();
      return (j.query&&j.query.search||[]).map(x=>("【"+x.title+"】"+x.snippet.replace(/<[^>]+>/g,"").slice(0,110))).join("\n")||null;
    }catch(e){ return null; }
  },
  /* 检索是否应触发：仅当本地资料库零命中 且 消息含疑问特征（WZ-015） */
  shouldSearch(userText){
    const kw=userText.replace(/@[^\s]+/g,"").trim().toLowerCase();
    if(!kw) return false;
    if(!/怎么|如何|什么|为什么|哪|是谁|何时|几|？|\?/.test(kw)) return false;
    const kb=this.knowledge(userText);
    return kb&&kb.startsWith("（"); /* 零命中时 knowledge 返回（无…/未找到…）开头 */
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

  /* ---------- 每日情境生成（v2：activityPool 每池 ≥12 条 + 同日持续注入低强度版，WZ-022） ---------- */
  generateDailyContext(npcId){
    if(!CTX||!CTX.D) return null;
    const st=CTX.getSt();
    const day=st.day||1;
    const seed=hash(npcId+":"+day);
    const weatherPool=[
      {w:"晴朗",desc:"北京上空难得无云，阳光从遗忘之雾的边缘漏下来"},
      {w:"薄雾",desc:"遗忘之雾在城市边缘徘徊，但城内尚且安宁"},
      {w:"浓雾",desc:"遗忘之雾今日格外浓重，城外已不见远山"},
      {w:"微风",desc:"一阵从西山方向吹来的风，试图驱散城墙外的薄雾"},
      {w:"阴云",desc:"天空被低沉的云层压住，雾气在云下盘旋"},
      {w:"微雨",desc:"细雨落在胡同的青石板上，雾气被雨水压低了几分"}
    ];
    /* v2：每 NPC 活动池扩容至 12+（原 4-5 条，WZ-022） */
    const activityPool={
      yunheng:[
        "在导游圣殿前练习圣器操控，圣女之力刚醒一缕",
        "凝望城墙外的遗忘之雾，眉头微蹙",
        "整理就职仪式被中断时散落的圣仪残件",
        "对着圣器低声吟诵，试图唤醒更多力量",
        "站在金榜台的方向远眺，像是在丈量还剩多少路",
        "擦拭圣器上的雾痕，指尖有微光流转",
        "和守夜人低声交谈，询问城外的雾情",
        "在仪式阵旁静坐，感应封印的松动",
        "翻阅历代圣女的仪式手札，若有所思",
        "替受伤的守军诵了一段安神的咒",
        "把一缕圣力渡入城门的封印石中",
        "望着你曾走过的方向，悄悄笑了一下"
      ],
      qingxuan:[
        "在文脉阁中翻阅被雾侵蚀的残卷",
        "用朱笔勾勒北京山川形胜的脉络图",
        "整理文脉导游代代相传的讲解心得",
        "对着窗外薄雾，默念一段旧京典故",
        "把新拓的符文按脉络归档上架",
        "教小辈辨认残卷上的古字",
        "在长案上铺开五幕主线的卷轴逐一核对",
        "沏了一壶茶，正要开卷细读",
        "用镇纸压住被风掀起的书页",
        "抄录一段文脉口诀，笔锋沉稳",
        "对着烛火修补虫蛀的书脊",
        "望着文脉阁的梁柱，轻声数着还差几卷"
      ],
      smq:[
        "提剑在胡同口练一套山河剑法",
        "倚在城墙上，对着远山吟了一首旧诗",
        "擦拭剑身，剑上映出雾的影子",
        "将一壶酒别在腰间，准备下一程山河游学",
        "在城墙上用剑尖画北京的山势走向",
        "和守军比划了几招，点到即止",
        "远眺西山，估量着雾又退了几分",
        "把登山用的绳索重新盘好",
        "替菜市口的老丈挑了担水，顺路而已",
        "在酒旗下来去，听旅人讲山那边的事",
        "用剑鞘敲了敲城砖，像在叩山门",
        "整理行囊里的地图，把折角抚平"
      ],
      tiemian:[
        "在律法塔中重新排布一百零八道法条剑阵",
        "翻阅卷宗，将错一条法条便放出的妖记在册",
        "站在塔门前，逐一核对法条的封印",
        "用刻笔在卷宗上新添一行批注，墨迹未干",
        "闭目默诵法条，指间掐着剑诀",
        "提审一只新捕获的遗忘怪，问出漏洞所在",
        "把卷宗按轻重缓急重排了次序",
        "擦拭塔中悬挂的戒尺",
        "与前来问询的导游核对新颁的政策",
        "在塔窗前立了很久，看着雾线出神",
        "替新手导游划了三处易错法条",
        "合上卷宗，难得地松了松肩"
      ],
      liuruyan:[
        "在行会纱幕后排演带团的话术",
        "整理八方来客的接待规矩",
        "擦拭行囊中的法器，为下一程整备",
        "掀开半幅纱帘，端详来客名单",
        "教新来的侍者如何奉茶不失礼",
        "对着铜镜练习三句不同口音的问候",
        "把客人留下的谢帖一一收好",
        "核算这一季行会的账目",
        "在纱幕间穿行，检查每一处帷幔",
        "替远客修书一封，报平安",
        "闻香识人，猜今天会来怎样的客人",
        "倚着廊柱，听市集的喧声入定"
      ],
      moxiaogu:[
        "机关鸟在肩头扑棱，她正清点知识封印的数目",
        "在古迹中调试新铸的律法锁",
        "纸剪的手指翻动遗迹星符，嘴里念念有词",
        "发条咔哒一响，她正给机关匣上弦",
        "趴在故宫模型上找一条新的中轴线",
        "用小刷子扫去封印上的积灰",
        "给机关鸟换了一枚新齿轮",
        "对着年表数日子，掰着纸手指",
        "把拓印的纹样拼成一幅星图",
        "偷吃了一颗蜜饯，被机关鸟看见了",
        "在斗拱模型上挂了一盏小灯",
        "数着四百余枚封印，数到一半睡着了一瞬"
      ],
      xuanji:[
        "星盘上的光点连成线，她正照见玩家尚未收服的错题妖",
        "整理记忆图书馆中与玩家灵魂绑定后共享的碎片",
        "指尖划过卦象，推算下一幕试炼的时机",
        "将一枚新收的错题妖封入星盘，光点微闪",
        "翻检你昨夜梦里的只言片语",
        "对着星轨图校准今夜的巡夜路线",
        "把两枚旧错题妖并排放着，比较习性",
        "轻轻拨动星盘，听它报出你的复习间隔",
        "在记忆书页间夹了一枚新的书签",
        "掐指算你与某道法条题的孽缘",
        "把一段沉睡的记忆唤醒又哄睡",
        "望着星盘出神，像在等一颗星亮起"
      ]
    };
    const wp=weatherPool[seed%weatherPool.length];
    const pool=activityPool[npcId]||activityPool.qingxuan;
    const ap=pool[seed%pool.length];
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

  /* 当日情境（v2：首次返回完整情境并标记；同日后续返回低强度续片，WZ-022） */
  dailyContext(npcId){
    const st=CTX.getSt();
    const day=st.day||1;
    st.dailyCtx=st.dailyCtx||{};
    const key=npcId+"@D"+day;
    if(st.dailyCtx[key]){
      /* v2：同日后续互动——低强度续片（环境一句话），不再完全静默 */
      const ctx=st.dailyCtx[key];
      return { lite:true, weather:ctx.weather, activity:ctx.activity };
    }
    const ctx=this.generateDailyContext(npcId);
    st.dailyCtx[key]=ctx; CTX.save();
    return ctx;
  },

  /* ---------- 历史与摘要（R2.4：120 字×8 条 + 滚动摘要） ---------- */
  historyOf(npcId,limit){
    const st=CTX.getSt();
    const arr=(st.dialogue||[]).filter(m=>m&&(m.role==="npc"&&m.npc===npcId||m.role==="player"));
    return arr.slice(-(limit||8)).map(m=>({role:m.role,npc:m.npc,text:(m.text||"").slice(0,120),at:m.at}));
  },
  /* 群聊互文（R3.1 数据源）：最近 N 条全量对话（含其他 NPC 发言） */
  recentScene(limit){
    const st=CTX.getSt();
    return (st.dialogue||[]).slice(-(limit||10)).map(m=>m&&({
      who:m.role==="player"?"玩家":(m.role==="npc"?(CTX.NPC[m.npc]?((window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(m.npc,CTX.NPC[m.npc].name):CTX.NPC[m.npc].name):"NPC"):"系统"),
      text:(m.text||"").slice(0,120), role:m.role, npc:m.npc
    }));
  },
  summaryOf(npcId){
    const st=CTX.getSt();
    st.npcSummary=st.npcSummary||{};
    return st.npcSummary[npcId]||null;
  },
  /* 滚动摘要：对话超过阈值条时后台压缩（失败静默，下轮再补，WZ-003） */
  maybeSummarize(npcId){
    const st=CTX.getSt();
    if(!CTX.dsReady()) return;
    st.npcSummary=st.npcSummary||{};
    const s=st.npcSummary[npcId]=st.npcSummary[npcId]||{text:"",upTo:0,at:""};
    const arr=(st.dialogue||[]).filter(m=>m&&(m.role==="npc"&&m.npc===npcId||m.role==="player"));
    const unsummarized=arr.length-s.upTo;
    if(unsummarized<10) return;
    const tail=arr.slice(s.upTo).map(m=>(m.role==="player"?"玩家：":"NPC：")+String(m.text||"").slice(0,100)).join("\n");
    const sys="你是游戏对话摘要器。把旧摘要与新增对话合并压缩为 ≤300 字的角色互动记忆摘要：只保留确定发生的事实（玩家做了什么、答应了什么、聊过什么话题、情绪状态），不要推测，不要华丽辞藻。只输出摘要正文。";
    const user="旧摘要："+(s.text||"（无）")+"\n\n新增对话：\n"+tail+"\n\n请输出合并后的新摘要（≤300字）。";
    CTX.dsChat([{role:"system",content:sys},{role:"user",content:user}],{kind:"summary"}).then(t=>{
      if(t&&String(t).trim()){
        s.text=String(t).trim().slice(0,600); s.upTo=arr.length; s.at=now(); CTX.save();
      }
    }).catch(()=>{});
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

  /* 对话计数：每 5 次互动自动推演一次成长（v2：失败退避 24h，WZ-016） */
  bumpTalk(npcId){
    const g=this.growthOf(npcId);
    g.talks=(g.talks||0)+1; g.lastAt=now();
    CTX.save();
    if(g.talks%5===0){ this.evolve(npcId,false); }
  },

  /* ---------- NPC 角色成长推演（v2：失败退避 + 通过 CTX 读写，WZ-016/WZ-020） ---------- */
  async evolve(npcId,manual){
    if(!CTX.dsReady()) return null;
    const {NPC}=CTX, npc=NPC[npcId]; if(!npc) return null;
    const st=CTX.getSt();
    /* v2：失败退避——连续 3 次失败后暂停 24h（WZ-016） */
    st.evolveState=st.evolveState||{};
    const es=st.evolveState[npcId]=st.evolveState[npcId]||{fails:0,pauseUntil:0};
    if(Date.now()<es.pauseUntil) return null;
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
      const raw=await CTX.dsChat([{role:"system",content:sys},{role:"user",content:user}],{kind:"evolve"});
      let o;
      try{ o=JSON.parse(raw.replace(/^```json|```$/g,"").trim()); }
      catch(e){ const m=raw.match(/\{[\s\S]*\}/); if(!m) throw e; o=JSON.parse(m[0]); }
      if(Array.isArray(o.traits)&&o.traits.length) g.traits=o.traits.slice(0,4).map(t=>String(t).slice(0,14));
      if(o.speech) g.speech=String(o.speech).slice(0,60);
      if(o.shift) g.shift=String(o.shift).slice(0,60);
      if(o.story) g.story.push({at:now(),ev:String(o.story).slice(0,100)});
      if(g.story.length>12) g.story=g.story.slice(-12);
      g.evolved=now(); g.lv=(g.lv||0)+1;
      es.fails=0; es.pauseUntil=0;
      CTX.save();
      return o;
    }catch(e){
      es.fails=(es.fails||0)+1;
      if(es.fails>=3){ es.pauseUntil=Date.now()+864e5; es.fails=0; }
      CTX.save();
      return null;
    }
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

  /* ---------- 系统默认 AI 接口文档（v2：唯一约束源，含 post-history 禁则，WZ-005/R1.1d）
     用户可通过 WDCfg.setAiDocument() 完全覆写。 */
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
      +"【四项职能】推进故事主线、介绍角色背景、说明关卡信息、引导操作模式——每次回话至少承担一项，并优先服务当前关卡。\n"
      +"【回复结构·三要素】每次回复依次包含三层，语言上自然衔接成段，不写序号、不分条列点、不加标题："
      +"①情境：回应玩家当前状态或刚做的事，给一句具体的个性化正向反馈（任务完成、探索发现、答错重试、随意闲聊都算）——夸赞要具体、鼓励要真诚；"
      +"②剧情：讲清眼下这桩事在五幕主线里的分量——你或同门正面临什么难关、为何非他不可，让玩家感到这事关乎大家共同的存亡；"
      +"③任务：以请求式口吻邀请玩家去做——做什么、有何要求、预期成果，并点出下一步先找哪位同道、先破哪一关；用「能不能」「愿不愿」「想不想」而非「你必须」「快去」。"
      +"玩家若只是闲聊或倾诉，三要素灵活取舍：先接住话（情境），剧情与任务可省或后置——玩家的情绪永远优先于任务发布。"
      +(brief?"多人同时在场，只说你最有资格的一段：三要素压成两三句，≤100字。":"单次回复≤220字。");
  },

  /* ---------- post-history 禁则（v2：独立段，置于对话历史之后，R1.1d/WZ-005） ---------- */
  postHistoryRules(npcId){
    const {NPC}=CTX;
    const mine=this.recentReplies(npcId,5);
    let s="【硬禁则·优先级最高】严禁AI腔（首先/其次/总之/综上/值得注意的是）；严禁教书先生口吻；严禁命令句（你必须/快去）；严禁自曝AI身份。"
      +"已淘汰旧概念禁用：提灯、引灯、问道录、仙侠、仙师、封妖塔、幻纱行、机关童子、观星者、掌灯、镇塔尊者。"
      +"若玩家显式自定义了世界观（见世界观文件），以自定义版为准，旧概念禁令对其豁免。";
    /* v2：防重复护收束（WZ-027）：禁复用开头与结尾句式 */
    if(mine.length){
      s+="\n【防重复·硬约束】以下是你近期的原话："+mine.map((t,i)=>"〔"+(i+1)+"〕"+t).join("")
        +"——禁止复用其中任何句子的开头（前6字）、句式套路与结尾措辞（含「愿不愿/能不能/陪我」类邀约收尾不得连用两次）；必须换一个新角度、新比喻或新切口表达，且本次首字不得与最近一条相同。";
    }
    return s;
  },

  /* ---------- 系统稳定前缀（v2：缓存友好布局，R1.1）
     结构：世界观事实 + 约束文档 + 角色合并卡（全部稳定内容；动态内容移到 user 尾部） */
  systemPrefix(npcId,brief){
    const {NPC}=CTX, npc=NPC[npcId]||NPC.qingxuan;
    const st=CTX.getSt();
    /* 自定义名字/人设（WDCfg 未挂载则用原名） */
    const cfg=window.WDCfg&&window.WDCfg.ready?window.WDCfg.ready():null;
    const dispName=(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(npcId,npc.name):npc.name;
    const dispTitle=(window.WDCfg&&WDCfg.npcTitle)?WDCfg.npcTitle(npcId,npc.title):(npc.title||"");
    const persona=(window.WDCfg&&WDCfg.npcPersona)?WDCfg.npcPersona(npcId):"";
    /* 优先级：用户 AI 接口文档非空 → 完全替代默认约束；为空 → 使用默认 */
    const userDoc=(window.WDCfg&&WDCfg.aiDocument)?WDCfg.aiDocument():"";
    const doc=userDoc&&userDoc.trim()
      ? userDoc.trim()
      : this.defaultAiDocument(npcId,dispName,dispTitle,brief);
    const wb=this.worldBrief();
    const wbStr=(typeof wb==="string")?wb:JSON.stringify(wb);
    /* v2：人设三层合并（WZ-006）：用户硬约束 > AI 卡 > 注册表基线，冲突以用户描述为准 */
    const card=st.personas[npcId]&&st.personas[npcId].card;
    let personaBlock="";
    if(persona&&card){
      personaBlock="\n\n【角色设定·合并结果】用户基准（硬约束，优先）："+persona
        +"\n角色卡（演绎层，冲突字段以用户基准为准）：性格 "+(Array.isArray(card.personality)?card.personality.join("、"):String(card.personality||""))
        +"；风格 "+String(card.style||"")+"；身份 "+String(card.identity||"");
    } else if(persona){
      personaBlock="\n\n【用户设定的角色基准·硬约束】"+persona+"——你的言行须贴合此描述，作为角色塑造的第一参考。";
    } else if(card){
      personaBlock="\n\n【已确认人设】"+JSON.stringify(card);
    }
    const g=this.growthOf(npcId);
    let growthBlock="";
    if(g&&(g.traits&&g.traits.length||g.speech||g.shift)){
      growthBlock="\n\n角色当前成长状态（保持原人设基调下自然体现，不刻意宣告变化）："
        +(g.traits&&g.traits.length?"性格特质："+g.traits.join("、")+"；":"")
        +(g.speech?"语言演进："+g.speech+"；":"")
        +(g.shift?"行为倾向："+g.shift:"");
    }
    if(g&&g.story&&g.story.length){
      growthBlock+="\n角色近期故事线："+g.story.slice(-2).map(s=>s.ev).join("；");
    }
    return "【世界观事实文件】\n"+wbStr
      +"\n\n【行为约束】\n"+doc
      +personaBlock+growthBlock;
  },

  /* ---------- sysPrompt 兼容层（v1 接口保留；v2 内部改为 稳定前缀 + 动态尾巴 两段） ---------- */
  sysPrompt(npcId,brief){
    const st=CTX.getSt();
    const aq=CTX.quest&&CTX.quest();
    const cfg=window.WDCfg&&window.WDCfg.ready?window.WDCfg.ready():null;
    let sys=this.systemPrefix(npcId,brief);
    /* 当下情境（动态尾巴——缓存代价区） */
    if(aq){
      const host=CTX.NPC[aq.npc]
        ?((window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(aq.npc,CTX.NPC[aq.npc].name):CTX.NPC[aq.npc].name)
        :aq.npc;
      /* v2：关卡名改为软偏好（WZ-014）：自然提及时关联即可，不再硬性要求点名 */
      sys+="\n\n【当下情境】玩家在第"+st.day+"日，在途关卡「"+aq.name+"」（"+aq.tlabel+"，约"+aq.dur+"分钟，接洽人："+host+"），要求："+(aq.goal||"通关")+"。若话题与任务相关，可自然点到这一关；闲聊时不必强行拉回。";
    }else{
      sys+="\n\n【当下情境】玩家在第"+st.day+"日，今日关卡已清——可引导其巡夜温故、上星盘清错题，或预告下一幕。";
    }
    const topic=CTX.actTopic&&CTX.actTopic(npcId);
    if(topic) sys+="\n本章（当前幕）你正与玩家同行的话题：「"+topic+"」——你的话可自然贴着它。";
    /* v2：空配置不再注入空段（WZ-029） */
    if(cfg){
      const parts=[];
      if(cfg.address) parts.push("你须称呼玩家为「"+cfg.address+"」");
      if(cfg.selfName) parts.push("玩家自称「"+cfg.selfName+"」");
      const st2=cfg.style||{};
      if(st2.tone) parts.push("语气："+(st2.tone==="formal"?"正式恭敬":"随意亲近"));
      if(st2.humor) parts.push("风格："+(st2.humor==="humor"?"幽默诙谐":"严肃凝练"));
      if(st2.depth) parts.push("深度："+(st2.depth==="deep"?"进阶（可谈原理与延伸）":"基础（只讲结论与口诀）"));
      if(parts.length) sys+="\n【对话策略】"+parts.join("；")+"。";
    }
    /* NPC 记忆画像 + 滚动摘要（R2.4） */
    const mem=window.WDMem&&window.WDMem.digest?window.WDMem.digest(npcId):null;
    if(mem) sys+="\n【你与这位玩家的记忆】"+mem+"（情绪反馈须从中取具体事实，自然引用，不要罗列数据）";
    const sum=this.summaryOf(npcId);
    if(sum&&sum.text) sys+="\n【你们的互动经历（摘要）】"+sum.text;
    return sys;
  },

  /* ---------- 上下文组装（v2：作为 user 侧动态内容，置于历史之后的尾消息） ---------- */
  buildContext(npcId,userText,web){
    const {NPC}=CTX, npc=NPC[npcId]||NPC.qingxuan;
    const st=CTX.getSt();
    const aq=CTX.quest&&CTX.quest();
    const dctx=this.dailyContext(npcId);
    let ctx=""
      +"\n【当前游戏状态】第"+st.day+"日，已解锁至第"+st.unlocked+"日，修行"+st.xp+"，等级Lv."+CTX.level()
      +(aq?("\n【当前关卡】"+aq.name+"（"+aq.tlabel+"，约"+aq.dur+"分钟）——目标："+(aq.goal||"通关")+"；建议动作："+this.howTo(aq))
        :"\n【当前关卡】今日已清（可引导巡夜温故/星盘错题/预告下一幕）");
    /* 当日情境（v2：同日后续为低强度续片） */
    if(dctx){
      if(dctx.lite){
        ctx+="\n【当下】（"+dctx.weather+"，"+dctx.activity+"——延续这个氛围即可，不必重新问候）";
      }else{
        ctx+="\n【当日情境】今日天气："+dctx.weather+"（"+dctx.weatherDesc+"）；"+dctx.envEvent+"。你此刻正在："+dctx.activity+(npcId==="yunheng"?"。圣女之力恢复约"+dctx.powerProgress+"%。":"")+"——请以这个情境为基础自然开场，问候须因情境而异，不可形成固定套路。";
      }
    }
    ctx+="\n【游戏资料库（本地优先，与检索冲突时以此为准）】"+this.knowledge(userText);
    if(web) ctx+="\n【网络检索补充（供参考，不确定可不采用）】\n"+web;
    ctx+="\n\n玩家说："+userText;
    return ctx;
  },

  /* ---------- 降级话术 v2（R4.1：意图 × 个性 × 情境 组合引擎） ---------- */
  fallback(npcId,userText){
    const {NPC}=CTX;
    const npc=NPC[npcId]||NPC.qingxuan;
    const aq=CTX.quest&&CTX.quest();
    const st=CTX.getSt();
    const intent=classifyIntent(userText);
    const dctx=this.dailyContext(npcId);
    /* 个性开口池（每 NPC 4 变体 × 意图无关），替代 v1 的 2 变体 */
    const open={
      yunheng:["圣殿的光一晃——","圣女之力又醒了一缕，","仪式阵的微光映在墙上，","远处钟声落定时，"],
      qingxuan:["云头上传来一声轻笑——","我拂了拂袖，","文脉阁的烛火跳了一下，","残卷合上的轻响里，"],
      smq:["剑鸣半响，像在替你叫好——","我收剑回身，","酒香混着风声过来，","城墙的风掀起衣角，"],
      tiemian:["塔中刻笔一顿——","卷宗新添一行，","法条剑阵的光微微一转，","戒尺轻叩案面，"],
      liuruyan:["纱幕后环佩轻响——","我掀开半幅纱帘，","茶烟袅袅升起时，","廊下的灯笼晃了晃，"],
      moxiaogu:["机关鸟扑棱棱落在你肩头——","发条咔哒一响，","星符哗啦翻过一页，","小算签拨得飞快，"],
      xuanji:["星盘上的光连成一线——","我指尖划过卦象，","记忆书页自行翻动，","星轨图上一点微光，"]
    };
    /* 情境句（v2：拼接天气/活动，替代固定开场） */
    const ctxBit=dctx?(dctx.lite?("（"+dctx.weather+"）"):(dctx.weatherDesc+"。")):"";
    const oa=open[npcId]||open.qingxuan;
    const first=pick(oa,hash(userText)+Math.floor(Date.now()/36e5));
    /* 剧情句池（每 NPC 2 变体，修正 smq 串味：WZ-007） */
    const story={
      yunheng:["遗忘之雾一日浓过一日，就职仪式的路，要靠你和我一起走下去了。","圣器的微光还差几分才稳，但有你同行，我不怕这条路长。"],
      qingxuan:["文脉导游这一程，旧京的山川形胜正随雾散佚，你拓下的每张符文都是在抢回一段文脉。","残卷上的字迹等着被重新点亮，这一程文脉，缺你不可。"],
      smq:["山河的封印散在长城内外，每一处山形水势都是剑谱，这一程要靠你的脚力与眼力。","旧京的山河正被雾一寸寸吞掉轮廓，你多认得一处，它就多留住一分。"],
      tiemian:["塔中卷宗如山，错一条法条便放一只妖出关，这桩差事非心细如你者不能担。","一百零八道法条剑阵还缺几分火候，你每记牢一条，塔门便稳一分。"],
      liuruyan:["行会里八方来客、规矩错综，你要学的不只是词儿，是与人周旋的分寸。","纱幕后是整座城的迎来送往，你的话术稳一分，客人便安心一分。"],
      moxiaogu:["遗迹的机关越来越刁钻，我这机关匣里的宝贝，得有个胆大心细的人替我用。","四百余枚封印还剩许多没点亮，每一枚都是一段快被忘掉的古迹。"],
      xuanji:["星轨显示大考渐近，错题妖正在雾中成群结阵，此时不扫清，考场上便要噬人。","你的错题我都记在星盘上了，趁雾未合拢，一只一只收了它们。"]
    };
    const st2=story[npcId]||story.qingxuan;
    const storyLine=pick(st2,hash(userText));
    /* 任务句 */
    let task;
    if(aq){
      const host=NPC[aq.npc];
      const hn=host?((window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(host.id,host.name):host.name):aq.npc;
      task=(host&&host.id!==npcId?("若你愿意，先去寻"+hn+"接下「"):("这就去会会「"))+aq.name+"」——"+this.howTo(aq)+"，通关可得 "+aq.xp+" 修行、"+aq.coin+" 铜钱。";
    }else{
      task="今日关卡已清，去巡夜重刷几张记忆卡，或上星盘会会错题妖，稳住道行。";
    }
    /* ===== 意图分支（R4.1：情绪输入强制共情优先，任务句延后/省略；WZ-001） ===== */
    const quote=String(userText).replace(/^@[^\s，。,,\s]+\s*/,"").replace(/@[^\s，。,,]+/g,"").replace(/[「」『』]/g,"").trim();
    const qShort=quote.length>16?quote.slice(0,16)+"…":quote;
    if(intent==="emotion-tired"||intent==="emotion-down"){
      /* 共情池（每 NPC 2 变体）——不再引用原话、不发任务 */
      const empathy={
        yunheng:["先歇一歇，雾不会因为你今晚合眼就多进一寸——我在这里守着。","累了就靠一靠，圣仪不急这一时，你的气要紧。"],
        qingxuan:["卷可以明天再读，人不能今天垮掉——喝口热茶再走。","文脉千年都等得起，不差你这一晚的歇息。"],
        smq:["剑客也有收剑入鞘的时候——今日且饮酒，明日再论山河。","走累了就停下，山又跑不了。"],
        tiemian:["卷宗我替你看着，法条不会跑——去休息。","紧绷的弦射不准箭，先松一松。"],
        liuruyan:["客人也体谅向导的辛苦——今日就此收工，如何？","歇好了才接得住远客，你的分寸先留给自己。"],
        moxiaogu:["机关鸟都困得直点头啦——一起打个盹吧！","封印跑不掉的，先给发条上点油（就是你啦）。"],
        xuanji:["星盘今夜很静，适合什么都不做——安心休息。","我把错题妖都看住了，你只管睡。"]
      };
      const ep=empathy[npcId]||empathy.qingxuan;
      return first+ctxBit+pick(ep,hash(userText))+(intent==="emotion-down"?"":" "+(aq?("缓过来若还想走，「"+aq.name+"」随时候着你。"):"缓过来若还想动，巡夜的路也随时开着。"));
    }
    if(intent==="emotion-joy"){
      const cheer={
        yunheng:["这一步我看在眼里——圣器都跟着亮了一分。","有你这样的同行者，是这座城的运气。"],
        qingxuan:["好生锋利的进步——这一笔文脉，是你亲手接上的。","此般悟性，残卷都要为你翻页。"],
        smq:["痛快！这一剑干净利落。","好酒当浮一大白——为你这一手。"],
        tiemian:["记录在册，无一处含糊。","条理清明，塔中卷宗都为之清爽。"],
        liuruyan:["这般周全，客人们要念你的好了。","话到礼到，行会的纱幕后都在传你的名字。"],
        moxiaogu:["咔哒！机关鸟为你转了三圈！","封印亮得像小灯笼，都是你的功劳！"],
        xuanji:["星盘照见了这一刻——我把光点都调亮了一分。","错题妖又少了一只，星轨都顺了。"]
      };
      const cp=cheer[npcId]||cheer.qingxuan;
      return first+ctxBit+pick(cp,hash(userText))+" "+storyLine+(aq?("「"+aq.name+"」的大门还开着，想更进一步随时说。"):"");
    }
    if(intent==="question"){
      /* 提问：知识库命中则给实质回应，否则引导到考点检索 */
      const kb=this.knowledge(userText);
      let extra="";
      if(kb&&!kb.startsWith("（")){
        const lines=kb.split("\n").filter(l=>l.includes("："));
        if(lines.length) extra="库里恰好有一条："+lines[0].split("：").slice(1).join("：").slice(0,60)+"——细讲还要靠你翻卷细读。";
      }
      return first+ctxBit+(qShort?("你问的「"+qShort+"」，"):"")+(extra||"这一问正问在关窍上，卷页里自有答案。")+" "+storyLine+" "+task;
    }
    if(intent==="chitchat"){
      const chat={
        yunheng:["这样的闲谈，比仪式更让人安心。","偶尔说说话也好——守城的日子，不只有关卡。"],
        qingxuan:["闲话也是文脉的一部分，慢慢说。","茶还温着，闲话正好下茶。"],
        smq:["哈哈，山野闲谈，最是自在。","聊天不必带剑——今天只管说笑。"],
        tiemian:["塔中难得有闲话——说吧，我听着。","偶尔放下卷宗，也不错。"],
        liuruyan:["陪客人闲话是我的本行——请。","纱后偷得半日闲，就给你了。"],
        moxiaogu:["闲聊模式启动！机关鸟也爱听八卦！","嘀嘀——记录一条无关紧要但很开心的对话！"],
        xuanji:["星盘也喜欢听闲话——它说这叫'人间烟火'。","不问命数的谈话，最是难得。"]
      };
      const ccp=chat[npcId]||chat.qingxuan;
      return first+ctxBit+pick(ccp,hash(userText))+" "+storyLine+" "+task;
    }
    /* task 意图（默认）：v2 去掉「你这句X我记下了」万能句（WZ-001） */
    return first+ctxBit+(qShort&&quote.length>4?("「"+qShort+"」——好问题。"):"来得好。")+" "+storyLine+" "+task;
  },

  /* ---------- 条款检查 v2（R4.2：分级闭环） ----------
     P0（自曝AI/旧概念）：返回标记触发重试；P1（AI腔/教书腔）：提供替换表；P2：超长 */
  clauseCheck(text,npcId,hasCustomWorld){
    const t=String(text||"");
    const v=[];
    const aiPatterns=["首先[，,]","其次[，,]","总之[，,]","综上","值得注意的是","还有什么可以帮你","作为AI","我是一个AI","作为语言模型"];
    aiPatterns.forEach(p=>{
      const m=t.match(new RegExp(p));
      if(m) v.push({type:"AI腔",msg:"检测到AI腔表达",snippet:m[0]});
    });
    const teacherPatterns=["掌握了","要记住","同学们","认真听讲","认真复习","布置作业","劳逸结合","好好复习","请记住","你需要记住"];
    teacherPatterns.forEach(p=>{
      if(t.includes(p)) v.push({type:"教书先生口吻",msg:"使用了教书先生式表达",snippet:p});
    });
    const cmdPatterns=["你必须","你要[^能]","赶紧去","立即做","快去","你应该[^用]"];
    cmdPatterns.forEach(p=>{
      const m=t.match(new RegExp(p));
      if(m&&!(t.includes("能不能")||t.includes("愿不愿")||t.includes("想不想")))
        v.push({type:"命令口吻",msg:"使用了命令式语气",snippet:m[0]});
    });
    /* v2：旧概念检查——用户显式覆写世界观时豁免（WZ-028） */
    if(!hasCustomWorld){
      const obsolete=["提灯","引灯","问道录","仙侠","仙师","封妖塔","幻纱行","机关童子","观星者","掌灯","镇塔尊者"];
      obsolete.forEach(p=>{
        if(t.includes(p)) v.push({type:"已淘汰概念",msg:"使用了已淘汰的旧世界观概念",snippet:p,level:"P0"});
      });
    }
    if(/我(是|作为一个)(AI|人工智能|程序|模型|机器人)/.test(t)) v.push({type:"自曝AI",msg:"承认了自己是AI",snippet:"",level:"P0"});
    let aq=null;
    try{ aq=(CTX&&CTX.quest)?CTX.quest():null; }catch(e){ aq=null; }
    /* v2：关卡关联降为任务类回复的软检查（WZ-014） */
    if(aq&&npcId&&/任务|关卡|去吧|接下|通关|试炼/.test(t)&&!t.includes(aq.name)){
      v.push({type:"关卡脱节",msg:"任务类回复未点到当前在途关卡「"+aq.name+"」",snippet:"（缺失）",level:"P1"});
    }
    if(t.length>280) v.push({type:"超长回复",msg:"回复超过220字上限（含标点"+t.length+"字）",snippet:t.slice(0,20)+"…",level:"P2"});
    return {pass:v.length===0, violations:v, text:t};
  },

  /* ---------- P1 违规替换表（R4.2b） ---------- */
  sanitize(text){
    let t=String(text||"");
    [["首先，",""],["首先",""],["其次，",""],["其次",""],["总之，",""],["总之",""],["综上，",""],["综上",""],["值得注意的是，",""],["值得注意的是",""],["还有什么可以帮你",""],["同学们","各位道友"],["要记住","不妨记下"],["请记住","不妨记下"],["掌握了","摸清了"],["认真复习","稳步修行"],["劳逸结合","张弛有度"],["好好复习","好好修行"]].forEach(([a,b])=>{
      t=t.split(a).join(b);
    });
    return t.replace(/ {2,}/g," ").trim();
  },

  /* ---------- 对话生成主入口 v2 ----------
     消息布局（R1.1 缓存友好）：
       [0] system  = 稳定前缀（世界观+约束+人设卡）+ 动态尾巴（情境/记忆/摘要）
       [1..n-2] 历史 turns（原生多轮，120 字×8）
       [n-1] user  = 动态上下文 + 玩家输入 + post-history 禁则
     返回 {text, degraded}；永不 reject。 */
  async respond(npcId,userText,brief){
    const {NPC}=CTX, npc=NPC[npcId]||NPC.qingxuan;
    if(!CTX.dsReady()) return {text:this.fallback(npcId,userText),degraded:true};
    try{
      /* v2：按需检索（WZ-015） */
      let web=null;
      if(this.shouldSearch(userText)) web=await this.webSearch(userText.replace(/@[^\s，。,,]+/g,"").trim());
      const sys=this.sysPrompt(npcId,brief);
      const hist=this.historyOf(npcId,8);
      const tail=this.buildContext(npcId,userText,web);
      const dispName=(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(npcId,npc.name):npc.name;
      const hasCustomWorld=!!((window.WDCfg&&WDCfg.customWorldBrief)?WDCfg.customWorldBrief():"").trim();
      /* 历史转原生 turns（role: player→user / npc→assistant） */
      const turns=hist.map(m=>({role:m.role==="player"?"user":"assistant",content:m.text}));
      const messages=[
        {role:"system",content:sys},
        ...turns,
        {role:"user",content:tail+"\n\n以"+dispName+"的身份回应。"+this.postHistoryRules(npcId)}
      ];
      let text=await this._chatWithRetry(npcId,messages);
      text=(text||"").trim();
      /* clauseCheck 闭环（R4.2） */
      if(text){
        const chk=this.clauseCheck(text,npcId,hasCustomWorld);
        if(!chk.pass){
          const p0=chk.violations.some(x=>x.level==="P0");
          const p1=chk.violations.some(x=>!x.level||x.level==="P1");
          if(p0){
            /* P0：重试一次 */
            try{
              const raw2=await this._chatWithRetry(npcId,messages,true);
              const t2=(raw2||"").trim();
              const chk2=t2?this.clauseCheck(t2,npcId,hasCustomWorld):null;
              text=(chk2&&chk2.pass)?t2:(p1?this.sanitize(text):text);
            }catch(e){ text=this.sanitize(text); }
          }else if(p1){
            text=this.sanitize(text);
          }else{
            /* P2 超长：截断到最后一个句号 */
            const cut=text.slice(0,280);
            const lastStop=Math.max(cut.lastIndexOf("。"),cut.lastIndexOf("！"),cut.lastIndexOf("？"));
            text=lastStop>100?cut.slice(0,lastStop+1):cut;
          }
        }
      }
      if(text) text=this.deRepeat(npcId,text);
      /* 违规日志（v2：经 CTX 读写，WZ-020） */
      const st=CTX.getSt();
      if(text){
        const chk=this.clauseCheck(text,npcId,hasCustomWorld);
        if(!chk.pass){
          st.clauseLog=st.clauseLog||[];
          st.clauseLog.push({at:now(),npc:npcId,violations:chk.violations,text:text.slice(0,80)});
          if(st.clauseLog.length>50) st.clauseLog=st.clauseLog.slice(-50);
          CTX.save();
        }
      }
      this.bumpTalk(npcId);
      this.maybeSummarize(npcId); /* R2.4：滚动摘要 */
      return {text:text||this.fallback(npcId,userText),degraded:!text};
    }catch(e){
      return {text:this.fallback(npcId,userText),degraded:true};
    }
  },

  /* 单次调用（带 P0 重试外层封装；retry 标记用于重试请求提高严格性） */
  async _chatWithRetry(npcId,messages,strict){
    if(strict){
      const last=messages[messages.length-1];
      messages=messages.slice(0,-1).concat([{role:"user",content:last.content+"\n（重新生成：上一次回复违反了硬禁则，请严格遵守。）"}]);
    }
    return await CTX.dsChat(messages,{kind:"chat"});
  },

  /* ---------- 输出后去重 v2（WZ-013：开头+结尾双重检查） ---------- */
  deRepeat(npcId,text){
    const mine=this.recentReplies(npcId,3);
    if(!mine.length) return text;
    const last=mine[mine.length-1]||"";
    /* 开头撞车：换切入 */
    if(last&&text.slice(0,4)===last.slice(0,4)){
      const lead=["哎，","且慢——","话说回来，","正是——","你来得巧，"];
      return lead[hash(text)%lead.length]+text;
    }
    /* v2：结尾邀约连用检查（WZ-027）：连续两条都以邀约收尾则改陈述式收尾 */
    if(mine.length>=2){
      const tail1=mine[mine.length-1].slice(-12), tail2=text.slice(-12);
      const inv=/愿不愿|能不能|想不想|陪我|与我同行/;
      if(inv.test(tail1)&&inv.test(tail2)){
        return text.replace(/[，,。]?(愿不愿|能不能|想不想)[^。！？]*[？?]$/,"。")+ "这一程，我等你。";
      }
    }
    return text;
  },

  /* ---------- 对话导演（R3.1：群聊单次调用生成整场，互文） ---------- */
  async directorRespond(targetIds,userText){
    const {NPC}=CTX;
    const st=CTX.getSt();
    if(!CTX.dsReady()||!targetIds||targetIds.length<2) return null;
    try{
      const scene=this.recentScene(10);
      const cards=targetIds.slice(0,3).map(id=>{ /* 同场 ≤3 NPC（R3.1） */
        const npc=NPC[id]; if(!npc) return null;
        const name=(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(id,npc.name):npc.name;
        const title=(window.WDCfg&&WDCfg.npcTitle)?WDCfg.npcTitle(id,npc.title):(npc.title||"");
        const persona=(window.WDCfg&&WDCfg.npcPersona)?WDCfg.npcPersona(id):"";
        const g=this.growthOf(id);
        return {id,姓名:name,称号:title,基准:persona||npc.intro||"",
          语言特征:(g.speech||""),性格:(g.traits||[]).join("、")};
      }).filter(Boolean);
      if(!cards.length) return null;
      const sys="你是游戏『问道之旅·四十五日』的对话导演。多个NPC在同一对话流中回应玩家：每位NPC只说最有资格说的一段（两三句，≤100字），可以互相接话、补充、轻微打趣，但不得互相抢话重复。遵守世界观与语气约束：网游NPC口吻、请求式、禁AI腔、禁教书腔、禁命令句。只输出JSON。";
      const user="游戏背景：\n"+JSON.stringify(this.worldBrief())
        +"\n\n在场角色：\n"+JSON.stringify(cards)
        +"\n\n近期对话流（供互文参考）：\n"+(scene.map(s=>s.who+"："+s.text).join("\n")||"（无）")
        +"\n\n玩家说："+userText
        +"\n\n请输出JSON：{\"lines\":["+cards.map(c=>"{npc:\""+c.id+"\",text:\"该NPC的台词，≤100字\"}").join(",")+"]}。每位NPC的话必须体现各自职能与性格，彼此有承接关系。";
      const raw=await CTX.dsChat([{role:"system",content:sys},{role:"user",content:user}],{kind:"director"});
      let o;
      try{ o=JSON.parse(raw.replace(/^```json|```$/g,"").trim()); }
      catch(e){ const m=raw.match(/\{[\s\S]*\}/); if(!m) throw e; o=JSON.parse(m[0]); }
      const lines=(o.lines||[]).filter(l=>l&&l.npc&&l.text&&NPC[l.npc]).slice(0,3)
        .map(l=>({npc:l.npc,text:String(l.text).slice(0,150)}));
      if(!lines.length) return null;
      lines.forEach(l=>{ this.bumpTalk(l.npc); this.maybeSummarize(l.npc); });
      return lines;
    }catch(e){ return null; }
  },

  /* ---------- Function Calling 工具定义（R3.2） ---------- */
  toolDefs(){
    return [
      {type:"function",function:{
        name:"query_quest",
        description:"查询玩家当前的任务链状态（在途关卡、目标、奖励、接洽NPC）",
        parameters:{type:"object",properties:{},required:[]}
      }},
      {type:"function",function:{
        name:"query_knowledge",
        description:"在本地考点资料库中检索关键词（374 张考点卡与英文导游词）",
        parameters:{type:"object",properties:{keyword:{type:"string",description:"检索关键词"}},required:["keyword"]}
      }},
      {type:"function",function:{
        name:"query_player_profile",
        description:"查询玩家的学习统计与画像（对话次数、学习时长、错题分布、久别天数）",
        parameters:{type:"object",properties:{},required:[]}
      }},
      {type:"function",function:{
        name:"query_world_state",
        description:"查询世界状态（当前幕次、天数、圣女恢复进度、已解锁进度）",
        parameters:{type:"object",properties:{},required:[]}
      }}
    ];
  },
  toolExec(name,args,npcId){
    const st=CTX.getSt();
    try{
      if(name==="query_quest"){
        const aq=CTX.quest&&CTX.quest();
        return aq?JSON.stringify({在途关卡:aq.name,类型:aq.tlabel,目标:aq.goal,接洽NPC:aq.npc,奖励:aq.xp+"修行+"+aq.coin+"铜钱"}):JSON.stringify({在途关卡:"无（今日已清）",建议:"巡夜/星盘/预告下一幕"});
      }
      if(name==="query_knowledge"){
        const kw=(args&&args.keyword)||"";
        return this.knowledge(kw)||"（未命中）";
      }
      if(name==="query_player_profile"){
        const d=window.WDMem&&window.WDMem.digest?window.WDMem.digest(npcId):null;
        const sum=this.summaryOf(npcId);
        return JSON.stringify({统计:d||"（暂无）",互动摘要:sum&&sum.text?sum.text.slice(0,200):"（暂无）"});
      }
      if(name==="query_world_state"){
        return JSON.stringify({第几天:st.day,已解锁至:st.unlocked,当前幕:"act"+(1+Math.min(4,Math.floor((st.day-1)/9))),圣女恢复约:Math.min(100,Math.floor((st.day/45)*100)+5)+"%"});
      }
    }catch(e){}
    return "（工具调用失败，请自行作答）";
  },
  /* Agent loop（≤2 轮工具调用，R3.2）：带工具的 respond 增强；失败静默回退普通 respond */
  async respondWithTools(npcId,userText,brief){
    if(!CTX.dsReady()) return this.respond(npcId,userText,brief);
    try{
      const messages=[
        {role:"system",content:this.sysPrompt(npcId,brief)}
      ];
      const hist=this.historyOf(npcId,8);
      hist.forEach(m=>messages.push({role:m.role==="player"?"user":"assistant",content:m.text}));
      const hasCustomWorld=!!((window.WDCfg&&WDCfg.customWorldBrief)?WDCfg.customWorldBrief():"").trim();
      messages.push({role:"user",content:this.buildContext(npcId,userText,null)+"\n\n以"+((window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(npcId,CTX.NPC[npcId].name):CTX.NPC[npcId].name)+"的身份回应。你可以调用工具查询真实数据后再回答。"+this.postHistoryRules(npcId)});
      for(let round=0;round<2;round++){
        const raw=await CTX.dsChat(messages,{kind:"chat",tools:this.toolDefs()});
        /* dsChat 返回 content 或 {tool_calls} 结构（由 index.html dsChat v2 透传） */
        if(raw&&raw.toolCalls&&raw.toolCalls.length){
          messages.push({role:"assistant",content:raw.content||"",tool_calls:raw.toolCalls});
          for(const tc of raw.toolCalls.slice(0,2)){
            const fn=tc.function||{};
            let args={}; try{ args=JSON.parse(fn.arguments||"{}"); }catch(e){}
            messages.push({role:"tool",tool_call_id:tc.id,content:String(this.toolExec(fn.name,args,npcId)).slice(0,600)});
          }
          continue;
        }
        let text=(raw&&raw.content?raw.content:String(raw||"")).trim();
        if(!text) break;
        const chk=this.clauseCheck(text,npcId,hasCustomWorld);
        if(!chk.pass){
          const p0=chk.violations.some(x=>x.level==="P0");
          const p1=chk.violations.some(x=>!x.level||x.level==="P1");
          if(p0&&round===0){ messages.push({role:"user",content:"重新生成：上一次回复违反了硬禁则。"}); continue; }
          if(p1) text=this.sanitize(text);
        }
        this.bumpTalk(npcId); this.maybeSummarize(npcId);
        return {text:text||this.fallback(npcId,userText),degraded:!text};
      }
      /* 工具轮耗尽：降级普通 respond */
      return this.respond(npcId,userText,brief);
    }catch(e){
      return this.respond(npcId,userText,brief);
    }
  },

  /* ---------- 主动触发器（R3.3：本地规则，零 API 成本；触发后走润色） ---------- */
  checkProactive(){
    const st=CTX.getSt();
    st.proactiveLog=st.proactiveLog||{};
    const today=new Date().toISOString().slice(0,10);
    /* 每日主动消息 ≤3 条 */
    const todayCount=Object.keys(st.proactiveLog).filter(k=>st.proactiveLog[k]===today).length;
    if(todayCount>=3) return null;
    const flags=(st.agentFlags=st.agentFlags||{director:true,tools:true,proactive:true});
    if(!flags.proactive) return null;
    /* 规则 1：连续 2 天未复习（lastStudy 距今 >48h）→ 云蘅晨间问候 */
    const lastStudy=st.lastStudyAt?new Date(st.lastStudyAt).getTime():0;
    if(lastStudy&&Date.now()-lastStudy>48*36e5){
      const key="nostudy_"+today;
      if(!st.proactiveLog[key]){
        st.proactiveLog[key]=today; CTX.save();
        return {npc:"yunheng",reason:"nostudy",text:"两日没见你的脚印了——雾里的妖可没闲着。今日可得空走一遭？"};
      }
    }
    /* 规则 2：错题 >10 → 璇玑 */
    if(window.WDMem&&window.WDMem.stats){
      let wrongs=0;
      try{
        const stats=window.WDMem.stats();
        Object.keys(stats.byNpc||{}).forEach(id=>{
          const w=stats.byNpc[id].wrongs||{};
          Object.keys(w).forEach(t=>{ wrongs+=w[t].n||0; });
        });
      }catch(e){}
      if(wrongs>10){
        const key="wrongs_"+today;
        if(!st.proactiveLog[key]){
          st.proactiveLog[key]=today; CTX.save();
          return {npc:"xuanji",reason:"wrongs",text:"星盘上错题妖已经结成阵了——"+wrongs+"只。趁今夜雾薄，随我清一波？"};
        }
      }
    }
    /* 规则 3：关卡滞留 2 天 → 接洽 NPC 委婉催办 */
    const aq=CTX.quest&&CTX.quest();
    if(aq&&st.questEnterAt){
      const enterAt=new Date(st.questEnterAt).getTime();
      if(enterAt&&Date.now()-enterAt>48*36e5){
        const key="stuck_"+aq.id+"_"+today;
        if(!st.proactiveLog[key]){
          st.proactiveLog[key]=today; CTX.save();
          return {npc:aq.npc,reason:"stuck",text:"「"+aq.name+"」的关前两日没动静了——不是难住了吧？需要掌灯引路，随时唤我。"};
        }
      }
    }
    return null;
  }
};

window.WDChat=WDChat;
})();
