let sourceIndex = 0;
let rpCancel = false, rpTimer = null;

function doRoadPatrol(frame) {
    rpCancel = false;
    const hf = document.createElement('iframe');
    hf.name = 'rpLogin'; hf.style.display = 'none';
    document.body.appendChild(hf);
    const eps = [
        { url: RP.base + '/api/user/login', fields: { username: RP.user, password: RP.pass } },
        { url: RP.base + '/api/login',      fields: { username: RP.user, password: RP.pass } },
        { url: RP.base + '/user/login',     fields: { username: RP.user, password: RP.pass } },
    ];
    eps.forEach(ep => {
        const form = document.createElement('form');
        form.method = 'POST'; form.action = ep.url; form.target = 'rpLogin';
        form.style.display = 'none';
        Object.entries(ep.fields).forEach(([k, v]) => {
            const inp = document.createElement('input');
            inp.name = k; inp.value = v; form.appendChild(inp);
        });
        document.body.appendChild(form); form.submit(); form.remove();
    });
    fetch(RP.base + '/api/getToken', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: RP.user, clientSecret: RP.pass })
    }).catch(() => {});
    rpTimer = setTimeout(() => {
        if (rpCancel) return;
        hf.remove(); frame.src = EXTERN_URLS[sourceIndex].url;
    }, 500);
}

function loadSource(idx) {
    sourceIndex = ((idx % EXTERN_URLS.length) + EXTERN_URLS.length) % EXTERN_URLS.length;
    rpCancel = true; clearTimeout(rpTimer);
    const frame = document.getElementById('externFrame');
    frame.setAttribute('sandbox', sourceIndex === 1
        ? 'allow-scripts allow-forms allow-same-origin allow-popups'
        : 'allow-scripts allow-forms allow-same-origin');
    if (sourceIndex === 0 || sourceIndex === 1) { doRoadPatrol(frame); }
    else { frame.src = EXTERN_URLS[sourceIndex].url; }
    document.getElementById('sourceLabel').textContent = `${EXTERN_URLS[sourceIndex].label} ${sourceIndex+1}/${EXTERN_URLS.length}`;
}

function prevSource() { loadSource(sourceIndex - 1); }
function nextSource() { loadSource(sourceIndex + 1); }

let isAdmin = false;
async function checkAdmin() {
    try {
        const resp = await fetch('/api/users:check', { credentials: 'include' });
        if (resp.ok) {
            const data = await resp.json();
            const roles = data.data?.roles || [];
            isAdmin = roles.some(r => ['admin','superadmin','root'].includes(r.name));
        }
    } catch {}
    renderWorks();
}

function renderWorks() {
    const grid = document.getElementById('worksGrid');
    grid.innerHTML = '';
    workSections.forEach(s => {
        if (s.adminOnly && !isAdmin) return;
        const g = document.createElement('div');
        g.className = 'work-group';
        g.style.cssText = `background:${s.bg};border-color:${s.border}`;
        const t = document.createElement('div');
        t.className = 'group-title'; t.style.color = s.color; t.textContent = s.title;
        g.appendChild(t);
        const l = document.createElement('div'); l.className = 'btn-list';
        s.items.forEach(item => {
            const a = document.createElement('a');
            a.className = 'btn-item';
            a.href = 'javascript:void(0)';
            a.onclick = function() { openDrawer(item.url, item.label); };
            a.style.cssText = `background:${s.btnBg};border-color:${s.btnBorder};color:${s.btnColor}`;
            a.textContent = item.label;
            l.appendChild(a);
        });
        g.appendChild(l);
        grid.appendChild(g);
    });
}

