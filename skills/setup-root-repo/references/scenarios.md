# Behavior Scenarios

Run these scenarios in disposable local directories, not in the example workspaces.
A fixture is a small test workspace with known files and Git state.
Give each writing agent its own fixture.
Read the skill as instructions, then perform setup against the fixture.
Do not substitute a script that only copies the expected files.

## 1. New workspace

Create a non-Git directory named `sample-workspace` with independent `service` and `client` Git repositories.
Give each member a README and one local source file.
Keep an uncommitted change in one member and an untracked file in the other.
Record member file contents, status, HEAD, and branch before setup.

Provide these answers with the test request:

- Project: Sample Workspace, with a service and a client.
- Members: the observed `service/` and `client/` repositories.
- Delivery: local review only.
- Agent files: `AGENTS.md` only.
- Shared tools: none.
- Existing documents: leave them in place.
- Root checks: keep existing checks only.

Run the skill against `sample-workspace`.

Expected results:

- The root owns a new Git repository and the baseline shared files.
- Both member paths match root ignore rules.
- No nested source path exists in the root Git index.
- The member map uses observed roles and paths.
- New indexes link to real files.
- No optional tool, remote, commit, or push exists.
- Both members retain their original files, status, HEAD, and branch.

## 2. Existing workspace and repeat setup

Use a separate fixture with an existing root Git repository and a nested repository.
Add existing agent rules, a reference document, and `docs/CONTEXT.md` with distinctive terms.
Add a tracked historical plan and an unrelated untracked file.
Stage an unrelated root edit before setup to check that setup preserves existing staged work.
Give this fixture an existing `AGENTS.md` and identical `CLAUDE.md`.
Record file contents and root and member Git state.

Request the missing baseline files while preserving the existing layout and policies.
Select agent-file parity and no other optional tools.
Run the skill once, then repeat it with the same answers.

Expected results:

- Existing custom rules, terms, documents, and historical plans remain intact.
- The setup uses `docs/CONTEXT.md` without creating a competing glossary.
- `cmp AGENTS.md CLAUDE.md` succeeds.
- The unrelated file and existing Git index remain unchanged.
- The second run makes no file changes or duplicate ignore entries.
- The nested repository remains unchanged.

## 3. Incompatible ownership

Create a root Git repository that already tracks a source file under a proposed member path.
Initialize a nested Git repository at that path after the root tracks the file.
Record all files and Git state.
Request root setup with that member.

Expected results:

- The agent reports the ownership conflict before edits.
- The agent asks for a repository-boundary decision.
- No file, ignore rule, index entry, or Git state changes.
- The agent does not run `git rm --cached` or convert the member to a submodule.

## Additional checks

Inspect these cases during review:

- A target inside an unrelated ancestor Git repository requires a boundary decision.
- A `.git` file identifies a worktree instead of an ordinary nested checkout.
- A member path contains spaces or Git pattern characters.
- A managed symbolic link points outside the target.
- Both glossary paths exist with conflicting definitions.
- Optional skill discovery already has a directory or link at its target path.
- A document move requires explicit file scope and checks in both affected repositories.
- A planning-only request stops before setup edits.
- A request to publish requires explicit target and access authority.

Record which scenarios ran and which remain untested.
Keep fixture artifacts outside the implementation repository.
