#!/usr/bin/env node
// SessionStart (startup, resume, clear, compact): tell the session where it is before it plans.
// Prints branch, how far behind origin/<default> the checkout is (after a quick, time-boxed
// fetch), uncommitted changes, a loud warning past 20 commits behind, and where the handoff
// is. Trims the handoff first if it is over its size limit. Skips the git part in repos that
// ship their own .claude/hooks/session-context.mjs. Never blocks: any failure prints nothing.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { findHandoff, trimFile, repoRoot } from './handoff.mjs';
import { report } from './handoff-trim.mjs';

const git = (cwd, args, timeout = 4000) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch {}
  const cwd = input.cwd || process.cwd();
  const top = repoRoot(cwd);
  const lines = [];
  if (!existsSync(join(top, '.claude', 'hooks', 'session-context.mjs'))) {
    try {
      const branch = git(top, ['branch', '--show-current']) || '(detached)';
      let def = 'main';
      try { def = git(top, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, ''); } catch {}
      let fetched = true;
      try { git(top, ['fetch', '--quiet', 'origin', def], 8000); } catch { fetched = false; }
      const dirty = git(top, ['status', '--porcelain']).split('\n').filter(Boolean).length;
      lines.push(`[session-context] repo ${top} · branch ${branch} · ${dirty} uncommitted change(s)`);
      try {
        const [behind, ahead] = git(top, ['rev-list', '--left-right', '--count', `origin/${def}...HEAD`]).split(/\s+/).map(Number);
        lines.push(`vs origin/${def}${fetched ? '' : ' (fetch failed; refs may be stale)'}: ${behind} behind, ${ahead} ahead`);
        if (behind > 20) lines.push(`WARNING: this checkout is ${behind} commits behind origin/${def}. Plan against current code: sync first (in a worktree if another session owns this checkout), or confirm with the owner before working from stale code.`);
      } catch {}
    } catch {} // not a git repo: still report the handoff
  }
  const handoff = findHandoff(cwd);
  if (handoff) {
    let trimmed = null;
    try { trimmed = report(trimFile(handoff), relative(top, handoff)); } catch {}
    if (trimmed) lines.push(trimmed);
    lines.push(`Handoff: ${relative(top, handoff)}. Read its Now and Next sections before planning; update it after each task (done, next, learned).`);
  }
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
} catch {
  process.exit(0);
}
