#!/usr/bin/env node
// guard: PreToolUse hook. Asks before Claude touches what the repo marks as a hard stop
// (money code, auth/permissions, migrations, production data), in every permission mode.
// Config: <repo>/.claude/guard.json. No config = the guard does nothing.
//   {
//     "paths":    ["src/billing/**", "**/migrations/**", "src/auth/permissions.ts"],  // globs, repo-relative
//     "commands": ["\\bterraform\\s+apply\\b", "\\bprisma\\s+migrate\\s+deploy\\b"],  // regexes on shell commands
//     "tools":    ["^mcp__.*__(delete|update|create)_"],                               // regexes on tool names
//     "unlock_env": "GUARD_AUTHORIZED"   // start Claude with GUARD_AUTHORIZED=1 to unlock a whole session
//   }
// A protected path counts for Edit/Write/MultiEdit/NotebookEdit, and for a shell command that both
// writes (rm, mv, cp, sed -i, tee, redirect, Set-Content, ...) and names the path.
// Decision is "ask", never silent allow or deny. Fails open: a broken config or guard never locks you out.
import { readFileSync, existsSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { repoRoot } from './handoff.mjs';

export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

const SHELL_WRITE = /\b(sed\s+-i|perl\s+-pi|tee|rm|del|mv|cp|git\s+(rm|mv|apply|checkout\s+--|restore)|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|New-Item)\b/i;
const REDIRECT = /\d?>{1,2}\s*"?([^\s;&|"]+)/g;

export function decide(input, config, root, env = process.env) {
  if (!config || env[config.unlock_env || 'GUARD_AUTHORIZED'] === '1') return null;
  const paths = (config.paths || []).map(globToRegex);
  const commands = (config.commands || []).map((r) => new RegExp(r, 'i'));
  const tools = (config.tools || []).map((r) => new RegExp(r, 'i'));
  const rel = (p) => {
    const s = String(p || '').replace(/^["']|["']$/g, '');
    const r = isAbsolute(s) ? relative(root, s) : s;
    return r.replace(/\\/g, '/').replace(/^\.\//, '');
  };
  const isProtected = (p) => { const r = rel(p); return !r.startsWith('../') && paths.some((re) => re.test(r)); };
  const tool = String(input?.tool_name || '');
  const ti = input?.tool_input || {};

  if (tools.some((re) => re.test(tool))) return `Hard stop: ${tool} is on this repo's protected tool list.`;
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) {
    const p = ti.file_path || ti.notebook_path;
    if (isProtected(p)) return `Hard stop: editing ${rel(p)}, a protected path in .claude/guard.json.`;
  }
  if (/^(Bash|PowerShell)$/.test(tool)) {
    const cmd = String(ti.command || '');
    const hit = commands.find((re) => re.test(cmd));
    if (hit) return `Hard stop: this command matches the protected pattern ${hit.source}.`;
    for (const m of cmd.matchAll(REDIRECT)) if (isProtected(m[1])) return `Hard stop: the command writes to protected ${rel(m[1])}.`;
    if (SHELL_WRITE.test(cmd)) {
      const target = cmd.split(/\s+/).find(isProtected);
      if (target) return `Hard stop: the command changes protected ${rel(target)}.`;
    }
  }
  return null;
}

export function loadConfig(root) {
  const p = join(root, '.claude', 'guard.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return; }
  let reason = null;
  let config = null;
  try {
    const root = repoRoot(input.cwd || process.cwd());
    config = loadConfig(root);
    reason = decide(input, config, root);
  } catch { return; }
  if (!reason) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: `${reason} Approve only if you authorized this. (Unlock a whole session by starting Claude with ${config.unlock_env || 'GUARD_AUTHORIZED'}=1.)`,
  } }));
}

if (process.argv[1] && /guard\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) { try { main(); } catch {} }
