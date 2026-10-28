#!/usr/bin/env node
/* build-oral.mjs —— 导游词「篇 → 节 → 段 → 句」数据与节级任务单元生成器
   用法：node tools/build-oral.mjs [源文件路径]
   默认源：oral-src/gug.md（故宫干净版）

   产出：
   1) oral-full-gug.js   —— window.ORAL_FULL_GUG，并替换 GAME_DATA.oralFull 中的故宫篇
   2) task-units-oral.js —— window.TASK_UNITS25_EXT，6 篇导游词按「1 节 = 1 个 quest」建单元

   时长模型（五步流程：整段读 → 分句读&修订 → 分句复述 → 整段重读 → 整段复述）：
     朗读 110 词/分 × 3 遍 + 复述 90 词/分 × 2 遍 + 每句 0.25 分钟修订/复述开销
   6 篇统一按此模型重估，故宫篇以新全文为基准。
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "oral-src", "gug.md");

const WPM_READ = 110, WPM_SPEAK = 90, PER_SENT = 0.25;
const enWords = s => (String(s || "").match(/[A-Za-z]+/g) || []).length;
/* 英文分句（与 wd-v25.js 的 _oralSplitSent 保持一致）：
   ① 句末标点后可能先跟右引号/右括号（如 “Purple Forbidden City.”），旧正则只看 .!? 后是否紧跟空格，
      遇到 ” 就切不开，会把两句合成一句；
   ② 过短的句子（英文 <5 词 / 中文 <6 字）并入下一句，避免「Good morning, everyone!」单独成条。 */
const splitSentences = s => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const out = []; let cur = "";
  const isEnd = ch => ch === "." || ch === "!" || ch === "?" || ch === "。" || ch === "！" || ch === "？";
  const isCloser = ch => ch === '"' || ch === "'" || ch === "”" || ch === "’" || ch === ")" || ch === "]" || ch === "」" || ch === "』" || ch === "）" || ch === "】";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]; cur += ch;
    if (!isEnd(ch)) continue;
    if (ch === "." && /\d/.test(t[i - 1] || "") && /\d/.test(t[i + 1] || "")) continue; /* 3.5 不切 */
    let j = i + 1;
    while (j < t.length && isCloser(t[j])) { cur += t[j]; j++; }
    const nx = t[j] || "";
    if (j >= t.length || nx === " " || /[\u4e00-\u9fffA-Z0-9“"‘'(]/.test(nx)) {
      out.push(cur.trim()); cur = ""; i = j - 1;
    }
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
};
const secMinutes = (words, sents) =>
  Math.max(3, Math.round(3 * words / WPM_READ + 2 * words / WPM_SPEAK + sents * PER_SENT));
/* 段落级时长（整节才有 3 分钟下限，短段就该短） */
const paraMins = p => {
  const w = enWords(p.text), s = splitSentences(p.text).length;
  return Math.max(1, Math.round(3 * w / WPM_READ + 2 * w / WPM_SPEAK + s * PER_SENT));
};

/* ---------- 重组节：不机械按 md 的 ## 分节，而按「子主题(head)块 + 时长」重新装箱 ----------
   让节数落在 9~12、时长均衡、切点贴合内容主题边界（一个建筑群 / 一个讲解主题 ≈ 一节）。
   三步：① 按 ## 节内 head 切块（无 head 的节=单块）；② 超长块按段落均分；③ 贪心装箱封节。 */
