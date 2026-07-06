const fs = require('fs');
const NODE_FILE = '/app/nocobase/node_modules/@nocobase/plugin-dashboard-home/dist/server/middleware/dashboard.js';
let content = fs.readFileSync(NODE_FILE, 'utf8');
let changes = 0;

// Change 1: flat preview for log-not-found
const old1 = "result[f] = parts.join('\\n');\n                        }\n                        ctx.body = { code: 0, data: { entries: entries.length, result } };";
const new1 = "result[f] = parts.join('\\n');\n                        }\n                        let w = '';\n                        for (const e of entries) { const ew = e.get('weather'); if (ew && typeof ew === 'string' && ew.trim()) { w = ew.trim(); break; } }\n                        result.weather = w;\n                        ctx.body = { code: 0, data: result, entryCount: entries.length };";
if (content.includes(old1)) {
  content = content.replace(old1, new1);
  changes++;
  console.log('CHANGE 1 applied');
} else {
  console.log('SKIP 1: not found');
}

// Change 2: flat preview for log-exists + skip DB write
const old2 = "if (isPreview) {\n                resultData.result = updates;\n            }\n            ctx.body = { code: 0, data: resultData };";
const new2 = "if (isPreview) {\n                const flat = {};\n                for (const f of textFields) { flat[f] = updates[f] || ''; }\n                let w = '';\n                for (const e of entries) { const ew = e.get('weather'); if (ew && typeof ew === 'string' && ew.trim()) { w = ew.trim(); break; } }\n                flat.weather = w;\n                ctx.body = { code: 0, data: flat, entryCount: entries.length };\n                return;\n            }\n            ctx.body = { code: 0, data: resultData };";
if (content.includes(old2)) {
  content = content.replace(old2, new2);
  changes++;
  console.log('CHANGE 2 applied');
} else {
  console.log('SKIP 2: not found');
}

if (changes > 0) {
  fs.writeFileSync(NODE_FILE, content);
  console.log('Applied ' + changes + ' changes');
} else {
  console.log('No changes');
}
