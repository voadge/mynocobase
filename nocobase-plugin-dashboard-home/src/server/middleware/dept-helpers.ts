type Db = any;

export interface ApproverInfo {
  id: number;
  nickname?: string;
  username?: string;
  email?: string;
}

/**
 * Given a department and levelKey, return all users who are authorized to approve
 * based on the department_approval_routes configuration.
 */
export async function resolveApproversByRoute(
  departmentId: number,
  levelKey: string,
  db: Db,
): Promise<ApproverInfo[]> {
  const routes = await db.getRepository('department_approval_routes').find({
    filter: { departmentId, levelKey, enabled: true },
  });
  if (routes.length === 0) return [];

  const deptUsers = await db.getRepository('departmentsUsers').find({
    filter: { departmentId },
    appends: ['user', 'user.roles'],
  });

  const seen = new Set<number>();
  const result: ApproverInfo[] = [];

  for (const route of routes) {
    for (const du of deptUsers) {
      const user = du.user;
      if (!user || seen.has(user.id)) continue;
      if (route.mode === 'dept') {
        seen.add(user.id);
        result.push({ id: user.id, nickname: user.nickname, username: user.username, email: user.email });
      } else if (route.mode === 'dept_and_role' && route.roleId) {
        const userRoles = (user.roles || []).map((r: any) => r.name);
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
 * Role/flag → level mapping:
 *   ProfessionalManager (专业负责人) → level1_pending
 *   is_person_in_charge OR project_manager (部门负责人) → level2_pending
 *   is_manager_in_charge (分管领导) → level3_pending
 *   GeneralManager (总经理) → level4_pending
 *   Chairman (董事长) → level5_pending
 */
export async function getUserApprovalLevels(
  userId: number,
  userRoleNames: string[],
  db: Db,
): Promise<string[]> {
  const deptUsers = await db.getRepository('departmentsUsers').find({
    filter: { userId },
    fields: ['departmentId', 'isOwner', 'is_manager_in_charge'],
  });
  if (deptUsers.length === 0) return [];

  const levels: string[] = [];
  const isOwner = deptUsers.some((d: any) => d.isOwner);
  const isManagerInCharge = deptUsers.some((d: any) => d.is_manager_in_charge);

  if (userRoleNames.includes('ProfessionalManager')) levels.push('level1_pending');
  if (isOwner) levels.push('level2_pending');
  if (isManagerInCharge) levels.push('level3_pending');
  if (userRoleNames.includes('GeneralManager')) levels.push('level4_pending');
  if (userRoleNames.includes('Chairman')) levels.push('level5_pending');

  return levels;
}
