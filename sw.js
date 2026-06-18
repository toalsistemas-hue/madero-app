// ═══════════════════════════════════════════════════════════════════
// sw.js — Service Worker FabTracker · Madero Equipos de Ordeño v5
// ═══════════════════════════════════════════════════════════════════

const SW_VERSION = 'madero-fab-v5';
const CACHE_NAME = SW_VERSION;

// Archivos críticos para offline — offline.html es el más importante
const OFFLINE_URL = './offline.html';
const FILES_TO_CACHE = [
  OFFLINE_URL,
  './app.html',
  './manifest.json'
];

// ── Instalación: cachear offline.html primero, resto best-effort ───
self.addEventListener('install', function(evt) {
  console.log('[SW] Instalando:', SW_VERSION);
  evt.waitUntil(
    caches.open(CACHE_NAME).then(async function(cache) {
      // offline.html es crítico — fallar aquí cancela la instalación
      await cache.add(OFFLINE_URL);
      // El resto best-effort (pueden fallar sin cancelar)
      for (var i = 1; i < FILES_TO_CACHE.length; i++) {
        try { await cache.add(FILES_TO_CACHE[i]); }
        catch(e) { console.warn('[SW] No se pudo cachear:', FILES_TO_CACHE[i]); }
      }
    })
  );
  self.skipWaiting();
});

// ── Activación: limpiar versiones anteriores ───────────────────────
self.addEventListener('activate', function(evt) {
  console.log('[SW] Activando:', SW_VERSION);
  evt.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// ── Fetch: navigate → network first, fallback to offline.html ─────
self.addEventListener('fetch', function(evt) {
  if (evt.request.method !== 'GET') return;

  // Solo interceptar peticiones de navegación (apertura de página)
  if (evt.request.mode === 'navigate') {
    evt.respondWith(
      fetch(evt.request)
        .then(function(resp) {
          // Cachear respuesta fresca
          if (resp && resp.status === 200) {
            var clone = resp.clone();
            caches.open(CACHE_NAME).then(function(c) { c.put(evt.request, clone); });
          }
          return resp;
        })
        .catch(function() {
          // Sin internet → offline.html del caché
          return caches.match(OFFLINE_URL).then(function(cached) {
            if (cached) return cached;
            // Fallback inline si offline.html tampoco está en caché
            return new Response(
              '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
              '<meta name="viewport" content="width=device-width,initial-scale=1">' +
              '<title>Sin conexión</title>' +
              '<style>body{background:#0d1117;color:#e6edf3;font-family:sans-serif;' +
              'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
              'min-height:100vh;text-align:center;padding:32px 24px;}' +
              '.icon{font-size:72px;margin-bottom:24px;opacity:.4;}' +
              'h1{font-size:1.4rem;margin-bottom:10px;}' +
              'p{color:#8b949e;font-size:.9rem;line-height:1.6;max-width:300px;margin:0 auto 28px;}' +
              'button{background:#1565C0;color:#fff;border:none;border-radius:12px;' +
              'padding:14px 32px;font-size:.95rem;font-weight:600;cursor:pointer;width:100%;max-width:280px;}' +
              '</style></head><body>' +
              '<div class="icon">📶</div>' +
              '<h1>Sin acceso a internet</h1>' +
              '<p>Verifica tu conexión a internet e intenta de nuevo para acceder a Automatizaciones Madero Equipos.</p>' +
              '<button onclick="location.reload()">🔄 Reintentar</button>' +
              '</body></html>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });
        })
    );
    return;
  }

  // Peticiones de recursos: red primero, caché como fallback
  evt.respondWith(
    fetch(evt.request).catch(function() {
      return caches.match(evt.request);
    })
  );
});

// ── Mensajes ───────────────────────────────────────────────────────
self.addEventListener('message', function(evt) {
  if (evt.data && evt.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Push Notifications ─────────────────────────────────────────────
self.addEventListener('push', function(evt) {
  var data = {};
  try { data = evt.data ? evt.data.json() : {}; } catch(e) {}
  var tipo = data.tipo || 'coord';
  var iconos = { coord:'📅', calidad:'🔍', turno:'🤝', retrabajo:'🔧' };
  evt.waitUntil(
    self.registration.showNotification((iconos[tipo]||'📡') + ' ' + (data.title||'FabTracker'), {
      body:    data.body || 'Nueva notificación de producción',
      icon:    './icon-192.png',
      tag:     'fabtracker-' + tipo,
      renotify: true,
      requireInteraction: tipo === 'calidad',
      vibrate: tipo === 'calidad' ? [200,100,200,100,200] : [100,50,100],
      data: { tipo: tipo, url: './app.html' }
    })
  );
});

self.addEventListener('notificationclick', function(evt) {
  evt.notification.close();
  evt.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(wins) {
      for (var i = 0; i < wins.length; i++) {
        if (wins[i].url.indexOf('app.html') >= 0) { wins[i].focus(); return; }
      }
      if (clients.openWindow) return clients.openWindow('./app.html');
    })
  );
});
