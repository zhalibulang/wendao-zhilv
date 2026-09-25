# v49 改造计划：角色人设 R1 生成 + 时间机制修复 + 剧情结构修复 + 考点数据注入

## 概要

用户反馈 4 个问题：
1. 角色人设（口癖/语言禁令）在游戏中找不到，配置中心人设编辑功能弱，genPersona 用 deepseek-chat 而非 R1，不参考二次元人物壳
2. 时间机制（三套时钟/九阶段/雾涌日）代码已注入但 HUD 不显示
3. 剧情结构（PLOT_THEMES/45 日）代码已注入但游戏中不呈现
4. 新版考点数据库（586 条）需注入游戏替换旧版（374 条）

## 现状分析

### 1. 角色人设系统现状
- **genPersona()** [index.html#L4783](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L4783)：使用 `dsChat(kind:"persona")` → `DS_MODEL="deepseek-chat"`，prompt 泛泛而谈，不含 GAME-DESIGN.md 的 Soul Field/口吻/禁/成长弧/二次元壳
- **DS_PROFILES.persona** [L4665](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L4665)：temp=0.6, max_tokens=1000, json_object — 但 model 固定为 `deepseek-chat`，无 R1 选项
- **WDCfg** [wd-cfg.js#L138-141](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/wd-cfg.js#L138)：`npcPersona(id)` / `setNpcPersona(id,desc)` 存在，但 desc 上限 300 字 — 太短，装不下完整人设约束
- **配置中心 UI** `renderCfg()` [L4109](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/wendao-v2.1/index.html#L4109)：有人设编辑入口和"AI 生成人设"按钮（`genFlow` → `genPersona`），但只展示 personality/style/goal/arc，不展示口癖规则与语言禁令
- **GAME-DESIGN.md** [L100-158](file:///Volumes/G-DRIVE/AI%20things/Guide%20Game/WendaoCiyuan/docs/GAME-DESIGN.md#L100)：有完整人设标准 — Soul Field（铁律）、口吻、禁令、成长弧、二次元锚点（saber/贞德/纲手等）、角色区分度总表

### 2. 时间机制现状
- 代码存在：`STAGES[9]`(L903) / `stageOfDay`(L914) / `ensureClocks`(L923) / `advanceNaturalDay`(L927)
- HUD 显示行 L2031 已改为 `${stageOfDay(st.day).name}阶段` + `雾涌${st.fogDay||45}日`
- `boot()` L5708 已调用 `ensureClocks()` + `advanceNaturalDay()`
- VM 实测全部通过 — 代码逻辑正确
- **可能原因**：① 浏览器缓存未清 ② 存档 localStorage 中旧数据没有 `fogDay`/`lastNaturalDay` 字段导致 `ensureClocks` 初始化但 `stageOfDay(st.day)` 因 st.day 为旧值（如 undefined/0）返回 STAGES[0] 但显示正常 ③ 可能有另一处 render 覆盖了 HUD ④ 实际上有 JS 错误导致 render 函数部分失败

### 3. 剧情结构现状
- `PLOT_THEMES[1..45]` 完整（45 日无缺失），`checkPlotTrigger`/`performPlot` 已实现
- `settleQuest` L3306 已接入 `checkPlotTrigger()` + `performPlot()`
- **可能原因**：① 触发条件未满足（需完成当日 60% 任务）② 剧情只推入 `st.dialogue` 对话流，如果用户不切到对话视图就看不到 ③ `renderChat()` 可能未渲染 kind="plot" 的消息

### 4. 考点数据现状
- 旧 `D.pointsLib`：374 条，字段 `{id, text, star, anchor, anchor_type, status}`，ID 前缀 S1-S5
- 新数据 `考点数据库-2026-修正版.json`：586 条，字段 `{id, title, subject, module, text, anchor, context, source, status, exam_tip, origin, version, collected}`，无 `star`/`anchor_type` 字段
- 新数据含 S 前缀 479 条（旧 374 条的超集）+ 非 S 前缀 107 条（CITY/CUL/GUG/INT/QA/SUM/TAM/TAN/TOM/WAL 等）
- 约束：不动 `game-data.js`，运行时替换 `D.pointsLib`

---

## 改造方案

### 改动 1：genPersona 升级为 R1 + 二次元壳 + 完整人设约束

**文件**: `index.html`

**1a. dsChat 支持 model 覆盖**
- 在 `DS_PROFILES` 各档中增加可选 `model` 字段
- `dsChat` 中 `const model = o.model || profile.model || DS_MODEL;` 替换硬编码 `DS_MODEL`
- 新增 `DS_PROFILES.persona_r1`：`{model:"deepseek-reasoner", temperature:0.5, max_tokens:4000, response_format:{type:"json_object"}}`
  - 注：R1 不支持 `temperature` 调节（API 固定 0），但传了不会报错；`response_format` R1 可能不支持，需降级为纯文本解析
  - 保守方案：persona_r1 不设 `response_format`，genPersona 端做 JSON 提取

**1b. 重写 genPersona prompt — 注入完整人设约束**
- 新增 `PERSONA_CONSTRAINTS` 常量：从 GAME-DESIGN.md 提取的 6 角色完整约束（Soul Field/口吻/禁/成长弧/二次元锚点/区分度锚点）
- genPersona 的 user prompt 结构改为：
  1. 世界观摘要（buildWorldBrief + GAME-DESIGN.md 卷一核心）
  2. **角色约束卡片**（PERSONA_CONSTRAINTS[npcId]：二次元锚点 + Soul Field + 口吻 + 禁 + 成长弧 + 区分度锚点）
  3. 用户自定义基准（WDCfg.npcPersona）
  4. 旧概念黑名单（OBSOLETE_TERMS）
  5. **语言法铁律**（GAME-DESIGN.md 5.2：禁考试词/禁命令句/禁拽文/禁AI口癖/日漫GAL基调）
  6. 输出 JSON 字段扩展：`{name, identity, personality[], style, speechRules{quirks[],forbidden[],samples[]}, relations[], goal, arc, soulField[], animeShell{reference,howToAdapt}}`

**1c. 配置中心人设编辑扩展**
- `WDCfg.setNpcPersona` 上限从 300 → 2000 字
- `renderCfg` 人设编辑区增加：
  - 展示完整人设卡片（含口癖规则/语言禁令/soulField）
  - 编辑框扩展为多行 textarea（2000 字）
  - "AI 生成（R1 推理）"按钮替代旧"DeepSeek 构思人设"

**1d. 人设卡进入对话 prompt**
- `systemPrefix()`（wd-chat.js L453）已有 `WDCfg.npcPersona(id)` 注入 — 扩展后的人设描述会自动进入 AI system prompt
- genPersona 产出的 `speechRules` 附加到 `st.personas[id].card` — `systemPrefix` 读取 persona.card 时自动带入

### 改动 2：时间机制调试与修复

**文件**: `index.html`

- 在 `render()` 函数的 HUD 渲染处加 `try-catch` 包裹 `stageOfDay(st.day)`，出错时 fallback 显示旧格式
- 在 `ensureClocks()` 之后加 `console.log("[v48] clocks:", {day:st.day, fog:st.fogDay, stage:stageOfDay(st.day).name})` 便于用户在 DevTools 排查
- 检查是否有 CSS 规则隐藏了 `.stats span` 中的新内容
- 如果 `st.day` 为 undefined 或 0，在 `ensureClocks` 中强制初始化为 1

### 改动 3：剧情呈现修复

**文件**: `index.html`

- **renderChat 中渲染 plot 消息**：检查 `renderChat()` 是否渲染 `kind==="plot"` 的 dialogue 项 — 如果不渲染，加一个 plot 消息的渲染分支（特殊样式：金边框 + 标题前缀【剧情】）
- **剧情触发提示**：`checkPlotTrigger()` 返回非 null 时，除了推入 dialogue，还要在主界面 toast 提示"剧情已触发，切到对话查看"
- **剧情日志面板**：在 hub 入口加一个"剧情回顾"按钮，展示已触发剧情列表

### 改动 4：考点数据注入

**文件**: `index.html`（运行时补丁，不动 game-data.js）

**4a. 加载新考点数据**
- 将 `考点数据库-2026-修正版.json` 转为 JS 模块：新建 `exam-2026-data.js`，内容为 `window.EXAM_2026_DATA = [...]`
- 在 `index.html` 的 `<head>` 或 `<body>` 底部加 `<script src="exam-2026-data.js"></script>`（在 game-data.js 之后、主 script 块之前）

**4b. 运行时替换 D.pointsLib**
- 在 v48 补丁块（STAGES 注入处之后）加：
```js
if(window.EXAM_2026_DATA && Array.isArray(EXAM_2026_DATA)){
  D.pointsLib = EXAM_2026_DATA.map(d => ({
    ...d,
    star: d.star || '3',           // 默认 3 星
    anchor_type: d.anchor ? 'manual' : '',
    // 兼容旧字段名
  }));
}
```

**4c. 更新 fallbackQuiz 兼容新字段**
- `fallbackQuiz` 中 `pt.text` 仍可直接用（新数据有 text 字段）
- `pt.star` 有默认值 '3'，兼容
- 新增：利用 `exam_tip` 字段优化造题（是非题用 exam_tip 作 why）

**4d. 考点卡片渲染兼容**
- `buildCardPool()` 中 `D.pointsLib.forEach` 已用 `x.id/x.text/x.star/x.anchor/x.status` — 新数据全有这些字段（star 有默认值），直接兼容

---

## 验证步骤

1. **语法检查**：`new vm.Script(code)` 编译内联 script 块，0 失败
2. **R1 连通性**：手动测试 genPersona 生成一个角色，验证 R1 返回有效 JSON
3. **时间机制**：VM 实测 ensureClocks + advanceNaturalDay + stageOfDay 覆盖 1-45 日
4. **剧情触发**：VM 实测 checkPlotTrigger 60% 门槛 + plotTriggered 去重
5. **考点数据**：VM 实测 D.pointsLib 替换后 586 条，fallbackQuiz 题量≥考点数（覆盖新 ID 前缀）
6. **硬刷新测试**：用户执行，验证 HUD 显示阶段名+雾涌日、剧情触发可见、考点复习正常

## 假设与决策

- **R1 model 名称**：`deepseek-reasoner`（DeepSeek 官方 reasoner 模型名）
- **R1 限制**：不支持 `response_format`，genPersona 端做正则 JSON 提取兜底
- **考点数据 star 字段**：全部默认 '3'（旧数据中 3 星最多，不影响功能）
- **非 S 前缀考点**：CITY/CUL/GUG 等新条目进入 pointsLib 但无 quizzes 关联 — fallbackQuiz 不会为它们造题（因为 lectures 中无对应 items），但会在考点卷（buildCardPool）中展示
- **旧 quiz pid 兼容**：旧 quizzes 引用的 S 前缀 pid 在新数据中应全部存在（新数据是超集）
