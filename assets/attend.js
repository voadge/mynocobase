        var attendType = '上班';
        var attendPhoto = null;
        var attendLocation = null;
        var attendLocationText = '--';
        var cameraStream = null;
        var faceDetected = false;
        var gpsState = 'fail';
        var _fingerVerified = false;
        var _deviceFp = null;
        var _fingerVerifiedAt = null;
        var _cameraFacingMode = 'user';
        var _manualLocation = null;
        var _cameraFallbackMode = false;

        // ---- 打卡地理围栏配置（按需修改） ----
        // ---------- 折线地理围栏（新版，自 geofences 表动态获取）----------
        var __geofencesCache = null;         // 缓存，[ { id, fence_name, polyline_coords, buffer_radius, bbox_* } ]
        var __geofencesCacheTime = 0;        // 缓存时间戳
        var __polylineGeofenceResult = null; // { inside, distance, fenceId, fenceName, bufferRadius, matched }

        // ---- WGS-84 ↔ GCJ-02 坐标转换（匹配高德瓦片偏移）----
        var _pi = 3.141592653589793;
        var _a = 6378245.0;
        var _ee = 0.00669342162296594323;
        function _transformLat(x, y) {
            var ret = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
            ret += (20*Math.sin(6*x*_pi) + 20*Math.sin(2*x*_pi)) * 2/3;
            ret += (20*Math.sin(y*_pi) + 40*Math.sin(y/3*_pi)) * 2/3;
            ret += (160*Math.sin(y/12*_pi) + 320*Math.sin(y*_pi/30)) * 2/3;
            return ret;
        }
        function _transformLng(x, y) {
            var ret = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
            ret += (20*Math.sin(6*x*_pi) + 20*Math.sin(2*x*_pi)) * 2/3;
            ret += (20*Math.sin(x*_pi) + 40*Math.sin(x/3*_pi)) * 2/3;
            ret += (150*Math.sin(x/12*_pi) + 300*Math.sin(x/30*_pi)) * 2/3;
            return ret;
        }
        function _outOfChina(lat, lng) { return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271; }
        function wgs84ToGcj02(lat, lng) {
            if (_outOfChina(lat, lng)) return [lat, lng];
            var dLat = _transformLat(lng - 105, lat - 35);
            var dLng = _transformLng(lng - 105, lat - 35);
            var radLat = lat / 180 * _pi;
            var magic = Math.sin(radLat);
            magic = 1 - _ee * magic * magic;
            var sqrtMagic = Math.sqrt(magic);
            dLat = (dLat * 180) / ((_a * (1 - _ee)) / (magic * sqrtMagic) * _pi);
            dLng = (dLng * 180) / (_a / sqrtMagic * Math.cos(radLat) * _pi);
            return [lat + dLat, lng + dLng];
        }
        function wgs84ToGcj02Point(lat, lng) {
            var p = wgs84ToGcj02(lat, lng);
            return { lat: p[0], lng: p[1] };
        }

        // 获取围栏列表（带 session 级缓存）
        async function fetchGeofences() {
            var now = Date.now();
            if (__geofencesCache && (now - __geofencesCacheTime < 300000)) { // 5分钟缓存
                return __geofencesCache;
            }
            try {
                var _tk = localStorage.getItem("NOCOBASE_TOKEN") || localStorage.getItem("nocobase_token");
                var _hd = { 'Content-Type': 'application/json' };
                if (_tk) _hd['Authorization'] = 'Bearer ' + _tk;
                var r = await fetch('/api/geofences:list?filter[is_active]=true&sort=sort', { headers: _hd });
                var data = await r.json();
                __geofencesCache = data.data || [];
                __geofencesCacheTime = now;
                return __geofencesCache;
            } catch(e) {
                return __geofencesCache || [];
            }
        }

        // Haversine 距离（米）
        function haversineDist(lat1, lon1, lat2, lon2) {
            var R = 6371000;
            var toRad = Math.PI / 180;
            var dLat = (lat2 - lat1) * toRad;
            var dLon = (lon2 - lon1) * toRad;
            var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        // 点到线段最短距离
        function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {
            var dAC = haversineDist(lat, lon, lat1, lon1);
            var dBC = haversineDist(lat, lon, lat2, lon2);
            var dAB = haversineDist(lat1, lon1, lat2, lon2);
            if (dAB < 1) return dAC;
            var cosA = (dAC * dAC + dAB * dAB - dBC * dBC) / (2 * dAC * dAB);
            var cosB = (dBC * dBC + dAB * dAB - dAC * dAC) / (2 * dBC * dAB);
            if (cosA <= 0) return dAC;
            if (cosB <= 0) return dBC;
            var s = (dAC + dBC + dAB) / 2;
            var area = Math.sqrt(Math.max(0, s * (s - dAC) * (s - dBC) * (s - dAB)));
            return area * 2 / dAB;
        }

        // GPS 点到折线最短距离
        function distanceToPolyline(lat, lon, polyline) {
            var minDist = Infinity;
            for (var i = 0; i < polyline.length - 1; i++) {
                var dist = pointToSegmentDistance(lat, lon, polyline[i][1], polyline[i][0], polyline[i + 1][1], polyline[i + 1][0]);
                if (dist < minDist) minDist = dist;
            }
            return Math.round(minDist);
        }

        // 折线围栏检测（含 bbox 预过滤）
        async function checkPolylineGeofence(lat, lng) {
            var fences = await fetchGeofences();
            if (!fences || fences.length === 0) {
                __polylineGeofenceResult = { inside: true, distance: 0, fenceId: null, fenceName: null, bufferRadius: null, matched: false };
                return __polylineGeofenceResult;
            }

            var minDist = Infinity;
            var matchedFence = null;

            for (var i = 0; i < fences.length; i++) {
                var fence = fences[i];
                // Bbox 预过滤（含缓冲区半径扩展）
                if (fence.bbox_min_lat != null && fence.bbox_max_lat != null &&
                    fence.bbox_min_lng != null && fence.bbox_max_lng != null) {
                    var bufDeg = (fence.buffer_radius || 200) / 111320;
                    var bufDegLng = bufDeg / Math.cos(lat * Math.PI / 180);
                    if (lat < fence.bbox_min_lat - bufDeg || lat > fence.bbox_max_lat + bufDeg ||
                        lng < fence.bbox_min_lng - bufDegLng || lng > fence.bbox_max_lng + bufDegLng) {
                        continue;
                    }
                }
                var polyline;
                try { polyline = JSON.parse(fence.polyline_coords); } catch(e) { continue; }
                if (!Array.isArray(polyline) || polyline.length < 2) continue;

                var dist = distanceToPolyline(lat, lng, polyline);
                if (dist < minDist) { minDist = dist; matchedFence = fence; }
            }

            var bufferRadius = matchedFence ? matchedFence.buffer_radius : 200;
            var isInside = matchedFence ? minDist <= bufferRadius : true;

            __polylineGeofenceResult = {
                inside: isInside,
                distance: minDist < Infinity ? minDist : null,
                fenceId: matchedFence ? matchedFence.id : null,
                fenceName: matchedFence ? matchedFence.fence_name : null,
                bufferRadius: bufferRadius,
                matched: matchedFence !== null
            };
            return __polylineGeofenceResult;
        }

         // ---------- 旧版圆形围栏（已禁用，使用折线围栏）----------
         var geofenceConfig = {
             enabled: false,
             centerLat: 27.706,
             centerLng: 106.937,
             radius: 300
         };
        var geofenceResult = null;

        function checkGeofence(lat, lng) {
            if (!geofenceConfig.enabled) {
                geofenceResult = { inside: true, distance: 0, centerLat: geofenceConfig.centerLat, centerLng: geofenceConfig.centerLng, radius: geofenceConfig.radius, skipped: true };
                return geofenceResult;
            }
            var R = 6371000;
            var dLat = (lat - geofenceConfig.centerLat) * Math.PI / 180;
            var dLng = (lng - geofenceConfig.centerLng) * Math.PI / 180;
            var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(geofenceConfig.centerLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                    Math.sin(dLng/2) * Math.sin(dLng/2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            var distance = R * c;
            geofenceResult = {
                inside: distance <= geofenceConfig.radius,
                distance: Math.round(distance),
                centerLat: geofenceConfig.centerLat,
                centerLng: geofenceConfig.centerLng,
                radius: geofenceConfig.radius,
                skipped: false
            };
            return geofenceResult;
        }

        function onAttendTypeChange(type, el) {
            attendType = type;
            document.querySelectorAll('.attend-type-tab').forEach(function(t){ t.classList.remove('selected','leave','trip'); });
            el.classList.add('selected');
            if (type === '请假') el.classList.add('leave');
            if (type === '出差') el.classList.add('trip');
            var isLeave = (type === '请假' || type === '出差');
            document.getElementById('attendNormalSection').style.display = isLeave ? 'none' : '';
            document.getElementById('attendLeaveSection').classList.toggle('visible', isLeave);
            document.getElementById('attendLeaveStatus').className = 'attend-leave-status';
            document.getElementById('attendLeaveStatus').style.display = 'none';
            if (isLeave) {
                document.getElementById('verifyBar').style.display = 'none';
                document.getElementById('attendSubmit').disabled = false;
                var reasonOk = document.getElementById('leaveReason').value.trim().length > 0;
                document.getElementById('attendSubmit').disabled = !reasonOk;
                document.getElementById('attendSubmit').textContent = '提交' + type;
                document.getElementById('attendLocation').textContent = attendLocation ? attendLocationText : '（可选，获取中...）';
                if (!document.getElementById('leaveStartDate').value) {
                    var todayStr = new Date().toISOString().substring(0, 10);
                    document.getElementById('leaveStartDate').value = todayStr;
                    document.getElementById('leaveEndDate').value = todayStr;
                }
            } else {
                document.getElementById('leaveStartDate').value = '';
                document.getElementById('leaveEndDate').value = '';
                document.getElementById('leaveReason').value = '';
                updateSubmitState();
            }
        }

        async function preCheckPermissions() {
            var result = {camera: 'prompt', geolocation: 'prompt'};
            if (navigator.permissions) {
                try {
                    var g = await navigator.permissions.query({name:'geolocation'});
                    result.geolocation = g.state;
                } catch(e) {}
                try {
                    var c = await navigator.permissions.query({name:'camera'});
                    result.camera = c.state;
                } catch(e) {}
            }
            if (result.geolocation === 'denied') {
                var locErr = '⚠ 定位权限已被浏览器拒绝，请在浏览器网站设置中开启定位权限';
                document.getElementById('locationStatus').innerHTML = locErr;
                document.getElementById('locationStatus').setAttribute('data-base', locErr);
                document.getElementById('locationStatus').className = 'attend-location-status error';
            }
            if (result.camera === 'denied') {
                document.getElementById('faceStatus').textContent = '⚠ 相机不可用，请用相册上传';
                document.getElementById('faceStatus').className = 'face-status unverified';
                document.getElementById('captureBtn').disabled = true;
                document.getElementById('cameraSwitchBtn').disabled = true;
                _cameraFallbackMode = true;
            }
            return result;
        }

        function confirmManualLocation() {
            var val = document.getElementById('manualLocationInput').value.trim();
            if (!val) return;
            _manualLocation = val;
            // 手动位置：无法精确判断围栏，设为忽略围栏
            if (geofenceConfig.enabled) {
                geofenceResult = { inside: true, distance: 0, centerLat: geofenceConfig.centerLat, centerLng: geofenceConfig.centerLng, radius: geofenceConfig.radius, skipped: true, manual: true };
            }
            document.getElementById('attendLocation').textContent = '手动: ' + val + (geofenceConfig.enabled ? ' | ⚠ 手动位置（未校验围栏）' : '');
                    var locMsg = '✓ 位置已手动确认';
                    document.getElementById('locationStatus').innerHTML = locMsg;
                    document.getElementById('locationStatus').setAttribute('data-base', locMsg);
            document.getElementById('locationStatus').className = 'attend-location-status got';
            gpsState = 'manual';
            document.getElementById('manualLocationSection').style.display = 'none';
            updateSubmitState();
        }

        function _handleFilePhoto(e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(ev) {
                attendPhoto = ev.target.result;
                document.getElementById('captureBtn').textContent = '📷';
                document.getElementById('faceStatus').textContent = 'ℹ 已通过相册上传照片';
                document.getElementById('faceStatus').className = 'face-status';
                faceDetected = null;
                updateSubmitState();
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        }

        function openAttendModal(presetType) {
            document.getElementById('attendOverlay').classList.add('show');
            document.getElementById('attendTime').textContent = new Date().toLocaleString('zh-CN');
            document.getElementById('attendSubmit').disabled = true;
            document.getElementById('attendLocation').textContent = '获取中...';
            var locGetting = '正在获取位置...';
            document.getElementById('locationStatus').className = 'attend-location-status getting';
            document.getElementById('locationStatus').innerHTML = locGetting;
            document.getElementById('locationStatus').setAttribute('data-base', locGetting);
            // Determine attendType from attendState
            if (presetType) {
                attendType = presetType;
            } else if (attendState && attendState.leaveRejected) {
                attendType = attendState.leaveRec.check_type === '出差' ? '出差' : '请假';
            } else if (attendState && attendState.checkIn && !attendState.checkOut && !attendState.leavePending && !attendState.leaveApproved) {
                attendType = '下班';
            } else {
                attendType = '上班';
            }
            // Reset UI
            var tabs = document.querySelectorAll('.attend-type-tab');
            tabs.forEach(function(t){ t.classList.remove('selected','leave','trip'); });
            tabs.forEach(function(t){
                if (t.getAttribute('data-type') === attendType) {
                    t.classList.add('selected');
                }
            });
            var isLeaveTab = (attendType === '请假' || attendType === '出差');
            document.getElementById('attendNormalSection').style.display = isLeaveTab ? 'none' : '';
            document.getElementById('attendLeaveSection').classList.toggle('visible', isLeaveTab);
            document.getElementById('attendLeaveStatus').className = 'attend-leave-status';
            document.getElementById('attendLeaveStatus').style.display = 'none';
            if (isLeaveTab) {
                document.getElementById('verifyBar').style.display = 'none';
                document.getElementById('attendSubmit').disabled = false;
                document.getElementById('attendSubmit').textContent = '提交' + attendType;
            }
            // Reset normal section
            document.getElementById('faceStatus').textContent = '📷 请拍摄人脸';
            document.getElementById('faceStatus').className = 'face-status';
            document.getElementById('faceIndicator').className = 'face-indicator';
            document.getElementById('captureBtn').textContent = '📷';
            document.getElementById('captureBtn').disabled = true;
            var retryBtn = document.getElementById('cameraRetryBtn');
            if (retryBtn) retryBtn.style.display = 'none';
            document.getElementById('cameraSwitchBtn').disabled = false;
            attendPhoto = null;
            faceDetected = false;
            _fingerVerified = false;
            _fingerVerifiedAt = null;
            _deviceFp = null;
            document.getElementById('fingerStatus').textContent = '检测中...';
            document.getElementById('fingerStatus').className = 'attend-finger-status unavailable';
            document.getElementById('fingerBtn').disabled = true;
            document.getElementById('fingerBtn').className = 'attend-finger-btn';
            document.getElementById('verifyBar').style.display = 'none';
            document.getElementById('vGps').className = 'v-item';
            document.getElementById('vGps').textContent = '📍 定位';
            document.getElementById('vFace').className = 'v-item';
            document.getElementById('vFace').textContent = '📷 人脸';
            document.getElementById('vFinger').className = 'v-item';
            document.getElementById('vFinger').textContent = '🔐 指纹';
            gpsState = 'fail';
            _manualLocation = null;
            _cameraFallbackMode = false;
            document.getElementById('manualLocationSection').style.display = 'none';
            document.getElementById('manualLocationInput').value = '';
            document.getElementById('fingerConfirmOverlay').style.display = 'none';
            preCheckPermissions();
            setTimeout(verifyFingerprint, 400);
            // Start camera
            if (!_cameraFallbackMode) startCamera();
            // Start GPS
            getLocation();
            // Update time every second
            window._attendTimer = setInterval(function(){
                document.getElementById('attendTime').textContent = new Date().toLocaleString('zh-CN');
            }, 1000);
        }

        function closeAttendModal() {
            document.getElementById('attendOverlay').classList.remove('show');
            stopCamera();
            clearInterval(window._attendTimer);
            if (window.parent && window.parent.fetchAttendance) window.parent.fetchAttendance();
        }

        var _cameraZoom = 0.8;
        var _cameraResLevel = 0;
        var _cameraResolutions = [
            {width:{ideal:1280},height:{ideal:720}},
            {width:{ideal:640},height:{ideal:480}},
            {width:{ideal:320},height:{ideal:240}}
        ];

        function startCamera() {
            _cameraZoom = 0.8;
            var v = document.getElementById('attendVideo');
            if (v) v.style.transform = 'scale(1)';
            var retryBtn = document.getElementById('cameraRetryBtn');
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                document.getElementById('faceStatus').textContent = '⚠ 相机不可用';
                document.getElementById('faceStatus').className = 'face-status';
                document.getElementById('captureBtn').disabled = true;
                document.getElementById('cameraSwitchBtn').disabled = true;
                return;
            }
            _cameraResLevel = 0;
            _tryCamera(v, retryBtn);
        }

        function _showCameraHelp() {
            var s = document.getElementById('faceStatus');
            if (_isMobile) {
                s.innerHTML = '⚠ 相机不可用：浏览器相机权限未允许，请在浏览器设置中开启相机后重试';
            } else {
                s.innerHTML = '⚠ 相机不可用，请在浏览器网站设置中允许摄像头权限后重试';
            }
            s.className = 'face-status unverified';
            _cameraFallbackMode = true;
            document.getElementById('captureBtn').disabled = false;
            document.getElementById('captureBtn').textContent = '📁';
        }

        function _tryCamera(v, retryBtn) {
            if (_cameraResLevel >= _cameraResolutions.length) {
                _showCameraHelp();
                document.getElementById('cameraSwitchBtn').disabled = true;
                if (retryBtn) retryBtn.style.display = 'block';
                return;
            }
            var res = _cameraResolutions[_cameraResLevel];
            var constraints = {video:Object.assign({}, res, {facingMode:_cameraFacingMode}), audio:false};
            navigator.mediaDevices.getUserMedia(constraints)
                .then(function(stream){
                    cameraStream = stream;
                    v.srcObject = stream;
                    v.style.display = 'block';
                    v.setAttribute('playsinline', '');
                    v.setAttribute('muted', '');
                    document.getElementById('captureBtn').disabled = false;
                    document.getElementById('cameraSwitchBtn').disabled = false;
                    document.getElementById('faceStatus').textContent = '📷 请拍摄人脸';
                    document.getElementById('faceStatus').className = 'face-status';
                    if (retryBtn) retryBtn.style.display = 'none';
                })
                .catch(function(err){
                    if (_cameraResLevel === 0 && err.name === 'NotAllowedError') {
                        _showCameraHelp();
                        document.getElementById('cameraSwitchBtn').disabled = true;
                        if (retryBtn) retryBtn.style.display = 'block';
                        return;
                    }
                    _cameraResLevel++;
                    _tryCamera(v, retryBtn);
                });
        }

        function switchCamera() {
            _cameraFacingMode = (_cameraFacingMode === 'user') ? 'environment' : 'user';
            _cameraZoom = 0.8;
            stopCamera();
            document.getElementById('faceStatus').textContent = '🔄 切换中...';
            document.getElementById('captureBtn').disabled = true;
            document.getElementById('cameraSwitchBtn').disabled = true;
            startCamera();
        }

        function retryCamera() {
            _cameraZoom = 0.8;
            document.getElementById('faceStatus').textContent = '📷 正在重新连接相机...';
            document.getElementById('faceStatus').className = 'face-status';
            document.getElementById('cameraRetryBtn').style.display = 'none';
            if (cameraStream) { cameraStream.getTracks().forEach(function(t){t.stop()}); cameraStream = null; }
            startCamera();
        }

        function stopCamera() {
            if (cameraStream) {
                cameraStream.getTracks().forEach(function(t){t.stop()});
                cameraStream = null;
            }
            var v = document.getElementById('attendVideo');
            if (v) v.style.display = 'none';
        }

        var _gpsRetried = false;
        var _isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        function getLocation() {
            if (!navigator.geolocation) {
                document.getElementById('attendLocation').textContent = '不支持';
                var locErr = '⚠ 浏览器不支持定位';
                document.getElementById('locationStatus').innerHTML = locErr;
                document.getElementById('locationStatus').setAttribute('data-base', locErr);
                document.getElementById('locationStatus').className = 'attend-location-status error';
                gpsState = 'fail';
                updateSubmitState();
                return;
            }
            document.getElementById('attendLocation').innerHTML = '获取中... <a href="javascript:void(0)" onclick="getLocation()" style="color:#00d4ff;font-size:0.82em">重试</a>';
            var locGetting = '正在获取位置...';
            document.getElementById('locationStatus').innerHTML = locGetting;
            document.getElementById('locationStatus').setAttribute('data-base', locGetting);
            document.getElementById('locationStatus').className = 'attend-location-status getting';
            _gpsRetried = false;
            _getLocationOnce(true);
        }

        function _showGpsHelp() {
            var loc = document.getElementById('locationStatus');
            var locErrMsg = _isMobile ? '⚠ 定位失败：浏览器位置权限未允许' : '⚠ 定位失败，请在浏览器网站设置中允许位置权限后重试';
            loc.innerHTML = locErrMsg;
            loc.setAttribute('data-base', locErrMsg);
            loc.className = 'attend-location-status error';
        }

        function _getLocationByIP() {
            document.getElementById('attendLocation').innerHTML = 'IP定位中...';
            var locGettingIP = '正在通过IP获取位置...';
            document.getElementById('locationStatus').innerHTML = locGettingIP;
            document.getElementById('locationStatus').setAttribute('data-base', locGettingIP);
            document.getElementById('locationStatus').className = 'attend-location-status getting';
            var _tk = localStorage.getItem("NOCOBASE_TOKEN") || localStorage.getItem("nocobase_token");
            var _hd = { 'Content-Type': 'application/json' };
            if (_tk) _hd['Authorization'] = 'Bearer ' + _tk;
            fetch('/geofence/locate', { headers: _hd })
                .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
                .then(function(data){
                    if (data && data.status === '1' && data.rectangle) {
                        var parts = data.rectangle.split(';');
                        var sw = parts[0].split(',');
                        var ne = parts[1].split(',');
                        var lat = (parseFloat(sw[1]) + parseFloat(ne[1])) / 2;
                        var lng = (parseFloat(sw[0]) + parseFloat(ne[0])) / 2;
                        attendLocation = {lat: lat, lng: lng, accuracy: null};
                        gpsState = 'ip';
                        var gf = checkGeofence(lat, lng);
                        var gfLabel = gf.inside ? '✅ 围栏内' : '❌ 围栏外';
                        attendLocationText = 'IP定位: ' + (data.city || data.province || '') + ' | ' + gfLabel;
                        document.getElementById('attendLocation').textContent = attendLocationText;
                        var locMsg = '✓ IP定位成功（城市级精度）';
                        document.getElementById('locationStatus').innerHTML = locMsg;
                        document.getElementById('locationStatus').setAttribute('data-base', locMsg);
                        document.getElementById('locationStatus').className = 'attend-location-status got';
                        document.getElementById('manualLocationSection').style.display = 'none';
                        checkPolylineGeofence(lat, lng).then(function(){ updateSubmitState(); }).catch(function(){ updateSubmitState(); });
                    } else {
                        _showGpsHelp();
                        document.getElementById('manualLocationSection').style.display = 'block';
                        updateSubmitState();
                    }
                })
                .catch(function(){
                    _showGpsHelp();
                    document.getElementById('manualLocationSection').style.display = 'block';
                    updateSubmitState();
                });
        }

        function _getLocationOnce(highAccuracy) {
            navigator.geolocation.getCurrentPosition(
                function(pos){
                    var rawLat = pos.coords.latitude, rawLng = pos.coords.longitude;
                    var gcj = wgs84ToGcj02(rawLat, rawLng);
                    attendLocation = {
                        lat: gcj[0],
                        lng: gcj[1],
                        accuracy: pos.coords.accuracy
                    };
                    gpsState = 'ok';
                    var acc = Math.round(pos.coords.accuracy);
                    var accLabel = '';
                    if (acc < 5) accLabel = '（高精度）';
                    else if (acc < 50) accLabel = '（一般）';
                    else accLabel = '（精度低）';
                    document.getElementById('attendLocation').textContent = gcj[0].toFixed(5) + ',' + gcj[1].toFixed(5) + ' ±' + acc + 'm ' + accLabel;
                    var locMsg = '✓ 位置已获取';
                    document.getElementById('locationStatus').innerHTML = locMsg;
                    document.getElementById('locationStatus').setAttribute('data-base', locMsg);
                    document.getElementById('locationStatus').className = 'attend-location-status got';
                    checkPolylineGeofence(gcj[0], gcj[1]).then(function(){ updateSubmitState(); }).catch(function(){ updateSubmitState(); });
                    if (attendType === '请假' || attendType === '出差') {
                        // Keep optional status
                    }
                },
                function(err){
                    if (highAccuracy && (err.code === 2 || err.code === 3) && !_gpsRetried) {
                        _gpsRetried = true;
                        document.getElementById('attendLocation').innerHTML = '降级定位中...';
                        _getLocationOnce(false);
                        return;
                    }
                    attendLocation = null;
                    gpsState = 'fail';
                    var msg = '获取失败';
                    if (err.code === 1) msg = '权限被拒绝';
                    else if (err.code === 2) msg = '位置不可用';
                    else if (err.code === 3) msg = '获取超时';
                    document.getElementById('attendLocation').innerHTML = msg + ' <a href="javascript:void(0)" onclick="getLocation()" style="color:#00d4ff;font-size:0.82em">重试</a>';
                    _getLocationByIP();
                },
                {enableHighAccuracy:highAccuracy, timeout:15000, maximumAge:5000}
            );
        }

        function capturePhoto() {
            var v = document.getElementById('attendVideo');
            var c = document.getElementById('attendCanvas');
            if (!v || !v.videoWidth) {
                if (_cameraFallbackMode || !cameraStream) {
                    document.getElementById('cameraFileInput').click();
                }
                return;
            }
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            var ctx = c.getContext('2d');
            if (_cameraZoom > 1) {
                var cw = v.videoWidth / _cameraZoom;
                var ch = v.videoHeight / _cameraZoom;
                var cx = (v.videoWidth - cw) / 2;
                var cy = (v.videoHeight - ch) / 2;
                ctx.drawImage(v, cx, cy, cw, ch, 0, 0, c.width, c.height);
            } else {
                ctx.drawImage(v, 0, 0);
            }
            attendPhoto = c.toDataURL('image/jpeg', 0.92);
            document.getElementById('captureBtn').textContent = '✓';
            detectFace(c);
        }

        async function detectFace(canvas) {
            document.getElementById('faceStatus').textContent = '🔍 检测人脸中...';
            document.getElementById('faceStatus').className = 'face-status';
            faceDetected = false;
            // Brightness check
            try {
                var ctx = canvas.getContext('2d');
                var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                var pixels = imageData.data;
                var total = 0;
                for (var k = 0; k < pixels.length; k += 4) {
                    total += 0.299 * pixels[k] + 0.587 * pixels[k+1] + 0.114 * pixels[k+2];
                }
                var avgBrightness = total / (pixels.length / 4);
                if (avgBrightness < 40) {
                    document.getElementById('faceStatus').textContent = '⚠ 环境过暗，建议补光后重拍';
                    document.getElementById('faceStatus').className = 'face-status unverified';
                    updateSubmitState();
                    return;
                }
            } catch(e) {}
            // FaceDetector API
            if (typeof FaceDetector !== 'undefined') {
                try {
                    var detector = new FaceDetector({fastMode:true});
                    var faces = await detector.detect(canvas);
                    if (faces.length > 0) {
                        faceDetected = true;
                        document.getElementById('faceStatus').textContent = '✓ 已检测到人脸 (' + faces.length + '人)';
                        document.getElementById('faceStatus').className = 'face-status verified';
                        document.getElementById('faceIndicator').className = 'face-indicator verified';
                        // Draw face boxes
                        var ctx = canvas.getContext('2d');
                        ctx.strokeStyle = '#00ff88';
                        ctx.lineWidth = 3;
                        for (var f = 0; f < faces.length; f++) {
                            var box = faces[f].boundingBox;
                            ctx.strokeRect(box.x, box.y, box.width, box.height);
                        }
                    } else {
                        document.getElementById('faceStatus').textContent = '⚠ 未检测到人脸，请重新拍摄';
                        document.getElementById('faceStatus').className = 'face-status unverified';
                        document.getElementById('faceIndicator').className = 'face-indicator unverified';
                    }
                } catch(e) {
                    document.getElementById('faceStatus').textContent = '📷 已拍照';
                    document.getElementById('faceStatus').className = 'face-status';
                    faceDetected = null;
                }
            } else {
                document.getElementById('faceStatus').textContent = '📷 已拍照';
                document.getElementById('faceStatus').className = 'face-status';
                faceDetected = null;
            }
            updateSubmitState();
        }

        function updateSubmitState() {
            var btn = document.getElementById('attendSubmit');
            var bar = document.getElementById('verifyBar');
            var vGps = document.getElementById('vGps');
            var vFace = document.getElementById('vFace');
            var vFinger = document.getElementById('vFinger');
            var vFence = document.getElementById('vFence');

            var isLeave = (attendType === '请假' || attendType === '出差');
            if (isLeave) {
                bar.style.display = 'none';
                btn.textContent = '提交' + attendType;
                var reasonVal = document.getElementById('leaveReason').value.trim();
                btn.disabled = reasonVal.length === 0;
                return;
            }

            bar.style.display = 'flex';
            var faceOk = (faceDetected === true);
            var fingerOk = _fingerVerified;
            var fenceOk = true;

            var gpsOk = (gpsState === 'ok' || gpsState === 'manual' || gpsState === 'ip');
            var gpsClass = gpsOk ? 'ok' : 'fail';
            vGps.className = 'v-item ' + gpsClass;
            vGps.textContent = gpsOk ? (gpsState === 'manual' ? '📍 定位（手动）✓' : gpsState === 'ip' ? '📍 IP定位 ✓' : '📍 定位 ✓') : '📍 定位 ✗';

            // 围栏状态（仅使用折线围栏结果），追加到位置信息末尾
            var pgr = __polylineGeofenceResult;
            var locEl = document.getElementById('locationStatus');
            var baseLoc = locEl.getAttribute('data-base') || locEl.innerHTML;
            if (pgr && pgr.matched) {
                vFence.style.display = '';
                var ratio = pgr.distance / pgr.bufferRadius;
                var fenceLabel, fenceColor;
                if (pgr.inside && ratio <= 0.5) {
                    vFence.className = 'v-item ok';
                    vFence.textContent = '📍 ' + pgr.fenceName + ' ✓ (' + pgr.distance + '/' + pgr.bufferRadius + 'm)';
                    fenceOk = true;
                    fenceLabel = '✅ ' + pgr.fenceName + ' (' + pgr.distance + '/' + pgr.bufferRadius + 'm)';
                    fenceColor = '#00ff88';
                } else if (pgr.inside && ratio <= 1.0) {
                    vFence.className = 'v-item warn';
                    vFence.textContent = '📍 ' + pgr.fenceName + ' ⚠ 距边界' + Math.round(pgr.bufferRadius - pgr.distance) + 'm (' + pgr.distance + '/' + pgr.bufferRadius + 'm)';
                    fenceOk = true;
                    fenceLabel = '⚠️ ' + pgr.fenceName + ' 接近边界 (' + pgr.distance + '/' + pgr.bufferRadius + 'm)';
                    fenceColor = '#ffaa00';
                } else if (!pgr.inside && ratio <= 2.0) {
                    vFence.className = 'v-item fail';
                    vFence.textContent = '📍 ' + pgr.fenceName + ' ✗ ' + pgr.distance + 'm（超缓冲区' + (pgr.distance - pgr.bufferRadius) + 'm）';
                    fenceOk = false;
                    fenceLabel = '❌ ' + pgr.fenceName + ' ' + pgr.distance + 'm（超' + (pgr.distance - pgr.bufferRadius) + 'm）';
                    fenceColor = '#ff6b6b';
                } else {
                    vFence.className = 'v-item fail';
                    vFence.textContent = '📍 ' + pgr.fenceName + ' ❌ 远离围栏 ' + pgr.distance + 'm';
                    fenceOk = false;
                    fenceLabel = '❌ ' + pgr.fenceName + ' ' + pgr.distance + 'm（远离）';
                    fenceColor = '#cc4444';
                }
                locEl.innerHTML = baseLoc + ' <span style="color:' + fenceColor + '">| ' + fenceLabel + '</span>';
            } else if (pgr && !pgr.matched && pgr.fenceId === null) {
                vFence.style.display = 'none';
                locEl.innerHTML = baseLoc;
                fenceOk = true;
            } else {
                vFence.style.display = 'none';
                locEl.innerHTML = baseLoc + ' <span style="color:#5a6a7a">| ⏳ 围栏检测中...</span>';
                fenceOk = true;
            }

            if (faceDetected === true) { vFace.className = 'v-item ok'; vFace.textContent = '📷 人脸 ✓'; }
            else if (faceDetected === null) { vFace.className = 'v-item ok'; vFace.textContent = '📷 已拍照'; }
            else if (!attendPhoto) { vFace.className = 'v-item need'; vFace.textContent = '📷 人脸 ○'; }
            else { vFace.className = 'v-item fail'; vFace.textContent = '📷 人脸 ✗'; }

            if (fingerOk) { vFinger.className = 'v-item ok'; vFinger.textContent = '🔐 指纹 ✓'; }
            else { vFinger.className = 'v-item need'; vFinger.textContent = '🔐 指纹 ○'; }

            if (gpsOk && fenceOk) {
                if (faceOk || fingerOk || attendPhoto) {
                    btn.disabled = false;
                    btn.textContent = '确认打卡';
                } else {
                    btn.disabled = true;
                    btn.textContent = '请完成拍照或指纹验证';
                }
            } else if (!gpsOk && fenceOk) {
                if (faceOk && fingerOk) {
                    btn.disabled = false;
                    btn.textContent = '确认打卡（GPS异常，双因子验证）';
                } else {
                    btn.disabled = true;
                    var missing = [];
                    if (!faceOk) missing.push('拍照');
                    if (!fingerOk) missing.push('指纹');
                    btn.textContent = 'GPS异常，需完成：' + missing.join('+');
                }
             } else if (gpsOk && !fenceOk) {
                 btn.disabled = true;
                 var fenceDist = (pgr && pgr.distance) ? pgr.distance : '?';
                 btn.textContent = '⛔ 不在打卡围栏内（距围栏 ' + fenceDist + 'm）';
             } else {
                 btn.disabled = true;
                 btn.textContent = '⛔ GPS异常且不在围栏内';
             }
        }

        // Fingerprint with custom confirm dialog
        async function verifyFingerprint() {
            var s = document.getElementById('fingerStatus');
            var b = document.getElementById('fingerBtn');
            b.disabled = true;
            b.textContent = '验证中...';
            _fingerVerified = false;
            _deviceFp = null;

            // Build enhanced device fingerprint
            var fpData = navigator.userAgent + '|' + screen.width + 'x' + screen.height + '|' +
                         (navigator.hardwareConcurrency||'') + '|' + (navigator.deviceMemory||'') + '|' +
                         Intl.DateTimeFormat().resolvedOptions().timeZone + '|' +
                         (navigator.languages||[]).join(',') + '|' +
                         (navigator.plugins ? navigator.plugins.length : '0');

            // Try SHA-256 via SubtleCrypto
            try {
                var enc = new TextEncoder();
                var hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(fpData));
                var hashArr = Array.from(new Uint8Array(hashBuf));
                var hex = hashArr.map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
                _deviceFp = 'dev_' + hex.substring(0, 16);
            } catch(e) {
                // Fallback to DJB2
                var fpHash = 0;
                for (var i = 0; i < fpData.length; i++) { fpHash = ((fpHash << 5) - fpHash) + fpData.charCodeAt(i); fpHash |= 0; }
                _deviceFp = 'dev_' + Math.abs(fpHash).toString(36);
            }

            // Check localStorage for quick re-verify
            var stored = localStorage.getItem('_attendDeviceId');
            if (stored === _deviceFp) {
                _fingerVerified = true;
                _fingerVerifiedAt = Date.now();
                s.textContent = '✓ 本机已验证（快速）';
                s.className = 'attend-finger-status verified';
                b.textContent = '✓ 已验证';
                b.className = 'attend-finger-btn verified';
                updateSubmitState();
                return;
            }

            // Show custom confirm dialog
            b.textContent = '请确认';
            document.getElementById('fingerDeviceId').textContent = _deviceFp.substring(0, 16) + '...';
            var o = document.getElementById('fingerConfirmOverlay');
            o.style.display = 'flex';
            o.style.position = 'fixed';
            o.style.top = '0';
            o.style.left = '0';
            o.style.width = '100%';
            o.style.height = '100%';
            o.style.zIndex = '9999';
            o.style.background = 'rgba(0,0,0,0.5)';
            o.style.alignItems = 'center';
            o.style.justifyContent = 'center';
        }

        function confirmFingerprint(confirmed) {
            document.getElementById('fingerConfirmOverlay').style.display = 'none';
            var s = document.getElementById('fingerStatus');
            var b = document.getElementById('fingerBtn');
            if (confirmed) {
                _fingerVerified = true;
                _fingerVerifiedAt = Date.now();
                s.textContent = '✓ 本机设备已验证';
                s.className = 'attend-finger-status verified';
                b.textContent = '✓ 已验证';
                b.className = 'attend-finger-btn verified';
                localStorage.setItem('_attendDeviceId', _deviceFp);
            } else {
                s.textContent = '验证已取消';
                s.className = 'attend-finger-status unavailable';
                b.textContent = '重试';
                b.disabled = false;
                b.className = 'attend-finger-btn';
            }
            updateSubmitState();
        }

        async function computePhotoHash(dataUrl) {
            var hashInput = dataUrl.substring(dataUrl.length - 500);
            try {
                var enc = new TextEncoder();
                var hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(hashInput));
                var hashArr = Array.from(new Uint8Array(hashBuf));
                var hex = hashArr.map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
                return 'ph_' + hex.substring(0, 8);
            } catch(e) {
                var hashVal = 0;
                for (var i = 0; i < hashInput.length; i++) { hashVal = ((hashVal << 5) - hashVal) + hashInput.charCodeAt(i); hashVal |= 0; }
                return 'ph_' + Math.abs(hashVal).toString(16);
            }
        }

        async function submitAttendance() {
            var btn = document.getElementById('attendSubmit');
            btn.disabled = true;
            btn.textContent = '提交中...';
            try {
                var now = new Date();
                var isLeave = (attendType === '请假' || attendType === '出差');
                var body = {
                    check_type: attendType,
                    check_time: now.toISOString(),
                    gps_state: gpsState
                };

                // 地理围栏信息
                var pgr = __polylineGeofenceResult;
                if (pgr && pgr.matched) {
                    body.geofence_inside = pgr.inside;
                    body.geofence_distance = pgr.distance;
                    body.geofence_id = pgr.fenceId;
                }

                // Location (always include if available)
                if (attendLocation) {
                    body.latitude = attendLocation.lat;
                    body.longitude = attendLocation.lng;
                    body.gps_accuracy = Math.round(attendLocation.accuracy);
                } else if (_manualLocation) {
                    body.manual_location = _manualLocation;
                }

                if (isLeave) {
                    // Leave/travel submission
                    body.reason = document.getElementById('leaveReason').value.trim();
                    var sd = document.getElementById('leaveStartDate').value;
                    var ed = document.getElementById('leaveEndDate').value;
                    if (sd && ed && sd > ed) {
                        btn.textContent = '✗ 开始日期不能晚于结束日期';
                        btn.disabled = false;
                        return;
                    }
                    body.start_date = sd || now.toISOString();
                    body.end_date = ed || now.toISOString();
                    body.workflow_status = 'pending';
                    body.verify_status = 'leave_auto';
                } else {
                    // Normal check-in/out
                    var methods = [];
                    if (gpsState === 'ok') methods.push('gps');
                    else if (gpsState === 'ip') methods.push('ip_location');
                    else if (gpsState === 'manual') methods.push('manual_location');
                    if (faceDetected === true) methods.push('face');
                    else if (faceDetected === false) methods.push('face_fail');
                    else if (attendPhoto) methods.push('photo_only');
                    if (_fingerVerified) methods.push('finger');
                    body.verify_status = methods.join('+');

                    var reasons = [];
                    if (gpsState !== 'ok' && gpsState !== 'ip' && gpsState !== 'manual') reasons.push('GPS定位异常');
                    if (faceDetected === false && attendPhoto) reasons.push('人脸检测失败');
                    if (!_fingerVerified && gpsState !== 'ok' && gpsState !== 'ip' && gpsState !== 'manual') reasons.push('未完成双因子验证');
                    var pgr = __polylineGeofenceResult;
                    if (pgr && pgr.matched && !pgr.inside) {
                        reasons.push('围栏外打卡(距' + pgr.fenceName + ' ' + pgr.distance + '米)');
                    }
                    body.anomaly_reason = reasons.join('; ') || null;

                    if (_deviceFp && _fingerVerified) {
                        body.device_fingerprint = _deviceFp;
                    }
                    if (_fingerVerifiedAt) {
                        body.fingerprint_verified_at = new Date(_fingerVerifiedAt).toISOString();
                    }
                    // Photo hash (always)
                    if (attendPhoto) {
                        body.photo_hash = await computePhotoHash(attendPhoto);
                    }
                    // Fallback device fingerprint
                    if (!body.device_fingerprint) {
                        body.device_fingerprint = navigator.userAgent.substring(0, 200) + '|' + screen.width + 'x' + screen.height;
                    }
                }

                var _token = localStorage.getItem("NOCOBASE_TOKEN") || localStorage.getItem("nocobase_token");
                var _headers = { 'Content-Type': 'application/json' };
                if (_token) _headers['Authorization'] = 'Bearer ' + _token;
                
                var allowedFields = [
                    'check_type', 'check_time', 'gps_state', 'latitude', 'longitude', 'gps_accuracy',
                    'manual_location', 'geofence_inside', 'geofence_distance', 'geofence_id',
                    'verify_status', 'anomaly_reason', 'device_fingerprint', 'fingerprint_verified_at',
                    'photo_hash', 'reason', 'start_date', 'end_date', 'workflow_status'
                ];
                var filteredBody = {};
                for (var key in body) {
                    if (body.hasOwnProperty(key) && allowedFields.indexOf(key) !== -1) {
                        filteredBody[key] = body[key];
                    }
                }
                
                var r = await fetch('/api/attendance_records:create', {
                    method: 'POST', credentials: 'include',
                    headers: _headers,
                    body: JSON.stringify(filteredBody)
                });
                if (r.ok) {
                    if (isLeave) {
                        btn.textContent = '✅ 已提交，等待审批';
                        btn.style.background = 'linear-gradient(135deg, #ffd93d, #f39c12)';
                        btn.disabled = true;
                        document.getElementById('attendLeaveStatus').textContent = '✅ 已提交审批申请，请等待审批人处理';
                        document.getElementById('attendLeaveStatus').className = 'attend-leave-status pending';
                    } else {
                        btn.textContent = '✓ 打卡成功！';
                        btn.style.background = 'linear-gradient(135deg, #00ff88, #00b86b)';
                        setTimeout(closeAttendModal, 1200);
                    }
                    if (window.parent && window.parent.fetchAttendance) window.parent.fetchAttendance();
                } else {
                    var errData = await r.json().catch(function(){return {error: '无法解析错误响应'};});
                    var errMsg = (errData && (errData.errors || errData.error || JSON.stringify(errData))) || 'HTTP ' + r.status;
                    if (typeof errMsg === 'object') errMsg = JSON.stringify(errMsg);
                    btn.textContent = '✗ ' + errMsg.substring(0, 60) + (errMsg.length > 60 ? '...' : '');
                    btn.disabled = false;
                    console.error('Attendance failed:', errData);
                }
            } catch(e) {
                btn.textContent = '✗ 网络错误，重试';
                btn.disabled = false;
                console.error('Attendance error:', e);
            }
        }

        // Overlay click to close
        document.addEventListener('DOMContentLoaded', function(){
            var ov = document.getElementById('attendOverlay');
            if (ov) {
                ov.addEventListener('click', function(e){
                    if (e.target === ov) closeAttendModal();
                });
            }
            var reasonInput = document.getElementById('leaveReason');
            if (reasonInput) {
                reasonInput.addEventListener('input', function(){
                    if (attendType === '请假' || attendType === '出差') {
                        document.getElementById('attendSubmit').disabled = this.value.trim().length === 0;
                    }
                });
            }
            var fileInput = document.getElementById('cameraFileInput');
            if (fileInput) {
                fileInput.addEventListener('change', _handleFilePhoto);
            }
        });





                 // 全屏切换