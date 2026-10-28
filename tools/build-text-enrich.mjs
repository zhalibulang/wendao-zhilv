// 生成 exam-2026-text-enrich.js：把 agent 从源材料提取的详细事实补进偏薄考点 text。
// 输入：tools/_text-enrich-src.json（[{pointId,text,anchor,source}]）
// 用法：node tools/build-text-enrich.mjs
import fs from "fs";
import path from "path";
import url from "url";

const __dir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dir, "..");

const src = JSON.parse(fs.readFileSync(path.join(__dir, "_text-enrich-src.json"), "utf8"));
const map = {};
for (const e of src) {
  map[e.pointId] = { text: e.text, anchor: e.anchor || "" };
}
const json = JSON.stringify(map, null, 1);

const out = `/* ======================================================================
   exam-2026-text-enrich.js —— 考点正文富化层
   把官方考纲/时事政治/政策文件里的详细事实补进偏薄考点的 text 字段，
   供书页展示与 AI 出题参考（补齐原「一句口号」类考点的信息量）。
   由 tools/build-text-enrich.mjs 从 tools/_text-enrich-src.json 生成。
   ====================================================================== */
window.EXAM_2026_TEXT_ENRICH = ${json};

(function(){
  "use strict";
  var M = window.EXAM_2026_TEXT_ENRICH;
  var arrs = [window.EXAM_2026_DATA, window.EXAM_2026_DATA_EXT];
  for (var i = 0; i < arrs.length; i++) {
    (arrs[i] || []).forEach(function(p){
      var e = M[p.id];
      if (e) {
        if (e.text) p.text = e.text;
        if (e.anchor) p.anchor = e.anchor;
      }
    });
  }
})();
`;
const outPath = path.join(root, "exam-2026-text-enrich.js");
fs.writeFileSync(outPath, out, "utf8");
console.log("已生成", outPath, "富化点数:", src.length, "（", (out.length / 1024).toFixed(1), "KB ）");