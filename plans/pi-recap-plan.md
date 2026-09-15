# Plan: Pi Recap Rename and Model Configuration

**Completed: 2026-09-15**

## Brief

This change renames the local conversation summary extension to `pi-recap`. Luna remains the default because it is the cheapest configured model that passed direct runtime tests. A small JSON file will let the user change the model without source edits.

## Current state / relevant context

- `extensions/pi-conversation-summary.ts` provides immediate and milestone recaps.
- The live symlink uses the old `pi-conversation-summary.ts` name.
- `gpt-5.6-luna` works and costs `$0.20/M` input tokens and `$1.20/M` output tokens.
- `gpt-5.4-mini` now fails for the active ChatGPT Codex account.
- `gpt-5.5` works but costs 25 times more than Luna.
- The Luna warning came from the former four-second timeout. The code now uses ten seconds.
- No persisted `pi-conversation-summary` entries exist in the active test session.

## Proposed implementation

Rename the extension, test, and document to `pi-recap`. Change the widget and custom entry keys to `pi-recap`.

Keep this default model:

```text
openai-codex/gpt-5.6-luna
```

Read an optional user configuration file from:

```text
~/.pi/agent/extensions/pi-recap.json
```

Use this format:

```json
{
  "model": "openai-codex/gpt-5.6-luna"
}
```

Parse the model as `provider/model-id`. Use Luna when the file is absent or invalid. Show a warning when the configured model does not exist or lacks authentication.

Load the configuration on session start. Require `/reload` after a configuration change. Do not add a settings screen, command, project override, or migration layer.

Create the Luna configuration file during activation. Replace the old symlink with `~/.pi/agent/extensions/pi-recap.ts`.

## File-by-file impact

- `extensions/pi-recap.ts` — renamed extension plus model configuration loader.
- `extensions/pi-recap.test.ts` — renamed test plus default and override assertions.
- `docs/pi-recap.md` — renamed behavior, configuration, privacy, and validation document.
- `docs/README.md` — replace the old document link.
- `plans/pi-recap-plan.md` — decisions, progress, and validation results.
- `plans/pi-conversation-summary-plan.md` — preserved as the original implementation record.
- `~/.pi/agent/extensions/pi-recap.json` — selected model configuration.
- `~/.pi/agent/extensions/pi-recap.ts` — symlink to the renamed repository file.

## Risks and edge cases

- An invalid model string can disable generated recaps. The default fallback prevents this failure.
- A valid model can lack provider authentication. A visible warning reports this state.
- A configuration change does not affect a loaded extension. The user must run `/reload`.
- The rename changes the custom entry key. Existing old entries will not restore.
- Both symlinks can load duplicate extensions. Activation removes the old symlink first.

## Validation / testing

- Verify that absent configuration selects Luna.
- Verify that valid configuration selects its provider and model.
- Verify that invalid configuration falls back to Luna.
- Run the focused test with Pi's bundled global `jiti`.
- Run the strict TypeScript check and Bun build.
- Run `git diff --check`.
- Run `pre-commit run --all-files`.
- Verify that only the `pi-recap.ts` symlink exists.
- Verify that `pi-recap.json` selects Luna.

## Step-by-step execution checklist

- [x] Rename the extension, test, and document.
- [x] Rename widget and custom entry keys.
- [x] Add the JSON model configuration loader.
- [x] Add focused configuration assertions.
- [x] Update the documentation index.
- [x] Replace the live symlink.
- [x] Create the Luna configuration file.
- [x] Run focused and repository validation.
- [x] Record results and deviations.
- [x] Mark this plan completed with the completion date.

## Validation results

- The focused `jiti` test passed.
- The strict TypeScript check passed.
- The Bun build passed.
- `git diff --check` passed.
- `pre-commit run --all-files` passed.
- The live `pi-recap.ts` symlink points to the renamed repository file.
- The live `pi-recap.json` configuration selects Luna.

## Deviations

- The documentation reviewer found no mismatch and made no edit.
- The subagent harness classified the no-edit review as a failed implementation task.

## Open questions / assumptions

- The extension name is `pi-recap`.
- Luna is the default model.
- User configuration applies globally, not per project.
- A source-independent JSON file provides sufficient future control.
- The user accepts `/reload` after a model change.
