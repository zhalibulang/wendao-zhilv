# v50 改造计划：配置中心审计 + R1 人设优化 + 时间系统修复 + 任务系统评估

## 摘要

对照策划案 GAME-DESIGN.md，对游戏做 4 项系统性改造：
1. 配置中心三模块（导演/AI文档/世界观）默认文档全面审计与术语同步
2. R1 人设生成优化——从"颠覆性重构"改为"在 PERSONA_CONSTRAINTS 基线上优化丰富+生成人物小传"
3. 时间系统修复——49→45 自然日、advanceNaturalDay 推进逻辑、HUD 双时钟、9 阶段时间轴
4. 任务系统评估与优化——9 阶段均衡性、激励机制、AI 动态算法、自然日配比

## 现状分析（Phase 1 探索结论）

### 时间系统真相
- **策划案**（GAME-DESIGN.md L374/L504-512）：45 现实日（自然日）= 完整周期；游戏日=次元内日 1-225+；1 现实日=5 游戏日；9 阶段每阶段 5 现实日=25 游戏日
- **代码现状**：
  - DAYS 数组 45 元素（`D.days`），`date` 字段逐日递增（2026-9/8 → 2026-9/9...）= **45 自然日**，与策划案一致 ✅
  - `STAGES`（[index.html:903-913](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L903-L913)）：9 阶段 days:[1,5]...[41,45]，按自然日分 ✅
  - `ensureClocks`（[index.html:940-947](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L940-L947)）：st.day 1-45 ✅
  - `advanceNaturalDay`（[index.html:948-962](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L948-L962)）：错误地"1 现实日=5 游戏日"（st.day+5），会跳过 5 个自然日的任务 ❌
  - **L823 反向替换映射** `["四十五日","四十九日"]`（[index.html:823](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L823)）：把旧版"四十五日"替换成"四十九日"，是 49 满天下的根因 ❌
  - HUD 模板 [index.html:2054](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L2054) 硬编码 `/49日` ❌
  - L6107 "五幕四十九站" ❌
  - 所有 AI prompt/对白/序章/UI 文案全写"四十九日"（49 处出现）❌

### 配置中心三模块现状
- **worldBrief()**（[index.html:1271-1296](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L1271-L1296)）：默认世界观硬编码"四十九日"；用户自定义优先（WDCfg.customWorldBrief）
- **defaultAiDocument()**（[index.html:1540-1562](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L1540-L1562)）：AI 出演基底提示词，内容完善（行为边界/活人感/三种禁腔/AI腔/任务江湖化/群聊修养），硬编码"四十九日"；用户自定义优先（WDCfg.aiDocument）
- **directorPlan()**（[index.html:1564-1629](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L1564-L1629)）：群聊导演提示词，硬编码"四十九日"；用户自定义优先（WDCfg.directorDoc）
- **其他默认文档**：evolve L1489-1502、directorRespond L1638-1655、directorAudit L1694-1719、checkProactive L1480、questPublish L2031-2032、questReact L3555、narrator L4942-4943、prologuePolish L5717-5719，全部硬编码"四十九日"
- **UI 编辑框**（[index.html:4347-4397](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L4347-L4397)）：NPC 人设 textarea maxlength=300（L4359），v49 运行时扩展到 2000 但 UI 属性未同步

### R1 人设现状
- **PERSONA_CONSTRAINTS**（[index.html:4823-4869](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L4823-L4869)）：5 角色完整约束（animeShell/soulField/voice/requestPosture/growthArc/forbidden/distinguish），已对齐 GAME-DESIGN.md 卷二 ✅
- **LANGUAGE_IRON_RULES**（[index.html:4871-4880](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L4871-L4880)）：8 条通用语言法铁律 ✅
- **genPersona()**（[index.html:4884-4920](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L4884-L4920)）：prompt 要求"产出一份严谨、鲜活、可直接用于游戏对话的角色人设卡片"，是**全新生成**模式，可能偏离 PERSONA_CONSTRAINTS 基线 ❌（用户要求"避免颠覆性重构"）
- **配置中心 UI**（[index.html:5307-5314](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L5307-L5314)）：genFlow 按钮"R1 推理引擎正在构思人设…"

