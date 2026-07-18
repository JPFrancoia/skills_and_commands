import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, ...env },
	}).trim();
}

function privateIndexSnapshotTest(): void {
	const repository = mkdtempSync(join(tmpdir(), "pi-background-commit-"));
	const snapshotIndex = join(repository, "snapshot.index");
	try {
		git(repository, ["init", "--quiet"]);
		git(repository, ["config", "user.name", "Pi Test"]);
		git(repository, ["config", "user.email", "pi@example.test"]);

		writeFileSync(join(repository, "a.txt"), "base\n");
		git(repository, ["add", "a.txt"]);
		git(repository, ["commit", "--quiet", "-m", "base"]);

		writeFileSync(join(repository, "a.txt"), "snapshot A\n");
		git(repository, ["add", "a.txt"]);
		const expectedTree = git(repository, ["write-tree"]);
		git(repository, ["read-tree", expectedTree], { GIT_INDEX_FILE: snapshotIndex });

		writeFileSync(join(repository, "b.txt"), "later B\n");
		git(repository, ["add", "b.txt"]);
		git(repository, ["commit", "--quiet", "-m", "snapshot A"], { GIT_INDEX_FILE: snapshotIndex });

		assert.equal(git(repository, ["rev-parse", "HEAD^{tree}"]), expectedTree);
		assert.deepEqual(git(repository, ["diff", "--cached", "--name-only"]).split("\n"), ["b.txt"]);
		assert.doesNotMatch(git(repository, ["show", "--format=", "--name-only", "HEAD"]), /b\.txt/);
	} finally {
		rmSync(repository, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	privateIndexSnapshotTest();
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
		{ code: 0, stdout: "tree123\n", stderr: "" },
		{ code: 0, stdout: "head123\n", stderr: "" },
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
	assert.match(request.params.task, /Expected HEAD: head123/);
	assert.match(request.params.task, /Expected staged tree: tree123/);
}

await main();
