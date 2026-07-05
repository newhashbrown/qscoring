// PostToolUse quality gate for TS/JS edits: console.log detector for
// production source + project typecheck. (No ESLint in this repo — the
// only linter is tsc, per CLAUDE.md.) Exit 2 feeds problems back to the model.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let d = '';
process.stdin.on('data', (c) => (d += c));
process.stdin.on('end', () => {
  let fp = '';
  try {
    const j = JSON.parse(d);
    fp = (j.tool_input || {}).file_path || (j.tool_response || {}).filePath || '';
  } catch {
    process.exit(0);
  }
  if (!/\.(ts|tsx|js|jsx)$/.test(fp) || /node_modules|\.next|\.open-next/.test(fp)) process.exit(0);

  const errs = [];
  const rel = path.relative(process.cwd(), fp).replace(/\\/g, '/');

  // console.log in production source (app/, lib/, components/); tests and scripts/ are allowed
  const isProd = /^(app|lib|components)\//.test(rel) && !/\.(test|spec)\./.test(rel);
  if (isProd) {
    try {
      fs.readFileSync(fp, 'utf8').split('\n').forEach((line, i) => {
        if (/\bconsole\.log\(/.test(line)) errs.push(`console.log in production source: ${rel}:${i + 1}`);
      });
    } catch {}
  }

  try {
    execSync('npx tsc --noEmit', { stdio: ['ignore', 'pipe', 'pipe'], timeout: 80000 });
  } catch (e) {
    errs.push('tsc --noEmit failed:\n' + String(e.stdout || e.message).slice(0, 3000));
  }

  if (errs.length) {
    console.error(errs.join('\n'));
    process.exit(2);
  }
  process.exit(0);
});