### 任务系统现状
- **DAYS**（`D.days`）：45 元素，act 分布 act1:8/act2:12/act3:10/act4:11/act5:4
- **D.quests**：274 个，kind: main:50/side:224；type: study:60/oral:60/review:53/drill:36/boss:31/flash:22/clue:11/gear:1
- **D.lectures**：274 个书页组（含 items 考点）
- **D.pointsLib**：374 条（v49 已注入 586 条 exam-2026-data.js，运行时替换）
- **D.quizzes**：274 个静态题组
- **推进逻辑**：`st.unlocked` 上限 45，`st.day` 上限 45（[index.html:3277](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L3277)、[index.html:5846](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L5846)）
- **激励机制**：D.achievements 12 条、D.shop 9 条、streak/心气(hp)/灵力(energy)/灵铢(coin)/修行(xp)
- **AI 动态算法**：directorPlan 调整日程（[index.html:1564](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L1564)），但无"进度不达标时云汀 AI 调整"实现

---

## 改动 1：配置中心三模块审计与更新

### 1a. 术语同步——删除反向替换映射，改"四十九日"→"四十五日"

**文件**：`index.html`

**1a-1. 删除 L823 反向替换映射**
```js
// 删除：["四十五日","四十九日"],["四十五站","四十九站"],
// 改为（正向修正 49→45）：
["四十九日","四十五日"],["四十九站","四十五站"],
```
位置：[index.html:823](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L823)

**1a-2. 批量替换硬编码"四十九日"→"四十五日"**
所有出现"四十九日"的文案/prompt/序章（约 30 处，见 Phase 1 Grep 结果），包括：
- L11 title 标签、L648-743 角色对白、L895 act5 标签
- L1287-1293 worldBrief 默认值
- L1502 evolve sys、L1541 defaultAiDocument、L1588/1655/1719 directorPlan/Respond/Audit
- L1975 剧情 NPC 对白、L2031-2032 questPublish prompt
- L2054 HUD 模板、L2073 footer、L3219/3557/4435/4942-4943 各 AI prompt
- L5589/5607/5612/5717/5719/5781/5786 序章对白与标题
- L6107 "五幕四十九站" → "九阶段·四十五自然日"

**1a-3. HUD 模板修正**（[index.html:2054](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L2054)）
```html
<!-- 旧：第<b>${st.day}</b>/49日 · ... -->
<!-- 新：第<b>${st.day}</b>/45 自然日 · 次元内<b>${(st.day-1)*5+1}</b>日 · ... -->
```

**1a-4. acts 标签更新**（[index.html:916-920](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L916-L920)）
当前 acts 已是 9 阶段（stage1-stage9），但 game-data.js 中 D.acts 仍是旧 5 幕（act1-act5）。在运行时补丁中加 act→stage 映射，确保 D.quests 的 act 字段（act1-act5）映射到 9 阶段。

### 1b. 默认文档内容审计——与 PERSONA_CONSTRAINTS 建立同步机制

**问题**：defaultAiDocument/directorPlan 等默认文档是通用约束，但未引用 PERSONA_CONSTRAINTS 的角色专属约束。用户在配置中心编辑人设后，这些约束不会自动注入到 AI prompt。

