#!/usr/bin/env node
/* csv-import.mjs —— 读回手动改过的 csv/*.csv，生成 csv-overrides.js
   用法：node tools/csv-import.mjs

   规则：
   1) 空单元格 = 保持项目原样（所以你可以只填要改的行/列）；
   2) 导游词按「篇ID + 节号 + 段号」分组，组内句子用空格拼回整段；
      · 段小标题 / 中文小注 也能改（空 = 不改）；
      · 想删掉某段：把该段的行整段删除（同节其余行保留），导入即删段；
      · 想加段：在节内插入新行，段号用原表里没有的新号；
      · 注意：整节一行都不剩视为「没动过这节」，不会删整节；
   3) 02/03 按 ID 覆盖；04 因为是一份完整词表，整表替换（删行即删词条）。 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "csv");

/* ---------- 载入项目原文，只导出「真正改过的格子」 ---------- */
const ctx = { window: {}, console };
ctx.global = ctx;
vm.createContext(ctx);
["game-data.js", "oral-full-gug.js", "interp-bank.js"].forEach(f => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) return;
  try { vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: f }); }
  catch (e) { console.warn("[skip]", f, e.message); }
});
const D0 = ctx.window.GAME_DATA || {};
const BANK0 = ctx.window.INTERP_BANK || { vocab: [], numbers: [], methods: [] };

const norm = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
/* CSV 里只有纯文本，原文可能带富文本标签（加粗/字色/图）——比较前先剥标签，
   否则"一个字没改"也会被判成不同，整节覆盖会把样式全部拍平 */
const stripHtml = s => String(s == null ? "" : s)
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const normText = s => norm(stripHtml(s));
const origOral = new Map();   /* "篇|节" → [{text,raw,head,note}]（原文整节段落表） */
(D0.oralFull || []).forEach(o => (o.sections || []).forEach((sec, si) => {
  const paras = Array.isArray(sec.paragraphs) && sec.paragraphs.length ? sec.paragraphs : [{ text: sec.text || "" }];
  origOral.set(o.id + "|" + si, paras.map(p => ({
    text: normText(p.text),               /* 纯文本，用来和 CSV 比对 */
    raw: String(p.text == null ? "" : p.text),  /* 原文，未改时整段保留 */
    head: String(p.head || "").trim(), note: String(p.note || "").trim()
  })));
}));
const origPt = new Map((D0.pointsLib || []).map(p => [p.id, p]));
const origOl = new Map((D0.oralLib || []).map(x => [x.id, x]));
const bankSig = b => JSON.stringify({
  vocab: (b.vocab || []).map(v => ({ en: v.en || "", zh: v.zh || "", cat: v.cat || "", note: v.note || "" })),
  numbers: (b.numbers || []).map(v => ({ en: v.en || "", zh: v.zh || "", ctx: v.ctx || "" })),
  methods: (b.methods || []).map(v => ({ en: v.en || "", zh: v.zh || "", t: v.t || "" }))
});

/* 简易 CSV 解析（支持引号包裹、转义引号、单元格内换行） */
function parseCsv(text) {
  const s = String(text).replace(/^\uFEFF/, "");
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ""));
}
function readCsv(name) {
  const p = path.join(DIR, name);
  if (!fs.existsSync(p)) return null;
  const rows = parseCsv(fs.readFileSync(p, "utf8"));
  const head = rows.shift() || [];
  return rows.map(r => { const o = {}; head.forEach((h, i) => o[h] = r[i] == null ? "" : r[i]); return o; });
}

const ov = { oral: {}, points: {}, oralLib: {}, bank: null, stats: {} };

/* ---------- 01 导游词（整节覆盖：支持改文 / 改小标题小注 / 删段 / 加段） ---------- */
const oralRows = readCsv("01_导游词.csv");
if (oralRows) {
  const secs = new Map();  /* "篇|节-1" → Map(段号 → {texts[],head,note}) */
  oralRows.forEach(r => {
    const art = (r["篇ID"] || "").trim();
    if (!art) return;
    const sec = +(r["节号"] || 0), para = +(r["段号"] || 0);
    if (!sec || !para) return;
    const key = art + "|" + (sec - 1);
    if (!secs.has(key)) secs.set(key, new Map());
    const m = secs.get(key);
    if (!m.has(para)) m.set(para, { texts: [], head: String(r["段小标题"] || "").trim(), note: String(r["中文小注"] || "").trim() });
    const txt = String(r["英文原文"] || "").trim();
    if (txt) m.get(para).texts.push(txt);
  });
  ov.oralSec = {};
  secs.forEach((m, key) => {
    const orig = origOral.get(key) || [];
    /* 按段号排序拼出 CSV 版整节：空正文格子回落原文（空=不改）；原文有而 CSV 没的段号 = 已删除 */
    const pis = [...m.keys()].sort((a, b) => a - b);
    const list = pis.map(pi => {
      const c = m.get(pi);
      const o = orig[pi - 1] || { text: "", raw: "", head: "", note: "" };
      const csv = c.texts.length ? norm(c.texts.join(" ")) : "";
      /* 空格子=不改；内容与原文纯文本一致=保留原文（富文本标签不丢）；真改了正文才用 CSV 纯文本 */
      const text = (!csv || normText(csv) === o.text) ? o.raw : csv;
      return { text, head: c.head || o.head, note: c.note || o.note };
    }).filter(p => p.text || p.head || p.note);
    const same = list.length === orig.length
      && list.every((p, i) => normText(p.text) === orig[i].text && p.head === orig[i].head && p.note === orig[i].note);
    if (!same) ov.oralSec[key] = list;
  });
  ov.stats.oral = Object.keys(ov.oralSec).length;
}

