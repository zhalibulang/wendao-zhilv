#!/usr/bin/env node
/* csv-export.mjs —— 把项目里的文本材料导出成可手动编辑的 CSV 数据库
   用法：node tools/csv-export.mjs
   产出：csv/*.csv（UTF-8 带 BOM，Excel/Numbers 直接双击可开）

   设计约定：
   1) 「空单元格 = 不改」——导入时留空的格子会被忽略，所以可以只填你要改的部分；
   2) 导游词保留完整结构：篇 → 节 → 段（小标题/中文小注）→ 句；
      未定稿的 5 篇也照样铺好「篇/节/段/句」骨架，正文格子留空，你后续直接往里填；
   3) 故宫篇按「一句一行」导出，方便逐句润色；其余篇按「一节一行」导出（整节正文在一格）。 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "csv");
fs.mkdirSync(OUT, { recursive: true });

/* ---------- 载入项目数据 ---------- */
const ctx = { window: {}, console };
ctx.global = ctx;
vm.createContext(ctx);
["game-data.js", "oral-full-gug.js", "interp-bank.js", "task-units.js", "task-units-oral.js"].forEach(f => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) return;
  try { vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f }); }
  catch (e) { console.warn("[skip]", f, e.message); }
});
const W = ctx.window;
const D = W.GAME_DATA || {};
const BANK = W.INTERP_BANK || { vocab: [], numbers: [], methods: [] };
const UNITS = (W.TASK_UNITS25 || []).concat(W.TASK_UNITS25_EXT || []);

/* ---------- 分句（与运行时 _oralSplitSent 一致） ---------- */
const splitEnd = ch => ch === "." || ch === "!" || ch === "?" || ch === "。" || ch === "！" || ch === "？";
const isCloser = ch => "\"'”’)」』）】".includes(ch);
function splitSentences(s) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const out = []; let cur = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]; cur += ch;
    if (!splitEnd(ch)) continue;
    if (ch === "." && /\d/.test(t[i - 1] || "") && /\d/.test(t[i + 1] || "")) continue;
    let j = i + 1;
    while (j < t.length && isCloser(t[j])) { cur += t[j]; j++; }
    const nx = t[j] || "";
    if (j >= t.length || nx === " " || /[\u4e00-\u9fffA-Z0-9“"‘'(]/.test(nx)) { out.push(cur.trim()); cur = ""; i = j - 1; }
  }
  if (cur.trim()) out.push(cur.trim());
  const wc = x => (x.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g) || []).length;
  const cc = x => (x.match(/[\u4e00-\u9fff]/g) || []).length;
  const merged = [];
  for (let k = 0; k < out.length; k++) {
    const x = out[k];
    const short = /[\u4e00-\u9fff]/.test(x) ? cc(x) < 6 : wc(x) < 5;
    if (short && k + 1 < out.length) { out[k + 1] = x + " " + out[k + 1]; continue; }
    merged.push(x);
  }
  return merged;
}
const words = s => (String(s || "").match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g) || []).length;

/* ---------- CSV 写盘 ---------- */
const cell = v => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function writeCsv(name, header, rows) {
  const body = [header.map(cell).join(",")].concat(rows.map(r => r.map(cell).join(","))).join("\r\n");
  fs.writeFileSync(path.join(OUT, name), "\uFEFF" + body + "\r\n", "utf8");
  console.log(name, "·", rows.length, "行");
}

/* ---------- 01 导游词（篇 → 节 → 段 → 句） ---------- */
{
  const header = ["篇ID", "篇中文名", "篇英文标题", "定稿状态", "节号", "节标题", "段号", "段小标题", "中文小注", "句号", "英文原文", "中文参考译文", "备注"];
  const rows = [];
  (D.oralFull || []).forEach(o => {
    const finalized = o.id === "forbidden-city";
    (o.sections || []).forEach((sec, si) => {
      const paras = Array.isArray(sec.paragraphs) && sec.paragraphs.length
        ? sec.paragraphs.map((p, i) => ({ n: i + 1, text: p.text || "", head: p.head || "", note: p.note || "" }))
        : [{ n: 1, text: sec.text || "", head: "", note: "" }];
      paras.forEach((p, pi) => {
        const sents = splitSentences(p.text);
        const list = sents.length ? sents : [""];
        list.forEach((st, k) => {
          rows.push([o.id, o.name || "", o.title || "", finalized ? "已定稿" : "待定稿",
            si + 1, sec.h || "", pi + 1, p.head, p.note, k + 1, st, "", ""]);
        });
      });
    });
  });
  writeCsv("01_导游词.csv", header, rows);
}

/* ---------- 02 考点（笔试 + 科目五问答） ---------- */
{
  const header = ["考点ID", "标题", "科目", "模块", "正文（中英混排，保留原格式）", "锚点", "备考提示", "星级", "状态", "来源"];
  const rows = (D.pointsLib || []).map(p => [
    p.id || "", p.title || "", p.subject || "", p.module || "", p.text || "",
    p.anchor || "", p.exam_tip || "", p.star || "", p.status || "", p.source || ""
  ]);
  writeCsv("02_考点.csv", header, rows);
}

/* ---------- 03 口译句对（示例库） ---------- */
{
  const header = ["ID", "主题", "英文", "中文", "备注"];
  const rows = (D.oralLib || []).map(x => [x.id || "", x.topic || "", x.en || "", x.zh || "", ""]);
  writeCsv("03_口译句对.csv", header, rows);
}

/* ---------- 04 口译资产库（术语 / 数字 / 评分方法） ---------- */
{
  const header = ["类别", "英文", "中文", "分类或备注", "出处"];
  const rows = [];
  (BANK.vocab || []).forEach(v => rows.push(["vocab", v.en || "", v.zh || "", (v.cat || "") + (v.note ? " · " + v.note : ""), ""]));
  (BANK.numbers || []).forEach(v => rows.push(["numbers", v.en || "", v.zh || "", v.ctx || "", ""]));
  (BANK.methods || []).forEach(v => rows.push(["methods", v.en || "", v.zh || "", v.t || "", ""]));
  writeCsv("04_口译资产库.csv", header, rows);
}

/* ---------- 05 任务单元（只读参考：排期骨架） ---------- */
{
  const header = ["单元号", "科目", "模块", "条目数", "时长分钟", "条目ID"];
  const rows = UNITS.map(u => [u.n, u.subj || "", (u.mods || []).join("/"), (u.items || []).length,
    Math.round((u.items || []).reduce((a, it) => a + (+it.mins || 0), 0)),
    (u.items || []).map(it => it.id).join(" ")]);
  writeCsv("05_任务单元.csv", header, rows);
}

console.log("导出完成 →", OUT);
