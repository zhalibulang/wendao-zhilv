# v52 对话流清洗与导游词系统优化

## Context

用户反馈游戏主对话流存在多类系统性问题：违禁词（灯芯/又亮了一分/头一桩/莫慌）反复出现且过滤机制有漏洞；剧情点产出机制不符合"1游戏日+1自然日"双奖励设计；任务开场对话无意义；剧情与游戏行为混流；导游词背诵模块起点锁天安门且前置条件不明根本进不去。本次对主对话流数据全面清洗并优化导游词学习系统，确保符合策划案 GAME-DESIGN.md 规范，不破坏 v51 已落地的出题/错题/九阶段历法。

## 现状关键定位（index.html）

| 模块 | 位置 | 现状 |
|---|---|---|
| 违禁词过滤 | L1096-1116 | NPC_TEXT_REMAP 是旧术语映射，filterNpcText 仅 split/join，未覆盖硬编码 |
| 违禁词硬编码 | L1957, L1236-1237, L1322-1323, L5763 | "灯芯又亮了一分"等绕过过滤 |
| 剧情触发 | L1030-1044 checkPlotTrigger | 门槛=当日完成≥60%，无累积点数 |
| 剧情表 | L975-1021 PLOT_THEMES | 固定45日每日1剧情 |
| 时钟推进 | L941-969 ensureClocks/advanceNaturalDay | 三套时钟已就绪 |
| 主对话流 | L1998-2027 buildStream | 剧情与行为混流 |
| 任务开场 | L2052-2063 pubLine | 硬编码"新的一程"单句 |
| 任务简报 | L5138-5146 | AI brief 含 oralMap/worldBrief |
| 导游词数据 | L3691-3695 D.oralFull.sections | 分站段句数据已具备(s.h/s.text/s.en) |
| 口语背诵UI | L2615-2662 | 录音/打字/遮文+对照评分，仅单页 |
| 导游词线 | L6201-6208 renderOralLine | 按 q.day 排序，起点锁 oralMap TAM |
| 任务解锁 | L1991-1994 questUnlocked | 检查 q.prev 前序链 |
| 考点卡片 | L3688-3695 buildCardPool | 已用 sections 分节 |

## 实施顺序（依赖链）

R1 过滤基建 → R5 配置一致性 → R4 剧情行为分离 → R2 剧情点累积 → R3 cue流程 → R6 导游词系统

---

## R1 内容过滤优化（最保险方案：三层防线）

**根因**：filterNpcText 是术语映射非风格黑名单；违禁词硬编码绕过过滤；AI生成侧约束未在后处理兜底。

**步骤**：
1. 新增 `STYLE_BLACKLIST` 数组（L1108 后）：`[["灯芯","回响"],["又亮了一分","又清晰一寸"],["头一桩","起手"],["莫慌","别忙"],["拿下","接过"],["搞定","妥了"],["立住了","稳了"],["接住了","接稳了"]]`
2. 扩展 `filterNpcText` (L1109)：映射替换后追加黑名单 split/join 替换
3. 全路径覆盖：在 pubLine/doneLine(L2052-2063) return 前包 filterNpcText；performPlot(L1066)入栈前；checkLevelUp(L1957) storyAppend 前；wd-chat.js storyAppend(L295) 包装 `window.filterNpcText`
4. 源头清除：改写 L1957"灯芯又亮了一分"→"圣女的回响又清晰一寸"；L1236-1237/L1322-1323/L5763 同步改写
5. AI侧：genPersona prompt(L5038)/systemPrefix 注入黑名单清单+"违禁词零容忍"；directorAudit 增黑名单扫描

**检测**：VM 用例 filterNpcText("圣女指尖的灯芯又亮了一分")→"圣女指尖的回响又清晰一寸"；Grep `灯芯|又亮了一分|头一桩|莫慌` 在对白/prompt 零残留

**验收**：硬编码清零；filterNpcText 黑名单 100% 替换；AI 输出 audit 后零命中

---

## R5 配置文件应用与一致性检查