// 待办
async function fetchTodos() {
    const p = document.getElementById('pendingCount');
    const n = document.getElementById('notifyCount');
    try {
        const r = await fetch('/api/flow_nodes:list?filter[status]=pending&pageSize=1', { credentials:'include' });
        p.textContent = r.ok ? ((await r.json()).meta?.total ?? '0') : '0';
    } catch { p.textContent = '0'; }
    try {
        const r = await fetch('/api/notifications:list?filter[read]=false&pageSize=1', { credentials:'include' });
        n.textContent = r.ok ? ((await r.json()).meta?.total ?? '0') : '0';
    } catch { n.textContent = '0'; }
}

// 公司公告
async function fetchAnnouncements() {
    const track = document.getElementById('announceTrack');
    try {
        const r = await fetch(
            '/api/announcements:list?filter[status]=published&filter[archived__ne]=true&sort=-publishedAt,-createdAt&pageSize=8',
            { credentials: 'include' }
        );
        if (!r.ok) throw Error();
        const data = await r.json();
        const items = data.data || [];
        track.innerHTML = '';
        if (!items.length) {
            track.innerHTML = '<div class="announce-item" style="text-align:center;color:#5a6a7a;border:none;background:none;">暂无公告</div>';
            track.classList.remove('scrolling');
            return;
        }
        const render = (list) => list.forEach(item => {
            const div = document.createElement('div');
            div.className = 'announce-item';
            const ts = item.publishedAt || item.createdAt || '';
            const date = ts ? new Date(ts).toLocaleDateString('zh-CN', { month:'2-digit', day:'2-digit' }) : '';
            div.innerHTML = `<span class="a-time">${date}</span>${item.title || item.name || '(无标题)'}`;
            track.appendChild(div);
        });
        render(items);
        render(items);
        track.classList.add('scrolling');
    } catch {
        track.innerHTML = '<div class="announce-item" style="text-align:center;color:#5a6a7a;border:none;background:none;">加载失败</div>';
        track.classList.remove('scrolling');
    }
}

// 全屏切换
var _zoomScale = 1;
function zoomFrame(delta, reset) {
    if (reset) _zoomScale = 1;
    else _zoomScale = Math.max(0.3, Math.min(3, _zoomScale + delta));
    var f = document.getElementById('externFrame');
    f.style.transform = 'scale(' + _zoomScale + ')';
    f.style.transformOrigin = 'center center';
    document.getElementById('zoomPct').textContent = Math.round(_zoomScale * 100) + '%';
}
function toggleFullscreen() {
    var wrap = document.querySelector('.stage-frame-wrap');
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        (wrap.requestFullscreen || wrap.webkitRequestFullscreen).call(wrap);
    } else {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        _zoomScale = 1;
        document.getElementById('externFrame').style.transform = '';
        document.getElementById('zoomPct').textContent = '100%';
    }
}

(function(){
    var wrap = document.querySelector('.stage-frame-wrap');
    if (!wrap) return;
    var shim = document.createElement('div');
    shim.id = 'wheelShim';
    shim.style.cssText = 'position:absolute;inset:0;z-index:5;background:transparent;';
    var frame = wrap.querySelector('iframe');
    if (frame) wrap.insertBefore(shim, frame);
    shim.addEventListener('wheel', function(e) {
        e.preventDefault();
        window.scrollBy({top: e.deltaY, behavior: 'auto'});
    }, {passive: false});
    shim.addEventListener('mousedown', function() {
        shim.style.pointerEvents = 'none';
        clearTimeout(shim._timer);
        shim._timer = setTimeout(function(){ shim.style.pointerEvents = 'auto'; }, 300);
    });
    shim.addEventListener('mouseup', function() {
        shim.style.pointerEvents = 'none';
        clearTimeout(shim._timer);
        shim._timer = setTimeout(function(){ shim.style.pointerEvents = 'auto'; }, 300);
    });
    document.addEventListener('fullscreenchange', function(){
        var fs = !!document.fullscreenElement;
        document.getElementById('zoomBar').style.display = fs ? 'flex' : 'none';
        var s = document.getElementById('wheelShim');
        if (s) s.style.pointerEvents = fs ? 'none' : 'auto';
    });
    document.addEventListener('webkitfullscreenchange', function(){
        var fs = !!document.webkitFullscreenElement;
        document.getElementById('zoomBar').style.display = fs ? 'flex' : 'none';
        var s = document.getElementById('wheelShim');
        if (s) s.style.pointerEvents = fs ? 'none' : 'auto';
    });
})();

