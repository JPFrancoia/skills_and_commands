# Plan: Pi work summaries

## Brief

Add `pi-work-summary` as a local fork of `pi-minimalist` 1.0.0. Each tool group will explain the work and its result. The display will keep tool counts, elapsed time, and expansion controls.

## Current state / relevant context

- The installed upstream package groups adjacent tool and thinking rows.
- Its renderer tracks groups separately from Pi model turns.
- `pi-recap` supplies an existing pattern for small model calls and saved summaries.
- This repository has no `docs/CONTEXT.md` file.
- An unrelated edit exists in `extensions/pi-jev-router/pi-jev-router.ts`. Leave it unchanged.

## Proposed implementation

Copy the upstream rendering files and preserve its MIT license. Remove the menu, command, and display-settings file access. Keep fixed display choices in source code.

Read `workSummary.model` from `~/.pi/agent/settings.json`, as `pi-recap` does. Use the existing recap default when no override exists. Do not change the live Pi setup.

Track groups through public message and tool events. A prose boundary closes the preceding group. One group can contain several model turns. Measure elapsed wall time, including model and tool time, but exclude summary generation.

Generate a short live summary from public context and actions. Refresh it at model-turn boundaries, with a delay that limits repeated calls. Generate a finished summary after the following prose completes, or after the agent stops. Use present tense for current work and past tense for finished work. State current unresolved problems in present tense.

Each summary must name the work, explain its purpose where necessary, and state the result or blocker. Do not send private thinking or images to the summary model. Bound the public context, arguments, and results. Save finished summaries and durations as custom session entries. Reopen saved entries without new model calls.

Keep the existing rendering structure rather than add a second extension over upstream. The fork must replace upstream, not run beside it.

## File-by-file impact

- `extensions/pi-work-summary/package.json` and `LICENSE`: local package and upstream attribution.
- `extensions/pi-work-summary/index.ts`: lifecycle, model calls, saved data, and repaint support.
- `extensions/pi-work-summary/src/`: upstream rendering, fixed choices, group tracking, and summary prompts.
- `extensions/pi-work-summary/pi-work-summary.test.ts`: event, model, persistence, and rendering checks.
- `docs/pi-work-summary.md` and `docs/README.md`: behavior, model choice, privacy, installation, and limits.
- This plan: decisions and validation results.

## Risks and edge cases

- A model can describe attempted work as success. Require result evidence and explicit uncertainty in its prompt.
- A late result can reach another session or branch. Cancel requests and reject stale responses at lifecycle boundaries.
- Text and thinking rows can rebuild. Use stable tool IDs and message timestamps.
- A terminal can be narrow. Wrap summary text without losing the tool row or expansion controls.
- The upstream renderer wraps Pi component methods. Pi updates can break this interface.
- Model calls add cost and send selected public activity to the configured provider.

## Validation / testing

- Check model defaults and `workSummary.model` overrides with temporary settings files.
- Check that no menu or display-settings writer remains.
- Check groups with several model turns, a single tool, and thinking before prose.
- Check running and finished prompt instructions, including failures and requests for help.
- Check stable elapsed time, saved summaries, reload, branch changes, and stale responses.
- Check wrapping, counts, expansion, and original tool ownership with Pi components.
- Run an isolated terminal smoke test without changing live settings.
- Run the adjacent test with Pi's installed jiti loader and host aliases.
- Run `git diff --check` and `pre-commit run --all-files`.
- ProofShot targets browser pages. Use terminal capture for this terminal-only display.

## Step-by-step execution checklist

- [x] Inspect upstream rendering, local examples, and Pi events.
- [x] Create the fork without its settings menu.
- [x] Add group tracking, elapsed time, live summaries, and finished summaries.
- [x] Add saved data and cancellation at session boundaries.
- [x] Run focused tests and an isolated terminal check.
- [x] Update documentation.
- [x] Run repository checks. `git diff --check` and `pre-commit run --all-files` passed.

Completed on 2026-11-19. The strict TypeScript check and extension tests passed. An isolated Pi terminal restored the saved summary and duration.

## Follow-up: Short tool summaries (2026-11-19)

The [display follow-up](pi-work-summary-display-plan.md) replaces the initial display and wording choices. Thinking stays unchanged. Tool summaries are shorter and appear on separate lines without a bar.

## Open questions / assumptions

- The agreed package name is `pi-work-summary`.
- The model is configurable through `workSummary.model`. Display choices stay in source code.
- Keep assistant prose visible. Add the summary below the matching tool row.
- Older sessions without saved group data retain tool counts. Do not charge for automatic historical summaries.
- Installation and live activation need a separate user request.
