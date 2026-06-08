const fs = require('fs');
const path = 'E:\\my-project\\prod_dump.sql';

// Read the file and find workflows COPY data
const content = fs.readFileSync(path, 'utf8');

// Find the workflows COPY section
const copyMarker = 'COPY public.workflows (id, "createdAt", "updatedAt", key, title, enabled, description, type, "triggerTitle", config, executed, "allExecuted", current, sync, options) FROM stdin;';
const idx = content.indexOf(copyMarker);
if (idx === -1) {
    console.log('COPY marker not found');
    process.exit(1);
}

const afterCopy = content.substring(idx + copyMarker.length);
const dataEnd = afterCopy.indexOf('\\.\n');
const workflowData = afterCopy.substring(0, dataEnd).trim();

console.log('Workflow data length:', workflowData.length);
console.log('First 500 chars:', workflowData.substring(0, 500));

// Parse tab-separated values
const lines = workflowData.split('\n');
console.log('\nTotal workflows:', lines.length);

lines.forEach((line, i) => {
    if (i < 10) console.log(`Line ${i}:`, line.substring(0, 200));
});
