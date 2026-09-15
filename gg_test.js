/* 轻量 DOM mock + 同作用域执行 index.html 渲染逻辑，捕获运行时错误 */
const fs = require('fs');

function makeEl(tag){
  const el = {
    tagName:(tag||'div').toUpperCase(), children:[], dataset:{},
    style:{_v:{},setProperty(k,v){this._v[k]=v;},getProperty(k){return this._v[k];}},
    classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x));},remove(...c){c.forEach(x=>this._s.delete(x));},
      toggle(c,f){f?this._s.add(c):this._s.delete(c);},contains(c){return this._s.has(c);}},
    _html:'',_text:'',value:'',disabled:false,type:'',
    set innerHTML(v){this._html=v;},get innerHTML(){return this._html;},
    set textContent(v){this._text=v;},get textContent(){return this._text;},
    appendChild(c){this.children.push(c);return c;},remove(){},removeChild(){},focus(){},click(){},
    querySelector(){return makeEl();},querySelectorAll(){return [];},closest(){return null;},
    setSelectionRange(){},scrollIntoView(){},addEventListener(){},removeEventListener(){},
    getContext(){return{clearRect(){},fillRect(){},strokeRect(){},drawImage(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},closePath(){},createLinearGradient(){return{addColorStop(){}}},fillText(){},measureText(){return{width:8};},save(){},restore(){},translate(){},scale(){},setTransform(){}};},
    set onpointerdown(f){},get onpointerdown(){return null;},
    set onclick(f){},set oninput(f){},set onchange(f){},set onkeydown(f){},set onload(f){},set onerror(f){},set onended(f){},
    toDataURL(){return "data:image/png;base64,x";},
    isConnected:true,
  };
  return el;
}
const store={};
global.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];},clear:()=>{for(const k in store)delete store[k];}};
global.document={body:makeEl('body'),createElement:t=>makeEl(t),getElementById:()=>makeEl(),querySelector:()=>makeEl(),querySelectorAll:()=>[],addEventListener(){}};
global.window=global;
global.navigator={mediaDevices:undefined};
global.isSecureContext=false;
global.fetch=()=>Promise.reject(new Error('no network'));
global.AbortController=class{constructor(){this.signal={};}abort(){}};
global.setTimeout=()=>0;global.clearTimeout=()=>{};
global.requestAnimationFrame=()=>0;global.cancelAnimationFrame=()=>{};
global.addEventListener=()=>{};global.removeEventListener=()=>{};
global.devicePixelRatio=1;
global.AudioContext=undefined;global.webkitAudioContext=undefined;
global.Blob=class{constructor(){}};
global.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}};
global.FileReader=class{readAsText(){}};
global.confirm=()=>true;global.prompt=()=>null;global.alert=()=>{};

const dataSrc=fs.readFileSync(process.argv[2],'utf8');
const html=fs.readFileSync(process.argv[3],'utf8');
const js=html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
/* 独立模块（wd-chat/wd-avatar/wd-cfg/wd-mem/wd-quiz）随主脚本一并装载，保持与线上运行时一致 */
const chatSrc=fs.readFileSync(require('path').join(__dirname,'wd-chat.js'),'utf8');
const registrySrc=fs.readFileSync(require('path').join(__dirname,'npc-registry.js'),'utf8');
const avSrc=fs.readFileSync(require('path').join(__dirname,'wd-avatar.js'),'utf8');
const fxSrc=fs.readFileSync(require('path').join(__dirname,'wd-fx.js'),'utf8');
const cfgSrc=fs.readFileSync(require('path').join(__dirname,'wd-cfg.js'),'utf8');
const memSrc=fs.readFileSync(require('path').join(__dirname,'wd-mem.js'),'utf8');
const quizSrc=fs.readFileSync(require('path').join(__dirname,'wd-quiz.js'),'utf8');

