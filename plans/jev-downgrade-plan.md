# Jev cost-aware downgrades

Status: Complete — 2026-11-20.

## 1. Brief

Allow Jev to select a cheaper model after Astra. The user limited continuation downgrades to Astra to reduce costs without frequent changes among cheaper models.

## 2. Current state / relevant context

Before this correction, the router checked every continuation but accepted only upgrades. All four model choices and error checks already exist. API retries keep the same model. The earlier completed plan records the original decision, not this correction.

## 3. Proposed implementation

Permit lower choices only when the current model is Astra. Keep Luna, Terra, and Sol upward-only during continuations. Keep the current model and thinking level for the same choice or failed classification. Ask Jev to select the least expensive model that can handle the remaining work. Judge unresolved problems, not problems already fixed. Replace `escalationOnly` with `allowDowngrade`, which is true only for Astra continuations. Preserve authentication fallback, cancellation, direct requests, retries, and usage records.

## 4. File-by-file impact

- `extensions/pi-jev-router/pi-jev-router.ts`: permit Astra downgrades and update classifier guidance.
- `extensions/pi-jev-router/pi-jev-router.test.ts`: cover all transitions, including every downgrade from Astra.
- `docs/pi-jev-router.md`: describe downgrades and qualify cache claims.
- `plans/jev-downgrade-plan.md`: record this correction and validation.

## 5. Risks and edge cases

Frequent changes can affect cache reuse. They do not guarantee a cache miss. Codex credit billing has no separate cache-write charge, but cached input still has a price. Direct API pricing differs. A failed classifier call must not force a change. A missing target still uses the existing Sol fallback.

## 6. Validation / testing

Run the existing tests first. Change the transition matrix to accept lower choices from Astra only. Confirm that it fails before the fix. Verify Astra downgrades, same-model thinking levels, failed classification, tool errors, retries, cancellation, authentication fallback, and usage records. Run strict TypeScript checks, package loading, `git diff --check`, and `pre-commit run --all-files`. Report the absence of live billing measurements.

## 7. Step-by-step execution checklist

- [x] Inspect the current router and current official cache guidance.
- [x] Add regression coverage and implement Astra-only downgrades. The 16-pair transition matrix covers all model choices; a regression failed before the implementation and passed afterward.
- [x] Update documentation and review the correction.
- [x] Run checks and record results. Tests, strict TypeScript checks, catalog loading, and repository hygiene checks pass.

### Validation results

The transition test failed before the fix because Astra stayed selected instead of Luna. The updated test passes for all 16 model pairs. It permits Astra to select any lower level and keeps the other levels upward-only. Failed classification keeps the current model, including Astra.

The adjacent test passes with the installed `jiti` loader and host aliases. Strict TypeScript checks pass for the router and tests against the installed Pi declarations. `pi --list-models jev` loads and lists `jev/auto`. `git diff --check` and `pre-commit run --all-files` pass.

No live Jev classification, model completion, or billing measurement ran. No package installation or session reload took place. Actual savings remain unmeasured. Existing sessions need `/reload`.

## 8. Open questions / assumptions

The user's latest decision permits continuation downgrades from Astra only. Keep the four model choices and existing fallback. Do not add speculative cache rules or pricing calculations. Do not install, reload, commit, or modify remote systems.

Sources checked: https://developers.openai.com/api/docs/guides/prompt-caching, https://openai.com/index/better-prompt-caching-for-gpt-6/, and https://developers.openai.com/codex/pricing/.
