# Plan: Space and refine conversation bars

Completed: 2026-10-23.

## Brief

The bars crowd the session details. Place the metrics below cwd and move both bars to the end of Conversation. Add a blank line before each bar and improve low-percentage visibility.

## Current state / relevant context

- `renderCore` puts the bars between cwd and the metrics.
- Ten-cell bars round to whole cells, so small percentages can appear empty.
- Existing model routing, quota text, and color semantics already work.

## Proposed implementation

- Move compactions, turns, and cost directly below cwd.
- Add a blank line before context and another before quota.
- Extend bars to 14 cells when space permits. Use fractional block cells for more accurate fill.
- Preserve the compact labeled rows, quota details, missing-data states, and all other sections.

## File-by-file impact

- `extensions/pi-sidebar/pi-sidebar.ts`: row order, spacing, bar fill, and percentage emphasis.
- `extensions/pi-sidebar/pi-sidebar.test.ts`: order, spacing, partial fill, and width checks.
- `docs/pi-sidebar.md`: document the new order and spacing.

## Risks and edge cases

- Longer bars reduce the space for quota details. Keep wrapping and narrow-width bounds.
- Missing percentages remain unknown, not zero. Context and quota retain their different color meanings.
- Existing fullscreen redraw risks remain unchanged.

## Validation / testing

- Run adjacent tests before and after editing.
- Assert metric order and a blank line before each bar.
- Cover fractional fill, empty/full bars, ANSI colors, and existing width/height cases.
- Inspect dark/light xterm screenshots and real Pi reload/resize output without model requests.
- Run diff and pre-commit checks.

## Step-by-step execution checklist

- [x] Inspect the screenshot and current rendering.
- [x] Update the layout and tests.
- [x] Inspect terminal output and update documentation.
- [x] Run final checks and record completion.

## Open questions / assumptions

- One empty row above each bar supplies the requested spacing.
- Keep inline labels instead of adding new headings or a surrounding box.
- No installation, data-source, or global settings changes are needed.

## Results

- Metrics now follow cwd. Both bars sit at the end of Conversation, with one blank line before each.
- Bars use up to 14 cells and eighth-cell fill steps. The context percentage uses bold text.
- Adjacent tests passed for order, spacing, low fractional percentages, missing/full/empty bars, ANSI, Unicode, and size limits.
- Real Pi 1.4.0 passed order and spacing checks at widths 20 and 53, plus reload, narrow hiding, and restoration.
- Inspected populated xterm screenshots in dark and light themes. Evidence is under `/tmp/pi-sidebar-meter-spacing-proof/`.
- Browser ProofShot does not apply to this terminal interface. Xterm screenshots provide visual evidence.
- The terminal error log was empty. No live model request was needed.
- Updated documentation directly because the earlier documentation helper reached its provider usage limit.
- Diff and all-files/scoped pre-commit checks passed.
- Mouse selection, inline images, external editors, and live streaming were not retested. Existing fullscreen risks remain.
