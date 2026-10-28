#!/usr/bin/env node
/* pack-units.mjs —— 任务单元重打包脚本（v25）
   用法：node tools/pack-units.mjs
   输入：exam-2026-data.js + exam-2026-data-ext.js（自动合并）
   输出：planning/task-units.json（供任务引擎直接加载）
   规则（planning/PLAN.md）：
   - 时长模型按环节累加，不估堆
   - 不拆条：完整主题单元（module）为最小整体，仅超时 2 倍的大模块按条目顺序切分
   - 单单元目标 25 分钟，允许 17~36 分钟区间
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const loadData = f => {
  const src = read(f);
  const m = src.match(/window\.EXAM_2026_DATA(?:_EXT)?\s*=\s*/);
  return eval(src.slice(m.index + m[0].length).replace(/;\s*$/, ""));
};
const MAIN = loadData("exam-2026-data.js");
const EXT = fs.existsSync(path.join(ROOT, "exam-2026-data-ext.js"))
  ? loadData("exam-2026-data-ext.js") : [];
const ALL = MAIN.concat(EXT);
console.log(`主库 ${MAIN.length} 条 + 补充 ${EXT.length} 条 = 合计 ${ALL.length} 条`);

/* ---------- 时长模型 ---------- */
const zhChars = s => (String(s || "").match(/[一-鿿]/g) || []).length;
const enWords = s => (String(s || "").match(/[A-Za-z]+/g) || []).length;
const isS5 = x => /科目五/.test(x.subject || "");
/* 英文正文 = 去掉【中文对照】后的英文段落（多行全文也整段计入，避免只数首行导致长文时长被低估） */
const enBody = x => String(x.text || "").split(/\n?【中文对照】/)[0];
const hasEn = x => enWords(enBody(x)) >= 4;

function itemMinutes(x) {
  if (!isS5(x)) {                       // 笔试：默读300字/分 + 作答40s + 对答案20s
    return zhChars((x.text || "") + (x.context || "")) / 300 + 1.0;
  }
  if (/口译/.test(x.module || ""))      // 口译：读原文 + 实操240s + 对照60s（英文整段计入）
    return enWords(enBody(x)) / 100 + 5.0;
  if (/问答/.test(x.module || ""))      // 问答卡：读题+读答案 + 口述90s + 对照30s（答案英文也计入）
    return enWords(x.text || "") / 100 + enWords(x.qa_answer || "") / 100 + 2.0;
  if (hasEn(x))                         // 英文闪卡：朗读100词/分 + 跟读60s + 复述90s + 自评30s（英文整段计入）
    return enWords(enBody(x)) / 100 + 3.0;
  return zhChars(x.text || "") / 300 + 2.0;  // 中文讲解：默读 + 复述120s
}

/* ---------- 打包 ----------
   条目级顺序装箱（同科目内按模块出现顺序、模块内按条目顺序，绝不重排、绝不拆条）。
   单元时长目标 25 分钟，允许 17~36；科目末尾的尾差通过与前一单元均衡消除。 */
