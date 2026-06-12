"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDepartmentAcl = registerDepartmentAcl;
function registerDepartmentAcl(app, db) {
    app.acl.use(async (ctx, next) => {
        try {
            const rule = await findMatchingRule(ctx, db);
            if (rule) {
                if (rule.allow) {
                    ctx.permission.can = ctx.permission.can || {};
                    ctx.permission.can.resourceName = ctx.permission.resourceName;
                    ctx.permission.can.action = ctx.permission.actionName;
                    ctx.permission.can.params = ctx.permission.can.params || {};
                    if (rule.dataScope) {
                        ctx.permission.can.params.filter = rule.dataScope;
                    }
                }
                else {
                    ctx.permission.can = null;
                }
            }
        }
        catch (e) {
            console.log('[dept-acl] Error:', e.message);
        }
        await next();
    }, { tag: 'department-acl', before: 'core', after: 'allow-manager' });
}
async function findMatchingRule(ctx, db) {
    const { resourceName, actionName } = ctx.permission;
    if (!resourceName || !actionName)
        return null;
    const userId = ctx.state.currentUser?.id;
    if (!userId)
        return null;
    const deptUsers = await db.getRepository('departmentsUsers').find({
        filter: { userId },
        appends: ['department'],
    });
    const departmentIds = deptUsers.map((du) => du.departmentId);
    if (departmentIds.length === 0)
        return null;
    const rules = await db.getRepository('department_acl_rules').find({
        filter: {
            departmentId: { $in: departmentIds },
            resourceName: { $in: [resourceName, '*'] },
            enabled: true,
        },
        sort: ['priority', 'id'],
    });
    if (rules.length === 0)
        return null;
    const actionMatch = (r) => {
        if (r.action === '*')
            return true;
        return (r.action || '').split(',').map((a) => a.trim()).includes(actionName);
    };
    const resMatch = rules.filter(actionMatch);
    if (resMatch.length === 0)
        return null;
    const exactMatch = resMatch.find((r) => r.resourceName === resourceName && actionMatch(r));
    const match = exactMatch || resMatch[0];
    if (match.mode === 'dept_and_role' && match.roleId) {
        const userRoleNames = ctx.state.currentUser?.roles?.map((r) => r.name) || [];
        if (!userRoleNames.includes(match.roleId))
            return null;
    }
    return match;
}
