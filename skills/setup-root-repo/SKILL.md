---
name: setup-root-repo
description: Create or extend a workspace root for independent nested Git repositories. Use for root-repository setup with shared docs, plans, ADRs, and agent instructions.
---

# Set Up a Root Repository

A workspace root is a Git repository for shared project context.
A nested repository is an independent Git repository inside that root.
The root does not track nested source files.
An architecture decision record (ADR) explains a design decision and its reasons.

Create the shared structure first.
Tailor project rules through questions that existing files cannot answer.
Use [the layout reference](references/layout.md) before drafting files.
Use [the behavior scenarios](references/scenarios.md) to evaluate changes to this skill.

## 1. Inspect the target

1. Resolve the requested target path before edits.
2. If the request does not identify a target, ask for it.
3. Read applicable agent instructions and the root README.
4. Inspect existing documents, plans, ignore rules, agent tools, and root checks.
5. If `docs/CONTEXT.md` exists, read its terms before drafting prose.

Inspect Git ownership without changing it:

- Resolve the target with `git rev-parse --show-toplevel` from that directory.
- Distinguish a target-owned `.git` from an ancestor repository.
- Inspect the root status, tracked paths, branch, and configured remotes.
- Find nested repositories through `.git` directories and `.git` files.
- Exclude Git internals, dependency folders, and worktree storage from the search.

A `.git` file can identify a Git worktree, which is a separate checkout of a repository.
Resolve member roots with Git instead of inferring them from folder names.
Treat symbolic links as boundaries until their targets are clear.

Record each member's relative path, purpose, current branch, and working state.
Use local READMEs and instructions to establish purpose.
Distinguish observed facts from unknown details.
Keep the inspection local. Do not fetch, pull, or read credential files.

If the target belongs to an ancestor repository, stop before edits.
Ask the user to choose the intended boundary.
If the root tracks nested source files or submodules, stop before edits.
Explain that this skill does not convert an existing repository layout.
If a managed path is a symbolic link, ask before changing its target.

Finish with a root ownership map and a list of existing conventions.

## 2. Resolve project choices

Preserve established paths and rules unless the user requests a change.
For missing, low-risk details, state a reversible default.
Ask only for choices that affect scope, ownership, delivery, or tools.
Use `ask_user_question` when available.
Provide two to four result-focused choices per question.
Put the recommended choice first and label it `(Recommended)`.
The user can type an answer that is not in the choices.
If that tool is absent, ask the same question in plain text.

Group up to four independent questions.
Wait for an answer before asking a dependent question.
Never treat silence as approval for an external action.

Use this question guide only for unresolved choices:

| Choice | Question | Result-focused choices |
| --- | --- | --- |
| Project map | Which repositories belong in this workspace? | Use the discovered map. Use a corrected map supplied by the user. |
| Root delivery | How must shared context changes reach the team? | Keep changes local for review. Use direct updates on the named default branch. Use pull requests. |
| Agent files | Which agent entry files does the team use? | Use `AGENTS.md` only. Keep `CLAUDE.md` identical to `AGENTS.md`. Preserve the existing arrangement. |
| Shared tools | Which optional shared tools belong here? | Add none. Add shared skills. Add diagram sources. Add both. |
| Existing documents | What must happen to documents inside nested repositories? | Leave them in place and link to them. Plan a separate migration. Move an explicit approved file list. |
| Root checks | Which local checks or CI checks does the team need? | Keep existing checks only. Add agent-file parity when relevant. Add local Markdown-link checks. Add both applicable checks. |

CI means checks that a hosting service runs after a change.
Record the selected check scope, including paths with intentional example links.

For a new project, establish its name and purpose from the request or an explicit answer.
For task tools and nested-repository delivery rules, preserve existing guidance.
If the user requests new rules for these areas, ask a separate focused question.
Do not select an issue tracker, review service, or branch workflow by copying an example project.

For a new root, use the configured Git initial branch, or `main` when none exists.
For an existing root, preserve its branch and remote configuration.
A selected delivery policy documents future work. It does not authorize publication during setup.