**步骤**：
1. 新增 `PLAN_VERSION="v52"` + `PLAN_REG` 字典（登记：oral起点改故宫/分站段句/cue流程/plotPoints/剧情行为分离）
2. defaultAiDocument(L1540)/worldBrief(L1271) 末尾注入 PLAN_REG 关键决策
3. 新增 `checkPlanConsistency()`：启动校验 STAGES.days(1-45)、oralMap起点GUG、plotPoints字段、cue开关；不一致 console.warn
4. localStorage 迁移：st.ver 写入；升级时初始化 st.plotPoints/st.cueFlows/st.oralProgress

**验收**：启动日志显示版本+一致性通过；AI prompt 含 PLAN_REG

---

## R4 内容结构调整：剧情/游戏行为分离

**步骤**：
1. 拆 buildStream(L1998) 为 `buildActionStream()`(sysday+quest+sys进度) + `buildPlotStream()`(剧情对白，源 st.dialogue 按 kind:"plot" 过滤)
2. 渲染层 renderChat 改双流：行为流主列 + 剧情流侧栏（或单列用 class 区分）
3. 关联机制：行为节点 {t:"quest",qid,plotTrigger,day,theme} ↔ 剧情节点 {t:"plotline",day,theme,questId} 双向引用
4. performPlot(L1046) 不再 push dialogue 混流，改 push st.plotLines 新数组
5. 规范写入 PLAN_REG

**验收**：剧情/行为渲染分离；节点可双向跳转；Grep 验证 kind:"plot" 与 kind:"quest" 不在同一 out

---

## R2 剧情点累积机制

**数据**：`st.plotPoints={total:0, byDay:{}, byNaturalDay:{}, triggered:{}}`

**步骤**：
1. 新增 `addPlotPoints(src, day)`：src="gameDay" 当日 dayProg(d).n≥dayProg(d).all→+1 记 byDay；src="naturalDay" advanceNaturalDay 推进→+1 记 byNaturalDay
2. 重写 checkPlotTrigger(L1030)：按 plotPoints.total 达 PLOT_THEMES[day] 阈值触发，而非固定60%
3. 实时监控：settleQuest(L3332)/advanceNaturalDay(L954)/checkDailyGift(L1970) 各调 addPlotPoints+checkPlotTrigger
4. REWARD_ITEMS(L1023) 联动 plotPoints.total 解锁

**测试**：VM day=5 all=5 n=5→byDay[5]=1 total=1；advanceNaturalDay 两次→byNaturalDay 累积2；total=5→触发 PLOT_THEMES[5]

**验收**：累积正确；阈值触发；REWARD_ITEMS 联动；迁移逻辑初始化

---

## R3 任务开场 cue 流程

**步骤**：
1. 新增 `buildQuestCue(q,d)`（L2052 附近）：输出 {status(阶段名+NPC心境), plan(任务名+questMetaphor), remain(待完成数), next(下一任务), motivate(AI激励句)}
2. pubLine(L2052) 返回 cue 5段拼接 + filterNpcText
3. AI侧：dsChat kind:"questcue" 低token档异步生成 motivate，落 st.questLines[q.id].cue；无API用 QUIZ_INTROS(L2561) 角色池兜底
4. buildStream(L2013) push {t:"npc",npc:q.npc,x:cueText,kind:"cue"}（与剧情 t:npc 区分）
5. openQuest(L2578) 进入时 cue 渲染到 modal 顶部 banner
6. motivate 的 system 注入 PERSONA_CONSTRAINTS(L4823)+LANGUAGE_IRON_RULES(L5028)

**测试**：VM day=1第一任务→cue.status 含"初至阶段"；浏览器点任务看cue banner；Grep kind:"cue" 出现

**验收**：所有任务开场5段cue；无API有兜底；符合人设；黑名单零命中

---

## R6 导游词系统优化（最关键卡点）

**卡点根因**：oral任务起点锁 oralMap TAM 第一；questUnlocked(L1991) 检查 q.prev 链，若 oral 任务有 prev 未完成则进不去；openQuest(L2586) 检查 minLv 等级；用户"不知道前置条件"。

### 6a 体量核查
- 新增 `auditOralCoverage()`：遍历 D.oralFull 输出每篇 words/sections 数；缺篇缺段 console.warn
- 补全：game-data.js 3MB 不可改，小补丁用 index.html 运行时 D.oralFull.push；大补全需用户提供材料