// 农历 / 节气 / 天气
const lunarMonths = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
const lunarDays = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
                  '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
                  '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
const solarTerms = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨',
                   '立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑',
                   '白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
const solarTermsDate = [
    [1,6],[1,20],[2,4],[2,19],[3,6],[3,21],[4,5],[4,20],
    [5,6],[5,21],[6,6],[6,21],[7,7],[7,23],[8,7],[8,23],
    [9,8],[9,23],[10,8],[10,23],[11,7],[11,22],[12,7],[12,22]
];
function enToZhWeather(desc) {
    if (!desc) return '--';
    const d = desc.toLowerCase();
    if (d.includes('sunny')||d.includes('clear')) return '晴';
    if (d.includes('partly cloudy')) return '多云';
    if (d.includes('cloudy')||d.includes('overcast')) return '阴';
    if (d.includes('fog')||d.includes('mist')||d.includes('haze')) return '雾';
    if (d.includes('drizzle')||d.includes('patchy rain')) return '阵雨';
    if (d.includes('torrential')||d.includes('heavy rain')) return '大雨';
    if (d.includes('moderate rain')) return '中雨';
    if (d.includes('light rain')||d.includes('light rain')) return '小雨';
    if (d.includes('rain shower')) return '阵雨';
    if (d.includes('thunder')||d.includes('storm')) return '雷暴';
    if (d.includes('snow')&&!d.includes('sleet')) return '雪';
    if (d.includes('sleet')) return '雨夹雪';
    if (d.includes('freezing')) return '冻雨';
    if (d.includes('blizzard')) return '暴雪';
    if (d.includes('ice')) return '冰雹';
    return desc;
}
const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];

function getSolarTerm(m,d) {
    for (let i=0;i<solarTermsDate.length;i++)
        if (solarTermsDate[i][0]===m && solarTermsDate[i][1]===d) return solarTerms[i];
    for (let i=0;i<solarTermsDate.length;i++) {
        const df=Math.abs(solarTermsDate[i][1]-d);
        if (solarTermsDate[i][0]===m && df<=1) return solarTerms[i]+'前后';
    }
    return '';
}
function getLunarDate(date) {
    const m=date.getMonth()+1, d=date.getDate();
    return { month: lunarMonths[(m+10)%12], day: lunarDays[(d+10)%30] };
}

let cycleIndex=0;
const cycleIds=['dateDisplay','lunarDisplay','termDisplay','weekdayDisplay','weatherDisplay','tempDisplay','warnDisplay'];
function rotateCycle() {
    document.querySelectorAll('.cycle-item').forEach(e=>e.classList.remove('active'));
    document.getElementById(cycleIds[cycleIndex]).classList.add('active');
    cycleIndex=(cycleIndex+1)%cycleIds.length;
}

let weatherText='获取中…', tempText='--℃';
let _cityName = '';
let _stationId = '';
let _provinceCode = '';
let _weatherSource = '';

function _loadCachedCity() {
    try {
        const raw = localStorage.getItem('_wxCity');
        if (!raw) return null;
        const c = JSON.parse(raw);
        if (Date.now() - c.t > 60 * 60 * 1000) return null;
        return c;
    } catch { return null; }
}
function _saveCity(name, stationId, provinceCode, source) {
    try { localStorage.setItem('_wxCity', JSON.stringify({ name, stationId, provinceCode, source, t: Date.now() })); } catch {}
}

