# Plan: Compact sidebar extension statuses

Completed: 2026-10-25.

## Brief

Extension indicators take too much space compared with conversation data. Move them into Conversation as dim inline text. Remove their separate heading and repeated key labels.

## Current state / relevant context

- `extensionItems` renders a key followed by one or more status rows.
- `renderSidebar` reserves space for a separate Extensions section.
- The supplied screenshot shows MCP and Ponytail taking four rows plus a heading.
- Quota indicators already belong to Conversation and keep their existing presentation.

## Proposed implementation

Join sanitized extension status values with ` · ` below the quota details. Wrap the combined text within the content width. Apply the theme's dim color after removing embedded styles. Keep existing sorting and exclusions, including quota and native MCP keys. Remove the separate Extensions section and its height reserve.

## File-by-file impact

- `extensions/pi-sidebar/pi-sidebar.ts`: compact status text and Conversation placement.
- `extensions/pi-sidebar/pi-sidebar.test.ts`: placement, shared row, dim styling, filtering, and width checks.
- `docs/pi-sidebar.md`: implemented layout description, delegated to `docs-maintainer` if available.
- This plan records scope and validation.

## Risks and edge cases

Long statuses still wrap. Status values replace internal key labels, as in Pi's native footer. Extension-specific colors become dim. Quota warnings retain their colors. Existing private compositor risks remain unchanged.

## Validation / testing

Run adjacent tests before and after editing. Assert no Extensions heading, no repeated keys, compact MCP/Ponytail text below quota, and unchanged quota presentation. Cover empty and styled statuses plus narrow widths and short heights. Inspect dark and light terminal screenshots. Run an isolated Pi session without model requests or installation. Run `git diff --check` and `pre-commit run --all-files`.

## Step-by-step execution checklist

- [x] Inspect the screenshot, sidebar, nearby patterns, and passing baseline tests.
- [x] Compact status rendering and update regression tests.
- [x] Inspect terminal output and update affected documentation.
- [x] Run final checks and record results.

## Open questions / assumptions

The request approves this bounded layout change. Short statuses share one row instead of merely shrinking to one row each. No installation, live settings change, new dependency, or status producer change is needed. Browser ProofShot does not apply to this terminal interface. Use terminal captures instead.

## Results

- Extension status values now share dim wrapped rows below quota in Conversation, without a separate heading or repeated key labels.
- Adjacent tests passed before and after editing. Coverage includes compact placement, style removal, empty values, exclusions, quota colors, Unicode, widths, and heights.
- The shorter layout fits more content. The truncation test now uses height 30 instead of 32 to retain overflow coverage.
- Inspected populated dark and light xterm screenshots under `/tmp/pi-sidebar-compact-extensions-proof/`.
- Isolated real Pi checks passed for compact placement, reload, widths 20/53, narrow-window hiding, and restoration. Stderr was empty.
- `docs-maintainer` updated `docs/pi-sidebar.md`. Parent review corrected one remaining Extensions reference and restored the bar-spacing description.
- `git diff --check` and `pre-commit run --all-files` passed.
- No live model request, installation, or user settings change occurred. Mouse selection, inline images, and external editors were not retested.

## Spacing follow-up

The user requested less space below quota after reviewing `/home/djipey/Desktop/screen-2026-10-25-12-24-00.png`. Removed the blank row before extension indicators. Regression checks require indicators immediately after the quota bar or token details. The adjacency test failed before the fix and passed afterward. Inspected updated dark and light terminal screenshots at `/tmp/pi-sidebar-compact-extensions-proof/spacing-{dark,light}.png`. Documentation now describes immediate placement. This follow-up did not repeat the isolated Pi reload and resize checks.

