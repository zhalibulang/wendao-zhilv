# 对话系统全面 AI 化重构 - 产品需求文档

## Overview
- **Summary**: 将《问道之旅·四十五日》的对话流从"AI + 本地兜底"双轨制重构为"纯 AI 驱动"单轨制；移除全部内置预设对话内容；在启动流程中强制校验 AI API 密钥，未配置则阻断游戏进入；新增 API 连接状态实时监测与重连机制。
- **Purpose**: 消除本地话术与 AI 生成之间的语感割裂，确保所有 NPC 对话、引导场景、任务开场白与任务简报均由 AI 统一生成，提升沉浸感与角色一致性；同时以 API 密钥为前置门槛，保证 AI-only 架构下游戏可玩。
- **Target Users**: 已拥有 DeepSeek API 密钥、希望获得纯 AI 驱动沉浸式 RPG 对话体验的玩家。

## Goals
- 彻底移除对话流中所有本地预设话术（NPC 应答兜底、任务开场/收尾台词、每日引导模板、任务简报兜底池）。
- 所有对话流文本由 AI 实时生成（允许结果缓存以控制延迟）。
- 启动时强制校验 AI API 密钥有效性，无效/缺失时阻断游戏进入并展示配置引导。
- API 连接中断时给出明确错误提示与自动/手动重连，不再回退本地话术。

## Non-Goals
- 不改动序章（PROLOGUE_SCRIPT）等固定叙事脚本——序章是演出性质的过场，不属于动态对话流。
- 不改动任务数据（关卡名、目标、时长、修行/铜钱奖励）等结构化数据。
- 不改动 UI 界面文案（按钮、标签、系统提示）。
- 不替换 DeepSeek 为其他模型供应商。
- 不实现离线模式——无密钥即不可进入游戏。

## Background & Context
- 当前架构（v34）：`WDChat.respond` 在 `dsReady()` 为 false 或 AI 失败时回退到 `fallback()` 本地话术池；`pubLine`/`doneLine` 用本地池生成任务开场白；`GUIDANCE_TEMPLATES` 生成本地引导场景（可选 AI 润色）；任务简报 `genQuestBrief` 有本地兜底池。
- 问题：本地话术与 AI 生成语感不统一，角色一致性差；玩家可在无密钥时体验割裂内容。
- 依赖：DeepSeek Chat API（`https://api.deepseek.com/chat/completions`），密钥存于 `st.dsKey`。

## Functional Requirements

### FR-1: API 密钥前置门控
- 游戏启动（boot/intro）时必须校验 `st.dsKey` 的存在性与有效性（连通性测试）。
- 无有效密钥时：不展示"进入序章"按钮，全屏展示配置引导界面，说明为何需要密钥、如何获取、隐私承诺。
- 配置引导界面提供密钥输入框、保存按钮、连通性测试；测试通过后才解锁进入按钮。
- 对已有存档的老玩家：进入游戏时若密钥失效，弹窗要求重新配置，否则留在配置界面。

### FR-2: 移除本地对话兜底
- `WDChat.respond` 不再调用 `fallback()`；AI 失败或返回空时，返回明确错误状态（不拼本地话术）。
- 删除 wd-chat.js 中所有本地话术池（FB_QUEST、tired/cheer/question/chitchat/report/again/tease/openers/story 等）。
- 删除意图分类中仅服务于兜底的分支（保留意图分类用于构建 AI 上下文）。

### FR-3: 任务开场/收尾台词 AI 化
- `pubLine`（任务解锁时 NPC 开场白）与 `doneLine`（任务完成时收尾语）改为 AI 生成，结果按任务 id 缓存（避免重复调用）。
- 移除本地 pool 硬编码。

### FR-4: 每日引导场景 AI 化
- `generateGuidanceScene` 不再使用 `GUIDANCE_TEMPLATES`；改为一次 AI 调用生成当日完整引导对话（云蘅 + 功能 NPC + 玩家模拟），结果落流。
- 保留当日情境（天气/NPC 活动）作为 AI 上下文输入。

### FR-5: 任务简报 AI-only
- `genQuestBrief` 移除本地兜底池（scenePool/necPool/impPool/rewPool）；AI 失败时任务卡显示"灵脉未通，稍后重试"提示而非本地文案。

### FR-6: API 连接监测与重连
- 维护 `aiHealth`（ok/error/down）与最近一次错误信息。
- 每次 `dsChat` 失败时更新状态并在对话流顶部/状态栏显示明确提示。
- 提供"重连"按钮：重新执行连通性测试并恢复状态。
- 对话中 AI 调用失败时：在对话流插入一条系统提示（如"灵脉暂时中断，已自动重试…"），并自动重试 1 次；仍失败则提示玩家手动重连。

### FR-7: 延迟控制
- 对话响应显示"正在思考…"状态（NPC 头像打字指示器）。
- 任务简报/开场白/引导场景等非实时内容首次生成后缓存，后续直接读取。
- 流式响应（chat 类）保持首包优先展示，降低感知延迟。

## Non-Functional Requirements
- **NFR-1（延迟）**: 单条对话响应首包 ≤ 8s（网络正常时）；超时显示中断提示。
- **NFR-2（健壮性）**: AI 失败时不得白屏或崩溃，必须给出可操作的错误提示与重试路径。
- **NFR-3（兼容）**: 老存档加载后仍可进入，但必须通过密钥校验。
- **NFR-4（缓存）**: AI 生成内容按稳定 key 缓存，重启后可复用，减少重复调用。

