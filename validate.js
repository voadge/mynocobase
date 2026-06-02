const fs = require('fs');
const conf = fs.readFileSync('E:\\my-project\\nocobase-plugin-dashboard-home\\nginx.conf', 'utf8');
const match = conf.match(/sub_filter.*?<script>(.*?)<\/script>/);
if (match) {
  console.log('Found script, length:', match[1].length);
  let script = match[1].replace(/&quot;/g, '"');
  try {
    new Function(script);
    console.log('SYNTAX OK');
  } catch(e) {
    console.log('SYNTAX ERROR:', e.message);
  }
} else {
  console.log('Script not found');
}
