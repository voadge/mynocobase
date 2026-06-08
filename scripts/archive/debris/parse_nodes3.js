const fs = require('fs');
const path = 'E:\\my-project\\prod_dump.sql';
const content = fs.readFileSync(path, 'utf8');

const copyMarker = 'COPY public.flow_nodes (id, "createdAt", "updatedAt", key, title, "upstreamId", "branchIndex", "downstreamId", type, config, "workflowId") FROM stdin;';
const idx = content.indexOf(copyMarker);
const afterCopy = content.substring(idx + copyMarker.length);
const dataEnd = afterCopy.indexOf('\\.\n');
const nodesData = afterCopy.substring(0, dataEnd).trim();

const lines = nodesData.split('\n');

// Check all script nodes (likely JavaScript nodes)
console.log('=== SCRIPT NODES (JavaScript) ===');
lines.forEach((line, i) => {
    const parts = line.split('\t');
    if (parts.length >= 10 && parts[8] === 'script') {
        console.log(`\nNode ${i}: ${parts[3]} - "${parts[4]}"`);
        console.log(`Workflow: ${parts[10]}`);
        try {
            const config = JSON.parse(parts[9]);
            console.log(`Code: ${config.code ? config.code.substring(0, 300) : 'NO CODE'}`);
            console.log(`Full config:`, JSON.stringify(config, null, 2).substring(0, 500));
        } catch(e) {
            console.log(`Raw config: ${parts[9].substring(0, 500)}`);
        }
    }
});

// Check query nodes (might be data retrieval + calculation)
console.log('\n\n=== QUERY NODES ===');
lines.forEach((line, i) => {
    const parts = line.split('\t');
    if (parts.length >= 10 && parts[8] === 'query') {
        console.log(`\nNode ${i}: ${parts[3]} - "${parts[4]}"`);
        console.log(`Workflow: ${parts[10]}`);
        try {
            const config = JSON.parse(parts[9]);
            console.log(`Config:`, JSON.stringify(config, null, 2).substring(0, 500));
        } catch(e) {
            console.log(`Raw config: ${parts[9].substring(0, 500)}`);
        }
    }
});

// Check update nodes
console.log('\n\n=== UPDATE NODES ===');
lines.forEach((line, i) => {
    const parts = line.split('\t');
    if (parts.length >= 10 && parts[8] === 'update') {
        console.log(`\nNode ${i}: ${parts[3]} - "${parts[4]}"`);
        console.log(`Workflow: ${parts[10]}`);
        try {
            const config = JSON.parse(parts[9]);
            console.log(`Config:`, JSON.stringify(config, null, 2).substring(0, 500));
        } catch(e) {
            console.log(`Raw config: ${parts[9].substring(0, 500)}`);
        }
    }
});
