"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStationRoutes = registerStationRoutes;
/**
 * Station (桩号) API endpoints
 * GET /api/__pd__/station/convert  - convert lat/lng to station string
 * GET /api/__pd__/station/reverse  - convert station_m back to lat/lng
 * GET /api/__pd__/roads            - list road lines
 * GET /api/__pd__/roads/:id        - single road detail
 * POST /api/__pd__/roads/import    - import road from GeoJSON
 */
const geo_1 = require("../utils/geo");
// Simple in-memory cache for road lines (5 min TTL)
const _roadCache = { time: 0, data: [] };
const ROAD_CACHE_TTL = 300000;
async function loadRoads(db) {
    const now = Date.now();
    if (_roadCache.data.length && (now - _roadCache.time) < ROAD_CACHE_TTL)
        return _roadCache.data;
    const roads = await db.getRepository('road_lines').find({
        filter: { is_active: true },
        sort: ['project_id', 'code'],
    });
    _roadCache.data = roads || [];
    _roadCache.time = now;
    return _roadCache.data;
}
function invalidateRoadCache() {
    _roadCache.time = 0;
    _roadCache.data = [];
}
function parsePoints(pointsRaw) {
    if (!pointsRaw)
        return [];
    const arr = typeof pointsRaw === 'string' ? JSON.parse(pointsRaw) : pointsRaw;
    if (!Array.isArray(arr) || arr.length < 2)
        return [];
    // Ensure cumulative meters are computed
    return (0, geo_1.recomputeMeters)(arr);
}
/**
 * Find nearest road and station for a given GCJ02 coordinate.
 * If roadId is specified, only search that road.
 * If projectId is specified, filter by project.
 */
