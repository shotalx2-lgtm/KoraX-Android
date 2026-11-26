const fs = require('fs');
const vm = require('vm');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'korax-app', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let inlineCount = 0;
while ((match = scriptPattern.exec(html)) !== null) {
  const code = match[1];
  if (!code.trim()) continue;
  inlineCount += 1;
  try {
    new vm.Script(code, { filename: `index.inline.${inlineCount}.js` });
  } catch (error) {
    console.error(`Syntax error in inline script #${inlineCount}: ${error.message}`);
    process.exitCode = 1;
  }
}
if (inlineCount === 0) throw new Error('No inline scripts were found in index.html');
console.log(`PASS: parsed ${inlineCount} inline JavaScript blocks without syntax errors`);
