# Plan: Hide timestamps for folded assistant activity

Completed: 2026-10-23. The user confirmed that real online tool calls no longer leave orphan timestamps.

## Brief

Pi-minimalist hides assistant activity, but separate timestamp entries remain visible. Attach assistant timestamps to rendered messages so hidden messages cannot leave empty separators. Keep timestamps for user messages.

## Current state / relevant context

- `pi-message-timestamps` appends a custom entry at every user and assistant message start.
- Pi-minimalist folds assistant components but does not fold these custom entries.
- Pi 1.3.0 exports `AssistantMessageComponent`. Its renderer includes a leading blank separator for visible content.
- The installed minimalist extension wraps this same renderer and returns empty output for hidden activity.

## Proposed implementation

- Keep custom timestamp entries for user messages only. Include their role in new entries.
- Hide old assistant timestamp entries. Identify legacy user entries from active session history.
- Wrap the assistant renderer once. Replace its existing blank separator with a timestamp only when content remains visible.
- Keep line counts unchanged to preserve mouse coordinates and folding behavior.
- Use the rendered output, not private pi-minimalist settings or guessed tool states.
- Leave session files, third-party packages, and live installation settings unchanged.

## File-by-file impact

- `extensions/pi-message-timestamps/pi-message-timestamps.ts`: timestamp placement and legacy entry handling.
- `extensions/pi-message-timestamps/pi-message-timestamps.test.ts`: hidden messages, legacy entries, reload, and real component integration.
- `docs/local-resources.md`: describe timestamp behavior and activation.
- This plan: retain decisions and check results.

## Risks and edge cases

- The renderer wrapper depends on Pi's component API. Unknown layouts retain native output rather than adding misplaced timestamps.
- The wrapper must work before or after minimalist loads, including repeated reloads.
- Old user timestamps must remain visible after reload and session navigation.
- Invisible output must remove timestamp spacing as well as timestamp text.

## Validation / testing

- Reproduce orphan timestamps with the current implementation and minimalist components.
- Test visible and hidden messages, errors, narrow widths, and legacy entries.
- Test both extension load orders and reload idempotence.
- Run the adjacent test through the installed jiti loader.
- Run `git diff --check` and `pre-commit run --all-files`.
- Verify the real Pi TUI if possible. Otherwise state that limitation.

## Step-by-step execution checklist

- [x] Inspect the screenshot and both extensions.
- [x] Define the fix and success criteria.
- [x] Create the isolated implementation worktree.
- [x] Reproduce the failure in a test.
- [x] Implement and validate the fix.
- [x] Update documentation and record check results.
- [x] Merge directly into `master`, as the user requested, and verify the updated extension after reload.

## Validation results

- The regression test failed against the original implementation because a hidden assistant entry still rendered a timestamp.
- The adjacent jiti test passes with real Pi assistant components, legacy entries, narrow widths, errors, and simulated load orders.
- A real Pi 1.3.0 TUI replay with pi-minimalist 0.3.1 shows two timestamps: the user message and final answer.
- Expanding tools restores timestamps for visible thinking messages. Folding removes them again.
- Two real `/reload` operations preserve both timestamps without restoring orphan entries.
- Reversing extension load order also preserves the expected output.
- The `max` preset hides intermediate commentary and its timestamp, leaving one activity summary and the final answer.
- Real reload testing found that Pi rebuilds custom entries before `session_start`. Shared state now retains the legacy user lookup across reloads.
- `git diff --check` and `pre-commit run --all-files` pass in both checkouts.
- Terminal captures are under `/tmp/pi-timestamps-proof-f74olaxg/`. Browser-based ProofShot does not apply to this terminal UI.
- Implementation commit `a4b14fd` was merged directly into `master` at the user's request. No PR was opened.
- The user confirmed the fix after a real web search and page fetch in the reloaded session.
- No live settings or third-party files changed for this fix.

## Open questions / assumptions

- The user's direct request approves this focused fix.
- A visible activity summary may retain one timestamp. Fully hidden messages must retain none.
- The live installation points at the original checkout. Reload activates the merged implementation.
