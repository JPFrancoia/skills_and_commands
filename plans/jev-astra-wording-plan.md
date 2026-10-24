# Soften Jev Astra routing guidance

Status: Completed — 2026-10-24.

## 1. Brief

Jev selects Astra too often after the recent escalation change. Soften the classifier guidance without changing routing mechanics.

## 2. Current state / relevant context

The prompt treats recurring errors and user corrections as reasons for Astra. Sol criteria exclude repeated failed approaches. The adjacent test passes before changes.

## 3. Proposed implementation

Prefer Sol when required capability is unclear. Keep ordinary debugging and corrections within Sol. Reserve Astra for clearly exceptional reasoning needs or persistent failure after meaningfully different approaches. Preserve automatic escalation, all check thresholds, fallback, and sticky routing.

## 4. File-by-file impact

- `extensions/pi-jev-router/pi-jev-router.ts`: soften instructions and align all three criteria.
- `extensions/pi-jev-router/pi-jev-router.test.ts`: guard the balanced guidance sent to Jev.
- `docs/pi-jev-router.md`: describe the revised guidance.
- `plans/jev-astra-wording-plan.md`: record scope and checks.

## 5. Risks and edge cases

Stricter guidance can delay useful escalation. Clear persistent failure still qualifies. Model mappings, callers, exports, settings, and request data remain unchanged.

## 6. Validation / testing

Success means the classifier receives balanced guidance and existing routing tests still pass. Add assertions for uncertainty, ordinary debugging, persistent failure, and exceptional complexity. Run the adjacent test, `git diff --check`, and `pre-commit run --all-files`. Mocked tests cannot measure actual selection frequency.

## 7. Step-by-step execution checklist

- [x] Inspect recent change and run baseline tests.
- [x] Update guidance and focused assertions.
- [x] Update affected documentation.
- [x] Run checks and review the final diff.

### Validation results

The new guidance assertion failed against the old prompt, then passed after the wording change. All adjacent routing tests pass. `git diff --check` and `pre-commit run --all-files` pass. The documentation update received parent review. No live classifier comparison or runtime reload occurred.

## 8. Open questions / assumptions

The request authorizes a wording-only adjustment. No thresholds, routing logic, live settings, installation, or remote systems change. Live selection frequency remains unmeasured.
