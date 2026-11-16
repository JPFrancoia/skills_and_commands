---
name: setup-home-repo
description: Create or extend a single Git repository with project code, shared docs, plans, ADRs, and agent instructions. Use for home-repository or monorepo setup, not independent nested repositories.
---

# Set Up a Home Repository

A home repository holds project code and shared context in one Git repository.
A monorepo stores several project components in that repository.
A component is a project folder with a distinct responsibility, not an independent Git repository.
An architecture decision record (ADR) explains a design decision and its reasons.

Use [the layout reference](references/layout.md) before drafting files.
Use [the behavior scenarios](references/scenarios.md) to evaluate changes to this skill.

## 1. Inspect the target

1. Resolve the requested target path before edits.
2. If the request does not identify a target, ask for it.
3. Read applicable agent instructions, the root README, and existing documentation indexes.
4. Inspect source folders, ignore rules, plans, agent tools, and existing checks.
5. If `docs/CONTEXT.md` exists, read its terms before drafting prose.

Inspect Git ownership without changing it:

- Resolve the target with `git rev-parse --show-toplevel` from that directory.
- Distinguish a target-owned repository from an ancestor repository.
- Record status, tracked paths, the Git index, branch, commit reference, and configured remotes.
- Find nested `.git` directories, `.git` files, and submodules in project source paths.
- Exclude Git internals, dependency folders, and worktree storage from that search.

For a missing target, inspect its nearest existing parent for ancestor ownership.
The Git index is Git's staging area for the next commit.
A Git worktree is a separate checkout of a repository and can use a `.git` file.
A submodule is a separate Git repository referenced by its containing repository.
A symbolic link is a filesystem entry that refers to another path.

Record component paths and observed responsibilities from source files, READMEs, and local rules.
Preserve existing source folder names. Do not impose `apps/`, `packages/`, or a new build tool.
Use `git check-ignore --no-index` on representative source paths, including paths not yet present.
Distinguish shared source files from generated files that the project intentionally ignores.
Keep inspection local. Do not fetch, pull, or read credential files.

If the target belongs to an ancestor repository, stop before edits and ask for the intended boundary.
If project source has nested Git owners or submodules, stop before edits.
Explain that this skill does not convert independent repositories into one repository.
If ignore rules hide intended source files, stop before edits and request a separate rule-change decision.
Do not silently remove old member ignore entries or add broad exceptions.
If a managed path is a symbolic link, ask before changing its target.

Finish with the single Git owner, component map, source visibility, and existing conventions.

## 2. Resolve project choices

Preserve established paths and policies unless the user requests a change.
For missing, low-risk details, state a reversible default.
Ask only about choices that affect scope, project rules, delivery, or tools.
Use `ask_user_question` when available. Otherwise, ask in plain text.
Provide two to four result-focused choices per question.
Put the recommended choice first and label it `(Recommended)`.
Group up to four independent questions. Wait for answers before dependent questions.

Use this guide only for unresolved choices:

| Choice | Question | Result-focused choices |
| --- | --- | --- |
| Project map | Which components belong in this repository? | Use the observed layout. Use the user's corrected map. Plan folders for a new project. |
| Delivery | How must project changes reach the team? | Keep changes local for review. Use direct updates on the named default branch. Use pull requests. |
| Agent files | Which agent entry files does the team use? | Use `AGENTS.md` only. Keep `CLAUDE.md` identical to `AGENTS.md`. Preserve the existing arrangement. |
| Shared tools | Which optional tools belong here? | Add none. Add shared skills. Add diagram sources. Add both. |
| Checks | Which checks does the team need? | Keep existing checks only. Add agent-file parity when relevant. Add local Markdown-link checks. Add both applicable checks. |

For a new project, establish its name and purpose from the request or an explicit answer.
Keep existing documents in place. Ask separately if the user requests specific document moves.
Preserve task tools and branch rules. Ask before introducing replacements.
A delivery policy documents future work. It does not authorize publication during setup.

