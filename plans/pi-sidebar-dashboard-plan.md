# Plan: Give the Pi sidebar a dashboard layout

Completed: 2026-10-23.

## Brief

The sidebar currently uses compact footer rows despite having a full vertical column. Give it a clear session identity, readable meters, and grouped metrics. Keep existing data and behavior.

## Current state / relevant context

- The screenshot shows flat labels, short meters, cryptic extension indicators, and large empty sections.
- `renderCore`, section helpers, and item formatters build plain ANSI lines in `extensions/pi-sidebar/pi-sidebar.ts`.
- The restored package remains opt-in. Its compositor uses private Pi fields and can flicker.
- Existing tests cover parsing, state replay, sanitization, compositor cleanup, and the old layout.

## Proposed implementation

- Add side padding and a framed session title with a wrapped name and working directory.
- Separate model identity, thinking level, context use, and optional weekly Codex quota.
- Draw meters across the available width and show their values on separate lines.
- Group turns, cost, and compactions into a metric row. Stack them at narrow widths.
- Use small section dividers rather than repeated full-width title underlines.
- Collapse empty task and agent sections into one quiet activity row.
- Label extension statuses and wrap their text instead of parsing private footer strings.
- Give agent names a separate metrics line and summarize Git changes beside each branch.
- Preserve data refresh, commands, persistence, and compositor behavior.

## File-by-file impact

- `extensions/pi-sidebar/pi-sidebar.ts`: presentation helpers and render functions only.
- `extensions/pi-sidebar/pi-sidebar.test.ts`: replace old layout assertions and add sizing checks.
- `docs/pi-sidebar.md`: describe the implemented dashboard and unchanged limits.
- This plan: record results and completion.
- No manifest, exports, settings, or installation changes are needed.

## Risks and edge cases

- Added spacing can hide later sections on short terminals. Keep section budgets and overflow counts.
- Wide characters and ANSI colors must fit the configured width.
- Long titles and statuses must not introduce terminal control sequences.
- Preserve unknown context, quota failure, Git errors, and empty states.
- This presentation change does not repair the private fullscreen compositor.

## Validation / testing

- Run the existing test script before editing.
- Test the new layout at widths 20, 40, 53, and 80 and several heights.
- Check missing data, long Unicode titles, oversized context use, tasks, agents, and extension statuses.
- Launch real Pi in tmux with the sidebar. Inspect ANSI screen captures before and after reload and resizing.
- Inspect populated renderer fixtures in a terminal without sending model prompts.
- Check dark and light themes where available.
- Use terminal evidence rather than browser ProofShot because this is a terminal UI.
- Run `git diff --check` and `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Inspect current code, examples, and baseline tests.
- [x] Implement the presentation-only redesign and update assertions.
- [x] Verify the real terminal path and populated fixtures.
- [x] Update documentation and run final checks.

## Open questions / assumptions

- The request authorizes a visual redesign. Use Pi theme colors and existing Unicode glyphs, without new dependencies or configuration.
- Keep existing status data. Do not add animations, interactions, or provider-specific status parsers.
- Keep the existing opt-in loading method and global settings unchanged.

## Results

- Changed presentation helpers only. Data collection, session state, commands, and the compositor remain unchanged.
- Baseline and updated adjacent tests passed using the installed Pi jiti loader and aliases.
- Layout tests cover widths 20, 40, 53, and 80 at heights 1, 12, 24, 45, and 100.
- Tests cover ANSI colors, long Unicode titles, unknown context, context above 100%, quota failures, task states, extension wrapping, and overflow.
- Real Pi 1.4.0 fullscreen checks passed for reload, width 20, width 53, narrow-window hiding, and widening.
- Inspected real Pi and populated renderer fixtures in xterm on an isolated Xvfb display.
- Inspected empty and populated layouts with dark colors and a populated layout with light colors.
- Screenshots and terminal captures are under `/tmp/pi-sidebar-dashboard-proof/`. Fixture data is synthetic, not a live agent run.
- Browser ProofShot was not used because the interface is terminal-only.
- The docs-maintainer child hit its provider usage limit. The parent updated and reviewed the documentation directly.
- `git diff --check`, `pre-commit run --all-files`, and scoped pre-commit checks passed.
- No model prompt, global installation, new dependency, or settings change was needed.
- Mouse selection, inline images, live agent streaming, and external-editor behavior were not retested. Existing fullscreen flicker remains possible.
- Unrelated `skills/simple-english/` files appeared during verification and were left untouched.