Finish with a short setup summary that names the target, members, shared files, optional tools, and excluded work.

## 3. Create or extend the structure

State success criteria before editing:

- The root owns shared context, not nested source files.
- Agent instructions identify the target repository before edits.
- Reference documents, plans, draft ADRs, and accepted ADRs have distinct roles.
- Existing work and explicit project rules remain intact.
- Every new document is reachable from an appropriate index.

Present a short file list and the chosen defaults.
For non-trivial setup, create or update a plan under root `plans/`.
Continue after the summary when the request authorizes implementation.
For a planning-only request, stop before setup edits.

If the approved target does not exist, create that directory.
If the target has no Git repository or ancestor repository, initialize Git in that exact directory.
Do not reinitialize an existing repository or rename its branch.

Use the baseline in [the layout reference](references/layout.md).
For existing files, make targeted edits instead of replacing the whole file.
Preserve unrelated wording, sections, links, and task records.
If existing instructions conflict, resolve the conflict before adding contradictory guidance.

Add root-anchored ignore entries for every approved nested repository path.
Escape Git pattern characters in literal directory names.
Ignore local credentials and agent state without hiding shared documents or tracked skills.
Inspect existing exceptions before adding ignore rules.
Never use `git add .` or alter the Git index during setup without explicit authority.

Use one glossary. Preserve its existing path.
If both `docs/CONTEXT.md` and `GLOSSARY.md` exist, establish their authority before adding definitions.
For a new glossary, use `GLOSSARY.md`.
Define shared context terms without inventing domain facts.

Create only selected optional tools.
Link to installed shared skills instead of duplicating their instructions.
Before copying a skill, inspect its dependencies and remove project-specific assumptions.
If Pi project discovery is selected, `.pi/skills` can link to the tracked `agent-skills/` directory.
Inspect existing discovery paths before creating that link.
Do not overwrite a directory, replace a link, or modify user-level configuration.

Keep existing documents in place unless the user approves specific moves.
For approved moves, repair links and inspect the diff in every affected repository.
Preserve accepted ADRs and historical plans.
Create new decision records as drafts until a human explicitly accepts them.
Do not invent retrospective ADRs from folder names or unreviewed assumptions.

Finish when the file list is complete and unselected tools remain absent.

## 4. Check the result

Run the applicable checks from the target root:

1. Inspect `git status --short`, `git diff --check`, and the complete new-file list.
2. Inspect `git ls-files` for nested source paths that the root already tracks.
3. Use `git check-ignore --no-index` to check each approved nested repository path.
4. Check that new Markdown links resolve from their containing files.
5. Check that documentation indexes include the new pages.

Compare each nested repository's files and Git state with the inspection record.
Expect no nested changes unless the user explicitly approved them.
If root setup changes nested state unexpectedly, stop and report the difference.
Do not reset or discard that state.

If agent-file parity is selected, run `cmp AGENTS.md CLAUDE.md`.
If optional checks were added, run their actual local commands.
Inspect their output instead of reporting success from their presence alone.
Report hosted CI as unverified until it runs on the requested target.

Read the final agent instructions as a routing test:

- Can an agent find the correct repository and its local instructions?
- Can an agent distinguish current behavior from proposed work?
- Can an agent find the relevant accepted decisions and terminology?
- Can an agent identify actions that still need user approval?

Report created and changed files, selected policies, checks, and remaining limits.
Repeat setup safely: preserve conventions and avoid duplicate sections or rules.
An unchanged workspace with the same answers must need no further edits.

## Boundaries

- Keep setup local unless the current request explicitly authorizes an external change.
- Ask before creating remotes, changing access, pushing, opening pull requests, or deploying.
- Keep nested repositories independent. Do not add submodules or copy their source into the root.
- Keep data, credentials, and local runtime state outside tracked context.
- Exclude automatic sync, branch deletion, worktree cleanup, and document migration from default setup.
- Keep generated agent instructions focused on this workspace, not the operator's personal configuration.
