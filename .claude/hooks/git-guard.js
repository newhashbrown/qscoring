// PreToolUse guard: blanket-staging is banned in this repo — a background
// automation moves HEAD/rebases branches mid-session, so `git add -A`/`.`
// can stage files from a state you did not review. Stage explicit paths.
let d = '';
process.stdin.on('data', (c) => (d += c));
process.stdin.on('end', () => {
  let cmd = '';
  try {
    cmd = (JSON.parse(d).tool_input || {}).command || '';
  } catch {
    process.exit(0);
  }
  if (/\bgit\b[\s\S]*\badd\s+(?:-\S+\s+)*(-A\b|--all\b|\.(?=[\s;&)|]|$))/.test(cmd)) {
    console.error('[git-guard] BLOCKED: git add -A / --all / . is banned in this repo. Stage explicit file paths instead.');
    process.exit(2);
  }
  process.exit(0);
});
