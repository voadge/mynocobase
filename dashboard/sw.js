var LOCATION_SYNC_TAG = 'location-sync';
var authToken = null;

self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'TOKEN_RESPONSE') {
    authToken = event.data.token;
  }
  if (event.data && event.data.type === 'SYNC_NOW') {
    event.waitUntil(syncLocationQueue());
  }
});

self.addEventListener('sync', function (event) {
  if (event.tag === LOCATION_SYNC_TAG) {
    event.waitUntil(requestTokenThenSync());
  }
});

async function requestTokenThenSync() {
  var clients = await self.clients.matchAll({ type: 'window' });
  for (var i = 0; i < clients.length; i++) {
    clients[i].postMessage({ type: 'REQUEST_TOKEN' });
  }
  await new Promise(function (r) { return setTimeout(r, 2000); });
  await syncLocationQueue();
}

async function syncLocationQueue() {
  if (!authToken) return;
  try {
    var db = await _openDB();
    var tx = db.transaction('location_queue', 'readonly');
    var store = tx.objectStore('location_queue');
    var idx = store.index('status');
    var all = await new Promise(function (resolve) {
      var req = idx.getAll('pending');
      req.onsuccess = function () { resolve(req.result); };
    });
    var wtx = db.transaction('location_queue', 'readwrite');
    var wstore = wtx.objectStore('location_queue');
    for (var i = 0; i < all.length; i++) {
      var item = all[i];
      try {
        var res = await fetch('/api/location_history:create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify(item)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await wstore.delete(item.id);
      } catch (e) {
        if (++item.retryCount >= 5) {
          item.status = 'failed';
          await wstore.put(item);
        } else {
          item.status = 'retrying';
          await wstore.put(item);
        }
      }
    }
  } catch (e) {
    console.error('SW syncLocationQueue error:', e);
  }
}

function _openDB() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open('LocationDB', 1);
    request.onerror = function () { reject(request.error); };
    request.onsuccess = function () { resolve(request.result); };
    request.onupgradeneeded = function (event) {
      var db = event.target.result;
      if (!db.objectStoreNames.contains('location_queue')) {
        var store = db.createObjectStore('location_queue', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('userId', 'userId');
        store.createIndex('status', 'status');
      }
    };
  });
}