function fetchWeatherData() {
    const DEFAULT_CITY = '贵阳';

    // 备用源：uapis.cn（国内免费API，无需注册）
    const fetchBackup = (city) => {
        const url = `https://uapis.cn/api/v1/misc/weather?city=${encodeURIComponent(city)}&lang=zh`;
        fetch(url).then(r => r.json()).then(d => {
            if (!d || d.error) { weatherText = city + ' 获取失败'; return; }
            _cityName = d.city || city;
            _weatherSource = 'uapis';
            weatherText = _cityName + ' ' + (d.weather || '--');
            tempText = (d.temperature != null ? d.temperature + '℃' : '--℃');
            _saveCity(_cityName, '', '', 'uapis');
        }).catch(() => {
            weatherText = city + ' 获取失败';
        });
    };

    // 主源：中国气象局（weather.cma.cn）
    const fetchCMA = (city) => {
        fetch(`https://weather.cma.cn/api/autocomplete?q=${encodeURIComponent(city)}&limit=5`)
            .then(r => {
                if (!r.ok) throw new Error('CMA http ' + r.status);
                return r.json();
            })
            .then(d => {
                const list = d.data || [];
                const match = list.find(item => item.includes('|' + city + '|')) || list[0];
                if (!match) { fetchBackup(city); return; }
                const parts = match.split('|');
                _stationId = parts[0];
                _cityName = parts[1] || city;
                return fetch(`https://weather.cma.cn/api/weather/view?stationid=${_stationId}`);
            })
            .then(r => {
                if (!r || !r.ok) throw new Error('CMA weather http');
                return r.json();
            })
            .then(d => {
                if (!d || d.code !== 0 || !d.data) { fetchBackup(city); return; }
                const now = d.data.now;
                if (now) {
                    _weatherSource = 'cma';
                    weatherText = _cityName + ' ' + (now.dayText || now.nightText || '--');
                    tempText = (now.temperature != null ? now.temperature + '℃' : '--℃');
                }
                // 处理预警
                const alarms = d.data.alarm || [];
                if (alarms.length > 0) {
                    const hit = alarms.find(a => (a.title || '').includes(_cityName)) || alarms[0];
                    if (hit) {
                        const m = (hit.headline || hit.title || '').match(/发布(.+?)信号/);
                        _warnText = m ? m[1] : (hit.headline || hit.title || '');
                        document.querySelector('.clock-panel').classList.add('warning-active');
                        document.querySelector('#warnDisplay .label-warn').textContent = '⚠ ' + _warnText;
                    }
                } else {
                    _warnText = '';
                    document.querySelector('.clock-panel').classList.remove('warning-active');
                    document.querySelector('#warnDisplay .label-warn').textContent = '';
                }
                _saveCity(_cityName, _stationId, _provinceCode, 'cma');
            })
            .catch(() => { fetchBackup(city); });
    };

    const cached = _loadCachedCity();
    if (cached && cached.stationId) {
        _cityName = cached.name;
        _stationId = cached.stationId;
        _provinceCode = cached.provinceCode || '';
        // 直接用缓存的站点ID拉天气（气象局）
        fetch(`https://weather.cma.cn/api/weather/view?stationid=${_stationId}`)
            .then(r => {
                if (!r.ok) throw new Error('CMA http ' + r.status);
                return r.json();
            })
            .then(d => {
                if (!d || d.code !== 0 || !d.data) { fetchBackup(_cityName); return; }
                const now = d.data.now;
                if (now) {
                    _weatherSource = 'cma';
                    weatherText = _cityName + ' ' + (now.dayText || now.nightText || '--');
                    tempText = (now.temperature != null ? now.temperature + '℃' : '--℃');
                }
                const alarms = d.data.alarm || [];
                if (alarms.length > 0) {
                    const hit = alarms.find(a => (a.title || '').includes(_cityName)) || alarms[0];
                    if (hit) {
                        const m = (hit.headline || hit.title || '').match(/发布(.+?)信号/);
                        _warnText = m ? m[1] : (hit.headline || hit.title || '');
                        document.querySelector('.clock-panel').classList.add('warning-active');
                        document.querySelector('#warnDisplay .label-warn').textContent = '⚠ ' + _warnText;
                    }
                } else {
                    _warnText = '';
                    document.querySelector('.clock-panel').classList.remove('warning-active');
                    document.querySelector('#warnDisplay .label-warn').textContent = '';
                }
                fetchProvinceWarnings();
            })
            .catch(() => { fetchBackup(_cityName); });
        return;
    }

    if (navigator.geolocation) {
        const timer = setTimeout(() => { fetchCMA(DEFAULT_CITY); }, 5000);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                clearTimeout(timer);
                const { latitude: lat, longitude: lng } = pos.coords;
                // 先用经纬度反查城市名（uapis.cn支持经纬度查询）
                fetch(`https://uapis.cn/api/v1/misc/weather?lat=${lat}&lon=${lng}&lang=zh`)
                    .then(r => r.json())
                    .then(d => {
                        const city = (d && !d.error && d.city) ? d.city : DEFAULT_CITY;
                        fetchCMA(city);
                    })
                    .catch(() => { fetchCMA(DEFAULT_CITY); });
            },
            () => { clearTimeout(timer); fetchCMA(DEFAULT_CITY); },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 300000 }
        );
    } else {
        fetchCMA(DEFAULT_CITY);
    }
}

