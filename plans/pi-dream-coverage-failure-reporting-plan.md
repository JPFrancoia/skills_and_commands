# Pi Dream coverage and failure reporting plan

## Brief

Pi Dream does not show project session coverage. It also hides background worker failures behind the status label and log files.

Add a project summary to `/dream-status`. Show a clear error notification when a background job fails.

## Current state / relevant context

- `/dream` selects the oldest available sessions from the current working directory.
- Pi Dream marks a session as processed only after the user accepts its job branch.
- Queued, running, and ready jobs reserve their sessions.
- `/dream-status` lists jobs. It does not compare them with all project sessions.
- The status area shows `🌙 dream: failed`, but it does not show a notification.
- A worker exit usually records only `Worker exited with status 1.` in `state.json`.
- Pi writes the provider error to standard error. Dream currently mixes standard output and standard error in `worker.log`.

## Proposed implementation

1. Add project coverage to `/dream-status` when no job ID is supplied.
   - Count all sessions for `ctx.cwd`.
   - Count accepted sessions.
   - Count sessions reserved by queued, running, or ready jobs.
   - Count available sessions.
   - State clearly when all project sessions are accepted.

2. Preserve the provider error for each failed worker.
   - Keep JSON output in `worker.log`.
   - Write standard error to `worker.error.log`.
   - Use the last useful standard-error text as the job error.
   - Include the error log path in the job error.

3. Notify the user when the latest job becomes failed.
   - Show the job ID, completed count, error, and `/dream-status` command.
   - Show one notification for each failed job in one Pi runtime.
   - Keep `🌙 dream: failed` in the status area.

4. Update the Pi Dream guide.
   - Define accepted, reserved, and available sessions.
   - Document the project summary and failure notification.
   - Document `worker.error.log`.

## File-by-file impact

- `extensions/pi-dream/index.ts`
  - Calculate and display project coverage.
  - Notify once when polling finds a failed job.
- `extensions/pi-dream/runner.mjs`
  - Store standard error separately.
  - Record a useful worker error in job state.
- `extensions/pi-dream/pi-dream.test.ts`
  - Test coverage output.
  - Test one failure notification.
  - Test provider error capture and fallback behavior.
- `docs/pi-dream.md`
  - Document coverage and failure behavior.

## Risks and edge cases

- A ready job is not accepted. Its sessions must appear as reserved.
- A failed job releases its sessions. Its sessions must appear as available.
- Old jobs do not have `worker.error.log`. Status output must still work.
- A provider can write more than one error line. The state must keep a short useful message.
- Several Pi sessions can watch the same job. Each runtime can show one notification.

## Validation / testing

- Run `extensions/pi-dream/pi-dream.test.ts` with Pi's installed jiti loader.
- Run strict TypeScript checks for the extension.
- Run Node syntax checks for `runner.mjs` and `store.mjs`.
- Run `git diff --check`.
- Run `pre-commit run --all-files`.
- Do not run a paid model request.

## Step-by-step execution checklist

- [x] Add coverage calculation and status text.
- [x] Add separate worker error logs and useful errors.
- [x] Add one failure notification per job and runtime.
- [x] Add regression tests.
- [x] Update `docs/pi-dream.md`.
- [x] Run focused and repository checks.

## Open questions / assumptions

- `/dream-status <job-id>` will keep its current job-only output.
- `/dream-status` without an ID will show the current project summary before all jobs.
- Processed means accepted into `master`, not only analyzed by a worker.
- No retry or resume feature is part of this change.

## Completion

Completed on 2026-11-04.

The focused Pi Dream test passed. Strict TypeScript checks passed with JavaScript module inference. Node syntax checks passed. `git diff --check` and `pre-commit run --all-files` passed.
