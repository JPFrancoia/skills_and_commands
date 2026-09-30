# MCP status indicator plan

Status: Completed — 2026-09-30 (tool-ready count)

## 1. Brief

Restore the plug indicator lost when the user switched to Pi's built-in MCP support. Show the number of servers with available tools, not an exact live connection count.

## 2. Current state / relevant context

Pi 0.99.1 keeps connection states private. Its public tool list includes MCP namespaces and tool exposure. Existing extensions use `ctx.ui.setStatus()` for footer indicators.

## 3. Proposed implementation

Add one extension that counts distinct `mcp__` namespaces with non-hidden tools. Show `🔌 N`, including zero. Refresh the local tool list once per second during UI sessions. Clear the timer on session shutdown and before session restart. Do not start another MCP client or process.

## 4. File-by-file impact

- `extensions/pi-mcp-status.ts`: indicator and timer lifecycle.
- `extensions/pi-mcp-status.test.ts`: Node assert check for counts and cleanup.
- `docs/pi-mcp-status.md` and `docs/README.md`: behavior, limitations, and installation.
- No live configuration changes or installation symlinks.

## 5. Risks and edge cases

Disconnected servers can retain registered tools. Servers without tools do not count. Hidden tools do not count. The user approved this limitation instead of changing Pi itself.

## 6. Validation / testing

Check duplicate namespaces, hidden tools, zero count, startup, refresh, restart, and shutdown. Load the extension in a temporary Pi TUI and inspect its footer. Run `git diff --check` and `pre-commit run --all-files`. Browser-based ProofShot does not apply to this terminal UI.

## 7. Step-by-step execution checklist

- [x] Inspect public API and adjacent extension.
- [x] Confirm count semantics with the user.
- [x] Add extension and adjacent check.
- [x] Verify real TUI display.
- [x] Document implemented behavior and run hygiene checks.

Validation: The adjacent check passed with Pi's installed jiti. TypeScript strict checking passed for both files. A temporary Pi TUI loaded the actual configured servers and displayed `🔌 0`, `🔌 1`, then `🔌 2`. The ANSI capture is `/tmp/pi-mcp-status-tui.ansi`. No model request ran. `git diff --check` and `pre-commit run --all-files` passed. Documentation review confirmed the count limitations and manual installation instructions.

## 8. Open questions / assumptions

The user requested repository files, not installation into `~/.pi`. Follow the existing symlink instructions but do not install automatically. No command, configuration knob, or dependency is necessary.
