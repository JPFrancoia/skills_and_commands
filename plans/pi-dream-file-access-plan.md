# Dream memory access through normal file commands

**Completed: 2026-11-03**

## Brief

Normal sessions need a memory folder and a short file list, not a separate memory tool. The user approved access through Bash and normal file tools. Keep accepted memory visible without adding a search service.

## Current state / relevant context

`before_agent_start` adds a generated list of paths and descriptions to the `dream-memory` system prompt section. The list allows 100 files and 12,000 characters. A registered `dream_memory` tool adds separate usage guidance and supports list, search, and read. The list is not a stored search database.

Workers use three separate tools to edit candidate memory with hashes and evidence. These tools must remain unchanged. `docs/CONTEXT.md` does not exist. Earlier source changes remain uncommitted and must remain intact.

## Proposed implementation

Keep `buildMemoryIndex` and its limits. In the existing event handler, resolve the accepted folder to an absolute path. Add that path and short instructions before the list. Tell the assistant to use normal commands to search and read relevant files. Treat stored facts as historical context. Require explicit user permission before changing accepted memory.

Delete the normal-session `dream_memory` registration and its unused imports. Do not change worker tools, storage, review branches, or apply behavior. Do not add a saved index or search dependency.

## File-by-file impact

- `extensions/pi-dream/index.ts`: remove the tool and add folder guidance to the existing prompt section.
- `extensions/pi-dream/pi-dream.test.ts`: check tool absence, folder guidance, empty stores, index limits, fresh file discovery, and file access.
- `docs/pi-dream.md`: explain the file-command workflow and the generated index.
- This plan: record decisions and validation.

## Risks and edge cases

- Bash does not enforce read-only access. Prompt guidance requires user permission before writes but cannot enforce it.
- The prompt must contain an absolute folder path even when the store is empty or an override is relative.
- The file list must not include full file bodies or pending candidate files.
- Shell commands must quote paths with spaces. No command string will run from the prompt builder.
- Removing a tool changes the available tools after reload. Existing session history can still mention the old tool.

## Validation / testing

Before editing source, add tests for the folder path and removal of `dream_memory`. Check missing and empty folders, relative overrides, spaces in paths, and new files between agent runs. Keep index limits and worker tools covered. Verify ordinary search and read commands against temporary memory.

Run focused Dream tests and strict TypeScript checks. Use an isolated real Pi session to inspect the effective prompt and tool names before any provider request. Verify that no paid request runs. Run `git diff --check` and `pre-commit run --all-files`. Leave live memory and settings unchanged.

## Step-by-step execution checklist

1. [x] Show the current prompt and inspect affected code, tests, and examples.
2. [x] Add focused regression tests and implement file guidance.
3. [x] Update and review documentation.
4. [x] Verify the real prompt, normal commands, and repository checks.
5. [x] Record results and activation instructions.

## Results

- Displayed the exact original Dream section and its tool guidance before editing.
- The new regression reproduced the unwanted `dream_memory` registration.
- Focused tests passed for the tool removal, folder guidance, empty stores, relative overrides, paths with spaces, and new file discovery.
- Tests confirmed that file bodies stay out of the list and worker tools remain registered.
- Strict TypeScript checks passed.
- A real isolated Pi run sent the new prompt and no `dream_memory` tool. It executed normal Bash search and read commands.
- A local test provider supplied fixed responses. This check verified the mechanism, not a real model's choice to read memory.
- Request captures and output are in `/tmp/pi-dream-file-access-proof-NqKo9c/`.
- `docs-maintainer` updated the document. The parent reviewed it and clarified the index and write restriction.
- `git diff --check` and `pre-commit run --all-files` passed.
- Live accepted memory and settings remained unchanged. No paid provider requests ran.

## Deviations

None. Run `/reload` in open sessions to activate the new prompt and remove the old tool.

## Open questions / assumptions

The user approved the scope. No further decision is needed. The current prompt request refers to normal-session memory guidance, not the batch worker prompt. Do not install, commit, push, or edit live accepted memory.
