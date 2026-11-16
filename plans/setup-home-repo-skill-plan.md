# Single-Repository Setup Skill Plan

Status: Completed on 2026-11-16

## Brief

Create `setup-home-repo` for a project with one Git repository.
Keep the shared documentation layout from `setup-root-repo`.
Track project code in the same repository instead of ignoring independent nested repositories.

A monorepo stores project components in one Git repository.
A component is a project folder with a distinct responsibility.
An architecture decision record (ADR) explains a design choice and its reasons.

## Current state / relevant context

`skills/setup-root-repo/` defines shared context around independent nested repositories.
Its baseline includes agent instructions, a glossary, reference documents, plans, and separate draft and accepted ADRs.
Its ignore rules exclude nested source folders.
The new skill must use different ownership and ignore rules.

The repository stores self-contained skills under `skills/` and guides under `docs/`.
There is no `docs/CONTEXT.md` in this implementation repository.
Existing uncommitted work belongs to the prior root setup task and remains intact.

## Proposed implementation

Add a separate, self-contained skill with its own layout reference and behavior scenarios.
Keep one Git owner for shared documents and component source files.
Preserve existing source paths instead of imposing `apps/`, `packages/`, or a build tool.
Ask project questions only when files do not establish the answer.
Keep optional tools separate from the baseline.

Keep the baseline documentation layout and ADR acceptance process.
A new glossary uses `GLOSSARY.md`. Existing glossary paths retain their authority.
Stop before edits for nested Git owners, submodules, an ancestor owner, or source hidden by ignore rules.
Do not convert existing multi-repository workspaces.

A separate skill preserves portability and leaves the existing root skill unchanged.
It repeats the small ADR schema instead of introducing a shared package or sibling dependency.

## File-by-file impact

| File | Change |
| --- | --- |
| `skills/setup-home-repo/SKILL.md` | Define inspection, questions, setup, checks, and boundaries for one Git owner. |
| `skills/setup-home-repo/references/layout.md` | Define the folder layout, agent outline, ADR schema, and optional additions. |
| `skills/setup-home-repo/references/scenarios.md` | Define new setup, repeat setup, visible source, and ownership conflict checks. |
| `docs/setup-home-repo.md` | Explain use, differences from root setup, and limits. |
| `docs/README.md` | Add the guide to the index without changing existing entries. |
| `plans/setup-home-repo-skill-plan.md` | Record scope, checks, and completion evidence. |

The new skill links only to files inside its own directory.
No existing root skill, real project, or user configuration needs changes.

## Risks and edge cases

- Existing ignore rules can hide component source files. Stop for a scope decision before edits.
- Nested Git metadata or submodules indicate a different ownership model. Preserve them and request a separate conversion task.
- A target can belong to an ancestor repository. Resolve the boundary before setup.
- Existing files, staged edits, branches, and glossary terms must survive setup and repeat runs.
- Symbolic links can point outside the target. A symbolic link is a filesystem entry that refers to another path.

## Validation / testing

Run the installed Pi skill loader against the new skill and expect no diagnostics.
Check bundled links and inspect prose for short, direct sentences.
Use disposable local test workspaces instead of real projects.

For a new workspace, expect one Git owner, baseline documents, and visible component source files.
For an existing workspace, expect preserved code, glossary, custom rules, and Git index.
The Git index is Git's staging area for the next commit.
A second setup pass with unchanged inputs must make no changes.
For nested ownership or hidden source, expect a stop before setup edits.

Run `git diff --check`, `pre-commit run --all-files`, and the hook on the new files.
Inspect delegated output before accepting it.
Report extra cases and interactive activation as untested unless they run.

## Step-by-step execution checklist

- [x] Inspect the existing skill, repository rules, and skill format.
- [x] Write the skill, layout reference, and behavior scenarios.
- [x] Run isolated behavior scenarios and inspect their evidence.
- [x] Update the usage guide and documentation index.
- [x] Run final checks and record completion evidence.

## Completion evidence

The installed Pi skill loader discovered `setup-home-repo` through the existing user skill path.
It returned no diagnostics and included the skill in its prompt listing.

An isolated agent performed the three primary scenarios in four disposable test workspaces.
The parent reviewed the report, check scripts, generated instructions, and conflict decisions.
The parent reran the saved check command:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /tmp/setup-home-repo-check.O6vTeN/check_fixtures.py
```

All primary checks passed. All 88 generated local file links resolved.
Both valid projects kept source visible under one Git owner.
Source bytes, existing staged and unstaged work, glossary terms, branch, commit reference, and remotes remained intact.
The second setup pass made no changes.
Both incompatible fixtures stopped without file or Git state changes.

The test agent corrected completed-plan index wording before the final repeat run.
The earlier state remains in the test evidence for review.
No skill change was necessary.

`docs-maintainer` added the guide and index entry.
The parent reviewed both files and corrected sentence structure and ignore-rule wording.

Repository checks passed:

- Skill metadata, self-contained local links, portability, and whitespace.
- Selected prose patterns and sentence lengths.
- `git diff --check`.
- `pre-commit run --all-files`.
- `pre-commit run --files` for all six affected Markdown files.

Test evidence remains under `/tmp/setup-home-repo-check.O6vTeN/` for local inspection.
Test scripts and test workspaces are not shipped setup tools.

Limits:

- Additional scenarios in the behavior reference remain untested.
- No hosted checks or interactive reload ran.
- No real project setup ran.
- No implementation file was staged or committed.
- No existing root skill, remote, or user configuration changed.

## Open questions / assumptions

- Assumption: this request authorizes skill creation, not setup in a real project.
- Assumption: the shared folder layout remains the baseline and source folder names stay project-specific.
- Decision: keep a single Git history and leave source files visible to Git.
- Decision: preserve the existing root skill and all unrelated working changes.
- Decision: keep publication, conversion, source scaffolding, and new build tools outside default setup.
