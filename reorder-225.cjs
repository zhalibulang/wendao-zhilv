#!/usr/bin/env node
/* ============================================================
   任务时间系统重排 v53：45 自然日 → 225 游戏日 + 784 卡完整分配
   ------------------------------------------------------------
   输入：game-data.js（现有 274 quest，内容正确）+ exam-2026-data.js（586 考点）
   输出：game-data.js（覆盖写）——
     1. 每个 quest 新增 gd（游戏日编号 1-225）字段
     2. D.days 每个自然日新增 gameDays[5]（前3学习日/后2休息日）
     3. 补全 292 个缺口考点为正式 study 任务（不是补漏页，是完整重排）
   口径：
     - 游戏日 gd = (naturalDay-1)*5 + 组内偏移，范围 1-225
     - 每自然日(周) = 5 游戏日 = 3 学习日(gd偏移1/2/3) + 2 休息日(4/5)
     - 30 自然日学完第一遍（90 学习日），45 自然日达标（135 学习日）
   ============================================================ */

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const src = fs.readFileSync(path.join(DIR, 'game-data.js'), 'utf8');
const examSrc = fs.readFileSync(path.join(DIR, 'exam-2026-data.js'), 'utf8');

// 读取 window.GAME_DATA
const w = {};
new Function('window', src.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))(w);
const D = w.GAME_DATA;

// 读取 586 考点
const ew = {};
new Function('window', examSrc)(ew);
const EXAM = ew.EXAM_2026_DATA.filter(p => p && p.id);

/* ---------- 0. 清理外部任务残留——删除所有 type==='drill' 的 quest ----------
   "百题斩/历史章15题"等 drill 来自旧 schedule-45d.md，是外部刷题工具引用，早该删除。
   出题由 study 任务的试炼阶段（fallbackQuiz/genQuestion 本地算法 + genQuiz AI）完成。 */
(function dropDrill(){
  const dropIds = new Set(D.quests.filter(q => q.type === 'drill').map(q => q.id));
  if (dropIds.size) {
    D.quests = D.quests.filter(q => !dropIds.has(q.id));
    dropIds.forEach(id => { delete D.lectures[id]; delete D.quizzes[id]; });
    /* 清理 prev 链中指向已删 drill 任务的引用 */
    D.quests.forEach(q => { if (q.prev) q.prev = q.prev.filter(pid => !dropIds.has(pid)); });
    console.log('已删除 drill 任务:', dropIds.size, '个');
  }
})();

/* ---------- 1. 收集现有 lecture 已覆盖考点 ---------- */
const covered = new Set();
D.quests.forEach(q => {
  (D.lectures[q.id] || []).forEach(p => (p.items || []).forEach(it => { if (it && it.id) covered.add(it.id); }));
});
const missing = EXAM.filter(p => !covered.has(p.id));
const MISSING_MAP = Object.fromEntries(EXAM.map(p => [p.id, p]));

console.log('现有 quest:', D.quests.length, '| 已覆盖考点:', covered.size, '| 缺口:', missing.length);

/* ---------- 2. 给每个自然日确定 NPC（用于补学任务的归属） ---------- */
const dayNpc = {};
D.days.forEach(d => { dayNpc[d.day] = d.npc || 'qingxuan'; });
// act 阶段映射（沿用现有 act 字段）
const dayAct = {};
D.days.forEach(d => { dayAct[d.day] = d.act || 'act1'; });

/* ---------- 3. 计算每个自然日的现有 quest（按 id 稳定排序） ---------- */
const questsByDay = {};
D.quests.forEach(q => { (questsByDay[q.day] = questsByDay[q.day] || []).push(q); });
Object.values(questsByDay).forEach(arr => arr.sort((a, b) => a.id.localeCompare(b.id)));

