# Batch plan review questions

Status: Completed — 2026-11-05.

## 1. Brief

Reduce the number of question rounds during plan reviews. Ask independent questions together and record answers after each group. Keep single blocked decisions separate from full plan reviews.

## 2. Current state / relevant context

- `/home/djipey/git_all_the_things/pi/agent/AGENTS.global.md` requires `clarifying-questions` and `ask_user_question` together.
- Both `clarifying-questions` and `grill` already specify the question tool.
- `skills/grill/SKILL.md` requires one question per round and immediate decision records.
- `ask_user_question` accepts one to four questions per call.
- The installed `grill` path points to this repository. The global instruction path points to `AGENTS.global.md`.
- No relevant `docs/CONTEXT.md` exists. Existing changes to `skills/plan/SKILL.md` remain outside scope.

## 3. Proposed implementation

Keep separate triggers for blocked decisions and requested plan reviews. Remove the duplicate tool requirement from the global instructions.

A batch is a group of questions in one tool call. Ask up to four independent questions per batch. Wait for prerequisite answers before asking dependent questions. Inspect relevant code and documentation before each batch. Record all accepted answers and check affected parts together after each batch.

Keep the initial question estimate, progress, recommendations, rationale, and record locations. Group questions without merging separate decisions into one question. Update only affected evidence between batches.

This approach reduces question rounds. It cannot show more than four questions in one tool call.

## 4. File-by-file impact

- `/home/djipey/git_all_the_things/pi/agent/AGENTS.global.md`: simplify the question rule and add the plan review trigger.
- `skills/grill/SKILL.md`: replace sequential questions with independent batches and grouped checks.
- `plans/grill-question-batches-plan.md`: record the approved scope and checks.

The skill itself documents this behavior. No separate documentation page, caller, fixture, export, or configuration change is necessary.

## 5. Risks and edge cases

- A later answer can depend on an earlier decision. Ask those questions in separate batches.
- More than four independent questions require multiple calls because of the tool limit.
- Skipped questions remain open. Record only accepted answers.
- Answers can conflict. Ask one focused follow-up instead of selecting an answer silently.
- Static checks establish instruction consistency. They do not prove model behavior in a future session.

## 6. Validation / testing

Success criteria:

1. Global instructions name separate triggers and leave tool selection to the skills.
2. The skill asks up to four independent questions per call and preserves answer dependencies.
3. The skill records answers and checks affected evidence after each batch.
4. The skill retains progress, recommendations, rationale, and record locations.
5. No obsolete one-question-per-round instruction remains in the changed skill.
6. Focused text assertions, `git diff --check`, and `pre-commit run --all-files` pass.

Inspect the tool schema for the four-question limit. Review scenarios with four independent questions, six independent questions, and a dependent question.

## 7. Step-by-step execution checklist

- [x] Inspect active files, repository rules, and question tool limits.
- [x] Record approved scope and success criteria.
- [x] Update global question routing.
- [x] Update plan reviews to use question batches.
- [x] Run focused checks and repository checks.
- [x] Record results and remaining limits.

### Validation results

- Focused assertions passed for separate triggers, batch limits, dependent questions, grouped checks, answer records, and progress fields.
- Relative skill links resolve. Installed paths point to the changed files.
- No obsolete one-question-per-round rule remains in the changed skill.
- Scenario review covered four independent questions, six independent questions, and a question that needs an earlier answer.
- Four independent questions fit one call. Six require two calls. A dependent question waits for its prerequisite answer.
- `git diff --check` passed in both repositories. `pre-commit run --all-files` passed in the skill repository.
- No live review session or question UI test ran. Future model behavior remains unverified.
- The skill documents the changed behavior. No separate documentation page is necessary.
- No unrelated skill, configuration, or installation change was necessary.

## 8. Open questions / assumptions

- The user approved the two-trigger recommendation and requested question batches.
- Use the installed `grill` skill rather than the separate `grill-with-docs` source.
- Keep `clarifying-questions` unchanged for isolated blocked decisions.
- Keep `grill-adr` unchanged because the request names `grill`.
- Do not start a questionnaire merely to verify the updated instructions.
