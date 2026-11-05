# Pi Dream stream timeout and role models

## Brief

Both concurrent batches failed during a healthy memory edit. The runner stops every unfinished tool call after two minutes, even during useful output. Replace this fixed limit with an inactivity limit. Add separate model settings for extraction and consolidation.

## Current state / relevant context

- The repository is `/home/djipey/informatique/ai/skills_and_commands`, outside the Green Slope workspace.
- Job `2026-11-05T19-36-30-190Z-a89d3fe7` finished all 50 extractions. Its first edit still sent data when the fixed timer stopped it.
- The second project batch failed at the same limit. Each batch has its own candidate files and logs.
- Shared session reservations use a lock. Publication uses separate Git indexes and branch names.
- Each process has a total limit. Tool calls also have size and trailing-whitespace limits.
- `dream.model` selects one model for both roles. Job manifests preserve that model for resume.

## Proposed implementation

Reset the tool-call timer when argument output contains a non-whitespace character. Retain the total process limit, argument limits, whitespace limit, and forced termination. Empty output and whitespace alone do not reset the timer. This avoids an arbitrary larger edit deadline while keeping stalled workers bounded.

Add `dream.workerModel` and `dream.orchestratorModel`. Each role falls back to `dream.model`, then the active concrete model. Reject invalid explicit values and virtual models. Preserve the worker model in the existing manifest `model` field. Add an optional `orchestratorModel` field. Older jobs keep their original model for both roles.

Show both models before start and resume. Keep model selection fixed for an existing job. Do not change live settings or accepted memory. Do not add locks without a demonstrated shared-file failure.

## File-by-file impact

- `extensions/pi-dream/runner.mjs`: inactivity timer, phase-specific model selection, and consolidation completion identity.
- `extensions/pi-dream/index.ts`: role settings, manifest field, and confirmation text.
- `extensions/pi-dream/recovery.test.mjs`: healthy streams, stalled streams, total limits, role routing, and older jobs.
- `extensions/pi-dream/pi-dream.test.ts`: model selection, confirmation, and command checks.
- `docs/pi-dream.md`: implemented timeout rules and model settings.
- This plan: decisions and check results.

## Risks and edge cases

- Continuous output can outlast two minutes. The process limit and size limits still stop an endless stream.
- Whitespace is not useful progress. Whitespace-only output must not postpone the inactivity deadline.
- Role settings can select different providers. Confirmation must show both before any session data leaves the machine.
- Older manifests and successful consolidation records must remain valid. A changed orchestrator model invalidates a successful consolidation record.
- Concurrent jobs can exceed provider limits. Their proposals can need a manual merge after one proposal changes `master`.

## Validation / testing

Success means a useful stream can exceed the inactivity interval and finish. A stalled stream must fail. An endless useful stream must reach the total process limit. Whitespace and oversized arguments must still fail.

Use fake worker processes to inspect actual model arguments in both phases. Check explicit role values, legacy defaults, active-model defaults, invalid values, virtual models, and resume confirmation. Run both adjacent test suites, Node syntax checks, `git diff --check`, and repository hygiene checks. Run independent correctness and coverage reviews.

## Step-by-step execution checklist

- [x] Inspect both failures, current code, and repository guidance.
- [x] Record the approved scope and success criteria.
- [x] Add regression tests and reproduce the timeout failure.
- [x] Implement inactivity detection and role model selection.
- [x] Run tests and independent reviews.
- [x] Update documentation and record check results.

## Open questions / assumptions

- The user requested implementation. No separate approval is necessary for this scope.
- The existing `dream.model` remains the shared default. No live model choice changes automatically.
- Existing failed jobs keep valid extraction results. A later resume can restart only consolidation.
- This task does not accept memory proposals or restart paid jobs automatically.
- Beans is installed, but this repository has no Beans store. Use the task list without creating a new tracker.

## Verification results

Implementation checks completed on 2026-11-05.

- Three new regression checks failed before implementation. They covered healthy streams, the total limit, and separate role models.
- All 19 recovery tests pass. They cover stalled streams, whitespace, argument size, forced termination, extraction reuse, and consolidation isolation.
- The extension suite passes through the installed `jiti` loader.
- The command test starts a real background runner with a fake provider. Both role models reach the expected worker processes.
- Existing concurrent-job tests pass. Accepted `master` stays unchanged.
- Strict TypeScript checks pass for the extension and test files with host package mappings.
- Node syntax checks, `git diff --check`, and `pre-commit run --all-files` pass.
- Two independent reviewers checked correctness and test coverage. Neither reviewer reported an implementation defect.
- The coverage reviewer requested a check for changed orchestrator models after successful consolidation. The added check confirms rejection without another provider call.
- The same check confirms that restored original models reuse successful consolidation.
- The documentation worker updated `docs/pi-dream.md`. The parent reviewed the diff and shortened the confirmation description.
- No review finding remains unresolved.
- At the review checkpoint, no paid provider run, live activation, or memory acceptance occurred.

## Approved local activation

The user approved the local merge and cleanup of task worktrees after preservation checks. The user did not approve a push, paid job restart, model settings change, or memory acceptance.

- Local `master` now contains the implementation and documentation commits.
- The installed package resolves to `/home/djipey/informatique/ai/skills_and_commands/extensions/pi-dream`.
- Both test suites, strict TypeScript checks, Node syntax checks, and repository hygiene checks pass in that checkout.
- Live settings still contain only `dream.model: openai-codex/gpt-6-luna`.
- Both failed jobs still report 50 completed sessions and the `consolidate` phase.
- No process uses either task worktree. The merged commits preserve the documentation worker changes.
- Open Pi sessions need `/reload` to load the updated extension. No reload or paid provider recovery ran in this session.
