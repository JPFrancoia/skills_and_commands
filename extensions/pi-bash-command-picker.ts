/**
 * pi-bash-command-picker — copy one logical shell command from assistant bash blocks.
 *
 * Install by symlinking/copying this file into ~/.pi/agent/extensions/ and running /reload.
 * Shortcut: F2
 */

import { copyToClipboard, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { type Focusable, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const STATUS_KEY = "bash-command-picker";
const SHORTCUT = "f2";
const SHELL_LANGUAGES = new Set(["bash", "sh", "shell", "zsh"]);
const MAX_COMMANDS = 200;

type ShellBlock = {
	language: string;
	code: string;
};

type ShellCommand = {
	command: string;
	preview: string;
	language: string;
	sourceLabel: string;
};

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part: { type?: string }) => part?.type === "text")
		.map((part: { text?: string }) => part.text ?? "")
		.join("");
}

function extractShellBlocks(text: string): ShellBlock[] {
	const blocks: ShellBlock[] = [];
	const fence = /^```([^\n`]*)\r?\n([\s\S]*?)^```[ \t]*$/gm;
	let match: RegExpExecArray | null;

	while ((match = fence.exec(text))) {
		const language = (match[1] ?? "").trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
		if (!SHELL_LANGUAGES.has(language)) continue;
		const code = (match[2] ?? "").replace(/\s+$/, "");
		if (code.trim()) blocks.push({ language, code });
	}

	return blocks;
}

function isBlankOrComment(line: string): boolean {
	const trimmed = line.trim();
	return trimmed === "" || trimmed.startsWith("#");
}

function hasLineContinuation(line: string): boolean {
	const trimmed = line.trimEnd();
	let count = 0;
	for (let i = trimmed.length - 1; i >= 0 && trimmed[i] === "\\"; i--) count++;
	return count % 2 === 1;
}

function expectsNextLine(line: string): boolean {
	const trimmed = line.trimEnd();
	return /(?:&&|\|\||\|)\s*$/.test(trimmed);
}

function heredocDelimiter(line: string): string | undefined {
	const match = line.match(/<<-?\s*(?:"([^"]+)"|'([^']+)'|\\?([A-Za-z_][A-Za-z0-9_]*))/);
	return match?.[1] ?? match?.[2] ?? match?.[3];
}

function startsShellBlock(line: string): "fi" | "done" | "esac" | "}" | undefined {
	const trimmed = line.trim();
	if (/^(if|case)\b/.test(trimmed)) return trimmed.startsWith("case") ? "esac" : "fi";
	if (/^(for|while|until|select)\b/.test(trimmed)) return "done";
	if (/^(function\s+\w+|\w+\s*\(\s*\))\s*\{/.test(trimmed)) return "}";
	return undefined;
}

function closesShellBlock(line: string, terminator: string): boolean {
	const trimmed = line.trim();
	if (terminator === "}") return trimmed === "}";
	return trimmed === terminator || trimmed.startsWith(`${terminator} `) || trimmed.startsWith(`${terminator};`);
}

function splitLogicalCommands(code: string): string[] {
	const commands: string[] = [];
	const current: string[] = [];
	let heredoc: string | undefined;
	let blockTerminator: "fi" | "done" | "esac" | "}" | undefined;

	const flush = () => {
		const command = current.join("\n").trim();
		if (command) commands.push(command);
		current.length = 0;
		heredoc = undefined;
		blockTerminator = undefined;
	};

	for (const line of code.replace(/\r\n/g, "\n").split("\n")) {
		if (current.length === 0 && isBlankOrComment(line)) continue;

		current.push(line);

		if (heredoc) {
			if (line.trim() === heredoc) flush();
			continue;
		}

		heredoc = heredocDelimiter(line);
		if (heredoc) continue;

		blockTerminator ??= startsShellBlock(current[0] ?? "");
		if (blockTerminator && !closesShellBlock(line, blockTerminator)) continue;

		if (hasLineContinuation(line) || expectsNextLine(line)) continue;

		flush();
	}

	if (current.length > 0) flush();
	return commands;
}

function preview(command: string): string {
	return command.replace(/\s+/g, " ").trim();
}

function collectCommands(ctx: ExtensionContext): ShellCommand[] {
	const entries = ctx.sessionManager.getBranch();
	const commands: ShellCommand[] = [];

	for (let i = entries.length - 1; i >= 0 && commands.length < MAX_COMMANDS; i--) {
		const entry = entries[i];
		if (entry?.type !== "message" || entry.message?.role !== "assistant") continue;

		const text = textFromContent(entry.message.content);
		if (!text) continue;

		const blocks = extractShellBlocks(text);
		for (let blockIndex = blocks.length - 1; blockIndex >= 0 && commands.length < MAX_COMMANDS; blockIndex--) {
			const block = blocks[blockIndex]!;
			const parts = splitLogicalCommands(block.code);
			for (let commandIndex = parts.length - 1; commandIndex >= 0 && commands.length < MAX_COMMANDS; commandIndex--) {
				const command = parts[commandIndex]!;
				commands.push({
					command,
					preview: preview(command),
					language: block.language,
					sourceLabel: new Date(entry.timestamp).toLocaleTimeString(),
				});
			}
		}
	}

	return commands;
}

function updateStatus(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	const count = collectCommands(ctx).length;
	if (count === 0) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}

	const theme = ctx.ui.theme;
	ctx.ui.setStatus(
		STATUS_KEY,
		`${theme.fg("accent", "⎘")} ${theme.fg("dim", `${count} shell cmd${count === 1 ? "" : "s"} • ${SHORTCUT}`)}`,
	);
}

function padAnsi(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

class CommandPicker implements Focusable {
	focused = false;
	private selected = 0;
	private scroll = 0;
	private showFull = false;
	private readonly theme: Theme;
	private readonly commands: ShellCommand[];
	private readonly done: (command: ShellCommand | undefined) => void;

	constructor(theme: Theme, commands: ShellCommand[], done: (command: ShellCommand | undefined) => void) {
		this.theme = theme;
		this.commands = commands;
		this.done = done;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			if (this.showFull) {
				this.showFull = false;
				return;
			}
			this.done(undefined);
			return;
		}
		if (matchesKey(data, "return")) {
			this.done(this.commands[this.selected]);
			return;
		}
		if (matchesKey(data, "up") || matchesKey(data, "ctrl+p") || data === "k") {
			this.selected = Math.max(0, this.selected - 1);
			this.showFull = false;
			return;
		}
		if (matchesKey(data, "down") || matchesKey(data, "ctrl+n") || data === "j") {
			this.selected = Math.min(this.commands.length - 1, this.selected + 1);
			this.showFull = false;
			return;
		}
		if (matchesKey(data, "tab") || data === " ") {
			this.showFull = !this.showFull;
		}
	}

	render(width: number): string[] {
		const totalWidth = Math.max(1, width);
		const innerWidth = Math.max(1, totalWidth - 2);
		const th = this.theme;
		const row = (content: string) => `${th.fg("border", "│")}${padAnsi(truncateToWidth(content, innerWidth), innerWidth)}${th.fg("border", "│")}`;
		const lines: string[] = [];

		lines.push(th.fg("border", `╭${"─".repeat(innerWidth)}╮`));
		lines.push(row(` ${th.fg("accent", th.bold("bash commands"))} ${th.fg("dim", `${this.commands.length} found`)}`));
		lines.push(row(""));

		const maxVisible = 18;
		if (this.selected < this.scroll) this.scroll = this.selected;
		if (this.selected >= this.scroll + maxVisible) this.scroll = this.selected - maxVisible + 1;

		const end = Math.min(this.commands.length, this.scroll + maxVisible);
		for (let i = this.scroll; i < end; i++) {
			const command = this.commands[i]!;
			const active = i === this.selected;
			const pointer = active ? th.fg("accent", "▶") : " ";
			const index = th.fg("dim", `${i + 1}.`);
			const text = active ? th.fg("text", command.preview) : th.fg("muted", command.preview);
			lines.push(row(` ${pointer} ${index} ${text}`));
		}

		if (this.commands.length > maxVisible) {
			lines.push(row(` ${th.fg("dim", `${this.scroll + 1}-${end} of ${this.commands.length}`)}`));
		}

		if (this.showFull && this.commands[this.selected]) {
			lines.push(row(""));
			lines.push(row(` ${th.fg("dim", "selected command")}`));
			const commandLines = this.commands[this.selected].command.split("\n");
			const shown = commandLines.slice(0, 20);
			for (const line of shown) lines.push(row(` ${th.fg("text", line)}`));
			if (commandLines.length > shown.length) lines.push(row(` ${th.fg("dim", `… ${commandLines.length - shown.length} more lines`)}`));
		}

		lines.push(row(""));
		lines.push(row(` ${th.fg("dim", "↑↓/j/k navigate • Space preview • Enter copy • Esc cancel")}`));
		lines.push(th.fg("border", `╰${"─".repeat(innerWidth)}╯`));
		return lines;
	}

	invalidate(): void {}
	dispose(): void {}
}

async function showPicker(ctx: ExtensionContext): Promise<void> {
	if (ctx.mode !== "tui") return;
	const commands = collectCommands(ctx);
	if (commands.length === 0) {
		ctx.ui.notify("No shell commands found in assistant bash blocks.", "warning");
		return;
	}

	const selected = await ctx.ui.custom<ShellCommand | undefined>(
		(tui, theme, _keybindings, done) => {
			const picker = new CommandPicker(theme, commands, done);
			return {
				get focused() {
					return picker.focused;
				},
				set focused(value: boolean) {
					picker.focused = value;
				},
				render: (width: number) => picker.render(width),
				invalidate: () => picker.invalidate(),
				handleInput: (data: string) => {
					picker.handleInput(data);
					tui.requestRender();
				},
				dispose: () => picker.dispose(),
			};
		},
		{ overlay: true, overlayOptions: { width: "95%", margin: 1 } },
	);

	if (!selected) return;
	try {
		await copyToClipboard(selected.command);
		ctx.ui.notify("Copied shell command to clipboard.", "info");
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
	}
}

export const __test__ = { extractShellBlocks, splitLogicalCommands };

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => updateStatus(ctx));
	pi.on("message_end", async (event, ctx) => {
		if (event.message.role === "assistant") updateStatus(ctx);
	});

	pi.registerShortcut(SHORTCUT, {
		description: "Pick a shell command from assistant bash blocks and copy it",
		handler: showPicker,
	});
}