function reorganizeSections(secs){
  const LO = 8, HI = 22, SOFT = 22;   /* LO=小节阈值(并入相邻) HI=大节阈值(拆子主题) SOFT=单节上限 */
  const cleanH = s => String(s).replace(/^\d+[\.、]\s*/, "");
  const calcPiece = (head, paras) => {
    const words = enWords(paras.map(p => p.text).join(" "));
    const sents = splitSentences(paras.map(p => p.text).join(" ")).length;
    return { head: cleanH(head), paras, words, sents, mins: secMinutes(words, sents) };
  };
  /* ① 每 ## 节 → 节片：引言并入第一子主题；整节 >HI 且含多个子主题才拆，否则整节一块 */
  const pieces = [];
  secs.forEach(sec => {
    const paras = sec.paragraphs || [];
    const local = []; let cur = null;
    paras.forEach(p => { if (!cur || p.head) { cur = { head: p.head || "", paras: [] }; local.push(cur); } cur.paras.push(p); });
    if (local.length > 1 && !local[0].head) { const intro = local.shift(); local[0].paras = intro.paras.concat(local[0].paras); }
    local.forEach(b => { b.words = enWords(b.paras.map(x => x.text).join(" ")); b.sents = splitSentences(b.paras.map(x => x.text).join(" ")).length; b.mins = secMinutes(b.words, b.sents); });
    const total = local.reduce((a, b) => a + b.mins, 0);
    if (local.length > 1 && total > HI) {
      local.forEach(b => pieces.push(calcPiece(b.head, b.paras)));
    } else {
      pieces.push(calcPiece(sec.h, local.flatMap(b => b.paras)));
    }
  });
  /* ② 合并小节（<LO）：优先并入前一块；前一块放不下（>SOFT）则并入后一块 */
  const arr = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.mins >= LO) { arr.push(p); continue; }
    if (arr.length && arr[arr.length - 1].mins + p.mins <= SOFT) {
      const q = arr[arr.length - 1];
      q.paras = q.paras.concat(p.paras); q.words += p.words; q.sents += p.sents; q.mins += p.mins;
      if (p.head) q.head += (q.head ? " · " : "") + p.head;
    } else if (i + 1 < pieces.length && p.mins + pieces[i + 1].mins <= SOFT) {
      const nxt = pieces[i + 1];
      nxt.paras = p.paras.concat(nxt.paras); nxt.words += p.words; nxt.sents += p.sents; nxt.mins += p.mins;
      if (p.head) nxt.head = nxt.head ? (p.head + " · " + nxt.head) : p.head;
    } else {
      arr.push(p);
    }
  }
  /* ③ 组装 sections（重编段号、重算句/词、标题去数字前缀） */
  return arr.map((g, i) => {
    const paras = g.paras.slice();
    paras.forEach((p, j) => { p.n = j + 1; });
    const sentences = [];
    paras.forEach((p, pi) => {
      splitSentences(p.text).forEach(t => sentences.push({ n: sentences.length + 1, text: t, pi }));
      p.sents = sentences.filter(x => x.pi === pi).map(x => x.n);
    });
    const words = enWords(paras.map(p => p.text).join(" "));
    return { n: i + 1, h: cleanH(g.head), paragraphs: paras, words, sents: sentences.length, sentences, text: paras.map(p => p.text).join("\n\n"), mins: secMinutes(words, sentences.length), i };
  });
}

