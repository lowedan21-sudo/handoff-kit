#!/usr/bin/env node
// PostToolUse (all tools): once context passes HANDOFF_NUDGE_AT tokens (default 320k,
// just under a 400k autoCompactWindow, which compacts at ~367k), tell Claude to update
// the handoff before compaction drops the detail. Fires once per crossing; re-arms
// after context falls below half the threshold (i.e. after a compaction or /clear).
// Main thread only: subagents never write the handoff. Fails open.
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { findHandoff, repoRoot } from './handoff.mjs';

export const THRESHOLD = Number(process.env.HANDOFF_NUDGE_AT) || 320_000;

// Context size of the latest assistant turn, read from the transcript's tail.
export function lastContext(transcriptPath) {
  const fd = openSync(transcriptPath, 'r');
  try {
    const size = fstatSync(fd).size;
    for (const span of [256 * 1024, 4 * 1024 * 1024]) {
      const start = Math.max(0, size - span);
      const buf = Buffer.alloc(size - start);
      readSync(fd, buf, 0, buf.length, start);
      const lines = buf.toString('utf8').split('\n');
      for (let i = lines.length - 1; i >= (start ? 1 : 0); i--) {
        if (!lines[i].includes('"usage"')) continue;
        try {
          const r = JSON.parse(lines[i]);
          const u = r.type === 'assistant' && !r.isSidechain && r.message?.usage;
          if (u) return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        } catch {}
      }
      if (!start) break;
    }
    return null;
  } finally { closeSync(fd); }
}

// Returns the message to inject, or null. `flag` is the per-session "already nudged" file.
export function decide(ctx, flag, threshold = THRESHOLD, handoff = null) {
  if (ctx == null) return null;
  if (ctx < threshold / 2) { if (existsSync(flag)) rmSync(flag); return null; }
  if (ctx < threshold || existsSync(flag)) return null;
  writeFileSync(flag, String(ctx));
  const k = Math.round(ctx / 1000);
  return `Context is at ${k}k tokens; auto-compaction is close. Before your next step, update the session handoff ` +
    (handoff ? `(${handoff}: Now, Next, Done, Learned): ` : `(no handoff file found; write the note in your reply): `) +
    `what is done (with PR/SHA), what is next and its first step, and anything learned that is not in the code ` +
    `(decisions, traps, checks that could not run). Keep it short, then carry on with the task.`;
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { return; }
  if (input.agent_id || !input.transcript_path || !input.session_id) return;
  const dir = join(tmpdir(), 'claude-handoff-nudge');
  mkdirSync(dir, { recursive: true });
  const cwd = input.cwd || process.cwd();
  const found = findHandoff(cwd);
  const msg = decide(lastContext(input.transcript_path), join(dir, input.session_id.replace(/[^\w-]/g, '')),
    THRESHOLD, found && relative(repoRoot(cwd), found));
  if (msg) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }));
}

if (process.argv[1] && /handoff-nudge\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) { try { main(); } catch {} }
