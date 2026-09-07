async function findUpward(deptId, db) {
  var du = await db.getRepository('departmentsUsers').findOne({ filter: { departmentId: deptId, is_manager_in_charge: true }, appends: ['user', 'user.roles'] });
  if (du) {
    var roleTitle = null;
    if (du.user && du.user.roles && du.user.roles.length) {
      roleTitle = du.user.roles[0].title || du.user.roles[0].name;
    }
    return { userId: du.userId, role: roleTitle || '分管领导', deptId: deptId };
  }
  var dept = await db.getRepository('departments').findOne({ filter: { id: deptId } });
  if (dept && dept.parentId) return await findUpward(dept.parentId, db);
  return null;
}

async function main(context) {
  var record = context.data;
  var project = await context.db.getRepository('projects').findOne({ filter: { id: record.project_id } });
  if (!project || !project.departmentId) return false;
  var result = await findUpward(project.departmentId, context.db);
  if (!result) return false;
  context.data.approver_id = result.userId;
  context.data.approver_role = result.role;
  return true;
}
