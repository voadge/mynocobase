"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveApproversByRoute = resolveApproversByRoute;
exports.getUserApprovalLevels = getUserApprovalLevels;
/**
 * Given a department and levelKey, return all users who are authorized to approve
 * based on the department_approval_routes configuration.
 */
async function resolveApproversByRoute(departmentId, levelKey, db) {
    const routes = await db.getRepository('department_approval_routes').find({
        filter: { departmentId, levelKey, enabled: true },
    });
    if (routes.length === 0)
        return [];
    const deptUsers = await db.getRepository('departmentsUsers').find({
        filter: { departmentId },
        appends: ['user', 'user.roles'],
    });
    const seen = new Set();
    const result = [];
    for (const route of routes) {
        for (const du of deptUsers) {
            const user = du.user;
            if (!user || seen.has(user.id))
                continue;
            if (route.mode === 'dept') {
                seen.add(user.id);
                result.push({ id: user.id, nickname: user.nickname, username: user.username, email: user.email });
            }
            else if (route.mode === 'dept_and_role' && route.roleId) {
                const userRoles = (user.roles || []).map((r) => r.name);
                if (userRoles.includes(route.roleId)) {
                    seen.add(user.id);
                    result.push({ id: user.id, nickname: user.nickname, username: user.username, email: user.email });
                }
            }
        }
    }
    return result;
}
/**
 * Given a user's department IDs and role names, return all levelKeys they can approve.
 * (Reverse of resolveApproversByRoute — used for "my pending approvals" listing.)
 */
async function getUserApprovalLevels(userId, userRoleNames, db) {
    const deptUsers = await db.getRepository('departmentsUsers').find({
        filter: { userId },
        appends: ['department'],
    });
    const deptIds = deptUsers.map((d) => d.departmentId);
    if (deptIds.length === 0)
        return [];
    const routes = await db.getRepository('department_approval_routes').find({
        filter: { enabled: true },
    });
    const allowedLevels = [];
    for (const route of routes) {
        const inDept = deptIds.includes(route.departmentId);
        if (route.mode === 'dept' && inDept) {
            allowedLevels.push(route.levelKey);
        }
        else if (route.mode === 'dept_and_role' && inDept && route.roleId) {
            if (userRoleNames.includes(route.roleId)) {
                allowedLevels.push(route.levelKey);
            }
        }
    }
    return [...new Set(allowedLevels)];
}
