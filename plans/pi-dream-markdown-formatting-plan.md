# Pi Dream Markdown formatting plan

## Brief

Format Dream memory with Prettier at a target width of 79 characters.
Prettier is an existing Markdown formatter.
Let Prettier handle Markdown structure and safe line-width exceptions.
Apply the same formatting to current memory files and future candidate writes.

## Current state / relevant context

- Pi Dream is an extension under `extensions/pi-dream/`.
- `applyMemoryEdit()` validates candidate content before an atomic write.
  An atomic write replaces a file only after the new content is complete.
- File hashes and write records describe the content that Dream saves.
- Accepted memory lives in `/home/djipey/.pi/agent/memory`.
  This repository currently has no local changes.
- Neovim uses `vmap <F6> !fmt -w 79 <CR>` for selected Markdown text.
  The setting lives in `/home/djipey/.config/nvim/ftplugin/markdown/markdown.vim`.
- `fmt` wraps plain text but does not understand Markdown structure.
- Prettier 3.8.1 is installed on this machine.
  A read-only run on all eight memory files produced stable output.
  A second pass made no changes, and current metadata stayed unchanged.
- The user accepted safe exceptions and requested normal formatter behavior.

## Proposed implementation

1. Use Prettier 3.8.1 with fixed settings:
   - `parser: "markdown"`
   - `printWidth: 79`
   - `proseWrap: "always"`
   - `embeddedLanguageFormatting: "off"`
   - `endOfLine: "lf"`
2. Add Prettier as an exact package dependency with a lockfile.
   Use its API instead of a machine-specific binary path.
   Do not read project or editor settings during formatting.
3. Add one small formatter module with a function and a command-line entry.
   The command takes an explicit memory directory.
   Reuse Dream's existing Markdown file discovery and path safeguards.
   Prepare and validate all results before the command changes any file.
   Replace changed files through temporary files and rename.
4. Format each `dream_memory_edit` write before Dream saves the content.
   Validate the input and formatted result with the existing memory checks.
   Preserve the parsed description and scope.
   Calculate the returned hash and write record from the saved result.
   Leave delete and move operations unchanged.
5. Run the same formatter once on the accepted memory directory.
   Change formatting only, without changing facts or committing memory.

Prettier supplies Markdown handling, so this change needs no custom wrapping
algorithm or custom exception list. Long code, paths, URLs, tables, and metadata
can exceed 79 characters. The formatter sets the exact exceptions.

The dependency adds a small installation requirement. It avoids differences
between globally installed formatter versions and needs no runtime downloads.
The setup instructions must include the package dependency installation step.

## File-by-file impact

- `extensions/pi-dream/package.json` and a new `package-lock.json`:
  declare and lock Prettier 3.8.1.
- `extensions/pi-dream/.gitignore`:
  exclude the local dependency installation.
- `extensions/pi-dream/format-memory.mjs`:
  provide the shared formatter and the explicit-directory command.
  Share the existing atomic write helper with candidate edits.
- `extensions/pi-dream/worker-extension.ts`:
  format write content before the existing atomic write and hash calculation.
- `extensions/pi-dream/pi-dream.test.ts`:
  cover formatting, metadata, hashes, failures, and repeated runs.
- `docs/pi-dream.md`:
  document automatic formatting, dependency setup, exceptions, and the command.
- `/home/djipey/.pi/agent/memory/**/*.md`:
  apply one formatting-only pass after implementation approval.
- This plan:
  record decisions, checks, and completion.

## Risks and edge cases

- A 79-character target is not a strict maximum for every Markdown line.
- Metadata means the description and scope fields at the start of a file.
  Dream currently reads those fields with a small parser.
  Formatting must not change their parsed values.
- Code blocks, inline code, lists, tables, links, and explicit line breaks need
  tests because plain-text wrapping can damage them.
- Invalid Markdown or a missing formatter dependency must produce a clear error.
  A failed write must leave the previous file unchanged.
- The first formatting pass creates a larger diff than later passes.
- Active Dream jobs can contain older snapshots of accepted memory.
  Do not change their files, state, or branches during the one-time pass.
  Their later proposals can require another review or merge.
- Existing accepted memory must remain free of unrelated local changes before
  the one-time pass starts.

## Validation / testing

- Check ordinary paragraphs and list items against the 79-character target.
- Check Markdown examples with safe exceptions and preserved code content.
- Check that formatting twice produces identical output.
- Check that description and scope retain the same parsed values.
- Check that returned hashes and write records match formatted file contents.
- Check that formatter errors leave previous files and write records unchanged.
- Run the formatter command against a temporary memory directory twice.
  Check that the second run changes no files.
- Run the adjacent Pi Dream test with the installed jiti loader and host aliases.
- Run `node --check` on the formatter module.
- Run `git diff --check` and `pre-commit run --all-files` in this repository.
- Review the accepted memory diff after its one-time pass.
  Check repeated formatting and `git diff --check` in that repository.
- Report any runtime path that remains unchecked.

Checks completed during implementation:

- `npm ci --prefix extensions/pi-dream` installed the pinned dependency.
  npm reported no vulnerabilities.
- The adjacent jiti suite passed, including formatter command checks.
- All 19 recovery tests passed.
- `node --check extensions/pi-dream/format-memory.mjs` passed.
- `git diff --check` and `pre-commit run --all-files` passed.
- A read-only pass over all eight accepted memories found whitespace-only
  changes and stable output on a second pass.
- The documentation agent updated the guide and checked a temporary fixture.
  Parent review corrected the lock description and removed duplicate reload steps.
- The formatter changed seven of eight accepted memory files.
  `README.md` needed no change.
- All eight files retained the same words and parsed metadata.
  The second command run reported zero changed files.
- Seven lines remain over 79 characters: five descriptions and two paths.
- The accepted memory diff passed `git diff --check`.
  Memory changes remain uncommitted and block `/dream-apply` until reviewed
  and committed by the user.
- No live Dream batch or Pi reload ran during validation.

Completed on 2026-11-08. No source or memory commit ran.

## Step-by-step execution checklist

- [x] Add the pinned formatter and shared module.
  Result: formatting tests pass and a second pass changes nothing.
- [x] Connect the formatter to candidate writes.
  Result: write hashes match formatted content and failed writes preserve files.
- [x] Update the existing Dream guide and run relevant checks.
  Result: the guide matches behavior and the checks pass.
- [x] Format accepted memory and review its diff.
  Result: only formatting changes remain, with no changes on a second pass.

## Open questions / assumptions

- Decision: use a 79-character target with safe exceptions.
- Decision: let the formatter handle Markdown instead of adding wrapping rules.
- Assumption: Prettier matches the requested result better than applying `fmt`
  to complete Markdown documents.
- Approved scope: apply a one-time formatting pass to current accepted memory.
  Do not commit the result.
- The user approved this plan and requested implementation.
- Keep Prettier imports inside the formatting function.
  Missing dependencies then fail the write without disabling memory reads.
- `embeddedLanguageFormatting: "off"` also preserves YAML metadata text.
  Prettier therefore does not provide YAML syntax checks in this mode.
  Existing memory checks still apply, and parsed metadata must stay unchanged.
