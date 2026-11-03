#!/usr/bin/env node
/* 数据质检断言 qa-check.mjs —— 阶段⑥ A1/A5 落地
   检查：id 唯一 / text 非空 / markdown 残留 / blank 题答案占位与 accept 卫生 / 待核计数。
   失败项明确报出「文件 + id + 字段」，非 0 退出码；「待核」属人工待办线索，仅统计不判失败。 */
import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { window: {} };
vm.createContext(ctx);
const load = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });

const FILES = ["game-data.js", "exam-2026-data.js", "exam-2026-data-ext.js", "exam-2026-data-ext2.js"];
for (const f of FILES) { load(f); }

const fails = [];
const bad = (file, id, field, why) => { fails.push({ file, id, field, why }); };

// 1) pointsLib / oralLib / clues：id 唯一、text 非空、markdown 残留
const MD = /[*_]{2}|^#{1,6}\s|`{1,3}|^\s*[-*]\s/m;
for (const [libName, opts] of [
  ["pointsLib", { file: "game-data.js" }],
  ["oralLib", { file: "game-data.js", textKey: "en" }],
  ["clues", { file: "game-data.js" }],
]) {
  const arr = ctx.window.GAME_DATA && ctx.window.GAME_DATA[libName];
  if (!Array.isArray(arr)) continue;
  const seen = new Set();
  for (const it of arr) {
    if (!it || !it.id) { bad(opts.file, "(缺 id)", libName, "条目缺 id"); continue; }
    if (seen.has(it.id)) bad(opts.file, it.id, libName, "id 重复");
    seen.add(it.id);
    const t = String(it[opts.textKey || "text"] || "");
    if (!t.trim()) bad(opts.file, it.id, opts.textKey || "text", "正文为空");
    else if (MD.test(t)) bad(opts.file, it.id, opts.textKey || "text", "正文残留 markdown 标记");
  }
}

// 2) EXAM_2026_DATA（同 pointsLib 另一副本）
const E = ctx.window.EXAM_2026_DATA || [];
{
  const seen = new Set();
  for (const it of E) {
    if (!it || !it.id) { bad("exam-2026-data.js", "(缺 id)", "EXAM_2026_DATA", "条目缺 id"); continue; }
    if (seen.has(it.id)) bad("exam-2026-data.js", it.id, "EXAM_2026_DATA", "id 重复");
    seen.add(it.id);
    if (!String(it.text || "").trim()) bad("exam-2026-data.js", it.id, "text", "正文为空");
    else if (MD.test(String(it.text))) bad("exam-2026-data.js", it.id, "text", "正文残留 markdown 标记");
  }
}

// 3) quizzes：blank 题 a 非空、a 不含「待核」、accept 无空/无重复
const Q = ctx.window.GAME_DATA && ctx.window.GAME_DATA.quizzes;
if (Q && typeof Q === "object") {
  for (const key of Object.keys(Q)) {
    const arr = Q[key];
    if (!Array.isArray(arr)) continue;
    for (const z of arr) {
      if (!z || z.kind !== "blank") continue;
      const a = String(z.a == null ? "" : z.a).trim();
      if (!a) bad("game-data.js", key + "/" + (z.pid || "?"), "a", "blank 答案为空");
      else if (a.includes("待核")) bad("game-data.js", key + "/" + (z.pid || "?"), "a", "blank 答案为「待核」占位");
      if (Array.isArray(z.accept)) {
        const uniq = new Set(z.accept.map(String).filter(x => x.trim()));
        if (uniq.size !== z.accept.length) bad("game-data.js", key + "/" + (z.pid || "?"), "accept", "accept 有重复/空串");
      }
    }
  }
}

// 4) 「待核」分布统计（人工待办线索，不判失败）
const fileHits = {};
for (const f of ["game-data.js", "exam-2026-data.js", "csv/02_考点.csv", "planning/exam-2026.json"]) {
  try { const s = fs.readFileSync(path.join(ROOT, f), "utf8"); fileHits[f] = (s.match(/待核/g) || []).length; } catch (e) {}
}

console.log("=== 数据质检 qa-check ===");
console.log("markdown 残留判定用正则:", MD.toString());
if (fails.length === 0) {
  console.log("断言结果: 0 失败");
} else {
  console.log("断言结果: " + fails.length + " 项失败");
  for (const x of fails) console.log(`  FAIL [${x.file}] ${x.id} · ${x.field}: ${x.why}`);
}
console.log("「待核」人工待办分布:", JSON.stringify(fileHits));
process.exit(fails.length === 0 ? 0 : 1);