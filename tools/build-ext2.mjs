// 生成 exam-2026-data-ext2.js（8 个时政新考点 + 1 个新单元）与 shizheng-bank.js（90 道时政模拟题库）。
// 输入：tools/_new-shizheng-points.json、tools/_shizheng-bank.json
// 用法：node tools/build-ext2.mjs
import fs from "fs";
import path from "path";
import url from "url";

const __dir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dir, "..");

const pts = JSON.parse(fs.readFileSync(path.join(__dir, "_new-shizheng-points.json"), "utf8"));
const bank = JSON.parse(fs.readFileSync(path.join(__dir, "_shizheng-bank.json"), "utf8"));

const SHIZHENG_TIP = "考察目标：识记＋时事跟踪，一般判断、单选各 1–2 题。重点提示：以考前 3–12 个月的重大会议、重大工程、文旅大事为主，权威月度盘点即可覆盖；与面试“2026 年时事政治”共用素材。";

// 每个考点 → 完整 schema（对齐 EXAM_2026_DATA 字段）
const extPoints = pts.map((p, i) => {
  const mins = Math.round((String(p.text).replace(/\s/g, "").length / 300 + 1.5) * 10) / 10;
  return {
    id: p.id, title: p.title, subject: p.subject, module: p.module,
    text: p.text, anchor: p.anchor,
    context: "所属模块：时事政治（2025-10 起）；来源：" + p.source,
    source: p.source, status: "✅",
    exam_tip: SHIZHENG_TIP, origin: "2026备考材料·时事政治", version: "2026-ext2",
    collected: new Date().toISOString().slice(0, 10), star: "2", anchor_type: "manual",
    _mins: mins,
  };
});

const unitItems = extPoints.map(p => ({ id: p.id, title: p.title, mins: p._mins }));
const unit = {
  n: 98, subj: "科目一 政策与法律法规", s5: false,
  mods: ["时事政治（2025-10 起）"],
  items: unitItems,
};

const ext2 = `/* ======================================================================
   exam-2026-data-ext2.js —— 时政新考点补库（2026 备考材料）
   8 个时政主题化新考点（S1-02-05 ~ S1-02-12），并入科目一「时事政治」模块，
   随 1 个新单元（#98）进入 25 日排期。由 tools/build-ext2.mjs 生成。
   ====================================================================== */
window.EXAM_2026_DATA_EXT2 = ${JSON.stringify(extPoints.map(p => { const { _mins, ...rest } = p; return rest; }), null, 1)};

window.TASK_UNITS25_EXT = ${JSON.stringify([unit], null, 1)};
`;
fs.writeFileSync(path.join(root, "exam-2026-data-ext2.js"), ext2, "utf8");

const bankOut = `/* ======================================================================
   shizheng-bank.js —— 时政静态模拟题库（90 题，判断/单选/多选）
   来源：04-数据库/anki/anki-笔试模拟题.csv。字段：id/type/q/opts/a/why/ref/pid。
   供时政单元静态出题/样题参考。由 tools/build-ext2.mjs 生成。
   ====================================================================== */
window.SHIZHENG_BANK = ${JSON.stringify(bank, null, 1)};
`;
fs.writeFileSync(path.join(root, "shizheng-bank.js"), bankOut, "utf8");

console.log("已生成 exam-2026-data-ext2.js：", extPoints.length, "考点 + 1 单元(#98)");
console.log("已生成 shizheng-bank.js：", Array.isArray(bank) ? bank.length : (bank.questions || []).length, "题");