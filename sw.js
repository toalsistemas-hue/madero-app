// ═══════════════════════════════════════════════════════════════════
// sw.js — Service Worker FabTracker · Madero Equipos de Ordeño
// ═══════════════════════════════════════════════════════════════════

const SW_VERSION    = 'madero-fab-v4';
const CACHE_NAME    = SW_VERSION;
const FILES_TO_CACHE = [
  './',
  './app.html',
  './offline.html',
  './manifest.json'
];

// ── Instalación ────────────────────────────────────────────────────
self.addEventListener('install', function(evt) {
  console.log('[SW] Instalando:', SW_VERSION);
  evt.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(FILES_TO_CACHE).catch(function(e) {
        console.warn('[SW] Cache parcial:', e.message);
      });
    })
  );
  self.skipWaiting();
});

// ── Activación ─────────────────────────────────────────────────────
self.addEventListener('activate', function(evt) {
  evt.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Fetch — Network first, offline fallback ────────────────────────
self.addEventListener('fetch', function(evt) {
  if (evt.request.method !== 'GET') return;

  var url = evt.request.url;

  // For navigation requests (page loads) — network first, offline page as fallback
  if (evt.request.mode === 'navigate') {
    evt.respondWith(
      fetch(evt.request).then(function(resp) {
        // Cache the fresh response
        if (resp && resp.status === 200) {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(evt.request, clone); });
        }
        return resp;
      }).catch(function() {
        // No internet — serve offline page from cache
        return caches.match('./offline.html').then(function(cached) {
          return cached || new Response(
            '<h1 style="font-family:sans-serif;text-align:center;padding:40px;color:#e6edf3;background:#0d1117;min-height:100vh">Sin conexión a internet.<br><br><button onclick="location.reload()" style="padding:12px 24px;border-radius:8px;background:#1565C0;color:#fff;border:none;font-size:1rem;cursor:pointer">Reintentar</button></h1>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      })
    );
    return;
  }

  // For other requests — try network, then cache
  evt.respondWith(
    fetch(evt.request).catch(function() {
      return caches.match(evt.request);
    })
  );
});

// ── Messages ───────────────────────────────────────────────────────
self.addEventListener('message', function(evt) {
  if (evt.data && evt.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Push Notifications ─────────────────────────────────────────────
self.addEventListener('push', function(evt) {
  var data = {};
  try { data = evt.data ? evt.data.json() : {}; } catch(e) {
    data = { title: 'FabTracker', body: evt.data ? evt.data.text() : 'Nueva notificación' };
  }
  var tipo = data.tipo || 'coord';
  var iconoTipo = { coord:'📅', calidad:'🔍', turno:'🤝', retrabajo:'🔧', error:'⚠️' }[tipo] || '📡';
  evt.waitUntil(
    self.registration.showNotification(iconoTipo + ' ' + (data.title || 'FabTracker'), {
      body:    data.body || 'Tienes una notificación pendiente',
      icon:    './icon-192.png',
      badge:   './icon-192.png',
      tag:     data.tag || 'fabtracker',
      renotify: true,
      requireInteraction: tipo === 'calidad',
      vibrate: tipo === 'calidad' ? [200,100,200,100,200] : [100,50,100],
      data:    { tipo: tipo, url: './app.html', of_sap: data.of_sap||'', op_id: data.op_id||'' }
    })
  );
});

self.addEventListener('notificationclick', function(evt) {
  evt.notification.close();
  if (evt.action === 'ignorar') return;
  evt.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(wins) {
      for (var i = 0; i < wins.length; i++) {
        if (wins[i].url.indexOf('app.html') >= 0) { wins[i].focus(); return; }
      }
      if (clients.openWindow) return clients.openWindow('./app.html');
    })
  );
});