/* ---------- 解析 markdown：## 节，空行分段，中文短行=小注 ---------- */
function parseGug(md) {
  const lines = md.split(/\r?\n/);
  let title = "", secs = [], cur = null;
  let buf = [], bufLines = 0, note = "", head = "";
  const flush = () => {
    if (!buf.length) return;
    let text = buf.join(" ").replace(/\s+/g, " ").trim();
    const single = bufLines === 1;
    buf = []; bufLines = 0;
    if (!text) return;
    /* 源文件里残留的编辑标记（如 -|A}）清掉，避免带进游戏 */
    text = text.replace(/\s*-?\|A\}\s*$/, "").trim();
    if (!text) return;
    /* 小标题：单行、无句末标点、无逗号、≤8 词、不以系动词结尾 */
    const isHead = single && !/[.!?。！？:：]$/.test(text) && !/,/.test(text)
      && enWords(text) <= 8 && !/\b(are|is|were|was|include|includes)\s*$/i.test(text);
    if (isHead) { head = text; return; }
    if (!cur) return;
    cur.paragraphs.push({ n: cur.paragraphs.length + 1, text, ...(head ? { head } : {}), ...(note ? { note } : {}) });
    head = ""; note = "";
  };
  for (const ln of lines) {
    const t = ln.trim();
    if (/^#\s+/.test(t) && !/^##/.test(t)) { title = t.replace(/^#\s+/, ""); continue; }
    if (/^##\s+/.test(t)) {
      flush(); head = ""; note = "";
      cur = { n: secs.length + 1, h: t.replace(/^##\s+/, ""), paragraphs: [] };
      secs.push(cur); continue;
    }
    if (!t) { flush(); continue; }
    /* 纯中文短行 = 该段的中文小注（不参与英文朗读） */
    if (!/[A-Za-z]/.test(t) && /[\u4e00-\u9fff]/.test(t) && !buf.length) { note = t; continue; }
    buf.push(t); bufLines++;
  }
  flush();

  secs.forEach((s, si) => {
    const sentences = [];
    s.paragraphs.forEach((p, pi) => {
      splitSentences(p.text).forEach(x => sentences.push({ n: sentences.length + 1, text: x, pi }));
      p.sents = sentences.filter(x => x.pi === pi).map(x => x.n);
    });
    s.words = enWords(s.paragraphs.map(p => p.text).join(" "));
    s.sents = sentences.length;
    s.sentences = sentences;
    s.text = s.paragraphs.map(p => p.text).join("\n\n");   /* 兼容旧修习室/全文编辑 */
    s.mins = secMinutes(s.words, s.sents);
    s.i = si;
  });
  /* 不机械按 ## 分节：按时长 + 内容相关性重组为 9~12 节（午门这类天生短的就自然并入相邻主题） */
  secs = reorganizeSections(secs);
  const words = secs.reduce((a, s) => a + s.words, 0);
  return {
    id: "forbidden-city", aid: "GUG", name: "故宫",
    title: title || "The Forbidden City",
    src: "oral-src/gug.md",
    words,
    mins: secs.reduce((a, s) => a + s.mins, 0),
    sections: secs,
  };
}

/* ---------- 载入现有 6 篇（含新故宫） ---------- */
function loadGameData() {
  global.window = {};
  require(path.join(ROOT, "game-data.js"));
  return global.window.GAME_DATA;
}
const md = fs.readFileSync(SRC, "utf8");
const GUG = parseGug(md);

/* 写故宫全文数据 */
const gugJs = "/* 本文件由 tools/build-oral.mjs 从 oral-src/gug.md 自动生成，请勿手改；改 md 后重跑脚本 */\n"
  + "(function(){\n"
  + "  var GUG=" + JSON.stringify(GUG) + ";\n"
  + "  window.ORAL_FULL_GUG=GUG;\n"
  + "  try{\n"
  + "    var D=window.GAME_DATA;\n"
  + "    if(D&&Array.isArray(D.oralFull)){\n"
  + "      var i=D.oralFull.findIndex(function(x){return x.id==='forbidden-city';});\n"
  + "      if(i>=0) D.oralFull[i]=GUG; else D.oralFull.push(GUG);\n"
  + "    }\n"
  + "  }catch(e){}\n"
  + "})();\n";
fs.writeFileSync(path.join(ROOT, "oral-full-gug.js"), gugJs);

/* 其余 5 篇沿用现有 oralFull：只有整节 text，没有段层级 → 整节当 1 段。
   它们尚未灌入全文（现库文本约为真实体量 1/3），若按现有词数算时长会严重低估；
   因此统一用故宫篇实测的「每节平均分钟数」作为基准估算，待各篇全文到位后自动改回按词数精算。 */
const D = loadGameData();
const arts = (D.oralFull || []).map(o => o.id === "forbidden-city" ? GUG : o);
const avgSecMins = Math.round(GUG.mins / GUG.sections.length);
const SOFT_SEC = 30;   /* 子任务软上限（与笔试单元 SOFT_MAX 同口径）：单次背诵不宜超 30 分钟 */
const units = [];
let n = 201;
for (const art of arts) {
  (art.sections || []).forEach((sec, si) => {
    /* 有全文层级 → 段落数组；无全文 → 整节当 1 段 */
    const paras = Array.isArray(sec.paragraphs) && sec.paragraphs.length
      ? sec.paragraphs : [{ n: 1, text: String(sec.text || sec.en || "").trim() }];
    const hasFull = Array.isArray(sec.paragraphs) && sec.paragraphs.length > 0;
    const totalMins = hasFull ? secMinutes(sec.words, sec.sents) : avgSecMins;

    /* 超长节（>SOFT_SEC）按段落连续打包均分成 a/b/c 子任务；未超就一个子任务＝整节 */
    let chunks;
    if (hasFull) {
      chunks = []; let cur = [], cm = 0, p0 = 0;
      paras.forEach((p, pi) => {
        const pm = paraMins(p);
        if (cur.length && cm + pm > SOFT_SEC) { chunks.push({ paras: cur, mins: cm, p0, p1: pi }); cur = []; cm = 0; p0 = pi; }
        cur.push(p); cm += pm;
      });
      if (cur.length) chunks.push({ paras: cur, mins: cm, p0, p1: paras.length });
    } else {
      chunks = [{ paras, mins: totalMins, p0: 0, p1: paras.length }];
    }

    const head = (sec.h || "").replace(/^\d+[\.、]\s*/, "");   /* 去节号，标题里「第N节」已标 */
    const partLabel = k => chunks.length > 1 ? " (" + (k + 1) + "/" + chunks.length + ")" : "";
    chunks.forEach((ch, k) => {
      const words = enWords(ch.paras.map(p => p.text).join(" "));
      const sents = splitSentences(ch.paras.map(p => p.text).join(" ")).length;
      units.push({
        n: n++,
        subj: "科目五 导游服务能力（现场考试）",
        mods: ["景点讲解·" + art.name + "（节）"],
        mins: ch.mins,
        items: [{
          id: "ORAL:" + art.aid + ":" + (si + 1) + ":" + k,
          title: art.name + " · 第" + (si + 1) + "节「" + head + "」" + partLabel(k),
          mins: ch.mins,
          p0: ch.p0, p1: ch.p1, parts: chunks.length, part: k,
          words, sents, paras: ch.paras.length,
        }],
      });
    });
  });
}
const unitsJs = "/* 本文件由 tools/build-oral.mjs 自动生成，请勿手改；1 节 = 1 个 quest（超长节按段落均分为 a/b/c 子任务） */\n"
  + "window.TASK_UNITS25_EXT=" + JSON.stringify(units) + ";\n";
fs.writeFileSync(path.join(ROOT, "task-units-oral.js"), unitsJs);

const total = units.reduce((a, u) => a + u.mins, 0);
const maxU = units.reduce((a, u) => Math.max(a, u.mins), 0);
console.log(`故宫篇：${GUG.sections.length} 节 / ${GUG.words} 词 / ${GUG.sections.reduce((a, s) => a + s.sents, 0)} 句 / 合计 ${GUG.mins} 分钟`);
console.log(`6 篇导游词：${units.length} 个节级任务单元，合计 ${total} 分钟，最长 ${maxU} 分钟，平均 ${(total / units.length).toFixed(1)} 分钟/节`);
console.log("已生成 oral-full-gug.js 与 task-units-oral.js");