// 气象局预警（省份级）
function fetchProvinceWarnings() {
    if (!_provinceCode || _weatherSource !== 'cma') return;
    fetch(`https://weather.cma.cn/api/map/alarm?adcode=${_provinceCode}`)
        .then(r => {
            if (!r.ok) throw new Error('CMA alarm http ' + r.status);
            return r.json();
        })
        .then(d => {
            const list = d.data || [];
            const hit = list.find(w => (w.title || '').includes(_cityName));
            if (hit) {
                const m = (hit.headline || hit.title || '').match(/发布(.+?)信号/);
                _warnText = m ? m[1] : (hit.headline || hit.title || '');
                document.querySelector('.clock-panel').classList.add('warning-active');
                document.querySelector('#warnDisplay .label-warn').textContent = '⚠ ' + _warnText;
            }
        })
        .catch(() => {});
}

let _warnText = '';

function updateDisplay() {
    const n=new Date();
    const y=n.getFullYear(), mo=String(n.getMonth()+1).padStart(2,'0'), d=String(n.getDate()).padStart(2,'0');
    const h=String(n.getHours()).padStart(2,'0'), mi=String(n.getMinutes()).padStart(2,'0'), sc=String(n.getSeconds()).padStart(2,'0');
    document.getElementById('clockHour').textContent=h;
    document.getElementById('clockMin').textContent=mi;
    document.querySelector('#dateDisplay .label-date').textContent=`${y}年${mo}月${d}日`;
    const lu=getLunarDate(n);
    document.querySelector('#lunarDisplay .label-lunar').textContent=`农历${lu.month}月${lu.day}`;
    const t=getSolarTerm(n.getMonth()+1,n.getDate());
    document.querySelector('#termDisplay .label-term').textContent=t||'无节气';
    document.querySelector('#weekdayDisplay .label-week').textContent=weekdays[n.getDay()];
    document.querySelector('#weatherDisplay .label-weather').textContent=weatherText;
    document.querySelector('#tempDisplay .label-temp').textContent=tempText;
}

function updateUptime() {
    const s=new Date('2026-05-22T00:00:00');
    const n=new Date();
    const df=n-s;
    document.getElementById('uptime').textContent=`${Math.floor(df/86400000)}天 ${Math.floor((df%86400000)/3600000)}小时`;
}