const MIN_UNIT = 17, MAX_UNIT = 36, SOFT_MAX = 30; /* 软上限：超过即封箱，逼近 25 分钟目标 */
const groups = new Map();  // key = subject|module（保持首次出现顺序）
for (const x of ALL) {
  const k = (x.subject || "?") + "|" + (x.module || "?");
  if (!groups.has(k)) groups.set(k, { subj: x.subject || "?", module: x.module || "?", items: [] });
  groups.get(k).items.push(x);
}
/* 科目 → 模块序列（保持顺序） */
const bySubj = new Map();
for (const g of groups.values()) {
  if (!bySubj.has(g.subj)) bySubj.set(g.subj, []);
  bySubj.get(g.subj).push(g);
}
const units = [];
for (const [subj, mods] of bySubj) {
  /* 拍平为该科目的有序条目流，每条记录所属模块 */
  const stream = [];
  for (const g of mods)
    for (const x of g.items)
      stream.push({ id: x.id, title: x.title || "", mod: g.module, tour: /景点讲解/.test(g.module || ""), mins: Math.round(itemMinutes(x) * 100) / 100 });
  /* 导游词模块（景点讲解·X）剩余时长：从当前条目到该模块末尾，并标记起止条目。
     用于「同一景点的导游词不跨单元切断」——装入前若会超软上限，先封箱，让整段从新单元起头。 */
  for (let i = stream.length - 1; i >= 0; i--) {
    const nx = stream[i + 1], pv = stream[i - 1];
    const sameNext = nx && nx.tour && nx.mod === stream[i].mod;
    stream[i].tourRem = stream[i].tour ? ((sameNext ? nx.tourRem : 0) + stream[i].mins) : 0;
    stream[i].tourStart = stream[i].tour && !(pv && pv.tour && pv.mod === stream[i].mod);
    stream[i].tourEnd = stream[i].tour && !sameNext;
  }
  const fresh = () => ({ subj, s5: /科目五/.test(subj), mods: [], items: [], _m: 0, _lock: 0 });
  const subUnits = [];
  let cur = fresh();
  for (const it of stream) {
    /* 导游词模块（景点讲解·X）一律从新单元起头：不与其前模块混装，
       保证同一景点导游词的头一条立在单元开头、顺序连续（根治「从 02/05 起」）。
       整段≤MAX_UNIT 再锁住不切断；超长段（>MAX_UNIT）按软上限连续切分，首条仍在单元头。 */
    if (it.tourStart && cur.items.length) { subUnits.push(cur); cur = fresh(); }
    if (cur.items.length && cur._m >= MIN_UNIT && cur._m + it.mins > SOFT_MAX && !cur._lock) { subUnits.push(cur); cur = fresh(); }
    if (!cur.mods.includes(it.mod)) cur.mods.push(it.mod);
    cur.items.push({ id: it.id, title: it.title, mins: it.mins });
    cur._m += it.mins;
    if (it.tourStart && it.tourRem <= MAX_UNIT) cur._lock = 1; /* 整段装得下 → 锁住，中途不被软上限切开 */
    if (it.tourEnd) cur._lock = 0;
  }
  if (cur.items.length) subUnits.push(cur);
  /* 尾单元过小 → 从前面单元尾部顺移条目过来均衡（保持顺序与完整）；导游词整段不拆，遇之即停 */
  while (subUnits.length > 1) {
    const last = subUnits[subUnits.length - 1];
    if (last._m >= MIN_UNIT) break;
    const prev = subUnits[subUnits.length - 2];
    const mv = prev.items[prev.items.length - 1];
    /* 该条目属导游词模块、前单元仍留有同景点其余条目 → 顺移会切断导游词，停止 */
    if (/景点讲解/.test(mv.mod || "") && prev.items.slice(0, -1).some(x => x.mod === mv.mod)) break;
    prev.items.pop();
    last.items.unshift(mv);
    prev._m -= mv.mins; last._m += mv.mins;
    if (!last.mods.includes(mv.mod)) last.mods.unshift(mv.mod);
    /* 前单元被掏空则移除 */
    if (!prev.items.length) subUnits.splice(subUnits.length - 2, 1);
    else if (prev._m < MIN_UNIT && subUnits.length > 2) break; /* 再掏会连锁过小，停 */
  }
  for (const u of subUnits) {
    delete u._m; delete u._lock;
    u.mins = Math.round(u.items.reduce((a, b) => a + b.mins, 0)); /* 取整数：面板/卡片显示统一为 29/30 分 */
    /* 同一模块被切到多个单元时标注 (1)(2) */
    const modCount = {};
    subUnits.forEach(v => v.mods.forEach(m => { modCount[m] = (modCount[m] || 0) + 1; }));
    u.mods = u.mods.map(m => modCount[m] > 1 ? m : m); /* 标注在导出后处理，保持原名 */
    units.push(u);
  }
}
units.forEach((u, i) => { u.n = i + 1; });
const total = Math.round(units.reduce((a, u) => a + u.mins, 0));
const out = path.join(ROOT, "planning", "task-units.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(units, null, 1));
/* 同步产出运行时直连版本（免 fetch，file:// 也能跑） */
fs.writeFileSync(path.join(ROOT, "task-units.js"),
  "/* 本文件由 tools/pack-units.mjs 自动生成，请勿手改；补充材料后重跑该脚本即可 */\n" +
  "window.TASK_UNITS25=" + JSON.stringify(units) + ";\n");
console.log("已同步生成 task-units.js（运行时直连版）");
console.log(`打包完成：${units.length} 个单元，总时长 ${total} 分钟，平均 ${(total / units.length).toFixed(1)} 分钟/单元`);
const bad = units.filter(u => u.mins < MIN_UNIT - 1 || u.mins > MAX_UNIT + 1);
if (bad.length) console.log("区间外单元：", bad.map(u => `#${u.n}(${u.mins}min)`).join(" "));
