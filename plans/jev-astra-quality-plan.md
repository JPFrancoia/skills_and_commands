# Select Astra for code quality problems

Status: Completed — 2026-11-04.

## 1. Brief

Review feedback and coding mistakes can show that the current model needs stronger reasoning. Jev must favor Astra for serious code quality problems. Harsh wording alone does not justify Astra.

## 2. Current state / relevant context

Jev is the classifier that selects the coding model. Its guidance excludes recurring errors and user corrections unless persistent failure follows different approaches. This rule can delay useful escalation, which means a switch to Astra.

The adjacent routing tests pass before changes. The working tree is clean. No `docs/CONTEXT.md` exists.

## 3. Proposed implementation

Add code quality problems as a separate reason to select Astra:

- Review feedback identifies serious defects, missed requirements, or several missing edge cases.
- Fixes repeat mistakes or introduce new defects.
- Unnecessary complexity requires a simpler design.
- The user identifies a reasoning mistake that requires a new approach.

Use review substance, not tone. These problems do not require several failed approaches. Keep minor corrections, isolated test failures, and normal debugging on Sol.

Apply the same guidance to new user requests and continuation checks. Preserve check frequency, model mappings, fallback behavior, and Astra selection until the next user message.

## 4. File-by-file impact

- `extensions/pi-jev-router/pi-jev-router.ts`: update classifier instructions and criteria.
- `extensions/pi-jev-router/pi-jev-router.test.ts`: replace restrictive assertions with quality-based guidance checks.
- `docs/pi-jev-router.md`: document the implemented selection guidance.
- `plans/jev-astra-quality-plan.md`: record decisions and checks.

No callers, exports, fixtures, dependencies, package settings, or live settings need changes.

## 5. Risks and edge cases

Jev can still select the wrong model. More Astra use can increase cost. The recent activity limit can omit relevant feedback. Existing thresholds can delay continuation checks.

## 6. Validation / testing

Success means Jev receives explicit quality-based guidance without the old requirement for different failed approaches. Tests must cover all four quality triggers, tone, minor corrections, and continuation guidance.

Run the adjacent test before and after implementation. Add assertions first and record their expected failure. Run `git diff --check` and `pre-commit run --all-files`.

Mocked tests check the guidance and routing mechanics, not live Jev selection frequency. Do not claim runtime activation or measured selection changes.

## 7. Step-by-step execution checklist

- [x] Inspect source, tests, documentation, and prior decisions.
- [x] Run the baseline routing test.
- [x] Add guidance assertions and record their expected failure.
- [x] Update classifier instructions and criteria.
- [x] Update affected documentation.
- [x] Run checks and inspect the final diff.

### Validation results

The baseline test passed. The new review-substance assertion failed against the old guidance. All adjacent routing tests passed after implementation.

`docs-maintainer` updated the existing router page. Parent review restored the description of exceptional reasoning and persistent failure.

`git diff --check` and `pre-commit run --all-files` passed. The final diff changes guidance, focused assertions, and documentation only. No live Jev comparison, installation, or runtime reload occurred. Selection frequency remains unmeasured.

## 8. Open questions / assumptions

The user approved the proposed scope with “ok go”. This change updates guidance only. It does not install or reload the extension. No live provider comparison is required.
