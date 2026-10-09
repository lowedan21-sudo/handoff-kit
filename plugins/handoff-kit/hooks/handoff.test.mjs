// Run: node handoff.test.mjs
import { trimText, trimFile, archivePathFor, MARKER } from './handoff.mjs';
import { writeFileSync, readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let fail = 0;
const t = (name, cond) => { if (!cond) { fail++; console.log('FAIL', name); } };

const pad = 'x'.repeat(200);
const doc = (done, learned, extra = '') => [
  MARKER, '# Handoff', '',
  '## Now', '- building the export screen', '',
  '## Next', '- wire the API', '- add tests', '',
  ...extra.split('\n').filter(Boolean),
  '## Done', '<!-- newest first -->',
  ...done.map((d) => `- ${d} ${pad}`), '',
  '## Learned',
  ...learned.map((d) => `- ${d} ${pad}`), '',
].join('\n');

const done = Array.from({ length: 20 }, (_, i) => `done-${i}`);
const learned = Array.from({ length: 12 }, (_, i) => `lesson-${i}`);
const text = doc(done, learned);
const size = Buffer.byteLength(text);

// no marker: untouched, whatever the size
t('no marker: untouched', trimText(text.replace(MARKER, ''), 100).moved.length === 0);
// under the limit: untouched
t('under limit: untouched', trimText(text, size + 1).moved.length === 0);

// over the limit: oldest Done go first, Now/Next intact
const r = trimText(text, size - 1000);
t('moved some', r.moved.length > 0 && !r.over);
t('oldest done moved first', r.moved.at(-1).lines[0].startsWith('- done-19') && !r.text.includes('done-19'));
t('newest done kept', r.text.includes('done-0 '));
t('now/next intact', r.text.includes('- building the export screen') && r.text.includes('- add tests'));
t('learned untouched while done has room', r.text.includes('lesson-11'));
t('every moved line is gone from the handoff and accounted for',
  r.moved.every((m) => m.lines.every((l) => !r.text.includes(l))));

// very small limit: all Done move, Learned keeps its newest 5, Now/Next never move
const r2 = trimText(text, 500);
t('all done moved', !/done-\d/.test(r2.text));
t('learned keeps newest 5', ['lesson-0', 'lesson-4'].every((x) => r2.text.includes(x)) && !r2.text.includes('lesson-5 '));
t('still over limit is reported', r2.over === true);
t('now/next never move', r2.text.includes('- building the export screen') && r2.text.includes('- wire the API'));

// an unchecked box never moves, even from Done
const r3 = trimText(doc(['- [ ] half-finished migration', ...done], learned), 500);
t('unchecked item stays', r3.text.includes('[ ] half-finished migration'));
t('no line lost or duplicated', (() => {
  const all = doc(['- [ ] half-finished migration', ...done], learned).split('\n').filter((l) => /^- /.test(l));
  const kept = r3.text.split('\n').filter((l) => /^- /.test(l));
  const moved = r3.moved.flatMap((m) => m.lines).filter((l) => /^- /.test(l));
  return kept.length + moved.length === all.length && all.every((l) => kept.includes(l) || moved.includes(l));
})());

// a section that only looks similar (e.g. "## Done criteria") is not trimmable... it is: prefix "done " matches.
// a section named "## Doneness" is not.
const r4 = trimText(doc([], [], '## Doneness\n' + done.map((d) => `- ${d} ${pad}`).join('\n') + '\n'), 500);
t('similar-named section untouched', r4.text.includes('done-19'));

// CRLF preserved
const crlf = trimText(text.replace(/\n/g, '\r\n'), size - 1000);
t('CRLF kept', crlf.text.includes('\r\n') && !/[^\r]\n/.test(crlf.text));

// file round trip: archive written, nothing lost, second run is a no-op
const dir = mkdtempSync(join(tmpdir(), 'hk-'));
const p = join(dir, 'HANDOFF.md');
writeFileSync(p, text);
const res = trimFile(p, size - 1000, new Date('2026-10-09'));
const arch = readFileSync(archivePathFor(p), 'utf8');
t('archive exists with dated heading', existsSync(archivePathFor(p)) && arch.includes('## Done (trimmed 2026-10-09)'));
t('archived entries present', arch.includes('done-19'));
t('handoff on disk shrank', Buffer.byteLength(readFileSync(p, 'utf8')) <= size - 1000 && res.moved > 0);
t('second run no-op', trimFile(p, size - 1000) === null);
t('no tmp file left', !existsSync(p + '.tmp'));

console.log(`${fail} failures`);
process.exit(fail ? 1 : 0);
