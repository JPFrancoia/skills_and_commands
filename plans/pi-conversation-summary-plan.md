# Plan: Pi Conversation Summary

**Model and placeholder correction completed: 2026-09-15**

**Live update revision completed: 2026-09-15**

**Initial version completed: 2026-09-15**

## Brief

This change replaces `pi-tldr` with a local extension that gives a compact three-line conversation recap. The recap appears when the user presses Enter and updates after each agent or tool cycle. This cadence lets the user follow the work without a request for every low-level event.

## Current state / relevant context

- Pi loads `pi-tldr` from the user package list.
- `pi-tldr` updates one sentence during agent work.
- The current sentence often lacks enough context for old, long-running sessions.
- Pi provides `agent_settled`, session branch access, custom session entries, and editor widgets.
- This repository keeps local extensions in `extensions/` with adjacent direct tests.
- The initial version updates only after each completed turn.
- The user now requires an immediate recap and live milestone updates.
- The user selected updates on Enter and after each completed agent or tool cycle.
- The repository has unrelated uncommitted changes. This work will not modify them.

## Proposed implementation

Create one local extension named `pi-conversation-summary`. The widget will use this fixed format:

```text
Now: <current work or state>
Why: <purpose or motivation>
Last: <latest completed agent work and result>
```

Use `openai-codex/gpt-5.6-luna` for the summary request. Direct runtime tests confirmed concurrent Luna requests. Codex with a ChatGPT account now rejects `gpt-5.4-mini`.

Render a deterministic recap immediately in `before_agent_start`. Use the new prompt and recent conversation context. Do not show generic placeholder values.

Run one summary request after the prompt and after each `turn_end` milestone. Build each input from the previous persisted recap and the current turn activity. Cap the transcript before each request.

Persist only the final accepted recap with `pi.appendEntry()`. This rule prevents live asynchronous output from hiding newer branch activity. Restore the latest valid recap on session start and tree navigation.

Generate one bootstrap recap when an existing branch has history but no current recap. Generate one catch-up recap when a branch contains activity after its stored recap.

Use `ctx.modelRegistry.complete()` for the request. Disable cache retention, retries, and long waits. Abort stale requests after a new prompt, session switch, tree change, or shutdown.

Require a JSON object with `now`, `why`, and `last` string fields. Strip terminal sequences, flatten whitespace, and cap each field before display or persistence. Keep the previous recap if the request fails or returns invalid data.

Render one small `Text` widget above the editor. Keep the last accepted recap visible while the next turn runs. Do not add a custom dialog, settings screen, external state file, or live activity tracker.

The installed `pi-tldr` package is removed, and the local extension symlink exists. The current process requires `/reload` after this revision.

## File-by-file impact

- `extensions/pi-conversation-summary.ts` — lifecycle hooks, transcript extraction, model request, validation, persistence, and widget output.
- `extensions/pi-conversation-summary.test.ts` — focused assertions for parsing, persistence, settled-turn updates, restoration, and stale-response rejection.
- `docs/pi-conversation-summary.md` — behavior, model choice, privacy note, installation, and validation.
- `docs/README.md` — documentation index entry.
- `plans/pi-conversation-summary-plan.md` — durable decisions, progress, deviations, and validation results.
- `~/.pi/agent/settings.json` — remove the external package through `pi remove` after repository validation.
- `~/.pi/agent/extensions/pi-conversation-summary.ts` — symlink to the repository extension after repository validation.

## Risks and edge cases

- Model output can contain invalid JSON or terminal controls. Strict validation and sanitization protect the widget.
- A slow request can finish after another turn or session switch. A run identifier and abort signal prevent stale output.
- An old session lacks a persisted local recap. A bounded bootstrap request creates the first recap.
- A branch can contain a recap from another path. Restoration scans only the active branch.
- A failed request leaves the prior recap visible. The next settled turn includes all unprocessed messages.
- The bounded transcript can omit old detail before the first recap. The bootstrap tail favors recent context and compaction summaries.
- Summary input can contain sensitive conversation text. The extension sends the bounded input to the configured Codex provider.
- Both extensions can display competing widgets. Activation removes `pi-tldr` before the local replacement runs.

