# Plan: Restore the sidebar for a fullscreen trial

Completed: 2026-10-23.

## Brief

Restore the removed Pi sidebar so the user can try it with current fullscreen mode. Keep activation opt-in and preserve global settings. Fullscreen may avoid normal scrollback repaint problems, but private rendering hooks still need verification.

## Current state / relevant context

- Commit `333ebc5` removed `extensions/pi-sidebar.ts` and its adjacent test.
- The last version is available from `333ebc5^`. Its tests pass against installed Pi 1.4.0.
- The sidebar narrows `terminal.columns`, wraps `tui.doRender`, and paints a fixed right column with terminal commands.
- Pi has no documented persistent sidebar API. Fullscreen owns the transcript viewport and mouse handling.
- The existing sidebar documentation remains, but its installation paths are stale.
- Current global settings use fullscreen and do not load the sidebar.

## Proposed implementation

1. Recover the latest implementation and tests in `extensions/pi-sidebar/`.
2. Add the same minimal local package manifest used by neighboring extensions.
3. Apply only compatibility fixes supported by current Pi source and terminal checks.
4. Keep activation explicit through `pi -e`. Do not install globally or change the user's mode.
5. Document the trial, known rendering limits, and how to stop using it.

## File-by-file impact

- `extensions/pi-sidebar/pi-sidebar.ts`: restored implementation and required compatibility fixes.
- `extensions/pi-sidebar/pi-sidebar.test.ts`: restored tests and focused regression coverage.
- `extensions/pi-sidebar/package.json`: local Pi package entry point.
- `docs/pi-sidebar.md`: current paths, trial command, and verified fullscreen limits.
- This plan: decisions and validation results.

## Risks and edge cases

- Private rendering APIs can change between Pi versions.
- Raw painting may conflict with fullscreen viewport updates or mouse coordinates.
- Other custom footers can replace the sidebar or be replaced by it.
- Narrow terminals must restore full-width content without stale sidebar rows.
- Quota requests use the existing read-only account usage endpoint. Missing quota data must not break the UI.
- Restoring this code does not prove that every original UI failure is fixed. The removal commit does not explain those failures.

## Validation / testing

Success means the recovered tests pass and a real Pi fullscreen session shows a separate sidebar without overlapping transcript or editor text. Verify narrow and wide terminal sizes, width changes, on/off, transcript scrolling, and reload. Check regular mode only for compatibility comparison, not as a promise of a complete UI fix.

Run the adjacent test with the installed jiti aliases. Run `git diff --check` and `pre-commit run --all-files`. Use tmux captures for terminal proof because browser-based ProofShot does not apply to this TUI. Report untested mouse and terminal-specific behavior explicitly.

## Step-by-step execution checklist

- [x] Recover the removed source, tests, history, and existing documentation.
- [x] Run the original tests against installed Pi.
- [x] Assess current fullscreen rendering contracts.
- [x] Restore the local package and add required compatibility coverage.
- [x] Run focused tests and terminal checks.
- [x] Update documentation and record validation limits.
- [x] Run repository hygiene checks.

## Open questions / assumptions

- The user's direct restore request approves this scope without another confirmation.
- Opt-in activation is the safest reversible default for a previously troublesome extension.
- Keep the old features rather than redesigning the sidebar for this trial.
- No commit, global installation, or third-party package edits are requested.

## Results and decisions

- Restored the source and tests from `333ebc5^` inside a local package. Runtime logic remains unchanged.
- Added compositor assertions for stopped rendering, on/off width reporting, narrow windows, and configurable width.
- Source review confirmed that fullscreen still tracks a separate screen model. The old raw painter remains outside that model.
- Kept the requested restoration experimental instead of rewriting the layout or claiming supported fullscreen integration.
- Original and restored tests passed with the installed host jiti aliases. The package entry point resolves correctly.
- Real Pi 1.4.0 fullscreen checks passed at 180×45 with the current global extensions and explicit sidebar loading.
- Exercised `/name`, `!seq 1 150`, expanded output, PageUp, Ctrl+End, width 40, on/off, `/reload`, and `/git`.
- Narrowing to 100×30 removed the sidebar without stale separators. Widening restored it.
- A scroll capture caught a briefly blank sidebar before repainting. Treat flicker as a known limitation, not a fixed bug.
- A separate regular-mode launch also rendered the restored sidebar. This does not establish that either mode fixes the earlier failures.
- Browser ProofShot does not apply to this terminal UI. Raw terminal logs and screen captures are under `/tmp/pi-sidebar-proof/`.
- Mouse selection, inline images, real external-editor suspension, and live agent-stream rendering were not tested.
- The installed recap extension generated a recap during reload. No explicit test prompt was sent to the main agent.
- Global settings still use fullscreen and contain no sidebar package entry. No global installation was performed.
- `git diff --check` and `pre-commit run --all-files` passed. The latter checks tracked files only.
- Documentation now uses the package path and explains trial removal, footer ownership, minimum width, and rendering risks.
