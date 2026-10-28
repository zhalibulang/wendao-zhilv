// 生成 exam-2026-enrich.js：把考纲的「考察目标/重点提示」按模块名灌进考点 exam_tip 字段。
// 用法：node tools/build-enrich.mjs （在 wendao-v3 目录下执行）
import fs from "fs";
import path from "path";
import url from "url";

const __dir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dir, "..");

const mbi = JSON.parse(fs.readFileSync(path.join(__dir, "_kaogang-mbi.json"), "utf8"));
const ms = JSON.parse(fs.readFileSync(path.join(__dir, "_kaogang-mianshi.json"), "utf8"));

// ============ 笔试：条标题 -> 模块名（或模块名数组） ============
const BI_MAP = {
  "习近平新时代中国特色社会主义思想、党的二十大和二十届二中、三中、四中全会精神": "习近平新时代中国特色社会主义思想与党精神",
  "时事政治": "时事政治（2025-10 起）",
  "旅游业相关政策": "旅游业相关政策",
  "《中华人民共和国宪法》及宪法相关法": "宪法及宪法相关法",
  "《中华人民共和国民法典》": "民法典",
  "《中华人民共和国旅游法》": "旅游法",
  "旅游安全法律制度": "旅游安全法律制度",
  "旅游者相关法律制度": "旅游者相关法律制度",
  "旅行社法律制度": "旅行社法律制度",
  "导游法律制度": "导游法律制度",
  "旅游纠纷处理法律制度": "旅游纠纷处理",
  "旅游资源法律制度": "旅游资源法律制度",
  "食品、住宿、娱乐法律制度": "食品住宿娱乐法律制度",
  "出境入境及交通法律制度": "出入境及交通法律制度",
  // 科目二
  "业务基础": "业务基础",
  "服务程序及要求": "服务程序及要求",
  "服务技能": "服务技能",
  "旅游安全": "旅游安全",
  "应变处理": "应变处理",
  "导游业务相关知识": "导游业务相关知识",
  // 科目三
  "中国共产党百余年奋斗历程及领导人民取得的伟大成就": "党史与伟大成就",
  "中国旅游业发展概况": "中国旅游业发展概况",
  "中国历史文化知识": "中国历史文化知识",
  "中国文字文学常识": "中国文字文学常识",
  "中国传统工艺美术知识": "中国传统工艺美术",
  "中国建筑和园林知识": "中国建筑和园林",
  "中国饮食文化知识": "中国饮食文化",
  "民族常识": "民族常识",
  "宗教常识": "宗教常识",
  "中国自然与地理常识": "中国自然与地理",
  "中国主要旅游客源国（地）概况": "主要旅游客源国(地)",
  // 科目四：1 条 -> 6 个模块
  "地方导游基础知识": ["各省概况与世遗", "中国地理与区划", "北京专项", "名茶名酒工艺药材", "科目四考察维度", "民俗与民居"],
};

// ============ 面试：子项 -> 模块名（或模块名数组） ============
const MS_MAP = {
  "天安门及天安门广场": ["景点讲解·天安门及天安门广场", "景点讲解·天安门（英文闪卡）"],
  "故宫": ["景点讲解·故宫", "景点讲解·故宫（英文闪卡）"],
  "天坛": ["景点讲解·天坛", "景点讲解·天坛（英文闪卡）"],
  "颐和园": ["景点讲解·颐和园", "景点讲解·颐和园（英文闪卡）"],
  "明十三陵": ["景点讲解·明十三陵", "景点讲解·明十三陵（英文闪卡）"],
  "长城": ["景点讲解·长城", "景点讲解·长城（英文闪卡）"],
  "城市概况": "综合能力·城市概况",
  "景点知识问答": ["知识问答卡", "知识问答·周口店/大运河/中轴线", "知识问答·北海/景山", "知识问答·恭王府", "知识问答·雍和宫/奥林匹克公园", "知识问答·孔庙和国子监"],
  "传统文化与民俗": ["综合能力·传统文化与民俗", "综合能力·风物特产"],
  "《北京市旅游条例》": "法律法规问答",
  "2026 年时事政治": "热点与时政常识",
  "外语口译": "口译训练卡（中译外/外译中）",
};

const MODULE = {}; // moduleName -> { g, f, label }

function put(moduleName, g, f, label) {
  if (!moduleName) return;
  const arr = Array.isArray(moduleName) ? moduleName : [moduleName];
  arr.forEach(m => { MODULE[m] = { g, f, label }; });
}

// 笔试
for (const it of mbi) {
  const target = BI_MAP[it.条标题];
  if (!target) { console.warn("[跳过·笔试]", it.条标题); continue; }
  put(target, it.考察目标, it.重点提示, "重点提示");
}
// 面试
for (const it of ms) {
  const target = MS_MAP[it.子项];
  if (!target) { console.warn("[跳过·面试]", it.块, it.子项); continue; }
  put(target, it.考察目标, it.讲解重点, it.块 === "景点讲解" ? "讲解重点" : "重点提示");
}
// 面试「导游服务规范」评分项复用笔试科目二「服务程序及要求」（同为 GB/T 15971 导游服务规范）
const svc = mbi.find(x => x.条标题 === "服务程序及要求");
if (svc) put("导游服务规范", svc.考察目标, svc.重点提示, "重点提示");

// 汇总统计
console.log("模块富化条目数:", Object.keys(MODULE).length);
// 校验：与主库模块是否对上
const dataJs = fs.readFileSync(path.join(root, "exam-2026-data.js"), "utf8");
const arr = eval(dataJs.slice(dataJs.indexOf("=") + 1).replace(/;\s*$/, ""));
const dataMods = new Set(arr.map(p => p.module).filter(Boolean));
const miss = Object.keys(MODULE).filter(m => !dataMods.has(m));
console.log("富化表里但数据库不存在的模块（需复查）:", miss.length ? miss : "无");

// 生成 enrich 文件
const json = JSON.stringify(MODULE, null, 1);
const out = `/* ======================================================================
   exam-2026-enrich.js —— 考点「考察目标/重点提示」富化层
   来源：官方 2026 考纲（笔试知识点拆分 + 面试内容拆分），由 tools/build-enrich.mjs 生成。
   作用：运行时按 module 名把真实「考察目标 + 重点提示」写入考点 exam_tip，
        替换原来的占位符「考察要点：XX模块核心知识点」，供 AI 出题提示词引用。
   ====================================================================== */
window.EXAM_2026_MODULE_ENRICH = ${json};

(function(){
  "use strict";
  var M = window.EXAM_2026_MODULE_ENRICH;
  var arrs = [window.EXAM_2026_DATA, window.EXAM_2026_DATA_EXT];
  for (var i = 0; i < arrs.length; i++) {
    (arrs[i] || []).forEach(function(p){
      var e = M[p.module || ""];
      if (e && e.g) {
        p.exam_tip = "考察目标：" + e.g + "；" + (e.label || "重点提示") + "：" + e.f;
      }
    });
  }
})();
`;
const outPath = path.join(root, "exam-2026-enrich.js");
fs.writeFileSync(outPath, out, "utf8");
console.log("已生成:", outPath, "（", (out.length / 1024).toFixed(1), "KB ）");