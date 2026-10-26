# Fix BTW foreground input in fullscreen Pi

## Brief

Keep keyboard input in BTW while a main-agent question waits underneath it. Escape must dismiss or abort BTW, not answer or cancel the hidden question. Make the mouse wheel scroll BTW in fullscreen mode.

## Current state / relevant context

- `extensions/pi-btw/extensions/btw.ts` creates a manually focused, `nonCapturing` overlay.
- The installed questionnaire treats this overlay as passive and mounts its question in the editor area.
- That inline question takes keyboard focus while BTW remains visible above it.
- BTW parses raw wheel sequences in `handleInput`. Fullscreen Pi consumes those sequences and dispatches normalized mouse events instead.
- Existing tests cover mouse reporting ownership, but not normalized wheel dispatch or competing inline dialogs.
- The runtime test harness simplifies focus and closes the last overlay rather than the owning overlay.
- The user chose to keep BTW in front. Do not replace this behavior with a question stacked above BTW.
- Existing sidebar edits are unrelated. Leave them untouched.

## Proposed implementation

1. Track explicit BTW keyboard ownership separately from the host's current focus.
2. Route keyboard input to BTW when a background question takes focus and BTW still owns foreground input.
3. Restore foreground focus after the host mounts a hidden question. Keep the waiting question as the return target.
4. Use Pi's terminal input subscription during the focus handoff. Remove the subscription when BTW closes or fails to open.
5. Preserve the waiting question's result. Do not cancel, submit, or recreate it.
6. Honor explicit focus switching. Once the user switches away, stop routing input to BTW.
7. Add normalized wheel handling through `handleMouse`. Retain raw wheel handling for regular mode.

Keep the existing Escape behavior during a BTW request: first abort, then dismiss. Preserve drafts and thread history. Keep Pi responsible for fullscreen mouse reporting.

Use existing public APIs. Do not patch Pi, the questionnaire package, or live settings. Do not add dependencies.

## File-by-file impact

- `extensions/pi-btw/extensions/btw.ts`: foreground keyboard ownership, subscription cleanup, and normalized wheel handling.
- `extensions/pi-btw/tests/btw.focus.test.ts`: exercise competing focus, keyboard handoffs, width changes, and wheel dispatch through real Pi renderers.
- Keep the existing runtime harness unchanged. Its simplified focus handling cannot reproduce the host's dialog behavior.
- `extensions/pi-btw/docs/README.md`: describe foreground focus, waiting questions, and fullscreen scrolling after implementation.
- This plan: record validation results and any implementation changes.

## Risks and edge cases

- A global input listener must not keep handling keys after dismissal or explicit focus switching.
- Closing BTW must leave the main question pending and usable.
- Fullscreen Pi processes some viewport keys before extension listeners. Verify PageUp and PageDown during competing focus.
- Preserve completion navigation, pasted text, focus shortcuts, width changes, and two-stage Escape while streaming.
- Test both arrival orders: question before BTW and question while BTW is already open.
- Other visible dialogs must not receive input intended for BTW or become stranded.
- Avoid new imports that break the package's supported older Pi versions.

## Validation / testing

Success criteria:

1. With a main-agent question waiting behind BTW, typing edits only BTW.
2. Escape closes idle BTW and leaves the question unanswered and uncancelled.
3. Explicit focus switching makes the waiting question usable.
4. The wheel scrolls BTW's transcript under the pointer in fullscreen mode.
5. Closing or reopening BTW leaves no duplicate input subscriptions.
6. Regular-mode scrolling and mouse-reporting cleanup still work.

Add failing regression tests before changing implementation. Run the package's Vitest suite and typecheck. Verify the actual fullscreen `/btw` command with a local fake provider and a pending questionnaire. Inspect terminal output and screenshots. Run `git diff --check` and `pre-commit run --all-files`.

If an installed SDK limitation prevents the approved behavior, report the blocker before changing the approach.

## Step-by-step execution checklist

1. [x] Inspect overlay input, host focus handling, and questionnaire presentation.
2. [x] Record the user's foreground-priority choice.
3. [x] Reproduce the focus failure and add failing regressions.
4. [x] Implement input ownership and normalized wheel handling.
5. [x] Verify both dialog arrival orders and cleanup in real fullscreen Pi.
6. [x] Update affected documentation and run repository hygiene checks.

## Open questions / assumptions

- The approved behavior is to keep BTW in front until the user closes it or switches focus.
- No installation, reload of the user's session, commit, or remote change is authorized.
- Browser verification does not exercise this terminal interface. Use terminal screenshots for visual checks.
- The user approved this plan on 2026-10-25.

## Implementation decisions

- Fullscreen Pi consumes PageUp before extension input listeners. A failing regression confirmed this order.
- BTW now restores foreground focus in a microtask after the host changes focus.
- The input subscription covers keys that arrive before that restoration. It ignores terminal reports and key releases.
- The public renderer method `getFocusedComponent()` supplies the return target. A guarded access handles its omission from the `TUI` interface.
- The mouse handler uses a structural event type to avoid new type imports on older Pi versions.
- Real renderer tests replace the planned changes to the mocked runtime harness.
- Explicit return targets must remain in the mounted component tree. Pi restores stacked overlays through its own handle logic.
- A regression covers a newer overlay that closes in the background. BTW must not return focus to that removed component.

## Validation results

- Locked Pi 0.99.2: all 194 tests and typecheck pass.
- Installed Pi 1.4.0: all 194 tests and typecheck pass.
- Actual fullscreen Pi with a local fake provider and the installed questionnaire: typing stays in BTW.
- PageUp and the wheel scroll BTW. Escape closes BTW and leaves the main question pending.
- Both question arrival orders pass in the live CLI. Enter answers each waiting question without cancellation.
- The live focus shortcut releases BTW input. The main question remains answerable while BTW stays open.
- Drafts survive dismissal and reopening. Automated tests also cover width changes, mount failures, key releases, and subscription cleanup.
- `git diff --check`, `pre-commit run --all-files`, and hooks for the new files pass.
- Minimum supported Pi 0.85.1 was not checked. Browser verification does not apply to this terminal interface.
- Live terminal captures remain outside the repository under `/tmp/pi-btw-fullscreen-check.P29w7I/`.
- No live settings, installation, commit, or remote system changed.

## Completion record

Completed on 2026-10-25. The existing package entry points to this checkout. The user's running Pi session still needs `/reload`.
