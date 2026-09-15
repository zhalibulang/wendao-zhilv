# 对话系统三项增强计划

## Context

用户反馈三个问题：(1) 对话流中输入 `@` 没有弹出角色选单；(2) 对话不够动态——导演应全程关注对话流、决定谁说话/怎么推进，任务完成后 NPC 应有活人感反应而非工具式报告；(3) 语感应更偏二次元/动漫/游戏风格，每个 NPC 应有个人目标与角色弧线。

当前架构：`sendChat()` → `parseMention()` → `npcAnswer()`，二元路由——`@all && flags.director` 走 `directorRespond()`（单次 AI 生成全员 JSON），否则走 `npcAnswerParallel()`（并行 `aiRespond`）。导演仅在 `@all` 时触发，单 NPC 对话不经导演。NPC 人设卡有 `name/identity/personality/style/relations` 但无 `goal/arc`。

## 实施方案

### Feature 1：@ 提及弹窗菜单

**文件**：`index.html`、`gg_test.js`

**新增函数**（放在 `parseMention` 附近）：
- `filterMentionList(token)` — 纯函数，根据 token 过滤 NPC 候选列表，`@所有人` 始终置顶
- `insertMention(value, atPos, endPos, name)` — 纯函数，替换 @token 为 @name，返回新 value + 光标位置
- `onChatInput(inp)` — input 事件处理，检测末尾 `@token` 正则，打开弹窗
- `openMention(inp, token)` / `renderMentionList(inp)` / `positionMention(inp)` — 弹窗渲染（向上展开）
- `handleMentionKey(e, inp)` — 键盘导航：↑↓ 选择、Enter/Tab 确认、Escape 关闭
- `selectMention(inp, idx)` / `closeMention()` — 选择/关闭

**修改**：
- `#chatInput` 绑定 `input` 事件 → `onChatInput`
- `keydown` 先走 `handleMentionKey`，弹窗开时拦截方向/回车/ESC
- 文档级 `pointerdown` capture 监听点击外部关闭
- `sendChat()` 开头加 `closeMention()`
- 弹窗用内联样式，zpix 字体 + Y2K 配色变量

### Feature 2：增强导演系统

**文件**：`wd-chat.js`、`index.html`、`gg_test.js`

**2.1 `DS_PROFILES` 新增低 token 档**（index.html ~2967）：
- `directorplan: { temperature:0.6, max_tokens:300, response_format:{type:"json_object"} }`
- 导演只输出小型 JSON 计划，省 token

**2.2 `directorPlan(userText, opts)` 新函数**（wd-chat.js）：
- 收集全量 NPC 精简卡：`{id, 姓名, 职能, 节奏, 目标(arcSeedOf)}`
- 系统 prompt：你是群聊导演，决定哪些 NPC 该开口、按什么顺序、用什么反应类型
- 类型：`respond`(接话) / `interject`(插话) / `react`(反应) / `guide`(拽回正事)
- hint ≤20字给方向，不替 NPC 写台词
- 60s 缓存防短时重复调用

**2.3 `directorFlow(userText, opts)` 新函数**（wd-chat.js）：
- 调 `directorPlan` 获取计划 → 按序对每个选中 NPC 调 `respond/respondWithTools`（注入 hint）
- 顺序执行（非并行）保留发言次序，后者可感知前者
- 返回 `[{npc, text}]` 或 null

**2.4 `respond`/`respondWithTools` 增 `directorHint` 形参**：
- `buildContext` 尾部追加导演指示（仅方向，不替写词）

**2.5 重写 `npcAnswer()`**（index.html ~898）：
- 导演 flag 开 → 走 `directorFlow`；失败回退 `npcAnswerParallel`
- 单 NPC 对话也经过导演（导演可决定让其他人插话）

**2.6 `settleQuest()` 任务完成反应**（index.html ~1729）：
- 保留模板 ack 即时落流（<200ms 反馈）
- 异步调 `directorFlow("玩家交割了「X」", {kind:"questreact"})` 
- AI 返回后替换模板 ack 为有性格的反应，其他插话者追加为新消息
- 不耗灵力（同 refineYunheng 模式）

**2.7 清理死代码**：删除 `maybeNpcChimeIn()`（引用不存在的 `shouldChimeIn`，无调用点）

### Feature 3：动漫风格 + 角色弧线

**文件**：`npc-registry.js`、`index.html`、`wd-chat.js`、`gg_test.js`

**3.1 npc-registry.js 每个 NPC 增 `arcSeed`**：
- yunheng: goal=恢复圣女之力驱散雾, arc=从不安到笃定
- qingxuan: goal=理脉归位, arc=从惜字到愿多留半句
- smq: goal=补全山河剑谱, arc=从醉眼看世到愿为同行者挡剑
- tiemian: goal=法条剑阵全激活, arc=从刻板到嘴硬式关切松动
- liuruyan: goal=守住行会分寸, arc=从纱后旁观到主动撑场
- moxiaogu: goal=点亮四百封印, arc=从贪玩到担起古迹守护
- xuanji: goal=收服错题妖, arc=从冷眼星盘到灵魂绑定默契
- 新增 `arcSeedOf(id)` 派生函数，`validate()` 加 `arcSeed` 校验

**3.2 `genPersona()` 增 goal/arc 输出**（index.html ~3091）：
- prompt 追加 goal/arc 字段要求
- 引用 `arcSeedOf` 作为基线参考
- 归一化截断

**3.3 `systemPrefix()` 注入 arcBlock**（wd-chat.js ~434）：
- 优先用人设卡 goal/arc，回退 arcSeedOf
- 注入位置：voice → persona → arc → growth

**3.4 `voiceBlock()` 加动漫风格方向**（wd-chat.js ~483）：
- 日式RPG/轻小说/GALGAME 语感指导
- 禁表面口癖卖萌、禁AI腔/三腔
- "玩家是同行者不是世界中心"

**3.5 人设面板增 goal/arc 编辑**（index.html ~3395）：
- 两个 textarea，`data-fld="goal"` / `data-fld="arc"`
- `saveEdit()` 通用分支自动写入

## 实施顺序

1. Feature 3.1（npc-registry arcSeed + arcSeedOf + validate）— 无依赖
2. Feature 3.2-3.5（genPersona/systemPrefix/voiceBlock/面板）— 依赖 3.1
3. Feature 2（导演系统）— directorPlan 读 arcSeedOf
4. Feature 1（@弹窗）— 独立，风险低
5. 每步补测试，最后 `node gg_test.js game-data.js index.html` 全量验证
6. `sw.js` CACHE 升版（v36→v37）

## 验证

- `node gg_test.js game-data.js index.html` 全量通过
- 浏览器：输入 `@` 弹出选单 → 键盘/点击选择 → 正确插入
- 浏览器：单 NPC 对话 → 导演决定插话者 → 多角色自然回应
- 浏览器：任务完成 → NPC 有性格反应（非"已交付"模板）
- 浏览器：人设面板可见/编辑 goal/arc 字段
