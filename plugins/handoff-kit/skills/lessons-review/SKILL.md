---
name: lessons-review
description: Read every recorded lesson (the handoff's Learned section, its archive, and any lesson notes the repo keeps) and propose the cheapest durable fix for each repeated one - a hook, a check or test, a skill, or an instruction line. Use when the user asks to "review lessons", "what should we automate", "turn lessons into hooks/skills", "improve our workflow", invokes /lessons-review, or when the Learned section has grown by 10+ entries since the last review. Proposes only; builds nothing without approval.
---

# Lessons review

A lesson written down once is a note. A lesson that keeps coming back is a missing guard. This skill finds the ones that keep coming back and proposes the cheapest thing that would stop them for good.

## 1. Collect

Read, and keep each lesson with its source (file, section, date):

- the handoff's `## Learned` section, and the `## Learned (trimmed …)` batches in its archive (`<handoff>-archive.md`);
- the repo's lesson notes if it keeps any (e.g. `docs/agent-notes/`, `LESSONS.md`, a `lessons/` folder). Look; don't assume;
- the project's CLAUDE.md / AGENTS.md, only to see which lessons are **already** covered by an instruction;
- `.claude/settings.json` hooks and `.claude/skills/`, only to see which are **already** enforced.

Find the last review: an archive section `## Lessons reviewed YYYY-MM-DD`. Focus on lessons dated after it, but count older ones toward repeats.

## 2. Group

Cluster lessons that describe the same failure, even when worded differently. For each cluster, note how many times it occurred, the dates, and what it cost (rework, a broken deploy, a lost hour), quoting the lessons' own words.

## 3. Pick the cheapest durable fix

For each cluster, choose the **first** option that would actually have prevented it:

1. **Nothing.** It happened once, and it can't recur, or it was a one-off. Say so; don't build for it.
2. **A hook.** The failure is mechanical and detectable from a tool call: a command, a path, a file pattern, a commit message. Hooks run every time, whatever the model remembers. Prefer warn (add context) over block, and ask over deny.
3. **A check or test** in the repo's test suite or CI: the failure shows up in the code or its output.
4. **A skill.** It's a multi-step procedure the model has to follow in order, and it gets skipped or done in the wrong order.
5. **An instruction line** in CLAUDE.md / AGENTS.md: it's judgement, not mechanics. This is the weakest option, because instructions are read, not enforced. Use it only when 2–4 don't fit, and keep it to one line.

Before proposing, check that it isn't already covered (step 1). An existing instruction that didn't prevent the repeat is evidence that an instruction is the wrong form. Propose upgrading it to a hook or check.

## 4. Report

A ranked list, highest value first (frequency × cost). For each proposal:

- **Lessons:** the quotes and dates it comes from, with the count;
- **Proposal:** what to build, in one or two sentences, and where it would live;
- **Why this form:** why not the cheaper option above it;
- **Risk:** false positives, maintenance, and what it could block that it shouldn't;
- **How to verify:** the failure to plant, to prove it catches the problem.

Then list the clusters you chose **not** to act on, and why.

If the report is long, or someone else will read it, publish it as a page (an Artifact if available) and give the link.

## 5. Record

After the user decides, append to the handoff archive:

```
## Lessons reviewed YYYY-MM-DD
- <proposal>: approved / declined / deferred
```

so the next review knows what was already decided. Build approved items as separate tasks (for example with run-queue), each verified by planting the failure it claims to catch.
