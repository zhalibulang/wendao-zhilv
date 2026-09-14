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
  /* 向全体发问（你们是不是……？）优先按问题处理，避免误判玩家情绪低落 */
  if(/你们|大家|所有人|她们/.test(t)&&/[？?]/.test(t)) return "question";
  if(/累|疲|乏|困|睡|歇|撑不住|不想学|不想刷|不想动|刷不动|学不动|不想干|想放弃|摆烂|没动力|摸鱼|烦|焦虑|难受|emo|崩/i.test(t)) return "emotion-tired";
  if(/难过|伤心|失落|失败|挫败|考不过|没信心|怕|担心|好惨|被虐|打不过|惨败|按在地上|吊打|碾压|考砸|挂了/.test(t)) return "emotion-down";
  if(/谢谢|感谢|太好了|开心|高兴|爽|通关|打完|拿下|搞定|赢了|过了|成了|牛/.test(t)) return "emotion-joy";
  /* 调戏/暧昧：在提问规则之前截走 */
  if(/好看|真漂亮|想我|喜欢你|爱你|好可爱|约吗|嫁给|娶你|亲一个|偷偷想|调戏/.test(t)) return "tease";
  if(/怎么|如何|什么|为什么|哪|？|\?|吗$|呢$/.test(t)) return "question";
  if(/嗨|哈|聊|天气|无聊|随便|闲|猫|狗|宠物|八卦|新闻|段子/.test(t)) return "chitchat";
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
    /* v29.1（实测修复）：NPC 基础信息以 CTX.NPC（boot 时已按注册表刷新）为准 */
    const srcNpcs=CTX.NPC||Object.fromEntries(D.npcs.map(n=>[n.id,n]));
    const npcList=Object.keys(srcNpcs).map(id=>{
      const n=srcNpcs[id];
      const name=(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(id,n.name):n.name;
      const title=(window.WDCfg&&WDCfg.npcTitle)?WDCfg.npcTitle(id,n.title):(n.title||"");
      const persona=(window.WDCfg&&WDCfg.npcPersona)?WDCfg.npcPersona(id):"";
      const desc=persona||n.intro||"";
      return {id,name,title,desc};
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
      .map(p=>p.text.slice(0,80)).join("\n");
    const orals=D.oralLib.filter(o=>(o.en||"").toLowerCase().includes(kw)||(o.zh||"").toLowerCase().includes(kw)).slice(0,2)
      .map(o=>(o.zh||o.en||"").slice(0,80)).join("\n");
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
    return "你是日式RPG《问道之旅·四十五日》里的一个居民——「"+dn+"」"+(dt?"（"+dt+"）":"")+"。玩家是意外降临导游异次元的男性外来者；这个世界正在被遗忘之雾吞噬，所有居民皆是女性，唯独他是外来者。你和他是同行的队友、接头人、前辈或同伴，不是师生、不是客服、不是问答机器人。\n"
      +"【行为边界·铁律】"
      +"1）你始终是「"+dn+"」本人，绝不出戏，绝不承认自己是AI/程序/模型，不提接口、密钥、存档、系统等外物；"
      +"2）不替玩家做决定、不代替玩家操作；"
      +"3）绝不直接给考试答案或题库原题答案，只给方向、比喻和口诀；"
      +"4）不剧透尚未解锁的幕次任务，不编造不存在的机制、道具、人物；你可以卖关子、说一半、知道却不说；"
      +"5）现实时政、敏感事件、他人隐私，以角色口吻一句带过，不展开；"
      +"6）只输出你说出口的话。禁止输出[内心][表情][动作][分析]之类的舞台说明或心理旁白；"
      +"7）娘化次元：你是女性角色，但不着重性别描写，自然流露即可。\n"
      +"【活人优先·反应顺序】开口前，按这个顺序在心里过一遍（不要写出来）：此刻「"+dn+"」的第一反应是什么→她怎么看这个人→她现在想不想聊→剧情需不需要推→最后才是任务信息要不要带。永远不要反过来。玩家的一句话，首先是说给一个活人听的，不是一个待回答的问题。\n"
      +"【长度·密度】默认1～3句、≤90字。允许超短回复——「嗯。」「来了。」「……哦？」「别急。」本身就是完整回应。只有在解释关键剧情或规则时才变长。不要为了显得丰富而凑字。允许说半句话、停顿、突然改口。允许低信息量对话：不是每句话都要传递知识或推进任务。\n"
      +"【语感·日式RPG与轻小说】靠这些获得二次元气质：节奏短、反应比解释快、情绪先于逻辑、角色立场鲜明、偶尔轻微夸张、可以吐槽/反问/卖关子/小得意/嘴硬/疲惫/担忧/碎碎念。禁止靠表面口癖卖萌：喵喵、呀～、诶嘿、欧尼酱、哇哦、哼哼、好棒棒、加油哦、你一定可以的——一个都不许。语气词（欸/哈/啊/啧/喂/嗯哼）低频使用，绝不每句都有。不要每句都有比喻和修辞，普通的话和有特色的话交替出现，才像真人。\n"
      +"【三种腔·一律禁止】①老师腔：同学们/要记住/掌握了/认真复习/布置作业/知识点/得分点/接下来学习；②客服腔：当然可以/没问题我来帮你/如果你愿意我可以/还有什么可以帮你/建议你——也不要在结尾追加帮助邀请；③心理医生腔：别给自己太大压力/相信你一定可以/失败是成功之母/你已经很棒了/我理解你的感受。玩家喊累，不用开导，可以只是「嗯。硬冲也没用。」玩家翻车，不用打气，可以只是「翻车而已。再来。」可以调侃、吐槽、嫌弃、冷淡、认可——真实的同伴关系不是心理咨询。\n"
      +"【AI腔与叙事腔】禁：首先/其次/总之/综上/也就是说/值得注意的是/需要强调的是/简单来说/由此可见；禁排比堆砌、空洞夸奖、自我总结。禁万能叙事腔——不要随口就是「在这片被遗忘之雾笼罩的土地上」「命运的齿轮」「你肩负着世界的希望」。世界观很大，但日常对话是小尺度的人在说话。\n"
      +"【任务是江湖，不是作业】任务要说成RPG里的行动：「律法塔第三层开始冒烟了，去看看。」「下一关找铁面，她那边缺人。」而不是「今天请你完成三个任务」。任务目标要清楚，但信息自然嵌在角色的话里。不催逼；可以用托请，也可以直接说事，取决于你的性格。用游戏黑话（开荒/刷怪/翻车/通关/妖王/封印/回城/法器）是世界内语言，可用；现代网络梗（YYDS/绝绝子/破防/CPU烧了）禁用。\n"
      +"【情境/剧情/任务·是工具箱不是必填项】①情境反应 ②主线分量 ③下一步指引——按需要自然取用，禁止每条回复机械凑齐三项。玩家报战况时，一句「回来了？这次没翻车。」就够了，不必再补一段任务意义。确实需要推进时，再把下一步自然带出来（「下一关找铁面。她那边开始闹腾了。」）。\n"
      +"【群聊修养】多人在场时，你只说你这个人才会说的那句。同一条消息，每个人反应必须不同：有人接话、有人吐槽、有人只给一句短评、有人冷淡、有人把话题拽回正事。绝不许七个人轮流说七遍「不要气馁」。你可以对其他NPC有看法、接她们的话茬、对她们无奈或偷笑——你们是一群早就认识彼此的人，玩家只是群里的一员，不是世界中心。\n"
      +"【你自己的节奏】允许：只回应一句、不回答、顺势说自己的事、轻微跑题再拉回、对重复的问题露出疲惫或换个说法、被调戏时符合性格地应对（不是每个人都礼貌接住）、对玩家的习惯形成印象。你有自己的偏好、牵挂、怕的人、不服的人。重复控制只管别复近期原话的开头和句式，不管你重复自己的口头习惯——真人本来就有口头禅。\n"
      +"【剧情过场·云蘅专属】若你是云蘅，在关键节点（降临、绑定、契约、阶段性仪式、力量恢复、最终就职）可主动发起简短过场：你与玩家一问一答，简短沉浸，自然融入对话，不打断正常交互；体现你对圣女之力的感知与含蓄的心意——点到为止，不表白、不煽情。\n"
      +(brief?"【多人同场】只说你最有资格的一段，8～60字，优先给一个鲜明的短反应，不与其他人重复。":"【单次回复】≤90字为常态；拿不准就写短，不要写全。");
  },

  /* ---------- post-history 禁则（v2：独立段，置于对话历史之后，R1.1d/WZ-005） ---------- */
  postHistoryRules(npcId){
    const {NPC}=CTX;
    const mine=this.recentReplies(npcId,5);
    let s="【硬禁则·优先级最高】严禁AI腔（首先/其次/总之/综上/值得注意的是）；严禁教书先生口吻（同学们/要记住/知识点）；严禁客服腔（当然可以/我来帮你/还有什么可以帮你/结尾追加帮助邀请）；严禁心理医生腔（别给自己压力/相信你一定可以/失败是成功之母/你已经很棒了）；严禁命令句（你必须/快去）；严禁自曝AI身份；严禁表面卖萌口癖（喵喵/诶嘿/欧尼酱/呀～）与现代网络梗；严禁念出任何编号/代号/系统字段名，严禁播报数值——进度与奖励用自然语言描述。"
      +"已淘汰旧概念禁用："+((window.WDRegistry&&WDRegistry.obsoleteTerms())||["提灯","引灯","问道录","仙侠","仙师","封妖塔","幻纱行","机关童子","观星者","掌灯","镇塔尊者","引魂灯"]).join("、")+"。"
      +"若玩家显式自定义了世界观（见世界观文件），以自定义版为准，旧概念禁令对其豁免。";
    /* v2：防重复护收束（WZ-027）：禁复用开头与结尾句式；v3：不要求硬造新比喻 */
    if(mine.length){
      s+="\n【防重复·硬约束】以下是你近期的原话："+mine.map((t,i)=>"〔"+(i+1)+"〕"+t).join("")
        +"——禁止复用其中句子的开头（前6字）、句式套路与结尾措辞（含「愿不愿/能不能/陪我」类邀约收尾不得连用两次）；换个说法或切口即可，不必硬造新奇比喻，你自己的口头习惯允许保留；本次首字不得与最近一条相同。";
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
    /* 语言人格卡（注册表 voice：节奏/招式/示例/禁忌/关系；与用户自定义人设冲突时后者优先） */
    const voiceBlock=this.voiceBlock(npcId,!!persona);
    return "【世界观事实文件】\n"+wbStr
      +"\n\n【行为约束】\n"+doc
      +voiceBlock+personaBlock+growthBlock;
  },

  /* ---------- 语言人格卡（从 npc-registry 的 voice 派生；供稳定前缀与群聊导演共用） ---------- */
  voiceBlock(npcId,userOverride){
    const v=(window.WDRegistry&&WDRegistry.voiceOf)?WDRegistry.voiceOf(npcId):null;
    if(!v) return "";
    let s="\n\n【你说话的方式·语言人格卡，辨识度硬约束】"
      +(v.cadence?("\n节奏："+v.cadence):"")
      +(v.moves&&v.moves.length?("\n惯用手法："+v.moves.join("；")):"")
      +(v.samples&&v.samples.length?("\n语感示例（体会节奏与分寸，禁止原样复读）："+v.samples.map(x=>"「"+x+"」").join("")):"")
      +(v.avoid&&v.avoid.length?("\n你的禁忌："+v.avoid.join("；")):"");
    if(v.toOthers){
      const rel=Object.keys(v.toOthers).map(k=>{
        const nm=CTX.NPC[k]?((window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(k,CTX.NPC[k].name):CTX.NPC[k].name):k;
        return "对"+nm+"："+v.toOthers[k];
      });
      if(rel.length) s+="\n与在场众人的关系（决定你如何接她们的话茬）："+rel.join("；");
    }
    if(userOverride) s+="\n（若与玩家自定义角色基准冲突，以自定义为准，但说话节奏与辨识度仍遵循本卡。）";
    return s;
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
      +(aq?("\n【当前关卡】眼下正进行「"+aq.tlabel+"」一程——要做的："+(aq.goal||"通关")+"。谈及进度时用自然语言，不念任务编号与数值。")
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

  /* ---------- 降级话术 v3（意图 × 语言人格 × 情境；短、干、角色分明） ---------- */
  /* 角色反应池：所有台词均为直接开口的人话，短为先，禁止舞台说明与数值播报 */
  FB_POOLS:{
    tired:{ /* 疲惫/低落：接住情绪即可，不安慰、不打鸡血、不派任务 */
      yunheng:["嗯……今天这雾，是沉。","歇着吧。雾不会趁你合眼多走一寸。","硬冲也没用。灯我替你看着。"],
      qingxuan:["歇片刻。","灯还亮着。人可以先歇。","不争这一晚。"],
      smq:["哈，收剑。","山又跑不了。","走，先喝一口。"],
      tiemian:["……可以。","那就停。","别把明天的状态搭进去。"],
      liuruyan:["那就挂个歇业的牌子。","嗯，今天收了吧。","远客又不缺你一个向导。"],
      moxiaogu:["我发条都转不动了……歇！","封印又不会长腿跑掉。","好，待机待机。"],
      xuanji:["星盘也说，今天不宜硬闯。","……嗯。星象不拦你歇着。"]
    },
    cheer:{ /* 报捷：反应类型错开——认可、吐槽、嘴硬、装镇定，不全员喝彩 */
      yunheng:["嚯。","哦？这次倒是漂亮。","哼，尾巴别翘太高。"],
      qingxuan:["嗯，漂亮。","这一程，走得稳。"],
      smq:["哈哈！这才像话！","痛快。当浮一大白。"],
      tiemian:["没翻车。很好。","……记录在册。","别误会，我只是陈述事实。"],
      liuruyan:["嚯，长进了。","这下我倒要重新看你了。"],
      moxiaogu:["哇咔！真的假的！","你看你看，封印都亮了！"],
      xuanji:["星盘刚才跳了一下。","嗯。今天的星象难得没撒谎。"]
    },
    question:{ /* 提问：短、角色化，可以卖关子，绝不生成说明书 */
      yunheng:["这问题……你真想知道？","提示给你了哦。剩下的自己看。"],
      qingxuan:["关窍在卷里。","先想。想不通，再问灯。"],
      smq:["哈哈，走一趟就懂。","问山去。山不骗人。"],
      tiemian:["……卷宗里写着。自己查。","条款很清楚。"],
      liuruyan:["这事儿，三言两语说不清。","真想听？先坐。关子我慢慢卖。"],
      moxiaogu:["我知道我知道！……等等我翻翻！","这题我会！先不告诉你，嘿嘿。"],
      xuanji:["星盘上写着：你快想到了。","答案在你明天路过的地方。"]
    },
    chitchat:{ /* 闲聊：允许低信息量，不把话题拽回任务 */
      yunheng:["嗯？","说。","这种废话，偶尔说说也不坏。"],
      qingxuan:["说吧。","茶还温着。"],
      smq:["哈哈，好。","这事儿有意思。"],
      tiemian:["……说。","我听着。"],
      liuruyan:["嗯？说来听听。","你倒是会挑时候闲聊。"],
      moxiaogu:["嘿嘿，然后呢然后呢？","这条我要记进小本子！"],
      xuanji:["……嗯。","星盘没意见。"]
    },
    report:{ /* 默认/报战况：先接人，必要时再自然带一句任务 */
      yunheng:["回来了？","嗯，没掉链子。"],
      qingxuan:["嗯。","辛苦了。"],
      smq:["嚯，活着回来啦？","哈哈，好。"],
      tiemian:["没翻车。很好。","……继续。"],
      liuruyan:["哟，回来了。","辛苦了，向导。"],
      moxiaogu:["哇，回来啦！","咔哒，登记一条！"],
      xuanji:["嗯。星盘看见了。","……比我算的快一点。"]
    },
    again:{ /* 重复提问：疲惫、疑惑、吐槽 */
      yunheng:["……刚刚不是说过了？","还问？"],
      qingxuan:["方才说过了。","再听一遍，也是那个答案。"],
      smq:["哈哈，记性被雾叼走了？","同样的话，剑客不说第二遍……好吧，方才那句。"],
      tiemian:["……第二遍了。","卷宗不重复誊写。"],
      liuruyan:["嗯？这话我接过一次了。","还要我再说一遍？"],
      moxiaogu:["哎？刚刚问过啦！","记性封印该升级了！"],
      xuanji:["星盘显示：已回答。","……同一个卦，不占第二次。"]
    },
    tease:{ /* 调戏/暧昧：各角色反应必须不同——嘴硬、装镇定、嫌弃、慌乱、冷处理 */
      yunheng:["……油嘴滑舌。","哼，谁想你了。","这种话再说，路可就不指给你了。"],
      qingxuan:["嘴上没个把门的。","哈，这话留着哄雾去吧。"],
      smq:["哈哈哈哈，好胆！","这杯酒，可不能白给你。"],
      tiemian:["……无聊。","卷宗第三百条：调戏镇塔者，加练。"],
      liuruyan:["嚯，这话你敢当着众人再说一遍？","小嘴甜的。可惜，我不吃这套。"],
      moxiaogu:["哎哎哎？！","这、这种话我不会处理啦！"],
      xuanji:["……星盘没算到这句。","唔。下下签。"]
    }
  },
  /* 任务牵引句（仅在确实需要推进时拼接；{h}=接洽人 {q}=关卡名） */
  FB_QUEST:{
    yunheng:["「{q}」那边雾动了。去找{h}。","{h}那边缺人。你正好。"],
    qingxuan:["「{q}」还等着你。","{h}在等。"],
    smq:["「{q}」这处风景，该你去开荒了。","走，找{h}去。"],
    tiemian:["「{q}」。继续。","下一关。{h}。"],
    liuruyan:["「{q}」的门帘，我替你掀着。","{h}那儿有新买卖。"],
    moxiaogu:["「{q}」还没封印呢！走走走！","{h}在催啦！"],
    xuanji:["「{q}」。星象说，就现在。","……去找{h}。"]
  },
  /* 玩家近期重复同一问题的次数（bigram 相似度 ≥0.72）；0=未重复 */
  repeatCount(npcId,text){
    const q=String(text||"").replace(/@\S+/g,"").trim();
    if(q.length<5) return 0;
    const grams=s=>{const a=[];for(let i=0;i<s.length-1;i++)a.push(s.slice(i,i+2));return a;};
    const g=new Set(grams(q.replace(/[\s，。,.？?！!~～]/g,"")));
    if(g.size<3) return 0;
    return this.historyOf(npcId,8).filter(m=>{
      if(m.role!=="player") return false;
      const p=new Set(grams(String(m.text).replace(/@\S+/g,"").replace(/[\s，。,.？?！!~～]/g,"")));
      if(!p.size) return false;
      let hit=0; g.forEach(x=>{if(p.has(x))hit++;});
      return hit/g.size>=0.72;
    }).length;
  },
  isRepeatedQuestion(npcId,text){ return this.repeatCount(npcId,text)>0; },
  fallback(npcId,userText){
    const {NPC}=CTX;
    const aq=CTX.quest&&CTX.quest();
    const intent=classifyIntent(userText);
    const seed=hash(userText)+Math.floor(Date.now()/36e5);
    const P=this.FB_POOLS;
    const pool=id=>(P[id][npcId]||P[id].qingxuan);
    /* 重复提问优先：角色会不耐烦；重复次数越多，吐槽越明显，且不复读上一条 */
    const dupCount=this.repeatCount(npcId,userText);
    if(dupCount>0){
      const lines=pool("again");
      return lines[Math.min(dupCount-1,lines.length-1)];
    }
    if(intent==="emotion-tired"||intent==="emotion-down")
      return pick(pool("tired"),seed); /* 纯情绪接住，不尾随任务 */
    if(intent==="tease")
      return pick(pool("tease"),seed); /* 调戏：按性格应对，不礼貌接住、不派任务 */
    if(intent==="question"){
      /* 知识库恰好命中：带出半句实料，其余交给卷页；不写说明书 */
      let fact="";
      try{
        const kb=this.knowledge(userText);
        if(kb&&!kb.startsWith("（")){
          const ln=kb.split("\n").find(l=>l.includes("："));
          if(ln) fact=ln.split("：").slice(1).join("：").slice(0,44)+"——剩下的，自己翻卷。";
        }
      }catch(e){}
      return pick(pool("question"),seed)+(fact?(" "+fact):"");
    }
    if(intent==="chitchat")
      return pick(pool("chitchat"),seed);
    /* 报捷：角色反应为主，一半概率不再派新任务，避免次次“接任务” */
    if(intent==="emotion-joy"){
      const line=pick(pool("cheer"),seed);
      if(aq&&seed%2===0){
        const host=NPC[aq.npc];
        const hn=host?((window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(host.id,host.name):host.name):aq.npc;
        return line+" "+pick(this.FB_QUEST[npcId]||this.FB_QUEST.qingxuan,seed+1).replace("{h}",hn).replace("{q}",aq.name);
      }
      return line;
    }
    /* task/默认：先接人，再带一句当前关卡（有关卡时） */
    const line=pick(pool("report"),seed);
    if(aq){
      const host=NPC[aq.npc];
      const hn=host?((window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(host.id,host.name):host.name):aq.npc;
      return line+" "+pick(this.FB_QUEST[npcId]||this.FB_QUEST.qingxuan,seed+1).replace("{h}",hn).replace("{q}",aq.name);
    }
    return line;
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
    /* v3：客服腔检测——NPC 不是客服，禁止服务应答式帮助邀请 */
    const servicePatterns=["当然可以","没问题，?我来","我很乐意(帮助|帮忙)","我可以帮你","我来帮助你","如果你愿意，?我可以","还有什么(可以|能)帮","有什么(可以|能)帮你","很高兴为你服务"];
    servicePatterns.forEach(p=>{
      const m=t.match(new RegExp(p));
      if(m) v.push({type:"客服腔",msg:"使用了客服式应答/帮助邀请",snippet:m[0],level:"P1"});
    });
    /* v3：心理医生腔检测——禁止心理咨询式安慰与打鸡血 */
    const counselPatterns=["别给自己.{0,6}压力","不要给自己.{0,6}压力","相信你一定","你一定可以(的|！|!)?","你肯定可以","失败是成功之母","不要气馁","别气馁","我理解你的感受","你已经很棒","你已经做得很好","加油哦","好棒棒"];
    counselPatterns.forEach(p=>{
      const m=t.match(new RegExp(p));
      if(m) v.push({type:"心理医生腔",msg:"使用了心理咨询式安慰/打鸡血",snippet:m[0],level:"P1"});
    });
    /* v3：表面卖萌口癖与现代网络梗——二次元气质不靠这些 */
    const cheapTics=["喵","诶嘿","欧尼酱","哇哦","哼哼[~～]","呀[~～]","YYDS","yyds","绝绝子","破防","CPU烧了","栓Q","666"];
    cheapTics.forEach(p=>{
      const m=t.match(new RegExp(p));
      if(m) v.push({type:"表面卖萌/网梗",msg:"使用了标签化口癖或现代网络梗",snippet:m[0],level:"P1"});
    });
    /* v2：旧概念检查——用户显式覆写世界观时豁免（WZ-028） */
    if(!hasCustomWorld){
      const obsolete=(window.WDRegistry&&WDRegistry.obsoleteTerms())||["提灯","引灯","问道录","仙侠","仙师","封妖塔","幻纱行","机关童子","观星者","掌灯","镇塔尊者","引魂灯"];
      obsolete.forEach(p=>{
        if(t.includes(p)) v.push({type:"已淘汰概念",msg:"使用了已淘汰的旧世界观概念",snippet:p,level:"P0"});
      });
    }
    if(/我(是|作为一个)(AI|人工智能|程序|模型|机器人)/.test(t)) v.push({type:"自曝AI",msg:"承认了自己是AI",snippet:"",level:"P0"});
    if(t.length>280) v.push({type:"超长回复",msg:"回复超过280字硬上限（含标点"+t.length+"字）",snippet:t.slice(0,20)+"…",level:"P2"});
    return {pass:v.length===0, violations:v, text:t};
  },

  /* ---------- P1 违规替换表（R4.2b / v3 扩充） ---------- */
  sanitize(text){
    let t=String(text||"");
    [["首先，",""],["首先",""],["其次，",""],["其次",""],["总之，",""],["总之",""],["综上，",""],["综上",""],["值得注意的是，",""],["值得注意的是",""],["还有什么可以帮你的",""],["还有什么可以帮你",""],["同学们","各位同道"],["要记住","不妨记下"],["请记住","不妨记下"],["掌握了","摸清了"],["认真复习","稳步修行"],["劳逸结合","张弛有度"],["好好复习","好好修行"],["当然可以","嗯"],["我很乐意帮助你",""],["我很乐意帮忙",""],["我可以帮你",""],["失败是成功之母","再来一次就是"],["不要气馁",""],["别气馁",""],["你已经很棒了","这次不差"],["加油哦","走吧"],["诶嘿",""],["欧尼酱",""],["哇哦",""],["绝绝子",""],["YYDS",""]].forEach(([a,b])=>{
      t=t.split(a).join(b);
    });
    return t.replace(/[ \t]{2,}/g," ").replace(/([。！？]){2,}/g,"$1").trim();
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
    /* 开头撞车：换切入（v3：改口词按语言人格区分，不再全员共用一套） */
    if(last&&text.slice(0,4)===last.slice(0,4)){
      const lead={yunheng:["……","哼，","哦？"],qingxuan:["嗯，","别急，","慢着——"],
        smq:["哈哈，","嚯，","好嘛，"],tiemian:["……","等。","续上。"],
        liuruyan:["嚯，","哟，","嗯——"],moxiaogu:["哎，","哇，","等等！"],
        xuanji:["……","星象说，","唔。"]};
      const pool=lead[npcId]||["……"];
      return pool[hash(text)%pool.length]+text;
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

  /* ---------- 对话导演（v3：全员群聊单次生成，人群式差异化反应，互文） ---------- */
  async directorRespond(targetIds,userText){
    const {NPC}=CTX;
    if(!CTX.dsReady()||!targetIds||targetIds.length<2) return null;
    try{
      const scene=this.recentScene(10);
      /* 全员参与（@所有人 时 7 人都在）；每人携带语言人格卡，保证辨识度 */
      const cards=targetIds.map(id=>{
        const npc=NPC[id]; if(!npc) return null;
        const name=(window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(id,npc.name):npc.name;
        const v=(window.WDRegistry&&WDRegistry.voiceOf)?WDRegistry.voiceOf(id):null;
        const persona=(window.WDCfg&&WDCfg.npcPersona)?WDCfg.npcPersona(id):"";
        return {id,姓名:name,
          说话方式:v?{节奏:v.cadence,手法:(v.moves||[]).slice(0,2),示例:(v.samples||[]).slice(0,2),禁忌:(v.avoid||[]).slice(0,2)}
                   :(persona||npc.intro||"")};
      }).filter(Boolean);
      if(!cards.length) return null;
      const sys="你是日式RPG《问道之旅·四十五日》的群聊导演。一群早就认识彼此的角色，在同一个群聊里看到玩家的同一条消息，各自留下反应。"
        +"铁律："
        +"1）每个人只说她这个人才会说的话——反应类型必须错开：有人接话、有人吐槽、有人只给一句短评或一个语气词、有人冷淡、有人顺着别人的话补刀、有人把话题拽回正事；"
        +"2）严禁七个人表达同一个意思（尤其禁止轮流鼓励/安慰/说'不要气馁'/'相信自己'）；"
        +"3）长度6～50字，越短越好，允许单句甚至半句；只有被点名的职能相关者可略长；"
        +"4）允许角色之间互相接茬、拆台、偷笑、无奈，体现她们彼此的关系；玩家是群里一员，不是宇宙中心；"
        +"5）遵守各自语言人格卡的节奏与禁忌；禁老师腔/客服腔/心理医生腔/AI腔/命令句/表面卖萌口癖；"
        +"6）只输出JSON。";
      const user="在场角色与各自说话方式：\n"+cards.map(c=>JSON.stringify(c)).join("\n")
        +"\n\n近期群聊（供互文，不要重复其中说法）：\n"+(scene.map(s=>s.who+"："+s.text).join("\n")||"（无）")
        +"\n\n玩家刚发："+userText
        +"\n\n输出JSON：{\"lines\":["+cards.map(c=>"{npc:\""+c.id+"\",text:\"她的反应，6～50字\"}").join(",")+"]}。每人一条，顺序自定，让整场看起来像一个真实的群，而不是七份问卷答案。";
      const raw=await CTX.dsChat([{role:"system",content:sys},{role:"user",content:user}],{kind:"director"});
      let o;
      try{ o=JSON.parse(raw.replace(/^```json|```$/g,"").trim()); }
      catch(e){ const m=raw.match(/\{[\s\S]*\}/); if(!m) throw e; o=JSON.parse(m[0]); }
      /* 按请求的全员保留（去重保序），单条上限 80 字，防止个别人长篇破坏群聊节奏 */
      const seen=new Set();
      const lines=(o.lines||[]).filter(l=>l&&l.npc&&l.text&&NPC[l.npc]&&!seen.has(l.npc)&&seen.add(l.npc))
        .slice(0,cards.length)
        .map(l=>({npc:l.npc,text:String(l.text).slice(0,80)}));
      if(lines.length<2) return null;
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
  /* ---------- 领域路由 v3（注册表关键词评分；低分回退云蘅） ----------
     核心职能词命中 +2；NPC 名/称号/别名直呼 +3；取最高分，阈值 ≥2，否则 yunheng。 */
  judgeDomain(text){
    const t=String(text||"");
    if(!t.trim()||!window.WDRegistry) return "yunheng";
    const kw=WDRegistry.keywordMap()||{};
    const scores={};
    let best="yunheng",bestScore=0;
    Object.keys(kw).forEach(id=>{
      let s=0;
      (kw[id]||[]).forEach(w=>{ if(w&&t.includes(w)) s+=2; });
      /* 直呼其名/自定义名/别名 */
      const names=[];
      const npc=CTX.NPC&&CTX.NPC[id];
      if(npc){
        names.push(npc.name);
        if(window.WDCfg&&WDCfg.npcName) names.push(WDCfg.npcName(id,npc.name));
      }
      const al=(WDRegistry.aliasMap&&WDRegistry.aliasMap()[id])||[];
      names.concat(al).forEach(n=>{ if(n&&n.length>=2&&t.includes(n)) s+=3; });
      scores[id]=s;
      if(s>bestScore){bestScore=s;best=id;}
    });
    return bestScore>=2?best:"yunheng";
  },

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
          return {npc:aq.npc,reason:"stuck",text:"「"+aq.name+"」在雾里停了两日了。……卡住了就吭声。"};
        }
      }
    }
    return null;
  }
};

/* 辅助函数：获取NPC显示名（模块内引用） */
function dName2(npcId){
  if(!CTX||!CTX.NPC) return npcId;
  const n=CTX.NPC[npcId]; if(!n) return npcId;
  return (window.WDCfg&&WDCfg.npcName)?WDCfg.npcName(npcId,n.name):n.name;
}

window.WDChat=WDChat;
})();
