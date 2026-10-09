# handoff-kit

A Claude Code plugin for long sessions that stay cheap and can be resumed. Claude keeps a handoff file current. Long task lists run one fresh subagent per task. Lessons that keep recurring become hooks instead of notes.

## Why

In one person's logs (about a month of heavy Claude Code use):

- **74%** of usage was cache re-reads: the whole conversation read again on every turn.
- **62%** came from turns made when context was already over 400k tokens.
- The 12 longest sessions accounted for **48%** of the total.

Re-running those logs as if they had compacted at 400k gives about **35% less usage**. That figure is a simulation, not a measurement, and it comes from a single user's workload. Check your own numbers with `/usage` over a week before and after.

Compacting earlier only helps if nothing important is lost when it happens. This plugin is for that: the state lives in a file, not in the context.

## What's in it

| Piece | Kind | What it does |
|---|---|---|
| `handoff-nudge` | PostToolUse hook | Once context passes 320k tokens (`HANDOFF_NUDGE_AT`), it tells Claude once to update the handoff before compaction. It re-arms after a compaction or `/clear`, and never fires in subagents. |
| `handoff-trim` | PostToolUse hook | Keeps the handoff under 24 KB (`HANDOFF_MAX_BYTES`). Old entries are **moved** to `<handoff>-archive.md`, never deleted. Details below. |
| `session-context` | SessionStart hook | Runs on startup, resume, `/clear` and compaction. It prints branch, sync and dirty state, trims the handoff, and points Claude at it. If the repo ships its own `.claude/hooks/session-context.mjs`, the git line is left to that hook. |
| `guard` | PreToolUse hook | Asks before Claude touches paths, commands or tools that the repo marks as hard stops, in every permission mode. Configured per repo; with no config it does nothing. |
| `commit-claims` | PreToolUse hook | Before `git commit`, compares the message with what is staged: a "fix" with only docs staged, a test claimed but none staged, named files that aren't staged. It only warns and never blocks. |
| `run-queue` | Skill | Works through a list of tasks, one fresh subagent per task. The coordinator only briefs subagents, checks their hand-backs and updates the handoff, so it stays small. |
| `lessons-review` | Skill | Reads every recorded lesson, groups the ones that repeat, and proposes the cheapest durable fix for each, in this order: hook, then check, then skill, then an instruction line. It only proposes; nothing is built without approval. |

## Install

```
claude plugin marketplace add <path-or-git-url-of-this-repo>
claude plugin install handoff-kit@handoff-kit
```

Then add to `~/.claude/settings.json`:

```json
{ "autoCompactWindow": 400000 }
```

This only matters with a 1M-context model. Pick a value that suits you, and set `HANDOFF_NUDGE_AT` about 40–50k below where compaction fires.

## The handoff file

Copy `plugins/handoff-kit/templates/HANDOFF.md` to `HANDOFF.md` or `docs/HANDOFF.md` in your repo. If `$HANDOFF_PATH` is set, the hooks use that file. Otherwise they check `HANDOFF.md`, `docs/HANDOFF.md`, `docs/AI-HANDOFF.md` and `.claude/HANDOFF.md`. When more than one of these exists, the one containing the marker wins. If none or several contain it, the most recently modified file wins, so an old snapshot left beside the live file isn't picked.

Its sections are **Now**, **Next** (the queue, with the first step of the first item), **Waiting on you**, **Blocked**, **Done** and **Learned**.

**Waiting on you** holds decisions and steps only you can take, as `- [ ]` lines. Every session start lists the open ones, until each is ticked `- [x]`, so nothing you owe gets lost between sessions. Claude updates it after every task, and run-queue does so before starting the next item.

### Auto-trim rules

- Trimming is **opt-in**. Only a file whose text contains `<!-- handoff-kit -->` is ever trimmed; the template includes it. Without the marker the file is never modified.
- Now, Next and Blocked are never trimmed.
- The oldest Done entries move first, then the oldest Learned entries. The newest 5 Learned entries always stay.
- An entry with an unchecked box `[ ]` never moves, whatever section it is in.
- Moved entries are appended to the archive under `## Done (trimmed YYYY-MM-DD)` **before** the handoff is rewritten. The rewrite is atomic (temp file, then rename), so a crash can duplicate an entry but never lose one.

## Guard config

Put this in `<repo>/.claude/guard.json` (see `templates/guard.json`):

```json
{
  "paths": ["src/billing/**", "**/migrations/**"],
  "commands": ["\\bterraform\\s+apply\\b"],
  "tools": ["^mcp__.*__(delete|drop)_"],
  "unlock_env": "GUARD_AUTHORIZED"
}
```

- `paths` are globs relative to the repo. They match edits, and shell commands that both write (`rm`, `mv`, `sed -i`, redirects, `Set-Content` and so on) and name a protected path.
- `commands` and `tools` are regexes.
- Starting Claude with `GUARD_AUTHORIZED=1` unlocks the whole session.

The guard always asks; it never silently allows or denies. It fails open, so a broken config never locks you out. That also means it is a seatbelt, not a security boundary.

## Tests

```
for f in plugins/handoff-kit/hooks/*.test.mjs; do node "$f"; done
```

Each guard was also checked by planting the failure it claims to catch: trimming an unchecked entry, trimming Next, and skipping the archive write. In each case the planted bug made the tests fail.

## Limits

- The token figures above come from one user's logs. The savings figure is simulated.
- The nudge reads context size from the transcript file, so if Claude Code changes that format, the nudge goes quiet. It does not misfire.
- The run-queue skill needs the model to follow it. Nothing enforces "one subagent per task".

## License

MIT
