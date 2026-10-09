<!-- handoff-kit -->
# Handoff

Where work stands, so a fresh or compacted session can resume without re-exploring.
Claude updates this after every task. Keep entries to one or two lines; link PRs and commits instead of pasting them.

Size limit: when this file passes 24 KB (HANDOFF_MAX_BYTES), the oldest Done entries, then the
oldest Learned entries (the newest 5 always stay), move to HANDOFF-archive.md. Now, Next and
Blocked are never trimmed, and an entry with an unchecked box `[ ]` never moves. Nothing is deleted.

## Now
<!-- What is in progress right now, and its state. -->

## Next
<!-- Ordered queue. The first item is the next task; give its first step. One "- " bullet per task. -->

## Blocked
<!-- Waiting on a person or decision. Say who and what. -->

## Done
<!-- Newest first. "- YYYY-MM-DD: what, PR/commit". -->

## Learned
<!-- Newest first. Lessons that are not in the code: traps, decisions and why, checks that could not run.
     "- YYYY-MM-DD: lesson (how it showed up)". The lessons-review skill turns repeats into hooks and skills. -->
