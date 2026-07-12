# Bash command picker Pi extension plan

Status: Implemented
Date: 2026-07-10

## 1. Brief

Build a small Pi extension that lets you copy either one logical shell command or an entire assistant `bash`/`sh`/`shell`/`zsh` block without selecting terminal-rendered text. Pi's public extension API does not appear to support clickable controls inside the built-in assistant Markdown renderer, so the extension uses an `F2` picker over commands extracted from the active session branch. This solves both single-command reuse and whole-block terminal execution without modifying assistant messages or polluting model context.

## 2. Current state / relevant context

- Target directory: `/home/djipey/informatique/ai/skills_and_commands/extensions`.
- Existing local extension style: single-file TypeScript (`extensions/pi-sqz-auto.ts`) with comments explaining symlink/install usage.
- Pi supports:
  - `pi.registerShortcut()` for commandless keyboard triggers.
  - `ctx.ui.custom(..., { overlay: true })` for picker overlays.
  - `copyToClipboard()` exported by `@earendil-works/pi-coding-agent`.
  - `message_end` can replace assistant messages, but doing so would persist decorative icons into the session/context.
- Pi does not expose a documented hook to override or augment built-in assistant-message Markdown rendering with clickable per-line controls.

## 3. Proposed implementation

Create `extensions/pi-bash-command-picker.ts`.

Behavior:

1. On shortcut, inspect the current session branch.
2. Find assistant messages, newest first.
3. Extract fenced shell blocks with languages: `bash`, `sh`, `shell`, `zsh`.
4. Add a clearly labeled `COPY ENTIRE BLOCK` choice that preserves the fenced block verbatim and appends one final newline so its last command can execute when pasted.
5. Split each block into logical commands and add the individual choices after its whole-block choice.
6. Show an overlay picker with one-line previews and optional full previews.
7. Copy the selected command or block to the clipboard.

Trigger:

- Primary: keyboard shortcut `f2`.
- No slash command was added. The user's preference is no command, and the footer/status hint exposes the shortcut.

Logical command splitting rules for v1:

- Keep multi-line commands together when lines end with `\`.
- Keep heredocs together from `<<EOF`/`<<'EOF'`/`<<-EOF` until the delimiter line.
- Keep simple variable assignments together when immediately followed by a command that uses them in the same setup block? No; v1 treats assignment lines as their own command because this is safer and simpler.
- Ignore empty lines and full-line comments.
- Do not try to parse shell grammar fully. If a block is too complex, copied snippets remain readable and the user can choose the nearest logical chunk.

UI:

- Overlay title: `bash commands & blocks` plus choice count.
- Rows: newest blocks first; each block starts with an accent-colored `▣ COPY ENTIRE BLOCK (N commands)` choice followed by its individual commands.
- Keys: up/down navigate, Enter copy, Space/Tab full preview, Esc cancel.
- Footer and notification explicitly distinguish whole-block copying from single-command copying.

## 4. File-by-file impact

- `extensions/pi-bash-command-picker.ts` — new extension containing parser, picker component, and shortcut registration.
- No package/config changes unless the user wants this auto-loaded from settings. Existing install style can be symlink/copy into `~/.pi/agent/extensions/` followed by `/reload`.

## 5. Risks and edge cases

- Clickable icon at end of line: likely not supported by Pi's public renderer API for built-in assistant messages. Rewriting assistant text to add icons is possible but wrong: it persists decoration into sessions and LLM context, and the icon still would not be clickable.
- Shell parsing is hard. V1 deliberately supports common command shapes instead of a full shell AST.
- Multi-line `if/for/while` blocks may split imperfectly unless line continuations or heredocs make boundaries obvious.
- Clipboard support depends on Pi's `copyToClipboard()`, matching `/copy` behavior.
- Whole blocks are not rewritten with `&&` or `set -e`; they retain the assistant's intended shell semantics and therefore continue after ordinary command failures unless the block itself says otherwise.
- Terminal bracketed-paste settings may require one explicit Enter press; the copied block includes a final newline so all lines, including the last, are ready to execute.

## 6. Validation / testing

- Add a tiny self-test block in the extension gated behind a local helper? Prefer a separate `node`/`tsx` test only if the repo already has TypeScript tooling; it does not.
- Practical validation:
  - Run `pi -e /home/djipey/informatique/ai/skills_and_commands/extensions/pi-bash-command-picker.ts`.
  - Ask Pi to output a `bash` block containing simple commands, continuations, and a heredoc.
  - Press the shortcut and verify the picker lists individual commands.
  - Copy one command and paste into another terminal/editor to verify raw text.

## 7. Step-by-step execution checklist

- [x] Implement extraction helpers.
- [x] Implement command splitter with continuation + heredoc support.
- [x] Implement overlay picker component.
- [x] Register `f2` shortcut.
- [x] Smoke-test with TypeScript import/type syntax if a checker is available; otherwise run via `pi -e` instructions.
- [x] Add a visually distinct whole-block choice for every shell block.
- [x] Preserve whole-block content and append a final newline for terminal execution.
- [x] Update this plan with actual validation results.

Validation completed:

- `tsc -p /tmp/pi-bash-command-picker-tsconfig.json` (re-run after whole-block support)
- Node parser self-check using a temporary test copy with package symlinks; verified simple commands, continuations, heredoc, and `if ... fi` grouping.

## 8. Open questions / assumptions

- Assumption: a keyboard shortcut is acceptable as the commandless trigger because clickable inline icons are not exposed by Pi today.
- Assumption: latest assistant responses are enough, but the implementation scans all assistant messages in the active branch newest-first.
- Decision: copy whole blocks unchanged rather than joining commands with `&&` or adding `set -e`; changing failure behavior would alter the assistant's command sequence.
- Decision: append a final newline to whole-block clipboard text so the final command is executable as part of the paste.

## Grill option

Before implementation, we can use the `grill` skill to challenge this plan against Pi's extension APIs and existing local conventions. Recommendation: skip grill for v1; this is a small extension and the main API limitation is already clear.
