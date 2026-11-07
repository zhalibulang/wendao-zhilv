// 问道之旅 Service Worker — 离线缓存 + 即时更新
// 版本号每次内容变更必须 +1，activate 时据此清除旧缓存
const CACHE = "wdzx-v25-133";
const CORE = [
  "./",
  "./index.html",
  "./game-data.js",
  "./oral-full-gug.js",
  "./exam-2026-data.js",
  "./exam-2026-data-ext.js",
  "./exam-2026-enrich.js",
  "./exam-2026-text-enrich.js",
  "./exam-2026-data-ext2.js",
  "./shizheng-bank.js",
  "./interp-bank.js",
  "./csv-overrides.js",
  "./task-units.js",
  "./task-units-oral.js",
  "./wd-planner.js",
  "./wd-v25.js",
  "./wd-chat.js",
  "./wd-avatar.js",
  "./wd-fx.js",
  "./qrcode.js",
  "./wd-sync.js",
  "./npc-registry.js",
  "./wd-cfg.js",
  "./wd-terms.js",
  "./wd-mem.js",
  "./wd-quiz.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-180.png",
  "./icon-512.png"
];
/* 按 basename 建索引：isCore 判定与部署路径无关（file:// 直开 / 本地 http / github.io 子路径皆正确） */
const CORE_BY_BASE = new Map(CORE.map(p => [p.replace(/^\.\//, ""), p]));

// 大陆访问 github.io 不稳定：同源失败时回落 jsdelivr 镜像（GitHub 内容直读），再回落缓存
const MIRROR = "https://cdn.jsdelivr.net/gh/zhalibulang/wendao-zhilv@main/";

self.addEventListener("install", e => {
  // 逐个缓存，单个资源失败不拖垮整体安装。
  // cache:"reload" 必须加：http.server 无 Cache-Control 头，浏览器启发式 HTTP 缓存会让
  // install 抓到旧版 HTML/JS（v60 曾因此缓存进带 ?v38 引用的旧 index.html，新代码永远加载不出来）
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(CORE.map(p => c.add(new Request(p, { cache: "reload" }))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim()).then(() =>
      // 向所有存活页面广播新缓存版本：页面对比本地记录，发现版本更替即重载一次
      self.clients.matchAll({ includeUncontrolled: true }).then(cs =>
        cs.forEach(c => c.postMessage({ type: "swv", v: CACHE }))
      )
    )
  );
});

self.addEventListener("message", e => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

// 策略：network-first → 缓存（ignoreSearch 命中 ?v 变体）→ core 资源再回落 jsdelivr 镜像
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (e.request.origin !== location.origin) return;  // 不拦截跨域；file:// 下 SW 本就不注册，仅 http/https 生效

  const base = url.pathname.split("/").pop();   // basename：index.html / 各 JS / 各 PNG；首页为 ""
  const rel = CORE_BY_BASE.get(base);           // 命中的 CORE 相对路径（如 "./index.html"）；非 core = undefined

  // cache:"no-cache" 必须加：http.server 无 Cache-Control 头，浏览器对带 ?vXX 的
  // 子资源走启发式 HTTP 缓存，network-first 的 fetch() 会直接命中浏览器 HTTP 缓存旧响应。
  const netReq = () => new Request(e.request, { cache: "no-cache" });

  // ignoreSearch：让带 ?v53 的请求命中裸路径预缓存的 CORE 资源
  const cacheFallback = () => caches.match(e.request, { ignoreSearch: true });

  e.respondWith(
    fetch(netReq()).then(resp => {
      if (resp.ok) { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
      return resp;
    }).catch(() => cacheFallback().then(c => {
      if (c) return c;
      if (!rel) throw new Error("offline");
      // core 且本地缓存 miss：jsdelivr 镜像（用 CORE 相对文件路径；不回填本地缓存，防镜像版本漂移）
      return fetch(MIRROR + rel.replace(/^\.\//, ""), { cache: "no-cache" })
        .then(mresp => { if (!mresp.ok) throw new Error("mirror " + mresp.status); return mresp; });
    }))
  );
});
