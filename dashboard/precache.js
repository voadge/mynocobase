/* nb-precache — NocoBase static-asset precache Service Worker.
   Cache-first for hash-named JS/CSS so entering NocoBase pages from the
   dashboard stops re-downloading ~10MB every time.
   Registered from app shells (via dashboard/assets/auth-sync.js injection). */
'use strict';

var CACHE_PREFIX = 'nb-precache-';
var CACHE_VERSION = 'v1';
var ASSET_CACHE = CACHE_PREFIX + CACHE_VERSION + '-assets';

var ASSET_RE = /^\/(?:assets|v\/assets|static\/plugins|v\/static\/plugins)\/.*\.(?:js|css|woff2?|png|jpg|svg|json)(?:\?.*)?$/;
var SHELLS = ['/v/admin/ffw9h2yb5cp', '/admin/', '/v/admin/'];

self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (k) {
      return k.indexOf(CACHE_PREFIX) === 0 && k !== ASSET_CACHE;
    }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
    warm().catch(function () {});
  })());
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async function () {
      try { return await fetch(req); }
      catch (err) {
        var hit = await caches.match(req);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  if (ASSET_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  }
});

function cacheFirst(req) {
  return caches.open(ASSET_CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (net) {
        if (net.ok && net.type === 'basic' && net.status === 200) {
          cache.put(req, net.clone()).catch(function () {});
        }
        return net;
      }).catch(function (err) {
        if (hit) return hit;
        throw err;
      });
    });
  });
}

function warm() {
  var seen = {};
  var queue = [];
  function scan(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) return null;
      return r.text();
    }).then(function (text) {
      if (!text) return;
      var re = /(?:src|href)="(\/(?:assets|v\/assets|static\/plugins|v\/static\/plugins)\/[^"?]+\.(?:js|css|woff2?|png|jpg|svg|json)(?:\?[^"]*)?)"/g;
      var m;
      while ((m = re.exec(text))) {
        var u = m[1];
        if (!seen[u]) { seen[u] = 1; queue.push(u); }
      }
    }).catch(function () {});
  }
  return Promise.all(SHELLS.map(scan)).then(function () {
    return caches.open(ASSET_CACHE).then(function (cache) {
      var CHUNK = 8;
      var i = 0;
      function step() {
        var batch = queue.slice(i, i + CHUNK);
        i += CHUNK;
        if (!batch.length) return;
        return Promise.all(batch.map(function (p) {
          return cache.match(p).then(function (hit) {
            if (hit) return;
            return fetch(p).then(function (net) {
              if (net.ok && net.type === 'basic') return cache.put(p, net);
            }).catch(function () {});
          });
        })).then(step);
      }
      return step();
    });
  });
}