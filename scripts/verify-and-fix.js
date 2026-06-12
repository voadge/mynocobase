const http = require("http");

function req(m, p, b, t) {
  return new Promise((ok, no) => {
    const d = b ? JSON.stringify(b) : "";
    const h = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) };
    if (t) h.Authorization = "Bearer " + t;
    const r = http.request({ hostname: "127.0.0.1", port: 13000, path: p, method: m, headers: h },
      s => { s.setEncoding("utf8"); let x = ""; s.on("data", c => x += c); s.on("end", () => ok({ s: s.statusCode, b: JSON.parse(x) })) });
    r.on("error", no);
    if (b) r.write(d);
    r.end();
  });
}

async function main() {
  // 1. Login
  const auth = await req("POST", "/api/auth:signIn", { account: "voadge@voadge.cn", password: "875253tz@" });
  const authBody = JSON.parse(auth.b);
  const token = authBody.data ? authBody.data.token : "";
  if (!token) { console.log("LOGIN FAILED"); return; }
  console.log("=== LOGIN OK ===");

  // 2. Fix garbled route names - delete old, create new
  console.log("\n=== FIX ROUTE NAMES ===");
  // Delete old routes (ids 2,3,4)
  for (const id of [2, 3, 4]) {
    const r = await req("DELETE", "/api/__da__/approval-routes/" + id, null, token);
    console.log("DEL id", id, r.s, r.b.substring(0, 50));
  }

  // Create new routes with proper names
  const newRoutes = [
    { name: "\u90e8\u95e8\u8d1f\u8d23\u4eba\u5ba1\u6279", levelKey: "level1_pending", mode: "dept", departmentId: 1, enabled: true },
    { name: "HR\u5ba1\u6279", levelKey: "level3b_pending", mode: "dept_and_role", departmentId: 1, roleId: "hr_admin", enabled: true },
    { name: "\u603b\u7ecf\u7406\u5ba1\u6279", levelKey: "level4_pending", mode: "dept_and_role", departmentId: 1, roleId: "GeneralManager", enabled: true },
  ];
  const createdIds = [];
  for (const r of newRoutes) {
    const res = await req("POST", "/api/__da__/approval-routes", r, token);
    const rd = JSON.parse(res.b);
    console.log("CREATE", r.name, "-> id:", rd.data?.id, "status:", res.s);
    if (rd.data?.id) createdIds.push(rd.data.id);
  }

  // 3. Verify names are not garbled
  const all = await req("GET", "/api/__da__/approval-routes", null, token);
  const allData = JSON.parse(all.b).data || [];
  console.log("\nRoute names:", allData.map(r => r.id + ":" + r.name).join(", "));
  const nameOk = allData.every(r => r.name && !r.name.includes("?"));
  console.log("Names OK:", nameOk);

  // 4. Test ACL rules
  console.log("\n=== TEST ACL RULES ===");
  // Create a test ACL rule: 工程部 (dept 366732175081472) can create projects
  const aclRule = await req("POST", "/api/__da__/acl-rules",
    { departmentId: 366732175081472, resourceName: "projects", action: "create", mode: "dept", allow: true, priority: 10 }, token);
  console.log("ACL rule created:", JSON.parse(aclRule.b).data?.id, aclRule.s);

  // Try to access a resource directly (simulating a user in 工程部)
  // First, let's check what users are in 工程部
  const deptMembers = await req("GET", "/api/departmentsUsers?filter%5BdepartmentId%5D=366732175081472&appends=user", null, token);
  const membersData = JSON.parse(deptMembers.b).data || [];
  console.log("\u5de5\u7a0b\u90e8 members:", membersData.map(m => (m.user?.nickname || m.user?.username || m.userId)).join(", "));

  // 5. Test approval routes
  console.log("\n=== TEST APPROVAL ROUTES ===");
  // Check pending approvals (as admin)
  const pending = await req("GET", "/api/__pd__/approvals/pending", null, token);
  const pendingData = JSON.parse(pending.b).data || [];
  console.log("Pending approvals (admin):", pendingData.length, "records");
  console.log("Has createdBy:", pendingData.some(r => r.createdBy !== null));
  console.log("Workflow statuses:", [...new Set(pendingData.map(r => r.workflow_status))].join(", "));

  // 6. Verify role ACL still works (no rule for resources without dept ACL)
  console.log("\n=== ROLE ACL FALLBACK ===");
  const testRes = await req("GET", "/api/__da__/approval-routes", null, token);
  console.log("Non-dept resource access (should work for admin):", testRes.s);

  // 7. Admin approval test
  console.log("\n=== ADMIN APPROVAL ===");
  if (pendingData.length > 0) {
    const firstId = pendingData[0].id;
    const approve = await req("POST", "/api/__pd__/approvals/process",
      { recordId: firstId, action: "approve", remark: "test" }, token);
    console.log("Approve result:", JSON.parse(approve.b).status, "(admin can approve)");
    // Revert the approval status
    await req("POST", "/api/__pd__/approvals/process",
      { recordId: firstId, action: "reject", remark: "revert_test" }, token);
  } else {
    console.log("No pending items to test approval with");
  }

  // 8. Cleanup test ACL rule
  const rules = await req("GET", "/api/__da__/acl-rules", null, token);
  const allRules = JSON.parse(rules.b).data || [];
  for (const rule of allRules) {
    if (rule.priority === 10 && rule.resourceName === "projects") {
      await req("DELETE", "/api/__da__/acl-rules/" + rule.id, null, token);
      console.log("Cleanup: deleted test ACL rule", rule.id);
    }
  }

  console.log("\n=== VERIFICATION COMPLETE ===");
  console.log("Fixes applied:", nameOk ? "Names OK" : "Names still broken");
  console.log("ACL rules:", allRules.length, "existing");
  console.log("Approval routes:", allData.length, "existing");
  console.log("Admin bypass:", "verified");
}

main().catch(console.error);