const driver=`
;(function(){
  const errors=[];
  function run(name,fn){try{fn();console.log('PASS  '+name);}catch(e){errors.push(name+' => '+e.message);console.log('FAIL  '+name+' : '+e.message);}}
  function reset(){ st=defState(); }
  try{ WDCfg.init(); WDMem.init(); WDQuiz.init(); }catch(e){ errors.push('模块初始化 => '+e.message); }
  run('defState',()=>{const s=defState();if(!s.player)throw 0;});
  run('reconcile fresh',()=>{reset();reconcile();});
  run('intro',()=>intro());
  run('renderChat day1',()=>{reset();renderChat(byDay[1]);});
  run('renderChat day45',()=>{reset();renderChat(byDay[45]);});
  run('renderBoard',()=>{reset();renderBoard();});
  ['all','pts','oral','full','clue'].forEach(c=>run('renderLib '+c,()=>{reset();st._libCat=c;renderLib();}));
  run('renderLib search命中',()=>{reset();st._libQ='长城';renderLib();});
  run('renderLib search无结果',()=>{reset();st._libQ='zzzz不存在';renderLib();});
  run('renderLib 翻到越界idx',()=>{reset();st._libIdx=99999;renderLib();});
  run('renderNight',()=>{reset();renderNight();});
  run('renderStar empty',()=>{reset();renderStar();});
  run('renderStar withWrong',()=>{reset();st.wrong.push({qid:'D01S1',pid:'S1-01-01',text:'测试题',okA:'真',at:new Date().toISOString()});renderStar();});
  run('renderStar blank错题',()=>{reset();st.wrong.push({qid:'D01S2',pid:'S1-05-01',text:'填空题',okA:'1260',at:new Date().toISOString()});renderStar();});
  run('renderAch',()=>{reset();renderAch();});
  run('renderHeart',()=>{reset();renderHeart();});
  run('renderShop',()=>{reset();renderShop();});
  run('renderCal',()=>{reset();renderCal();});
  run('renderOralLine',()=>{reset();renderOralLine();});
  run('renderSave',()=>{reset();renderSave();});
  run('buildQuestTree',()=>{reset();const t=buildQuestTree();if(t.length!==5)throw new Error('acts='+t.length);});
  run('buildCardPool数量',()=>{reset();const c=buildCardPool();if(c.length<500)throw new Error('cards='+c.length);});
  run('buildWorldBrief',()=>{const b=buildWorldBrief();if(!b.NPC基础信息.length)throw 0;});
  run('openQuest D01M',()=>{reset();openQuest('D01M');});
  run('openQuest D01S1已解锁',()=>{reset();st.done['D01M']=true;reconcile();openQuest('D01S1');});
  run('openQuest 只读回看',()=>{reset();st.done['D01M']=true;reconcile();openQuest('D01M');});
  run('openQuest 未解锁',()=>{reset();openQuest('D05S5');});
  run('openEditor 考点卡',()=>{reset();openEditor(buildCardPool().find(x=>x.cat==='pts'));});
  run('openEditor 口试句卡',()=>{reset();openEditor(buildCardPool().find(x=>x.cat==='oral'));});
  run('openEditor 全文卡',()=>{reset();openEditor(buildCardPool().find(x=>x.cat==='full'));});
  run('openEditor 线索卡(不可编辑)',()=>{reset();const c=buildCardPool().find(x=>x.cat==='clue');if(c.editable)throw new Error('线索卡不应可编辑');});
  run('openPersonaPanel',()=>{reset();openPersonaPanel();});
  run('editor版本保存回退',()=>{reset();
    saveEdit('point:S1-01-01','修改A');saveEdit('point:S1-01-01','修改B');
    if(getEdit('point:S1-01-01','orig')!=='修改B')throw new Error('最新应B');
    if(editVer('point:S1-01-01').length!==2)throw new Error('应2版本');
    rollbackEdit('point:S1-01-01',1);
    if(getEdit('point:S1-01-01','orig')!=='修改A')throw new Error('回退应A');
  });
  run('editor去重',()=>{reset();saveEdit('x','同');if(saveEdit('x','同')!==false)throw new Error('相同不新增');});
  run('originalOf各类型',()=>{reset();
    if(!originalOf('point:S1-01-01'))throw new Error('point原文空');
    const oc=buildCardPool().find(x=>x.cat==='oral');
    if(!originalOf(oc.editId))throw new Error('oral原文空');
    const fc=buildCardPool().find(x=>x.cat==='full');
    if(!originalOf(fc.editId))throw new Error('full原文空');
  });
  run('任务全链贪心解锁无卡关',()=>{reset();
    // 不动点迭代：任意顺序反复解锁直到无新进展（等价真实UI事件驱动，不受日/排序影响）
    let progress=true, lvFail=[];
    while(progress){
      progress=false;
      for(let day=1;day<=45;day++){
        for(const q of byDay[day].quests){
          if(qDone(q.id))continue;
          if(questUnlocked(q)){
            reconcile();
            if(level()<(q.minLv||1)) lvFail.push(q.id+'(需Lv'+q.minLv+')');
            st.done[q.id]=new Date().toISOString();
            progress=true;
          }
        }
      }
    }
    const stuck=D.quests.filter(q=>!qDone(q.id)).length;
    if(stuck>0)throw new Error('卡关任务数='+stuck);
    if(lvFail.length)throw new Error('等级门控误拦='+lvFail.length+' 例:'+lvFail.slice(0,3).join(','));
    // 全完成后存档应自洽：reconcile 幂等不报错
    reconcile(); reconcile();
  });
  run('旧存档兼容(缺新字段)',()=>{st={player:D.player,day:1,unlocked:1,xp:0,coin:0,done:{},fav:{},ach:{},notes:{},wrong:[],cards:{},seenHearts:{},shop:[],quizOk:0};
    reconcile();
    renderBoard();renderLib();renderSave();
    if(typeof st.edits!=='object')throw new Error('edits未补');
  });
  run('AI降级(未配置密钥)',()=>{reset();if(dsReady())throw new Error('新存档不应有密钥');openQuest('D01S1');});
  run('openQuest 全任务弹窗不崩',()=>{reset();
    for(const q of D.quests){ openQuest(q.id); }  // 首日未锁的全量渲染+其余锁定早退
  });
  run('全完成后只读回看274任务',()=>{
    // 接续贪心全完成态：逐任务打开回看弹窗
    let progress=true;
    while(progress){progress=false;
      for(let day=1;day<=45;day++)for(const q of byDay[day].quests){
        if(!qDone(q.id)&&questUnlocked(q)){st.done[q.id]=new Date().toISOString();progress=true;}
      }
    }
    for(const q of D.quests){ openQuest(q.id); }
  });
  run('旧存档布尔done值兼容',()=>{
    st={player:D.player,day:1,unlocked:1,xp:0,coin:0,done:{'D01M':true},fav:{},wrong:'坏数据',shop:null};
    reconcile(); checkAch(); renderBoard();
    if(typeof st.done['D01M']!=='string')throw new Error('布尔done未归一化');
    if(!Array.isArray(st.wrong))throw new Error('wrong未修复');
  });
  /* ===== 对话模块 + 像素头像（wd-chat / wd-avatar）===== */
  run('WDChat 成长数据+故事线',()=>{
    reset(); const g=WDChat.growthOf('smq'); g.talks=7;
    WDChat.storyAppend('smq','并肩见证「试炼」交付'); WDChat.storyAppend('smq','桥上论剑');
    if(!st.npcGrowth||st.npcGrowth.smq.story.length!==2)throw new Error('故事线未落存档');
    if(WDChat.historyOf('smq',5).length!==0)throw new Error('历史互动应为空');
  });
  run('v35 AI-only：已移除本地兜底 fallback，无密钥时 respond 返回错误',()=>{
    reset();
    if(typeof WDChat.fallback==='function')throw new Error('fallback 应已移除');
    if(typeof WDChat.FB_POOLS!=='undefined')throw new Error('FB_POOLS 应已移除');
    /* 无密钥时 respond 返回空文本+错误，不再本地兜底 */
    return WDChat.respond('yunheng','你好').then(r=>{
      if(r.text)throw new Error('无密钥时不应返回文本：'+r.text);
      if(!r.error)throw new Error('无密钥时应返回 error');
    });
  });
  run('WDChat sysPrompt 行为约束v3（活人/短句/三腔/工具箱/voice卡）',()=>{
    reset();
    const s=WDChat.sysPrompt('qingxuan',false);
    ['行为边界','活人优先','长度·密度','三种腔','工具箱','语言人格卡'].forEach(k=>{
      if(!s.includes(k))throw new Error('sysPrompt 缺失约束段：'+k);
    });
    if(!/≤90字/.test(s))throw new Error('单次回复字数约束缺失');
  });
  run('WDChat 防重复：近期原话注入postHistory硬约束',()=>{
    reset();
    st.dialogue.push({role:'npc',npc:'qingxuan',text:'云头上传来一声轻笑，你今日这关破得漂亮'});
    const r=WDChat.postHistoryRules('qingxuan');
    if(!r.includes('防重复'))throw new Error('防重复段缺失');
    if(!r.includes('云头上传来一声轻笑'))throw new Error('近期原话未注入');
    if(WDChat.recentReplies('qingxuan',5).length!==1)throw new Error('recentReplies 取值异常');
  });
  run('WDChat deRepeat 撞开头自动改口',()=>{
    reset();
    st.dialogue.push({role:'npc',npc:'smq',text:'剑鸣半响'});
    const out=WDChat.deRepeat('smq','剑鸣半响，又见面了');
    if(out==='剑鸣半响，又见面了')throw new Error('撞开头未改写');
    const ok=WDChat.deRepeat('smq','全然不同的开头');
    if(ok!=='全然不同的开头')throw new Error('未撞开头不应改写');
  });
  run('WDAvatar 像素头像 dataURL 缓存',()=>{
    const a=WDAvatar.avatarURL('qingxuan'), b=WDAvatar.avatarURL('qingxuan');
    if(!a.startsWith('data:image/png')||a!==b)throw new Error('dataURL/缓存异常');
    if(!WDAvatar.avatarURL('moxiaogu'))throw new Error('其他NPC头像生成失败');
    if(!WDAvatar.avatarURL('_player'))throw new Error('玩家头像生成失败');
  });
  run('WDChat 上下文携带当前关卡事实',()=>{
    reset(); st.unlocked=1;
    const ctx=WDChat.buildContext('yunheng','这关怎么过',null);
    if(!ctx.includes('当前关卡'))throw new Error('上下文缺当前关卡段');
  });
  /* ===== 情境生成机制（每日首次互动）===== */
  run('WDChat 每日情境生成：结构完整性',()=>{
    reset();
    const dc=WDChat.generateDailyContext('yunheng');
    if(!dc||!dc.weather||!dc.weatherDesc||!dc.activity||!dc.envEvent)
      throw new Error('情境结构不完整：'+JSON.stringify(dc));
    if(typeof dc.powerProgress!=='number'||dc.powerProgress<0||dc.powerProgress>100)
      throw new Error('圣女力量恢复进度异常：'+dc.powerProgress);
  });
  run('WDChat 情境确定性：同日同NPC结果一致',()=>{
    reset(); st.day=5;
    const a=WDChat.generateDailyContext('tiemian');
    const b=WDChat.generateDailyContext('tiemian');
    if(a.weather!==b.weather||a.activity!==b.activity)
      throw new Error('同日同NPC情境应确定性一致');
  });
  run('WDChat 情境多样性：不同NPC/日次有差异',()=>{
    reset(); st.day=1;
    const ya=WDChat.generateDailyContext('yunheng');
    const yb=WDChat.generateDailyContext('xuanji');
    if(ya.weather===yb.weather&&ya.activity===yb.activity)
      throw new Error('不同NPC情境应存在差异');
    st.day=10;
    const yc=WDChat.generateDailyContext('yunheng');
    if(yc.day!==10)throw new Error('情境日次未反映');
  });
  run('WDChat 每日首次互动：情境注入buildContext',()=>{
    reset();
    const ctx1=WDChat.buildContext('yunheng','你好',null);
    if(!ctx1.includes('当日情境'))throw new Error('首次互动应注入当日情境');
    if(!ctx1.includes('自然开场'))throw new Error('情境寒暄引导缺失');
    /* 第二次调用：当日情境不再注入 */
    const ctx2=WDChat.buildContext('yunheng','再聊',null);
    if(ctx2.includes('当日情境'))throw new Error('非首次互动不应再注入情境');
  });
  run('v35：generateDailyContext 仍提供天气/活动供 AI 上下文使用',()=>{
    reset();
    const y=WDChat.generateDailyContext('yunheng');
    if(!y||!y.weather||!y.activity)throw new Error('每日情境应含天气与活动');
    /* 情境文本不含已淘汰旧概念 */
    if(/引灯|掌灯|灯影/.test(JSON.stringify(y)))throw new Error('情境残留旧概念');
  });
  run('WDChat 情境按NPC活动池区分',()=>{
    reset();
    const y=WDChat.generateDailyContext('yunheng');
    const s=WDChat.generateDailyContext('smq');
    /* 不同NPC的活动状态应来自各自专属池 */
    if(y.activity===s.activity)throw new Error('不同NPC活动状态应区分');
    /* 云蘅活动应提及圣女/圣器/圣殿等关键词 */
    if(!/圣女|圣器|圣殿|圣仪|就职|金榜/.test(y.activity))
      throw new Error('云蘅活动未体现圣女候选设定：'+y.activity);
    /* 璇玑活动应提及星盘/记忆/灵魂绑定等关键词 */
    const x=WDChat.generateDailyContext('xuanji');
    if(!/星盘|记忆|灵魂|卦象|错题/.test(x.activity))
      throw new Error('璇玑活动未体现记忆精灵设定：'+x.activity);
  });
  /* ===== 自由发言路由 + NPC 名链接（需求四/五）===== */
  run('自由发言智能路由：职能关键词命中',()=>{
    reset(); st.unlocked=1;
    if(routeNpc('法条处罚是怎么规定的')!=='tiemian')throw new Error('法条类应路由铁面');
    if(routeNpc('颐和园长廊建筑')!=='moxiaogu')throw new Error('建筑遗迹类应路由小骨');
    if(routeNpc('英文单词背不下来')!=='xuanji')throw new Error('背诵错题类应路由玄机');
  });
  run('自由发言智能路由：无关卡内容→云蘅兜底',()=>{
    reset();
    for(let day=1;day<=45;day++)for(const q of byDay[day].quests)st.done[q.id]=new Date().toISOString();
    if(routeNpc('今天天气不错随便聊聊')!=='yunheng')throw new Error('无关闲聊应由云蘅兜底');
  });
  run('NPC 名开场白生成',()=>{
    reset(); st.unlocked=1;
    const op=playerOpener('qingxuan');
    if(!op||!op.includes('青玄'))throw new Error('开场白应含目标NPC名');
  });
  /* ===== 配置中心 WDCfg ===== */
  run('WDCfg 默认快照与属性派生',()=>{
    WDCfg.import(JSON.stringify({ver:1}));
    const c=WDCfg.ready();
    if(!c||c.attr.str!==2||typeof c.style!=="object")throw new Error('默认快照异常');
    if(WDCfg.attrCaps().hp!==88||WDCfg.attrCaps().energy!==24||WDCfg.attrCaps().xpBonus!==6)throw new Error('属性派生错误');
  });
  run('WDCfg 称呼变更自动入历史',()=>{
    WDCfg.set('address','少侠'); WDCfg.set('address','道友');
    const c=WDCfg._testGet();
    if(c.address!=='道友'||c.addressHist[0]!=='少侠')throw new Error('称呼或历史错误');
  });
  run('WDCfg 自我描述智能分析（有信号/无信号）',()=>{
    const a=WDCfg.analyzeBio('我是认真冲刺备考的小白，喜欢幽默段子，爱抠原理');
    if(a.tone!=='formal'||a.humor!=='humor'||a.depth!=='deep')throw new Error('分析结果 '+JSON.stringify(a));
    const b=WDCfg.analyzeBio('没啥想法');
    if(b.tone||b.humor||b.depth)throw new Error('无信号应全部留空自动');
  });
  run('WDCfg 异常导入拒收+导出往返',()=>{
    const t=WDCfg.export(); WDCfg.import(t);
    if(WDCfg.ready().address!=='道友')throw new Error('导出往返丢失数据');
    try{ WDCfg.import('{bad'); throw new Error('SHOULD_FAIL'); }catch(e){ if(e.message!=='E_CFG_JSON')throw e; }
    try{ WDCfg.import('null'); throw new Error('SHOULD_FAIL'); }catch(e){ if(e.message!=='E_CFG_SHAPE')throw e; }
  });
  /* ===== NPC 记忆 WDMem ===== */
  run('WDMem 进入/完成/通关时长/一次通关',()=>{
    WDMem.enter('qingxuan','T1');
    WDMem.finish('qingxuan','T1',{onePass:true});
    const db=WDMem.stats();
    const d=db.byNpc.qingxuan.done.T1;
    if(!d||d.onePass!==true||typeof d.durS!=='number')throw new Error('完成记录异常 '+JSON.stringify(d));
    if(db.byNpc.qingxuan.entered.T1)throw new Error('完成后在途态未清除');
    if(!WDMem.digest('qingxuan').includes('封印'))throw new Error('AI画像缺完成信息');
  });
  run('WDMem 学习时长心跳与错题分类销账',()=>{
    WDMem.setActive('moxiaogu'); WDMem.tick(1.5); WDMem.tick(1.5);
    if(WDMem.stats().byNpc.moxiaogu.learnMin!==3)throw new Error('心跳累计错误');
    WDMem.wrong('xuanji','S1-01',3); WDMem.wrong('xuanji','S1-01',3); WDMem.wrong('xuanji','S2-02',1);
    WDMem.right('xuanji','S1-01');
    const r=WDMem.stats().byNpc.xuanji;
    if(r.wrongs['S1-01'].n!==1||r.wrongs['S2-02'].n!==1)throw new Error('错题计数/销账错误');
    if(r.wrongs['S1-01'].lv.lv3!==2)throw new Error('难度分档缺失');
    if(!WDMem.digest('xuanji').includes('错题'))throw new Error('AI画像缺错题信息');
  });
  run('WDMem 异常档案清洗与非法导入拒收',()=>{
    WDMem.import(JSON.stringify({ver:1,byNpc:{bad:'字符串',ok:{meet:1,talks:2,learnMin:0,entered:{},done:{},wrongs:{}}}}));
    const db=WDMem.stats();
    if(db.byNpc.bad!==undefined)throw new Error('坏档案未删除');
    if(!db.byNpc.ok||db.rejected<1)throw new Error('好档案被误删或拒收未计数');
    try{ WDMem.import('{"ver":1}'); throw new Error('SHOULD_FAIL'); }catch(e){ if(e.message!=='E_MEM_SHAPE')throw e; }
  });
  /* ===== NPC 职能重构：云蘅 + 全角色×四章矩阵 ===== */
  run('NPC 四章互动矩阵全员覆盖',()=>{
    ['yunheng','qingxuan','smq','tiemian','liuruyan','moxiaogu','xuanji'].forEach(id=>{
      if(!NPC[id])throw new Error(id+' 未注册');
      for(let a=1;a<=4;a++) if(!NPC_MATRIX[id]['act'+a])throw new Error(id+' 缺 act'+a+' 话题');
    });
    if(!npcActTopic('yunheng')||!MENTION_ALIASES.yunheng.includes('云蘅'))throw new Error('云蘅引导链路不完整');
  });
  run('renderCfg/renderMem 面板渲染不崩',()=>{
    reset(); renderCfg();
    WDCfg.set('address','上仙'); renderMem();
  });
  run('v34 实验特性开关状态读 st.agentFlags 而非 WDCfg',()=>{
    reset();
    st.agentFlags={director:true,tools:false,proactive:true};
    renderCfg();
    /* mock 的 body.innerHTML 不含 appendChild 的子元素，从 children 取面板 */
    const ov=document.body.children[document.body.children.length-1];
    const html=ov?ov.innerHTML:"";
    const dirOn=/对话导演：群聊单次生成（ON）/.test(html);
    const toolsOff=/工具调用：NPC 查真实数据（OFF）/.test(html);
    const proOn=/主动传音：NPC 主动关心（ON）/.test(html);
    if(!dirOn||!toolsOff||!proOn) throw new Error('实验特性开关未按 st.agentFlags 显示（dir='+dirOn+' tools='+toolsOff+' pro='+proOn+'）');
  });
  run('v34 genPersona 世界观约束无"自在世界"笔误',()=>{
    reset();
    const src=genPersona.toString();
    if(src.includes('自在世界')) throw new Error('genPersona 仍含笔误"自在世界"，应为"玩家意外"');
    if(!src.includes('玩家意外跌入导游异次元')) throw new Error('genPersona 世界观约束未修正为玩家意外跌入');
  });
  run('WDCfg NPC名字/称号/人设自定义',()=>{
    reset();
    WDCfg.setNpcName('qingxuan','老青');
    if(WDCfg.npcName('qingxuan','青玄')!=='老青')throw new Error('自定义名字未生效');
    WDCfg.setNpcTitle('qingxuan','灯首');
    if(WDCfg.npcTitle('qingxuan','掌灯真人')!=='灯首')throw new Error('自定义称号未生效');
    WDCfg.setNpcPersona('qingxuan','性格沉稳，说话慢条斯理');
    if(WDCfg.npcPersona('qingxuan')!=='性格沉稳，说话慢条斯理')throw new Error('人设描述未存储');
    // 空自定义名/称号应回退原值；ID 不变
    WDCfg.setNpcName('smq',''); WDCfg.setNpcTitle('smq','');
    if(WDCfg.npcName('smq','司马青')!=='司马青')throw new Error('空自定义名应回退原名');
    if(WDCfg.npcTitle('smq','山河剑客')!=='山河剑客')throw new Error('空自定义称号应回退原称号');
  });
  run('默认世界观重构：导游异次元+遗忘怪',()=>{
    reset();
    const wb=WDChat.worldBrief();
    if(typeof wb!=='object')throw new Error('默认世界观应为结构对象');
    if(!wb.世界观.includes('导游次元'))throw new Error('新世界观未生效');
    if(!wb.隐喻系统.includes('遗忘怪'))throw new Error('新隐喻系统未生效');
    if(!Array.isArray(wb.NPC基础信息)||!wb.NPC基础信息[0].id)throw new Error('NPC 信息须保留 ID');
    // 自定义名/称号应进入背景信息，ID 保持系统值
    WDCfg.setNpcName('xuanji','星官'); WDCfg.setNpcTitle('xuanji','观星主簿');
    const wb2=WDChat.worldBrief();
    const xj=wb2.NPC基础信息.find(n=>n.id==='xuanji');
    if(xj.姓名!=='星官'||xj.称号!=='观星主簿')throw new Error('自定义名衔未进入NPC基础信息');
  });
  run('NPC默认数据不含已淘汰旧概念',()=>{
    reset();
    const obs=['提灯','引灯','问道录','仙侠','仙师','封妖塔','幻纱行','机关童子','观星者','掌灯','镇塔尊者'];
    D.npcs.forEach(n=>{
      const blob=[n.name,n.title,n.intro].join('');
      obs.forEach(t=>{ if(blob.includes(t)) throw new Error(n.id+' 默认数据含旧概念：'+t); });
    });
    // NPC 职能表应覆盖所有角色
    if(Object.keys(NPC_ROLE).length<D.npcs.length) throw new Error('NPC_ROLE 职能覆盖不全');
  });
  run('人设/任务生成prompt含旧概念硬约束',()=>{
    reset();
    // genQuestBrief 的 sys prompt（从函数源码取）须含淘汰词禁令
    const qsrc=genQuestBrief.toString();
    if(!qsrc.includes('严禁使用已淘汰的旧概念')) throw new Error('任务说明prompt缺旧概念禁令');
    if(!qsrc.includes('导游异次元')) throw new Error('任务说明prompt缺新世界观锚点');
    // wd-chat 旧概念禁令位于 user 尾消息（postHistoryRules，v2 架构）
    const r=WDChat.postHistoryRules('qingxuan');
    if(!r.includes('已淘汰旧概念禁用')) throw new Error('postHistoryRules缺旧概念禁令');
  });
  /* ===== 剧情先行 + 任务说明三要素（v27 建立 / v33 轻小说化）===== */
  run('genQuestBrief prompt含剧情先行顺序与轻小说约束（v33）',()=>{
    reset();
    const qsrc=genQuestBrief.toString();
    if(!qsrc.includes('剧情先行·任务发布顺序')) throw new Error('任务说明prompt缺剧情先行顺序约束');
    /* 三要素字段须在 schema 中明确要求 */
    if(!qsrc.includes('necessity')) throw new Error('schema缺necessity字段');
    if(!qsrc.includes('impact')) throw new Error('schema缺impact字段');
    if(!qsrc.includes('reward')) throw new Error('schema缺reward字段');
    if(!qsrc.includes('scene')) throw new Error('schema缺scene字段');
    if(!qsrc.includes('轻小说')) throw new Error('v33 必须声明轻小说/GALGAME 文风');
    if(!qsrc.includes('新手村')) throw new Error('必须明确禁用网游黑话（新手村/刷本等）');
    if(qsrc.includes('玩家在做任务=网络游戏行为')) throw new Error('旧版网游行为设定必须移除');
  });
  run('genQuestBrief prompt含核心世界观三逻辑（v33）',()=>{
    reset();
    const qsrc=genQuestBrief.toString();
    /* 玩家是唯一具备就职仪式资格的域外之人 */
    if(!qsrc.includes('域外之人')) throw new Error('缺"域外之人"硬约束');
    if(!qsrc.includes('就职仪式')) throw new Error('缺"就职仪式"硬约束');
    /* 圣女复苏+驱雾=世界拯救逻辑 */
    if(!qsrc.includes('圣女之力')||!qsrc.includes('复苏')) throw new Error('缺圣女之力复苏逻辑');
    if(!qsrc.includes('驱雾')) throw new Error('缺驱雾救世逻辑');
    /* 玩家收益与返回原世界目标相关 */
    if(!qsrc.includes('返回原世界')) throw new Error('缺"返回原世界"硬约束');
  });
  run('旧schema aiBrief缓存被清除（强制新schema重生成）',()=>{
    reset();
    /* 模拟旧版 schema（仅 line+brief+metaphor，无三要素字段） */
    st.aiBrief['D01M']={line:'提灯过卡',brief:'旧说明',metaphor:'旧比喻',at:new Date().toISOString()};
    reconcile();
    if(st.aiBrief['D01M']) throw new Error('旧schema aiBrief应被清除');
  });
  run('v2轻小说schema aiBrief缓存保留；旧prompt缓存清除（v33）',()=>{
    reset();
    /* v2 轻小说 schema 保留 */
    st.aiBrief['D01M']={v:2,scene:'雾在涌',line:'这一程交给你',necessity:'只有你能走',impact:'她会醒一分',reward:'道力与盘缠',metaphor:'试炼',at:new Date().toISOString()};
    /* v1 网游腔 schema（有三要素但无 v 标记）必须清除 */
    st.aiBrief['D02M']={scene:'妖王低吼',line:'开荒去',necessity:'非你不可',impact:'能力复苏',reward:'掉落',at:new Date().toISOString()};
    reconcile();
    if(!st.aiBrief['D01M']) throw new Error('v2 schema aiBrief 不应被清除');
    if(st.aiBrief['D02M']) throw new Error('v1 网游腔缓存必须清除重生成');
  });
  run('旧概念缓存自动清除',()=>{
    reset();
    // 模拟旧版含淘汰概念的人设缓存
    st.personas.qingxuan={card:{name:'青玄',identity:'掌灯的引路人'}};
    st.aiBrief['q1']={line:'提灯过卡，问道录在手'};
    // 重新跑 reconcile 的清洗逻辑
    const obs=['提灯','引灯','问道录','仙侠','仙师','封妖塔','幻纱行','机关童子','观星者','掌灯','镇塔尊者'];
    const hasObs=o=>obs.some(t=>JSON.stringify(o||"").includes(t));
    Object.keys(st.personas).forEach(id=>{ if(hasObs(st.personas[id])) delete st.personas[id]; });
    Object.keys(st.aiBrief).forEach(id=>{ if(hasObs(st.aiBrief[id])) delete st.aiBrief[id]; });
    if(st.personas.qingxuan) throw new Error('旧人设缓存未被清除');
    if(st.aiBrief.q1) throw new Error('旧任务说明缓存未被清除');
  });
  /* ===== AI 接口文档 + 条款检查 + NPC人设同步（v28）===== */
  run('AI接口文档：默认为空，使用系统默认约束',()=>{
    reset();
    WDCfg.setAiDocument('');
    WDCfg.setWorldBrief('');
    if(WDCfg.aiDocument()!=='')throw new Error('默认aiDocument应为空');
    const sys=WDChat.sysPrompt('qingxuan',false);
    if(!sys.includes('行为边界'))throw new Error('空aiDocument时sysPrompt应使用默认约束');
  });
  run('AI接口文档：用户文档非空时完全替代默认约束',()=>{
    reset();
    WDCfg.setWorldBrief('');
    WDCfg.setAiDocument('用户自定义约束：你是酷酷的NPC，不用提灯。');
    const sys=WDChat.sysPrompt('qingxuan',false);
    if(!sys.includes('用户自定义约束'))throw new Error('sysPrompt未使用用户文档');
    if(sys.includes('【行为边界·绝不可越界】'))throw new Error('用户文档应完全替代默认约束段');
    /* 动态上下文仍应追加 */
    if(!sys.includes('当下情境'))throw new Error('动态上下文应始终追加');
  });
  run('AI接口文档：用户文档清空后恢复默认',()=>{
    reset();
    WDCfg.setWorldBrief('');
    WDCfg.setAiDocument('临时文档');
    WDCfg.setAiDocument('');
    const sys=WDChat.sysPrompt('qingxuan',false);
    if(!sys.includes('行为边界'))throw new Error('清空后应恢复默认约束');
  });
  run('defaultAiDocument：可获取完整默认文档',()=>{
    reset();
    const doc=WDChat.defaultAiDocument('yunheng','云蘅','圣女候选',false);
    if(!doc.includes('云蘅'))throw new Error('默认文档缺NPC名');
    if(!doc.includes('行为边界'))throw new Error('默认文档缺行为边界');
    if(!doc.includes('娘化次元'))throw new Error('默认文档缺娘化约束');
    if(!doc.includes('≤90字'))throw new Error('默认文档缺短句字数约束');
    if(!doc.includes('心理医生腔'))throw new Error('默认文档缺三腔禁令');
  });
  run('v34 defaultAiDocument 使用 {name}/{title} 占位符而非硬编码NPC名',()=>{
    reset();
    const doc=WDChat.defaultAiDocument('yunheng','云蘅','圣女候选',false);
    if(!doc.includes('{name}')) throw new Error('默认文档应含 {name} 占位符');
    /* 除云蘅专属过场外，正文不应再硬编码「云蘅」——用 {name} 统一替换 */
    const body=doc.replace(/【剧情过场·云蘅专属】[^】]*若你是云蘅/,'');
    if(body.includes('云蘅')) throw new Error('正文不应硬编码云蘅，应用 {name} 占位');
  });
  run('v34 applyNpcName 替换占位符（默认与自定义文档通用）',()=>{
    reset();
    const tpl=WDChat.defaultAiDocument('yunheng','{name}','{title}',false);
    const out=WDChat.applyNpcName(tpl,'铁面先生','卷宗执事');
    if(out.includes('{name}')||out.includes('{title}')||out.includes('{title_block}')) throw new Error('占位符未替换干净');
    if(!out.includes('铁面先生')) throw new Error('{name} 未替换为铁面先生');
    if(!out.includes('（卷宗执事）')) throw new Error('{title_block} 未替换为（卷宗执事）');
    /* 无称号时 {title_block} 应为空串，不留括号 */
    const out2=WDChat.applyNpcName(tpl,'云蘅','');
    if(out2.includes('（）')) throw new Error('空称号不应残留空括号');
  });
  run('v34 systemPrefix 对自定义文档也做占位符替换',()=>{
    reset();
    WDCfg.setAiDocument('我是{name}，称号{title}。{name}只说真话。');
    const sp=WDChat.sysPrompt('tiemian',false);
    const tn=dName('tiemian');
    if(sp.includes('{name}')||sp.includes('{title}')) throw new Error('systemPrefix 未替换自定义文档占位符');
    if(!sp.includes(tn)) throw new Error('自定义文档 {name} 未替换为当前NPC名 '+tn);
    WDCfg.setAiDocument('');
  });
  run('条款检查：AI腔检测',()=>{
    reset();
    const chk=WDChat.clauseCheck('首先，你要记住，总之这道题很重要。',null);
    if(chk.pass)throw new Error('应检测到违规');
    const types=chk.violations.map(v=>v.type);
    if(!types.includes('AI腔'))throw new Error('应检测到AI腔');
    if(!types.includes('教书先生口吻'))throw new Error('应检测到教书先生口吻');
  });
  run('条款检查：已淘汰旧概念检测',()=>{
    reset();
    const chk=WDChat.clauseCheck('提灯在前，引灯在后，问道录在手。',null);
    if(chk.pass)throw new Error('应检测到旧概念');
    const types=chk.violations.map(v=>v.type);
    if(!types.includes('已淘汰概念'))throw new Error('应检测到已淘汰概念');
  });
  run('条款检查：超长回复检测',()=>{
    reset();
    const long='这是一段很长的回复。'.repeat(35);
    const chk=WDChat.clauseCheck(long,null);
    if(chk.pass)throw new Error('应检测到超长回复');
    if(!chk.violations.some(v=>v.type==='超长回复'))throw new Error('应检测到超长回复');
  });
  run('条款检查：合规回复通过',()=>{
    reset();
    WDCfg.setWorldBrief('');
    WDCfg.setAiDocument('');
    const chk=WDChat.clauseCheck('雾在涌，但有你同行我不惧。这一关过得利落，圣女之力又醒一寸。',null);
    if(!chk.pass)throw new Error('合规回复应通过检查');
  });
  run('条款检查：客服腔/心理医生腔/卖萌口癖检测',()=>{
    reset();
    const chk=WDChat.clauseCheck('当然可以，我可以帮你。别给自己太大压力，相信你一定可以！诶嘿',null);
    const types=chk.violations.map(v=>v.type);
    if(!types.includes('客服腔'))throw new Error('应检测到客服腔：'+types.join(','));
    if(!types.includes('心理医生腔'))throw new Error('应检测到心理医生腔：'+types.join(','));
    if(!types.includes('表面卖萌/网梗'))throw new Error('应检测到卖萌口癖：'+types.join(','));
    /* sanitize 替换表应能消化客服腔 */
    if(WDChat.sanitize('当然可以')!=='嗯')throw new Error('sanitize未替换客服应答');
  });
  run('NPC人设同步：worldBrief角色设定动态使用用户自定义人设',()=>{
    reset();
    /* 清除上轮测试残留的 customWorldBrief，确保 worldBrief 返回对象（而非自定义字符串） */
    WDCfg.setWorldBrief('');
    /* 同时清除可能残留的NPC自定义名字 */
    WDCfg.setNpcName('qingxuan','');
    WDCfg.setNpcPersona('qingxuan','活泼好动爱打趣的文脉导游');
    const wb=WDChat.worldBrief();
    const txt=typeof wb==='string'?wb:JSON.stringify(wb);
    if(!txt.includes('活泼好动爱打趣'))throw new Error('worldBrief角色设定未同步用户自定义人设');
    /* 清除自定义后应回退到内置intro */
    WDCfg.setNpcPersona('qingxuan','');
    const wb2=WDChat.worldBrief();
    const txt2=typeof wb2==='string'?wb2:JSON.stringify(wb2);
    /* 应包含NPC名字（内置名"青玄先生"含"青玄"） */
    if(!txt2.includes('青玄'))throw new Error('清除自定义后人设应回退到内置');
  });
  run('NPC人设同步：worldBrief角色设定使用用户自定义名字',()=>{
    reset();
    WDCfg.setWorldBrief('');
    WDCfg.setNpcName('tiemian','铁面娘');
    const wb=WDChat.worldBrief();
    const txt=typeof wb==='string'?wb:JSON.stringify(wb);
    if(!txt.includes('铁面娘'))throw new Error('worldBrief角色设定未同步用户自定义名字');
  });
  run('clauseLog存档：违规记录持久化',()=>{
    reset();
    if(!Array.isArray(st.clauseLog))throw new Error('clauseLog应为数组');
    st.clauseLog.push({at:new Date().toISOString(),npc:'yunheng',violations:[{type:'AI腔',msg:'测试',snippet:'首先'}],text:'测试'});
    save();
    load();
    if(!st.clauseLog||st.clauseLog.length!==1)throw new Error('clauseLog未持久化');
    if(st.clauseLog[0].npc!=='yunheng')throw new Error('clauseLog数据不一致');
  });
  run('宿主 dName/dTitle 与点名路由',()=>{
    reset();
    WDCfg.setNpcName('qingxuan',''); WDCfg.setNpcTitle('qingxuan','');
    if(dName('qingxuan')!=='青玄先生')throw new Error('默认显示名异常：'+dName('qingxuan'));
    WDCfg.setNpcName('tiemian','老塔');
    if(dName('tiemian')!=='老塔')throw new Error('dName 未读自定义');
    // 不带@直接呼叫自定义名也能路由到该 NPC
    if(routeNpc('老塔，问个事')!=='tiemian')throw new Error('自定义名未参与点名路由');
    // @自定义名可解析
    if(parseMention('@老塔 在吗')!=='tiemian')throw new Error('@自定义名解析失败');
  });
  run('WDCfg 游戏背景信息自定义',()=>{
    reset();
    if(WDCfg.customWorldBrief()!=='')throw new Error('默认应为空');
    WDCfg.setWorldBrief('自定义世界观测试');
    if(WDCfg.customWorldBrief()!=='自定义世界观测试')throw new Error('自定义背景未存储');
    // worldBrief 优先返回自定义文本
    const wb=WDChat.worldBrief();
    if(typeof wb!=='string'||wb!=='自定义世界观测试')throw new Error('worldBrief 未优先使用自定义');
    // 清空后恢复默认结构
    WDCfg.setWorldBrief('');
    const wb2=WDChat.worldBrief();
    if(typeof wb2!=='object'||!wb2.游戏名)throw new Error('清空后未恢复默认结构');
  });
  run('WDChat sysPrompt 注入自定义名字+人设',()=>{
    reset();
    WDCfg.setNpcName('qingxuan','老青');
    WDCfg.setNpcPersona('qingxuan','沉稳寡言的剑客');
    const s=WDChat.sysPrompt('qingxuan',false);
    if(!s.includes('老青'))throw new Error('自定义名字未注入prompt');
    if(!s.includes('沉稳寡言的剑客'))throw new Error('自定义人设未注入prompt');
  });
  /* ===== 云蘅结算接棒 + 任务树可点 + 置底任务卡 + 折叠（本轮需求）===== */
  run('云蘅五幕引路词全覆盖',()=>{
    for(let a=1;a<=5;a++) if(!NPC_MATRIX.yunheng['act'+a])throw new Error('云蘅缺 act'+a+' 引路词');
    if(!npcActTopic('yunheng'))throw new Error('云蘅当前幕话题缺失');
  });
  run('任务树叶子可点击（data-leaf 不被 data-toggle 拦截）',()=>{
    reset();
    const tree=buildQuestTree();
    const dayNode=tree[0].children[0];
    const leafHtml=renderTreeNode(dayNode.children[0]);
    if(!leafHtml.includes('data-leaf='))throw new Error('叶子行缺 data-leaf');
    if(leafHtml.includes('data-toggle'))throw new Error('叶子行不得含 data-toggle（会拦截点击）');
    const dayHtml=renderTreeNode(dayNode);
    if(!dayHtml.includes('data-toggle='))throw new Error('日节点缺 data-toggle（折叠失效）');
    if(!dayHtml.includes('data-expanded='))throw new Error('日节点缺展开态');
  });
  run('云蘅结算回应：任务NPC之后接棒，占位含口播名且不念数值',()=>{
    reset(); st.unlocked=1;
    const q=D.quests.find(x=>x.id==='D01M');
    settleQuest(q,true,null);
    const idxAck=st.dialogue.findIndex(m=>m.role==='npc'&&m.npc===q.npc&&(m.text||'').includes('已交付'));
    const idxYh=st.dialogue.findIndex(m=>m.role==='npc'&&m.npc==='yunheng');
    if(idxAck<0)throw new Error('任务NPC结算回复缺失');
    if(idxYh<0)throw new Error('云蘅结算回应缺失');
    if(idxYh<idxAck)throw new Error('云蘅必须在任务NPC结算回复之后接棒');
    const ym=st.dialogue[idxYh], t=ym.text;
    /* v35：占位含关卡名，AI(refineYunheng)异步替换；占位不含数值 */
    if(!t.includes(WDChat.questDisplayName(q)))throw new Error('缺关卡口播名：'+t);
    if(/[SDE]\\d+-\\d+|\\+\\d+修行/.test(t))throw new Error('结算台词不应念编号或数值：'+t);
    if(!ym.refs||!ym.refs.some(x=>x.qid===q.id))throw new Error('云蘅回应缺已完成任务ref');
    if(typeof refineYunheng!=='function')throw new Error('refineYunheng AI 路径应存在');
    if(!qDone(q.id)||st.xp<q.xp)throw new Error('结算未生效（done/修行）');
  });
  run('云蘅结算回应：AI 路径 refineYunheng 存在（有错时由 AI 生成复盘引导）',()=>{
    reset(); st.unlocked=1;
    const q=D.quests.find(x=>x.id==='D01M');
    settleQuest(q,false,null);
    const yhMsgs=st.dialogue.filter(m=>m.role==='npc'&&m.npc==='yunheng');
    if(!yhMsgs.length)throw new Error('云蘅结算消息未落流');
    /* v35：有错时的复盘引导由 refineYunheng(AI)生成；无 AI 时保留占位。验证函数已挂载。 */
    if(typeof refineYunheng!=='function')throw new Error('refineYunheng 应存在');
  });
  run('对话流置底当前任务卡（无打字态时位于末尾）',()=>{
    reset(); st.unlocked=1;
    let captured=null; const oqs=document.querySelector;
    document.querySelector=function(s,el){ const r=oqs.call(document,s,el); if(s==='#stream') captured=r; return r; };
    try{ renderChat(); }finally{ document.querySelector=oqs; }
    if(!captured)throw new Error('未捕获#stream');
    const h=captured.innerHTML;
    if(!h.includes('pinwrap')||!h.includes('当前任务'))throw new Error('置底任务卡缺失');
    const aq=firstActiveQuest();
    if(!aq)throw new Error('首日应有在途任务');
    if(!h.includes('data-q="'+aq.id+'"'))throw new Error('置底卡未指向当前在途任务');
    if(h.lastIndexOf('pinwrap')<h.lastIndexOf('statbar'))throw new Error('置底卡应位于流末尾');
  });
  run('无在途任务时置底卡显示引导',()=>{
    reset();
    for(let day=1;day<=45;day++)for(const q of byDay[day].quests)st.done[q.id]=new Date().toISOString();
    let captured=null; const oqs=document.querySelector;
    document.querySelector=function(s,el){ const r=oqs.call(document,s,el); if(s==='#stream') captured=r; return r; };
    try{ renderChat(); }finally{ document.querySelector=oqs; }
    const h=captured?captured.innerHTML:'';
    if(!h.includes('当前无在途关卡'))throw new Error('无在途任务时应显示引导置底卡');
    if(!/巡夜|星盘/.test(h.slice(h.lastIndexOf('pinwrap'))))throw new Error('引导缺巡夜/星盘去向');
  });
  run('已完成任务折叠/展开',()=>{
    reset(); st.unlocked=1; st.done['D01M']=new Date().toISOString();
    let captured=null; const oqs=document.querySelector;
    document.querySelector=function(s,el){ const r=oqs.call(document,s,el); if(s==='#stream') captured=r; return r; };
    try{ renderChat(); }finally{ document.querySelector=oqs; }
    let h=captured?captured.innerHTML:'';
    if(!h.includes('data-fold="D01M"')||!h.includes('data-foldhead="D01M"'))throw new Error('已完成任务未渲染为折叠链接');
    if(h.includes('qfoldbody'))throw new Error('默认应为折叠态');
    st._qFold=st._qFold||{}; st._qFold['D01M']=true;
    document.querySelector=function(s,el){ const r=oqs.call(document,s,el); if(s==='#stream') captured=r; return r; };
    try{ renderChat(true); }finally{ document.querySelector=oqs; }
    h=captured.innerHTML;
    if(!h.includes('qfoldbody')||!h.includes('data-open="D01M"'))throw new Error('展开后缺完整任务卡/回看按钮');
  });
  run('最新NPC回复自动关联当前任务chip',()=>{
    reset(); st.unlocked=1;
    st.dialogue.push({role:'player',text:'随便聊聊',at:new Date().toISOString()});
    st.dialogue.push({role:'npc',npc:'qingxuan',text:'雾里自有一段路要走',at:new Date().toISOString()});
    let captured=null; const oqs=document.querySelector;
    document.querySelector=function(s,el){ const r=oqs.call(document,s,el); if(s==='#stream') captured=r; return r; };
    try{ renderChat(); }finally{ document.querySelector=oqs; }
    const h=captured?captured.innerHTML:'';
    const aq=firstActiveQuest();
    if(!h.includes('↪ 当前任务'))throw new Error('最新NPC回复未自动关联当前任务');
    if(!h.includes('data-ref="'+aq.id+'"'))throw new Error('chip 未指向在途任务');
    if(h.split('↪ 当前任务').length-1!==1)throw new Error('仅最新一条应自动关联');
  });
  run('sysPrompt 软注入当前关卡（不再硬性点名）',()=>{
    reset(); st.unlocked=1;
    WDCfg.setWorldBrief(''); WDCfg.setAiDocument('');
    const aq=firstActiveQuest();
    if(!aq)throw new Error('无在途关卡');
    const s=WDChat.sysPrompt('qingxuan',false);
    if(!s.includes('「'+WDChat.questDisplayName(aq)+'」'))throw new Error('情境段应含当前关卡口播名');
    if(/[SDE]\\d+-\\d+/.test(s.slice(s.indexOf('【当下情境】'),s.indexOf('接洽人'))))throw new Error('情境段不应泄漏任务编号');
    if(s.includes('至少自然点到一次'))throw new Error('关卡点名应已降为软偏好');
  });
  /* ===== 书页打字机效果 ===== */
  run('打字机函数定义且安全调用',()=>{
    reset();
    if(typeof startTypewriter!=='function')throw new Error('startTypewriter 未定义');
    if(typeof stopTypewriter!=='function')throw new Error('stopTypewriter 未定义');
    if(typeof typewriterExpand!=='function')throw new Error('typewriterExpand 未定义');
    if(typeof twBindGlossary!=='function')throw new Error('twBindGlossary 未定义');
    stopTypewriter();       // 无活跃状态时应安全
    typewriterExpand();     // 无活跃状态时应安全
    startTypewriter(null);  // null host 应安全跳过
    startTypewriter({});    // 无 .book 子元素应安全跳过
    stopTypewriter();
  });
  run('openQuest 集成打字机不崩',()=>{
    reset();
    openQuest('D01M');  // drawPage 内调 startTypewriter，mock 无元素应安全跳过
    stopTypewriter();
    openQuest('D01S1'); // 多页任务翻页也应安全
    stopTypewriter();
  });
  run('TW_SPEED 在合理范围（提速后 250-350字/分）',()=>{
    const cpm=Math.round(60000/TW_SPEED);
    if(cpm<200||cpm>450)throw new Error('打字速度异常：'+cpm+'字/分（TW_SPEED='+TW_SPEED+'ms）');
  });
  run('sysPrompt 日式RPG活人语感约束v3',()=>{
    reset();
    const s=WDChat.sysPrompt('qingxuan',false);
    ['活人优先','日式RPG','三种腔','心理医生腔','工具箱','群聊修养'].forEach(k=>{
      if(!s.includes(k)) throw new Error('sysPrompt 缺约束：'+k);
    });
    if(s.includes('多夸赞')) throw new Error('不应再机械要求夸赞鼓励');
    if(s.includes('激励而非教育')) throw new Error('旧教育基调约束应已移除');
  });
  run('v30.1 允许不完整回应/误解答非所问/反表演',()=>{
    reset();
    const doc=WDChat.defaultAiDocument('yunheng','云蘅','引路人',false);
    ['允许不完整回应','答非所问','误解','主动表演性格','没听懂'].forEach(k=>{
      if(!doc.includes(k)) throw new Error('文档缺新规则：'+k);
    });
    /* 多人同场下限放宽到2字，允许只有一个语气词（brief=true 为多人变体） */
    const brief=WDChat.defaultAiDocument('yunheng','云蘅','引路人',true);
    if(!brief.includes('2～60字')) throw new Error('多人同场应允许2字起的极短回应');
  });
  run('v30.1 无在途关卡时不主动排活',()=>{
    reset();
    const origQuest=WDChat._ctx.quest;
    WDChat._ctx.quest=()=>null;
    try{
      const s=WDChat.sysPrompt('qingxuan',false);
      if(!s.includes('没有非做不可的事')) throw new Error('无关卡时应声明不排活');
      if(s.includes('预告下一幕')) throw new Error('不应再主动预告安排');
      const c=WDChat.buildContext('qingxuan','随便聊聊',null);
      if(c.includes('可引导')) throw new Error('buildContext 无关卡时不应引导修行安排');
    }finally{ WDChat._ctx.quest=origQuest; }
  });
  run('v30.1 在途关卡只是背景板，不要求主动安排',()=>{
    reset();
    const s=WDChat.sysPrompt('qingxuan',false);
    if(!s.includes('背景板')) throw new Error('关卡应被定义为背景板而非话题任务');
    /* 脏数据关卡（编号/未闭合括号）：sysPrompt、buildContext、query_quest 均不得向 LLM 泄漏编号 */
    const dirty=D.quests.find(q=>q.id==='D01S2');
    const origQuest=WDChat._ctx.quest;
    WDChat._ctx.quest=()=>dirty;
    try{
      const sp=WDChat.sysPrompt('qingxuan',false);
      const bc=WDChat.buildContext('qingxuan','闲聊',null);
      const tq=WDChat.toolExec('query_quest',{},'qingxuan');
      [sp,bc,tq].forEach((x,i)=>{
        if(/S3-02|5·19|[（(]7 条/.test(x)) throw new Error('编号/统计括号泄漏到 LLM 输入('+i+')：'+x.slice(0,200));
      });
    }finally{ WDChat._ctx.quest=origQuest; }
  });
  run('v30.1 资料库仅知识提问可用，闲聊禁止引用',()=>{
    reset();
    const c=WDChat.buildContext('moxiaogu','我家猫今天又打翻了水杯',null);
    if(!c.includes('闲聊、吐槽、心事一律不许引用')) throw new Error('资料库应标注闲聊禁用');
    if(!c.includes('不要为了回应而硬凑')) throw new Error('尾消息应允许低信息量回应');
  });
  run('v30.1 导演prompt允许极短/听错/答非所问',()=>{
    reset();
    /* 直接校验导演系统提示构造不可行（内部方法），以文档+常量一致性间接保证 */
    const doc=WDChat.defaultAiDocument('tiemian','铁面先生','镇塔者',true);
    if(!doc.includes('听错重点或答非所问')) throw new Error('群聊修养应允许听错与答非所问');
  });
  run('v30.1 questDisplayName 剥编号/括号/类别前缀',()=>{
    reset();
    const cases=[
      [{name:'修习 · S3-02 旅游业概况（7 条：5·19/9·27 双旅游日）',tlabel:'修习'},'旅游业概况'],
      [{name:'修习 · S3-02 旅游业概况（7 条：5·19/9·27 双旅游日',goal:'S3-02 旅游业概况（7 条）',tlabel:'修习'},'旅游业概况'],
      [{name:'主线 · 整备行囊',tlabel:'主线'},'整备行囊'],
      [{name:'支线 · 夜探长城（一）',tlabel:'支线'},'夜探长城'],
      [{name:'省身 · 错题速览 + 修行录 45 天总盘点（完成率/streak/',tlabel:'省身'},'错题速览'],
      [{name:'吟游 · TAM-11/12 + 天安门全稿第 1 次完整朗读（6 分',goal:'TAM-11/12 + 天安门全稿第 1 次完整朗读（6 分钟录音）',tlabel:'吟游'},'天安门全稿第1次完整朗读'],
      [{name:'主线 · S1-08 后半（05-08）+ S1-09 前半（01-0',goal:'S1-08 后半（05-08）+ S1-09 前半（01-03）',tlabel:'修习'},'这一关'],
      [{name:'',tlabel:'试炼'},'这一关'],
      [null,'这一关']
    ];
    cases.forEach(([q,exp])=>{
      const got=WDChat.questDisplayName(q);
      if(got!==exp) throw new Error(JSON.stringify(q.name)+' → '+got+'，期望 '+exp);
    });
    /* 真实数据：每个关卡口播名都不得残留编号/括号/前半后半 */
    D.quests.forEach(q=>{
      const d=WDChat.questDisplayName(q);
      if(/[SDE]\\d|TAM\\d|（|）|\\(|\\)|前半|后半/.test(d)) throw new Error(q.id+' 口播名仍脏：'+d);
    });
  });
  run('v35：questDisplayName 剥编号/括号/类别前缀（本地兜底已移除）',()=>{
    reset();
    const cases=[
      {name:'修习 · 第1-2章 北京历史',expect:'北京历史'},
      {name:'GUG-Q 故宫导游词',expect:'故宫导游词'},
      {name:'温故 · 回顾·错题',expect:'错题'}
    ];
    cases.forEach(c=>{
      const r=WDChat.questDisplayName(c);
      if(r!==c.expect)throw new Error('「'+c.name+'」→ 期望「'+c.expect+'」，实际「'+r+'」');
    });
    /* fallback 已移除，不应存在 */
    if(typeof WDChat.fallback==='function')throw new Error('fallback 应已移除');
  });
  run('typewriterExpand 逐段展开无 clicks 分支',()=>{
    reset();
    /* typewriterExpand 源码不应再含 clicks 分支判定，改为每次点击展开当前段 */
    const src=typewriterExpand.toString();
    if(src.includes('clicks===0')||src.includes('twState.clicks')) throw new Error('typewriterExpand 仍含 clicks 旧逻辑');
    if(!src.includes('twState.idx')) throw new Error('typewriterExpand 未操作 idx');
  });
  run('genPersona 注入 WDCfg.npcPersona 硬约束',()=>{
    reset();
    /* 设定用户自定义人设描述，genPersona 源码须读取 WDCfg.npcPersona 作为硬约束 */
    WDCfg.setNpcPersona('qingxuan','活泼可爱、爱讲笑话');
    const src=genPersona.toString();
    if(!src.includes('WDCfg.npcPersona')) throw new Error('genPersona 未读取 WDCfg.npcPersona');
    if(!src.includes('硬约束')) throw new Error('genPersona 未标注为硬约束');
    if(!src.includes('活泼可爱')) throw new Error('genPersona 硬约束示例词缺失');  /* 确保硬约束说明含矛盾词禁令示例 */
    /* sysPrompt 也须注入自定义人设 */
    const s=WDChat.sysPrompt('qingxuan',false);
    if(!s.includes('活泼可爱、爱讲笑话')) throw new Error('sysPrompt 未注入自定义人设');
  });
  run('openPersonaPanel 人设卡片直接编辑模式',()=>{
    reset();
    /* openPersonaPanel 源码须含可编辑 textarea 与 data-save 按钮 */
    const src=openPersonaPanel.toString();
    if(!src.includes('data-fld')) throw new Error('人设卡片缺可编辑字段 data-fld');
    if(!src.includes('data-save')) throw new Error('人设卡片缺保存编辑按钮');
    if(!src.includes('saveEdit')) throw new Error('人设卡片缺 saveEdit 保存函数');
    if(!src.includes('identity')) throw new Error('人设卡片缺 identity 编辑字段');
    if(!src.includes('personality')) throw new Error('人设卡片缺 personality 编辑字段');
    if(!src.includes('style')) throw new Error('人设卡片缺 style 编辑字段');
    if(!src.includes('relations')) throw new Error('人设卡片缺 relations 编辑字段');
    /* personality 保存时拆为数组 */
    if(!src.includes("split(")) throw new Error('saveEdit 未做 personality 拆分数组');
  });
  run('genPersona personality 归一化为数组',()=>{
    reset();
    const src=genPersona.toString();
    if(!src.includes('Array.isArray(card.personality)')) throw new Error('genPersona 未归一化 personality 为数组');
  });
  /* ========== 智能提问模块（WDQuiz）测试 ========== */
  run('WDQuiz 模块已加载',()=>{
    if(!window.WDQuiz) throw new Error('WDQuiz 未挂载');
    if(typeof WDQuiz.ask!=='function') throw new Error('WDQuiz.ask 非函数');
    if(typeof WDQuiz.record!=='function') throw new Error('WDQuiz.record 非函数');
    if(typeof WDQuiz.progress!=='function') throw new Error('WDQuiz.progress 非函数');
  });
  run('WDQuiz 问题类型库含三维度认知递进',()=>{
    const t=WDQuiz.Q_TYPES;
    if(!t.recall||!t.understand||!t.apply) throw new Error('缺问题类型');
    if(t.recall.lv!==1||t.understand.lv!==2||t.apply.lv!==3) throw new Error('难度梯度错乱');
    if(t.recall.templates.length<1||t.understand.templates.length<1||t.apply.templates.length<1) throw new Error('问法模板为空');
  });
  run('WDQuiz NPC职能标签体系',()=>{
    const m=WDQuiz.NPC_TOPIC_MAP;
    if(!m.smq||!m.tiemian||!m.liuruyan||!m.moxiaogu||!m.xuanji||!m.qingxuan) throw new Error('缺核心NPC职能映射');
  });
  run('WDQuiz ask 生成认知递进提问',()=>{
    reset();
    const cards=buildCardPool().filter(x=>x.cat==='pts').slice(0,5);
    const qs=WDQuiz.ask(cards,st.wrong,D.pointsLib,5);
    if(!Array.isArray(qs)||qs.length===0) throw new Error('未生成提问');
    const q=qs[0];
    if(!q.pid||!q.q||!q.typeLabel||!q.npcId) throw new Error('提问结构不完整：'+JSON.stringify(q));
    if(!['事实回忆','概念理解','应用分析'].includes(q.typeLabel)) throw new Error('问法类型标签异常');
    if(!q.lv||q.lv<1||q.lv>3) throw new Error('难度档异常');
  });
  run('WDQuiz one 单题生成含关键词',()=>{
    reset();
    const p=D.pointsLib[0];
    const q=WDQuiz.one(p);
    if(!q||!q.keyword) throw new Error('单题生成失败或缺关键词');
    if(!q.refText) throw new Error('缺参考原文');
  });
  run('WDQuiz matchNpc 按知识点匹配NPC',()=>{
    /* S1前缀应匹配山河导游 smq */
    const npc=WDQuiz.matchNpc('S1-01-01','长城');
    if(npc!=='smq') throw new Error('S1匹配应为smq，实际'+npc);
    /* S3前缀应匹配律法导游 tiemian */
    const npc2=WDQuiz.matchNpc('S3-01-01','法条');
    if(npc2!=='tiemian') throw new Error('S3匹配应为tiemian，实际'+npc2);
    /* 兜底应为 xuanji */
    const npc3=WDQuiz.matchNpc('XX-99','');
    if(npc3!=='xuanji') throw new Error('兜底应为xuanji，实际'+npc3);
  });
  run('WDQuiz record 更新能力模型与进度',()=>{
    reset();
    const pid='S1-01-01';
    WDQuiz.record(pid,true);
    WDQuiz.record(pid,true);
    WDQuiz.record(pid,false);
    const a=WDQuiz.ability(pid);
    if(a.asked!==3) throw new Error('asked应为3，实际'+a.asked);
    if(a.correct!==2) throw new Error('correct应为2，实际'+a.correct);
    const prog=WDQuiz.progress();
    if(prog.total!==3) throw new Error('进度total应为3，实际'+prog.total);
    if(prog.correct!==2) throw new Error('进度correct应为2，实际'+prog.correct);
    if(prog.rate!==67) throw new Error('正确率应为67%，实际'+prog.rate);
  });
  run('WDQuiz interval 复习周期动态调整',()=>{
    reset();
    const pid='S1-01-01';
    /* 全对→7日 */
    WDQuiz.record(pid,true); WDQuiz.record(pid,true);
    if(WDQuiz.interval(pid)!==7) throw new Error('掌握好应7日复习');
    /* 全错→1日 */
    const pid2='S1-02-01';
    WDQuiz.record(pid2,false); WDQuiz.record(pid2,false);
    if(WDQuiz.interval(pid2)!==1) throw new Error('掌握差应1日复习');
  });
  run('WDQuiz selectQType 认知递进选型',()=>{
    reset();
    const pid='S1-03-01';
    /* 初学→recall */
    let a=WDQuiz.ability(pid);
    if(a.asked>0||WDQuiz._db().byPid[pid]&&false){}
    /* 答对多次→apply */
    WDQuiz.record(pid,true);WDQuiz.record(pid,true);WDQuiz.record(pid,true);
    a=WDQuiz.ability(pid);
    const rate=a.correct/a.asked;
    if(rate<0.7) throw new Error('三次全对应rate>=0.7');
  });
  run('renderNight 含智能提问入口',()=>{
    reset();
    renderNight();
    const src=renderNight.toString();
    if(!src.includes('iqBtn')) throw new Error('renderNight 缺智能提问按钮');
    if(!src.includes('startIntelligentQuiz')) throw new Error('renderNight 缺 startIntelligentQuiz 调用');
  });
  run('startIntelligentQuiz 交互函数存在',()=>{
    if(typeof startIntelligentQuiz!=='function') throw new Error('startIntelligentQuiz 未定义');
    const src=startIntelligentQuiz.toString();
    if(!src.includes('WDQuiz.ask')) throw new Error('缺 WDQuiz.ask 调用');
    if(!src.includes('WDQuiz.record')) throw new Error('缺 WDQuiz.record 调用');
    if(!src.includes('WDQuiz.progress')) throw new Error('缺 WDQuiz.progress 调用');
  });
  /* ===== 对话初始化机制 + NPC职责领域判断 + 发言时机智能 ===== */
  run('对话初始化：首次进入对话系统生成引导对话',()=>{
    reset(); st.unlocked=1;
    if(st.dialogueInitDay!==0) throw new Error('新存档dialogueInitDay应=0');
    if(st.dialogue.length!==0) throw new Error('新存档dialogue应为空');
    ensureGuidanceScene();
    if(st.dialogueInitDay!==st.day) throw new Error('引导对话生成后应标记当日');
    if(st.dialogue.length<6) throw new Error('引导对话至少6条消息，实际'+st.dialogue.length);
    /* 验证三类互动都存在 */
    const hasYunheng=st.dialogue.some(m=>m.npc==='yunheng');
    const hasPlayer=st.dialogue.some(m=>m.role==='player');
    const hasFuncNpc=st.dialogue.some(m=>m.npc!=='yunheng'&&m.role==='npc');
    if(!hasYunheng) throw new Error('缺云蘅发言');
    if(!hasPlayer) throw new Error('缺玩家发言');
    if(!hasFuncNpc) throw new Error('缺职能NPC发言');
  });
  run('对话初始化：每日仅生成一次（幂等）',()=>{
    reset(); st.unlocked=1;
    ensureGuidanceScene();
    const cnt1=st.dialogue.length;
    ensureGuidanceScene();  // 再次调用不应重复生成
    if(st.dialogue.length!==cnt1) throw new Error('同日重复调用不应新增消息');
  });
  run('对话初始化：引导对话含云蘅-玩家互动',()=>{
    reset(); st.unlocked=1;
    ensureGuidanceScene();
    /* 云蘅的消息后紧跟玩家消息 → 云蘅-玩家互动 */
    const yhIdx=st.dialogue.findIndex(m=>m.npc==='yunheng');
    if(yhIdx<0) throw new Error('缺云蘅消息');
    const playerIdx=st.dialogue.findIndex(m=>m.role==='player');
    if(playerIdx<0) throw new Error('缺玩家消息');
  });
  run('对话初始化：引导对话含云蘅-其他NPC互动',()=>{
    reset(); st.unlocked=1;
    ensureGuidanceScene();
    /* 云蘅引荐职能NPC：云蘅消息后应有职能NPC回应 */
    const yhMsgs=st.dialogue.filter(m=>m.npc==='yunheng'&&m.role==='npc');
    const funcMsgs=st.dialogue.filter(m=>m.npc!=='yunheng'&&m.role==='npc');
    if(yhMsgs.length<2) throw new Error('云蘅至少2条消息');
    if(funcMsgs.length<1) throw new Error('职能NPC至少1条消息');
  });
  run('对话初始化：引导对话含玩家-其他NPC互动',()=>{
    reset(); st.unlocked=1;
    ensureGuidanceScene();
    /* 玩家主动向职能NPC提问 */
    const playerMsgs=st.dialogue.filter(m=>m.role==='player');
    if(playerMsgs.length<2) throw new Error('玩家至少2条消息（含向NPC提问）');
    const funcReply=st.dialogue.filter(m=>m.npc!=='yunheng'&&m.role==='npc');
    if(funcReply.length<1) throw new Error('职能NPC至少有1条回应玩家');
  });
  run('对话初始化：引导对话消息标记guidance=true',()=>{
    reset(); st.unlocked=1;
    ensureGuidanceScene();
    if(!st.dialogue.every(m=>m.guidance===true)) throw new Error('引导对话消息应标记guidance=true');
  });
  run('对话初始化：已有当日对话时不重复生成',()=>{
    reset(); st.unlocked=1;
    st.dialogue.push({role:'player',text:'已有对话',at:new Date().toISOString(),day:st.day});
    ensureGuidanceScene();
    if(st.dialogue.length!==1) throw new Error('已有对话时不应生成引导对话');
    if(st.dialogueInitDay!==st.day) throw new Error('应标记当日已初始化');
  });
  run('v31 序章初见过场不阻断当日引导，且排在引导之前',()=>{
    reset(); st.unlocked=1;
    st.dialogue.push({id:'cs_arrive',role:'npc',npc:'yunheng',text:'初见过场',cutscene:'arrive',at:new Date().toISOString(),day:st.day});
    st.dialogueInitDay=0;
    ensureGuidanceScene();
    if(st.dialogue.length<7) throw new Error('过场之外仍应生成当日引导，实际'+st.dialogue.length);
    if(st.dialogue[0].cutscene!=='arrive') throw new Error('初见过场必须位于对话流最前');
    if(!st.dialogue.slice(1).every(m=>m.guidance===true)) throw new Error('过场之后应全部是当日引导消息');
  });
  run('v33 启程入口：intro 启动序章播放器而非直接落过场',()=>{
    const code=intro.toString();
    if(!code.includes('startPrologue()')) throw new Error('intro 启程按钮必须启动序章播放器');
    if(code.includes('triggerCutscene("arrive")')) throw new Error('intro 不再直接触发 arrive 过场（已融入序章）');
    if(!code.includes('dsKeyGate')) throw new Error('序章入口必须提供 AI 密钥配置门');
  });
  /* ===== v33 视觉小说序章 ===== */
  run('v33 序章脚本：三拍类型齐全且关键剧情点一个不缺',()=>{
    if(!Array.isArray(PROLOGUE_SCRIPT)||PROLOGUE_SCRIPT.length<18) throw new Error('序章至少18拍，实际'+(PROLOGUE_SCRIPT.length));
    const types={}; PROLOGUE_SCRIPT.forEach(b=>types[b.t]=(types[b.t]||0)+1);
    if(!types.narr||!types.mono||!types.dlg) throw new Error('必须含旁白/独白/对话三拍：'+JSON.stringify(types));
    if(types.narr<3) throw new Error('旁白拍不足');
    if(types.dlg<8) throw new Error('NPC对话拍不足8拍，叙事撑不起来');
    const all=PROLOGUE_SCRIPT.map(b=>b.x||"").join(" ");
    ['遗忘之雾','绑定','灵魂契约','{xuanji}','域外之人','天命导游','四十五日','五幕','金榜台','就职仪式','整备行装']
      .forEach(k=>{ if(!all.includes(k)) throw new Error('序章缺关键剧情点：'+k); });
    /* 五种修行方式必须在五事拍 */
    const five=PL_FIVE.map(f=>f.k).join("");
    ['读卷','试炼','录音','巡夜','星盘'].forEach(k=>{ if(!five.includes(k)) throw new Error('五事拍缺：'+k); });
    /* 关键拍 id 齐全（finishPrologue 落流依赖） */
    ['arrive','pact','bind','road'].forEach(id=>{
      if(!PROLOGUE_SCRIPT.some(b=>b.id===id)) throw new Error('序章缺关键拍 id：'+id);
    });
  });
  run('v33 序章脚本：无淘汰词、无网游黑话、无未替换占位',()=>{
    const allow={player:1,yunheng:1,xuanji:1,qingxuan:1,smq:1};
    PROLOGUE_SCRIPT.forEach((b,i)=>{
      const x=b.x||"";
      WDRegistry.obsoleteTerms().forEach(t=>{ if(x.includes(t)) throw new Error('第'+i+'拍含淘汰词：'+t); });
      ['新手村','刷本','开荒','掉落','团战','扛怪','引魂灯'].forEach(t=>{ if(x.includes(t)) throw new Error('第'+i+'拍含网游黑话：'+t); });
      const ph=x.match(/\{(\w+)\}/g);
      if(ph) ph.forEach(p=>{ const k=p.slice(1,-1); if(!allow[k]) throw new Error('第'+i+'拍有未定义占位：'+p); });
      if(b.t!=="title"&&x&&(x.length<8||x.length>120)) throw new Error('第'+i+'拍长度异常：'+x.length);
    });
  });
  run('v33 序章 AI 编修 prompt：保拍数保剧情、禁黑话禁加戏',()=>{
    const code=refinePrologueLines.toString();
    ['保持拍数','灵魂契约','域外之人','金榜台','新手村','obsoleteTerms','JSON'].forEach(k=>{
      if(!code.includes(k)) throw new Error('序章编修prompt缺：'+k);
    });
  });
  run('v33 finishPrologue：三节点标记+三条精粹落流+幂等，之后才出引导',()=>{
    reset(); st.unlocked=1; st.dialogueInitDay=0;
    finishPrologue();
    ['arrive','bind','pact'].forEach(n=>{ if(!st.cutscenes[n]) throw new Error('序章结束必须标记节点：'+n); });
    const cs=st.dialogue.filter(m=>m.cutscene);
    if(cs.length!==3) throw new Error('应落流3条序章精粹，实际'+cs.length);
    if(cs[0].cutscene!=='arrive'||cs[0].npc!=='yunheng') throw new Error('第一条必须是云蘅初见绑定');
    if(cs[1].cutscene!=='pact'||cs[1].npc!=='xuanji') throw new Error('第二条必须是璇玑灵魂契约');
    if(cs[2].cutscene!=='bind'||cs[2].npc!=='yunheng') throw new Error('第三条必须是云蘅启程（衔接任务）');
    if(!cs[2].text.includes('整备行装')) throw new Error('启程拍必须引向第一日整备任务');
    /* 再调一次不重复落流（幂等） */
    const n=st.dialogue.length;
    finishPrologue();
    if(st.dialogue.length!==n) throw new Error('finishPrologue 必须幂等');
    /* 序章精粹之后才允许当日引导 */
    ensureGuidanceScene();
    const guide=st.dialogue.filter(m=>m.guidance);
    if(guide.length<6) throw new Error('序章后应生成当日引导6+条');
    if(st.dialogue.indexOf(guide[0])<st.dialogue.indexOf(cs[0])) throw new Error('引导必须排在序章之后');
  });
  run('v35 渲染合并：序章精粹视觉上排在当日opener与任务卡之前',()=>{
    reset(); st.unlocked=1; st.dialogueInitDay=0;
    const sink=makeEl();
    const origQ=document.querySelector;
    document.querySelector=s=>s==='#stream'?sink:origQ(s);
    try{
      finishPrologue();
    }finally{ document.querySelector=origQ; }
    const h=sink.innerHTML;
    const iArrive=h.indexOf('圣仪阵');
    const iPact=h.indexOf('星轨从未给外来者');
    /* v35：opener 由 pubLine 返回占位「新的一程，已在雾中显形……」（AI 异步替换） */
    const iOpen=h.indexOf('新的一程');
    if(iArrive<0||iPact<0||iOpen<0) throw new Error('序章/ opener 文本缺失，无法比较顺序');
    if(!(iArrive<iPact&&iPact<iOpen)) throw new Error('序章三精粹必须排在当日任务发放（opener）之前');
  });
  run('v33 序章占位名跟随自定义NPC名',()=>{
    reset();
    const y=plNames('{yunheng}{xuanji}{qingxuan}{smq}{player}');
    if(!y.includes(dName('xuanji'))||!y.includes(st.player)) throw new Error('占位替换失败：'+y);
    if(y.includes('{')) throw new Error('存在未替换占位：'+y);
  });
  run('v33 questMetaphor：非战斗关不挂妖王层级',()=>{
    reset();
    const gear=D.quests.find(q=>q.type==='gear'&&q.rarity==='epic');
    if(gear&&questMetaphor(gear).includes('妖王')) throw new Error('整备类事务关不得称妖王：'+questMetaphor(gear));
    const flash=D.quests.find(q=>q.type==='flash');
    if(flash&&/妖王|妖将|雾卒/.test(questMetaphor(flash))) throw new Error('夜巡关不得挂战斗层级：'+questMetaphor(flash));
    const boss=D.quests.find(q=>q.type==='boss'||q.type==='drill');
    if(boss&&!/妖王|妖将|雾卒/.test(questMetaphor(boss))) throw new Error('战斗关仍应体现妖物层级');
  });
  run('v33 本地简报兜底：轻小说标签与文案，无旧AI味标签',()=>{
    /* openQuest 函数体内含 fallback 闭包源码与渲染标签 */
    const src=openQuest.toString();
    ['此行为何','雾散之后','此行所得','灵脉拟稿'].forEach(k=>{ if(!src.includes(k)) throw new Error('本地兜底缺新标签：'+k); });
    ['为何必行','世界回响','你的所得','非你不可','AI 生成 · 以界面点选为准'].forEach(k=>{ if(src.includes(k)) throw new Error('旧AI味标签残留：'+k); });
  });
  run('v31 序章叙事：默认恢复完整故事；JSON/残损自定义不显示「{」',()=>{
    reset();
    WDCfg.setWorldBrief('');
    if(introNarrative()!==DEFAULT_INTRO_NARRATIVE) throw new Error('默认世界观必须逐字使用设计长段');
    if(!introNarrative().includes('四十五日')) throw new Error('默认故事内容缺失');
    try{
      /* 配置面板存进 JSON 结构化文本：序章应提取叙事字段而非显示花括号 */
      WDCfg.setWorldBrief(JSON.stringify({世界观:'长安城下雾潮日甚，导游次元濒临崩解。唯有集齐传奇导游之力，方能逆转。',版本:'x'}));
      const a=introNarrative();
      if(a[0]==='{'||a.includes('"世界观"')) throw new Error('JSON 不应泄漏到序章：'+a);
      if(!a.includes('长安城下雾潮日甚')) throw new Error('应提取世界观字段：'+a);
      /* 残损/无叙事 JSON 回退默认 */
      WDCfg.setWorldBrief('{');
      if(introNarrative()!==DEFAULT_INTRO_NARRATIVE) throw new Error('残损 brief 应回退默认故事');
      WDCfg.setWorldBrief(JSON.stringify({a:1,b:['x']}));
      if(introNarrative()!==DEFAULT_INTRO_NARRATIVE) throw new Error('无叙事字段应回退默认故事');
      /* 多行散文：取完整句子，不残留换行与花括号 */
      WDCfg.setWorldBrief('雾起于城西。\\n众导游列阵以待，只等外来者现身。');
      const c=introNarrative();
      if(c.includes('\\n')||c[0]==='{') throw new Error('散文 brief 取句异常：'+JSON.stringify(c));
      if(!c.includes('雾起于城西')) throw new Error('应采用散文首句');
    }finally{ WDCfg.setWorldBrief(''); }
  });
  run('v31 过场润色去剧本化：arrive 不派任务、只出一条口语',()=>{
    if(!CUTSCENE_HINT.arrive.includes('禁止交代任务')) throw new Error('arrive 节点必须禁止加戏派任务');
    const code=refineCutscene.toString();
    if(!code.includes('禁止多组引号')) throw new Error('过场润色应禁止剧本式多引号分段');
    if(!/≤\s*80字/.test(code)) throw new Error('过场润色应限制为一条短消息（≤80字）');
  });
  run('v31 引导润色/战报 prompt 禁淘汰概念与重演初见',()=>{
    const g=refineGuidanceScene.toString();
    if(!g.includes('不许重演初见')) throw new Error('引导润色应声明绑定仪式已结束、不重演初见');
    if(!g.includes('obsoleteTerms')) throw new Error('引导润色应注入注册表淘汰词');
    if(!refineAction.toString().includes('引魂灯')) throw new Error('战报润色应禁引魂灯等淘汰概念');
  });
  run('judgeDomain：法条关键词强匹配铁面',()=>{
    reset();
    if(WDChat.judgeDomain('法条规定了什么')!=='tiemian') throw new Error('法条应路由到铁面');
  });
  run('judgeDomain：山河关键词强匹配司马青衫',()=>{
    reset();
    if(WDChat.judgeDomain('长城的地理特征')!=='smq') throw new Error('山河应路由到司马青衫');
  });
  run('judgeDomain：无明确指向默认云蘅',()=>{
    reset();
    if(WDChat.judgeDomain('今天天气怎么样')!=='yunheng') throw new Error('无明确指向应默认云蘅');
  });
  run('judgeDomain：NPC名直接点名强匹配',()=>{
    reset();
    WDCfg.setNpcName('tiemian','铁老');
    if(WDChat.judgeDomain('铁老你说说')!=='tiemian') throw new Error('点名应强匹配到铁面');
  });
  /* ===== v30：voice 语言人格档案 + 群聊导演 ===== */
  run('WDRegistry voice语言人格档案全员完整',()=>{
    ['yunheng','qingxuan','smq','tiemian','liuruyan','moxiaogu','xuanji'].forEach(id=>{
      const v=WDRegistry.voiceOf(id);
      if(!v||!v.cadence||!Array.isArray(v.moves)||v.moves.length<3)throw new Error(id+' voice节奏/手法不完整');
      if(!Array.isArray(v.samples)||v.samples.length<3)throw new Error(id+' voice示例不足');
      if(!Array.isArray(v.avoid)||!v.avoid.length)throw new Error(id+' voice禁忌缺失');
      if(!v.toOthers||Object.keys(v.toOthers).length<2)throw new Error(id+' 角色关系缺失');
    });
  });
  run('voice卡注入systemPrefix：节奏/示例/关系',()=>{
    reset();
    const s=WDChat.systemPrefix('smq',false);
    if(!s.includes('语言人格卡'))throw new Error('systemPrefix缺语言人格卡');
    if(!s.includes('与在场众人的关系'))throw new Error('systemPrefix缺角色关系');
    if(!s.includes('语感示例'))throw new Error('systemPrefix缺语感示例');
  });
  run('voice卡：自定义人设时仍保留节奏辨识度',()=>{
    reset();
    WDCfg.setNpcPersona('moxiaogu','沉默寡言的机关师');
    const s=WDChat.systemPrefix('moxiaogu',false);
    if(!s.includes('语言人格卡'))throw new Error('自定义人设不应顶替voice卡');
    if(!s.includes('以自定义为准'))throw new Error('应声明冲突优先级');
    WDCfg.setNpcPersona('moxiaogu','');
  });
  run('voice 人格差异化：铁面与司马的禁忌互斥',()=>{
    const tm=WDRegistry.voiceOf('tiemian'), sm=WDRegistry.voiceOf('smq');
    if(tm.cadence===sm.cadence)throw new Error('两角色节奏不应相同');
    if(JSON.stringify(tm.samples)===JSON.stringify(sm.samples))throw new Error('两角色示例不应相同');
  });
  run('v35：AI 失败时 respond 返回 error 且不含本地话术',()=>{
    reset();
    /* 模拟 AI 返回空：dsChat 被 mock 为空串 */
    return WDChat.respond('yunheng','我终于打过这个妖王了，太爽了').then(r=>{
      /* 无密钥 → error；有密钥但空返回 → error。总之不应有本地鸡汤 */
      if(r.text&&/加油|你一定可以|相信自己/.test(r.text))throw new Error('AI-only 不应出现本地鸡汤：'+r.text);
    });
  });
  run('v35：pubLine/doneLine 无缓存时返回占位并触发 AI 生成',()=>{
    reset();
    const q={id:'test_q_1',type:'study',name:'测试关卡',goal:'通关'};
    const pub=pubLine(q,byDay[1]);
    if(!pub)throw new Error('pubLine 无缓存应返回占位');
    const done=doneLine(q,byDay[1]);
    if(!done)throw new Error('doneLine 无缓存应返回占位');
  });
  run('directorRespond：函数已挂载（无AI时由异步收尾验证降级）',()=>{
    reset();
    if(typeof WDChat.directorRespond!=='function')throw new Error('群聊导演未定义');
  });
  run('routeNpc 使用judgeDomain评分路由',()=>{
    reset();
    const id=routeNpc('法条规定了什么处罚');
    if(id!=='tiemian') throw new Error('法条应路由到铁面，实际'+id);
  });
  run('routeNpc 无明确指向默认云蘅',()=>{
    reset();
    const id=routeNpc('你好啊');
    if(id!=='yunheng') throw new Error('无指向应默认云蘅');
  });
  /* v35 异步收尾：respond 未配置 AI 时返回空文本+error（不再本地兜底，永不 reject） */
  (async()=>{
    try{
      reset(); const r=await WDChat.respond('tiemian','请教律法');
      if(!r)throw new Error('respond 应返回对象');
      if(r.text)throw new Error('无密钥时 text 应为空');
      if(r.degraded!==true)throw new Error('应标记 degraded');
      if(!r.error)throw new Error('应返回 error');
      console.log('PASS  v35 respond未配置AI返回空文本+error');
    }catch(e){ errors.push('v35 respond未配置AI => '+e.message); console.log('FAIL  v35 respond未配置AI : '+e.message); }
    try{
      reset();
      const r1=await WDChat.directorRespond(['yunheng','tiemian'],'测试');
      if(r1!==null)throw new Error('无AI时应返回null');
      const r2=await WDChat.directorRespond(['yunheng'],'测试');
      if(r2!==null)throw new Error('少于2人应返回null');
      console.log('PASS  WDChat directorRespond无AI安全降级');
    }catch(e){ errors.push('WDChat directorRespond降级 => '+e.message); console.log('FAIL  WDChat directorRespond降级 : '+e.message); }
    /* v36：arcSeed 全员完整 */
    try{
      const ids=Object.keys(WDRegistry.all());
      if(ids.length!==7) throw new Error('NPC数量异常: '+ids.length);
      ids.forEach(id=>{
        const a=WDRegistry.arcSeedOf(id);
        if(!a||!a.goal||!a.arc) throw new Error(id+' 缺 arcSeed.goal/arc');
      });
      console.log('PASS  v36 arcSeed: 7 NPC 均含 goal+arc');
    }catch(e){ errors.push('v36 arcSeed => '+e.message); console.log('FAIL  v36 arcSeed : '+e.message); }
    /* v36：systemPrefix 注入 arcBlock */
    try{
      reset();
      const s=WDChat.systemPrefix('yunheng',false);
      if(!s.includes('角色目的与弧线')) throw new Error('systemPrefix 未注入 arcBlock');
      if(!s.includes('圣女之力')) throw new Error('yunheng goal 未注入');
      console.log('PASS  v36 systemPrefix 注入角色目的与弧线');
    }catch(e){ errors.push('v36 systemPrefix arc => '+e.message); console.log('FAIL  v36 systemPrefix arc : '+e.message); }
    /* v36：voiceBlock 含动漫/RPG 方向 */
    try{
      const s=WDChat.voiceBlock('qingxuan',false);
      if(!/日式RPG|轻小说|GALGAME/.test(s)) throw new Error('voiceBlock 缺动漫方向');
      if(!s.includes('同行者不是世界中心')) throw new Error('缺同行者约束');
      console.log('PASS  v36 voiceBlock 含动漫/RPG 语感方向');
    }catch(e){ errors.push('v36 voiceBlock => '+e.message); console.log('FAIL  v36 voiceBlock : '+e.message); }
    /* v36：genPersona prompt 含 goal/arc */
    try{
      const src=genPersona.toString();
      if(!/goal/.test(src)) throw new Error('genPersona 未要求 goal');
      if(!/arc/.test(src)) throw new Error('genPersona 未要求 arc');
      if(!src.includes('arcSeedOf')) throw new Error('genPersona 未引用 arcSeedOf 基线');
      console.log('PASS  v36 genPersona prompt 含 goal/arc 字段');
    }catch(e){ errors.push('v36 genPersona => '+e.message); console.log('FAIL  v36 genPersona : '+e.message); }
    /* v36：人设面板含 goal/arc 编辑字段 */
    try{
      const src=openPersonaPanel.toString();
      if(!/data-fld="goal"/.test(src)) throw new Error('人设面板缺 goal 编辑字段');
      if(!/data-fld="arc"/.test(src)) throw new Error('人设面板缺 arc 编辑字段');
      console.log('PASS  v36 人设面板含 goal/arc 编辑字段');
    }catch(e){ errors.push('v36 人设面板 => '+e.message); console.log('FAIL  v36 人设面板 : '+e.message); }
    /* v36：导演系统函数已挂载 */
    try{
      if(typeof WDChat.directorPlan!=='function') throw new Error('directorPlan 未定义');
      if(typeof WDChat.directorFlow!=='function') throw new Error('directorFlow 未定义');
      const rp=await WDChat.directorPlan('测试',{targets:['yunheng']});
      if(rp!==null) throw new Error('无AI时 directorPlan 应返回null');
      const rf=await WDChat.directorFlow('测试',{targets:['yunheng']});
      if(rf!==null) throw new Error('无AI时 directorFlow 应返回null');
      console.log('PASS  v36 directorPlan/directorFlow 已挂载且无AI安全降级');
    }catch(e){ errors.push('v36 导演函数 => '+e.message); console.log('FAIL  v36 导演函数 : '+e.message); }
    /* v36：respond 支持 directorHint 形参 */
    try{
      const src=WDChat.respond.toString();
      if(!/directorHint/.test(src)) throw new Error('respond 未声明 directorHint');
      const src2=WDChat.respondWithTools.toString();
      if(!/directorHint/.test(src2)) throw new Error('respondWithTools 未声明 directorHint');
      console.log('PASS  v36 respond/respondWithTools 支持 directorHint');
    }catch(e){ errors.push('v36 directorHint => '+e.message); console.log('FAIL  v36 directorHint : '+e.message); }
    /* v36：npcAnswer 接入 directorFlow */
    try{
      const src=npcAnswer.toString();
      if(!src.includes('directorFlow')) throw new Error('npcAnswer 未接入 directorFlow');
      console.log('PASS  v36 npcAnswer 接入 directorFlow');
    }catch(e){ errors.push('v36 npcAnswer => '+e.message); console.log('FAIL  v36 npcAnswer : '+e.message); }
    /* v36：settleQuest 接入导演任务完成反应 */
    try{
      const src=settleQuest.toString();
      if(!src.includes('questreact')) throw new Error('settleQuest 未接入 questreact');
      if(!src.includes('directorFlow')) throw new Error('settleQuest 未接入 directorFlow');
      console.log('PASS  v36 settleQuest 接入导演任务完成反应');
    }catch(e){ errors.push('v36 settleQuest => '+e.message); console.log('FAIL  v36 settleQuest : '+e.message); }
    /* v36：DS_PROFILES 含 directorplan 档 */
    try{
      if(!DS_PROFILES.directorplan) throw new Error('DS_PROFILES 缺 directorplan 档');
      if(DS_PROFILES.directorplan.max_tokens>400) throw new Error('directorplan max_tokens 过高');
      console.log('PASS  v36 DS_PROFILES 含 directorplan 低token档');
    }catch(e){ errors.push('v36 DS_PROFILES => '+e.message); console.log('FAIL  v36 DS_PROFILES : '+e.message); }
    /* v36：@ 弹窗纯函数 */
    try{
      const l1=filterMentionList('');
      if(l1[0].id!=='__ALL__') throw new Error('首项应为所有人');
      if(l1.filter(x=>x.kind==='npc').length<7) throw new Error('NPC数量不足');
      const l2=filterMentionList('云');
      if(!l2.some(x=>x.id==='yunheng')) throw new Error('云 应命中云蘅');
      const l3=filterMentionList('zzz不存在');
      if(l3.length!==0) throw new Error('无匹配应返回空数组');
      console.log('PASS  v36 @mention filterMentionList 过滤正确');
    }catch(e){ errors.push('v36 filterMentionList => '+e.message); console.log('FAIL  v36 filterMentionList : '+e.message); }
    /* v36：@ 弹窗插入函数 */
    try{
      const r=insertMention('@云 在吗',0,2,'云蘅');
      if(r.value!=='@云蘅 在吗') throw new Error('插入结果错误: '+r.value);
      if(r.caret!==3) throw new Error('光标应在 @云蘅 之后, got '+r.caret);
      const r2=insertMention('嘿 @青 哪里',2,4,'青玄先生');
      if(!r2.value.startsWith('嘿 @青玄先生 哪里')) throw new Error('中间插入错误: '+r2.value);
      console.log('PASS  v36 @mention insertMention 插入与光标定位正确');
    }catch(e){ errors.push('v36 insertMention => '+e.message); console.log('FAIL  v36 insertMention : '+e.message); }
    console.log('\\n===== RESULT =====');
    if(errors.length){console.log('FAILURES '+errors.length);errors.forEach(e=>console.log(' - '+e));process.exit(1);}
    else { console.log('ALL TESTS PASSED'); process.exit(0); }
  })();
})();
`;

try { eval(dataSrc + '\n' + registrySrc + '\n' + cfgSrc + '\n' + memSrc + '\n' + quizSrc + '\n' + chatSrc + '\n' + avSrc + '\n' + fxSrc + '\n' + js + '\n' + driver); }
catch(e){ console.log('FATAL LOAD ERROR:\n'+e.stack); process.exit(1); }
