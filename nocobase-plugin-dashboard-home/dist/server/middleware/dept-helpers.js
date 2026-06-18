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
<<<<<<< Updated upstream
 * Role/flag → level mapping:
 *   ProfessionalManager (专业负责人) → level1_pending
 *   is_person_in_charge OR project_manager (部门负责人) → level2_pending
 *   is_manager_in_charge (分管领导) → level3_pending
 *   GeneralManager (总经理) → level4_pending
 *   Chairman (董事长) → level5_pending
=======
 * (Reverse of resolveApproversByRoute — used for "my pending approvals" listing.)
>>>>>>> Stashed changes
 */
async function getUserApprovalLevels(userId, userRoleNames, db) {
    const deptUsers = await db.getRepository('departmentsUsers').find({
        filter: { userId },
<<<<<<< Updated upstream
        fields: ['departmentId', 'isOwner', 'is_manager_in_charge'],
    });
    if (deptUsers.length === 0)
        return [];
    const levels = [];
    const isOwner = deptUsers.some((d) => d.isOwner);
    const isManagerInCharge = deptUsers.some((d) => d.is_manager_in_charge);
    if (userRoleNames.includes('ProfessionalManager'))
        levels.push('level1_pending');
    if (isOwner)
        levels.push('level2_pending');
    if (isManagerInCharge)
        levels.push('level3_pending');
    if (userRoleNames.includes('GeneralManager'))
        levels.push('level4_pending');
    if (userRoleNames.includes('Chairman'))
        levels.push('level5_pending');
    return levels;
=======
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
>>>>>>> Stashed changes
}
