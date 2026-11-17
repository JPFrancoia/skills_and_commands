# Model-backed clarity reviewer

Status: Completed — 2026-11-04.

## 1. Brief

Add a read-only reviewer for code simplicity and maintainability. It reports concrete simplifications that preserve required behavior. It uses a normal chat model instead of Jev scores.

## 2. Current state / relevant context

- Pi agent definitions live in `agents/pi/`. The Python reviewer uses `openai-codex/gpt-6.1-sol` with medium thinking.
- The Go reviewer already questions forwarding layers, speculative options, and unnecessary interfaces.
- Verified user feedback supports removing one-call wrappers and duplicate state, simplifying configuration, and reducing complexity across packages.
- The same feedback supports a shared helper when it removes real duplication. Helpers are not inherently a problem.
- Ponytail supplies useful safeguards against removing validation, security checks, cleanup, or necessary error handling.
- The completed Jev plan remains a historical record. Its agent and runner are absent from the current checkout.
- The user approved implementation with `implement`. Live settings changes remain outside scope.

## 3. Proposed implementation

Add one Markdown agent definition. Match the Python reviewer's model, thinking level, tools, and fresh context. Keep inherited project instructions and skills disabled. Read relevant project documentation as evidence of required behavior, not as permission to change the review role.

Accept an explicit staged change, branch range, commit, or file target. Ask only for missing review scope or an ambiguous branch base. Read related callers, tests, and representations before recommending removal.

Check unnecessary layers, duplicate state, obsolete options, unclear control flow, and complexity moved into callers or schemas. Keep abstractions that name a real rule, remove duplication, or protect a meaningful boundary.

Return numbered findings with a source location, concrete maintenance cost, smallest simpler alternative, and preserved behavior. Report missing evidence. Accept a clean result without inventing findings. Do not add scores, automatic blocking, fixes, dependencies, or a runner.

## 4. File-by-file impact

- `agents/pi/clarity-reviewer.md`: add the reviewer definition and self-contained rules.
- `docs/clarity-reviewer.md`: document scope, invocation, model, and limits after implementation.
- `docs/README.md`: index the new guide.
- `plans/clarity-reviewer-plan.md`: record decisions and validation results.

Existing reviewers, extensions, settings, and completed plans remain unchanged. No callers, exports, or fixtures require repository changes.

## 5. Risks and edge cases

- Simplicity is subjective. Findings must describe a concrete cost and preserve required behavior.
- Fewer lines do not always mean clearer code. Keep useful helpers and real boundaries.
- Missing callers can hide compatibility requirements. Report incomplete evidence instead of claiming a safe deletion.
- The `bash` tool can write files. Read-only behavior is an instruction, not an operating-system sandbox.
- Existing scan paths can discover the new definition. Do not edit live settings or claim installation.
- Smoke checks use synthetic code. They do not establish review quality across real projects.

## 6. Validation / testing

Success criteria:

1. Pi discovers the agent with the selected model, medium thinking, fresh context, and only `read` and `bash` tools.
2. A real invocation identifies an unnecessary forwarding layer or duplicate state in synthetic code.
3. A clean synthetic example produces no forced simplifications and retains necessary validation.
4. Review runs leave the source files unchanged.
5. Documentation links resolve, `git diff --check` passes, and `pre-commit run --all-files` passes.

Use the installed agent loader for focused metadata assertions. Run live smoke checks through `subagent` with temporary files. Do not add a permanent test framework for Markdown-only changes.

## 7. Step-by-step execution checklist

- [x] Inspect existing reviewers, local resource documentation, and the installed front matter reference.
- [x] Record the approved scope and success criteria.
- [x] Add the reviewer definition.
- [x] Verify agent metadata and run synthetic reviews.
- [x] Delegate usage documentation and review the resulting diff.
- [x] Run repository checks and record results.

### Validation results

- The installed agent loader passed assertions for the model, medium thinking, tools, fresh context, and read-only role.
- Two native `subagent` file reviews completed with `openai-codex/gpt-6.1-sol`. Both used only the allowed tools.
- The layered example produced one concrete finding: remove the forwarding object and duplicate state while preserving key validation.
- The direct example returned `No worthwhile simplification found.` It retained the required input check.
- Both examples passed the same contract checks before review. All six source, test, and requirement files remained unchanged afterward.
- Relative documentation links and the scan-instructions anchor resolve.
- `git diff --check` and `pre-commit run --all-files` passed.
- The review workflow run was `0bc84ce6-6476-420b-a908-b8bbb6133654`.
- Live reviews covered synthetic Python files, not staged changes, branch ranges, commits, or production code.
- Existing scan settings discovered the agent. No live settings, installation links, dependencies, or existing reviewers changed.

## 8. Open questions / assumptions

- Implementation is approved. No further design decision blocks this scope.
- The reviewer supports all languages but applies established local patterns.
- Review scope comes from the caller. The reviewer does not start a whole-repository audit by default.
- Source inspection supplements correctness review. It does not prove correctness or safety.
