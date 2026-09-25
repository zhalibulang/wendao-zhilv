# v51 改造计划：藏经阁出题机制重做 + 错题簿知识点化 + 游戏纪日历法

## 摘要

1. **藏经阁出题**：本地算法为主（题量溢出、填空空格精准、多形式）、chat 补充
2. **错题簿**：记录知识点、第1次重复原题/第2次刷新/此后轮转、每知识点上限5形式
3. **游戏纪日历法**：大字显示"第X周，第Y日"（1游戏周=5游戏日=1自然日），旅程不大改显示45周目，任务树9阶段结构，9阶段剧情要点注入

## 现状分析

### 藏经阁出题（fallbackQuiz L4011-4047）
- 题量 = 考点数（无溢出）❌
- 填空空格取 `txt.match(/[\u4e00-\u9fa5]{2,4}/)` 第一个词，太粗糙 ❌
- 是非/填空交替，形式单一 ❌
- 判断题答案固定 true ❌

### 错题簿（renderStar L4048-4088）
- `st.wrong` 记录题目（text/okA）而非知识点 ❌
- 无刷新机制 ❌

### 游戏纪日
- L2001 对话流：`第 ${d.day} 日 · ${d.date} · 星期${d.week} · ${D.acts[d.act]}` — 现实日期+星期+旧幕名 ❌
- L5993 任务树：`第 ${d.day} 日 · 星期${d.week}` ❌
- L6043-6063 任务树：旧5幕结构（act1-act5）❌ — 9阶段剧情要点未注入
- L2057 HUD：`第2/45 自然日 · 次元内6日` — 自然日为主 ❌

---

## 改动 1：藏经阁出题机制重做（本地为主，chat 补充）

### 1a. fallbackQuiz 重写

**文件**：`index.html:4011-4047`

- 题量 = `Math.max(pids.length * 2, pids.length + 4, 8)` — 溢出考点数
- 每考点 1-3 题，形式随机（judge/blank/choice）
- 填空空格从 `exam_tip`/`anchor` 提取关键词（而非取第一个2-4字词）
- 判断题答案随机 true/false，错误陈述替换关键词
- 新增 choice 选择题（4选1，干扰项从同章节其他考点关键词取）
- 题目打乱顺序

### 1b. 关键词提取函数

```js
function extractKeyWords(txt, tip, anchor){
  const words=new Set();
  if(anchor){ anchor.split(/[\/·,，、]/).forEach(w=>{ if(w.length>=2&&w.length<=8) words.add(w.trim()); }); }
  if(tip){ const m=tip.match(/\d+[年月日]?|[\u4e00-\u9fa5]{2,6}/g); if(m) m.forEach(w=>{ if(w.length>=2&&w.length<=8) words.add(w); }); }
  const tm=txt.match(/\d{2,4}[年月日]?|[\u4e00-\u9fa5]{2,6}/g);
  if(tm) tm.slice(0,10).forEach(w=>{ if(w.length>=2&&w.length<=8) words.add(w); });
  return [...words].slice(0,5);
}
```

### 1c. genQuestion 函数（judge/blank/choice 三形式）

```js
function genQuestion(form, pt, keyWords, pid){
  const txt=pt.text||"";
  if(form==="judge"){
    const a=Math.random()<0.5;
    const q=a? txt.slice(0,50)+"……（判断正误）" : distort(txt, keyWords).slice(0,50)+"……（判断正误）";
    return {kind:"judge", q, a, pid, why:"出自考点 "+pid};
  }
  if(form==="blank"){
    const ans=keyWords.length?keyWords[Math.floor(Math.random()*keyWords.length)]:(txt.match(/[\u4e00-\u9fa5]{2,4}/)||["关键"])[0];
    return {kind:"blank", q:txt.replace(ans,"____").slice(0,100), a:ans, accept:[ans], pid, why:"出自考点 "+pid};
  }
  if(form==="choice"){
    const ans=keyWords.length?keyWords[0]:(txt.match(/[\u4e00-\u9fa5]{2,4}/)||["关键"])[0];
    const distractors=keyWords.filter(w=>w!==ans).slice(0,3);
    while(distractors.length<3){ distractors.push("（干扰项"+(distractors.length+1)+"）"); }
    return {kind:"choice", q:`${pt.title||pid}：下列哪项是正确的？`, opts:shuffle([ans,...distractors]), a:ans, pid, why:"出自考点 "+pid};
  }
}
```

### 1d. drawQuiz 渲染兼容 choice

新增 choice 渲染分支：4个选项按钮

### 1e. chat 补充出题（可选）

无 API key 时用本地算法；有 key 时可用 dsChat 低价 chat 模型补充出题，prompt 要求从 exam_tip/anchor 出题

---

## 改动 2：错题簿知识点化 + 刷新机制

### 2a. 错题记录改为知识点维度

**当前**：`st.wrong.push({qid,pid,text,okA,at,src})` — 记录题目
**改为**：
```js
{
  pid: "S3-01-03",       // 知识点标识
  topic: "S3-01 党史与成就",
  forms: [{kind,q,a,why},...], // 题目形式上限5个
  seen: 0,               // 见过几次
  at, src
}
```

### 2b. 刷新逻辑

- 第 1 次进入错题簿：出 `forms[0]`（原题重复）
- 第 2 次：forms 不足5个时补到5个上限，出 `forms[1]`
- 此后每次：轮转 `forms[seen % forms.length]`
- 答对后 `WDMem.right()` 计数减少，归零移除

---

## 改动 3：游戏纪日历法

