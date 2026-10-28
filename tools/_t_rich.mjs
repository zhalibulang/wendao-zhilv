/* v60 富文本显示链验证：richAware / splitPointImgs / pointGalleryHtml / rich 标签保留 */
import fs from "node:fs";
const html = fs.readFileSync("index.html", "utf8");
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + " —— " + got); } };

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const richSrc = html.slice(html.indexOf("function rich(s){"), html.indexOf("/* 富文本 HTML → 纯文本"));
const splitSrc = html.slice(html.indexOf("function splitPointImgs(html){"), html.indexOf("function pointGalleryHtml"));
const galSrc = html.slice(html.indexOf("function pointGalleryHtml"), html.indexOf("/* 高亮/显示函数共用"));
const awareSrc = html.slice(html.indexOf("function richAware(s){"), html.indexOf("/* ================= 音效引擎"));
const setup = `const esc=${esc.toString()};\n` + richSrc + "\n" + splitSrc + "\n" + galSrc + "\n" + awareSrc;
const run = new Function(setup + "; return {rich, splitPointImgs, pointGalleryHtml, richAware};")();

/* 1. richAware：含 HTML 放行 / 纯文本转义 */
ok("richAware 含 HTML 原样放行", run.richAware('<b>加粗</b>文字') === '<b>加粗</b>文字');
ok("richAware 纯文本转义", run.richAware('a<b & "c"') === esc('a<b & "c"'));

/* 2. rich：用户编辑典型样式保留（加粗/金色 span/黄底/下划线） */
const userEdit = '<b>【加粗测试】</b><span style="color:#e6a23c">金色测试</span><span style="background-color:#ffffaa">黄底</span><u>下划线</u>';
const r1 = run.rich(userEdit);
ok("rich 保留 <b>", r1.includes("<b>【加粗测试】</b>"), r1);
ok("rich 保留金色 span", r1.includes("color:#e6a23c"), r1);
ok("rich 保留黄底 span", r1.includes("background-color:#ffffaa"), r1);
ok("rich 保留 <u>", r1.includes("<u>下划线</u>"), r1);
ok("rich 拦截 script", run.rich('<script>alert(1)</script>').indexOf("<script") === -1, run.rich('<script>alert(1)</script>'));

/* 3. 图文分离：img 抽到图区、正文剥离 */
const withImg = '正文第一段<img src="data:image/png;base64,AA" class="vimg">正文第二段';
const sp = run.splitPointImgs(run.rich(withImg));
ok("正文剥离 img", sp.body.indexOf("<img") === -1 && sp.body.indexOf("正文第一段") >= 0, sp.body);
ok("img 抽进图区数组", sp.imgs.length === 1 && sp.imgs[0].indexOf("data:image/png") === 0, JSON.stringify(sp.imgs));
ok("图区 HTML 生成", run.pointGalleryHtml(sp.imgs).includes('class="v25gal-img"'));
ok("无图返回空图区", run.pointGalleryHtml([]) === "");

/* 3.5 双重转义回归：浏览器存档会把地址里的 & 序列化为 &amp;（带参数的 URL 必然有），
   图区必须原样保留（解码一次后是干净的 &），绝不能再 esc 成 &amp;amp;（→ 404 碎图） */
const ampEdit = '正文<img src="https://cdn.test/icon.png?w=128&amp;h=128" class="vimg">';
const spAmp = run.splitPointImgs(run.rich(ampEdit));
const galAmp = run.pointGalleryHtml(spAmp.imgs);
ok("图区 src 保留单次转义（&amp; 不加倍）", galAmp.includes("?w=128&amp;h=128") && galAmp.indexOf("&amp;amp;") === -1, galAmp);
ok("data URI 地址原样进图区", (() => { const g = run.pointGalleryHtml(["data:image/png;base64,AA"]); return g.includes('src="data:image/png;base64,AA"'); })());

/* 4. 高亮叠加：富文本经过 hlKeywords 逻辑（模拟）不再破坏标签 */
let out = run.richAware('<span style="color:#e6a23c">2020年</span>《旅游法》');
out = out.replace(/([0-9０-９]+(?:\.\d+)?\s*(?:年|个|条|米))/g, "<em>$1</em>");
out = out.replace(/(《[^》]{2,12}》)/g, "<b>$1</b>");
ok("数字高亮套在富文本上仍合法", out.includes("<em>2020年</em>") && out.includes("color:#e6a23c"), out);
ok("书名号加粗正常", out.includes("<b>《旅游法》</b>"), out);

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