Finish with the target, component map, shared files, selected tools, and excluded work.

## 3. Create or extend the structure

State these success criteria before edits:

- One Git repository owns shared context and project code.
- Intended source paths remain visible to Git instead of matching ignore rules.
- Agent instructions route work by folder within the same repository.
- Reference documents, plans, draft ADRs, and accepted ADRs have distinct roles.
- Existing files and Git state remain intact outside the approved shared-file changes.

Present a short file list and the chosen defaults.
For a planning-only request, stop before setup edits.
For non-trivial setup, create or update a plan under root `plans/`.
Continue without another approval pause when the request authorizes implementation.

If the approved target does not exist, create that directory.
If it has no Git owner, initialize Git in that exact directory.
Use the configured initial branch, or `main` when none exists.
Preserve an existing repository, branch, and remote configuration.
A target-owned worktree can retain its existing `.git` file.
Create no nested Git repositories, submodules, or source scaffolding.

Use the baseline in [the layout reference](references/layout.md).
For existing files, make targeted edits that preserve unrelated wording, sections, and links.
Resolve conflicting project rules before adding new guidance.
Use one glossary. Preserve its authoritative path.
If two glossary files exist, establish their authority before adding definitions.
For a new glossary, use `GLOSSARY.md` without inventing domain facts.

Ignore only credentials, local runtime state, and relevant generated output.
Preserve existing ignore exceptions and keep `.env.example` visible when the project uses it.
Keep component source, shared documents, and shared skills visible to Git.
Do not add component folders to `.gitignore`.
Do not stage files, create commits, or alter the Git index without explicit authority.

Create only selected optional tools.
Before copying shared skills, inspect their dependencies and project assumptions.
If Pi discovery is selected, `.pi/skills` can link to tracked `agent-skills/`.
Inspect the target path before creating that relative link.
Do not replace an existing path or modify user-level configuration.

Preserve accepted ADRs and historical plans.
Create new decision records as drafts until a human explicitly accepts them.
For approved document moves, repair all affected links and inspect the complete diff.

Finish when the shared file list is complete and unselected tools remain absent.

## 4. Check the result

1. Inspect `git status --short`, `git diff --check`, and the complete new-file list.
2. Use `git ls-files` to inspect tracked source and `git ls-files --others --exclude-standard` for new source.
3. Run `git check-ignore --no-index` on representative source paths and expect no match.
4. Check that new local Markdown links resolve from their containing files.
5. Check that documentation indexes include the new pages.

Check that component paths resolve to the same Git root as the target.
Distinguish a present source file from an intended path that has no code yet.
Do not stage files to prove that Git can track them.
Compare source contents, existing Git index, branch, commit reference, and remotes with the inspection record.
Expect no changes outside approved shared files. Report unexpected differences without resetting them.

If agent-file parity is selected, run `cmp AGENTS.md CLAUDE.md`.
If optional checks were added, run their actual local commands and inspect the output.
Report hosted checks as unverified until they run on the requested target.

Read final agent instructions as a routing check:

- Can an agent find the affected folder and its applicable local rules?
- Do all components share the same Git history and delivery policy?
- Can an agent distinguish implemented behavior, proposed work, and accepted decisions?
- Can an agent find terminology and actions that need user approval?

Report changed files, selected policies, checks, and remaining limits.
Repeat setup without duplicate sections, files, or ignore rules.
An unchanged project with the same answers must need no further edits.

## Boundaries

- Keep setup local unless the current request explicitly authorizes an external change.
- Ask before creating remotes, changing access, pushing, opening pull requests, or deploying.
- Keep conversion, source moves, automatic sync, and destructive cleanup outside default setup.
- Keep product scaffolding, dependencies, build tools, and task trackers outside default setup.
- Keep generated instructions focused on this project rather than the operator's personal configuration.
