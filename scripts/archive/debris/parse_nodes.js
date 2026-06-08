const fs = require('fs');
const path = 'E:\\my-project\\prod_dump.sql';
const content = fs.readFileSync(path, 'utf8');

// Find flow_nodes COPY section
const copyMarker = 'COPY public.flow_nodes (id, "createdAt", "updatedAt", key, title, "upstreamId", "branchIndex", "downstreamId", type, config, "workflowId") FROM stdin;';
const idx = content.indexOf(copyMarker);
if (idx === -1) {
    console.log('COPY marker not found');
    process.exit(1);
}

const afterCopy = content.substring(idx + copyMarker.length);
const dataEnd = afterCopy.indexOf('\\.\n');
const nodesData = afterCopy.substring(0, dataEnd).trim();

console.log('Nodes data length:', nodesData.length);

const lines = nodesData.split('\n');
console.log('Total nodes:', lines.length);

// Look for "calculation" or "计算" type nodes
const calcTypes = ['calculation', 'dynamic-calculation', 'aggregate', 'date-calculation', 'formula'];
let calcNodes = [];

lines.forEach((line, i) => {
    const parts = line.split('\t');
    if (parts.length >= 9) {
        const type = parts[8];
        const config = parts[9] || '';
        if (calcTypes.some(t => type.includes(t) || config.includes(t)) ||
            config.includes('计算') || config.includes('calculation') ||
            type.includes('expression') || type.includes('compute')) {
            calcNodes.push({line: i, id: parts[0], key: parts[3], title: parts[4], type, config: config.substring(0, 300)});
        }
    }
});

console.log('\nCalculation nodes found:', calcNodes.length);
calcNodes.forEach(n => {
    console.log(`\nID: ${n.id}, Key: ${n.key}, Title: ${n.title}`);
    console.log(`Type: ${n.type}`);
    console.log(`Config: ${n.config.substring(0, 500)}`);
});
