# Jev Terra and frequent reassessment

Status: Complete — 2026-11-20.

## 1. Brief

Add Terra 6.1 between Luna and Sol. Check task complexity before every continuation so one tool error reaches the next check.

## 2. Current state / relevant context

Before this change, the router used Luna, Sol 6.1, and Astra 6.2. It checked after five continuations, three tool errors, or ten minutes. Continuations could only upgrade to Astra. Tests and the guide named the older Astra model. The local catalog lists `openai-codex/gpt-6.1-terra`.

## 3. Proposed implementation

Add the `bounded` choice for clear work that follows an existing pattern. Keep `routine` for Sol and unclear capability needs. Order models from Luna through Terra and Sol to Astra. Accept only higher choices during continuations. Keep the current model when classification fails. Keep Sol as the fallback for new requests. Remove cadence counters, but keep the task start time for context. Reassess every continuation, including Astra. Preserve direct requests, API retries, cancellation, authentication checks, and usage records.

Frequent checks add provider delay. Unlike checks after several errors, each continuation includes the latest tool results. Errors trigger assessment, not automatic upgrades.

## 4. File-by-file impact

- `extensions/pi-jev-router/pi-jev-router.ts`: add Terra, ordered upgrades, and frequent checks.
- `extensions/pi-jev-router/pi-jev-router.test.ts`: cover each model, each upgrade boundary, failures, and every-continuation checks.
- `docs/pi-jev-router.md`: describe the implemented model choices and checks.
- `docs/README.md`: update the guide description without changing unrelated edits.
- `plans/jev-terra-reassessment-plan.md`: record decisions and results.

## 5. Risks and edge cases

A fallback must not downgrade a continuation. Classifier failure must not force an upgrade. Missing Terra uses Sol when this preserves the current level. Old branch state can contain unused counters. Recent activity still has existing size and privacy limits. A model switch loses cache benefits. New requests can select lower models.

## 6. Validation / testing

Run the adjacent tests before and after changes. The baseline failed because it expected `gpt-6-astra` instead of the configured `gpt-6.2-astra`. Verify all four choices and all continuation combinations. Verify a single tool error reaches classification immediately. Check cancellation, failures, authentication fallback, and usage records. Run `pi --list-models jev`, `git diff --check`, and `pre-commit run --all-files`. Report limits for live provider validation.

## 7. Step-by-step execution checklist

- [x] Inspect source, tests, catalog, documentation, and baseline failure.
- [x] Implement four choices and frequent upward-only checks.
- [x] Update affected documentation and review the changes.
- [x] Run final validation and record results.

## 8. Validation results

The adjacent tests pass with the installed `jiti` loader and host aliases. The baseline test failure came from a stale Astra model expectation. The corrected test uses `gpt-6.2-astra`. The local catalog lists `gpt-6.1-terra` for `pi --list-models terra`.

Strict TypeScript checking passes for the router and its tests against the installed Pi declarations. The test now narrows the classifier question type before it reads choice criteria. `pi --list-models jev` loads and lists `jev/auto`. `git diff --check` and `pre-commit run --all-files` pass. Parent review corrected stale Sol-only guidance in the guide.

No live Jev classification or model completion ran. Live classification quality and added delay remain unmeasured. No package installation or activation took place. Existing sessions need `/reload`.

## 9. Open questions / assumptions

The request approves both Terra and the proposed reassessment changes. Keep the configured Astra 6.2 model. Keep direct calls and API retries unchanged. Do not modify live settings, install packages, or change remote systems. Leave unrelated autonomous-work files unchanged.
