# Pi Dream failure recovery

## Brief

A worker can produce an unfinished tool call until the 30-minute limit stops it. One failed worker prevents the whole batch from finishing. Preserve successful sessions and resume only unfinished work.

## Current state / relevant context

- `runner.mjs` starts every session on each run. It records no durable completion state per session.
- Worker output goes directly to disk. The runner does not inspect incomplete tool calls or the final model response.
- Workers append findings. A repeated attempt can duplicate partial findings.
- Consolidation edits the shared candidate directly. A failed consolidation can leave partial edits.
- Job `2026-11-05T17-52-57-062Z-fb49fd9e` completed 99 sessions. The remaining worker produced an unfinished `dream_finding` call and excessive whitespace.
- The existing job summary records successful sessions. Some successful sessions contain no findings.

## Proposed implementation

1. Inspect worker events while retaining complete logs. Bound each unfinished tool call by bytes, whitespace, and elapsed time. Keep the existing total limit. Stop unresponsive workers with a forced kill after a short grace period.
2. Require a successful final model response and valid findings before recording session completion. Bind completion records to transcript and finding hashes. A hash identifies the exact file content.
3. Use a separate folder for each extraction attempt. Retry temporary failures twice. Keep failed attempts for diagnosis. Promote only successful findings.
4. Add `/dream-resume [job-id]`. Confirm the provider request, reject active jobs, and reuse valid completion records. Recover old successful sessions from existing summaries and logs. Never infer completion from a findings file alone.
5. Run consolidation in a separate candidate folder. Publish only a successful result. Keep its completion record so a publication retry does not repeat memory edits. Never apply accepted memory automatically.

## File-by-file impact

- `extensions/pi-dream/runner.mjs`: event guards, attempt folders, completion records, retries, legacy recovery, and isolated consolidation.
- `extensions/pi-dream/index.ts`: resume command and shared background launch behavior.
- `extensions/pi-dream/pi-dream.test.ts`: focused recovery and command tests. Keep existing coverage.
- `docs/pi-dream.md`: implemented limits, retry behavior, resume command, and recovery limits.
- This plan: decisions and validation results.

## Risks and edge cases

- Continuous whitespace is activity, but it is not useful progress. Inspect event content instead of using inactivity alone.
- A successful session can contain zero findings. Record that result explicitly.
- Preserve failed logs and partial output. Never combine output from separate attempts.
- Reject changed transcripts or changed successful findings instead of silently trusting them.
- An active runner or stale lock must block resume. Never delete a lock automatically.
- Legacy extraction recovery needs a successful summary and successful final response. Legacy consolidation edits stay untouched if recovery is unsafe.
- Resume can send unfinished transcripts to the recorded provider again. It requires confirmation.

## Validation / testing

Success means the existing 99 sessions do not run again. Only the failed session runs before consolidation. Accepted `master` remains unchanged.

Cover whitespace across event chunks, oversized calls, call time limits, forced termination, temporary retries, permanent errors, partial findings, empty findings, corrupted completion records, changed transcripts, legacy summaries, repeated resume, and consolidation recovery. Cover command confirmation and active-job rejection. Run the adjacent extension test, `git diff --check`, and repository hygiene checks. Run independent correctness and coverage reviews. Exercise the actual resume path on the failed job after checks pass.

## Step-by-step execution checklist

- [x] Inspect the failure, repository guidance, and current tests.
- [x] Record the approved implementation plan and success criteria.
- [x] Add focused regression tests and reproduce the missing behavior.
- [x] Implement guards, retries, completion records, and resume.
- [x] Verify focused tests and inspect the changed file list.
- [x] Run independent reviews and fix valid findings.
- [x] Update documentation and run hygiene checks.
- [x] Resume the failed job without automatic memory acceptance.

## Open questions / assumptions

- The user approved implementation and recovery in this session.
- Keep the selected model and the current maximum of ten parallel workers.
- Do not add provider switching, transcript splitting, new dependencies, or automatic memory acceptance.
- Retry extraction automatically. Resume failed consolidation explicitly from an isolated attempt.
- The current repository is outside the Green Slope workspace. Use its own guidance and a dedicated task worktree.

## Validation results

- The existing extension test passed through the installed `jiti` loader.
- All 15 recovery tests passed with Node.js.
- The command test ran `/dream-resume` through its background launcher with a fake provider.
- `git diff --check` and `pre-commit run --all-files` passed.
- Two independent reviewers inspected correctness and test coverage. Neither reviewer ran tests.
- Review fixes added an attempt completion record before the copy to the session folder.
- Resume now holds the runner lock while it starts the background process.
- Added tests cover process exit, active but unfinished calls, interrupted copies, missing executables, and changes during confirmation.
- One review claim said failed final responses cannot replace success. The code already handled this case. A new test confirms it.
- A reported spawn-error hang lacked a demonstrated Node.js failure path. The error handler now requests termination. The missing-executable test passes.
- The documentation agent updated `docs/pi-dream.md` in a separate worktree. The parent inspected and corrected log paths and recovery details.
- No provider run or live recovery ran during these checks.

## Live recovery result

- Recovery reused all 99 successful sessions and their 283 findings.
- Only session `019faeb5-e0e2-78e1-8054-2df83958ad31` ran again. Its first new attempt succeeded.
- Consolidation completed. The runner published commit `46c612eed72789212deba6b6b0bb771b363da2cd`.
- The job reached 100/100. It now reports `applied`. The published commit is in accepted `master` history.
- The recovery runner no longer runs. No process uses either task worktree.
- The recovery runner did not apply memory. The later acceptance occurred outside this recovery run.
