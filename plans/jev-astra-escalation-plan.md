# Jev Astra escalation

Status: Integrated locally and activated — 2026-10-22. Remote PR integration remains pending.

## 1. Brief

Jev currently ignores evidence that a model is stuck. It reads only the latest user prompt and keeps the same model throughout a run. Add progress context and automatic checks so Jev can select Astra for repeated failures or stalled work.

## 2. Current state / relevant context

- The active package is `extensions/pi-jev-router/`.
- New user messages receive classification. Continuations, retries, and direct requests do not.
- The user approved automatic escalation during a run and the additional TypeSafe context and classifier calls.
- Existing tests cover model selection, sticky calls, cancellation, fallback, authentication, and usage recording.

## 3. Proposed implementation

Keep the existing three model choices. Expand the classifier instructions to favor Astra when repeated failed fixes, circular investigation, user corrections, or prolonged lack of progress show difficulty. Time or one ordinary error alone does not justify escalation.

Include the latest bounded prompt and bounded recent user, assistant, and tool-result text. Exclude system prompts, reasoning blocks, images, tool arguments, and tool details. Limit recent activity to 12 messages and 12,000 characters.

Use branch-local router state to check after five continuations, three new tool errors, or ten minutes since the last check. Evaluate time only at a request boundary. Give Jev the current model, elapsed minutes, and recent activity. These thresholds trigger assessment, not a forced upgrade.

During continuations, accept only an Astra recommendation. Otherwise keep the current model and thinking level, including on classifier failure. Once Astra handles the run, keep it until the next user message. Preserve retry and direct-request behavior. Preserve authentication fallback, cancellation, classifier timeout, and usage recording.

## 4. File-by-file impact

- `extensions/pi-jev-router/pi-jev-router.ts`: context extraction, classification instructions, bounded check cadence, and escalation.
- `extensions/pi-jev-router/pi-jev-router.test.ts`: progress context, cadence, escalation, sticky Astra, failure behavior, and existing regressions.
- `docs/pi-jev-router.md`: implemented behavior, bounds, privacy, and limitations.
- `plans/jev-astra-escalation-plan.md`: decisions and validation results.

Implementation uses a dedicated task worktree. Documentation and this plan stay on the current checkout. The user approved local integration and activation. Keep dependencies and installed Pi code unchanged. Existing settings already load the repository package.

## 5. Risks and edge cases

- Recent assistant and tool text now reaches TypeSafe. Treat it as untrusted evidence, not classifier instructions.
- Switching models loses prompt-cache benefits and can cause normal Pi compaction.
- Jev can misjudge progress. A long but productive run must not automatically escalate.
- Tool results can report failed tests as text without an error flag. Periodic checks still inspect this text.
- Direct requests and API retries must not trigger complexity escalation.
- A busy tool cannot be interrupted by this router. Checks happen before the next model request.

## 6. Validation / testing

Success means synthetic stalled histories reach the classifier and select Astra, while productive histories retain their model. Check thresholds, bounded context, excluded content, state reset, no continuation downgrades, sticky Astra, unavailable Astra, classifier errors, cancellation, and usage accounting.

Run the adjacent tests before and after changes. Run strict TypeScript checking against installed host declarations when available. Exercise the real Jev classifier with synthetic inputs only. Run `git diff --check` and `pre-commit run --all-files`.

## 7. Step-by-step execution checklist

- [x] Inspect router, active package path, tests, and host routing contracts.
- [x] Confirm automatic escalation with the user.
- [x] Create the task worktree and reproduce the missing escalation.
- [x] Implement context, prompts, cadence, and regression tests.
- [x] Run focused tests and synthetic live classifier checks.
- [x] Delegate affected documentation, review it, and run hygiene checks.
- [x] Integrate the tested source into the configured package checkout.
- [x] Verify normal CLI startup and automatic escalation in a live synthetic tool loop.

### Validation results

- The baseline test passed. A new regression failed before implementation because three failed fixes retained Sol instead of selecting Astra.
- The expanded adjacent test passes with Pi's installed jiti loader.
- Strict TypeScript checking passes against installed Pi declarations.
- Real Jev calls through `ModelRuntime.resolveModel()` selected Astra for a stalled routine task.
- Real Jev calls retained Sol for productive long work and external waiting.
- A completion from the selected Astra model returned exactly `ASTRA_ESCALATION_OK`.
- The in-memory session recorded all three live classifier usage entries.
- Live checks used synthetic text only. Results are in `/tmp/jev-escalation-live.log`.
- `git diff --check` and `pre-commit run --all-files` pass in both checkouts.
- Parent review corrected stale privacy limits in the delegated guide.

### Integration state

The user approved integration and activation after the initial validation. Source commit `79c72a8` is on `master` and `feat/jev-astra-escalation`. The original checkout received the source through a fast-forward merge.

The configured local package already points to this checkout. No installation or settings change was necessary. A fresh CLI session loaded the default `jev/auto` model without a model override. It dispatched to Luna and returned exactly `JEV_ACTIVE_OK`, with no startup errors.

A real SDK session loaded the same configured package. Its controlled tool returned three synthetic errors, then success. Sol handled the initial attempts. The router selected Astra before the fourth attempt and kept Astra for the final `TOOL_LOOP_OK` response. The session recorded four branch-state entries and both classifier usage entries.

Temporary activation evidence is in `/tmp/jev-activation.McZbIF/`. These files contain only synthetic task data.

Documentation and this decision record stay on the original checkout. No push or remote PR occurred. The clean task worktree remains at `/home/djipey/informatique/ai/.worktrees/skills_and_commands/feat-jev-astra-escalation` until a PR is merged.

New Pi sessions load the updated router. Existing sessions need `/reload`. This running conversation did not reload itself.

## 8. Open questions / assumptions

- Use five continuations, three new flagged tool errors, and ten minutes as assessment thresholds.
- Preserve the current model unless Jev explicitly chooses Astra during a continuation.
- New user messages can choose any tier again.
- Local integration and activation are authorized. Remote changes are not authorized.
- Success requires the configured package to load and handle a real model request.
- Existing Pi sessions need `/reload` to load the updated extension.
