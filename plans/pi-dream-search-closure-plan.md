# Plan: Close unused exploratory searches

## Brief

Allow the combined-review worker to close an unused source search with a reason. Closing means stopping that search without claiming that it established evidence. Keep every passage check and the final comparison across selected files.

## Current state / relevant context

The latest attempt retained 242 of 263 outcomes, 369 findings, and seven edits. It reached the one-hour limit with 130 open searches. The completion rule requires every search to finish or have a completed narrower search, even when no outcome uses it.

`review.mjs` stores search receipts, validates outcomes, checks completion, and replays receipts during recovery. `worker-extension.ts` exposes `dream_review`. `runner.mjs` supplies instructions and validates saved work before publication or resume.

## Proposed implementation

Add `dream_review` action `close_searches`. Accept one to twenty `{id, reason}` records. Check the complete request before changing records. Only unfinished, unused searches can close. Reject unknown IDs, duplicate IDs, empty reasons, and searches cited by outcomes. Already closed searches can receive the same closure again without creating progress.

Store an optional `closedReason` on each search. Preserve its query, scope, pages, and matches. Old records remain valid without this field. Closed searches stop blocking completion but cannot support outcomes or resolve another search. A new search call with the same query and scope clears the closure and requires a new final comparison.

Keep existing evidence requirements for supported, corrected, and unsupported outcomes. Reject malformed or evidence-linked closures during recovery and publication. Replay source receipts independently of closure metadata. Show closure counts in tool responses and closure reasons in the review report. Count new closures as progress without letting repeated closures reset the stall limit.

Update prompts to close only discarded exploratory searches. Relevant searches still need completion or valid narrowing. Retain one worker, all selected files, the final comparison, manual apply, and the one-hour limit.

This approach removes unnecessary pagination without silently ignoring searches. It requires an explicit reason, unlike removing the search completion rule entirely.

## File-by-file impact

- `extensions/pi-dream/review.mjs`: closure validation, completion, receipt replay, reports, and continuation progress.
- `extensions/pi-dream/worker-extension.ts`: bounded closure action and compact responses.
- `extensions/pi-dream/runner.mjs`: instructions for closure and required evidence.
- Adjacent review, recovery, and extension tests: closure boundaries, resume, and installed-Pi workflow.
- `docs/pi-dream.md`: implemented closure behavior and limits.

## Risks and edge cases

- Closure must not turn an unfinished search into evidence or bypass source reads.
- A completed narrower search must remain available to outcomes that depend on it. Completed searches cannot close.
- Failed closure requests must leave all records unchanged.
- Repeating or reopening a closure must not permit endless progress resets.
- Old checkpoints must remain valid. Closure metadata must not hide changed receipts.
- The reason records the worker's judgment. Human review still checks that judgment.

## Validation / testing

- Reproduce completion blocked by an unused search before editing production code.
- Check closure, reports, bounded requests, atomic rejection, and repeated calls.
- Reject closure-based evidence, cited searches, and completed narrower searches.
- Check reopening, final-comparison invalidation, stable search paging, and stall limits.
- Check saved closure recovery and reject invalid closure records before worker startup.
- Run the installed Pi CLI with a local fixed-response provider through search, closure, and combined completion.
- Validate the latest live checkpoint read-only. Do not start a provider call or change job records.
- Run adjacent tests, syntax checks, `git diff --check`, and `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Inspect the completion rule and record the approved scope.
- [x] Implement closure with evidence and recovery regressions.
- [x] Validate installed-Pi behavior and saved-work compatibility.
- [x] Update documentation and finish repository checks.

## Results

Completed on 2026-11-15.

All 73 Node tests passed. The installed-Pi test passed with a local provider that returns fixed responses. It completed a combined review after explicitly closing an unused search. Syntax checks, `git diff --check`, and `pre-commit run --all-files` passed.

Read-only validation of `attempt-3eP4fH` passed in 108.159 seconds. It retained 242 outcomes, 369 findings, and seven edits. The original records stayed unchanged.

An in-memory compatibility check closed 130 searches with hypothetical reasons. It preserved all outcomes and still blocked completion because 21 passages remained unchecked. This check did not decide which searches the live worker can discard.

Documentation covers closure rules, evidence limits, recovery, reports, and continuation progress. No live job resumed. No installation, reload, paid model call, or accepted-memory change occurred.

## Open questions / assumptions

- The implementation request approves this scope. No additional worker or timeout change is included.
- Closure applies only to discarded searches, not unchecked claims or unresolved contradictions.
- The user will resume the live job after the implementation checks.
