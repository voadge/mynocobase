"use strict";
/**
 * Geographical utility functions for distance calculations, geofence checks,
 * and road station (桩号) computation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.haversineDist = haversineDist;
exports.pointToSegmentDistance = pointToSegmentDistance;
exports.convertToGCJ02 = convertToGCJ02;
exports.gcj02ToWGS84 = gcj02ToWGS84;
exports.projectToSegment = projectToSegment;
exports.nearestOnPolyline = nearestOnPolyline;
exports.stationToStr = stationToStr;
exports.strToStation = strToStation;
exports.recomputeMeters = recomputeMeters;
// Haversine distance between two points in meters
function haversineDist(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// Point-to-segment distance for polyline geofence check
function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {
    const dAC = haversineDist(lat, lon, lat1, lon1);
    const dBC = haversineDist(lat, lon, lat2, lon2);
    const dAB = haversineDist(lat1, lon1, lat2, lon2);
    if (dAB < 1)
        return dAC;
    const cosA = (dAC * dAC + dAB * dAB - dBC * dBC) / (2 * dAC * dAB);
    const cosB = (dBC * dBC + dAB * dAB - dAC * dAC) / (2 * dBC * dAB);
    if (cosA <= 0)
        return dAC;
    if (cosB <= 0)
        return dBC;
    const s = (dAC + dBC + dAB) / 2;
    const area = Math.sqrt(Math.max(0, s * (s - dAC) * (s - dBC) * (s - dAB)));
    return area * 2 / dAB;
}
// ============================================================================
// GCJ-02 / WGS-84 coordinate conversion (C3/C4)
// ============================================================================
const GCJ_A = 6378245.0;
const GCJ_EE = 0.00669342162296594323;
function outOfChina(lat, lng) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function transformLat(x, y) {
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320.0 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
}
function transformLng(x, y) {
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
}
function wgs84ToGcj02(lat, lng) {
    if (outOfChina(lat, lng))
        return [lat, lng];
    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - GCJ_EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (GCJ_A / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lat + dLat, lng + dLng];
}
function gcj02ToWgs84(lat, lng) {
    const [gLat, gLng] = wgs84ToGcj02(lat, lng);
    return [lat * 2 - gLat, lng * 2 - gLng];
}
/**
 * Convert coordinates to GCJ-02 based on source coordinate system.
 * If cs='gcj02', returns as-is. If cs='wgs84', converts to GCJ-02.
 */
function convertToGCJ02(lat, lng, cs) {
    if (cs === 'wgs84')
        return wgs84ToGcj02(lat, lng);
    return [lat, lng];
}
/**
 * Convert GCJ-02 coordinates to WGS-84.
 */
function gcj02ToWGS84(lat, lng) {
    return gcj02ToWgs84(lat, lng);
}
/**
 * Project a point onto a segment defined by two points.
 * Returns { t, meters, distance } where:
 *   t = interpolation parameter (0..1 on segment, clamped)
 *   meters = cumulative distance from route start to projected point
 *   distance = perpendicular distance from point to segment
 */
function projectToSegment(lat, lon, lat1, lon1, lat2, lon2, cumMeters1) {
    const dAC = haversineDist(lat, lon, lat1, lon1);
    const dBC = haversineDist(lat, lon, lat2, lon2);
    const dAB = haversineDist(lat1, lon1, lat2, lon2);
    if (dAB < 1)
        return { t: 0, meters: cumMeters1, distance: dAC };
    const cosA = (dAC * dAC + dAB * dAB - dBC * dBC) / (2 * dAC * dAB);
    const cosB = (dBC * dBC + dAB * dAB - dAC * dAC) / (2 * dBC * dAB);
    let t;
    let distance;
    if (cosA <= 0) {
        t = 0;
        distance = dAC;
    }
    else if (cosB <= 0) {
        t = 1;
        distance = dBC;
    }
    else {
        t = dAC * cosA / dAB;
        const s = (dAC + dBC + dAB) / 2;
        const area = Math.sqrt(Math.max(0, s * (s - dAC) * (s - dBC) * (s - dAB)));
        distance = area * 2 / dAB;
    }
    const meters = cumMeters1 + t * dAB;
    return { t, meters, distance };
}
/**
 * Find the nearest point on a polyline to a given coordinate.
 * polyline must have precomputed cumulative meters.
 */
function nearestOnPolyline(lat, lon, polyline) {
    if (!polyline || polyline.length < 2)
        return null;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
        const p = projectToSegment(lat, lon, polyline[i].lat, polyline[i].lng, polyline[i + 1].lat, polyline[i + 1].lng, polyline[i].meters);
        if (p.distance < bestDist) {
            bestDist = p.distance;
            best = { index: i, t: p.t, meters: p.meters, distance: p.distance, segmentIndex: i };
        }
    }
    return best;
}
/**
 * Format station_m to display string, e.g. 12350 → 'K12+350'
 */
function stationToStr(stationM, prefix = 'K') {
    if (stationM < 0) {
        const abs = Math.abs(stationM);
        const km = Math.floor(abs / 1000);
        const m = Math.round(abs % 1000);
        return `-${prefix}${km}+${String(m).padStart(3, '0')}`;
    }
    const km = Math.floor(stationM / 1000);
    const m = Math.round(stationM % 1000);
    return `${prefix}${km}+${String(m).padStart(3, '0')}`;
}
/**
 * Parse station string to station_m, e.g. 'K12+350' → 12350
 * Supports negative: '-K0+500' → -500
 */
function strToStation(str) {
    const m = str.match(/^(-?)(\w+?)(\d+)\+(\d{1,3})$/);
    if (!m)
        return null;
    const sign = m[1] === '-' ? -1 : 1;
    const prefix = m[2];
    const km = parseInt(m[3], 10);
    const meters = parseInt(m[4].padEnd(3, '0').substring(0, 3), 10);
    return { prefix, station_m: sign * (km * 1000 + meters) };
}
/**
 * Recompute cumulative meters for a polyline points array.
 * Mutates points in place and returns them.
 */
function recomputeMeters(points) {
    const result = [];
    let cum = 0;
    for (let i = 0; i < points.length; i++) {
        if (i === 0) {
            cum = points[i].meters || 0;
        }
        else {
            cum += haversineDist(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
        }
        result.push({ lng: points[i].lng, lat: points[i].lat, meters: cum });
    }
    return result;
}
