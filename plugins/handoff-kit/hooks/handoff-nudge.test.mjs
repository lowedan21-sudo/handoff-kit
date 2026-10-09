// Run: node handoff-nudge.test.mjs
import { lastContext, decide } from './handoff-nudge.mjs';
import { writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
let fail = 0;
const t = (name, cond) => { if (!cond) { fail++; console.log('FAIL', name); } };
const dir = mkdtempSync(join(tmpdir(), 'hn-'));
const turn = (cr, extra = {}) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 2, cache_read_input_tokens: cr, cache_creation_input_tokens: 1000 } }, ...extra });
const tr = (name, lines) => { const p = join(dir, name); writeFileSync(p, lines.join('\n') + '\n'); return p; };

// reads the LAST main-thread assistant usage, ignoring sidechain turns and tool results after it
const big = 'x'.repeat(400 * 1024); // pushes the usage line out of the first 256 KB window
const p = tr('a.jsonl', [turn(100000), turn(329000), turn(5000, { isSidechain: true }), JSON.stringify({ type: 'user', pad: big })]);
t('last context, 4 MB fallback window, skips sidechain', lastContext(p) === 330002);
t('no usage -> null', lastContext(tr('b.jsonl', ['{"type":"user"}'])) === null);

const flag = join(dir, 'sess');
t('below threshold: silent', decide(300000, flag) === null);
t('crossing: nudges', /330k tokens/.test(decide(330000, flag) || ''));
t('second time: silent', decide(340000, flag) === null);
t('after compaction (<half): re-arms', decide(20000, flag) === null && !existsSync(flag));
t('next crossing: nudges again', decide(321000, flag) !== null);

// end to end: the hook process prints valid hook JSON once, and nothing for a subagent
const hook = join(dirname(fileURLToPath(import.meta.url)), 'handoff-nudge.mjs');
const run = (obj) => execFileSync('node', [hook], { input: JSON.stringify(obj), encoding: 'utf8' });
const sid = 'e2e-' + Date.now();
const out = run({ session_id: sid, transcript_path: p, hook_event_name: 'PostToolUse' });
t('e2e: emits additionalContext', JSON.parse(out).hookSpecificOutput.additionalContext.includes('handoff'));
t('e2e: once only', run({ session_id: sid, transcript_path: p }) === '');
t('e2e: subagent ignored', run({ session_id: sid + 'x', transcript_path: p, agent_id: 'a1' }) === '');
t('e2e: bad input fails open', execFileSync('node', [hook], { input: 'not json', encoding: 'utf8' }) === '');
rmSync(join(tmpdir(), 'claude-handoff-nudge', sid), { force: true });
console.log(`${fail} failures`);
process.exit(fail ? 1 : 0);
