const fs = require('fs');
const path = 'E:\\my-project\\prod_dump.sql';
const content = fs.readFileSync(path, 'utf8');

const copyMarker = 'COPY public.flow_nodes (id, "createdAt", "updatedAt", key, title, "upstreamId", "branchIndex", "downstreamId", type, config, "workflowId") FROM stdin;';
const idx = content.indexOf(copyMarker);
const afterCopy = content.substring(idx + copyMarker.length);
const dataEnd = afterCopy.indexOf('\\.\n');
const nodesData = afterCopy.substring(0, dataEnd).trim();

const lines = nodesData.split('\n');
console.log('Total nodes:', lines.length);

// Get all unique node types
const types = new Set();
lines.forEach(line => {
    const parts = line.split('\t');
    if (parts.length >= 9) {
        types.add(parts[8]);
    }
});

console.log('\nAll node types:');
[...types].sort().forEach(t => console.log(`  ${t}`));

// Also check configs for calculation-related content
console.log('\n--- Nodes with "calculation" or "计算" in config ---');
lines.forEach((line, i) => {
    const parts = line.split('\t');
    if (parts.length >= 10) {
        const config = parts[9] || '';
        if (config.toLowerCase().includes('calculation') || config.includes('计算') || config.includes('expression') || config.includes('formula')) {
            console.log(`\nNode ${i}: ${parts[3]} (${parts[4]})`);
            console.log(`Type: ${parts[8]}`);
            console.log(`Config: ${config.substring(0, 500)}`);
        }
    }
});
