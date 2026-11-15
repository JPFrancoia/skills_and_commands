# Plan: Reduce repeated Dream review output

## Brief

Keep all selected files in one shared review. Reduce repeated tool output and continue while the worker makes progress. Keep the completion checks and manual apply requirement.

## Current state / relevant context

The live check stopped after three continuations at 41 of 263 passages. It made progress at every stop. Twelve `dream_review` calls returned 1,176,118 characters because each call repeated all pending passages. The model input grew from 36,789 to 371,201 tokens. No timeout or tool error occurred.

`reviewProgress` serves internal checks and tool responses. `reviewContinuation` uses a fixed total count. The runner already enforces a one-hour consolidation timeout. Failed reviews restart from the original candidate on resume.

## Proposed implementation

Add a bounded response helper in `review.mjs`. Keep complete coverage records on disk and full progress available to internal checks. Return counts only after `record` and `finish`. For `status`, return up to ten pending passages with at most 8,000 text characters. A cursor identifies an original passage index and a text offset. This cursor remains stable when earlier outcomes change. Long passages continue on the next page without lost text. Page open search summaries separately and omit source-match records from responses.

Replace the total continuation cap with a consecutive no-progress limit. New passage outcomes, selected-file reads, search pages, and source-read ranges count as progress. Repeated identical actions do not count. Keep high-water counts so removed records cannot reset the limit. Allow three additional requests after stops without progress. New work resets that count. Keep the runner timeout unchanged.

Keep every selected file available in the same worker context. Paging changes tool output, not review scope. Preserve final comparison and evidence checks. Do not add options, dependencies, checkpoint recovery, separate workers, or automatic live reruns.

## File-by-file impact

- `extensions/pi-dream/review.mjs`: compact responses, stable paging, and progress-based continuation.
- `extensions/pi-dream/worker-extension.ts`: paging parameters, compact results, and continuation state.
- `extensions/pi-dream/runner.mjs`: tool-use guidance for paging and completion.
- `extensions/pi-dream/review.test.mjs` and `pi-dream.test.ts`: response bounds, cursor safety, progress limits, and installed Pi tests.
- `docs/pi-dream.md`: implemented paging, continuation rules, timeout, and unchanged resume limits.

## Risks and edge cases

- Progress can continue for a long time. The existing elapsed-time limit still stops the worker.
- More continuations can use more model tokens. Compact responses reduce repeated input but cannot guarantee low cost or correct conclusions.
- A passage can exceed a page. Preserve every character through text offsets.
- Recorded outcomes can change between pages. Use original indices instead of indices in the shrinking pending list.
- Repeated source reads or repeated outcomes must not reset the no-progress limit.
- Existing review records remain compatible. New paging fields affect worker tools only.
- Do not change accepted memory, reload Pi, or rerun the reported job during this task.

## Validation / testing

- Check bounded status output with at least 263 passages and a long passage.
- Reconstruct every original pending passage through page cursors without omissions or duplicates.
- Record outcomes between pages and confirm stable cursors. Reject invalid cursor values.
- Check that `record` and `finish` return counts without pending text or source records.
- Continue beyond three productive stops in one installed Pi process with a local deterministic provider.
- Stop repeated no-progress requests without branch publication. Keep completion and timeout regressions passing.
- Run all adjacent tests, syntax checks, `git diff --check`, and `pre-commit run --all-files`.
- Do not claim live-model quality or live activation from deterministic tests.

## Step-by-step execution checklist

- [x] Inspect the failure and record the approved scope.
- [x] Implement compact paging and progress-based continuation. Pass focused tests.
- [x] Update documentation, run final checks, and record results.

## Open questions / assumptions

- The user approved both corrections with `yes`.
- The existing one-hour limit supplies the elapsed-time boundary.
- Three no-progress continuations provide recovery without an endless loop.
- The previous failed job remains untouched. Resume still restarts incomplete review from its original candidate.

## Results

All 52 Node tests passed: 18 review, eight source, and 26 recovery tests. The extension suite also passed. Its installed Pi test completed more than three productive continuations in one worker process. Repeated stops without progress failed without branch publication.

A read-only replay of the failed job recovered all 222 pending passages across 23 pages. The old response contained 96,812 characters. The new record response contained 178 characters. The largest status response contained 6,239 characters.

Syntax checks passed for `review.mjs` and `runner.mjs`. `git diff --check` and `pre-commit run --all-files` passed. No installation, reload, live-model run, or accepted-memory edit occurred. The failed job remains unchanged. These tests do not establish live-model quality.
