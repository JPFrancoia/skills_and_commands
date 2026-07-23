/**
 * pi-background-pr — run /pr [repo-path] as an async commit/PR/CI workflow.
 *
 * Install by symlinking this file into ~/.pi/agent/extensions/ and running /reload.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RPC_REQUEST = "subagents:rpc:v1:request";
const RPC_REPLY_PREFIX = "subagents:rpc:v1:reply:";
const RPC_TIMEOUT_MS = 30_000;

type RpcReply = {
	success?: boolean;
	error?: { message?: string };
};

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
	try {
		if (ctx.hasUI) ctx.ui.notify(message, level);
	} catch {
		// Async replies may arrive after a print-mode session has shut down.
	}
}

function repoArgument(args: string): string {
	const value = args.trim();
	if (!value) return ".";
	if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
		return value.slice(1, -1);
	}
	return value;
}

async function git(pi: ExtensionAPI, cwd: string, args: string[]) {
	return pi.exec("git", ["-C", cwd, ...args], { timeout: 5_000 });
}

function watchLaunchReply(pi: ExtensionAPI, ctx: ExtensionContext, requestId: string, repository: string): void {
	const event = `${RPC_REPLY_PREFIX}${requestId}`;
	let unsubscribe: (() => void) | undefined;
	const timeout = setTimeout(() => {
		unsubscribe?.();
		notify(ctx, "Background PR launch timed out; run /subagents-doctor.", "error");
	}, RPC_TIMEOUT_MS);
	timeout.unref();

	unsubscribe = pi.events.on(event, (data) => {
		clearTimeout(timeout);
		unsubscribe?.();
		const reply = data as RpcReply;
		if (reply.success) {
			notify(ctx, `Background PR workflow started in ${repository}.`);
			return;
		}
		notify(ctx, reply.error?.message ?? "Background PR workflow failed to launch.", "error");
	});
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("pr", {
		description: "Commit, push, open a PR or MR, and watch CI in the background",
		getArgumentCompletions: () => null,
		handler: async (args, ctx) => {
			const requested = resolve(ctx.cwd, repoArgument(args));
			const rootResult = await git(pi, requested, ["rev-parse", "--show-toplevel"]);
			if (rootResult.code !== 0) {
				notify(ctx, `${repoArgument(args)} is not a Git repository.`, "error");
				return;
			}
			const repository = rootResult.stdout.replace(/[\r\n]+$/, "");

			const stagedResult = await git(pi, repository, ["diff", "--cached", "--quiet", "--exit-code"]);
			if (stagedResult.code === 0) {
				notify(ctx, `No staged changes in ${repository}.`, "warning");
				return;
			}
			if (stagedResult.code !== 1) {
				notify(ctx, stagedResult.stderr.trim() || "Could not inspect staged changes.", "error");
				return;
			}

			const requestId = `background-pr-${randomUUID()}`;
			const sessionFile = ctx.sessionManager.getSessionFile();
			const context = sessionFile && existsSync(sessionFile) && ctx.sessionManager.getLeafId() ? "fork" : "fresh";
			watchLaunchReply(pi, ctx, requestId, repository);

			pi.events.emit(RPC_REQUEST, {
				version: 1,
				requestId,
				method: "spawn",
				params: {
					agent: "pull-request-creator",
					cwd: repository,
					context,
					async: true,
					clarify: false,
					agentScope: "both",
					task: `Target repository: ${repository}\nCommit whatever is staged there, creating a meaningful branch first if HEAD is main or master. Use git -C with that exact path for every Git command. Push to origin, create or reuse the matching GitHub PR or GitLab MR, watch CI, and follow your pull-request instructions.`,
				},
				source: { extension: "pi-background-pr" },
			});

			notify(ctx, `Launching background PR workflow in ${repository}…`);
		},
	});
}

export const __test__ = { repoArgument };