**改动**：在 wd-chat.js 的 `systemPrefix()`（[wd-chat.js:451-509](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/wd-chat.js#L451-L509)）调用处，追加 PERSONA_CONSTRAINTS 角色专属约束注入。

由于 wd-chat.js 是外部文件不可改，在 index.html 运行时补丁中覆盖 `systemPrefix` 或在 `defaultAiDocument` 返回值后追加角色专属约束段：
```js
// 在 defaultAiDocument 返回的 sys 文本末尾追加：
const c = PERSONA_CONSTRAINTS[npcId];
if(c){
  sys += "\n【该角色专属约束·铁律不破】"
    + (c.soulField? "\nSoul Field: " + c.soulField.map((s,i)=>`${i+1}.${s}`).join(" "):"")
    + (c.voice? "\n口吻: " + c.voice:"")
    + (c.forbidden? "\n专属禁令: " + c.forbidden.join("、"):"")
    + (c.distinguish? "\n区分度锚点: " + c.distinguish:"");
}
```

### 1c. 配置中心 UI 同步——maxlength 属性修正

**文件**：`index.html:4359`
```html
<!-- 旧：maxlength="300" -->
<!-- 新：maxlength="2000" -->
```
v49 运行时已扩展 setNpcPersona 上限到 2000，但 textarea 的 maxlength 属性仍是 300，导致用户输入被截断。

### 1d. 版本同步机制——加版本号与时间戳

在 worldBrief/defaultAiDocument/directorPlan 的默认值中加入版本标记，便于排查：
```js
游戏名:"问道之旅 · 四十五自然日（v50 · 北京导游资格考试游戏化复习）",
```

---

## 改动 2：R1 人设生成优化

### 2a. genPersona prompt 重构——从"全新生成"改为"基线优化+人物小传"

**文件**：`index.html:4884-4920`（genPersona 函数）

**当前问题**：prompt 要求"产出一份严谨、鲜活、可直接用于游戏对话的角色人设卡片"，是全新生成模式，R1 可能偏离 PERSONA_CONSTRAINTS 基线。

**改动**：重写 sys 和 user prompt，明确：
1. PERSONA_CONSTRAINTS 是**硬基线**，生成内容不得违背 soulField/forbidden/voice
2. 生成目标是**在基线上优化丰富**：补充人物小传、语言样本、场景反应模板
3. 输出字段扩展：增加 `miniBio`（人物小传 200 字）、`speechSamples`（3-5 句典型对白）、`sceneReactions`（3 个典型场景的反应）

```js
const sys="你是顶级二次元角色设定师。你的任务是基于游戏世界观和人设约束，参考著名二次元人物作为性格壳膜，"
  +"在【现有基线人设】之上做内容优化、细节丰富和表现力增强，"
  +"产出人物小传、典型对白样本和场景反应模板。"
  +"【铁律】不得颠覆基线人设的 soulField/voice/forbidden，只能丰富和细化。只输出JSON。";

const user="【游戏世界观】\n"+JSON.stringify(buildWorldBrief(),null,1)
  +"\n\n【要设定的NPC】"+JSON.stringify({id:npcId,姓名:dName(npcId),称号:dTitle(npcId),...})
  +"\n\n【基线人设·硬约束·不得违背】\n"+JSON.stringify(constraints,null,1)
  +"\n\n【优化目标】"
  +"\n1. 人物小传(miniBio)：200字内，交代角色来历、内在矛盾、与玩家的关系张力"
  +"\n2. 典型对白样本(speechSamples)：3-5句，覆盖日常/任务/失败/成功/夜话等场景"
  +"\n3. 场景反应模板(sceneReactions)：3个典型场景，每个给一句符合人设的反应"
  +"\n4. 语言指纹深化(languagePrint)：在基线 distinguish 之上，给出更具体的语言特征"
  +"\n\n【输出JSON字段】id, name, title, miniBio, speechSamples[], sceneReactions[], "
  +"languagePrint, soulField(原样保留), voice(原样保留), forbidden(原样保留), "
  +"animeShell{reference, howToAdapt}";
```

### 2b. 配置中心人设卡片渲染——展示新生成字段

**文件**：`index.html` 配置中心人设渲染处（搜 `st.personas` 渲染逻辑）

在 genFlow 完成后，card 现在包含 miniBio/speechSamples/sceneReactions，需要在 UI 中展示这些进阶内容（不只是 name/title/voice）。

### 2c. 资源消耗评估

- R1 (deepseek-reasoner) max_tokens=8000，单次生成约 2-3K tokens 输出
- 旧版"全新生成"模式 prompt 约 4-5K tokens 输入，新版"基线优化"prompt 约 3-4K tokens 输入（减少约 20%）
- 新版输出更丰富（miniBio+samples+reactions），单次价值更高
- 预计单次调用成本持平，但生成质量提升（不偏离基线）

---

## 改动 3：时间系统全面修复

### 3a. advanceNaturalDay 推进逻辑修正

**文件**：`index.html:948-962`（advanceNaturalDay 函数）

**当前错误**：1 现实日 = 5 游戏日（st.day+5），会跳过 5 个自然日的任务。

**修正**：1 现实日 = 1 自然日（st.day+1），因为 DAYS 数组按自然日组织任务。
```js
function advanceNaturalDay(){
  const today=new Date().toISOString().slice(0,10);
  ensureClocks();
  if(today===st.lastNaturalDay) return 0;
  const elapsed=Math.max(1, Math.round((new Date(today)-new Date(st.lastNaturalDay))/86400000));
  /* v50：1 现实日 = 1 自然日（DAYS 按自然日组织），次元内游戏日 = 自然日×5 */
  const natAdv=elapsed; /* 自然日推进 */
  st.day=Math.min(45, (st.day||1)+natAdv);
  st.fogDay=Math.max(1, (st.fogDay||45)-natAdv);
  /* 离线恢复：心气+30%、灵力全额恢复 */
  const hpCap=maxHP(); st.hp=Math.min(hpCap,(st.hp||0)+Math.round(hpCap*0.3*elapsed));
  const enCap=maxEnergy(); st.energy=enCap;
  st.lastNaturalDay=today;
  save();
  return elapsed;
}
```

### 3b. ensureClocks 双时钟初始化

**文件**：`index.html:940-947`

```js
function ensureClocks(){
  if(!st.day||isNaN(st.day)||st.day<1) st.day=1;
  if(st.day>45) st.day=45;
  if(!st.lastNaturalDay) st.lastNaturalDay=new Date().toISOString().slice(0,10);
  if(st.fogDay==null||isNaN(st.fogDay)) st.fogDay=45;
  /* v50：游戏日（次元内日）= (自然日-1)×5 + 1，上限 225 */
  st.gameDay=((st.day-1)*5)+1;
  try{ console.log("[v50] clocks:",{naturalDay:st.day, gameDay:st.gameDay, fog:st.fogDay, stage:stageOfDay(st.day).name}); }catch(e){}
}
```

### 3c. HUD 双时钟显示

**文件**：`index.html:2054`

```html
<span>第<b>${st.day}</b>/45 自然日 · 次元内<b>${st.gameDay||((st.day-1)*5+1)}</b>日 · ${(function(){try{return stageOfDay(st.day).name}catch(e){return ""}})()}阶段</span>
<span>雾涌<b>${st.fogDay||45}</b>日</span>
```

### 3d. 旅程面板修正

**文件**：`index.html:6107`
```js
// 旧："五幕四十九站 · 当前第 '+st.day+' 日"
// 新："九阶段·四十五自然日 · 当前第 '+st.day+' 自然日（次元内第 "+(st.gameDay||((st.day-1)*5+1))+" 日）"
```

### 3e. 9 阶段时间轴与剧情节点

**文件**：`index.html:903-913`（STAGES）和 `index.html:950-` （PLOT_THEMES）

STAGES 已对齐策划案 L375-385 九阶段。需补充：
- 每阶段 `naturalDays:[1,5]` 字段（明确是自然日范围）
- 每阶段 `gameDays:[1,25]`（次元内日范围，= (naturalDay-1)*5+1）
- PLOT_THEMES 已有 45 日剧情，需确认每 5 日一阶段边界处有 major 剧情节点

### 3f. 全流程时间线测试

VM 实测：
1. st.day 1→45 推进，每自然日 +1（非 +5）
2. stageOfDay(1)=初至、stageOfDay(6)=入界、stageOfDay(41)=雾涌
3. gameDay = (day-1)*5+1，day=1→gameDay=1，day=45→gameDay=221
4. fogDay 45→1 倒计时

---

## 改动 4：任务系统评估与优化

### 4a. 9 阶段均衡性评估

**数据**：act 分布 act1:8/act2:12/act3:10/act4:11/act5:4 日
- act1（初至+入界，8 日）对应阶段 1-2（10 自然日）—— act1 多 2 日不足
- act5（金榜台，4 日）对应阶段 9（5 自然日）—— 少 1 日
- 建议：act1 扩到 10 日（补阶段 1-2），act5 扩到 5 日（补阶段 9），但需用户确认是否扩展 DAYS

### 4b. 任务类型配比评估

**数据**：study:60/oral:60/review:53/drill:36/boss:31/flash:22/clue:11/gear:1
- study(60) + review(53) = 113 学习类，占 41%
- oral(60) = 22% 吟诵类
- drill(36)+boss(31) = 67 试炼类，占 24%
- 配比合理，但 oral 与 study 1:1 偏重口试，备考四科笔试内容（科目一/二/三/四）覆盖不足

### 4c. 激励机制评估

- D.achievements 12 条（对标 streak7/streak14/clueall/end 等）
- D.shop 9 条（"一顿好饭"等）
- 心气(hp)/灵力(energy)/灵铢(coin)/修行(xp) 四资源体系
- 建议：对照 GAME-DESIGN.md §3.6 奖励系统（句/节/日三级中间奖励层），补充"每日福利/签到"实现（策划案 L601）

### 4d. AI 动态算法评估

**现状**：directorPlan（L1564）用于群聊编排，但策划案 L514-518"当日配比"要求的"进度不达标时云汀 AI 调整日程"未实现。

**建议**：评估是否在本轮实现（依赖 dsChat + 进度数据），或标记为后续待办。

### 4e. 自然日任务配比验证

- 每自然日 5-6 任务，dur 总和约 150-200 分钟（学习+休息）
- 策划案 L514"每日=咒祷辞X段+经匣Y匣+问契Z签+消印W题"
- 当前 quest.type 分布大致对应，但需验证每自然日的 type 配比是否均衡

---

## 实施顺序

1. **改动 3（时间系统）**——先修时间，因为后续任务评估依赖正确的时间模型
2. **改动 1（配置中心审计）**——术语同步 + 默认文档更新
3. **改动 2（R1 人设优化）**——prompt 重构
4. **改动 4（任务系统评估）**——基于前 3 项的修正结果评估

## 验证步骤

1. **语法检查**：`node --check` exam-2026-data.js + index.html 内联脚本
2. **VM 实测**：
   - st.day 1→45 推进 +1（非 +5）
   - stageOfDay 边界正确
   - gameDay 计算正确
   - D.pointsLib 586 条
3. **Grep 验证**："四十九日" 零残留（仅保留 L823 正向替换映射）
4. **浏览器硬刷新**：HUD 双时钟、旅程面板、配置中心人设编辑、R1 生成

## 假设与决策

1. **时间模型决策**：保持 DAYS 45 自然日不变（与策划案 45 现实日一致），不扩展到 225 游戏日。理由：DAYS 数组已是 45 自然日（date 逐日递增），扩展到 225 会破坏现有 274 个任务结构且数据量巨大；"1自然日=5游戏日"作为叙事设定，HUD 显示双时钟即可。
2. **配置中心默认文档决策**：不重写 defaultAiDocument 等文档内容（已完善），只做术语同步（49→45）+ PERSONA_CONSTRAINTS 注入机制。
3. **R1 人设决策**：从"全新生成"改为"基线优化+人物小传"，prompt 明确 PERSONA_CONSTRAINTS 为硬基线。
4. **任务系统决策**：本轮只做评估报告，不扩展 DAYS（需用户提供新任务数据）；补充签到/每日福利机制。
