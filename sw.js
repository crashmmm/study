// Service Worker - 物化生背诵助手
const CACHE_NAME = 'study-app-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/mc-brand.svg',
  // CDN 资源
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

// 安装：预缓存
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(err => {
      console.warn('部分资源缓存失败', err);
    }))
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// 拦截请求：缓存优先（适用于本地资源），网络优先（适用于 CDN）
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // CDN 资源：网络优先
  if (url.hostname !== self.location.hostname) {
    e.respondWith(
      fetch(e.request).then(resp => {
        // 缓存成功的响应
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 本地资源：缓存优先
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => {
        // 离线 fallback
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
