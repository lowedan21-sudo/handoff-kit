#!/usr/bin/env node
// PreToolUse (Bash/PowerShell): before `git commit`, compare what the message
// claims with what is staged. Warn-only: it adds context for Claude, never blocks.
// Catches a message describing a fix the diff does not contain.
// Checks: nothing staged; files named in the message that aren't staged; "test(s)"
// claimed but no test file staged; "fix"/"fixes" claimed with only docs staged.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export function extractMessage(cmd) {
  // `commit` must be git's subcommand (after global options), not a word later in the line.
  if (!/\bgit(?:\s+-[cC]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+commit\b/.test(cmd) || /--amend\b.*--no-edit/.test(cmd)) return null;
  const parts = [];
  const re = /(?:^|\s)(?:-m|--message)(?:\s+|=)("([^"\\]|\\.)*"|'[^']*'|\S+)/g;
  let m;
  while ((m = re.exec(cmd))) parts.push(m[1].replace(/^["']|["']$/g, ''));
  const heredoc = cmd.match(/<<-?\s*'?(\w+)'?\s*\n([\s\S]*?)\n\1/);
  if (heredoc && /(-F|--file)\s*-/.test(cmd)) parts.push(heredoc[2]);
  const f = cmd.match(/(?:-F|--file)(?:\s+|=)("([^"]+)"|(\S+))/);
  if (f && f[1] !== '-') { try { parts.push(readFileSync(f[2] || f[3], 'utf8')); } catch {} }
  return parts.length ? parts.join('\n') : '';
}

export function check(message, staged) {
  const warn = [];
  if (!staged.length) { warn.push('Nothing is staged, so this commit would be empty or fail.'); return warn; }
  const base = (p) => p.split('/').pop();
  const named = [...new Set((message.match(/[\w.-]+\/[\w./-]+\.\w{1,5}|\b[\w-]+\.(?:m?[jt]sx?|mjs|py|ps1|sh|json|jsonc|md|ya?ml|toml|css|html)\b/g) || []))];
  const missing = named.filter((n) => !staged.some((s) => s === n || s.endsWith('/' + n) || base(s) === base(n)));
  if (missing.length) warn.push(`The message names ${missing.join(', ')} but no staged file matches.`);
  if (/\btests?\b|\bspec\b/i.test(message) && /\b(add|adds|added|new|cover|covers)\b/i.test(message) && !staged.some((s) => /(\.|\/)(test|spec)s?[./]|__tests__|(^|\/)tests?\//i.test(s))) {
    warn.push('The message claims tests were added, but no test file is staged.');
  }
  if (/^\s*fix\b|\bfix(es|ed)?\b/i.test(message) && staged.every((s) => /\.(md|txt)$/i.test(s))) {
    warn.push('The message claims a fix, but only docs are staged.');
  }
  return warn;
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return; }
  const cmd = String(input?.tool_input?.command || '');
  const msg = extractMessage(cmd);
  if (msg === null) return;
  let staged = [];
  try {
    const dir = (cmd.match(/\bgit\s+-C\s+("([^"]+)"|(\S+))/) || [])[2] || (cmd.match(/\bgit\s+-C\s+("([^"]+)"|(\S+))/) || [])[3] || input.cwd || process.cwd();
    staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: dir, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch { return; }
  if (/\bgit\s+add\b|\bcommit\s+(-a|--all|-am)\b/.test(cmd)) return; // staging happens in the same command; can't judge beforehand
  const warn = check(msg, staged);
  if (!warn.length) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `[commit-claims] Before committing, check the message against \`git diff --staged\`: ${warn.join(' ')} Fix the message or the staging if either is wrong.` } }));
}
if (process.argv[1] && /commit-claims\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) { try { main(); } catch {} }
