# Plan: Simplify the sidebar top section

Completed: 2026-10-23.

## Brief

The framed dashboard does not match the requested sidebar. Restore compact rows like the supplied screenshot. Show two short bars, one for context used and one for quota remaining.

## Current state / relevant context

- `renderCore` surrounds the top section with a padded session frame.
- The selected and routed model line already matches the requested footer format.
- Quota data comes from existing Codex usage and pi-quotas statuses.
- The screenshot uses a Conversation heading and compact labeled rows.

## Proposed implementation

- Remove the frame and metric tiles. Use a Conversation heading, title, model, cwd, and plain metric rows.
- Put a short block bar beside `ctx` and another beside `quota`.
- Retain context percentage and token counts beside the context bar.
- Use the direct weekly Codex value when available. Otherwise use the lowest remaining percentage in the quota status.
- Keep existing quota text and reset details under the quota row. Show an unknown value when no percentage exists.
- Preserve routed-model logic, other sections, refresh behavior, and the compositor.

## File-by-file impact

- `extensions/pi-sidebar/pi-sidebar.ts`: compact top layout and quota percentage extraction.
- `extensions/pi-sidebar/pi-sidebar.test.ts`: two-bar layout, quota edge cases, and existing width checks.
- `docs/pi-sidebar.md`: describe compact rows and the quota bar.
- This plan records the outcome.

## Risks and edge cases

- Multiple windows share one quota bar. The smallest remaining percentage identifies the tightest limit.
- Status formats without percentages retain their text but show an unknown bar value.
- Missing quota data must not look like zero remaining. Long details must wrap without exceeding the sidebar.
- Existing private-renderer risks remain unchanged.

## Validation / testing

- Run adjacent tests before and after editing.
- Assert no frame, two bar rows, plain metrics, quota deduplication, and routed-model identity.
- Cover missing, malformed, multiple, ANSI-colored, zero, and full quota percentages.
- Keep width and height checks with Unicode and ANSI colors.
- Inspect dark/light xterm screenshots and real Pi reload and resize captures without model requests.
- Run `git diff --check` and pre-commit checks.

## Step-by-step execution checklist

- [x] Inspect the screenshot, current layout, quota formatting, and baseline tests.
- [x] Replace the framed layout and update tests.
- [x] Inspect terminal output and update documentation.
- [x] Run final checks and record the result.

## Open questions / assumptions

- The screenshot guides the top section only. Other sections remain unchanged.
- One quota bar summarizes the tightest known percentage when several windows exist.
- No installation, global settings, new dependency, or quota request changes are needed.

## Results

- Removed the session frame, standalone meter headings, and metric tiles.
- Added compact `ctx` and `quota` rows with short block bars. Plain metric rows match the screenshot.
- Preserved the footer-style selected/routed model line and all other sections.
- Quota extraction covers colored, multiple, compact, zero, full, invalid, and missing percentage statuses.
- Adjacent tests passed, including ANSI/Unicode width and height checks and direct Codex precedence.
- Inspected populated xterm screenshots in dark and light themes.
- Real Pi 1.4.0 passed reload, widths 20/53, narrow hiding, and restoration checks with an empty error log.
- Evidence is under `/tmp/pi-sidebar-simple-bars-proof/`. The terminal assertions exclude Pi's block-character logo when counting bars.
- Browser ProofShot does not apply to this terminal interface. Xterm screenshots provide visual evidence.
- Updated documentation directly because the earlier documentation helper reached its provider usage limit.
- `git diff --check` and all-files/scoped pre-commit checks passed.
- No live model request, installation, global settings change, or provider-fetch change occurred.
- Mouse selection, inline images, external editors, and live streaming were not retested. Fullscreen redraw risks remain.
