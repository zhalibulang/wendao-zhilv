# 对话系统全面 AI 化重构 - 实施计划

## Task 1: API 密钥前置门控与配置引导界面
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 改造 `intro()`：无有效密钥时不渲染"进入序章"按钮，改为全屏配置引导界面（说明为何需要密钥、获取方式、隐私承诺、密钥输入框、保存+连通测试）。
  - 改造 `boot()` 已有存档路径：加载后若 `dsReady()` 为 false，弹窗要求配置密钥，否则不进入游戏。
  - 新增 `dsKeyGateBlocking()` 变体：测试通过后才解锁继续按钮（复用现有 `dsKeyGate` 逻辑但阻断式）。
- **Acceptance Criteria Addressed**: AC-1, AC-9
- **Test Requirements**:
  - `rule` TR-1.1: `intro()` 在 `!dsReady()` 时 DOM 不含 id=`begin` 的按钮；配置有效密钥后含该按钮。证据：gg_test 断言。
  - `rule` TR-1.2: `boot()` 加载有存档但无密钥时，调用密钥配置流程而非直接 `render()`。证据：gg_test 断言。
- **Notes**: 连通测试用 `dsChat([{role:"user",content:"ok"}],{kind:"polish"})`。

## Task 2: 移除本地对话兜底系统
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - `WDChat.respond`：删除 `!dsReady()` 时的 `fallback()` 返回；AI 失败/空文本时返回 `{text:"",degraded:true,error:e.message}`。
  - 删除 wd-chat.js 中 `fallback()` 函数体与所有话术池（FB_QUEST、tired/cheer/question/chitchat/report/again/tease 及 npc-registry 的 fallback.openers/story 引用）。
  - 保留意图分类（intentDetect）用于构建 AI 上下文。
- **Acceptance Criteria Addressed**: AC-2, AC-3
- **Test Requirements**:
  - `rule` TR-2.1: `WDChat.respond` 源码不含 `this.fallback(` 调用。证据：grep。
  - `rule` TR-2.2: `grep -nE "(tired|cheer|question|chitchat|report|again|tease):\[" wd-chat.js` 无本地池定义。证据：grep。
  - `rule` TR-2.3: AI 失败时 respond 返回 `error` 字段且 `text` 为空，不含任何本地池句子。证据：gg_test mock 失败场景。

## Task 3: 任务开场/收尾台词 AI 化
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - `pubLine(q,d)` 改为异步 AI 生成（短 prompt：当前任务+NPC，≤40字开场白），结果存 `st.questLines[q.id].pub` 缓存。
  - `doneLine(q,d)` 同理存 `st.questLines[q.id].done`。
  - 渲染时若缓存未就绪，显示"…"占位并后台生成，生成后刷新。
  - 删除本地 pool 数组。
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `rule` TR-3.1: `pubLine` 函数体不含硬编码字符串数组。证据：grep。
  - `rule` TR-3.2: 缓存命中时不调用 dsChat。证据：gg_test mock dsChat 计数。
  - `rule` TR-3.3: AI 失败时返回占位提示而非本地话术。证据：gg_test。

## Task 4: 每日引导场景 AI 化
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - `generateGuidanceScene` 改为一次 AI 调用生成当日引导对话（云蘅开场→玩家回应→功能 NPC 接入→云蘅收束，4-6 条消息）。
  - 输入：当日情境（天气/NPC活动）、当前任务、功能 NPC 信息。
  - 输出：解析为消息数组落流，带 `guidance` 标记。
  - 删除 `GUIDANCE_TEMPLATES` 对象及其引用。
  - 失败时：用极简通用占位（"今日情境由 AI 生成中…"）并提示重试，不用本地模板。
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `rule` TR-4.1: `grep GUIDANCE_TEMPLATES index.html` 无引用（可留定义但未使用，或删除）。证据：grep。
  - `rule` TR-4.2: 引导消息含 `guidance:true` 标记且 AI 生成。证据：gg_test mock。
  - `rule` TR-4.3: 失败时落流提示含"重试"且不含旧模板措辞。证据：gg_test。

## Task 5: 任务简报 AI-only
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - `openQuest` 中删除 scenePool/necPool/impPool/rewPool 本地兜底池。
  - AI 生成失败时任务卡对应区域显示"灵脉未通，点击重试"按钮，不展示本地文案。
  - 保留 v33 缓存逻辑（v===2 才直用）。
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `rule` TR-5.1: openQuest 源码不含 `scenePool`/`necPool`/`impPool`/`rewPool`。证据：grep。
  - `rule` TR-5.2: AI 失败时任务卡含"重试"按钮且无本地兜底文案。证据：gg_test。

## Task 6: API 连接监测与重连机制
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - `aiHealth` 三态（ok/error/down）在状态栏徽标 + 对话流顶部条展示。
  - `dsChat` 失败时更新 `aiHealth` 并落一条系统提示到对话流（"灵脉暂时中断：{原因}"）。
  - 对话中 AI 失败自动重试 1 次；仍失败则提示并提供"重连"按钮（重新连通测试）。
  - 新增 `reconnectAi()`：执行连通测试，成功则 `aiHealth="ok"` 并 toast。
- **Acceptance Criteria Addressed**: AC-7, AC-3
- **Test Requirements**:
  - `rule` TR-6.1: `aiHealth` 变化时状态栏徽标 class 同步。证据：gg_test。
  - `rule` TR-6.2: 失败后对话流含"灵脉"系统提示。证据：gg_test。
  - `rule` TR-6.3: `reconnectAi()` 成功后 `aiHealth==="ok"`。证据：gg_test mock。

## Task 7: 延迟控制与思考指示器
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 2, Task 6
- **Description**:
  - 玩家发送消息后，NPC 气泡显示"正在思考…"打字指示器直至 AI 返回。
  - 流式响应首包到达即开始显示。
  - 任务开场白/收尾/引导/简报均走缓存（已有机制）。
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `rule` TR-7.1: 发送消息后 DOM 含"正在思考"或等效指示器。证据：真机截图。
  - `rubric` TR-7.2: 首包延迟；scale 1-5；anchors 1=>15s/3=>8-15s/5=><8s；threshold>=3；证据：真机计时。

## Task 8: 测试更新与真机全链路验证
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1-7
- **Description**:
  - 更新 gg_test.js：移除/改写依赖 fallback 的旧断言；新增 AI-only 各路径断言。
  - SW 缓存升版。
  - 真机验证：无密钥阻断→配置密钥→序章→第1日引导（AI）→对话（AI）→任务卡简报（AI）→模拟失败提示。
- **Acceptance Criteria Addressed**: AC-1 ~ AC-10
- **Test Requirements**:
  - `rule` TR-8.1: `node gg_test.js game-data.js index.html` 全绿。
  - `rule` TR-8.2: 真机无密钥时无法进入；配置后可进入。
  - `rule` TR-8.3: 真机对话/引导/任务简报均由 AI 生成，无本地话术痕迹。
