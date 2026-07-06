const fs = require('fs');
const filePath = '/app/nocobase/storage/plugins/@nocobase/plugin-dashboard-home/dist/server/middleware/dashboard.js';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (const ch of line) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  if (depth < 0) {
    console.log('NEGATIVE at line ' + (i + 1) + ': depth=' + depth + ' | ' + line.trim());
    break;
  }
}
console.log('Final depth:', depth);
