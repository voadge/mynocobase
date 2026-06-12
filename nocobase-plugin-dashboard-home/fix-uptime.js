const fs = require('fs');
const html = fs.readFileSync('/opt/noco-base/dashboard/index.html', 'utf8');
// Fix updateUptime to handle missing element
const oldFunc = `function updateUptime() {
            const s=new Date('2026-05-22T00:00:00');
            const n=new Date();
            const df=n-s;
            document.getElementById('uptime').textContent=\`\${Math.floor(df/86400000)}天 \${Math.floor((df%86400000)/3600000)}小时\`;
        }`;
const newFunc = `function updateUptime() {
            const el=document.getElementById('uptime');
            if(!el) return;
            const s=new Date('2026-05-22T00:00:00');
            const n=new Date();
            const df=n-s;
            el.textContent=\`\${Math.floor(df/86400000)}天 \${Math.floor((df%86400000)/3600000)}小时\`;
        }`;
if (html.indexOf(oldFunc) !== -1) {
  const fixed = html.replace(oldFunc, newFunc);
  fs.writeFileSync('/opt/noco-base/dashboard/index.html', fixed, 'utf8');
  console.log('Fixed updateUptime with null check');
} else {
  console.log('Function not found - checking differences...');
  console.log('Old len:', oldFunc.length);
  // Find the function in the file
  const idx = html.indexOf('function updateUptime()');
  if (idx !== -1) console.log('Found at', idx, ':', html.substring(idx, idx + 300));
}
