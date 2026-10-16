# Three-level Jev router

Status: Completed — 2026-10-16

## 1. Brief

Replace the fixed bundled example with a small personal Pi extension that selects the user's three coding models. Ask Jev once for each new user prompt and keep the selected model during its tool calls. Keep the router enabled by default without changing Pi's installed code.

## 2. Current state / relevant context

- Pi 1.3.0 supports native Jev classification and virtual model routing.
- `jev/auto` is already the personal default, but it loads the official GPT-5.6 example.
- The official example cannot configure its hardcoded models through settings.
- All requested models are available through existing Codex authentication.
- The user approved replacing the example with a personal three-level extension.
- Existing extensions live in `extensions/` and load through symlinks in `~/.pi/agent/extensions/`.
- Personal settings link to `/home/djipey/git_all_the_things/pi/agent/settings.json`. Preserve existing changes.

## 3. Proposed implementation

Register `jev/auto` through Pi's native `registerVirtualModel()` API. Use native `typesafe/jev-latest` classification for three labels:

| Level | Physical model |
| --- | --- |
| Very complex | `openai-codex/gpt-6-astra` |
| Routine | `openai-codex/gpt-6.1-sol` |
| Simple | `openai-codex/gpt-6-luna` |

Classify each new user prompt. Keep the previous physical model during tool continuations. Keep the failed model during retries. Do not force a downgrade after an edit. Use the previous model for direct requests such as compaction, or routine Sol when none exists. Preserve the selected reasoning level.

Send only bounded text from the latest user prompt for classification. Describe routine as the default when the task is ambiguous. Use Sol if Jev is unavailable, returns an error or unusable answer, or throws. Give the request a five-second timeout and no provider retries. Preserve cancellation rather than turning it into a fallback response.

Validate the selected physical model and its authentication before returning it. Use routine Sol if another selected model is unavailable. Report an explicit error if the fallback is unavailable too.

Reference the personal extension through the normal local symlink pattern. Replace the bundled extension entry with the personal extension path in settings. Keep `defaultProvider: jev`, `defaultModel: auto`, and the existing high reasoning level. Leave credentials, packages, subagents, and old session files unchanged.

## 4. File-by-file impact

- `extensions/pi-jev-router.ts`: native router, three labels, sticky continuations, cancellation, and fallback.
- `extensions/pi-jev-router.test.ts`: adjacent Node assert tests with fake Pi and classifier responses.
- `plans/pi-jev-three-level-router-plan.md`: decisions, checks, deviations, and completion record.
- `docs/pi-jev-router.md`: implemented routing, privacy, installation, and limits after validation.
- `docs/README.md`: add the implemented extension to the index.
- `/home/djipey/git_all_the_things/pi/agent/settings.json`: replace only the old extension path; retain router defaults.
- `~/.pi/agent/extensions/pi-jev-router.ts`: new symlink to the repository source.
- Previous bundled-router plan: retain it as historical context and note its replacement.

No dependencies, model provider, guard system, or new tools are needed.

## 5. Risks and edge cases

- Jev can choose the wrong complexity level. Short follow-up prompts lack earlier task context.
- Model changes between user prompts lose prompt-cache benefits and can trigger Pi's normal compaction.
- Astra and Luna have 272k context, while Sol 6.1 has 500k. Do not truncate conversation history manually.
- Prompt text is sent to TypeSafe. Do not send repository files or credentials for verification.
- Native catalog pricing can show zero Jev cost even when TypeSafe bills input tokens.
- The extension replaces the policy behind existing `jev/auto` sessions after reload. Old phase state must be ignored.
- Avoid loading the bundled example and personal extension together under the same virtual model ID.

## 6. Validation / testing

Success criteria:

1. Tests map all three Jev choices to the exact requested authenticated models.
2. Tool continuations, retries, and direct requests do not classify again or switch after a write.
3. A later user prompt reclassifies even after earlier work selected another tier.
4. Missing credentials, malformed responses, and provider errors fall back to Sol. Cancellation still aborts.
5. A real Pi session loads the installed extension without duplicate registration or extension errors.
6. Real synthetic prompts exercise all three coding models. Inspect actual assistant-message model IDs.
7. A real multi-turn session retains its model across a write and can change models for a later prompt.
8. Settings preserve all unrelated values. The repository diff check and pre-commit hooks pass.

Run the adjacent test with Pi's installed global jiti fallback. Run a focused strict TypeScript check against installed Pi declarations if available. Keep live checks in a disposable directory and avoid raw credential reads. Limit Jev verification spend to $0.25.

## 7. Step-by-step execution checklist

- [x] Inspect active settings, exact model IDs, native API, and adjacent extension patterns.
- [x] Obtain approval for a personal extension and per-prompt routing.
- [x] Implement the router and focused tests. Adjacent assertions, strict TypeScript checking against installed Pi 1.3.0 declarations, and the initial diff check pass.
- [x] Verify focused behavior and isolated live routing. Real prompts selected Luna 6, Sol 6.1, and Astra 6. An independent read-only review found no defects.
- [x] Install the symlink and update settings without duplicate loading. `pi --list-models jev` loads the personal router, and JSON assertions confirm only the extension path changed.
- [x] Verify installed defaults and multi-turn behavior. A real RPC session selected Astra, retained Astra after a successful write, then selected Luna and Sol for later prompts. Artifacts are under `/tmp/pi-jev-three-level-check.oNtRSg/`.
- [x] Update implemented documentation and complete repository checks. The documentation maintainer added the guide and index entry. Parent review clarified model selection in existing sessions. Repository-wide and changed-file pre-commit secret checks passed. Both repositories passed `git diff --check`.

### Validation results

- Focused adjacent Node assertions passed through Pi's installed global jiti fallback.
- Strict TypeScript checking passed against installed Pi 1.3.0 declarations.
- Independent read-only review found no defects.
- Isolated real prompts selected all three exact requested model IDs.
- A real RPC session used installed defaults with no explicit extension or model flags. It selected Astra, stayed on Astra after writing `ledger-design.txt`, then rerouted later prompts to Luna and Sol.
- JSON assertions confirmed that the only settings change from the prior setup is the extension path. Existing packages, subagent overrides, credentials, and reasoning defaults remain unchanged.
- The personal symlink resolves to this repository's extension. The bundled example was not modified.
- `pre-commit run --all-files` and changed-file checks passed. No commit was created.
- Artifacts: `/tmp/pi-jev-three-level-check.oNtRSg/`, including `installed-rpc-summary.json`.

### Deviations

The repository's preferred `~/.pi/agent/npm/node_modules/.bin/jiti` path is absent. Validation used the installed global Pi jiti fallback documented by the existing MCP status guide. No dependency was installed.

### Activation

New sessions use `jev/auto` by default. In existing sessions, run `/reload`. Select `/model jev/auto` if another model remains selected.

## 8. Open questions / assumptions

- `astra-6` means `openai-codex/gpt-6-astra`; `luna 6` means `openai-codex/gpt-6-luna`.
- The existing high reasoning default applies to every selected coding model.
- The user approved per-prompt selection and sticky tool continuations.
- No further scope approval is needed. Stop if implementation requires unrelated systems or changes to installed Pi code.
- Estimated execution time: 15–25 minutes, depending on provider response times.
