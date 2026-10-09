---
name: run-queue
description: Work through a queue of tasks unattended, one fresh subagent per task, so the coordinating session stays small and each task starts from a clean context. Use when the user starts a long run and walks away, says "run the queue", "work through the list", "keep going while I'm out", or invokes /run-queue. Args - the queue source (a file, a section of the handoff, or a pasted list); defaults to the Next section of the repo's handoff file.
---

# Run queue

Why: every turn re-reads the whole conversation, so one long session doing ten tasks pays for task 1 on every turn of task 10. Here the coordinator only briefs and reads hand-backs, and each task runs in a subagent that starts with a clean context.

## Setup (once per run)

1. **Find the queue.** Use the args if given. Otherwise read the Now, Next and Blocked sections of the handoff file. The session-start hook names it; it is usually `HANDOFF.md` or `docs/HANDOFF.md`, and `templates/HANDOFF.md` in this plugin is the format. If there is no queue, ask the user once, then stop.
2. **Write the plan** as a short numbered list in your reply: the item, what "done" means, and anything that needs the user. Don't wait for approval unless an item obviously needs it.

## For each item

1. **Brief** a fresh agent with the Agent tool:
   - `subagent_type: "general-purpose"`. Never a fork: a fork copies this whole conversation, which defeats the point.
   - Pick the model and effort for the task. Only pass a model if the user asked for one or the task needs more than the default.
   - The brief has to stand on its own, because the agent sees none of this conversation. Include: repo path and branch, the item and its done condition, the files or docs to read first, the checks to run, and the authority it has (open a PR or not, merge or not). Also list what it must not do: anything the repo's guard or instructions mark as a hard stop, destructive git (`stash`, `reset --hard`, force push), and pushing to the default branch.
   - Ask for a hand-back of no more than 15 lines: what changed (files, PR, commit SHA), checks run with their result, what was not checked, and anything blocked or needing the user.
2. **Check** the hand-back before trusting it. Run `git status` / `git log -1`, look at the PR, and confirm the checks it claims actually ran. A claim without evidence is a failed item, not a done one.
3. **Update the handoff before you start the next item**, so a compacted or restarted session can resume from the handoff alone:
   - Done: the date, what was done, and the PR or SHA. Failed or blocked items go under Blocked instead.
   - Next: remove the finished item. The new first item is what comes next, with its first step.
   - Learned: anything the next agent needs that isn't in the code, such as a decision made, a trap found, or a check that couldn't run.

   Only you write the handoff. Subagents report back and never edit it, because two writers would collide. The handoff-trim hook keeps the file under its size limit and archives old entries; you never delete entries yourself.
4. **Next item.** Run items one at a time. Parallel agents editing one checkout collide; only parallelise when each agent gets its own worktree (`isolation: "worktree"`).

## Stop rules

- A hard stop, a decision only the user can make, or two failures in a row: stop the queue. Gather every open question into one message (or a decision-sheet skill if the user has one) rather than asking one at a time.
- Don't do item work yourself, beyond reading hand-backs and editing the handoff. If you start reading source files, you have become the long session this skill exists to avoid.
- Whenever the queue stops, for any reason, the handoff's Next section must already say where to resume.
- End with a summary the user can read on a phone: items done, items blocked, PRs to review, and what is waiting on them.
