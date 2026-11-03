# Pi Dream status indicator

**Completed: 2026-11-03**

## Brief

The sidebar lists extension status beside Ponytail. Dream does not publish a status. Add a visible Dream label so users can see background progress and review readiness.

## Current state / relevant context

- `pi-sidebar` reads labels from `ctx.ui.setStatus` and wraps them in its existing extension area.
- `pi-mcp-status` refreshes its label each second and clears its timer during shutdown.
- Dream stores job state outside the Pi process. A detached runner updates `state.json`.
- Accepted memory already uses a Git repository on `main`. Concurrent worker storage is a separate design discussion.

## Proposed implementation

Publish `🌙 dream: idle` when no job exists. Otherwise, show the latest job state. Include completed and total sessions for queued, running, and ready jobs. Refresh once per second in UI sessions. Show `🌙 dream: unavailable` if state cannot be read. Clear the timer and label during shutdown.

## File-by-file impact

- `extensions/pi-dream/index.ts`: add the status lifecycle through the existing UI API.
- `extensions/pi-dream/pi-dream.test.ts`: cover states, external progress, shutdown, reload, and sessions without a UI.
- `docs/pi-dream.md`: describe the label and refresh behavior.
- `plans/pi-dream-status-plan.md`: record scope and results.

The sidebar renderer, worker tools, runner, configuration, and exports need no changes. No dependency is necessary.

## Risks and edge cases

A failed state read must not stop the session. Repeated session starts must not create duplicate timers. The latest job can belong to another working directory, as with `/dream-status`. The existing sidebar controls wrapping and color.

## Validation / testing

Success means that Dream appears beside the existing extension labels without a job command. Its label must update after an external state change. Shutdown must stop updates and clear the label. Sessions without a UI must not start a timer.

Run the adjacent Dream and sidebar tests. Run `git diff --check` and repository pre-commit checks. Use an isolated terminal session to inspect the actual sidebar. ProofShot targets browser interfaces, so use terminal capture for this TUI.

## Step-by-step execution checklist

1. [x] Inspect Dream storage and sidebar status behavior.
2. [x] Add the label and lifecycle tests.
3. [x] Run automated checks and inspect the terminal sidebar.
4. [x] Update affected documentation and review the diff.

### Results

- Dream and sidebar tests passed with the host `jiti` loader.
- `git diff --check` and `pre-commit run --all-files` passed.
- An isolated Pi terminal showed Dream beside Ponytail for ready, running, and failed states.
- The terminal session exited normally. No Dream batch ran and no accepted memory changed.
- Terminal captures are in `/tmp/pi-dream-status-proof-sTdS4H/`.
- `docs-maintainer` updated `docs/pi-dream.md`. The parent reviewed that diff.

No implementation deviations were necessary. Browser recording does not apply to this terminal interface.

### Follow-up: compact progress label

The user requested `🌙 dream: 10/10` without the job state. Queued, running, and ready labels now show only counts. Other labels remain unchanged. `/dream-status` still shows the full state.

Dream tests, `git diff --check`, and pre-commit checks passed. A terminal capture showed `🌙 dream: 10/10` beside Ponytail. The capture is in `/tmp/pi-dream-short-label-t3lI3Y/ready.txt`. Documentation describes the shorter label.

## Open questions / assumptions

The user approved the indicator scope through the direct implementation request. Keep the existing latest-job selection. Do not initialize memory, apply candidates, or change concurrency during this task. Recommend a single-branch design separately before implementation.
