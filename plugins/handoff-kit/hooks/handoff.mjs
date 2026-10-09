// Shared by the handoff-kit hooks: find the repo's handoff file and keep it under a size limit.
//
// Trimming is opt-in and conservative:
//   - only a file containing the marker `<!-- handoff-kit -->` is ever trimmed;
//   - only entries under `## Done` and `## Learned` move, oldest (bottom) first, Done before Learned;
//     every other section (Now, Next, Blocked, ...) is never touched;
//   - an entry containing an unchecked box `[ ]` is never moved, even from Done;
//   - the newest 5 Learned entries always stay;
//   - moved entries are appended to `<name>-archive.md` BEFORE the handoff is rewritten, so a crash
//     can leave a duplicate in the archive but never loses an entry.
import { readFileSync, writeFileSync, appendFileSync, renameSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename, extname, resolve } from 'node:path';

export const MARKER = '<!-- handoff-kit -->';
export const MAX_BYTES = Number(process.env.HANDOFF_MAX_BYTES) || 24 * 1024;
const CANDIDATES = ['HANDOFF.md', 'docs/HANDOFF.md', 'docs/AI-HANDOFF.md', '.claude/HANDOFF.md'];
const TRIMMABLE = ['done', 'learned'];
const KEEP_LEARNED = 5;

export function repoRoot(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return cwd; }
}

// HANDOFF_PATH (relative to the repo root) wins. Otherwise a candidate carrying the marker,
// then the most recently modified one: repos often keep an old snapshot beside the live file.
export function findHandoff(cwd) {
  const root = repoRoot(cwd);
  const found = (process.env.HANDOFF_PATH ? [process.env.HANDOFF_PATH] : CANDIDATES)
    .map((rel) => resolve(root, rel))
    .filter((p) => existsSync(p) && statSync(p).isFile());
  if (found.length < 2) return found[0] ?? null;
  const marked = found.find((p) => readFileSync(p, 'utf8').includes(MARKER));
  return marked ?? found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

export const archivePathFor = (p) => join(dirname(p), basename(p, extname(p)) + '-archive' + extname(p));

// Split a section body into entries: a top-level "- " bullet plus its continuation lines.
// Lines before the first bullet (comments, prose) are kept as a fixed preamble.
// Blank lines are dropped here and re-added once at the end of the section when it renders.
function entries(lines) {
  const pre = [];
  const items = [];
  for (const line of lines) {
    if (/^[-*] /.test(line)) items.push([line]);
    else if (items.length) items.at(-1).push(line);
    else pre.push(line);
  }
  for (const it of items) while (it.length > 1 && it.at(-1).trim() === '') it.pop();
  while (pre.length && pre.at(-1).trim() === '') pre.pop();
  return { pre, items };
}

/**
 * Pure: returns { text, moved: [{section, lines}], over } where `over` is true if the result
 * is still above maxBytes because nothing else may be moved.
 */
export function trimText(text, maxBytes = MAX_BYTES) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const size = (s) => Buffer.byteLength(s, 'utf8');
  if (!text.includes(MARKER) || size(text) <= maxBytes) return { text, moved: [], over: size(text) > maxBytes };
  // Sections: split on "## " headings; keep everything else verbatim.
  const lines = text.split(/\r?\n/);
  const blocks = [];
  for (const line of lines) {
    if (/^## /.test(line) || !blocks.length) blocks.push({ head: /^## /.test(line) ? line : null, body: [] });
    if (/^## /.test(line)) continue;
    blocks.at(-1).body.push(line);
  }
  const parsed = blocks.map((b) => {
    const name = b.head ? b.head.slice(3).trim().toLowerCase() : '';
    const kind = TRIMMABLE.find((k) => name === k || name.startsWith(k + ' '));
    return { ...b, kind, ...(kind ? entries(b.body) : {}) };
  });
  const render = () => parsed.map((b, i) => [
    ...(b.head ? [b.head] : []),
    ...(b.kind ? [...b.pre, ...b.items.flat(), ...(i < parsed.length - 1 ? [''] : [])] : b.body),
  ].join(eol)).join(eol);
  const moved = [];
  let out = render();
  for (const kind of TRIMMABLE) {
    for (const b of parsed.filter((x) => x.kind === kind)) {
      const keep = kind === 'learned' ? KEEP_LEARNED : 0;
      for (let i = b.items.length - 1; i >= keep && size(out) > maxBytes; i--) {
        const item = b.items[i];
        if (item.some((l) => /\[ \]/.test(l))) continue; // unfinished work never moves
        b.items.splice(i, 1);
        moved.unshift({ section: b.head.slice(3).trim(), lines: item });
        out = render();
      }
    }
  }
  return { text: out, moved, over: size(out) > maxBytes };
}

/** Trim the handoff file in place. Returns null when there is nothing to do. */
export function trimFile(path, maxBytes = MAX_BYTES, now = new Date()) {
  const text = readFileSync(path, 'utf8');
  if (!text.includes(MARKER)) return null;
  const { text: out, moved, over } = trimText(text, maxBytes);
  if (!moved.length) return over ? { moved: 0, over, bytes: Buffer.byteLength(text), archive: null } : null;
  const archive = archivePathFor(path);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const header = existsSync(archive) ? '' : `# ${basename(path)} archive${eol}${eol}Entries trimmed from the handoff, oldest last in each batch. Nothing here was deleted from history; it was moved.${eol}`;
  const bySection = {};
  for (const m of moved) (bySection[m.section] ||= []).push(...m.lines);
  const batch = Object.entries(bySection).map(([sec, ls]) =>
    `${eol}## ${sec} (trimmed ${now.toISOString().slice(0, 10)})${eol}${eol}${ls.join(eol)}${eol}`).join('');
  appendFileSync(archive, header + batch); // archive first: a crash here loses nothing
  const tmp = path + '.tmp';
  writeFileSync(tmp, out);
  renameSync(tmp, path);
  return { moved: moved.length, over, bytes: Buffer.byteLength(out), archive };
}
