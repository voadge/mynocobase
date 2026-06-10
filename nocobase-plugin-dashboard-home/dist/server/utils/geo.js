"use strict";
/**
 * Geographical utility functions for distance calculations and geofence checks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.haversineDist = haversineDist;
exports.pointToSegmentDistance = pointToSegmentDistance;
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
