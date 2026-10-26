# Fix the BTW focus freeze

## Brief

Submitting a BTW prompt freezes keyboard input and model progress. Repeated focus restoration can fill the JavaScript task queue indefinitely. Stop redundant restoration without changing foreground ownership.

## Current state / relevant context

- The fullscreen focus patch is already present as uncommitted work.
- `ensureOverlay()` focuses an existing overlay before submitting a prompt.
- Pi reports focus loss even when focusing the same component again.
- BTW schedules another focus call for every reported loss.
- Existing real-renderer tests exercise empty composers, not repeated focusing or prompt submission.
- Preserve unrelated sidebar changes and existing BTW work.

## Proposed implementation

Check actual host focus before restoring BTW in the queued callback. Keep explicit focus switching, question preservation, scrolling, and cancellation unchanged. Do not change providers, live settings, or Pi itself.

## File-by-file impact

- `extensions/pi-btw/extensions/btw.ts`: guard redundant queued restoration.
- `extensions/pi-btw/tests/btw.focus.test.ts`: bound queued callbacks and cover repeated focus.
- `extensions/pi-btw/docs/README.md`: check for stale guidance. No changes are needed because the fix restores documented behavior.
- This plan: record reproduction and validation.

## Risks and edge cases

- A real focus loss must still restore BTW ahead of a waiting main question.
- Queued restoration must not steal focus after explicit release or dismissal.
- An endless microtask loop blocks test timeouts too. Capture callbacks for a bounded regression.

## Validation / testing

Success means the queued callbacks settle after refocusing an open overlay. Escape must still close it. Prompt submission must reach a local fake provider and display its answer in actual fullscreen Pi. Verify a follow-up and Escape while a response waits. Keep the main question pending and answerable.

Run the package suite and typecheck against locked and installed SDKs. Run `git diff --check` and `pre-commit run --all-files`. Use terminal captures, not browser checks.

## Step-by-step execution checklist

1. [x] Reproduce the endless focus callbacks with a bounded regression.
2. [x] Guard redundant restoration and pass the regression.
3. [x] Verify real prompt submission, follow-up, cancellation, and the main question.
4. [x] Check documentation and run package and repository checks.

## Open questions / assumptions

- The requested scope is repair of the current freeze, not a focus redesign.
- Existing foreground ownership remains intentional.
- Restarting an already frozen user process requires the user's action. Do not terminate it.

## Results

Completed on 2026-10-25.

- Before the fix, eight drained callbacks still left another restoration queued. The regression failed as expected.
- The callback now checks whether BTW already holds host focus before requesting focus again.
- All 195 tests and typecheck pass with locked Pi 0.99.2 and installed Pi 1.4.0.
- Actual fullscreen Pi displayed an initial answer and a follow-up through a local fake provider.
- Escape aborted a deliberately waiting response. The next Escape dismissed BTW.
- The real questionnaire stayed pending throughout. Enter answered it afterward, and the main response completed.
- `git diff --check`, `pre-commit run --all-files`, and hooks for new files passed.
- Existing documentation already describes the restored behavior. No documentation changes were needed.
- Terminal captures and the provider log are outside the repository under `/tmp/pi-btw-freeze-check.mugL3f/`.
- Live model providers and minimum Pi 0.85.1 were not tested. No live settings or user processes changed.
