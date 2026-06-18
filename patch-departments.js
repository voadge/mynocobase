const fs = require('fs');
const path = '/app/nocobase/node_modules/@nocobase/plugin-departments/dist/client/index.js';

if (!fs.existsSync(path)) {
  console.log('[dept-patch] ERROR: Bundle not found at', path);
  process.exit(1);
}

let content = fs.readFileSync(path, 'utf8');

// The target pattern: the owners field schema in editDepartmentSchema
// We're looking for the "owners" field definition and adding "manager_in_charge" after it
const searchPatterns = [
  // Pattern 1: minified (most likely)
  `owners:{title:'{{t("Owners")}}',"x-component":"DepartmentOwnersField","x-decorator":"FormItem"},footer:`,
  // Pattern 2: alternate quote style
  `owners:{title:'{{t("Owners")}}',"x-component":"DepartmentOwnersField","x-decorator":"FormItem"},manager_in_charge:{title:'{{t("分管领导")}}',"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.manager_in_charge"},footer:`,
];

// Check if already patched
if (content.includes(`manager_in_charge`)) {
  console.log('[dept-patch] Already patched, skipping.');
  process.exit(0);
}

const replacement = `owners:{title:'{{t("Owners")}}',"x-component":"DepartmentOwnersField","x-decorator":"FormItem"},manager_in_charge:{title:'{{t("分管领导")}}',"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.manager_in_charge"},footer:`;

let patched = false;
for (const pattern of searchPatterns) {
  if (content.includes(pattern)) {
    content = content.replace(pattern, replacement);
    patched = true;
    break;
  }
}

if (!patched) {
  // Fallback: find the owners field dynamically
  const idx = content.indexOf('DepartmentOwnersField');
  if (idx >= 0) {
    // Find where the owners property ends (look for "},footer" after it)
    const searchStart = idx + 'DepartmentOwnersField'.length;
    const footerIdx = content.indexOf('},footer:', searchStart);
    if (footerIdx >= 0) {
      const beforeFooter = content.substring(0, footerIdx + 1); // include the closing }
      const afterFooter = content.substring(footerIdx + 1);
      const injection = `,manager_in_charge:{title:'{{t("分管领导")}}',"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.manager_in_charge"}`;
      content = beforeFooter + injection + afterFooter;
      patched = true;
      console.log('[dept-patch] Patched via fallback method');
    }
  }
}

if (!patched) {
  console.log('[dept-patch] ERROR: Could not find owners field pattern in bundle');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('[dept-patch] SUCCESS: manager_in_charge field inserted into department form schema');
