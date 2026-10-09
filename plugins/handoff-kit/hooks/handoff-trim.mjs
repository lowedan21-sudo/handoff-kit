#!/usr/bin/env node
// PostToolUse (Edit/Write/MultiEdit): after the handoff file is edited, keep it under
// HANDOFF_MAX_BYTES (default 24 KB) by moving the oldest Done/Learned entries to the
// archive file next to it. See handoff.mjs for exactly what may move. Fails open.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findHandoff, trimFile, MAX_BYTES } from './handoff.mjs';

export function report(r, path) {
  if (!r) return null;
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  const parts = [];
  if (r.moved) parts.push(`handoff-kit moved ${r.moved} completed/older entr${r.moved === 1 ? 'y' : 'ies'} from ${path} to ${r.archive}; nothing was deleted.`);
  if (r.over) parts.push(`The handoff is still ${kb(r.bytes)}, over the ${kb(MAX_BYTES)} limit, and only Now/Next/Blocked or unfinished items remain. Shorten those by hand: summarise, don't drop open work.`);
  return parts.join(' ') || null;
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { return; }
  const cwd = input.cwd || process.cwd();
  const handoff = findHandoff(cwd);
  const edited = input.tool_input?.file_path;
  if (!handoff || !edited || resolve(cwd, edited).toLowerCase() !== handoff.toLowerCase()) return;
  const msg = report(trimFile(handoff), handoff);
  if (msg) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }));
}

if (process.argv[1] && /handoff-trim\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) { try { main(); } catch {} }
