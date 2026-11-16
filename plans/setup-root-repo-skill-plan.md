# Root Repository Setup Skill

Status: Completed on 2026-11-16

## Brief

Create a reusable skill for a workspace root that contains independent nested repositories.
The skill will establish shared documents, plans, architecture decisions, and agent instructions.
It will ask questions for project rules that the files cannot answer.

## Current state / relevant context

`feedoscope` and `green_slope` keep shared context in a root Git repository.
Both roots ignore nested repositories and separate reference documents from plans and architecture decisions.
Their branch rules, task tools, diagrams, and agent tools contain project-specific choices.

This repository stores portable skills under `skills/`.
The existing user skill path points to this directory.
No installation change is necessary.
An unrelated untracked `skills/amnesia/__pycache__/` directory exists and stays unchanged.

## Proposed implementation

Add `setup-root-repo` as a model-invoked skill with explicit setup triggers.
Use instructions and a layout reference instead of an executable generator.
This approach lets an agent adapt existing files without a configuration format or a new dependency.
It requires behavior checks because agents can interpret instructions differently.

Keep the shared document structure as the baseline.
Use one glossary, with the existing glossary path taking priority.
Ask about consequential project rules and optional tools after inspecting the target.
Keep setup local unless the user separately authorizes an external action.

## File-by-file impact

- `skills/setup-root-repo/SKILL.md`: inspection, questions, safe edits, and completion checks.
- `skills/setup-root-repo/references/layout.md`: file responsibilities, agent instructions, and the ADR template.
- `skills/setup-root-repo/references/scenarios.md`: repeatable behavior checks.
- `docs/setup-root-repo.md`: implemented use, defaults, boundaries, and limits.
- `docs/README.md`: link to the new guide.
- `plans/setup-root-repo-skill-plan.md`: decisions and completion evidence.

The example workspaces remain unchanged.
The skill has no new runtime dependency or setup script.

## Risks and edge cases

- An existing monorepo is not a root context repository. Stop before changing its ownership rules.
- Nested repositories can contain unrelated work. Preserve their files, branches, indexes, and history.
- Existing documents can conflict with defaults. Preserve their terms and ask about material conflicts.
- A target can sit inside another Git repository. Resolve the actual root before writing files.
- Symbolic links can point outside the target. Ask before changing linked files.
- Ignore rules do not stop Git from tracking files already in its index. Inspect both states.
- Automatic publication and cleanup can cause external changes or data loss. Exclude them from default setup.

## Validation / testing

Success requires valid skill metadata and local links.
The instructions must contain no example-project policy or machine-specific path.

Run isolated behavior checks for a new root, an existing root, and an incompatible tracked layout.
For the new root, inspect the generated files and nested repository state.
For the existing root, repeat setup and compare the result.
For the incompatible layout, require a stop before edits.
Report any scenario that does not run.

Run `git diff --check` and `pre-commit run --all-files`.
Review documentation against the completed skill.
Full ASD-STE100 compliance requires the official dictionary and human review.

## Step-by-step execution checklist

- [x] Inspect both example roots and local skill conventions.
- [x] Define the baseline, optional questions, and safety boundaries.
- [x] Write the skill and its reference files.
- [x] Run isolated behavior checks and inspect their results.
- [x] Update the usage guide and documentation index.
- [x] Run repository checks and record the result.

## Completion evidence

Pi's installed skill loader discovered `setup-root-repo` through the existing user skill path.
It returned no diagnostics and included the skill in its prompt listing.

An isolated agent performed the three primary behavior scenarios in disposable local workspaces.
The parent read the generated files, records, and check scripts, then reran `bash run-checks.sh`.
All 465 assertions passed. All 101 generated local file links resolved.
The second setup pass made no file or Git state changes.
The incompatible ownership scenario stopped before edits.
Nested files, indexes, working changes, branches, and commit references remained intact.

The existing-root fixture included an unrelated staged edit.
The scenario now requires that input to make index preservation explicit.

`docs-maintainer` added the usage guide and documentation index entry.
The parent reviewed both files and removed temporary progress wording.

Final checks passed:

- Static local links, portability, and selected prose patterns.
- `git diff --check`.
- `pre-commit run --all-files`.
- `pre-commit run --files` for all six changed or added Markdown files.

Test evidence remains under `/tmp/setup-root-repo-check.FiNFJU/` for local inspection.
The scripts and fixtures are test artifacts, not shipped setup tools.

Limits:

- Additional scenarios in the scenario reference remain untested.
- No hosted CI, remote address check, or interactive reload ran.
- No setup ran against the real example workspaces.
- No file was staged or committed in the implementation repository.
- No remote or user configuration changed.

## Open questions / assumptions

- Assumption: the skill targets a context repository around independent nested repositories, not a monorepo conversion.
- Assumption: creating the skill does not authorize running it against either example workspace.
- Decision: preserve existing paths and policies before applying new defaults.
- Decision: use `GLOSSARY.md` for a new glossary and preserve `docs/CONTEXT.md` when it already defines terms.
- Decision: keep optional tools opt-in and avoid a generated configuration file.
- Decision: require separate authority for publication, document moves, destructive cleanup, and accepted ADR changes.