### 3a. 游戏历法规则

- **1 游戏周 = 5 游戏日 = 1 自然日**
- st.day = 自然日 = 游戏周（1-45）
- st.gameDay = (st.day-1)*5+1（全局游戏日 1-225）
- 周内日 = ((st.gameDay-1) % 5) + 1（1-5）

### 3b. HUD 大字显示

**文件**：`index.html:2057`

```html
<!-- 大字：第X周，第Y日 -->
<span class="gametime">第<b>${st.day}</b>周，第<b>${st.gameDay||((st.day-1)*5+1)}</b>日 · ${(function(){try{return stageOfDay(st.day).name}catch(e){return ""}})()}阶段</span>
<span>雾涌<b>${st.fogDay||45}</b>日</span>
```

**当前**：`第2/45 自然日 · 次元内6日 · 初至阶段`
**改为**：`第2周，第6日 · 初至阶段`（不显示自然日）

### 3c. 对话流日期改为游戏纪日

**文件**：`index.html:2001`

```js
// 旧：第 ${d.day} 日 · ${d.date} · 星期${d.week} · ${D.acts[d.act]}
// 新：第${d.day}周，第${(d.day-1)*5+1}日 · ${stageOfDay(d.day).name}阶段
out.push({t:"sysday",x:`第${d.day}周，第${(d.day-1)*5+1}日 · ${stageOfDay(d.day).name}阶段`});
```

### 3d. 任务树日期改为游戏纪日

**文件**：`index.html:5993`

```js
// 旧：第 ${d.day} 日 · 星期${d.week}
// 新：第${d.day}周，第${(d.day-1)*5+1}日
return {id:"day:"+d.day, level:1, label:`第${d.day}周，第${(d.day-1)*5+1}日`, meta:prog.n+"/"+prog.all, ...};
```

### 3e. 任务树结构改为9阶段

**文件**：`index.html:6043-6063`

**当前**：按 act1-act5 旧5幕分组
**改为**：按 STAGES 9阶段分组

```js
const tree = STAGES.map(s => {
  const days = DAYS.filter(d => d.day >= s.days[0] && d.day <= s.days[1]);
  const progN = days.reduce((a,d)=>a+d.quests.filter(q=>qDone(q.id)).length,0);
  const progAll = days.reduce((a,d)=>a+d.quests.length,0);
  return {
    id: "stage:"+s.id,
    level: 0,
    label: `第${s.id}阶段 · ${s.name}（第${s.days[0]}-${s.days[1]}周）`,
    meta: progN+"/"+progAll,
    children: days.map(d => {
      const prog = dayProgress(d);
      return {id:"day:"+d.day, level:1, label:`第${d.day}周，第${(d.day-1)*5+1}日`, meta:prog.n+"/"+prog.all, children:...};
    })
  };
});
```

### 3f. 任务树标题更新

**文件**：`index.html:6063`

```js
// 旧：任务树 · 全程（幕 / 日 / 任务，点击三角折叠）
// 新：任务树 · 全程（阶段 / 周日 / 任务，点击三角折叠）
```

### 3g. 旅程模块（不大改）

**文件**：`index.html:6146`

保持旅程地图不大改，标题改为"九阶段 · 四十五周目"（周目而非自然日）

### 3h. 9阶段剧情要点注入

**问题**：五幕式被保留说明9阶段剧情要点未注入游戏。

**改动**：在 STAGES 定义中补充每阶段剧情要点（从 GAME-DESIGN.md 卷三提取），在任务树展开时显示阶段剧情简介。

```js
const STAGES=[
  {id:1,name:"初至",days:[1,5],plot:"玩家跌入次元，圣约初结，云汀领引，缇娜契约绑定"},
  {id:2,name:"入界",days:[6,10],plot:"辨识世界，了解导游修行体系与遗忘之雾威胁"},
  {id:3,name:"故宫",days:[11,15],plot:"故宫协律，首站净化，精灵苏醒"},
  // ... 9阶段
];
```

任务树根节点展开时显示 `plot` 字段。

---

## 实施顺序

1. **改动 3（游戏纪日）**——HUD 大字 + 对话流 + 任务树9阶段 + 剧情要点
2. **改动 1（出题机制）**——fallbackQuiz 重写 + extractKeyWords + genQuestion + drawQuiz choice
3. **改动 2（错题簿）**——知识点化 + 刷新逻辑

## 验证步骤

1. **语法检查**：`node --check` index.html 内联脚本
2. **VM 实测**：
   - fallbackQuiz 题量 ≥ max(8, 考点数*2)
   - 填空空格从 exam_tip/anchor 提取
   - choice 题生成
   - 错题记录知识点维度
   - getWrongQuestion 刷新逻辑
3. **Grep 验证**：`星期` 和 `2026-9` 在任务树/对话流零残留；`第.*幕` 旧5幕在任务树零残留
4. **浏览器硬刷新**：HUD"第X周，第Y日"、任务树9阶段、对话流游戏纪日、藏经阁题量溢出、错题簿知识点复习

## 假设与决策

1. **游戏历法**：1游戏周=5游戏日=1自然日。st.day=自然日=游戏周（1-45）。st.gameDay=全局游戏日（1-225）。HUD 大字"第X周，第Y日"。
2. **出题**：本地算法为主（fallbackQuiz 重写），chat 补充为可选。
3. **错题簿**：记录知识点（pid），forms 上限5，第1次重复/第2次刷新/此后轮转。
4. **任务树**：9阶段结构，每阶段显示剧情要点（plot）。旅程模块不大改，显示45周目。