async function findNearestStation(db, lat, lng, opts = {}) {
    let roads = await loadRoads(db);
    if (opts.roadId) {
        roads = roads.filter(r => r.id === opts.roadId);
    }
    else if (opts.projectId) {
        roads = roads.filter(r => r.project_id === opts.projectId);
    }
    let bestResult = null;
    let bestDist = Infinity;
    for (const road of roads) {
        const points = parsePoints(road.points);
        if (points.length < 2)
            continue;
        const nearest = (0, geo_1.nearestOnPolyline)(lat, lng, points);
        if (!nearest)
            continue;
        // Apply offset
        const stationM = (road.station_offset_m || 0) + nearest.meters;
        const effectiveDist = nearest.distance;
        // C1: Check buffer_meters (road-level) or default 200m
        const bufferMeters = road.buffer_meters || 200;
        if (effectiveDist > bufferMeters)
            continue;
        if (effectiveDist < bestDist) {
            bestDist = effectiveDist;
            const prefix = road.prefix || 'K';
            bestResult = {
                road_id: road.id,
                road_code: road.code,
                road_name: road.name,
                station: (0, geo_1.stationToStr)(stationM, prefix),
                station_m: stationM,
                distance: Math.round(effectiveDist),
                structure_name: null,
            };
        }
    }
    if (!bestResult)
        return null;
    // Check for structure at this station
    try {
        const structures = await db.getRepository('road_structure_marks').find({
            filter: { road_id: bestResult.road_id },
        });
        for (const s of structures) {
            if (bestResult.station_m >= s.station_start_m && bestResult.station_m <= s.station_end_m) {
                bestResult.structure_name = s.name;
                break;
            }
        }
    }
    catch (e) { /* no structures table yet */ }
    return bestResult;
}
function registerStationRoutes(app, authMiddleware) {
    // GET /api/__pd__/station/convert
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/station/convert') {
            return await next();
        }
        if (!(await authMiddleware.isAuthenticated(ctx))) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const rawLat = parseFloat(ctx.query.lat);
            const rawLng = parseFloat(ctx.query.lng);
            if (isNaN(rawLat) || isNaN(rawLng)) {
                ctx.body = { code: -1, msg: '缺少有效经纬度' };
                return;
            }
            const cs = (ctx.query.cs || 'gcj02');
            const [lat, lng] = (0, geo_1.convertToGCJ02)(rawLat, rawLng, cs);
            const roadId = ctx.query.road_id ? parseInt(ctx.query.road_id, 10) : undefined;
            const projectId = ctx.query.project_id ? parseInt(ctx.query.project_id, 10) : undefined;
            const result = await findNearestStation(ctx.db, lat, lng, { roadId, projectId });
            if (!result) {
                ctx.body = { code: 0, data: null, msg: '未匹配到路线（可能距离过远或无路线数据）' };
                return;
            }
            ctx.body = { code: 0, data: result };
        }
        catch (e) {
            ctx.body = { code: -1, msg: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // GET /api/__pd__/station/reverse
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/station/reverse') {
            return await next();
        }
        if (!(await authMiddleware.isAuthenticated(ctx))) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const stationM = parseFloat(ctx.query.station_m);
            const roadId = parseInt(ctx.query.road_id, 10);
            if (isNaN(stationM) || isNaN(roadId)) {
                ctx.body = { code: -1, msg: '缺少 station_m 或 road_id' };
                return;
            }
            const roads = await loadRoads(ctx.db);
            const road = roads.find(r => r.id === roadId);
            if (!road) {
                ctx.body = { code: -1, msg: '路线不存在' };
                return;
            }
            const points = parsePoints(road.points);
            if (points.length < 2) {
                ctx.body = { code: -1, msg: '路线点位不足' };
                return;
            }
            // Find the segment containing this station_m
            const targetM = stationM - (road.station_offset_m || 0);
            let segIdx = 0;
            for (let i = 0; i < points.length - 1; i++) {
                if (points[i + 1].meters >= targetM) {
                    segIdx = i;
                    break;
                }
                if (i === points.length - 2)
                    segIdx = i;
            }
            const segStart = points[segIdx].meters;
            const segEnd = points[segIdx + 1].meters;
            const segLen = segEnd - segStart;
            const t = segLen > 0 ? Math.max(0, Math.min(1, (targetM - segStart) / segLen)) : 0;
            const lat = points[segIdx].lat + t * (points[segIdx + 1].lat - points[segIdx].lat);
            const lng = points[segIdx].lng + t * (points[segIdx + 1].lng - points[segIdx].lng);
            ctx.body = { code: 0, data: { lat, lng, road_id: roadId, station: (0, geo_1.stationToStr)(stationM, road.prefix || 'K') } };
        }
        catch (e) {
            ctx.body = { code: -1, msg: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // GET /api/__pd__/roads - list all active roads
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/roads') {
            return await next();
        }
        if (!(await authMiddleware.isAuthenticated(ctx))) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const roads = await loadRoads(ctx.db);
            const list = roads.map(r => ({
                id: r.id, code: r.code, name: r.name, line_type: r.line_type,
                project_id: r.project_id, prefix: r.prefix || 'K',
                station_offset_m: r.station_offset_m || 0,
                buffer_meters: r.buffer_meters || 50,
                is_fence_active: r.is_fence_active,
                point_count: (() => { try {
                    return JSON.parse(r.points || '[]').length;
                }
                catch {
                    return 0;
                } })(),
            }));
            ctx.body = { code: 0, data: list };
        }
        catch (e) {
            ctx.body = { code: -1, msg: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // GET /api/__pd__/roads/:id - single road detail with points
    app.use(async (ctx, next) => {
        const m = ctx.state.reqPath.match(/^\/__pd__\/roads\/(\d+)$/);
        if (ctx.method !== 'GET' || !m) {
            return await next();
        }
        if (!(await authMiddleware.isAuthenticated(ctx))) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const roadId = parseInt(m[1], 10);
            const road = await ctx.db.getRepository('road_lines').findOne({ filterByTk: roadId });
            if (!road) {
                ctx.body = { code: -1, msg: '路线不存在' };
                return;
            }
            const points = parsePoints(road.points);
            let structures = [];
            try {
                structures = await ctx.db.getRepository('road_structure_marks').find({
                    filter: { road_id: roadId }, sort: ['station_start_m'],
                });
            }
            catch (e) { /* no table yet */ }
            ctx.body = {
                code: 0,
                data: {
                    ...road,
                    points,
                    structures,
                    total_length_m: points.length > 0 ? Math.round(points[points.length - 1].meters) : 0,
                },
            };
        }
        catch (e) {
            ctx.body = { code: -1, msg: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // POST /api/__pd__/roads/import - import road from GeoJSON LineString
    app.use(async (ctx, next) => {
        if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/roads/import') {
            return await next();
        }
        if (!(await authMiddleware.isAuthenticated(ctx))) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const body = ctx.request.body || {};
            const { code, name, line_type, project_id, points: rawPoints, cs, prefix, buffer_meters, station_offset_m } = body;
            if (!code || !name || !rawPoints || !Array.isArray(rawPoints) || rawPoints.length < 2) {
                ctx.body = { code: -1, msg: '缺少必要字段（code, name, points）' };
                return;
            }
            // C12: Validate coordinate ranges
            const coordCs = (cs || 'gcj02');
            const points = [];
            for (const p of rawPoints) {
                const rawLng = Array.isArray(p) ? p[0] : p.lng || p.longitude;
                const rawLat = Array.isArray(p) ? p[1] : p.lat || p.latitude;
                if (typeof rawLng !== 'number' || typeof rawLat !== 'number') {
                    ctx.body = { code: -1, msg: '坐标格式错误' };
                    return;
                }
                if (rawLng < 73 || rawLng > 135 || rawLat < 3 || rawLat > 54) {
                    ctx.body = { code: -1, msg: `坐标越界: [${rawLng},${rawLat}]，请检查坐标顺序（应为 [lng,lat]）` };
                    return;
                }
                const [lat, lng] = (0, geo_1.convertToGCJ02)(rawLat, rawLng, coordCs);
                points.push({ lng, lat });
            }
            const recomputed = (0, geo_1.recomputeMeters)(points);
            const totalLength = recomputed[recomputed.length - 1].meters;
            // Compute bbox
            const lngs = points.map(p => p.lng);
            const lats = points.map(p => p.lat);
            const bbox = {
                bbox_min_lng: Math.min(...lngs),
                bbox_max_lng: Math.max(...lngs),
                bbox_min_lat: Math.min(...lats),
                bbox_max_lat: Math.max(...lats),
            };
            const roadRepo = ctx.db.getRepository('road_lines');
            const road = await roadRepo.create({
                values: {
                    code,
                    name,
                    line_type: line_type || 'main',
                    project_id: project_id || null,
                    points: JSON.stringify(recomputed),
                    prefix: prefix || 'K',
                    buffer_meters: buffer_meters || 50,
                    station_offset_m: station_offset_m || 0,
                    is_fence_active: true,
                    is_active: true,
                },
            });
            // Auto-upsert geofence from road (C5/C6)
            try {
                const fenceName = `${name} (路线派生)`;
                const fenceRepo = ctx.db.getRepository('geofences');
                const existing = await fenceRepo.findOne({ filter: { road_id: road.id } });
                const polylineCoords = recomputed.map(p => [p.lng, p.lat]);
                const fenceVals = {
                    fence_name: fenceName,
                    fence_no: `ROAD-${code}`,
                    polyline_coords: JSON.stringify(polylineCoords),
                    buffer_radius: buffer_meters || 50,
                    is_active: true,
                    source: 'road',
                    road_id: road.id,
                    project_name_NO: null,
                    ...bbox,
                };
                if (existing) {
                    await fenceRepo.update({ filterByTk: existing.id, values: fenceVals });
                }
                else {
                    await fenceRepo.create({ values: fenceVals });
                }
            }
            catch (e) {
                console.log('[station-import] auto-fence upsert failed:', e.message);
            }
            invalidateRoadCache();
            ctx.body = { code: 0, data: { id: road.id, code, total_length_m: Math.round(totalLength) } };
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = { code: -1, msg: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // POST /api/__pd__/roads/update - update road line
    app.use(async (ctx, next) => {
        if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/roads/update') {
            return await next();
        }
        if (!(await authMiddleware.isAuthenticated(ctx))) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const body = ctx.request.body || {};
            const { id, code, name, line_type, project_id, points: rawPoints, cs, prefix, buffer_meters, station_offset_m, is_active } = body;
            if (!id) {
                ctx.body = { code: -1, msg: '缺少 id' };
                return;
            }
            const roadRepo = ctx.db.getRepository('road_lines');
            const existing = await roadRepo.findOne({ filterByTk: id });
            if (!existing) {
                ctx.body = { code: -1, msg: '路线不存在' };
                return;
            }
            const updateVals = {};
            if (code !== undefined)
                updateVals.code = code;
            if (name !== undefined)
                updateVals.name = name;
            if (line_type !== undefined)
                updateVals.line_type = line_type;
            if (project_id !== undefined)
                updateVals.project_id = project_id;
            if (prefix !== undefined)
                updateVals.prefix = prefix;
            if (buffer_meters !== undefined)
                updateVals.buffer_meters = buffer_meters;
            if (station_offset_m !== undefined)
                updateVals.station_offset_m = station_offset_m;
            if (is_active !== undefined)
                updateVals.is_active = is_active;
            if (rawPoints && Array.isArray(rawPoints) && rawPoints.length >= 2) {
                const coordCs = (cs || 'gcj02');
                const points = [];
                for (const p of rawPoints) {
                    const rawLng = Array.isArray(p) ? p[0] : p.lng || p.longitude;
                    const rawLat = Array.isArray(p) ? p[1] : p.lat || p.latitude;
                    if (typeof rawLng !== 'number' || typeof rawLat !== 'number') {
                        ctx.body = { code: -1, msg: '坐标格式错误' };
                        return;
                    }
                    if (rawLng < 73 || rawLng > 135 || rawLat < 3 || rawLat > 54) {
                        ctx.body = { code: -1, msg: `坐标越界: [${rawLng},${rawLat}]` };
                        return;
                    }
                    const [lat, lng] = (0, geo_1.convertToGCJ02)(rawLat, rawLng, coordCs);
                    points.push({ lng, lat });
                }
                updateVals.points = JSON.stringify((0, geo_1.recomputeMeters)(points));
            }
            await roadRepo.update({ filterByTk: id, values: updateVals });
            invalidateRoadCache();
            ctx.body = { code: 0, msg: '更新成功' };
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = { code: -1, msg: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // POST /api/__pd__/roads/destroy - delete road line and derived geofence
    app.use(async (ctx, next) => {
        if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/roads/destroy') {
            return await next();
        }
        if (!(await authMiddleware.isAuthenticated(ctx))) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const body = ctx.request.body || {};
            const { id } = body;
            if (!id) {
                ctx.body = { code: -1, msg: '缺少 id' };
                return;
            }
            const roadRepo = ctx.db.getRepository('road_lines');
            const existing = await roadRepo.findOne({ filterByTk: id });
            if (!existing) {
                ctx.body = { code: -1, msg: '路线不存在' };
                return;
            }
            // Delete derived geofence first
            try {
                const fenceRepo = ctx.db.getRepository('geofences');
                const fence = await fenceRepo.findOne({ filter: { road_id: id } });
                if (fence)
                    await fenceRepo.destroy({ filterByTk: fence.id });
            }
            catch (e) { /* ignore */ }
            await roadRepo.destroy({ filterByTk: id });
            invalidateRoadCache();
            ctx.body = { code: 0, msg: '删除成功' };
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = { code: -1, msg: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // POST /api/__pd__/station/convert-batch - batch convert multiple points
    app.use(async (ctx, next) => {
        if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/station/convert-batch') {
            return await next();
        }
        if (!(await authMiddleware.isAuthenticated(ctx))) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const body = ctx.request.body || {};
            const points = body.points; // [{lat, lng}]
            const cs = (body.cs || 'gcj02');
            const projectId = body.project_id ? parseInt(body.project_id, 10) : undefined;
            if (!Array.isArray(points) || points.length === 0) {
                ctx.body = { code: -1, msg: '缺少 points 数组' };
                return;
            }
            if (points.length > 200) {
                ctx.body = { code: -1, msg: '单次最多 200 个点' };
                return;
            }
            const results = [];
            for (const p of points) {
                const rawLat = parseFloat(p.lat || p.latitude);
                const rawLng = parseFloat(p.lng || p.longitude);
                if (isNaN(rawLat) || isNaN(rawLng)) {
                    results.push(null);
                    continue;
                }
                const [lat, lng] = (0, geo_1.convertToGCJ02)(rawLat, rawLng, cs);
                const result = await findNearestStation(ctx.db, lat, lng, { projectId });
                results.push(result);
            }
            ctx.body = { code: 0, data: results };
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = { code: -1, msg: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // GET /api/__pd__/station/validate-import - validate import coordinates
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/station/validate-import') {
            return await next();
        }
        if (!(await authMiddleware.isAuthenticated(ctx))) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const body = ctx.request.body || {};
            const points = body.points || [];
            const cs = (body.cs || 'gcj02');
            const errors = [];
            const validPoints = [];
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                const rawLng = Array.isArray(p) ? p[0] : p.lng || p.longitude;
                const rawLat = Array.isArray(p) ? p[1] : p.lat || p.latitude;
                if (typeof rawLng !== 'number' || typeof rawLat !== 'number') {
                    errors.push('[' + i + '] 坐标格式错误');
                    continue;
                }
                if (rawLng < 73 || rawLng > 135 || rawLat < 3 || rawLat > 54) {
                    errors.push('[' + i + '] 坐标越界 [' + rawLng + ',' + rawLat + ']，请检查 [lng,lat] 顺序');
                    continue;
                }
                const [lat, lng] = (0, geo_1.convertToGCJ02)(rawLat, rawLng, cs);
                validPoints.push({ lng, lat });
            }
            ctx.body = { code: 0, data: { valid: errors.length === 0, errors, validCount: validPoints.length, totalCount: points.length } };
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = { code: -1, msg: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
}