/* ---------- 4. 分配 gd：现有 quest 摊到 3 个学习日 ---------- */
/* 规则：该自然日的 quest 按类别聚合后按序轮转分配到学习日 1/2/3。
   gear 固定学习日1；study/复习 交替；oral 固定学习日3（睡前口试保温，对应 schedule 每日最后一块）。
   其余类型按顺序填满 3 个学习日。 */
const LEARN_OFFSETS = [1, 2, 3];
D.quests.forEach(q => {
  const day = q.day;
  const arr = questsByDay[day];
  const idx = arr.indexOf(q);
  const total = arr.length;
  // 简单轮转：前 1/3 学习日1，中 1/3 学习日2，后 1/3 学习日3
  let offset;
  if (total <= 3) offset = LEARN_OFFSETS[Math.min(idx, 2)];
  else offset = LEARN_OFFSETS[Math.floor(idx / Math.ceil(total / 3)) % 3];
  // oral 任务优先放学习日3（睡前口试）
  if (q.type === 'oral') offset = 3;
  if (q.type === 'gear') offset = 1;
  q.gd = (day - 1) * 5 + offset;
  q.gdKind = 'study';
});

/* ---------- 5. 生成补学任务：292 缺口考点 → study 型 quest ---------- */
/* 分组策略：按前缀（科目）排序，每组 6-8 个考点为一个任务，
   分配到各自然日的学习日空位，30 自然日内学完第一遍。 */
function makeLecturePages(items) {
  const pages = [{ title: '行者手记', lines: [{ t: 'p', x: '此页补录：此前散落在雾里、未及排入行程的考点。' }, { t: 'n', x: '读出声，它们就会回到该在的位置。' }] }];
  let chunk = [], pageNo = 2;
  items.forEach(it => {
    chunk.push({ id: it.id, text: it.text || '', star: it.star || '3' });
    if (chunk.length === 4) { pages.push({ title: '书页 · ' + pageNo, items: chunk }); chunk = []; pageNo++; }
  });
  if (chunk.length) pages.push({ title: '书页 · ' + pageNo, items: chunk });
  return pages;
}

// 按前缀排序缺口考点（同科相邻）
const sortedMissing = [...missing].sort((a, b) => {
  const pa = a.id.split('-')[0], pb = b.id.split('-')[0];
  if (pa !== pb) return pa.localeCompare(pb);
  return a.id.localeCompare(b.id);
});

// 分组：每组 7 个考点一个任务
const CHUNK = 7;
const supQuests = [];
const supLectures = {};
for (let i = 0; i < sortedMissing.length; i += CHUNK) {
  const grp = sortedMissing.slice(i, i + CHUNK);
  // 分配到目标自然日：均匀分布到 1..45（学习日优先 1..30 学完第一遍）
  const targetDay = Math.min(45, Math.floor(i / CHUNK * 1.0) + 1);
  const gdOff = (i / CHUNK) % 3 | 0;
  const gd = (targetDay - 1) * 5 + LEARN_OFFSETS[gdOff];
  const qid = 'SUP' + String(i / CHUNK + 1).padStart(3, '0');
  const pref = grp.map(g => g.id.split('-')[0])[0];
  const tlabelMap = { CITY: '城市概况', CUL: '文化民俗', GUG: '故宫讲解', TAM: '天安门讲解', TAN: '天坛讲解', SUM: '颐和园讲解', WAL: '长城讲解', TOM: '明十三陵讲解', QA: '现场问答', INT: '口译', LAW: '法规', SER: '服务规范', S2: '导游业务', S3: '基础知识', S4: '地方知识', S5: '现场考试', TS: '综合', FAR: '口译', WEL: '开场词' };
  const label = tlabelMap[pref] || '补学';
  const q = {
    id: qid, kind: 'side', chain: 'side', type: 'study', tlabel: '修习·' + label,
    npc: dayNpc[targetDay], day: targetDay, act: dayAct[targetDay], gd, gdKind: 'study',
    dur: Math.max(15, Math.min(40, grp.length * 5)),
    goal: label + '补录（' + grp.length + ' 条）',
    name: '修习 · 补录 ' + label + '（' + grp.length + ' 条）',
    prev: [], minLv: 1, xp: grp.length * 5, coin: grp.length * 2,
    lecture: makeLecturePages(grp), quiz: [],
    desc: { bg: '雾里散落的考点，如今捡回。', goals: grp.map(g => g.id).slice(0, 6), steps: ['开卷读一遍', '合书复述要点', '完成试炼题'], accept: '读完并复述 ≥ 3 个要点', heavy: grp.length >= 8 },
    rarity: 'fine',
  };
  q.wow = '';
  supQuests.push(q);
  supLectures[qid] = makeLecturePages(grp);
}
console.log('补学任务数:', supQuests.length, '| 覆盖缺口考点:', supQuests.reduce((s, q) => s + supLectures[q.id].reduce((a, p) => a + (p.items || []).length, 0), 0));

