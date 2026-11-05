# Align ADR reviews with grill

Status: Completed — 2026-11-05.

## 1. Brief

Apply the recent `grill` improvements to `grill-adr`. Group independent questions and use the project-root glossary. Preserve the safeguards for architecture decision records (ADRs).

## 2. Current state / relevant context

- `skills/grill/SKILL.md` groups up to four independent questions per call.
- It records accepted answers and checks affected evidence after each batch.
- `skills/grill-adr/SKILL.md` asks one question at a time and uses `docs/CONTEXT.md`.
- ADR selection, draft protection, and manual checks already exist.

## 3. Proposed implementation

Use the same batch rules and `./GLOSSARY.md` path as `grill`. Keep each question focused on one decision. Wait for prerequisite answers before asking dependent questions. Record accepted answers and check affected evidence once per batch.

Keep the existing ADR structure and checks. This approach avoids a shared helper, new dependencies, or a broad rewrite.

## 4. File-by-file impact

- `skills/grill-adr/SKILL.md`: update question batches, answer records, glossary paths, and completion criteria.
- `plans/grill-adr-batches-glossary-plan.md`: record scope and check results.

The skill documents its own behavior. No separate documentation page, caller, fixture, configuration, or export needs a change.

## 5. Risks and edge cases

- Dependent questions must wait for earlier answers.
- Skipped answers remain open. Conflicting answers need a focused follow-up.
- Accepted ADRs remain protected. The skill cannot implement code or accept ADRs without human approval.
- Existing glossary files remain untouched. Prompt checks cannot prove future model behavior.

## 6. Validation / testing

Success requires all these results:

1. Up to four independent questions fit each tool call. Dependent questions wait.
2. Progress, recommendations, rationale, and capture targets remain required.
3. Accepted answers, glossary terms, evidence checks, and manual checks occur after each batch.
4. Old glossary paths and sequential review rules are absent. Single ADR selection remains unchanged.
5. ADR safeguards remain intact. Focused assertions and repository hygiene checks pass.

Review scenarios with four ready questions, six ready questions, dependent questions, skipped answers, and conflicting answers.

## 7. Step-by-step execution checklist

- [x] Inspect recent grill changes, ADR instructions, and question tool limits.
- [x] Record approved scope and success criteria.
- [x] Update the ADR review skill.
- [x] Run focused assertions and repository hygiene checks.
- [x] Record results and limits.

### Validation results

- Focused assertions passed for batch limits, dependent questions, answer records, glossary paths, and ADR safeguards.
- The three longest prose sentences contain 18, 17, and 17 words after quoted text counts as one word.
- Scenario review: four ready questions fit one call. Six require two calls. Dependent questions wait for their prerequisite answers.
- Skipped answers remain open. Conflicting answers require a focused follow-up.
- `git diff --check` and `pre-commit run --all-files` passed.
- No live ADR review ran. Future model behavior remains unverified.
- No existing project glossary or live configuration changed. The skill itself documents the behavior.

## 8. Open questions / assumptions

- The user requested implementation. No further approval is necessary.
- The recent grill commit defines the requested approach: batches and the root glossary.
- Keep unrelated skills, live configuration, existing project data, and completed plans unchanged.
- Do not start a user questionnaire solely to check these instructions.
