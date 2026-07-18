/**
 * pi-background-commit — run /m [repo-path] as an async contextual commit.
 *
 * Install by symlinking this file into ~/.pi/agent/extensions/ and running /reload.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
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
		notify(ctx, "Background commit launch timed out; run /subagents-doctor.", "error");
	}, RPC_TIMEOUT_MS);
	timeout.unref();

	unsubscribe = pi.events.on(event, (data) => {
		clearTimeout(timeout);
		unsubscribe?.();
		const reply = data as RpcReply;
		if (reply.success) {
			notify(ctx, `Background commit started in ${repository}.`);
			return;
		}
		notify(ctx, reply.error?.message ?? "Background commit failed to launch.", "error");
	});
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("m", {
		description: "Commit staged changes contextually in the background",
		getArgumentCompletions: () => null,
		handler: async (args, ctx) => {
			const requested = resolve(ctx.cwd, repoArgument(args));
			const rootResult = await git(pi, requested, ["rev-parse", "--show-toplevel"]);
			if (rootResult.code !== 0) {
				notify(ctx, `${repoArgument(args)} is not a Git repository.`, "error");
				return;
			}
			const repository = rootResult.stdout.trim();

			const stagedResult = await git(pi, repository, ["diff", "--cached", "--quiet", "--exit-code"]);
			if (stagedResult.code === 0) {
				notify(ctx, `No staged changes in ${repository}.`, "warning");
				return;
			}
			if (stagedResult.code !== 1) {
				notify(ctx, stagedResult.stderr.trim() || "Could not inspect staged changes.", "error");
				return;
			}

			const requestId = `background-commit-${randomUUID()}`;
			watchLaunchReply(pi, ctx, requestId, repository);

			pi.events.emit(RPC_REQUEST, {
				version: 1,
				requestId,
				method: "spawn",
				params: {
					agent: "contextual-committer",
					cwd: repository,
					context: "fork",
					async: true,
					clarify: false,
					agentScope: "both",
					task: `Target repository: ${repository}\nCommit whatever is staged there when you run. Use git -C with that exact path for every Git command. Follow your contextual commit instructions.`,
				},
				source: { extension: "pi-background-commit" },
			});

			notify(ctx, `Launching background commit in ${repository}…`);
		},
	});
}

export const __test__ = { repoArgument };
