# Route routine Jev tasks by work type

Status: Completed — 2026-10-28.

## 1. Brief

Use Sol 5.6 for moderately complex coding work. Use Sol 6.1 for moderately complex work that does not involve coding. Keep Luna for simple work and Astra for exceptional reasoning.

## 2. Current state / relevant context

The router has one `routine` classifier result, which always selects `openai-codex/gpt-5.6-sol`. Both Sol models are installed and authenticated. Sol 5.6 is also the current safe fallback when classification or another model is unavailable.

## 3. Proposed implementation

Split the routine classifier result into `routine_coding` and `routine_non_coding`. Define coding broadly enough to include source code, tests, scripts, software configuration, code review, and debugging. Route only `routine_non_coding` to Sol 6.1. Keep Sol 5.6 as the fallback for missing, failed, or unusable classification so uncertainty cannot select Sol 6.1 for coding work.

Preserve continuation stickiness and Astra escalation. During reassessment, switch Sol 6.1 to Sol 5.6 if Jev identifies coding work. Keep the current model for other non-Astra results.

## 4. File-by-file impact

- `extensions/pi-jev-router/pi-jev-router.ts`: add the two routine labels, model mappings, and classifier guidance.
- `extensions/pi-jev-router/pi-jev-router.test.ts`: verify both mappings, safe fallback, and coding exclusion guidance.
- `docs/pi-jev-router.md`: document the four classifier results and safe fallback behavior.
- `docs/README.md`: update the router index description.
- `plans/jev-sol-task-routing-plan.md`: record decisions and validation results.

No callers, package exports, settings, or fixtures need changes.

## 5. Risks and edge cases

Jev can still misclassify a prompt. Strong criteria reduce this risk but cannot remove classifier error. Safe fallback behavior always chooses Sol 5.6. Simple coding can still use Luna, and exceptional coding can still use Astra.

## 6. Validation / testing

Success means routine coding maps to `gpt-5.6-sol`, routine non-coding maps to `gpt-6.1-sol`, and unusable classification still maps to Sol 5.6. A reassessment must move coding work off Sol 6.1. Run the adjacent extension test, `git diff --check`, and `pre-commit run --all-files`.

## 7. Step-by-step execution checklist

- [x] Inspect the router, tests, documentation, installed models, and baseline behavior.
- [x] Update routing labels and classifier guidance.
- [x] Add focused regression assertions.
- [x] Update documentation.
- [x] Run checks and review the final diff.

### Validation results

The adjacent router test passes with both routine mappings, Sol 5.6 fallback checks, and the Sol 6.1-to-5.6 continuation switch. `pi --list-models jev` loads `jev/auto` from the configured package. `git diff --check` and `pre-commit run --all-files` pass. No live Jev classification call or interactive `/reload` was performed.

## 8. Open questions / assumptions

“Moderately complex” means the router’s existing routine tier. “Coding” includes any material source code, test, script, software configuration, code review, or debugging work. No live classifier call or runtime reload is required unless requested.
