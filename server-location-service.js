(function () {
  'use strict';

  var LOCATION_CONFIG = Object.freeze({
    ACCURACY_THRESHOLD: 100,
    STATIONARY_THRESHOLD: 50,
    STATIONARY_DURATION: 300000,
    VEHICLE_SLOW_WINDOW: 300000,
    MOTION_ACCEL_THRESHOLD: 0.5,
    FENCE_INSIDE_INTERVAL: 120000,
    FENCE_OUTSIDE_INTERVAL: 1800000,
    FENCE_POLL_INTERVAL: 30000,
    MAX_QUEUE_RETRIES: 5,
    MAX_QUEUE_SIZE: 1000,
    GEO_CACHE_TTL: 3600000,
    MOBILE_MAX_MARKERS: 20,
  });

  var ACCURACY_COLORS = [
    { threshold: 20, color: '#00ff88', label: '\u9ad8\u7cbe\u5ea6' },
    { threshold: 50, color: '#ffd93d', label: '\u4e2d\u7cbe\u5ea6' },
    { threshold: 100, color: '#ffaa00', label: '\u4f4e\u7cbe\u5ea6' },
    { threshold: Infinity, color: '#ff6b6b', label: '瓒呴檺' },
  ];

  // ---- Coordinate Conversion (WGS-84 -> GCJ-02) ----
  var _PI = 3.141592653589793;
  var _A = 6378245.0;
  var _EE = 0.00669342162296594323;

  function _outOfChina(lat, lng) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }

  function _transformLat(x, y) {
    var ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20 * Math.sin(6 * x * _PI) + 20 * Math.sin(2 * x * _PI)) * 2 / 3;
    ret += (20 * Math.sin(y * _PI) + 40 * Math.sin(y / 3 * _PI)) * 2 / 3;
    ret += (160 * Math.sin(y / 12 * _PI) + 320 * Math.sin(y * _PI / 30)) * 2 / 3;
    return ret;
  }

  function _transformLng(x, y) {
    var ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20 * Math.sin(6 * x * _PI) + 20 * Math.sin(2 * x * _PI)) * 2 / 3;
    ret += (20 * Math.sin(x * _PI) + 40 * Math.sin(x / 3 * _PI)) * 2 / 3;
    ret += (150 * Math.sin(x / 12 * _PI) + 300 * Math.sin(x / 30 * _PI)) * 2 / 3;
    return ret;
  }

  function wgs84ToGcj02(lat, lng) {
    if (_outOfChina(lat, lng)) return { lat: lat, lng: lng };
    var dLat = _transformLat(lng - 105, lat - 35);
    var dLng = _transformLng(lng - 105, lat - 35);
    var radLat = lat / 180 * _PI;
    var magic = Math.sin(radLat);
    magic = 1 - _EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    var gcjLat = lat + (dLat * 180) / ((_A * (1 - _EE)) / (magic * sqrtMagic) * _PI);
    var gcjLng = lng + (dLng * 180) / (_A / sqrtMagic * Math.cos(radLat) * _PI);
    return { lat: gcjLat, lng: gcjLng };
  }

  // ---- Haversine ----
  function _haversine(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * _PI / 180;
    var dLng = (lng2 - lng1) * _PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * _PI / 180) * Math.cos(lat2 * _PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ---- State ----
  var _state = {
    isMoving: false,
    lastPosition: null,
    lastAccelTime: Date.now(),
    watchId: null,
    stationaryTimer: null,
  };

  var _handlers = {};

  function _emit(event, data) {
    (_handlers[event] || []).forEach(function (h) {
      try { h(data); } catch (e) { console.warn('LocationService handler error:', e); }
    });
  }

  function on(event, handler) {
    if (!_handlers[event]) _handlers[event] = [];
    _handlers[event].push(handler);
    return function () { _handlers[event] = _handlers[event].filter(function (h) { return h !== handler; }); };
  }

  function getAccuracyColor(accuracy) {
    if (accuracy == null) return '#00d4ff';
    for (var i = 0; i < ACCURACY_COLORS.length; i++) {
      if (accuracy <= ACCURACY_COLORS[i].threshold) return ACCURACY_COLORS[i].color;
    }
    return '#ff6b6b';
  }

  // ---- Token ----
  function _getToken() {
    return localStorage.getItem('NOCOBASE_TOKEN') || localStorage.getItem('nocobase_token') || '';
  }

  // ---- Privacy Consent ----
  function _checkConsent() {
    var granted = localStorage.getItem('location_consent_granted');
    if (granted) return true;
    var ok = confirm(
      '\u672c\u7cfb\u7edf\u5c06\u91c7\u96c6\u60a8\u7684\u4f4d\u7f6e\u4fe1\u606f\u7528\u4e8e\u8003\u52e4\u6838\u7b97\u4e0e\u8f68\u8ff9\u5c55\u793a\u3002\n' +
      '\u6570\u636e\u4ec5\u4fdd\u755930 \u5929\uff0c\u4e0d\u4f1a\u5171\u4eab\u7ed9\u7b2c\u4e09\u65b9\u3002\n\n' +
      '\u662f\u5426\u540c\u610f\uff1f'
    );
    if (ok) {
      localStorage.setItem('location_consent_granted', Date.now().toString());
      return true;
    }
    return false;
  }

  function showPermissionGuide() {
    var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    var guideMsg = isMobile
      ? '\u8bf7\u5728\u624b\u673a\u3010\u8bbe\u7f6e\u3011\u2192\u3010\u5e94\u7528\u3011\u2192\u3010\u6d4f\u89c8\u5668\u3011\u2192\u3010\u4f4d\u7f6e\u6743\u9650\u3011\u4e2d\u5f00\u542f\u3002'
      : '\u8bf7\u5728\u6d4f\u89c8\u5668\u5730\u5740\u680f\u5de6\u4fa7\u70b9\u51fb\u9501\u56fe\u6807\u2192\u3010\u7f51\u7ad9\u8bbe\u7f6e\u3011\u2192\u3010\u4f4d\u7f6e\u3011\u2192\u3010\u5141\u8bb8\u3011\u3002';
    alert('\u4f4d\u7f6e\u6743\u9650\u5df2\u88ab\u62d2\u7edd\uff0c\u65e0\u6cd5\u83b7\u53d6\u5b9a\u4f4d\u3002\n\n' + guideMsg + '\n\n\u5f00\u542f\u540e\u8bf7\u5237\u65b0\u9875\u9762\u91cd\u8bd5\u3002');
  }

  // ---- Native Positioning ----
  function _getPositionNative(opts) {
    if (typeof Capacitor !== 'undefined' && Capacitor.isNative && Capacitor.Plugins && Capacitor.Plugins.Geolocation) {
      return Capacitor.Plugins.Geolocation.getCurrentPosition(opts).then(function (pos) {
        return { coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy } };
      });
    }
    if (typeof window.appBridge !== 'undefined' && typeof window.appBridge.getLocation === 'function') {
      return new Promise(function (resolve, reject) {
        window.appBridge.getLocation(
          function (lat, lng) { resolve({ coords: { latitude: lat, longitude: lng, accuracy: null } }); },
          function () { reject(new Error('Harmony location failed')); }
        );
      });
    }
    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(resolve, reject, opts);
    });
  }

  // ---- IndexedDB Queue ----
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

  async function queueLocation(data) {
    var db = await _openDB();
    var tx = db.transaction('location_queue', 'readwrite');
    var store = tx.objectStore('location_queue');
    var count = await new Promise(function (resolve) {
      var req = store.count();
      req.onsuccess = function () { resolve(req.result); };
    });
    if (count >= LOCATION_CONFIG.MAX_QUEUE_SIZE) {
      var cursorReq = store.openCursor();
      var deleted = 0;
      cursorReq.onsuccess = function () {
        var cursor = cursorReq.result;
        if (cursor && deleted < 100) {
          store.delete(cursor.primaryKey);
          deleted++;
          cursor.continue();
        }
      };
    }
    var record = {
      ...data,
      status: 'pending',
      retryCount: 0,
      timestamp: Date.now()
    };
    store.add(record);
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(function (reg) {
        if (reg.sync) reg.sync.register('location-sync');
      });
    }
  }

  async function flushQueue() {
    var db = await _openDB();
    var tx = db.transaction('location_queue', 'readwrite');
    var store = tx.objectStore('location_queue');
    var idx = store.index('status');
    var all = await new Promise(function (resolve) {
      var req = idx.getAll('pending');
      req.onsuccess = function () { resolve(req.result); };
    });
    var success = 0;
    for (var i = 0; i < all.length; i++) {
      var item = all[i];
      try {
        var res = await fetch('/api/location_history:create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + _getToken()
          },
          body: JSON.stringify(item)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await store.delete(item.id);
        success++;
      } catch (e) {
        if (++item.retryCount >= LOCATION_CONFIG.MAX_QUEUE_RETRIES) {
          item.status = 'failed';
          await store.put(item);
          console.warn('Location queue: 涓㈠純姝讳俊', item.id);
        } else {
          item.status = 'retrying';
          await store.put(item);
        }
      }
    }
    _emit('queue-flush', { success: success, total: all.length });
    return success;
  }

  // ---- LRU 缓存：单层 localStorage + 最近命中提升 ----
  var _lruCache = {};
  var LRU_MAX = 200;

  function _lruSet(key, val) {
    try {
      localStorage.setItem(key, val);
      _lruCache[key] = val;
      var keys = Object.keys(_lruCache);
      if (keys.length > LRU_MAX) {
        var oldest = keys[0];
        delete _lruCache[oldest];
        try { localStorage.removeItem(oldest); } catch(e) {}
      }
    } catch(e) {}
  }

  function _lruGet(key) {
    var v = _lruCache[key];
    if (v) return v;
    try { v = localStorage.getItem(key); } catch(e) {}
    if (v) _lruCache[key] = v;
    return v;
  }

  async function reverseGeocode(lat, lng) {
    var key = 'geo_' + lat.toFixed(4) + '_' + lng.toFixed(4);
    try {
      var cached = _lruGet(key);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (Date.now() - parsed.t < LOCATION_CONFIG.GEO_CACHE_TTL) return parsed.d;
      }
    } catch (e) { }
    try {
      var r = await fetch('/api/__dh__/regeo?location=' + lng + ',' + lat);
      var d = await r.json();
      if (d.status === '1' && d.regeocode) {
        var addr = d.regeocode.addressComponent;
        var result = {
          township: addr.township || '',
          street: addr.streetNumber && addr.streetNumber.street || addr.street || '',
          district: addr.district || '',
          city: addr.city || ''
        };
        _lruSet(key, JSON.stringify({ d: result, t: Date.now() }));
        return result;
      }
    } catch (e) { }
    return { township: '', street: '', district: '', city: '' };
  }

  // ---- Motion Detection ----
  function _startMotionDetection() {
    var lastAccelTime = Date.now();
    var lastPositionCheck = null;
    if (window.DeviceMotionEvent) {
      var permFn = typeof DeviceMotionEvent.requestPermission === 'function'
        ? DeviceMotionEvent.requestPermission()
        : Promise.resolve('granted');
      permFn.then(function (state) {
        if (state === 'granted') {
          window.addEventListener('devicemotion', function (e) {
            var acc = e.accelerationIncludingGravity;
            if (!acc) return;
            var mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
            if (Math.abs(mag - 9.8) > LOCATION_CONFIG.MOTION_ACCEL_THRESHOLD) {
              lastAccelTime = Date.now();
              _state.isMoving = true;
            }
          });
        }
      }).catch(function () { });
    }
    setInterval(function () {
      var cur = _state.lastPosition;
      if (!cur || !lastPositionCheck) { lastPositionCheck = cur; return; }
      var dist = _haversine(lastPositionCheck.lat, lastPositionCheck.lng, cur.lat, cur.lng);
      if (dist < LOCATION_CONFIG.STATIONARY_THRESHOLD) _state.isMoving = false;
      else _state.isMoving = true;
      lastPositionCheck = cur;
    }, LOCATION_CONFIG.VEHICLE_SLOW_WINDOW);
  }

  function _isMovementSignificant(pos) {
    if (!_state.lastPosition) return true;
    var dist = _haversine(_state.lastPosition.lat, _state.lastPosition.lng, pos.latitude, pos.longitude);
    return dist > LOCATION_CONFIG.STATIONARY_THRESHOLD;
  }

  function _resetStationaryTimer() {
    if (_state.stationaryTimer) {
      clearTimeout(_state.stationaryTimer);
      _state.stationaryTimer = null;
    }
  }

  // ---- Filter & Report ----
  function _filterAndReport(position) {
    var accuracy = position.accuracy;
    if (accuracy != null && accuracy > LOCATION_CONFIG.ACCURACY_THRESHOLD) {
      _emit('accuracy-filtered', { lat: position.lat, lng: position.lng, accuracy: accuracy });
      return;
    }
    if (_isMovementSignificant({ latitude: position.lat, longitude: position.lng, accuracy: accuracy })) {
      _state.isMoving = true;
      _resetStationaryTimer();
    }
    reverseGeocode(position.lat, position.lng).then(function (addr) {
      var consentAt = localStorage.getItem('location_consent_granted');
      var data = {
        latitude: position.lat,
        longitude: position.lng,
        accuracy: Math.round(accuracy) || null,
        source: position.source || 'gps',
        trigger: _state.isMoving ? 'movement' : 'scheduled',
        recorded_at: new Date().toISOString(),
        township: addr.township || '',
        street: addr.street || '',
        district: addr.district || '',
        is_valid: true,
        consent_at: consentAt ? new Date(parseInt(consentAt)).toISOString() : null,
        metadata: {}
      };
      queueLocation(data);
      _emit('position', data);
    });
  }

  // ---- Public API ----
  async function getCurrentPosition(opts) {
    if (!_checkConsent()) {
      _emit('permission-denied', '鐢ㄦ埛鎷掔粷浣嶇疆閲囬泦鍚屾剰');
      showPermissionGuide();
      throw new Error('鐢ㄦ埛鎷掔粷浣嶇疆閲囬泦');
    }
    var options = Object.assign({ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }, opts || {});
    var pos = await _getPositionNative(options);
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      source: 'gps',
    };
  }

  function watchPosition(callback, opts) {
    if (!_checkConsent()) {
      _emit('permission-denied', '鐢ㄦ埛鎷掔粷浣嶇疆閲囬泦鍚屾剰');
      showPermissionGuide();
      return null;
    }
    var options = Object.assign({ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }, opts || {});
    _startMotionDetection();
    var watchId = navigator.geolocation.watchPosition(
      function (pos) {
        var position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          source: 'gps'
        };
        _state.lastPosition = { lat: position.lat, lng: position.lng };
        _filterAndReport(position);
        if (callback) callback(position);
      },
      function () { },
      options
    );
    _state.watchId = watchId;
    return watchId;
  }

  function stopWatch(watchId) {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
    }
    if (_state.watchId) {
      navigator.geolocation.clearWatch(_state.watchId);
      _state.watchId = null;
    }
  }

  function getState() {
    return {
      isMoving: _state.isMoving,
      lastPosition: _state.lastPosition,
      watchActive: _state.watchId !== null,
    };
  }

  // ---- SW Token Channel ----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'REQUEST_TOKEN') {
        var token = _getToken();
        event.source.postMessage({ type: 'TOKEN_RESPONSE', token: token });
      }
    });
  }

  // ---- Online/visibility flush ----
  window.addEventListener('online', function () { flushQueue(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) flushQueue();
  });

  // ---- Export ----
  window.LocationService = {
    getCurrentPosition: getCurrentPosition,
    watchPosition: watchPosition,
    stopWatch: stopWatch,
    reverseGeocode: reverseGeocode,
    queueLocation: queueLocation,
    flushQueue: flushQueue,
    wgs84ToGcj02: wgs84ToGcj02,
    on: on,
    getState: getState,
    getAccuracyColor: getAccuracyColor,
    _checkConsent: _checkConsent,
    showPermissionGuide: showPermissionGuide,
    LOCATION_CONFIG: LOCATION_CONFIG,
    ACCURACY_COLORS: ACCURACY_COLORS,
  };
})();
