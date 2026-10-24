# Plan: Fix colored cap text and add metric icons

Completed: 2026-10-23.

## Brief

The quota renderer colors `cap:` and `OK` separately, so the previous literal match failed. Add the requested metric icons without changing quota data.

## Current state / relevant context

A regression fixture reproduces the visible marker. Direct Codex rendering also repeats the original status through a second path.

## Proposed implementation

Remove only the healthy cap marker while preserving color codes and warnings. Reuse the cleaned status in both rendering paths. Use 🧹, 🔄, and 💰 before metric labels, with terminal-width-aware padding.

## File-by-file impact

- `extensions/pi-sidebar/pi-sidebar.ts`: cleanup and label rendering.
- `extensions/pi-sidebar/pi-sidebar.test.ts`: colored and plain cap cases, warnings, icons, and alignment.
- `docs/pi-sidebar.md`: labels and cap warning behavior.

## Risks and edge cases

Preserve `cap:REACHED`. Emoji widths must not exceed narrow sidebar bounds. No provider or settings changes.

## Validation / testing

Run regression tests, real Pi reload with separately colored cap text, a terminal screenshot, width checks, and repository hygiene checks.

## Step-by-step execution checklist

- [x] Reproduce the colored-marker failure.
- [x] Fix both display paths and add metric icons.
- [x] Verify terminal output and update documentation.

## Open questions / assumptions

The healthy marker is redundant. Spending-cap warnings remain useful and visible. Use 🔄 for conversation turns.

## Results

- Regression tests first reproduced the separately colored marker.
- Healthy markers now disappear in both quota display paths. Spending-cap warnings remain visible.
- Metric labels have icons and terminal-width-aware padding.
- Adjacent tests cover colored/plain markers, warnings, direct Codex rendering, alignment, and width/height bounds.
- Real Pi fullscreen checks passed before and after reload with separately colored fixture statuses and an empty error log.
- Inspected the terminal screenshot at `/tmp/pi-sidebar-cap-icons-proof/dark.png`. Browser ProofShot does not apply to this terminal interface.
- Tests, `git diff --check`, and all-files/scoped pre-commit passed.
- Updated the small documentation change directly after the earlier documentation helper exhausted its provider quota.
- No live model request or global settings change occurred. Live streaming was not retested.
