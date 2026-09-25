# v58c 纪日任务索引卡：云汀按纪日发单 + 对话流接取/交付对白

## 研究结论（先回答「今日」是什么）

时间模型（代码事实，`buildRuntimePlan`/`reorder-225.cjs`）：

- **1 自然日 = 界面说的「第 X 周」= 5 个纪日（游戏日）**：纪日绝对编号 `gd=(day-1)*5+gi+1`（1~225）。
- 纪日 gi=0/1/2 = **周一/周二/周三·正修**，各排 6~8 个任务（首日实测各 6 个：修诵/理经/传译/问契/理经/理经）；
  gi=3 = **周四·轻修**（常为空，定位约会/回访）；gi=4 = **周五·验界**（第 5/10/…/45 周有 1 个 boss）。
- 一周合计 18 个学习任务（验界周 19）。任务 id 形如 `R{day}-{gi}-{slot}`，`d.gameDays[gi].quests` 已按纪日回填。

**问题定性**：任务的分配单位本来就是纪日，但「今日任务」（`renderBoard`）与对话流（`buildStream`）
都按**整周（自然日）**平铺——18 张任务卡一次性灌进对话流、还各挂 cue，所以发放节奏是乱的。
正确口径：

- 任务页「今日任务」应改为 **「本周任务」按周一~周五分组**；
- 对话流云汀**一次只发当前纪日的一张索引卡**（周一 6 个任务），周一全清→发周二卡……周五验界完成→进入下一自然周；
- 索引卡实时反映该纪日进度（n/6）；任务的接取/交付在对话流有模拟对白（模拟玩家机制保留不动）。

当前纪日指针用**推导**，不加易脏状态：
`curGiOfDay(day)` = 本周第一个「有任务且未全清」的 gi（自动跳过空周四）；全周完成返回 null。
同步把 `st.gameDay` 对齐为该纪日 gd（现状 gameDay 初始化后从不推进，HUD 纪日号是死的）。

## 改动文件

- `index.html`（全部改动集中于此）：`buildStream`、`renderBoard`、`openQuest` 接取点、
  新增纪日工具/索引卡渲染/接取对白、cue 键改纪日级、负荷预估口径、gg_test 断言。
- `gg_test.js`：更新 buildStream/cue 密度断言，新增纪日分组与推进断言。
- `sw.js`：缓存版本 +1（wdzx-v58e）。

## 实施步骤（依赖序）

### 1. 纪日工具层
新增：
- `GD_LABELS=["周一","周二","周三","周四","周五"]`；
- `gdQuests(day,gi)`：取该纪日任务（复用 `d.gameDays` 回填，缺数据时从 `d.quests` 按 id 前缀 `R{day}-{gi}-` 兜底）；
- `gdProg(day,gi)`→`{n,all}`；`gdAllDone(day,gi)`；
- `curGiOfDay(day)`：第一个未全清且有任务的 gi，无则 null；
- `syncGameDay()`：把 `st.gameDay` 对齐当前周当前纪日 gd（在 settle/render 关键点调用）。

### 2. 任务页按纪日分组（renderBoard 重写「今日任务」区）
- 标题改「本周任务 · 次元内第 X 周」，下挂 5 个纪日分组（周一~周五）：
  组头「周一 · 正修（3/6）」，当前纪日高亮（cur），已全清打 ✓，空纪日灰显「轻修 · 可约会回访」；
  组内行沿用现有 qrow（进入/回看按钮，`data-enter`）。
- 负荷表与「今日预估」改为**当前纪日**口径（时长/记忆点/n 进度）；整周总量在组头汇总，不再以「今日 162 分钟」吓人。
- 未来纪日不硬锁（保持 `questUnlocked` 全周可进的既有自由度），但组头标「未到」弱化，玩家可提前做、做完同样计入。

### 3. 对话流：一纪日一张索引卡（buildStream 核心改造）
- 移除「每张未完成任务一条 `t:"quest"` + 每卡 cue」的循环；
- 在当周分隔行之后，为 `curGiOfDay(day)` 输出**一条**聚合消息 `t:"qindex"`：
  云汀署名 + 纪日开场 cue 一句（纪日级缓存，见步骤 4）+ 索引卡主体；
- 新增 `qindexHtml(day,gi)`：卡片标题「云汀的手札 · 周X（第 n/6 环）」，逐任务行：
  状态点（✓/▶/🔒）、任务名、tlabel、奖励、时长、行按钮「进入/回看/前序未完」；
  行点击 `openQuest(qid)`；卡随每次 render 现算（buildStream 本来就是现算），完成即时变 ✓、进度 +1，**不产生新卡**。
