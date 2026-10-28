#!/usr/bin/env node
/* import-materials.mjs —— 把 G-DRIVE 备考材料（口译训练 + 问答英语）导入游戏数据层
   用法：node tools/import-materials.mjs
   产物：
     - exam-2026-data-ext.js  口译 71 段篇章 + 问答 416 题的「题目卡」（进任务单元）
     - interp-bank.js         口译「参考资产库」（术语 263 + 数字 60 + 方法 16），供 AI 出题查阅
   说明：口译材料是 AI 的"参考查阅库"，非机械背题；71 段示范必须全部学过一遍，
        其余由 AI 参照资产库每日持续出新题；问答 416 题全部接入。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "/Volumes/G-DRIVE/导游考试专项/2026备考材料";

function readJsonl(p) {
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
}
function ls(dir) { return fs.readdirSync(dir).filter(f => f.endsWith(".jsonl")); }

const SUBJ5 = "科目五 导游服务能力（现场考试）";
const INTERP_MODULE = "口译训练卡（中译外/外译中）";
const QA_MODULE = "知识问答（英语）";

/* ---------- 1. 口译篇章（04 汉译英 / 05 英译汉 / 06 情景对话 / 07 模拟套题） ---------- */
const interpCards = [];
const sceneZh = { welcome:"致欢迎词", farewell:"欢送词", sight:"景点讲解", shopping:"购物退换", emergency:"应急沟通", itinerary:"行程说明", meeting:"接团认人" };
function addInterp(item, inheritDir) {
  const dir = (item.direction === "C2E" || item.direction === "E2C") ? item.direction : inheritDir;
  const source = item.source_text || "";
  const ref = item.reference_text || "";
  /* text 用"英文在前"约定，仅用于藏经阁展示/兜底；执行流读 src/ref 字段，不受多行影响 */
  const enFirst = dir === "E2C" ? source : ref;   /* E2C：英文是源；C2E：英文是参考 */
  const zhSecond = dir === "E2C" ? ref : source;
  const title = item.title || ("口译·" + (item.section || sceneZh[item.scene] || item.scene || "篇章"));
  interpCards.push({
    id: item.id,
    title,
    subject: SUBJ5,
    module: INTERP_MODULE,
    text: (enFirst || "") + "\n【中文对照】" + (zhSecond || ""),
    direction: dir === "E2C" ? "e2c" : "c2e",
    src: source,            /* 玩家要译的原文 */
    ref,                     /* 参考译文 */
    anchor: "",
    context: "所属模块：口译；出处：2026备考材料·" + (item.chapter || ""),
    source: "2026备考材料·口译训练",
    status: "✅",
    exam_tip: item.key_points_zh || "",
    origin: "",
    version: "2026-ext",
    collected: "2026-10-17",
    star: "3",
    anchor_type: ""
  });
}
const interpDirs = [
  ["04-汉译英篇章", "C2E"],
  ["05-英译汉篇章", "E2C"],
  ["06-情景对话口译", null],   // 逐条自带 direction
  ["07-口译模拟套题", null]
];
for (const [ch, inheritDir] of interpDirs) {
  const files = ls(path.join(SRC, "02-口译训练")).filter(f => f.startsWith(ch));
  for (const f of files) for (const it of readJsonl(path.join(SRC, "02-口译训练", f))) addInterp(it, inheritDir);
}

/* ---------- 2. 问答英语（9 章 416 题，全部接入；07 模拟卷 56 条与前面重复，仅作套卷用故排除） ---------- */
const qaCards = [];
for (const f of ls(path.join(SRC, "03-问答英语")).filter(f => !f.startsWith("07-综合模拟"))) {
  for (const it of readJsonl(path.join(SRC, "03-问答英语", f))) {
    qaCards.push({
      id: it.id,
      title: "问答·" + (it.title || it.attraction || "综合"),
      subject: SUBJ5,
      module: QA_MODULE,
      text: (it.question_en || "") + "\n【中文对照】" + (it.question_zh || ""),
      qa_answer: (it.answer_en || "") + "\n【中文对照】" + (it.answer_zh || ""),
      anchor: Array.isArray(it.keywords) ? it.keywords.join("、") : "",
      context: "所属模块：问答；出处：2026备考材料·" + (it.chapter || ""),
      source: "2026备考材料·问答英语",
      status: "✅",
      exam_tip: it.checkpoint_ref || "",
      origin: "",
      version: "2026-ext",
      collected: "2026-10-17",
      star: "3",
      anchor_type: ""
    });
  }
}

/* ---------- 3. 口译参考资产库（术语/数字/方法）供 AI 查阅 ---------- */
const bank = { vocab: [], numbers: [], methods: [] };
for (const f of ls(path.join(SRC, "02-口译训练"))) {
  const full = path.join(SRC, "02-口译训练", f);
  if (f.startsWith("02-专有名词")) {
    for (const it of readJsonl(full)) bank.vocab.push({ en: it.term_en || "", zh: it.term_zh || "", cat: it.category || "", note: it.note_zh || "" });
  } else if (f.startsWith("03-数字口译")) {
    for (const it of readJsonl(full)) bank.numbers.push({ zh: it.number_zh || "", en: it.number_en_read || "", ctx: (it.context_zh || "") + " ‖ " + (it.context_en || "") });
  } else if (f.startsWith("01-口译考试")) {
    for (const it of readJsonl(full)) bank.methods.push({ t: it.title_zh || "", en: it.title_en || "", zh: it.content_zh || "" });
  }
}

/* ---------- 写盘 ---------- */
const extSrc = "/* 本文件由 tools/import-materials.mjs 自动生成：口译 71 段篇章 + 问答 416 题（题目卡） */\n"
  + "window.EXAM_2026_DATA_EXT = " + JSON.stringify(interpCards.concat(qaCards), null, 1) + ";\n";
fs.writeFileSync(path.join(ROOT, "exam-2026-data-ext.js"), extSrc);

const bankSrc = "/* 本文件由 tools/import-materials.mjs 自动生成：口译 AI 参考资产库（术语/数字/方法） */\n"
  + "window.INTERP_BANK = " + JSON.stringify(bank) + ";\n";
fs.writeFileSync(path.join(ROOT, "interp-bank.js"), bankSrc);

console.log(`口译题目卡：${interpCards.length} 段`);
console.log(`问答题目卡：${qaCards.length} 题`);
console.log(`口译参考库：术语 ${bank.vocab.length} · 数字 ${bank.numbers.length} · 方法 ${bank.methods.length}`);
console.log("已写入 exam-2026-data-ext.js 与 interp-bank.js");