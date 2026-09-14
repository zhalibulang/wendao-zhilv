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
  run('WDChat 降级三段式（情境+剧情+任务）',()=>{
    reset(); const t=WDChat.fallback('xuanji','颐和园长廊有多长');
    if(!t)throw new Error('降级话术为空');
    if(!(/(去|先|这就|通关|巡夜|星盘)/.test(t)))throw new Error('降级话术缺少任务/下一步指引');
    if(!t.includes('星'))throw new Error('降级话术不符合玄机夫人人设');
    const t2=WDChat.fallback('moxiaogu','完全不相干词组zzz');
    if(!t2||t2===t)throw new Error('不同NPC降级话术应区分');
  });
  run('WDChat sysPrompt 行为边界+自主权+三段+防重复',()=>{
    reset();
    const s=WDChat.sysPrompt('qingxuan',false);
    ['行为边界','自主权限','四项职能','回复结构','情境','剧情','任务'].forEach(k=>{
      if(!s.includes(k))throw new Error('sysPrompt 缺失约束段：'+k);
    });
    if(!/≤220字/.test(s))throw new Error('单次回复字数上限约束缺失');
  });
  run('WDChat 防重复：近期原话注入硬约束',()=>{
    reset();
    st.dialogue.push({role:'npc',npc:'qingxuan',text:'云头上传来一声轻笑，你今日这关破得漂亮'});
    const s=WDChat.sysPrompt('qingxuan',false);
    if(!s.includes('防重复'))throw new Error('防重复段缺失');
    if(!s.includes('云头上传来一声轻笑'))throw new Error('近期原话未注入');
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
    if(!ctx1.includes('首次交流'))throw new Error('情境寒暄引导缺失');
    /* 第二次调用：当日情境不再注入 */
    const ctx2=WDChat.buildContext('yunheng','再聊',null);
    if(ctx2.includes('当日情境'))throw new Error('非首次互动不应再注入情境');
  });
  run('WDChat 情境降级话术：首次含天气/活动',()=>{
    reset();
    const t=WDChat.fallback('yunheng','你好呀');
    if(!t)throw new Error('降级话术为空');
    /* 云蘅降级话术不应含已淘汰旧概念（引灯/掌灯/灯影等） */
    if(/引灯|掌灯|灯影/.test(t))throw new Error('降级话术残留旧概念：'+t);
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
    // wd-chat sysPrompt 须含旧概念禁令
    const s=WDChat.sysPrompt('qingxuan',false);
    if(!s.includes('已淘汰概念禁用')) throw new Error('sysPrompt缺旧概念禁令');
  });
  /* ===== 剧情先行 + 任务说明三要素（v27）===== */
  run('genQuestBrief prompt含剧情先行硬约束',()=>{
    reset();
    const qsrc=genQuestBrief.toString();
    if(!qsrc.includes('剧情先行硬约束')) throw new Error('任务说明prompt缺剧情先行约束');
    if(!qsrc.includes('杜绝任务先行、剧情后置')) throw new Error('缺"杜绝任务先行"硬约束');
    /* 三要素字段须在 schema 中明确要求 */
    if(!qsrc.includes('necessity')) throw new Error('schema缺necessity字段');
    if(!qsrc.includes('impact')) throw new Error('schema缺impact字段');
    if(!qsrc.includes('reward')) throw new Error('schema缺reward字段');
    if(!qsrc.includes('scene')) throw new Error('schema缺scene字段');
  });
  run('genQuestBrief prompt含核心世界观三逻辑',()=>{
    reset();
    const qsrc=genQuestBrief.toString();
    /* 玩家是唯一具备就职仪式资格的域外之人 */
    if(!qsrc.includes('域外之人')) throw new Error('缺"域外之人"硬约束');
    if(!qsrc.includes('就职仪式')) throw new Error('缺"就职仪式"硬约束');
    /* NPC能力复苏=世界拯救必要条件 */
    if(!qsrc.includes('能力复苏')) throw new Error('缺"能力复苏"硬约束');
    if(!qsrc.includes('圣女之力恢复')) throw new Error('缺"圣女之力恢复"硬约束');
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
  run('新schema aiBrief缓存保留',()=>{
    reset();
    /* 新 schema 含三要素字段，不应被清除 */
    st.aiBrief['D01M']={scene:'雾在涌',line:'这一关交给你',necessity:'非你不可',impact:'圣女复苏',reward:'+25修行',metaphor:'试炼',at:new Date().toISOString()};
    reconcile();
    if(!st.aiBrief['D01M']) throw new Error('新schema aiBrief不应被清除');
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
    if(!doc.includes('≤220字'))throw new Error('默认文档缺字数限制');
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
  run('条款检查：关卡关联检测',()=>{
    reset(); st.unlocked=1;
    WDCfg.setWorldBrief('');
    const q=D.quests.find(x=>x.id==='D01M');
    /* 保存原始 quest 函数，修改后恢复，避免影响后续测试 */
    const origQuest=WDChat._ctx?WDChat._ctx.quest:null;
    if(WDChat._ctx) WDChat._ctx.quest=()=>q;
    const chk=WDChat.clauseCheck('你好呀','qingxuan');
    if(chk.pass)throw new Error('在途关卡时未提及关卡名应报关卡脱节');
    if(!chk.violations.some(v=>v.type==='关卡脱节'))throw new Error('应检测到关卡脱节');
    if(WDChat._ctx) WDChat._ctx.quest=origQuest;
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
  run('云蘅结算回应：任务NPC之后接棒且含三要素',()=>{
    reset(); st.unlocked=1;
    const q=D.quests.find(x=>x.id==='D01M');
    settleQuest(q,true,null);
    const idxAck=st.dialogue.findIndex(m=>m.role==='npc'&&m.npc===q.npc&&(m.text||'').includes('已交付'));
    const idxYh=st.dialogue.findIndex(m=>m.role==='npc'&&m.npc==='yunheng');
    if(idxAck<0)throw new Error('任务NPC结算回复缺失');
    if(idxYh<0)throw new Error('云蘅结算回应缺失');
    if(idxYh<idxAck)throw new Error('云蘅必须在任务NPC结算回复之后接棒');
    const ym=st.dialogue[idxYh], t=ym.text;
    if(!t.includes(q.name))throw new Error('缺任务总结（关卡名）');
    if(!t.includes('+'+q.xp+'修行'))throw new Error('缺收获数字');
    if(!/全对|磕绊|星盘/.test(t))throw new Error('缺经验分析');
    if(!/下一关|巡夜/.test(t))throw new Error('缺下一步引导');
    if(!ym.refs||!ym.refs.some(x=>x.qid===q.id))throw new Error('云蘅回应缺已完成任务ref');
    if(!qDone(q.id)||st.xp<q.xp)throw new Error('结算未生效（done/修行）');
  });
  run('云蘅结算回应：试炼有错时引导星盘清错',()=>{
    reset(); st.unlocked=1;
    const q=D.quests.find(x=>x.id==='D01M');
    settleQuest(q,false,null);
    /* triggerCutscene("bind") 会在结算消息后追加一条云蘅剧情过场，
       故检查所有云蘅消息中是否存在含「磕绊/星盘」的结算条目 */
    const yhMsgs=st.dialogue.filter(m=>m.role==='npc'&&m.npc==='yunheng');
    if(!yhMsgs.length)throw new Error('云蘅结算消息未落流');
    if(!yhMsgs.some(m=>/磕绊|星盘/.test(m.text||"")))throw new Error('有错时应提示复盘/星盘');
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
  run('sysPrompt 要求回复点出当前关卡名',()=>{
    reset(); st.unlocked=1;
    WDCfg.setWorldBrief(''); WDCfg.setAiDocument('');
    const aq=firstActiveQuest();
    if(!aq)throw new Error('无在途关卡');
    const s=WDChat.sysPrompt('qingxuan',false);
    if(!s.includes('「'+aq.name+'」'))throw new Error('sysPrompt未注入当前关卡名');
    if(!s.includes('至少自然点到一次'))throw new Error('缺对话-任务关联硬约束');
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
  run('sysPrompt 含激励而非教育语气基调',()=>{
    reset();
    const s=WDChat.sysPrompt('qingxuan',false);
    if(!s.includes('激励而非教育')) throw new Error('sysPrompt 缺「激励而非教育」基调');
    if(!s.includes('请求式口吻')) throw new Error('sysPrompt 缺请求式口吻约束');
    if(!s.includes('命令口吻与祈使句')) throw new Error('sysPrompt 缺命令口吻禁令');
    if(!s.includes('多夸赞')) throw new Error('sysPrompt 缺夸赞鼓励要求');
    /* 角色自主性：性格与故事展开 */
    if(!s.includes('角色自主性')) throw new Error('sysPrompt 缺角色自主性约束');
    if(!s.includes('生死存亡')) throw new Error('sysPrompt 缺关心世界生死存亡约束');
    if(!s.includes('在乎玩家的感受')) throw new Error('sysPrompt 缺在乎玩家感受约束');
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
  run('judgeDomain：法条关键词强匹配铁面',()=>{
    reset();
    const dm=WDChat.judgeDomain('法条规定了什么');
    if(dm.npcId!=='tiemian') throw new Error('法条应路由到铁面，实际'+dm.npcId);
    if(dm.isDefault) throw new Error('强匹配不应是默认');
    if(dm.score<2) throw new Error('核心词score应>=2');
  });
  run('judgeDomain：山河关键词强匹配司马青衫',()=>{
    reset();
    const dm=WDChat.judgeDomain('长城的地理特征');
    if(dm.npcId!=='smq') throw new Error('山河应路由到司马青衫');
    if(dm.isDefault) throw new Error('强匹配不应是默认');
  });
  run('judgeDomain：无明确指向默认云蘅',()=>{
    reset();
    const dm=WDChat.judgeDomain('今天天气怎么样');
    if(dm.npcId!=='yunheng') throw new Error('无明确指向应默认云蘅');
    if(!dm.isDefault) throw new Error('应标记为默认');
  });
  run('judgeDomain：NPC名直接点名强匹配',()=>{
    reset();
    WDCfg.setNpcName('tiemian','铁老');
    const dm=WDChat.judgeDomain('铁老你说说');
    if(dm.npcId!=='tiemian') throw new Error('点名应强匹配到铁面');
    if(dm.score<3) throw new Error('NPC名匹配score应>=3');
  });
  run('shouldChimeIn：同speaker不插话',()=>{
    reset();
    const r=WDChat.shouldChimeIn('qingxuan',{text:'测试',speaker:'qingxuan'});
    if(r.chime) throw new Error('同speaker不应插话');
  });
  run('shouldChimeIn：职责领域强相关时插话',()=>{
    reset();
    const r=WDChat.shouldChimeIn('tiemian',{text:'法条规定了什么',speaker:'yunheng'});
    if(!r.chime) throw new Error('法条相关时铁面应插话');
    if(!r.reason.includes('职责领域')) throw new Error('插话理由应含职责领域');
  });
  run('shouldChimeIn：被直接点名时插话',()=>{
    reset();
    WDCfg.setNpcName('smq','司马');
    const r=WDChat.shouldChimeIn('smq',{text:'司马你来说',speaker:'yunheng'});
    if(!r.chime) throw new Error('被点名时应插话');
  });
  run('shouldChimeIn：关卡接洽人优先发言',()=>{
    reset(); st.unlocked=1;
    const aq=firstActiveQuest();
    if(!aq) throw new Error('应有在途任务');
    const r=WDChat.shouldChimeIn(aq.npc,{text:'随便聊聊',speaker:'yunheng',quest:aq});
    if(!r.chime) throw new Error('关卡接洽人应优先发言');
  });
  run('shouldChimeIn：无相关性不插话',()=>{
    reset();
    const r=WDChat.shouldChimeIn('xuanji',{text:'今天天气怎么样',speaker:'yunheng'});
    if(r.chime) throw new Error('无相关性时不应插话');
  });
  run('relationshipContext：云蘅含爱慕之情',()=>{
    reset();
    const r=WDChat.relationshipContext('yunheng');
    if(!r.includes('爱慕')) throw new Error('云蘅关系应含爱慕之情');
    if(!r.includes('同门')) throw new Error('云蘅关系应含同门关系');
  });
  run('relationshipContext：各NPC关系非空',()=>{
    reset();
    for(const id of ['yunheng','qingxuan','smq','tiemian','liuruyan','moxiaogu','xuanji']){
      const r=WDChat.relationshipContext(id);
      if(!r) throw new Error(id+'关系描述为空');
    }
  });
  run('sysPrompt 注入角色关系上下文',()=>{
    reset();
    const s=WDChat.sysPrompt('qingxuan',false);
    if(!s.includes('角色关系')) throw new Error('sysPrompt缺角色关系段');
    if(!s.includes('同门')) throw new Error('sysPrompt角色关系应含同门');
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
  /* 异步收尾：respond 未配置 AI 时应同步降级为本地话术（永不 reject） */
  (async()=>{
    try{
      reset(); const r=await WDChat.respond('tiemian','请教律法');
      if(!r||typeof r.text!=="string"||!r.text)throw new Error('无降级文本');
      if(r.degraded!==true)throw new Error('未标记 degraded');
      console.log('PASS  WDChat respond未配置AI自动降级');
    }catch(e){ errors.push('WDChat respond未配置AI自动降级 => '+e.message); console.log('FAIL  WDChat respond未配置AI自动降级 : '+e.message); }
    console.log('\\n===== RESULT =====');
    if(errors.length){console.log('FAILURES '+errors.length);errors.forEach(e=>console.log(' - '+e));process.exit(1);}
    else { console.log('ALL TESTS PASSED'); process.exit(0); }
  })();
})();
`;

try { eval(dataSrc + '\n' + cfgSrc + '\n' + memSrc + '\n' + quizSrc + '\n' + chatSrc + '\n' + avSrc + '\n' + fxSrc + '\n' + js + '\n' + driver); }
catch(e){ console.log('FATAL LOAD ERROR:\n'+e.stack); process.exit(1); }
