# Plan: Main-agent metrics in the sidebar

Completed: 2026-10-25.

## Brief

Show the main agent's active runtime and model cost beside child-agent metrics. Rename the Subagents section to Agents. Keep Main agent first, even when no child has run.

## Current state / relevant context

The sidebar already refreshes every second and formats child runtime and cost. Conversation cost includes assistant, tool, and summary usage. It cannot represent main-agent-only cost. Child metrics replay from the active session branch. Existing uncommitted compact-status changes must remain intact. The adjacent test passes before this change.

## Proposed implementation

Track active intervals between `agent_start` and `agent_end`. Include tool execution and foreground child waits, but exclude idle gaps. Persist each completed interval through a sidebar custom entry. Replay intervals and assistant-message cost from the active branch on startup, tree navigation, compaction, and run completion. Update cost after each finalized assistant response. Finalize an open interval on orderly shutdown.

Prepend Main agent to the existing child rows without grouping it with child names. Keep existing dot colors, status words, duration format, and four-decimal costs. Rename only the displayed section and its rendering helper. Leave child APIs and persisted entry names unchanged. Keep Conversation cost unchanged.

## File-by-file impact

- `extensions/pi-sidebar/pi-sidebar.ts`: main-agent state, replay, lifecycle tracking, and Agents rendering.
- `extensions/pi-sidebar/pi-sidebar.test.ts`: timing, replay, cost separation, status, section naming, and layout assertions.
- `docs/pi-sidebar.md`: describe Agents, timing boundaries, cost scope, and persistence.
- This plan records implementation decisions and verification. No new documentation page or index change is needed.

## Risks and edge cases

- Cost updates only when model usage is reported. It is not an invoice.
- Main runtime overlaps child runtime during foreground waits. Agent runtimes are not additive wall time.
- Historical sessions have model costs but no runtime ledger before this update. Do not estimate old runtime from message timestamps.
- A forced process kill can lose the current interval. Completed intervals survive reload and resume.
- Guard repeated start/end notifications to prevent double counting. Ignore invalid persisted durations and costs.
- Tree navigation must use only the active branch. Session replacement must reset active timing.
- Agents now appears without children, so remove the unreachable empty Activity fallback. Short terminals can still truncate sections.

## Validation / testing

Success requires Main agent first under Agents, increasing live runtime, fixed idle runtime, separate assistant-only cost, and retained completed intervals after replay. Test repeated runs, duplicate events, shutdown, branch changes, compaction, zero/malformed data, child-name collisions, and narrow layouts. Run adjacent tests, `git diff --check`, and `pre-commit run --all-files`. Verify a real isolated Pi terminal session with a local synthetic provider and reload. Use terminal captures instead of browser-only ProofShot. Do not install packages or modify live settings.

## Step-by-step execution checklist

- [x] Inspect the full sidebar and tests, nearby plans, Pi APIs, and passing baseline.
- [x] Record and present the approved implementation scope.
- [x] Implement main-agent replay, lifecycle metrics, and Agents rendering.
- [x] Add and run focused regression tests.
- [x] Verify the terminal path and update affected documentation.
- [x] Run hygiene checks and record final results.

## Open questions / assumptions

The user approved implementation and the Agents rename. Main cost means assistant response usage only, excluding tool, child, compaction, and branch-summary usage. Runtime means cumulative active agent-loop time, not model-only request time. Historical runtime starts when this version tracks an interval. No new dependency, setting, installation, or pricing estimate is needed.

## Results

- Main agent now appears first under Agents. Child rows retain their existing grouping and metrics.
- Adjacent tests pass with Pi's installed jiti loader and host package aliases.
- Regression coverage includes assistant-only costs, invalid metrics, active and idle timing, duplicate lifecycle events, repeated runs, shutdown, branch replay, compaction, and child-name collisions.
- Existing layout checks pass at widths 20, 40, 53, and 80 with short heights and styled text.
- An isolated real Pi session used a local synthetic provider without network requests. Two four-second runs showed `4s · $0.1250`, then `8s · $0.2500`.
- Idle gaps did not increase runtime. Reload retained totals. A cancelled third run stopped at `10s · $0.3750` using synthetic reported usage.
- A fresh process resumed those totals from the session file. `/new` reset the row to `0s · $0.0000`. Width 20 retained the name row.
- Inspected running and stopped dark-theme xterm screenshots under `/tmp/pi-sidebar-agents-proof/`. Terminal captures and synthetic fixtures remain there.
- The initial capture assertion expected exactly two seconds, but the one-second refresh showed one second. The assertion now accepts either tick.
- `docs-maintainer` updated the existing guide. Parent review clarified historical runtime availability and the displayed-data list.
- `git diff --check` and `pre-commit run --all-files` pass.
- No installation, live settings change, dependency, or remote provider request occurred. Browser ProofShot does not apply to this terminal interface. Mouse selection, inline images, light-theme screenshots, and external editors were not retested.
