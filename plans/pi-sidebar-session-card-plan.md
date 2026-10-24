# Plan: Unify the sidebar session card

Completed: 2026-10-23.

## Brief

The title card ends before the model and context, making the top area look like unrelated sections. Keep session details, context, quotas, and metrics inside one card. Show the selected and routed models using the native footer format.

## Current state / relevant context

- `renderCore` frames only the title and directory. Model and meters sit outside it.
- Pi's footer shows the latest successful physical response beside a virtual selection.
- Public session context exposes assistant model and thinking fields. No private session access is needed.
- `pi-quotas-usage` and `pi-quotas-token-status` supply quota footer statuses. They currently appear under Extensions.
- Direct Codex selections also have an existing weekly meter.

## Proposed implementation

- Extend the session frame around all top content. Use small inline labels, not separate context headings.
- Show `(provider) model • thinking → routed-model • thinking`. Wrap long model lines inside the frame.
- Resolve the route from the latest successful response in the active session context. Ignore failed and aborted responses.
- Move existing pi-quotas statuses into the card, preserving their colors and text. Remove their duplicates from Extensions.
- Keep the direct Codex weekly meter in the card. Do not change quota requests, provider routing, or global settings.
- Leave task, agent, Git, and compositor behavior unchanged.

## File-by-file impact

- `extensions/pi-sidebar/pi-sidebar.ts`: card layout, route snapshot, quota-status placement.
- `extensions/pi-sidebar/pi-sidebar.test.ts`: route, frame, wrapping, quota placement, and sizing checks.
- `docs/pi-sidebar.md`: describe the unified card and route meaning.
- This plan: record verification and completion.

## Risks and edge cases

- Frame padding reduces inner width. Wrap model and quota lines without losing the closing border.
- Short terminals still crop later content. Preserve existing bounds.
- A virtual selection without a successful physical response shows no arrow.
- Failed responses must not overwrite the last successful route. Physical selections must not show stale virtual routes.
- Existing fullscreen flicker and private rendering risks remain.

## Validation / testing

- Run adjacent tests before and after editing.
- Assert frame membership for model, context, quota, and metrics.
- Test direct, virtual, failed, aborted, missing, and changed routes.
- Check widths 20, 40, 53, and 80 with ANSI colors and Unicode.
- Inspect terminal fixture screenshots and real Pi reload/resize behavior without model requests.
- Run `git diff --check` and repository pre-commit checks.

## Step-by-step execution checklist

- [x] Inspect the sidebar, quota statuses, and native footer behavior.
- [x] Implement the unified card and routed-model snapshot.
- [x] Update tests and verify terminal rendering.
- [x] Update documentation and run hygiene checks.

## Open questions / assumptions

- The requested top section means one enclosing session frame, including context and all existing quota statuses.
- Quotas means the existing pi-quotas footer data plus the existing direct Codex weekly meter.
- No new provider queries or dependency is needed.

## Results

- One frame now encloses all top content. Known quota statuses no longer appear under Extensions.
- Routed-model snapshots use the public `buildSessionProjection()` messages and the model registry.
- `message_end` includes its response explicitly because Pi persists it after extension handlers run.
- Short labels `Ctx` and `COMPACTS` preserve values at the minimum sidebar width.
- Baseline and updated adjacent tests passed with installed Pi aliases.
- Tests cover successful, failed, aborted, missing, changed, and stale routes, plus thinking off and non-reasoning models.
- Frame, ANSI safety, quota placement, and width/height checks passed at widths 20, 40, 53, and 80.
- Real Pi 1.4.0 restored a synthetic virtual-model session with the exact requested model-line format.
- Reload, width 20, width 53, narrow-window hiding, and restoration passed. The terminal error log was empty.
- Inspected populated dark and light fixtures in xterm. Evidence is under `/tmp/pi-sidebar-session-card-proof/`.
- Browser ProofShot does not apply to this terminal-only interface. Xterm screenshots provide visual evidence instead.
- The parent updated documentation because the earlier documentation helper reached its provider usage limit.
- `git diff --check`, `pre-commit run --all-files`, and scoped pre-commit checks passed.
- No live model request, quota-fetch change, dependency, installation, or global settings change was needed.
- Mouse selection, external editors, inline images, and live agent streaming were not retested. Existing fullscreen risks remain.
