/**
 * Stealth Service Worker & Domain Fallback Engine
 */
const CACHE_NAME = 'fruit-market-cache-v1.0';
const STATIC_ASSETS = [
  './index.html',
  './manifest.json'
];

// 後台備用備援域名序列（依序探測）
const FALLBACK_DOMAINS = [
  'https://mirror1.internal-node.net',
  'https://mirror2.internal-node.net'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 僅攔截同源導航或 API 請求
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(async () => {
        // 若 API 或當前域名遭遇屏蔽，嘗試探測備用域
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Network connection failed and stealth fallback active.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      });
    })
  );
});

// 監聽主線程的動態域名輪巡指令
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PROBE_MIRRORS') {
    probeFallbackMirrors();
  }
});

async function probeFallbackMirrors() {
  for (const domain of FALLBACK_DOMAINS) {
    try {
      const res = await fetch(`${domain}/health-check`, { method: 'HEAD', mode: 'no-cors' });
      // 向所有客戶端通知切換至可用鏡像
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({ type: 'SWITCH_MIRROR', target: domain });
      });
      break;
    } catch (e) {
      // 探測失敗，繼續嘗試下一個
    }
  }
}