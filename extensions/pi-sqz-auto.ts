/**
 * pi-sqz-auto — transparently compress successful Pi bash tool output with sqz.
 *
 * Install by symlinking this file into ~/.pi/agent/extensions/ and running /reload.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isBashToolResult } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";

const STATUS_KEY = "sqz-auto";
const DEFAULT_TIMEOUT_MS = 10_000;
const REF_PATTERN = /§ref:[A-Za-z0-9_-]+§/;

type SqzRunResult = {
	ok: boolean;
	stdout: string;
	stderr: string;
	code: number | null;
	error?: string;
	timedOut?: boolean;
};

let enabled = !isDisabled(process.env.PI_SQZ_AUTO);
let sqzAvailable: boolean | undefined;
let warnedMissing = false;
let warnedCompressFailure = false;

function isDisabled(value: string | undefined): boolean {
	return /^(0|false|off|no)$/i.test(value ?? "");
}

function isEnabled(value: string | undefined): boolean {
	return /^(1|true|on|yes)$/i.test(value ?? "");
}

function getSqzBin(): string {
	return process.env.PI_SQZ_BIN || "sqz";
}

function getTimeoutMs(): number {
	const parsed = Number(process.env.PI_SQZ_TIMEOUT_MS);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function byteLength(text: string): number {
	return Buffer.byteLength(text, "utf8");
}

function extractText(content: Array<{ type: string; text?: string }>): string | undefined {
	if (!Array.isArray(content) || content.length === 0) return undefined;
	if (!content.every((part) => part.type === "text" && typeof part.text === "string")) return undefined;
	return content.map((part) => part.text ?? "").join("");
}

function looksAlreadyCompressed(text: string): boolean {
	return REF_PATTERN.test(text) || text.includes("sqz compression stats");
}

function extractBaseCommand(command: unknown): string {
	if (typeof command !== "string") return "bash";

	const tokens = command.trim().split(/\s+/).filter(Boolean);
	for (const token of tokens) {
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
		const unquoted = token.replace(/^['"]|['"]$/g, "");
		const base = unquoted.split(/[\\/]/).pop()?.trim();
		return base || "bash";
	}

	return "bash";
}

function updateStatus(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	const value = !enabled ? "sqz:off" : sqzAvailable === false ? "sqz:missing" : "sqz:on";
	ctx.ui.setStatus(STATUS_KEY, value);
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
}

function runSqz(args: string[], input: string, cwd: string, signal: AbortSignal | undefined): Promise<SqzRunResult> {
	return new Promise((resolve) => {
		let child: ReturnType<typeof spawn>;
		try {
			child = spawn(getSqzBin(), args, {
				cwd,
				env: process.env,
				stdio: ["pipe", "pipe", "pipe"],
				windowsHide: true,
			});
		} catch (error) {
			resolve({
				ok: false,
				stdout: "",
				stderr: "",
				code: null,
				error: error instanceof Error ? error.message : String(error),
			});
			return;
		}

		let stdout = "";
		let stderr = "";
		let settled = false;
		let timedOut = false;

		const finish = (result: SqzRunResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (signal) signal.removeEventListener("abort", abort);
			resolve(result);
		};

		const abort = () => {
			try {
				child.kill();
			} catch {
				// Ignore kill errors.
			}
			finish({ ok: false, stdout, stderr, code: null, error: "aborted" });
		};

		const timeout = setTimeout(() => {
			timedOut = true;
			try {
				child.kill();
			} catch {
				// Ignore kill errors.
			}
			finish({ ok: false, stdout, stderr, code: null, timedOut: true, error: "timeout" });
		}, getTimeoutMs());

		child.stdout?.on("data", (chunk) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", (error) => {
			finish({ ok: false, stdout, stderr, code: null, error: error.message });
		});
		child.on("close", (code) => {
			finish({ ok: code === 0, stdout, stderr, code, timedOut });
		});

		child.stdin?.on("error", () => {
			// sqz may be missing or exit before stdin is written. The process error/close handles it.
		});

		if (signal) {
			if (signal.aborted) {
				abort();
				return;
			}
			signal.addEventListener("abort", abort, { once: true });
		}

		child.stdin?.end(input);
	});
}

async function ensureSqzAvailable(ctx: ExtensionContext): Promise<boolean> {
	if (sqzAvailable !== undefined) return sqzAvailable;

	const result = await runSqz(["--version"], "", ctx.cwd, ctx.signal);
	sqzAvailable = result.ok;
	updateStatus(ctx);
	return sqzAvailable;
}

function formatStatus(): string {
	const availability = sqzAvailable === undefined ? "unchecked" : sqzAvailable ? "available" : "missing";
	const errors = isEnabled(process.env.PI_SQZ_COMPRESS_ERRORS) ? "yes" : "no";
	return [
		`pi-sqz-auto is ${enabled ? "on" : "off"}`,
		`sqz binary: ${getSqzBin()} (${availability})`,
		`compress failed commands: ${errors}`,
		`timeout: ${getTimeoutMs()}ms`,
		`source: /home/djipey/informatique/ai/skills_and_commands/extensions/pi-sqz-auto.ts`,
	].join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (enabled) await ensureSqzAvailable(ctx);
		updateStatus(ctx);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (!enabled) return;
		if (!(await ensureSqzAvailable(ctx))) return;

		return {
			systemPrompt:
				event.systemPrompt +
				"\n\nPi sqz auto-compression is active for successful Bash results. Some Bash output may be compressed or replaced with a `§ref:HASH§` token; use `sqz expand HASH` if exact original output is needed.",
		};
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!enabled || !isBashToolResult(event)) return;
		if (event.isError && !isEnabled(process.env.PI_SQZ_COMPRESS_ERRORS)) return;

		const text = extractText(event.content);
		if (!text || text.trim() === "" || text.trim() === "(no output)" || looksAlreadyCompressed(text)) return;

		if (!(await ensureSqzAvailable(ctx))) {
			if (!warnedMissing) {
				warnedMissing = true;
				notify(ctx, `pi-sqz-auto: ${getSqzBin()} is not available; Bash output will pass through unchanged.`, "warning");
			}
			return;
		}

		const label = extractBaseCommand(event.input.command);
		const result = await runSqz(["compress", "--cmd", label], text, ctx.cwd, ctx.signal);

		if (!result.ok) {
			if (!warnedCompressFailure) {
				warnedCompressFailure = true;
				const reason = result.error || result.stderr.trim() || `exit code ${result.code}`;
				notify(ctx, `pi-sqz-auto: sqz compression failed (${reason}); original Bash output kept.`, "warning");
			}
			return;
		}

		const compressed = result.stdout;
		if (!compressed) return;

		const originalBytes = byteLength(text);
		const compressedBytes = byteLength(compressed);
		if (compressedBytes >= originalBytes && !REF_PATTERN.test(compressed)) return;

		return {
			content: [{ type: "text" as const, text: compressed }],
		};
	});

	pi.registerCommand("sqz-auto", {
		description: "Show or toggle automatic sqz compression of Bash tool results",
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase();

			if (action === "on" || action === "enable" || action === "enabled") {
				enabled = true;
				sqzAvailable = undefined;
				warnedMissing = false;
				await ensureSqzAvailable(ctx);
				updateStatus(ctx);
				notify(ctx, formatStatus(), "info");
				return;
			}

			if (action === "off" || action === "disable" || action === "disabled") {
				enabled = false;
				updateStatus(ctx);
				notify(ctx, formatStatus(), "info");
				return;
			}

			if (!action || action === "status") {
				if (enabled) await ensureSqzAvailable(ctx);
				updateStatus(ctx);
				notify(ctx, formatStatus(), "info");
				return;
			}

			notify(ctx, "Usage: /sqz-auto [status|on|off]", "warning");
		},
	});
}
