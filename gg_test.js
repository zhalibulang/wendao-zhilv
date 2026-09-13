/* 轻量 DOM mock + 同作用域执行 index.html 渲染逻辑，捕获运行时错误 */
const fs = require('fs');

function makeEl(tag){
  const el = {
    tagName:(tag||'div').toUpperCase(), children:[], style:{}, dataset:{},
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
/* 独立模块（wd-chat/wd-avatar/wd-cfg/wd-mem）随主脚本一并装载，保持与线上运行时一致 */
const chatSrc=fs.readFileSync(require('path').join(__dirname,'wd-chat.js'),'utf8');
const avSrc=fs.readFileSync(require('path').join(__dirname,'wd-avatar.js'),'utf8');
const fxSrc=fs.readFileSync(require('path').join(__dirname,'wd-fx.js'),'utf8');
const cfgSrc=fs.readFileSync(require('path').join(__dirname,'wd-cfg.js'),'utf8');
const memSrc=fs.readFileSync(require('path').join(__dirname,'wd-mem.js'),'utf8');

const driver=`
;(function(){
  const errors=[];
  function run(name,fn){try{fn();console.log('PASS  '+name);}catch(e){errors.push(name+' => '+e.message);console.log('FAIL  '+name+' : '+e.message);}}
  function reset(){ st=defState(); }
  try{ WDCfg.init(); WDMem.init(); }catch(e){ errors.push('模块初始化 => '+e.message); }
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
    if(!wb.世界观.includes('导游异次元'))throw new Error('新世界观未生效');
    if(!wb.隐喻系统.includes('遗忘怪'))throw new Error('新隐喻系统未生效');
    if(!Array.isArray(wb.NPC基础信息)||!wb.NPC基础信息[0].id)throw new Error('NPC 信息须保留 ID');
    // 自定义名/称号应进入背景信息，ID 保持系统值
    WDCfg.setNpcName('xuanji','星官'); WDCfg.setNpcTitle('xuanji','观星主簿');
    const wb2=WDChat.worldBrief();
    const xj=wb2.NPC基础信息.find(n=>n.id==='xuanji');
    if(xj.姓名!=='星官'||xj.称号!=='观星主簿')throw new Error('自定义名衔未进入NPC基础信息');
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

try { eval(dataSrc + '\n' + cfgSrc + '\n' + memSrc + '\n' + chatSrc + '\n' + avSrc + '\n' + fxSrc + '\n' + js + '\n' + driver); }
catch(e){ console.log('FATAL LOAD ERROR:\n'+e.stack); process.exit(1); }
