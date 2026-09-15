// 问道之旅 Service Worker — 离线缓存 + 即时更新
// 版本号每次内容变更必须 +1，activate 时据此清除旧缓存
const CACHE = "wdzx-v39";
const CORE = [
  "./",
  "./index.html",
  "./game-data.js",
  "./wd-chat.js",
  "./wd-avatar.js",
  "./wd-fx.js",
  "./npc-registry.js",
  "./wd-cfg.js",
  "./wd-mem.js",
  "./wd-quiz.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// 大陆访问 github.io 不稳定：同源失败时回落 jsdelivr 镜像（GitHub 内容直读），再回落缓存
const MIRROR = "https://cdn.jsdelivr.net/gh/zhalibulang/wendao-zhilv@main/";

self.addEventListener("install", e => {
  // 逐个缓存，单个资源失败不拖垮整体安装
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(CORE.map(p => c.add(p)))
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

// 策略：核心资源 network-first → jsdelivr 镜像 → 缓存；其余资源 network-first → 缓存
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // 不拦截跨域
  if (e.request.method !== "GET") return;

  const isCore = CORE.some(p => url.pathname.endsWith(p) || url.pathname === p.replace("./", "/"));

  if (isCore) {
    e.respondWith(
      fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return resp;
      }).catch(() =>
        // 镜像兜底：把 /wendao-zhilv/<path> 映射到 jsdelivr @main
        fetch(MIRROR + url.pathname.replace(/^.*\/wendao-zhilv\//, ""), { cache: "no-cache" })
          .then(mresp => {
            if (!mresp.ok) throw new Error("mirror " + mresp.status);
            const copy = mresp.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
            return mresp;
          })
          .catch(() => caches.match(e.request))
      )
    );
  } else {
    // 非core（assets/ 角色素材等）：network-first，成功响应也回填缓存 → 素材上传 GitHub 后离线仍可用
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
  }
});