/* ---------- 6. prev 链补学任务：挂到同自然日最后一个主线 quest（随主线同步解锁） ---------- */
supQuests.forEach(q => {
  const mains = D.quests.filter(x => x.day === q.day && (x.kind === 'main' || x.chain === 'main'));
  if (mains.length) q.prev = [mains[mains.length - 1].id];
});

/* ---------- 7. 合并 quests + lectures + quizzes ---------- */
const allQuests = D.quests.concat(supQuests);
D.quests = allQuests;
supQuests.forEach(q => { D.lectures[q.id] = supLectures[q.id]; D.quizzes[q.id] = []; });

/* ---------- 7.5 把 pointsLib 替换为 586 考点库（与 index.html v49 注入口径一致） ---------- */
const stripMd = s => String(s == null ? '' : s).replace(/\*{1,3}/g, '').replace(/`+/g, '').replace(/^#{1,6}\s*/gm, '').replace(/[ \t]+/g, ' ').trim();
D.pointsLib = EXAM.map(d => ({
  id: d.id, title: stripMd(d.title || ''), subject: d.subject || '', module: stripMd(d.module || ''),
  text: stripMd(d.text || ''), anchor: stripMd(d.anchor || ''), context: stripMd(d.context || ''),
  source: d.source || '', status: d.status || '✅',
  exam_tip: stripMd(d.exam_tip || ''), origin: d.origin || '',
  version: d.version || '2026-r3', collected: d.collected || '',
  star: d.star || '3', anchor_type: d.anchor_type || (d.anchor ? 'manual' : ''),
}));

/* ---------- 8. rebuild days.gameDays ---------- */
D.days.forEach(d => {
  const dayQuests = D.quests.filter(q => q.day === d.day);
  const gameDays = [];
  for (let off = 1; off <= 5; off++) {
    const gd = (d.day - 1) * 5 + off;
    const kind = off <= 3 ? 'study' : 'rest';
    const gdQuests = dayQuests.filter(q => q.gd === gd);
    gameDays.push({ gd, kind, quests: gdQuests.map(q => q.id) });
  }
  d.gameDays = gameDays;
  d.quests = dayQuests.map(q => q.id);  // 平铺本日所有 quest id（兼容）
});

// 校验
const gdCount = new Set(allQuests.map(q => q.gd)).size;
const totalCov = new Set();
D.quests.forEach(q => { (D.lectures[q.id] || []).forEach(p => (p.items || []).forEach(it => { if (it && it.id) totalCov.add(it.id); })); });
console.log('总 quest:', D.quests.length, '| 唯一 gd:', gdCount, '| 覆盖考点:', totalCov.size, '/', EXAM.length);

const out = '/* 问道之旅 · 任务时间重排 v53（225 游戏日 · 784 卡完整分配）*/\nwindow.GAME_DATA = ' + JSON.stringify(D, null, 0) + ';\n';
fs.writeFileSync(path.join(DIR, 'game-data.js'), out, 'utf8');
console.log('game-data.js 已重写:', Math.round(out.length / 1024), 'KB');