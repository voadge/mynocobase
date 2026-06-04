/**
 * Capacitor www 同步脚本
 * 将 web 静态资源复制到 capacitor/www/ 目录，供原生壳打包
 *
 * 使用方式:
 *   node scripts/sync-www.js
 *
 * 复制内容:
 *   ../assets/*.html, *.js, *.css  →  www/assets/
 *   ../dashboard/*.html            →  www/dashboard/
 *   ../index.html                  →  www/index.html （入口）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.resolve(ROOT, '..');

const COPY_MAP = [
  { src: 'assets',       dest: 'www/assets',       filter: /\.(html?|js|css|png|svg|ico)$/ },
  { src: 'dashboard',    dest: 'www/dashboard',    filter: /\.(html|js|css)$/ },
  { src: 'index.html',   dest: 'www/index.html' },
  { src: 'attendance.html', dest: 'www/attendance.html' },
];

function copyFile(src, dest) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('  ✓', path.relative(ROOT, dest));
}

function copyDir(srcDir, destDir, filter) {
  if (!fs.existsSync(srcDir)) return;
  const items = fs.readdirSync(srcDir);
  items.forEach(name => {
    if (filter && !filter.test(name)) return;
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    if (fs.statSync(src).isFile()) copyFile(src, dest);
  });
}

console.log('Syncing www assets...');
COPY_MAP.forEach(entry => {
  const src = path.join(SRC, entry.src);
  const dest = path.resolve(ROOT, entry.dest);
  if (fs.statSync(src).isDirectory()) {
    copyDir(src, dest, entry.filter);
  } else {
    copyFile(src, dest);
  }
});
console.log('Done. Run: npx cap copy');
