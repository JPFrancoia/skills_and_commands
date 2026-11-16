# Behavior Scenarios

Use disposable local test workspaces, not real projects.
A fixture is a test workspace with known files and Git state.
Give each writing agent its own fixture.
Read the skill as instructions, then perform setup against the fixture.
Do not replace this process with a script that copies an expected file tree.

## 1. New single repository

Create a non-Git directory with `service/` and `client/` source folders.
Give each folder a README and a small source file.
Create no nested Git repositories.
Record file contents and the absence of Git ownership before setup.

Use these approved test answers:

- Project: Sample Home, with a service and a client.
- Components: the observed `service/` and `client/` folders.
- Delivery: local review only.
- Agent files: `AGENTS.md` only.
- Optional tools and new checks: none.
- Existing documents: keep their current paths.

Run the skill against the fixture.

Expected results:

- One root Git repository owns shared context and component source.
- The baseline shared files and indexes exist.
- `git check-ignore --no-index` has no match for component source paths.
- Source files appear in `git ls-files --others --exclude-standard` without staging.
- Both component folders resolve to the same Git root as the project.
- Source bytes remain unchanged and no nested Git metadata exists.
- Generated links resolve and the component map uses observed responsibilities.
- No optional tool, source scaffold, remote, staged file, commit, or publication exists.

## 2. Existing repository and repeat setup

Create one Git repository with tracked component source and no nested repositories.
Add custom root rules and identical `AGENTS.md` and `CLAUDE.md` files.
Add `docs/CONTEXT.md`, a current reference document, and a historical plan.
Give the glossary distinctive terms and use them in the existing rules.
Stage an unrelated root edit. Keep a separate uncommitted source edit and an unrelated untracked file.
Record files, the Git index, status, commit reference, branch, and remotes.
The Git index is Git's staging area for the next commit.

Request missing baseline files while preserving the current layout and policies.
Select agent-file parity and no other optional tools.
Run the skill once, then repeat it with the same answers.

Expected results:

- Existing source paths and bytes, custom wording, terms, and historical records remain intact.
- The setup uses `docs/CONTEXT.md` without creating a competing glossary.
- `cmp AGENTS.md CLAUDE.md` succeeds.
- Shared indexes link both new pages and existing records.
- The existing Git index, staged edit, source edit, branch, commit reference, and remotes remain unchanged.
- Component source remains tracked or visible as an untracked file, never hidden by ignore rules.
- The second run changes no file or Git state and adds no duplicate section or ignore entry.

## 3. Incompatible ownership or hidden source

Use separate fixtures for these cases:

1. A root repository contains a component with its own Git repository.
2. A root repository ignores an intended component source folder through a root-anchored rule.

Record all files and Git state before setup.
Request home-repository setup with the affected component.

Expected results:

- The agent reports the incompatible ownership or hidden source before setup edits.
- The agent asks for a separate conversion or ignore-rule decision.
- Every file, index, branch, commit reference, and remote remains unchanged.
- No Git metadata is removed and no source moves occur.
- No ignore rule or broad exception changes silently.

## Additional checks

Inspect these cases during review:

- An unrelated ancestor repository owns the target.
- The target is a valid root worktree with a `.git` file.
- A tracked submodule appears under a component path.
- Component paths contain spaces or Git pattern characters.
- A managed symbolic link points outside the target.
- Both glossary paths exist with conflicting definitions.
- An optional discovery path already has a directory or link.
- A request permits planning only or explicitly approves document moves.

Record which scenarios ran and which remain untested.
Keep fixture artifacts outside the implementation repository.
