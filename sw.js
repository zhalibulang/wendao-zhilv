// 问道之旅 Service Worker — 离线缓存 + 即时更新
// 版本号每次内容变更必须 +1，activate 时据此清除旧缓存
const CACHE = "wdzx-v6";
const CORE = [
  "./",
  "./index.html",
  "./game-data.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

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
    )).then(() => self.clients.claim())
  );
});

// 策略：核心资源 network-first（保证内容更新即时生效），失败回落缓存（离线可用）；
//       其余资源 network-first 回落缓存
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // 不拦截跨域
  if (e.request.method !== "GET") return;

  const isCore = CORE.some(p => url.pathname.endsWith(p) || url.pathname === p.replace("./", "/"));

  if (isCore) {
    // network-first：优先取网络最新内容；离线/失败才用缓存，确保游戏内容更正即时生效
    e.respondWith(
      fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return resp;
      }).catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  }
});
