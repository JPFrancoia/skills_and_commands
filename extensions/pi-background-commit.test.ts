import assert from "node:assert/strict";
import backgroundCommit, { __test__ } from "./pi-background-commit.ts";

const RPC_REQUEST = "subagents:rpc:v1:request";
const RPC_REPLY_PREFIX = "subagents:rpc:v1:reply:";

type Result = { code: number; stdout: string; stderr: string };

type Harness = {
	handler: (args: string, ctx: unknown) => Promise<void>;
	ctx: unknown;
	emitted: () => unknown;
	notifications: string[];
};

function harness(results: Result[]): Harness {
	let handler: Harness["handler"] | undefined;
	let emitted: unknown;
	const listeners = new Map<string, (data: unknown) => void>();
	const notifications: string[] = [];
	const pi = {
		registerCommand(_name: string, options: { handler: Harness["handler"] }) {
			handler = options.handler;
		},
		exec: async () => {
			const result = results.shift();
			assert.ok(result, "unexpected git invocation");
			return result;
		},
		events: {
			on(event: string, callback: (data: unknown) => void) {
				listeners.set(event, callback);
				return () => listeners.delete(event);
			},
			emit(event: string, data: unknown) {
				if (event !== RPC_REQUEST) return;
				emitted = data;
				const requestId = (data as { requestId: string }).requestId;
				listeners.get(`${RPC_REPLY_PREFIX}${requestId}`)?.({ success: true });
			},
		},
	};
	backgroundCommit(pi as never);
	assert.ok(handler);
	return {
		handler,
		ctx: {
			cwd: "/work",
			hasUI: true,
			ui: { notify: (message: string) => notifications.push(message) },
		},
		emitted: () => emitted,
		notifications,
	};
}

async function main(): Promise<void> {
	assert.equal(__test__.repoArgument(""), ".");
	assert.equal(__test__.repoArgument("'nested repo'"), "nested repo");

	const invalid = harness([{ code: 128, stdout: "", stderr: "not a repository" }]);
	await invalid.handler("missing", invalid.ctx);
	assert.equal(invalid.emitted(), undefined);
	assert.match(invalid.notifications[0] ?? "", /not a Git repository/);

	const clean = harness([
		{ code: 0, stdout: "/work/repo\n", stderr: "" },
		{ code: 0, stdout: "", stderr: "" },
	]);
	await clean.handler("repo", clean.ctx);
	assert.equal(clean.emitted(), undefined);
	assert.match(clean.notifications[0] ?? "", /No staged changes/);

	const staged = harness([
		{ code: 0, stdout: "/work/enterprise\n", stderr: "" },
		{ code: 1, stdout: "", stderr: "" },
	]);
	await staged.handler("enterprise", staged.ctx);
	const request = staged.emitted() as {
		method: string;
		params: { agent: string; async: boolean; context: string; cwd: string; task: string };
	};
	assert.equal(request.method, "spawn");
	assert.deepEqual(
		[request.params.agent, request.params.async, request.params.context, request.params.cwd],
		["contextual-committer", true, "fork", "/work/enterprise"],
	);
	assert.match(request.params.task, /Commit whatever is staged/);
	assert.doesNotMatch(request.params.task, /Expected HEAD|Expected staged tree/);
}

await main();
