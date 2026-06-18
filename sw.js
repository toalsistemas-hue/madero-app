// ═══════════════════════════════════════════════════════════════════
// sw.js — Service Worker FabTracker · Madero Equipos de Ordeño v6
// Estrategia: Cache-First para app.html — funciona sin internet
// ═══════════════════════════════════════════════════════════════════

const SW_VERSION  = 'madero-fab-v7';
const CACHE_NAME  = SW_VERSION;
const APP_SHELL   = [
  './app.html',
  './offline.html',
  './manifest.json',
];

// ── INSTALL: pre-cachear app shell completo ────────────────────────
self.addEventListener('install', function(evt) {
  console.log('[SW v6] Instalando...');
  evt.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Cachear cada archivo individualmente para no fallar por uno
      return Promise.all(
        APP_SHELL.map(function(url) {
          return cache.add(url).catch(function(e) {
            console.warn('[SW] No se pudo cachear:', url, e.message);
          });
        })
      );
    }).then(function() {
      console.log('[SW v6] App shell cacheada. skipWaiting...');
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: limpiar caches anteriores ────────────────────────────
self.addEventListener('activate', function(evt) {
  console.log('[SW v6] Activando...');
  evt.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) {
              console.log('[SW] Eliminando caché viejo:', k);
              return caches.delete(k);
            })
      );
    })
    // clients.claim() removed intentionally:
    // it triggers controllerchange → reload → network request → defeats offline cache
    // The new SW takes control on next navigation automatically
  );
});

// ── FETCH: Cache-First para app.html y offline.html ────────────────
// Para navegaciones (page load), sirve desde caché si existe.
// Actualiza el caché en background cuando hay red.
self.addEventListener('fetch', function(evt) {
  if (evt.request.method !== 'GET') return;

  var url = new URL(evt.request.url);
  var isNavigation = evt.request.mode === 'navigate';
  var isAppFile = url.pathname.endsWith('/app.html') ||
                  url.pathname.endsWith('/offline.html') ||
                  url.pathname === '/' ||
                  url.pathname.endsWith('/');

  if (isNavigation || isAppFile) {
    evt.respondWith(
      caches.match(evt.request).then(function(cached) {
        // Siempre intentar actualizar en background
        var networkFetch = fetch(evt.request).then(function(resp) {
          if (resp && resp.status === 200) {
            var clone = resp.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(evt.request, clone);
            });
          }
          return resp;
        }).catch(function() {
          // Sin red — usar caché o offline.html
          return null;
        });

        if (cached) {
          // Tenemos caché → servir inmediatamente, actualizar en background
          networkFetch.catch(function() {});
          return cached;
        }

        // Sin caché → esperar red o mostrar offline
        return networkFetch.then(function(resp) {
          if (resp) return resp;
          return caches.match('./offline.html').then(function(offlinePage) {
            return offlinePage || new Response(
              offlineFallback(),
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });
        });
      })
    );
    return;
  }

  // Recursos estáticos: network first, caché como fallback
  evt.respondWith(
    fetch(evt.request).then(function(resp) {
      if (resp && resp.status === 200) {
        var clone = resp.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(evt.request, clone); });
      }
      return resp;
    }).catch(function() {
      return caches.match(evt.request);
    })
  );
});

function offlineFallback() {
  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{background:#0d1117;color:#e6edf3;font-family:sans-serif;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'min-height:100vh;text-align:center;padding:32px 24px;}' +
    '.ic{font-size:72px;margin-bottom:24px;opacity:.35;}' +
    'h1{font-size:1.4rem;margin-bottom:10px;}' +
    'p{color:#8b949e;font-size:.88rem;line-height:1.6;max-width:300px;margin:0 auto 28px;}' +
    'button{background:#1565C0;color:#fff;border:none;border-radius:12px;' +
    'padding:14px 32px;font-size:.95rem;font-weight:600;cursor:pointer;width:100%;max-width:280px;}' +
    '</style></head><body>' +
    '<div class="ic">📶</div>' +
    '<h1>Sin acceso a internet</h1>' +
    '<p>Verifica tu conexión e intenta de nuevo para acceder a Automatizaciones Madero Equipos.</p>' +
    '<button onclick="location.reload()">🔄 Reintentar</button>' +
    '</body></html>';
}

// ── MESSAGES ───────────────────────────────────────────────────────
self.addEventListener('message', function(evt) {
  if (evt.data && evt.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── PUSH NOTIFICATIONS ─────────────────────────────────────────────
self.addEventListener('push', function(evt) {
  var data = {};
  try { data = evt.data ? evt.data.json() : {}; } catch(e) {}
  var tipo   = data.tipo || 'coord';
  var iconos = { coord:'📅', calidad:'🔍', turno:'🤝', retrabajo:'🔧' };
  evt.waitUntil(
    self.registration.showNotification(
      (iconos[tipo]||'📡') + ' ' + (data.title||'FabTracker'), {
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
