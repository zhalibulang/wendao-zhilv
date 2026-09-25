# v57 健壮性加固 · 小屏适配 · 死代码清理 实施计划

## 背景与研究结论

基于对 `index.html`（8460 行 / 555KB 单体内联脚本 + 10 个外部模块）的静态审查、
`gg_test.js` 全量单测（当前全绿，17 项历史 SKIP）与 puppeteer 真实浏览器冒烟
（13 段全 PASS，四类任务全流程可玩），确认当前**无卡关、无未定义函数引用、无空壳模块**。
待优化项均为测试覆盖不到的工程隐患，分三类：

1. **健壮性**：主渲染与任务结算两条关键链路无异常保护；存档失败静默吞错。
2. **前端设计**：小屏（≤560px）头部状态栏溢出、导航触控目标过小、弱对比度小字、重复 id。
3. **死代码**：8 个"疑似零调用"函数经全仓 grep 复核——其中 `cueText`/`buildDailyPlan`
   被 `gg_test.js:1523/1590` 引用，**保留**；其余 6 个确认真实零调用，可删。

## 改动文件

- `index.html`（唯一改动文件：JS 加固、CSS 适配、删死函数、favicon link）

不改动：数据文件、wd-* 模块、gg_test.js、sw.js（icon-192.png 已存在，sw 预缓存清单已含图标则无需动；执行时确认一次）。

## 实施步骤（依赖顺序）

### 阶段一：JS 健壮性（P0）

1. **`render()` 外层保护**（index.html:2561）
   - 将现有函数体整体包进 `try{ ... }catch(e){ ... }`。
   - catch 中：`console.error('[render]',e)`，并向 `#game` 写入兜底面板
     （世界观口吻："雾气一时迷了眼……" + 「重新凝聚」按钮，按钮 `onpointerdown` 调 `render()`），
     保证任何子 render（renderChat/renderLib/renderNight/...）抛错时**白屏变可恢复面板**。
   - 注意：index.html:8111 另有一个嵌套作用域同名 `render`，**不动**。

2. **`settleQuest()` 结算保护**（index.html:4051，async）
   - SRS 入档段（4054-4057）：`forEach` 内逐卡包 try-catch，单卡入档失败 `console.error`
     但不阻断其余卡与结算主流程（避免一张坏 key 导致整个任务无法交割、卡进度）。
   - 函数体最外层包 try-catch：catch 中确保 `ov && ov.remove()` 已执行则不重复移除、
     `console.error('[settleQuest]',e)`、toast 提示"力量交割受扰，但进度已留存，请再看一眼"，
     并尽力执行 `save();render();`。杜绝 async 回调产生 unhandled rejection
     （调用点 finBtn/qxSkip 的 onpointerdown 不 await）。
   - 不改变成功路径的任何既有行为与顺序（done/xp/coin 先落、两阶段异步导演流、BOSS 过场）。

3. **`save()` 失败可观测**（index.html:2103）
   - catch 中 `console.error('[save]',e)`；toast 提示存档失败，加 10 秒节流
     （模块级 `let lastSaveErrAt=0`），避免连续自动存档刷屏。不改存档数据结构。

4. **流式 delta 静默 catch 加日志**（index.html:6657）
   - 两处空 catch 增加 `console.warn`（onDelta 渲染异常 / 坏 JSON 块），不改控制流与降级行为。

### 阶段二：死代码清理（P1）

5. 删除以下 6 个**已全仓 grep 确认零调用**（含 .js/.html/HTML 属性）的顶层函数：
   - `rewardItemUnlocked`（1185）
   - `adjustDailyPlan`（2293，async）
   - `lockLine`（2553）
   - `fcHint`（4798）
   - `personaTermAll`（6706）
   - `genQuiz`（6855，async；注意区别于仍在使用的 `genQuizBank` 6957）
   - **保留** `cueText`（2484）、`buildDailyPlan`（2270）——gg_test 在用。
   - 删除前执行时再 grep 一遍 `window['函数名']` / 字符串动态引用形式，确认无反射调用。
   - 提取内联脚本 `node --check` 语法校验。

### 阶段三：前端小屏与可访问性（P2，纯 CSS/标记）

6. **头部溢出**（.hd .stats，:37）：加 `flex-wrap:wrap;row-gap:4px;justify-content:flex-end`；
   扩展现有 `@media(max-width:560px)`（:318）：`.gametime` 降至 13px、stats gap 8px、字号 11.5px，
   保证 390px 视口不横向溢出、配置/存档按钮可见。
7. **导航触控目标**（.navline button，:45）：`padding:9px 12px`（约 38-40px 高，保留横滚与单行密度）。
8. **弱对比度**：`--dim` 由 `#9a8a72`（约 2.8:1）加深至 `#7d6c52`（对 `#f6efe4` 底约 4.5:1），
   全局一处变量生效，不逐选择器改。
9. **重复 id 治理**：5983 `renderCfg` 内 `id="npcList"` → `id="cfgNpcList"`，
   同步其作用域内选择器；7345 `renderSave` 内 → `id="saveNpcList"`，同步 `$("#npcList",ov)`。
   - 执行时 grep `npcList` 全部引用点逐一改，确保无遗漏。
10. **favicon 404**：`<head>` 加 `<link rel="icon" type="image/png" href="icon-192.png">`
    （复用现有图标，消除冒烟中唯一 console 报错）。

## 依赖与注意事项

- 全部改动集中在 index.html，无数据结构/存档 schema 变更，旧存档完全兼容（`save()` 节流变量为运行时态）。
- render 兜底面板与 toast 文案须遵循世界观口吻，不出现考试/教师腔词汇；兜底面板属系统异常信息，
  用"雾气迷眼/重新凝聚"的隐喻，不出现"错误/崩溃"等技术性措辞。
- CSS 变量 `--dim` 被大量选择器引用，改一处即全局生效，需截图确认视觉无发灰/发糊副作用。
- 不纳入本次范围（属后续功能批，非本次审查发现的缺陷）：45 日后模拟考训练模式、好感/约会深化、
  六景点精灵全量（当前仅紫宸）。

## 验证

1. `node gg_test.js game-data.js index.html`：全绿，SKIP 数保持 17 不增。
2. 提取内联脚本 `node --check`：语法通过。
3. `node /tmp/wd_smoke/smoke.js`：13 段全 PASS；Console/页面错误段除 favicon 外本就为 0，
   改动后应为 **0 条**（favicon link 生效）。
4. 新增小屏冒烟：puppeteer 视口设 390×844，断言 `document.documentElement.scrollWidth <= 390`
   （无横向溢出），截图人工确认头部换行与导航高度。
5. render 兜底验证：控制台临时 `window.__throwOnce` 钩子（或直接令某 render 抛错一次），
   确认出现兜底面板且「重新凝聚」可恢复；验证后移除钩子。
6. 截图对比桌面 1440 宽：主视觉无回归（--dim 加深后确认观感）。

## 风险与回退

- **删函数误删反射引用**：执行前双重 grep（含 `window[...]`/字符串），gg_test 全绿兜底；
  若冒烟/单测红，单个函数还原即可。
- **render 包裹吞错掩盖问题**：catch 中 console.error 完整堆栈 + 面板显示错误简述，可观测不丢失。
- **CSS 改动视觉回归**：纯增量（flex-wrap/媒体查询/变量值），git 可单文件秒级回退；
  `--dim` 若观感不佳换更浅的中间值（如 `#857358`）。
- 改动均在工作区未提交状态上进行，不执行 git commit（除非用户另行要求）。
