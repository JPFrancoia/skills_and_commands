# Plan: Per-task time and cost in the sidebar

Completed: 2026-10-25.

Retracted: 2026-10-25. Remove per-task metrics only. Keep Main agent metrics, the Agents heading, and Conversation accounting.

## Brief

Show cumulative active time and reported model cost beneath each task. Include costs from children launched for that task. Keep detached children assigned to their original task after the main agent changes tasks.

## Current state / relevant context

The sidebar already tracks main-agent active intervals and child metrics. Task rows currently show only a subject, status, and active label. The installed todo package also persists `rpiv-todo-state` entries for nested tool calls. Its clear action resets task IDs, so task identity must include the task-list generation. Existing uncommitted sidebar changes and unrelated plans must remain intact.

## Proposed implementation

- Count task time only while exactly one task is in progress and the main agent loop is active. Flush intervals on task changes, loop completion, and orderly shutdown. Reuse the one-second refresh.
- Assign each main-agent response cost to the task active at turn start. Do not guess a split within one response. Leave usage outside a task unassigned.
- Capture the task when a child launch starts. Persist the assignment and latest cumulative child cost. Detached child updates retain that assignment after task completion, reload, and resume.
- Prefer inclusive reported child totals. Otherwise sum reported usage and descendant totals without adding descendants twice. Management/status calls must not create another charge.
- Persist task runtime and response-cost increments, plus replaceable child snapshots, as sidebar custom entries. Replay only the active branch. Separate task-list generations when clear reuses IDs.
- Read authoritative todo custom entries during replay, with legacy tool results as fallback. Observe both direct and nested todo tool events.
- Retain task subjects and active labels. Add a compact dim metrics line so long subjects do not hide money. Show recorded totals only, with zero before tracking begins. Do not reconstruct historical task metrics.

## File-by-file impact

- `extensions/pi-sidebar/pi-sidebar.ts`: todo replay, task metric state, launch attribution, persistence, lifecycle hooks, and task rows.
- `extensions/pi-sidebar/pi-sidebar.test.ts`: time, cost, child attribution, persistence, malformed values, task-list resets, and layout regressions.
- `docs/pi-sidebar.md`: task metric rules, cost scope, persistence, and limits.
- This plan records decisions and results. No new documentation page, dependency, setting, or installation is needed.

## Risks and edge cases

Task labels do not prove what work an agent actually performs. Metrics follow status changes and launch boundaries. A response belongs to the task active when its turn starts. Child cost can increase after a task completes. Task time is main-loop elapsed time, not summed parallel worker time. Unknown or invalid usage cannot become a billing estimate. Forced termination can lose an open time interval. Old tasks have no per-task history before this update.

## Validation / testing

Success requires live task time, fixed idle time, cumulative resumed intervals, and main-plus-child cost without duplicate polling charges. Verify foreground, detached, nested, and workflow child totals. Verify task changes during a child run, late completion, repeated events, clear with reused IDs, custom todo snapshots, branch replay, compaction, reload, shutdown, and invalid metrics. Run adjacent tests and layout checks at narrow widths. Run an isolated real Pi terminal fixture without remote model requests. Run `git diff --check` and `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Inspect task state, sidebar patterns, Pi lifecycle APIs, and child cost reports.
- [x] Confirm cost scope and record the plan.
- [x] Implement task metrics and regression coverage.
- [x] Verify the real terminal path and update the existing guide.
- [x] Run final checks and record results.

## Open questions / assumptions

The user selected **Include child agents**. The earlier active-time proposal remains the timing rule. No further scope decision blocks implementation. Metrics describe reported usage, not invoices. Existing tasks start with zero recorded metrics rather than estimated history.

## Retraction plan

The user no longer wants time or money shown for each task. Restore single-line task rows with status, subject, and active label. Remove task metric state, persistence, attribution, helpers, exports, and feature tests. Keep authoritative todo replay without task-list generations. Keep foreground alias removal because Conversation accounting also uses it.

Update `extensions/pi-sidebar/pi-sidebar.ts`, its adjacent test, and `docs/pi-sidebar.md`. Preserve this completed plan as a decision record. Existing session entries remain untouched and become ignored. No installation or live settings change is needed.

Success requires single-line tasks, no new task metric entries, unchanged Main agent metrics, and correct main-plus-child Conversation totals. Test historical task entries, lifecycle events, child alias replacement, and the real terminal reload/resume path. Run the adjacent suite, `git diff --check`, and `pre-commit run --all-files`.

- [x] Remove per-task tracking and restore single-line rows.
- [x] Add retraction regressions and update documentation.
- [x] Verify the terminal and final checks.

## Original implementation results

- Tasks now show a separate active-time and four-decimal cost line.
- Regression coverage verifies timer boundaries, resumed work, idle exclusion, shutdown, compaction, branch navigation, and reload.
- Cost tests cover main responses, inclusive child totals, repeated snapshots, task changes during a run, detached completion, unassigned reports, and invalid values.
- Todo custom snapshots take precedence over later tool results. Legacy state before the first custom clear still separates reused task IDs.
- Clearing a task list and reusing ID 1 does not reuse that task's cost or time.
- The Conversation total fix interrupted implementation at the user's request. Its separate completed plan records deduplication and response-refresh behavior.
- An isolated real Pi process used the installed `rpiv-todo` package and a local synthetic provider. No remote model request occurred.
- A task recorded `2s · $0.5500` with foreground children. Idle time and reload did not change those totals.
- A detached child launched during a second task brought its cost to `$1.0500`. A late report after completion increased it to `$1.3000`, while time stayed at 2 seconds.
- Reload and a fresh process resumed task totals and the `$1.675` Conversation total. Width 20 retained the task row. Final fixture stderr was empty.
- Inspected `/tmp/pi-sidebar-task-proof/tasks.png`. Terminal captures and fixture files remain beside it.
- `docs-maintainer` updated the existing guide. Parent review clarified child launch ownership.
- The adjacent suite, `git diff --check`, and `pre-commit run --all-files` pass.
- No dependency, installation, live settings change, or unrelated edit was needed. Existing sidebar work and concurrent pi-btw edits remain untouched.
- Browser ProofShot does not apply to this terminal UI. Mouse selection, inline images, external editors, and light-theme screenshots were not retested.

## Retraction results

- Removed task metric state, helpers, persistence, child attribution, response attribution, timers, and metrics rows.
- Kept todo snapshot validation and replay so nested todo changes still appear correctly.
- Kept foreground alias removal as a separate helper for Conversation deduplication.
- Tests assert single-line task rows, ignored historical task metrics, no new task metric entries, Main agent metrics, and canonical child costs.
- Real isolated Pi reload preserved Conversation `$1.675` and Main agent `$0.6250` while removing the task metrics line.
- A fresh task displayed only its subject and active label while running, then its completed status.
- Detached child updates still raised Conversation from `$1.425` to `$1.675` without adding task metrics.
- Reload and fresh-process resume retained single-line tasks and agent totals. Existing task metric entries stayed untouched. Fresh sessions wrote none.
- Inspected `/tmp/pi-sidebar-task-retraction-proof/tasks.png`. Fixture stderr was empty.
- `docs-maintainer` updated the existing guide. Parent review confirmed Conversation and agent documentation stayed unchanged.
- The adjacent suite, `git diff --check`, and `pre-commit run --all-files` passed.
- No installation, live settings change, historical entry deletion, or remote model request occurred.
- Mouse selection, images, external editors, and light-theme screenshots were not retested.
