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
/* 独立模块（wd-chat/wd-map/wd-cfg/wd-mem）随主脚本一并装载，保持与线上运行时一致 */
const chatSrc=fs.readFileSync(require('path').join(__dirname,'wd-chat.js'),'utf8');
const mapSrc=fs.readFileSync(require('path').join(__dirname,'wd-map.js'),'utf8');
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
  /* ===== 对话模块 + 像素地图（wd-chat / wd-map）===== */
  run('WDChat 成长数据+故事线',()=>{
    reset(); const g=WDChat.growthOf('smq'); g.talks=7;
    WDChat.storyAppend('smq','并肩见证「试炼」交付'); WDChat.storyAppend('smq','桥上论剑');
    if(!st.npcGrowth||st.npcGrowth.smq.story.length!==2)throw new Error('故事线未落存档');
    if(WDChat.historyOf('smq',5).length!==0)throw new Error('历史互动应为空');
  });
  run('WDChat 降级话术人设化',()=>{
    reset(); const t=WDChat.fallback('xuanji','颐和园长廊有多长');
    if(!t||!t.includes('星'))throw new Error('降级话术不符合玄机夫人人设');
    const t2=WDChat.fallback('moxiaogu','完全不相干词组zzz');
    if(!t2)throw new Error('降级话术为空');
  });
  run('WDMap 头像URL缓存',()=>{
    const a=WDMap.avatarURL('qingxuan'), b=WDMap.avatarURL('qingxuan');
    if(!a.startsWith('data:image/png')||a!==b)throw new Error('dataURL异常');
    if(!WDMap.avatarURL('moxiaogu'))throw new Error('其他NPC头像生成失败');
  });
  run('WDMap NPC全员序章引见（职能重构#6）',()=>{
    reset(); st.unlocked=1;
    ['yunheng','qingxuan','smq','moxiaogu','tiemian','liuruyan','xuanji'].forEach(id=>{
      if(!WDMap.npcVisible(id))throw new Error(id+' 序章即应可互动');
    });
    st.unlocked=11;
    if(!WDMap.npcVisible('tiemian'))throw new Error('act2 段 NPC 解锁后仍应现身');
  });
  /* ===== 地图 v2：相机数学 / 图层 / 挂载渲染生命周期 ===== */
  run('WDMap 相机钳制（无黑边/小图居中）',()=>{
    const U=WDMap.U;
    const p=U.clampPan(640,480,400,300,-999,-999);
    if(p.x!==-240||p.y!==-180)throw new Error('大地图越界钳制失败 '+JSON.stringify(p));
    const c=U.clampPan(300,200,400,300,9,9);
    if(c.x!==50||c.y!==50)throw new Error('小地图应居中');
  });
  run('WDMap 锚点缩放钳制+坐标往返',()=>{
    const U=WDMap.U,u=25,vpW=400,vpH=300,pan={x:0,y:0};
    let n=U.zoomAt(1,u,vpW,vpH,pan,200,150,100);
    if(n.z!==3)throw new Error('上限应钳制3x，实际'+n.z);
    n=U.zoomAt(n.z,u,vpW,vpH,n,200,150,0.01);
    if(n.z!==1)throw new Error('下限应钳制1x');
    n=U.zoomAt(1,u,vpW,vpH,pan,100,100,2);
    const w=U.toWorld(100,100,u,n.z,n);
    const s=U.toScreen(w.x,w.y,u,n.z,n);
    if(Math.abs(s.x-100)>0.01||Math.abs(s.y-100)>0.01)throw new Error('视口↔世界坐标往返不一致');
  });
  run('WDMap NPC命中判定（缩放无关）',()=>{
    const U=WDMap.U;
    if(U.hitNpc(3.2,6.9)!=='qingxuan')throw new Error('青玄点位未命中');
    if(U.hitNpc(0.2,0.2))throw new Error('空白区域不应命中NPC');
  });
  run('WDMap 图层开关持久化（与NPC可见性相互独立）',()=>{
    reset(); st.unlocked=1;
    WDMap.setLayer('fog',false);
    if(WDMap.getLayers().fog!==false)throw new Error('雾图层未切换');
    const saved=JSON.parse(localStorage.getItem('wdzx.mapLayers.v1')||'null');
    if(!saved||saved.fog!==false)throw new Error('图层偏好未持久化');
    if(!WDMap.npcVisible('xuanji'))throw new Error('雾层开关不得影响NPC可见性（序章已引见）');
    WDMap.setLayer('fog',true);
  });
  run('WDMap 挂载/帧渲染/卸载生命周期',()=>{
    reset();
    const host=makeEl('div'); host.clientWidth=360;
    let tapped=0,fogged=0;
    WDMap.mount(host,{onNpcTap:()=>tapped++,onFogTap:()=>fogged++});
    WDMap._frame();
    if(host._html.indexOf('wdmapCv')<0)throw new Error('canvas未挂载');
    if(host._html.indexOf('data-ly')<0)throw new Error('图层控件未渲染');
    WDMap.unmount();
    WDMap._frame();   // 卸载后调用必须静默 no-op，不抛错
    if(tapped!==0||fogged!==0)throw new Error('渲染不应触发交互回调');
  });
  run('WDMap 缩放API钳制+复位',()=>{
    const host=makeEl('div'); host.clientWidth=360;
    WDMap.mount(host,{});
    for(let i=0;i<10;i++)WDMap.zoomIn();
    if(WDMap.getView().z>3+1e-9)throw new Error('缩放突破3x上限');
    WDMap.resetView();
    if(WDMap.getView().z!==1)throw new Error('复位后缩放应为1x');
    WDMap.unmount();
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

try { eval(dataSrc + '\n' + cfgSrc + '\n' + memSrc + '\n' + chatSrc + '\n' + mapSrc + '\n' + fxSrc + '\n' + js + '\n' + driver); }
catch(e){ console.log('FATAL LOAD ERROR:\n'+e.stack); process.exit(1); }