## Constraints
- **Technical**: 仅使用原生 JS + 现有 wd-chat.js / index.html 架构，不引入新框架。
- **Business**: 密钥仅存浏览器 localStorage，不上传第三方。
- **Dependencies**: DeepSeek API 可用性；玩家需自备 API 密钥。

## Assumptions
- 玩家具备或愿意获取 DeepSeek API 密钥。
- "对话流"指动态对话响应（聊天、引导、任务开场/收尾、任务简报），不包含序章固定脚本与 UI 文案。
- 任务开场白/收尾/引导场景可接受首次生成的短暂等待，之后走缓存。

## Open Questions
- [ ] 任务开场白（pubLine）是否需要每条都 AI 生成，还是可用极简的通用提示？（倾向 AI 生成 + 缓存）
- [ ] 序章中的 NPC 对话是否也应改为 AI 生成？（倾向保留固定脚本，序章是演出）

## Acceptance Criteria

### AC-1: 无密钥时阻断进入
- **Type**: `rule`
- **Given**: 玩家首次进入游戏，未配置 API 密钥
- **When**: 游戏启动
- **Then**: 显示配置引导界面，无"进入序章"按钮；输入有效密钥并通过连通测试后才解锁
- **Pass Condition**: 未配置密钥时无法进入对话页；配置有效密钥后可进入
- **Evidence**: 真机截图 + 控制台 `dsReady()` 状态

### AC-2: 对话响应无本地兜底
- **Type**: `rule`
- **Given**: 玩家在对话页发送消息
- **When**: AI 正常响应
- **Then**: NPC 回复完全来自 AI；源码中 `respond` 不再调用 `fallback()`，wd-chat.js 不含本地话术池
- **Pass Condition**: `grep -n "fallback" wd-chat.js` 无 `this.fallback` 调用；话术池对象已删除
- **Evidence**: 代码检索 + 真机对话截图

### AC-3: AI 失败时显示错误与重试（非本地话术）
- **Type**: `rule`
- **Given**: AI 调用失败（网络/密钥/限流）
- **When**: 玩家发送消息
- **Then**: 对话流显示"灵脉中断"类系统提示，提供重试；不出现本地兜底话术
- **Pass Condition**: 失败响应中无 `fallback` 池中的任何预设句子
- **Evidence**: 模拟失败场景的测试输出

### AC-4: 任务开场/收尾 AI 化
- **Type**: `rule`
- **Given**: 任务解锁/完成
- **When**: 渲染对话流
- **Then**: pubLine/doneLine 来自 AI 生成并缓存；源码无本地 pool
- **Pass Condition**: `pubLine` 函数体不含硬编码字符串数组；缓存命中时不重复调用
- **Evidence**: 代码检索 + 真机任务卡截图

### AC-5: 每日引导场景 AI 化
- **Type**: `rule`
- **Given**: 进入新的一日
- **When**: 生成引导场景
- **Then**: 引导对话由 AI 生成；`GUIDANCE_TEMPLATES` 不再被引用
- **Pass Condition**: `grep GUIDANCE_TEMPLATES index.html` 仅余定义（或已删除），生成走 AI
- **Evidence**: 真机第1日引导截图（与旧模板措辞不同）

### AC-6: 任务简报 AI-only
- **Type**: `rule`
- **Given**: 打开任务卡
- **When**: 加载任务简报
- **Then**: scene/line/necessity/impact/reward 全部来自 AI；无本地兜底池
- **Pass Condition**: openQuest 中无 scenePool/necPool 等本地池；AI 失败时显示重试提示
- **Evidence**: 真机任务卡截图

### AC-7: 连接状态实时监测
- **Type**: `rule`
- **Given**: 游戏运行中
- **When**: API 连接状态变化
- **Then**: 状态栏 AI 徽标与对话流提示同步更新；提供重连入口
- **Pass Condition**: `aiHealth` 变化时 UI 即时反映；重连按钮可恢复状态
- **Evidence**: 真机状态栏截图（ok/error/down 三态）

### AC-8: 延迟与流畅性
- **Type**: `rubric`
- **Dimension**: 对话响应感知延迟
- **Scale**: 1-5
- **Anchors**: 1 = 首包 >15s 或无反馈；3 = 首包 8-15s 有思考提示；5 = 首包 <8s 且有打字指示器
- **Pass Threshold**: >= 3
- **Evidence**: 真机对话计时截图

### AC-9: 老存档兼容
- **Type**: `rule`
- **Given**: 玩家有旧存档但未配置密钥
- **When**: 加载存档
- **Then**: 进入密钥配置界面，配置后可继续原存档进度
- **Pass Condition**: 存档数据不丢失；密钥配置后可进入原进度
- **Evidence**: 加载旧存档测试

### AC-10: 无淘汰词与 AI 腔
- **Type**: `rule`
- **Given**: AI 生成对话
- **When**: 对话展示
- **Then**: 不含淘汰词（提灯/引魂灯等）、不含 AI 腔（首先/其次/总之等）
- **Pass Condition**: clauseCheck 对 AI 回复仍生效并拦截违规
- **Evidence**: 测试断言