## Validation / testing

Success requires these results:

- The widget contains exactly `Now`, `Why`, and `Last` lines.
- The widget appears immediately after the user presses Enter.
- The extension requests a generated update after the prompt and each `turn_end` milestone.
- The accepted recap survives reload and branch restoration.
- A stale request cannot replace newer or restored state.
- Invalid model output cannot reach the terminal or overwrite the prior recap.
- An old session without local state receives one bounded bootstrap recap.
- The adjacent test passes through Pi's bundled `jiti`.
- `git diff --check` passes.
- `pre-commit run --all-files` passes.
- Pi lists no external `pi-tldr` package after activation.
- The local extension symlink resolves to the repository file.

## Step-by-step execution checklist

- [x] Inspect Pi extension APIs and the installed `pi-tldr` implementation.
- [x] Confirm the update timing with the user.
- [x] Implement the single-file extension.
- [x] Add the adjacent direct test.
- [x] Run the focused extension test.
- [x] Run repository hygiene checks.
- [x] Update the documentation after implementation.
- [x] Remove the external package.
- [x] Add the local extension symlink.
- [x] Verify the active Pi configuration.
- [x] Record validation results and deviations.
- [x] Mark the initial plan completed with the completion date.
- [x] Confirm the live update cadence with the user.
- [x] Render an immediate recap from the new prompt.
- [x] Generate updates after each `turn_end` milestone.
- [x] Persist only the final accepted recap.
- [x] Update the focused test and documentation.
- [x] Run all validation again.
- [x] Mark the live update revision completed.

## Validation results

- The focused extension test passed with Pi's bundled global `jiti`.
- The TypeScript check passed with a temporary strict configuration.
- The Bun build passed with Pi runtime packages marked external.
- `git diff --check` passed.
- `pre-commit run --all-files` passed.
- Pi package settings contain no `pi-tldr` source.
- The local extension symlink resolves to the repository file.
- The current Pi process requires `/reload` before it uses the replacement.

## Live update revision results

- The widget test confirms immediate output after `before_agent_start`.
- The lifecycle test confirms one generated request after each `turn_end` milestone.
- The persistence test confirms that only the settled final recap enters session history.
- The stale request test confirms that a new prompt cancels older output.
- The focused test, strict TypeScript check, Bun build, Git check, and pre-commit check passed again.
- The installed symlink still resolves to the revised source file.

## Placeholder correction

- Runtime reproduction returned `stopReason: "error"` for `gpt-5.4-mini`.
- The provider reported that ChatGPT Codex does not support that model.
- Two concurrent Luna requests passed in a direct Pi runtime test.
- Luna took 5.6 seconds, so the former four-second timeout caused the warning.
- Luna costs `$0.20/M` input tokens and `$1.20/M` output tokens.
- GPT-5.5 worked but took 7.6 seconds and costs 25 times more than Luna.
- The extension now uses Luna with minimal reasoning and a ten-second timeout.
- The immediate recap now uses recent user and assistant context when no stored recap exists.
- Non-stop model responses now produce a visible warning instead of silent placeholder retention.
- The focused test, strict TypeScript check, Bun build, Git check, and pre-commit check passed.

## Deviations

- The documented `~/.pi/agent/npm` path for `jiti` did not exist. Validation used Pi's global bundled `jiti` instead.
- Documentation used a portable repository-relative symlink command instead of the absolute plan example.

## Open questions / assumptions

- The three labels are `Now`, `Why`, and `Last`.
- Each field remains one short line and uses a hard character cap.
- `openai-codex/gpt-5.6-luna` remains available and authenticated.
- One immediate update plus `turn_end` milestone updates meets the revised timing requirement.
- Plan approval authorized replacement of the installed external package after all checks passed.
