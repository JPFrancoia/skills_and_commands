import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";

// The repository intentionally has no node_modules. Make Pi's own extension
// peers visible so the documented direct jiti command is self-contained.
const require = createRequire(import.meta.url);
const Module = require("node:module") as { _initPaths(): void };
process.env.NODE_PATH = [
	join(homedir(), ".pi", "agent", "npm", "node_modules"),
	join(homedir(), ".npm-global", "lib", "node_modules", "@earendil-works", "pi-coding-agent", "node_modules"),
	join(homedir(), ".npm-global", "lib", "node_modules"),
	process.env.NODE_PATH,
].filter(Boolean).join(delimiter);
Module._initPaths();

const { default: sidebarExtension, __test__ } = await import("./pi-sidebar.ts");
const { visibleWidth } = await import("@earendil-works/pi-tui");

const theme = {
	fg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

async function main(): Promise<void> {
	assert.equal(typeof sidebarExtension, "function");

	const stats = __test__.computeSessionStats([
		{ type: "message", message: { role: "assistant", usage: { input: 10, output: 3, cacheRead: 5, cacheWrite: 2, cost: { total: 0.1 } } } },
		{ type: "message", message: { role: "toolResult", usage: { input: 2, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0.02 } } } },
		{ type: "compaction", usage: { input: 4, output: 2, cacheRead: 1, cacheWrite: 0, cost: { total: 0.03 } } },
		{ type: "compaction" },
		{ type: "message", message: { role: "assistant", usage: { input: 20, output: 5, cacheRead: 10, cacheWrite: 0, cost: { total: 0.2 } } } },
	]);
	assert.deepEqual(stats, { turns: 2, compactions: 2, cost: 0.35000000000000003 });

	const todos = __test__.replayTodos([
		{ type: "message", message: { role: "toolResult", toolName: "todo", details: { tasks: [{ id: 1, subject: "old", status: "pending" }], nextId: 2 } } },
		{ type: "message", message: { role: "toolResult", toolName: "todo", details: { tasks: [{ id: 1, subject: "done", status: "completed" }, { id: 2, subject: "removed", status: "deleted" }], nextId: 3 } } },
	]);
	assert.deepEqual(todos.map((todo) => [todo.subject, todo.status]), [["done", "completed"], ["removed", "deleted"]]);

	const parsed = __test__.parseStatus("## main...origin/main\0 M src/long/file.ts\0R  src/new.ts\0src/old.ts\0?? task-worktree/\0");
	assert.equal(parsed.branch, "main");
	assert.equal(__test__.parseStatus("## No commits yet on trunk\0?? first.txt\0").branch, "trunk");
	assert.deepEqual(parsed.files.map((file) => [file.status, file.path, file.oldPath]), [
		["M", "src/long/file.ts", undefined],
		["R", "src/new.ts", "src/old.ts"],
		["??", "task-worktree/", undefined],
	]);
	const primary = join(tmpdir(), "repo");
	const sibling = join(tmpdir(), "repo.task");
	assert.deepEqual(__test__.parseWorktreePaths([
		`worktree ${primary}`,
		"HEAD abc123",
		"branch refs/heads/main",
		"",
		`worktree ${sibling}`,
		"HEAD def456",
		"detached",
		"locked reason",
		"prunable gitdir file points to non-existent location",
		"",
		`worktree ${join(tmpdir(), "bare.git")}`,
		"bare",
		"",
	].join("\0")), [primary, sibling]);
	const workspaceRoot = join(tmpdir(), "workspace");
	const nestedRoot = join(workspaceRoot, "enterprise");
	const workspaceTask = join(tmpdir(), "workspace-task");
	const nestedTask = join(tmpdir(), "workspace-enterprise-task");
	const nestedInlineTask = join(nestedRoot, "task");
	const duplicate = join(tmpdir(), "duplicate-worktree");
	const targets = await __test__.enumerateWorktreeTargets(
		[workspaceRoot, nestedRoot, nestedRoot],
		["linked-root"],
		async (owner) => owner === workspaceRoot
			? [workspaceRoot, workspaceTask, duplicate]
			: [nestedRoot, nestedTask, nestedInlineTask, duplicate],
	);
	assert.deepEqual(targets.map(({ owner, path, linkedWorktrees }) => [owner, path, linkedWorktrees]), [
		[workspaceRoot, workspaceRoot, ["linked-root"]],
		[workspaceRoot, workspaceTask, ["linked-root"]],
		[workspaceRoot, duplicate, ["linked-root"]],
		[nestedRoot, nestedRoot, ["task"]],
		[nestedRoot, nestedTask, ["task"]],
		[nestedRoot, nestedInlineTask, ["task"]],
	]);
	const failedTargets = await __test__.enumerateWorktreeTargets(
		[workspaceRoot, nestedRoot],
		[],
		async (owner) => {
			if (owner === nestedRoot) throw new Error("missing nested repository");
			return [];
		},
	);
	assert.deepEqual(failedTargets.map(({ owner, path }) => [owner, path]), [
		[workspaceRoot, workspaceRoot],
		[nestedRoot, nestedRoot],
	]);
	assert.deepEqual([...__test__.replayWorkedWorktrees([
		{ type: "custom", customType: "other", data: { path: sibling } },
		{ type: "custom", customType: "pi-sidebar-worktree-worked", data: { path: primary } },
		{ type: "custom", customType: "pi-sidebar-worktree-worked", data: { path: 42 } },
	])], [primary]);
	const cleanRepo = { path: primary, label: "repo", branch: "main", files: [] };
	const dirtyRepo = { ...cleanRepo, files: [{ status: "M", path: "file.ts", added: 1, removed: 0 }] };
	const changedDirtyRepo = { ...cleanRepo, files: [{ status: "M", path: "file.ts", added: 2, removed: 0 }] };
	const cleanBaseline = __test__.observeWorkedWorktrees([cleanRepo], [primary], new Map(), new Set());
	assert.deepEqual(cleanBaseline.newlyWorked, []);
	const cleanToDirty = __test__.observeWorkedWorktrees([dirtyRepo], [primary], cleanBaseline.signatures, new Set());
	assert.deepEqual(cleanToDirty.newlyWorked, [primary]);
	const dirtyBaseline = __test__.observeWorkedWorktrees([dirtyRepo], [primary], new Map(), new Set());
	assert.deepEqual(dirtyBaseline.newlyWorked, []);
	const nestedCleanRepo = { ...cleanRepo, path: nestedTask, label: "workspace-enterprise-task", branch: "task" };
	const nestedBaseline = __test__.observeWorkedWorktrees([cleanRepo, nestedCleanRepo], [primary, nestedTask], new Map(), new Set());
	const nestedDirtyRepo = { ...nestedCleanRepo, files: [{ status: "M", path: "nested.ts", added: 1, removed: 0 }] };
	assert.deepEqual(
		__test__.observeWorkedWorktrees([cleanRepo, nestedDirtyRepo], [primary, nestedTask], nestedBaseline.signatures, new Set()).newlyWorked,
		[nestedTask],
	);
	const failedObservation = __test__.observeWorkedWorktrees([{ ...cleanRepo, error: "git failed" }], [primary], dirtyBaseline.signatures, new Set());
	assert.deepEqual(failedObservation.newlyWorked, []);
	assert.equal(failedObservation.signatures.get(primary), dirtyBaseline.signatures.get(primary));
	assert.deepEqual(__test__.observeWorkedWorktrees([cleanRepo], [primary], dirtyBaseline.signatures, new Set()).newlyWorked, [primary]);
	assert.deepEqual(__test__.observeWorkedWorktrees([changedDirtyRepo], [primary], dirtyBaseline.signatures, new Set()).newlyWorked, [primary]);
	assert.deepEqual(__test__.observeWorkedWorktrees([changedDirtyRepo], [primary], dirtyBaseline.signatures, new Set([primary])).newlyWorked, []);
	const deltas = __test__.parseNumstat([
		"3\t1\tsrc/long/file.ts",
		"-\t-\timage.png",
		"2\t0\t",
		"src/old.ts",
		"src/new.ts",
		"",
	].join("\0"));
	assert.deepEqual(deltas.get("src/long/file.ts"), { added: 3, removed: 1, binary: false });
	assert.deepEqual(deltas.get("image.png"), { added: undefined, removed: undefined, binary: true });
	assert.deepEqual(deltas.get("src/new.ts"), { added: 2, removed: 0, binary: false });
	assert.equal(__test__.isInsideLinkedWorktree("task-worktree/", ["task-worktree"]), true);
	assert.equal(__test__.isInsideLinkedWorktree("src/task-worktree.ts", ["task-worktree"]), false);
	assert.equal(__test__.truncatePath("very/long/path/readable-file.ts", 16).endsWith("readable-file.ts"), true);
	const safeStatus = __test__.cleanStatusText("\x1b[31mred\x1b[0m\x1b[2J\nnext");
	assert.match(safeStatus, /\x1b\[31mred\x1b\[0m next/);
	assert.doesNotMatch(safeStatus, /\x1b\[2J/);
	assert.deepEqual(__test__.subagentRunsFromFleetStatus({
		version: 1,
		entries: [
			{ key: "fleet-1", agent: "scout", role: "Research", startedAt: 1_000, tokens: { input: 10, output: 2, total: 12 } },
			{ key: "fleet-2", agent: "reviewer", startedAt: 2_000, tokens: { input: 20, output: 4, total: 24 } },
		],
		totalActive: 2,
		omitted: 0,
	}), [
		{ key: "rpc:fleet-1", agent: "scout", running: true, durationMs: 0, cost: 0 },
		{ key: "rpc:fleet-2", agent: "reviewer", running: true, durationMs: 0, cost: 0 },
	]);
	assert.deepEqual(__test__.subagentRunsFromFleetStatus({ version: 1, entries: [], totalActive: 0, omitted: 0 }), []);
	assert.equal(__test__.subagentRunsFromFleetStatus({ version: 2, entries: [] }), undefined);
	assert.equal(__test__.subagentRunsFromFleetStatus({ version: 1, entries: [{ key: "fleet-1" }] }), undefined);
	assert.deepEqual(__test__.runningForegroundSubagents({ progress: [
		{ agent: "scout", status: "running" },
		{ agent: "reviewer", label: "Review", status: "running" },
		{ agent: "planner", status: "pending" },
	] }), [
		{ key: "foreground:0", agent: "scout", running: true, durationMs: 0, cost: 0 },
		{ key: "foreground:1", agent: "reviewer", running: true, durationMs: 0, cost: 0 },
	]);
	assert.deepEqual(__test__.initialForegroundSubagents({ agent: "scout", async: false }), [
		{ key: "foreground:0", agent: "scout", running: true, durationMs: 0, cost: 0 },
	]);
	assert.deepEqual(__test__.initialForegroundSubagents({ agent: "scout", clarify: true }), [
		{ key: "foreground:0", agent: "scout", running: true, durationMs: 0, cost: 0 },
	]);
	assert.deepEqual(__test__.initialForegroundSubagents({ agent: "scout" }), []);
	assert.deepEqual(__test__.initialForegroundSubagents({ agent: "scout", async: true }), []);
	assert.deepEqual(__test__.initialForegroundSubagents({ workflowScript: "return []", async: false }), []);
	assert.deepEqual(__test__.subagentRunsFromDetails({
		results: [
			{ agent: "worker", usage: { cost: 0.2 }, progressSummary: { durationMs: 60_000 } },
			{ agent: "reviewer", totalCost: { costUsd: 0.03 }, progress: { status: "completed", durationMs: 5_000 } },
		],
		progress: [
			{ agent: "worker", status: "running", durationMs: 65_000 },
			{ agent: "reviewer", status: "completed", durationMs: 5_000 },
		],
	}, "foreground:call"), [
		{ key: "foreground:call:0", agent: "worker", running: true, durationMs: 65_000, cost: 0.2 },
		{ key: "foreground:call:1", agent: "reviewer", running: false, durationMs: 5_000, cost: 0.03 },
	]);
	assert.deepEqual(__test__.subagentRunsFromDetails({
		results: [{
			agent: "worker",
			children: [{ id: "nested-1", agent: "tainted-evidence", state: "running", durationMs: 7_000, totalCost: { costUsd: 0.04 } }],
		}],
	}, "foreground:call"), [
		{ key: "foreground:call:0", agent: "worker", running: false, durationMs: 0, cost: 0 },
		{ key: "foreground:call:0:nested:0:nested-1", agent: "tainted-evidence", running: true, durationMs: 7_000, cost: 0.04 },
	]);
	const asyncStatus = {
		lifecycleArtifactVersion: 2,
		runId: "run-1",
		sessionId: "session-1",
		steps: [
			{
				agent: "worker",
				status: "running",
				startedAt: 1_000,
				durationMs: 0,
				totalCost: { costUsd: 0.1 },
				children: [{ id: "nested-2", agent: "tainted-evidence", state: "complete", startedAt: 2_000, endedAt: 8_000, totalCost: { costUsd: 0.04 } }],
			},
			{ agent: "worker", status: "complete", durationMs: 60_000, totalCost: { costUsd: 0.2 } },
			{ agent: "planner", status: "pending" },
		],
	};
	const asyncRuns = [
		{ key: "async:run-1:0", agent: "worker", running: true, durationMs: 10_000, cost: 0.1 },
		{ key: "async:run-1:0:nested:0:nested-2", agent: "tainted-evidence", running: false, durationMs: 6_000, cost: 0.04 },
		{ key: "async:run-1:1", agent: "worker", running: false, durationMs: 60_000, cost: 0.2 },
	];
	assert.deepEqual(__test__.subagentRunsFromAsyncStatus(asyncStatus, "run-1", "session-1", 11_000), asyncRuns);
	assert.deepEqual(__test__.subagentRunsFromAsyncStatus({ ...asyncStatus, lifecycleArtifactVersion: 3 }, "run-1", "session-1", 11_000), asyncRuns);
	assert.deepEqual(__test__.subagentRunsFromAsyncStatus({
		runId: "workflow-1",
		sessionId: "session-1",
		mode: "workflow",
		steps: [{ agent: "scout", status: "completed", durationMs: 88_498 }],
		totalCost: { costUsd: 0.02439888 },
	}, "workflow-1", "session-1"), [
		{ key: "async:workflow-1:0", agent: "scout", running: false, durationMs: 88_498, cost: 0.02439888 },
	]);
	assert.equal(__test__.subagentRunsFromAsyncStatus({ runId: "run-1", sessionId: "session-1", mode: "single", steps: [] }, "run-1", "session-1"), undefined);
	assert.equal(__test__.subagentRunsFromAsyncStatus({ runId: "run-1", sessionId: "session-1", mode: "workflow", steps: [{ agent: "worker" }] }, "run-1", "session-1"), undefined);
	assert.equal(__test__.subagentRunsFromAsyncStatus({ lifecycleArtifactVersion: 2, runId: "run-1", sessionId: "other", steps: [] }, "run-1", "session-1"), undefined);
	assert.equal(__test__.subagentRunsFromAsyncStatus({ lifecycleArtifactVersion: 1, runId: "run-1", sessionId: "session-1", steps: [] }, "run-1", "session-1"), undefined);
	assert.equal(__test__.subagentRunsFromAsyncStatus({ lifecycleArtifactVersion: 2, runId: "wrong", sessionId: "session-1", steps: [] }, "run-1", "session-1"), undefined);
	assert.equal(__test__.subagentRunsFromAsyncStatus({ lifecycleArtifactVersion: 2, runId: "run-1", sessionId: "session-1", steps: [{ agent: "worker", status: "complete", durationMs: -1 }] }, "run-1", "session-1"), undefined);
	const aggregated = __test__.aggregateSubagents([
		{ key: "one", agent: "worker", running: false, durationMs: 60_000, cost: 0.2337 },
		{ key: "two", agent: "worker", running: true, durationMs: 46_000, cost: 0.2323 },
		{ key: "three", agent: "reviewer", running: false, durationMs: 5_000, cost: 0.03 },
	]);
	assert.deepEqual(aggregated.map(({ cost: _cost, ...agent }) => agent), [
		{ key: "worker", agent: "worker", running: true, durationMs: 106_000 },
		{ key: "reviewer", agent: "reviewer", running: false, durationMs: 5_000 },
	]);
	assert.ok(Math.abs(aggregated[0]!.cost - 0.466) < 1e-12);
	assert.equal(aggregated[1]!.cost, 0.03);
	assert.equal(__test__.formatSubagentDuration(60_000), "1m");
	assert.equal(__test__.formatSubagentDuration(106_000), "1m46s");
	const replayedSubagents = __test__.replaySubagents([
		{ type: "custom", customType: "pi-sidebar-subagent-run", data: { key: "one", agent: "worker", durationMs: 10_000, cost: 0.1 } },
		{ type: "custom", customType: "pi-sidebar-subagent-run", data: { key: "one", agent: "worker", durationMs: 60_000, cost: 0.2 } },
		{ type: "custom_message", customType: "subagent-slash-result", details: { requestId: "slash-1", result: { details: { asyncId: "run-1", asyncDir: "/tmp/run-1", results: [] } } } },
	]);
	assert.deepEqual([...replayedSubagents.runs.values()], [{ key: "one", agent: "worker", running: false, durationMs: 60_000, cost: 0.2 }]);
	assert.deepEqual([...replayedSubagents.asyncRunDirs], [["run-1", "/tmp/run-1"]]);
	const token = [
		"header",
		Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "account-123" } })).toString("base64url"),
		"signature",
	].join(".");
	assert.equal(__test__.codexAccountId(token), "account-123");
	assert.equal(__test__.codexAccountId("not-a-jwt"), undefined);
	assert.deepEqual(__test__.parseCodexWeeklyQuota({
		rate_limit: { primary_window: { used_percent: 17, limit_window_seconds: 604800, reset_at: 1_800_000_000 }, secondary_window: null },
	}), { remaining: 83, resetAt: 1_800_000_000_000 });
	assert.deepEqual(__test__.parseCodexWeeklyQuota({
		rate_limit: {
			primary_window: { used_percent: 5, limit_window_seconds: 18000 },
			secondary_window: { used_percent: 120, limit_window_seconds: 604800 },
		},
	}), { remaining: 0, resetAt: undefined });
	assert.equal(__test__.parseCodexWeeklyQuota({
		rate_limit: { primary_window: { used_percent: 10, limit_window_seconds: 18000 } },
	}), undefined);
	assert.equal(__test__.formatQuotaReset(6.5 * 86_400_000, 0), "6d");
	assert.equal(__test__.formatQuotaReset(23 * 3_600_000, 0), "23h");

	const root = await mkdtemp(join(tmpdir(), "pi-sidebar-"));
	try {
		await mkdir(join(root, "nested", ".git"), { recursive: true });
		await mkdir(join(root, "worktree"), { recursive: true });
		await writeFile(join(root, "worktree", ".git"), "gitdir: elsewhere\n");
		await mkdir(join(root, "node_modules", "ignored", ".git"), { recursive: true });
		const discovery = await __test__.discoverRepositories(root);
		assert.deepEqual(discovery.repos, [join(root, "nested")]);
		assert.deepEqual(discovery.linkedWorktrees, ["worktree"]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}

	class Terminal {
		rows = 8;
		width = 120;
		writes: string[] = [];
		get columns(): number { return this.width; }
		write(data: string): void { this.writes.push(data); }
	}
	const terminal = new Terminal();
	let renders = 0;
	const tui = {
		terminal,
		doRender() { renders++; },
		requestRender() {},
		stopped: false,
	};
	const originalRender = tui.doRender;
	const state: any = {
		enabled: true,
		width: 48,
		thinkingLevel: "high",
		stats: { cost: 0, turns: 0, compactions: 2 },
		todos: [],
		gitRepos: [],
		linkedWorktrees: [],
		workedWorktrees: new Set(),
		subagentRuns: new Map(),
		asyncRunDirs: new Map(),
		rpcSubagentRuns: new Map(),
		foregroundSubagents: new Map(),
		context: { tokens: 83_000, contextWindow: 100_000, percent: 83 },
	};
	const compositor = new __test__.SidebarCompositor(tui as never, () => state as never, () => theme as never, () => new Map());
	assert.equal(compositor.install(), true);
	assert.equal(terminal.columns, 71);
	tui.doRender();
	assert.equal(renders, 1);
	assert.match(terminal.writes.join(""), /\x1b\[\?2026h/);
	terminal.writes = [];
	tui.stopped = true;
	compositor.paint();
	assert.deepEqual(terminal.writes, []);
	tui.stopped = false;
	state.enabled = false;
	assert.equal(terminal.columns, 120);
	compositor.paint();
	assert.deepEqual(terminal.writes, []);
	state.enabled = true;
	terminal.width = 100;
	assert.equal(terminal.columns, 100);
	compositor.paint();
	assert.deepEqual(terminal.writes, []);
	terminal.width = 120;
	assert.equal(terminal.columns, 71);
	state.width = 40;
	assert.equal(terminal.columns, 79);
	state.width = 48;
	compositor.dispose();
	assert.equal(terminal.columns, 120);
	assert.equal(tui.doRender, originalRender);

	state.rootRepo = "/repo";
	state.gitRepos = [{
		path: "/repo",
		label: "repo\x1b[2J",
		branch: "main\nspoofed",
		files: [{ status: "M", path: "src/evil\x1b[2J\nname.ts", added: 1, removed: 0 }],
	}, {
		path: "/outside/repo",
		label: "repo",
		branch: "clean-sibling",
		files: [],
	}];
	const render = (width = 48, height = 100, statuses = new Map<string, string>(), palette = theme) =>
		__test__.renderSidebar(state as never, palette as never, statuses, width, height);
	const plainLines = (lines: string[]) => lines.map((line) => line.trim()).join("\n");
	const plain = () => plainLines(render());
	const lines = render(48, 24);
	assert.ok(lines.length <= 24);
	assert.ok(lines.every((line) => visibleWidth(line) <= 48 && !line.includes("\n")));
	assert.ok(lines.every((line) => line.startsWith("  ")));
	assert.match(plain(), /CONVERSATION/);
	assert.doesNotMatch(plain(), /[╭╮╰╯│]|SESSION|TURNS|COMPACTIONS/);
	assert.equal(render().filter((line) => /[█░]/.test(line)).length, 2);
	assert.match(plain(), /quota +░{14} +—/);
	assert.match(plain(), /ctx +█{11}▋░{2} +83\.0% • 83k \/ 100k/);
	assert.match(plain(), /cwd[^\n]*\n🧹 compactions +2\n🔄 turns +0\n💰 cost +\$0\.000\n\nctx/);
	assert.match(plain(), /ctx[^\n]*\n\nquota/);
	state.context = { tokens: 18_000, contextWindow: 500_000, percent: 3.7 };
	assert.match(plain(), /ctx +▌░{13} +3\.7% • 18k \/ 500k/);
	state.context = { tokens: 83_000, contextWindow: 100_000, percent: 83 };
	assert.match(plain(), /ACTIVITY/);
	assert.match(plain(), /No tasks or agents yet/);
	assert.doesNotMatch(plain(), /SUBAGENTS|TASKS 0\/0|none used|no todos/);
	assert.doesNotMatch(plain(), /\x1b\[2J|clean-sibling/);
	assert.match(plain(), /• main spoofed +1 changed/);
	state.context = { tokens: 110_000, contextWindow: 100_000, percent: 110 };
	assert.match(plain(), /ctx +█{14} +110\.0%/);
	state.context = { tokens: 83_000, contextWindow: 100_000, percent: 83 };
	assert.doesNotMatch(render(48, 100, new Map([["mcp", "MCP connected"], ["mcp-auth", "MCP auth"]])).join("\n"), /MCP/);
	const statuses = new Map([["ponytail", "⚡ FULL"], ["quota", "7d:2% left (in 5d 23h 41m) cap:OK"], ["unsafe\x1b[2J", "\x1b[32mready\x1b[0m\x1b[2J\nnext"]]);
	const statusLines = render(48, 100, statuses);
	assert.match(statusLines.join("\n"), /ponytail\n +⚡ FULL/);
	assert.match(statusLines.join("\n"), /quota\n +7d:2% left/);
	assert.doesNotMatch(statusLines.join("\n"), /\x1b\[2J/);

	const quotaStatuses = new Map([
		["pi-quotas-usage", "\x1b[32m7d:2% left\x1b[0m (in 5d 23h 41m) \x1b[2mcap:\x1b[0m\x1b[32mOK\x1b[0m\x1b[2J"],
		["pi-quotas-token-status", "5h:$1.00 · wk:$2.00 · mo:$3.00"],
		["ponytail", "⚡ FULL"],
	]);
	const quotaOutput = render(53, 100, quotaStatuses).join("\n");
	const extensionsStart = quotaOutput.indexOf("EXTENSIONS");
	assert.ok(quotaOutput.indexOf("quota") < extensionsStart);
	assert.ok(quotaOutput.indexOf("7d:2% left") < extensionsStart);
	assert.ok(quotaOutput.indexOf("5h:$1.00") < extensionsStart);
	assert.equal(quotaOutput.split("7d:2% left").length, 2);
	assert.doesNotMatch(quotaOutput, /pi-quotas-usage|pi-quotas-token-status|\x1b\[2J|[╭╮╰╯│]/);
	assert.match(quotaOutput.slice(extensionsStart), /ponytail/);
	assert.match(quotaOutput, /quota +▎░{13} +\x1b\[32m7d:2% left/);
	assert.doesNotMatch(quotaOutput, /cap:/);
	for (const cap of ["cap:OK", "cap:\x1b[32mOK\x1b[0m", "\x1b[2mcap:\x1b[0m\x1b[32mOK\x1b[0m"]) {
		assert.doesNotMatch(render(53, 100, new Map([["pi-quotas-usage", `7d:96% left ${cap}`]])).join("\n"), /cap:|OK/);
	}
	assert.match(render(53, 100, new Map([["pi-quotas-usage", "7d:96% left cap:REACHED !"]])).join("\n"), /cap:REACHED !/);
	const metricLines = render().filter((line) => /🧹|🔄|💰/.test(line));
	assert.equal(metricLines.length, 3);
	assert.deepEqual(metricLines.map((line) => visibleWidth(line.slice(0, line.search(/[02$]/)))), [17, 17, 17]);
	assert.equal(quotaOutput.split("\n").filter((line) => /[█░]/.test(line)).length, 2);
	assert.equal(__test__.quotaRemaining("\x1b[32m7d:2% left\x1b[0m (↺in 5d 23h 41m) cap:OK"), 2);
	assert.equal(__test__.quotaRemaining("5h:80% left 7d:20% left"), 20);
	assert.equal(__test__.quotaRemaining("week:99.5% search:0%"), 0);
	assert.equal(__test__.quotaRemaining("week:100%"), 100);
	assert.match(render(80, 100, new Map([["pi-quotas-usage", "5h:80% left 7d:20% left"]])).join("\n"), /quota +█{2}▊░{11}/);
	assert.match(render(80, 100, new Map([["pi-quotas-usage", "week:100%"]])).join("\n"), /quota +█{14}/);
	assert.match(render(80, 100, new Map([["pi-quotas-usage", "week:0%"]])).join("\n"), /quota +░{14} +week:0%/);
	assert.match(render(80, 100, new Map([["pi-quotas-usage", "usage unavailable"]])).join("\n"), /quota +░{14} +usage unavailable/);
	for (const text of ["", "usage unavailable", "5h:$2.00/$10.00", "premium:7/300", "7d:120% left", "7d:-2% left", "7d:NaN% left"]) {
		assert.equal(__test__.quotaRemaining(text), undefined, text);
	}

	state.subagentRuns.set("async:run:0", { key: "async:run:0", agent: "scout\x1b[2J\nspoofed", running: false, durationMs: 60_000, cost: 0.2337 });
	state.rpcSubagentRuns.set("rpc:fleet-1", { key: "rpc:fleet-1", agent: "scout spoofed", running: true, durationMs: 0, cost: 0 });
	const colorTheme = {
		...theme,
		fg: (color: string, text: string) => `\x1b[${color === "success" ? 32 : color === "error" ? 31 : 37}m${text}\x1b[0m`,
	};
	const subagentLines = render(48, 40, new Map(), colorTheme).join("\n");
	assert.match(subagentLines, /\x1b\[31m█/);
	assert.match(subagentLines, /\x1b\[32m●/);
	assert.match(subagentLines, /scout spoofed/);
	assert.match(subagentLines, /Stopped · 1m · \$0\.2337/);
	assert.doesNotMatch(subagentLines, /\x1b\[2J/);
	state.rpcSubagentRuns.clear();
	assert.match(render(48, 40, new Map(), colorTheme).join("\n"), /\x1b\[31m●/);
	state.subagentRuns.set("async:run:0", { ...state.subagentRuns.get("async:run:0"), running: true });
	assert.match(render(48, 40, new Map(), colorTheme).join("\n"), /\x1b\[32m●/);
	state.subagentRuns.clear();
	state.ctx = { cwd: "/repo", model: { id: "gpt-5.6", provider: "openai-codex" } };
	state.codexWeeklyQuota = { remaining: 83, resetAt: Date.now() + 6.5 * 86_400_000 };
	assert.match(plain(), /quota +█{11}▋░{2} +83% left • Codex 7d\nResets in 6d/);
	const codexWithStatus = render(80, 100, quotaStatuses).join("\n");
	assert.equal(codexWithStatus.split("\n").filter((line) => /[█░]/.test(line)).length, 2);
	assert.match(codexWithStatus, /quota +█{11}▋░{2} +83% left/);
	assert.equal(codexWithStatus.split("7d:2% left").length, 2);
	assert.doesNotMatch(codexWithStatus, /cap:/);
	state.codexWeeklyQuota = undefined;
	assert.match(plain(), /Loading account quota…/);
	state.codexWeeklyQuota = null;
	assert.match(plain(), /Account quota unavailable/);
	state.ctx.model.provider = "anthropic";
	assert.doesNotMatch(plain(), /Codex 7d/);
	state.ctx.model = { id: "auto", provider: "jev", api: "pi-virtual", reasoning: true };
	const responses: any[] = [
		{ role: "assistant", provider: "openai-codex", model: "gpt-6-astra", thinkingLevel: "high", stopReason: "stop" },
		{ role: "assistant", provider: "openai-codex", model: "failed-model", thinkingLevel: "low", stopReason: "error" },
		{ role: "assistant", provider: "openai-codex", model: "aborted-model", stopReason: "aborted" },
		{ role: "toolResult" },
	];
	state.ctx.sessionManager = { buildSessionProjection: () => ({ messages: responses }) };
	state.ctx.modelRegistry = { find: (provider: string, id: string) => ({ id, provider, api: "responses" }) };
	state.routedModel = __test__.getRoutedModel(state.ctx);
	assert.deepEqual(state.routedModel, { id: "gpt-6-astra", thinkingLevel: "high" });
	assert.match(plainLines(render(80)), /\(jev\) auto • high → gpt-6-astra • high/);
	assert.match(plain().replace(/\n/g, " "), /\(jev\) auto • high → gpt-6-astra • high/);
	const next = { ...responses[0], model: "gpt-6-luna", thinkingLevel: "low" };
	assert.deepEqual(__test__.getRoutedModel(state.ctx, [...responses, next]), { id: "gpt-6-luna", thinkingLevel: "low" });
	assert.equal(__test__.getRoutedModel(state.ctx, []), undefined);
	assert.equal(__test__.getRoutedModel(state.ctx, responses.slice(1)), undefined);
	state.routedModel = undefined;
	assert.match(plain(), /\(jev\) auto • high/);
	assert.doesNotMatch(plain(), /→/);
	state.ctx.modelRegistry.find = () => undefined;
	assert.equal(__test__.getRoutedModel(state.ctx), undefined);
	state.ctx.model = { id: "direct-model", provider: "anthropic", api: "messages", reasoning: true };
	state.routedModel = { id: "stale-route", thinkingLevel: "high" };
	assert.equal(__test__.getRoutedModel(state.ctx), undefined);
	assert.match(plain(), /\(anthropic\) direct-model • high/);
	assert.doesNotMatch(plain(), /→|stale-route/);
	state.thinkingLevel = "off";
	assert.match(plain(), /direct-model • thinking\s+off/);
	state.ctx.model.reasoning = false;
	assert.doesNotMatch(plain(), /thinking\s+off/);
	state.thinkingLevel = "high";
	state.ctx.model = { id: "auto", provider: "jev", api: "pi-virtual", reasoning: true };
	state.routedModel = { id: "gpt-6-astra", thinkingLevel: "high" };
	state.gitRepos = [{ path: "/repo", label: "repo", branch: "main", files: [] }, {
		path: "/outside/repo",
		label: "outside/repo",
		branch: "clean-sibling",
		files: [],
	}];
	assert.match(plain(), /repo\n• main\nclean/);
	assert.doesNotMatch(plain(), /clean-sibling/);
	state.workedWorktrees.add("/outside/repo");
	assert.match(plain(), /clean-sibling/);
	state.workedWorktrees.clear();
	state.gitRepos = [{ path: "/repo", label: "repo", branch: "?", files: [], error: "git status failed" }];
	assert.match(plain(), /git status failed/);

	state.title = "Alternatives to LayerFS and Furrow — 日本語 🐴 ".repeat(5) + "\x1b[2J";
	state.todos = [
		{ id: 1, subject: "Inspect the layout", status: "completed" },
		{ id: 2, subject: "Build the dashboard", activeForm: "building", status: "in_progress" },
		{ id: 3, subject: "Verify Unicode 日本語 🐴", status: "pending" },
		{ id: 4, subject: "Hidden task", status: "deleted" },
	];
	state.subagentRuns.set("worker", { key: "worker", agent: "worker", running: true, durationMs: 106_000, cost: 0.466 });
	assert.match(plain(), /TASKS 1\/3/);
	assert.match(plain(), /✓ Inspect the layout/);
	assert.match(plain(), /● Build the dashboard \(building\)/);
	assert.match(plain(), /○ Verify Unicode/);
	assert.doesNotMatch(plain(), /Hidden task|ACTIVITY/);
	assert.match(plain(), /SUBAGENTS/);
	assert.match(plain(), /Running · 1m46s · \$0\.4660/);
	for (const width of [20, 40, 53, 80]) {
		for (const height of [1, 12, 24, 45, 100]) {
			for (const palette of [theme, colorTheme]) {
				const output = render(width, height, new Map([...statuses, ...quotaStatuses]), palette);
				assert.ok(output.length <= height, `height ${width}×${height}`);
				assert.ok(output.every((line) => visibleWidth(line) <= width && !line.includes("\n")), `width ${width}×${height}`);
				assert.doesNotMatch(output.join("\n"), /\x1b\[2J/);
			}
		}
	}
	assert.match(plainLines(render(20)), /🧹 compactions +2\n🔄 turns +0\n💰 cost +\$\n0\n\.\n0\n0\n0/);
	assert.match(render(40, 32, statuses).join("\n"), /… \d+ more/);
	state.context = { tokens: null, contextWindow: 100_000, percent: null };
	assert.match(plain(), /ctx +░{14} +— • \? \/ 100k/);
	state.context = undefined;
	assert.match(plain(), /Waiting for context usage/);

	state.openRequests = { repos: [
		{ repo: { host: "github.com", path: "acme/widgets", forge: "github" }, count: 213, breakdown: { drafts: 3, passing: 200, notPassing: 10 } },
		{ repo: { host: "gitlab.example.com", path: "acme/group/gadgets", forge: "gitlab" }, count: 12, breakdown: { drafts: 2, passing: 5, notPassing: 5 } },
		{ repo: { host: "github.com", path: "acme/no-prs", forge: "github" }, count: 0 },
		{ repo: { host: "gitlab.example.com", path: "acme/group/no-mrs", forge: "gitlab" }, count: 0 },
		{ repo: { host: "github.com", path: "acme/loading", forge: "github" } },
		{ repo: { host: "gitlab.com", path: "acme/private", forge: "gitlab" }, error: "Access denied\x1b[2J\nretry later" },
	], errors: ["Unsupported host: example.com"] };
	assert.match(plain(), /acme\/widgets \(213\)\n3 draft · 200 CI ✓ · 10 CI !/);
	assert.match(plain(), /acme\/group\/gadgets \(12\)\n2 draft · 5 CI ✓ · 5 CI !/);
	assert.doesNotMatch(plain(), /github\.com|gitlab\.example\.com/);
	const request = state.openRequests.repos[0];
	for (const [drafts, passing, notPassing, summary] of [
		[3, 0, 0, "3 draft"],
		[0, 2, 0, "2 CI ✓"],
		[0, 0, 4, "4 CI !"],
		[3, 2, 0, "3 draft · 2 CI ✓"],
		[0, 2, 4, "2 CI ✓ · 4 CI !"],
		[3, 0, 4, "3 draft · 4 CI !"],
	] as const) {
		state.openRequests.repos[0] = { ...request, count: drafts + passing + notPassing, breakdown: { drafts, passing, notPassing } };
		const output = plain().split("\n");
		const index = output.findIndex((line) => line.startsWith("acme/widgets"));
		assert.equal(output[index], `acme/widgets (${drafts + passing + notPassing})`);
		assert.equal(output[index + 1], summary);
		assert.doesNotMatch(plain(), /\b0 draft|\b0 CI [✓!]/);
	}
	state.openRequests.repos[0] = request;
	assert.match(plainLines(render(20)), /widgets \(213\)/);
	assert.match(plainLines(render(20)), /gadgets \(12\)/);
	assert.doesNotMatch(plain(), /no-prs|no-mrs|0 open PRs|0 open MRs/);
	assert.match(plain(), /loading…/);
	assert.match(plain(), /acme\/private +unavailable\nAccess denied retry later/);
	assert.match(plain(), /Unsupported host/);
	assert.doesNotMatch(plain(), /git status failed|\x1b\[2J/);
	for (const width of [20, 40, 53, 80]) {
		for (const height of [12, 24, 45, 100]) {
			const output = render(width, height, new Map(), colorTheme);
			assert.ok(output.length <= height);
			assert.ok(output.every((line) => visibleWidth(line) <= width));
		}
	}
	state.openRequests = { repos: state.openRequests.repos.filter(({ count }: { count?: number }) => count === 0), errors: [] };
	assert.match(plain(), /No open PRs or MRs/);
	assert.doesNotMatch(plain(), /no-prs|no-mrs|No repositories in REPOS/);
	assert.equal(state.openRequests.repos.length, 2, "hidden repositories remain available for refresh");
	state.openRequests = { repos: [], errors: [] };
	assert.match(plain(), /No repositories in REPOS/);
	state.openRequests = { repos: [], errors: ["Not a repository path: gitlab.com/group"] };
	assert.match(plain(), /Not a repository path/);
	delete state.openRequests;
	assert.match(plain(), /git status failed/);


	const savedRepos = process.env.REPOS;
	try {
		for (const config of [undefined, "https://github.com/acme/widgets,https://gitlab.com/acme/group/gadgets", "", "https://example.com/acme/repo"]) {
			if (config === undefined) delete process.env.REPOS;
			else process.env.REPOS = config;
			const handlers = new Map<string, Function>();
			const commands = new Map<string, any>();
			const calls: string[] = [];
			const listeners = new Map<string, Function>();
			let fail = false;
			let mergeRequests = 0;
			const screen = new Terminal();
			screen.width = 180;
			screen.rows = 70;
			const hostTui = { terminal: screen, doRender() {}, requestRender() {}, stopped: false };
			let footer: any;
			const ctx: any = {
				mode: "tui", cwd: tmpdir(),
				sessionManager: { getSessionFile: () => undefined, getSessionId: () => undefined, getEntries: () => [], getBranch: () => [], buildSessionProjection: () => ({ messages: [] }) },
				getContextUsage: () => undefined,
				ui: {
					theme, setWidget() {}, notify() {},
					setFooter(factory: any) { footer?.dispose(); footer = factory?.(hostTui, theme, { getExtensionStatuses: () => new Map() }); },
				},
			};
			sidebarExtension({
				on: (name: string, handler: Function) => handlers.set(name, handler),
				registerCommand: (name: string, command: any) => commands.set(name, command),
				getSessionName: () => undefined, getThinkingLevel: () => "off", appendEntry() {},
				events: {
					on: (name: string, listener: Function) => { listeners.set(name, listener); return () => listeners.delete(name); },
					emit: (_name: string, request: any) => listeners.get(`subagents:rpc:v1:reply:${request.requestId}`)?.({ success: true, data: { fleet: { version: 1, entries: [] } } }),
				},
				exec: async (bin: string) => {
					calls.push(bin);
					return bin === "git" || fail ? { code: 1, stdout: "", stderr: "Access denied" } : {
						code: 0, stderr: "", stdout: JSON.stringify({ data: bin === "gh"
							? { repository: { pullRequests: { nodes: [
								{ isDraft: true, commits: { nodes: [] } },
								{ isDraft: false, commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] } },
								{ isDraft: false, commits: { nodes: [] } },
							], pageInfo: { hasNextPage: false, endCursor: null } } } }
							: { project: { mergeRequests: { nodes: Array.from({ length: mergeRequests }, () => ({ draft: false, headPipeline: { status: "SUCCESS" } })), pageInfo: { hasNextPage: false, endCursor: null } } } } }),
					};
				},
			} as never);
			try {
				await handlers.get("session_start")!({}, ctx);
				await commands.get("sidebar").handler("refresh", ctx);
				const lastFrame = () => screen.writes.at(-1) ?? "";
				if (config === undefined) {
					assert.ok(calls.includes("git"));
					assert.ok(calls.every((bin) => bin === "git"));
					assert.match(lastFrame(), /not a git repository/);
				} else {
					assert.ok(!calls.includes("git"));
					if (config.includes("github.com")) {
						assert.match(lastFrame(), /acme\/widgets \(3\)/);
						assert.match(lastFrame(), /1 draft · 1 CI ✓ · 1 CI !/);
						assert.doesNotMatch(lastFrame(), /github\.com/);
						assert.doesNotMatch(lastFrame(), /acme\/group\/gadgets|0 open MRs/);
						const realNow = Date.now;
						let clock = realNow();
						try {
							Date.now = () => clock;
							await commands.get("sidebar").handler("refresh", ctx);
							const before = calls.length;
							clock += 299_999;
							await handlers.get("agent_end")!({}, ctx);
							assert.equal(calls.length, before, "no automatic refresh before five minutes");
							clock += 1;
							await handlers.get("agent_end")!({}, ctx);
							await commands.get("sidebar").handler("refresh", ctx);
							assert.equal(calls.length, before + 2, "automatic refresh at five minutes");
							await commands.get("sidebar").handler("refresh", ctx);
							assert.equal(calls.length, before + 4, "manual refresh bypasses throttling");
						} finally {
							Date.now = realNow;
						}
						mergeRequests = 7;
						await commands.get("sidebar").handler("refresh", ctx);
						assert.match(lastFrame(), /acme\/group\/gadgets/);
						assert.match(lastFrame(), /\(7\)/);
						mergeRequests = 0;
						await commands.get("sidebar").handler("refresh", ctx);
						assert.doesNotMatch(lastFrame(), /acme\/group\/gadgets|0 open MRs/);
						fail = true;
						await commands.get("sidebar").handler("refresh", ctx);
						assert.match(lastFrame(), /unavailable/);
						assert.doesNotMatch(lastFrame(), /\(3\)|\(7\)|draft ·/);
					} else {
						assert.equal(calls.length, 0);
						assert.match(lastFrame(), config ? /Unsupported host/ : /No repositories in REPOS/);
					}
				}
			} finally {
				await handlers.get("session_shutdown")!({}, ctx);
			}
		}
	} finally {
		if (savedRepos === undefined) delete process.env.REPOS;
		else process.env.REPOS = savedRepos;
	}
}

await main();
