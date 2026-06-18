async function findApprover(deptId, db) {
  // 1) sub-department owner
  var subs = await db.getRepository('departments').find({ filter: { parentId: deptId } });
  for (var i = 0; i < subs.length; i++) {
    var du = await db.getRepository('departmentsUsers').findOne({ filter: { departmentId: subs[i].id, isOwner: true }, appends: ['user', 'user.roles'] });
    if (du) {
      var title = null;
      if (du.user && du.user.roles && du.user.roles.length) title = du.user.roles[0].title || du.user.roles[0].name;
      return { userId: du.userId, role: title || subs[i].title + '负责人', deptId: subs[i].id };
    }
  }
  // 2) role match in current dept
  var dus = await db.getRepository('departmentsUsers').find({ filter: { departmentId: deptId }, appends: ['user', 'user.roles'] });
  for (var i = 0; i < dus.length; i++) {
    var u = dus[i].user;
    if (u && u.roles) {
      for (var j = 0; j < u.roles.length; j++) {
        if (u.roles[j].name === 'project_manager' || u.roles[j].name === 'ProjectManager') {
          return { userId: u.id, role: u.roles[j].title || u.roles[j].name, deptId: deptId };
        }
      }
    }
  }
  // 3) escalate to parent
  var dept = await db.getRepository('departments').findOne({ filter: { id: deptId } });
  if (dept && dept.parentId) return await findApprover(dept.parentId, db);
  return null;
}

async function main(context) {
  var record = context.data;
  var project = await context.db.getRepository('projects').findOne({ filter: { id: record.project_id } });
  if (!project || !project.departmentId) return false;
  var result = await findApprover(project.departmentId, context.db);
  if (!result) return false;
  context.data.approver_id = result.userId;
  context.data.approver_role = result.role;
  return true;
}
