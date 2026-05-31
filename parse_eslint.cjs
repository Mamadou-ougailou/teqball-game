const fs = require('fs');
let str = fs.readFileSync('eslint_report.json', 'utf16le');
str = str.replace(/^\uFEFF/, '');
const data = JSON.parse(str);
data.forEach(file => {
  file.messages.forEach(msg => {
    if (msg.ruleId !== 'no-console' && msg.severity === 2) {
      console.log(`${file.filePath}:${msg.line} - ${msg.ruleId}: ${msg.message}`);
    }
  });
});
