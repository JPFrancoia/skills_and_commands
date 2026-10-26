# Plan: Consistent conversation cost

Completed: 2026-10-25.

## Brief

Conversation cost must include main-agent and child spending without counting tool-reported child usage twice. The screenshot also exposes a delayed Conversation update after each response.

## Current state / relevant context

Conversation sums transcript usage across all entries. Main agent uses assistant usage on the active branch and includes the response before persistence. Child rows use persisted snapshots and async status files. Nested totals can include descendants, while those descendants also have rows. Task metrics are partially implemented and remain paused during this fix. Preserve those edits and unrelated work.

## Proposed implementation

Use the active branch for Conversation statistics. Remove covered child usage from recorded tool costs, then add canonical child rows once. Retain unrelated tool and summary costs. Persist nested subagent tool-usage offsets because nested calls have no transcript entries. Read direct offsets from subagent tool results. Keep missing or invalid reports from removing known spending.

Normalize async run keys across tool results and status reports. Remove older foreground aliases during replay. Display each nested agent's own cost rather than an inclusive cost plus descendant costs. Include the just-finished response before Pi persists it. Reuse current refresh and persistence mechanisms.

## File-by-file impact

- `extensions/pi-sidebar/pi-sidebar.ts`: cost reconciliation, canonical child keys, nested own costs, response refresh, and branch scope.
- `extensions/pi-sidebar/pi-sidebar.test.ts`: accounting, nested tool usage, repeated reports, replay, and live response regressions.
- `docs/pi-sidebar.md`: total rules and limits.
- This plan preserves the approved scope and verification results.

## Risks and edge cases

Reported costs are not invoices. Older sessions may lack nested usage records needed to separate tool spending. Do not invent historical charges. Child rows can be hidden by terminal height, and summaries or unrelated tools can make Conversation exceed visible agent totals. Branch navigation must not mix spending from other branches. Repeated polling must replace snapshots rather than add charges.

## Validation / testing

Reproduce missing child spending and delayed response updates in regression tests before implementation. Verify direct, async, nested, and workflow children. Verify aliases, repeated tool/status reports, nested codemode usage, invalid values, missing reports, summaries, branch replay, and reload. Run the adjacent test, an isolated Pi terminal fixture, `git diff --check`, and `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Inspect accounting sources and the screenshot.
- [x] Record and present the approved fix.
- [x] Add regression tests and implement consistent accounting.
- [x] Verify the terminal path and update documentation.
- [x] Record final checks.

## Open questions / assumptions

The user approved fixing total accounting. Preserve reported non-child spending. No dependency, installation, remote model request, or live settings change is needed. Resume the existing task-metric work after this fix.

## Results

- Reproduced the duplicate tool-charge failure before implementing the fix.
- Conversation now includes canonical child costs, keeps unrelated usage, and refreshes the completed response immediately.
- Nested rows show own costs. Legacy inclusive snapshots replay as own costs where their hierarchy is known.
- Async results use canonical keys. Replaced status rows persist removal records so obsolete rows do not return after reload.
- Adjacent tests pass, including repeated reports, nested tool offsets, invalid values, legacy snapshots, aliases, summary costs, and the screenshot arithmetic.
- An isolated real Pi process showed `$0.550 = $0.2500 + $0.2500 + $0.0500` after a foreground call.
- A detached child increased the total to `$1.050`, then `$1.300`. Repeated polling and reload retained `$1.300`.
- The real fixture exposed a boolean/string guard bug. Fixed it and added a legacy nested-call regression. The fixture also needed Pi's session-file identifier, not its UUID.
- Final isolated stderr was empty. Inspected `/tmp/pi-sidebar-conversation-cost-proof/costs.png` and saved terminal captures beside it.
- The adjacent suite, `git diff --check`, and `pre-commit run --all-files` pass.
- `docs-maintainer` updated the existing guide. Parent review clarified main-agent exclusions and display precision.
- No installation, live settings change, remote model request, or unrelated file edit occurred. The user's other session was not reloaded.
- Browser ProofShot does not apply to this terminal UI. Mouse selection, inline images, external editors, and light-theme screenshots were not retested.