loadSource(0);
checkAdmin();
fetchTodos();
fetchAnnouncements();
fetchWeatherData();
updateDisplay();
updateUptime();
rotateCycle();
setInterval(updateDisplay,1000);
setInterval(updateUptime,60000);
setInterval(rotateCycle,3000);
function scheduleWeatherRefresh() {
    var h = new Date().getHours();
    var interval = h >= 6 && h < 22 ? 1800000 : 7200000;
    clearInterval(window._weatherTimer);
    window._weatherTimer = setInterval(fetchWeatherData, interval);
}
scheduleWeatherRefresh();
setInterval(scheduleWeatherRefresh, 600000);

// Fetch attendance status for sidebar card
let attendState = null;

async function fetchAttendance() {
    try {
        var today = new Date();
        var start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
        var end = new Date(today.getFullYear(), today.getMonth(), today.getDate()+1).toISOString();
        var _listToken = localStorage.getItem("NOCOBASE_TOKEN") || localStorage.getItem("nocobase_token");
        var _listHeaders = {};
        if (_listToken) _listHeaders['Authorization'] = 'Bearer ' + _listToken;
        var r = await fetch('/api/attendance_records:list?filter[check_time][$dateBetween]=' +
            encodeURIComponent(start) + ',' + encodeURIComponent(end) +
            '&sort=-check_time&pageSize=10&appends=createdBy', { credentials:'include', headers:_listHeaders });
        if (r.ok) {
            var data = await r.json();
            var recs = data.data || [];
            var checkIn = null, checkOut = null, leaveRec = null;
            for (var i = 0; i < recs.length; i++) {
                var t = recs[i];
                if (t.check_type === '上班' && !checkIn) checkIn = t;
                if (t.check_type === '下班' && !checkOut) checkOut = t;
                if ((t.check_type === '请假' || t.check_type === '出差') && !leaveRec) leaveRec = t;
            }
            attendState = {
                checkIn: !!checkIn, checkOut: !!checkOut,
                leaveRec: leaveRec,
                leavePending: leaveRec && leaveRec.workflow_status === 'pending',
                leaveLevel1: leaveRec && leaveRec.workflow_status === 'level1_approved',
                leaveApproved: leaveRec && leaveRec.workflow_status === 'approved',
                leaveRejected: leaveRec && leaveRec.workflow_status === 'rejected'
            };
            var st = document.getElementById('attendStatus');
            var btn = document.getElementById('attendBtn');
            if (!st || !btn) return;
            if (leaveRec && (leaveRec.workflow_status === 'pending' || leaveRec.workflow_status === 'level1_approved')) {
                var label = leaveRec.check_type === '请假' ? '请假' : '出差';
                st.textContent = '⏳' + label + '待审批'; st.className = 'attend-status pending';
                btn.textContent = '⏳' + label + '审批中'; btn.className = 'attend-btn pending';
            } else if (leaveRec && leaveRec.workflow_status === 'approved') {
                var label2 = leaveRec.check_type === '请假' ? '已请假' : '已出差';
                st.textContent = '✅' + label2; st.className = 'attend-status approved';
                btn.textContent = label2; btn.className = 'attend-btn checked';
            } else if (leaveRec && leaveRec.workflow_status === 'rejected') {
                var label3 = leaveRec.check_type === '请假' ? '请假' : '出差';
                st.textContent = '❌' + label3 + '被驳回'; st.className = 'attend-status rejected';
                btn.textContent = label3 + '被驳回，点击重试'; btn.className = 'attend-btn';
            } else if (checkOut) {
                st.textContent = '已下班'; st.className = 'attend-status out';
                btn.textContent = '已打卡'; btn.className = 'attend-btn checked';
            } else if (checkIn) {
                st.textContent = '已上班'; st.className = 'attend-status';
                btn.textContent = '下班'; btn.className = 'attend-btn';
            } else {
                st.textContent = '未上班'; st.className = 'attend-status out';
                btn.textContent = '上班'; btn.className = 'attend-btn';
            }
        }
    } catch(e) { console.error('fetchAttendance error:', e); }
}

// Initial fetch + periodic refresh
setTimeout(fetchAttendance, 500);
setInterval(fetchAttendance, 30000);