### 6b 起点改故宫 + 解锁链修复
1. oralMap(L5138) GUG 移首位：`{"GUG":"forbidden-city","TAM":"tiananmen-square",...}`
2. renderOralLine(L6204) 改显式排序 `ORAL_ORDER=["GUG","TAM","TAN","SUM","WAL","TOM"]`
3. 运行时 patch oral 任务 prev 链：`QMAP[id].prev=[]` 解除锁死（不可改 game-data.js）
4. 明示解锁条件：renderOralLine 显示"需完成 X / 等级 Lv.Y"

### 6c 分站/段/句结构化
- renderOralBlock(L2906) 重写三层：站(篇banner)→段(o.sections 遍历, s.h 小标题, 展开/折叠)→句(段内英文按 . 切句, 逐句高亮/点读/录音)
- 复用 buildCardPool(L3688) 的 full:uid 卡片结构

### 6d 多样化学习方式
- 阅读：默认中英对照（已有）
- 复述：录音/打字/遮文（已有，扩展到逐句）
- 分站背诵考核：每段结束触发 `oralSectionTest(s)`，5关键词自评+录音对照
- 通篇背诵考核：每篇结束触发 `oralFullTest(o)`，遮全篇+录音+关键词评分，达标 st.oralCert[o.id]=true

### 6e 30/45日进度规划
- ORAL_PLAN_30/45：30日=每篇通读+分站背诵；45日=通篇背诵考核
- 整合入每日任务：buildStream 对应 day sysday 后 push {t:"sys",x:"今日吟游：GUG第2段分站背诵"}，由 ORAL_PLAN[st.day] 计算
- 进度跟踪：st.oralProgress={GUG:{read,sectionDone:[],fullCert},...}，renderOralLine 顶部进度条用此字段

**测试**：VM auditOralCoverage 6篇齐全；ORAL_ORDER 排序 GUG 首位；oralSectionTest 关键词通过；浏览器点故宫任务→分站段句→逐句录音→通篇考核解锁

**风险**：oral prev 链运行时 patch 需测试不破坏其他任务链；通篇考核遮文复用 L2625 mask 逻辑避免重复造轮

**验收**：起点故宫；解锁链明示；分站段句层级；4种学习方式；30/45日进度入流；进度跟踪正确

---

## 测试方案

1. **语法检查**：`awk '/<script>/{f=1;next}/<\/script>/{f=0}f' index.html > /tmp/v52.js && node --check`
2. **VM 单元**：gg_test.js 加5组（filterNpcText黑名单/plotPoints累积/buildQuestCue输出/ORAL_ORDER排序/oralSectionTest关键词）
3. **Grep 验证**：违禁词对白零残留；st.plotPoints/cueFlows/oralProgress 迁移初始化；kind:"cue"/kind:"plot" 分类正确
4. **浏览器冒烟**：硬刷新后——HUD游戏纪日、任务树9阶段、点任务看cue banner、完成任务看剧情点+1 toast、达阈值剧情触发、点故宫oral任务进分站段句、录音复述可用、通篇考核解锁

## 风险与兼容

- 存档迁移：st.plotPoints/cueFlows/oralProgress 在 loadState/save 加迁移，老存档不报错
- AI离线：所有AI路径(cue.motivate/plot台词/persona)有兜底池
- game-data.js不可改：数据补丁在 index.html 运行时 push/patch
- buildStream拆分：保留旧 buildStream() 入口（内部调两子流合并），外部调用点不报错
- oralMap起点改动：影响 buildQuestBrief(L5138) oralInfo 顺序，同步测试

## 验收标准（合并）

1. 违禁词清单100%覆盖；硬编码清零；AI输出audit后零命中
2. PLAN_VERSION显示；一致性检查通过；AI prompt含PLAN_REG
3. buildStream拆双流；剧情/行为渲染分离；关联机制双向跳转
4. st.plotPoints累积正确；阈值触发PLOT_THEMES；REWARD_ITEMS联动
5. 所有任务开场cue 5段；无API有兜底；符合人设
6. 导游词起点故宫；解锁链明示；分站段句层级；4种学习方式；30/45日进度入流

## 关键文件

- index.html（所有内联脚本改动主战场）
- wd-chat.js（storyAppend 包过滤；systemPrefix/voiceBlock 注入黑名单；directorAudit 扫描）
- gg_test.js（新增5组VM用例）
- .trae/documents/v52-dialog-cleanup-oral-revamp.md（本计划）