/* ---------- 02 考点 ---------- */
const ptRows = readCsv("02_考点.csv");
if (ptRows) {
  ptRows.forEach(r => {
    const id = (r["考点ID"] || "").trim(); if (!id) return;
    const raw = {
      title: r["标题"] || "", module: r["模块"] || "",
      text: r["正文（中英混排，保留原格式）"] || "",
      anchor: r["锚点"] || "", exam_tip: r["备考提示"] || "", star: r["星级"] || ""
    };
    const o = origPt.get(id) || {}, t = {};
    Object.keys(raw).forEach(k => {
      const v = String(raw[k]).trim(); if (!v) return;
      if (norm(v) === norm(o[k])) return;            /* 没改就不写 */
      t[k] = raw[k];
    });
    if (Object.keys(t).length) ov.points[id] = t;
  });
  ov.stats.points = Object.keys(ov.points).length;
}

/* ---------- 03 口译句对 ---------- */
const olRows = readCsv("03_口译句对.csv");
if (olRows) {
  olRows.forEach(r => {
    const id = (r["ID"] || "").trim(); if (!id) return;
    const o = origOl.get(id) || {};
    const raw = { topic: r["主题"] || "", en: r["英文"] || "", zh: r["中文"] || "" }, t = {};
    Object.keys(raw).forEach(k => {
      const v = String(raw[k]).trim(); if (!v) return;
      if (norm(v) === norm(o[k])) return;
      t[k] = raw[k];
    });
    if (Object.keys(t).length) ov.oralLib[id] = t;
  });
  ov.stats.oralLib = Object.keys(ov.oralLib).length;
}

/* ---------- 04 口译资产库（整表替换） ---------- */
const bkRows = readCsv("04_口译资产库.csv");
if (bkRows) {
  const vocab = [], numbers = [], methods = [];
  bkRows.forEach(r => {
    const cat = (r["类别"] || "").trim();
    const en = String(r["英文"] || "").trim(), zh = String(r["中文"] || "").trim();
    const note = String(r["分类或备注"] || "").trim();
    if (cat === "vocab" && (en || zh)) {
      const m = note.match(/^(.*?)(?:\s·\s(.*))?$/);
      vocab.push({ en, zh, cat: (m && m[1]) || "", note: (m && m[2]) || "" });
    } else if (cat === "numbers" && (en || zh)) numbers.push({ en, zh, ctx: note });
    else if (cat === "methods" && (en || zh)) methods.push({ en, zh, t: note });
  });
  if ((vocab.length || numbers.length || methods.length)) {
    const nb = { vocab, numbers, methods };
    if (bankSig(nb) !== bankSig(BANK0)) {   /* 与内置词表一致就不覆盖 */
      ov.bank = nb;
      ov.stats.bank = vocab.length + numbers.length + methods.length;
    } else ov.stats.bank = 0;
  }
}

/* ---------- 写出运行时覆盖文件 ---------- */
/* stamp = CSV 源文件的最后修改时间（不是"本次运行时间"）：
   运行时据此判断「游戏内的修订」是否比 CSV 新。用运行时间会导致"只重跑导入、没改 CSV"
   也把 stamp 推到现在，从而误删用户之后做的修订。取 mtime 才能如实反映内容新旧。 */
try {
  const dir = path.join(ROOT, "csv");
  const mts = fs.readdirSync(dir).filter(f => f.endsWith(".csv") && !f.startsWith("~$"))
    .map(f => fs.statSync(path.join(dir, f)).mtimeMs).filter(n => n > 0);
  ov.stamp = mts.length ? Math.max(...mts) : Date.now();
} catch (e) { ov.stamp = Date.now(); }
const js = "/* 由 tools/csv-import.mjs 从 csv/*.csv 生成，请勿手改；改 CSV 后重跑此脚本 */\n"
  + "window.WD_CSV=" + JSON.stringify(ov) + ";\n";
fs.writeFileSync(path.join(ROOT, "csv-overrides.js"), js, "utf8");
/* 必须给 index.html 里的引用递增版本号：直接 file:// 打开时没有 Service Worker，
   浏览器按 URL（含 ?vN）做 HTTP 缓存，版本号不变就永远加载旧覆盖文件——改了 CSV 却不生效 */
try {
  const hp = path.join(ROOT, "index.html");
  const h = fs.readFileSync(hp, "utf8");
  const nh = h.replace(/csv-overrides\.js\?v(\d+)/, (m, n) => "csv-overrides.js?v" + (Number(n) + 1));
  if (nh !== h) { fs.writeFileSync(hp, nh, "utf8"); console.log("已递增 index.html 中 csv-overrides.js 版本号"); }
} catch (e) { console.warn("更新 index.html 版本号失败：", e.message); }
console.log("已生成 csv-overrides.js ·", JSON.stringify(ov.stats), "· stamp", ov.stamp);