- 纪日推进入流：当推导指针从 gi 移到下一纪日时，向 `st.dialogue` 追加一条持久的
  「新纪日」消息（`{kind:"gdmilestone",npc:"yunting"}`，文本云汀口吻本地模板+AI 润色，≤40 字，
  过 cueRedFlags），幂等键 `st.gdIssued[gd]=1`。该消息之后才出现新纪日的 qindex（buildStream 按
  gdIssued 控制新纪日卡的显隐：已发布才显示，首次渲染即补发并落里程碑）。
- 已完成任务的折叠行（现有 `t:"sys" qid` + 回看）保留；`gotoQuest`/qref 在找不到流内单卡时直接 openQuest。

### 4. cue 从任务级改为纪日级
- 新缓存键 `st.questLines["gd:"+gd]`（cue/cueV/_cueP）；`genQuestCue` 增加纪日模式
  `genGdCue(day,gi)`：画面/内容按该纪日 6 任务的类别构成给（周一含修诵/理经/传译/问契），
  其余红线、跨稿去重（同 NPC 近期纪日 cue）、双稿重拟、CUE_V 机制全部复用；
- `buildQuestCue/pubLine/cueText` 的任务级 cue 调用收敛为只由索引卡使用的纪日 cue；
  任务弹窗内 stage0 开场五行（`renderStageDialog`）改用所属纪日 cue，不再触发任务级预热。
- 旧任务级 cue 键自然不再读取（不删数据，避免存档兼容风险）。

### 5. 接取/交付模拟对白（模拟玩家机制不动）
- **接取**：索引卡行点「进入」且任务未完成、且该任务未接过（`st.accepted[qid]` 幂等）时：
  先落一条玩家行动（`pushAction` 模板「我接了『XX』，这就去。」+ 新增 `refineAccept(id,q)`
  AI 第一人称润色，≤30 字，复用现有红线/旧概念禁令），再 openQuest；
  NPC 接取回应不单独再发一条（任务弹窗 stage0 的 dialog 即接取回应，避免三遍重复）；
  回看已完成任务不落接取。
- **交付**：维持现有链路（`pushAction` 交割 + `refineAction` + `directorFlow(kind:"questreact")`
  + doneLine），仅确保结算 render 后索引卡进度即时刷新（现有 render 已覆盖，验证即可）。

### 6. 文案/HUD 对齐
- buildStream 顶部「🎙️今日吟游 / ⏳今日预估约 X 分钟」的 X 改当前纪日剩余时长；
- HUD 纪日号由 syncGameDay 推进；「今日吟游」标签保留（吟游计划本身按自然周，文案可不动）。

### 7. 测试与验证
- `gg_test.js`：
  - 改旧断言：buildStream 不再有 18 条 cue/18 张 quest 卡；断言每周 1 条 qindex、cue=1；
  - 新增：gdQuests/gdProg/curGiOfDay 推导（完成周一 6 个→指针到周二；全周→null）；
  - 索引卡行包含该纪日全部任务 id 与实时进度；
  - 接取幂等（首次进入落 accepted+玩家行动，回看不落第二次）；
  - 里程碑消息幂等（同纪日不重复入流）。
- 浏览器专项脚本：首日渲染仅 1 张索引卡含 6 任务；逐任务完成后卡内进度 1/6→6/6 且不新增卡；
  周一全清后出现周二里程碑+周二卡（6 个新任务）；周五验界入卡；对话流 0 页面错误。
- 回归：v58 专项、smoke、立绘专项不受影响。

## 依赖与注意
- buildStream 每次渲染现算、不落 st.dialogue（里程碑除外），所以卡片改造无历史消息污染；
  但 qindex 的「发布节奏」需 gdIssued 持久化，否则切周/重载会重复补发——已在步骤 3 处理。
- `installRuntimePlan()` 在结算后重建日程，任务对象引用会刷新；索引卡一律以 QMAP/d.gameDays 现取，不持有引用。
- BOSS 挂在 gi=4（周五）且 id 不以 `R{day}-4-` 为前缀（用 BOSS/GB 后缀），gdQuests 的 gameDays
  回填已覆盖（回填逻辑包含 boss？——需在实现时核验 `gds.forEach` 回填对 BOSS 后缀的覆盖，
  不覆盖则 gdQuests 兜底需并入 `d.quests.filter(q=>q.gd===目标gd)`）。
- 模拟玩家回复机制（引导场景 AI 代写玩家台词）完全保留，不改其解析逻辑。

## 风险
- 纪日内自由顺序：玩家可先做后面任务，索引卡顺序固定但不强制（符合「可点选进入」）。
- 旧存档 st.gameDay 停在周一首日：syncGameDay 首次运行按实际完成情况对齐，不补发历史里程碑，
  只对当前应在纪日补发（gdIssued 回填当前纪日之前的全部纪日为已发，避免一次刷一串旧卡）。
- 未来纪日任务被提前做完时，curGi 推导会自然跳过，索引卡直接到更后的纪日——接受此行为。
