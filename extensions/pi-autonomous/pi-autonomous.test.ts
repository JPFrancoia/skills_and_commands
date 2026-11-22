import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import autonomous from "./pi-autonomous.ts";
import { resolveScope, selectWork, snapshot, type Bean } from "./beans.ts";
import { DEFAULT_DURATION_MS, instructions, parseCommand } from "./policy.ts";

function harness(cwd: string) {
	const handlers = new Map<string, Function>();
	let command: any;
	let tool: any;
	let lastState: any;
	const messages: any[] = [];
	const notifications: string[] = [];
	let aborted = false;
	let idle = false;
	const ctx: any = {
		cwd, hasUI: true, isIdle: () => idle,
		abort: () => { aborted = true; },
		ui: { setStatus() {}, notify: (text: string) => notifications.push(text) },
	};
	autonomous({
		on(name: string, callback: Function) { handlers.set(name, callback); },
		registerCommand(_name: string, options: unknown) { command = options; },
		registerTool(options: unknown) { tool = options; },
		appendEntry(_type: string, data: unknown) { lastState = structuredClone(data); },
		sendUserMessage(content: string) { messages.push(content); },
		sendMessage(message: unknown) { messages.push(message); },
	} as never);
	return {
		ctx, notifications, messages,
		state: () => lastState,
		aborted: () => aborted,
		setIdle: (value: boolean) => { idle = value; },
		start: (args = "on") => command.handler(args, ctx),
		event: (name: string, event: any = {}) => handlers.get(name)?.(event, ctx),
		call: (input: unknown) => tool.execute("test", input, undefined, undefined, ctx),
	};
}

async function main() {
	assert.deepEqual(parseCommand("on"), { action: "start", target: "on", durationMs: DEFAULT_DURATION_MS });
	assert.deepEqual(parseCommand("demo-ab12 --for 2h"), { action: "start", target: "demo-ab12", durationMs: 7200000 });
	assert.deepEqual(parseCommand("fix the parser --for 0.5h"), { action: "start", target: "fix the parser", durationMs: 1800000 });
	assert.deepEqual(parseCommand("on --for 30m"), { action: "start", target: "on", durationMs: 1800000 });
	assert.deepEqual(parseCommand("off"), { action: "off" });
	assert.deepEqual(parseCommand("status"), { action: "status" });
	for (const invalid of ["", "on --for", "on --for 0h", "on --for -1h", "on --for 3d", "on --for 999999999h", "off --for 2h", "on --for=2h"]) {
		assert.throws(() => parseCommand(invalid), Error, invalid);
	}
	assert.match(instructions({ kind: "session" }, 0, []), /No token limit/);
	assert.match(instructions({ kind: "bean", target: "demo-ab12" }, 0, []), /Do not work on external dependencies/);

	const bean = (id: string, fields: Partial<Bean> = {}): Bean => ({ id, title: id, type: "task", status: "todo", ...fields });
	const root = bean("root", { type: "epic" });
	const nested = bean("nested", { type: "epic", parent: "root" });
	const ready = bean("ready", { parent: "nested" });
	const active = bean("active", { parent: "root", status: "in-progress" });
	const blocked = bean("blocked", { parent: "root", blocked_by: ["outside"] });
	const all = [root, nested, ready, active, blocked, bean("outside"), bean("draft", { parent: "root", status: "draft" })];
	assert.deepEqual(selectWork(all, [blocked], "root", []).ready.map((b) => b.id), ["ready", "active"]);
	assert.deepEqual(selectWork(all, [], "root", []).ready.map((b) => b.id), ["ready", "active"]);
	assert.deepEqual(selectWork(all, [blocked], "root", [{ task: "nested", beanId: "nested", reason: "Needs approval" }]).ready.map((b) => b.id), ["active"]);
	assert.deepEqual(selectWork(all, [nested, blocked], "root", []).ready.map((b) => b.id), ["active"]);
	assert.deepEqual(selectWork(all, [], "root", [{ task: "root", beanId: "root", reason: "Architecture question" }]).ready, []);
	assert.throws(() => selectWork(all, [], "missing", []), /absent/);
	assert.throws(() => selectWork([bean("a", { parent: "b" }), bean("b", { parent: "a" })], [], "a", []), /cycle/);
	assert.deepEqual(selectWork([root, bean("orphan", { parent: "root", blocked_by: ["missing"] })], [], "root", []).ready, []);
	assert.deepEqual(selectWork([root, bean("done", { parent: "root", status: "completed" })], [], "root", []).ready.map((b) => b.id), ["root"]);

	const cwd = mkdtempSync(join(tmpdir(), "pi-autonomous-test-"));
	const b = (...args: string[]) => JSON.parse(execFileSync("beans", [...args, "--json"], { cwd, encoding: "utf8" }));
	try {
		b("init");
		const epic = b("create", "Example epic", "--type", "epic", "--status", "todo").bean;
		const sub = b("create", "Nested feature", "--type", "feature", "--status", "todo", "--parent", epic.id).bean;
		const task = b("create", "Safe task", "--type", "task", "--status", "todo", "--parent", sub.id).bean;
		const approval = b("create", "Needs approval", "--type", "task", "--status", "in-progress", "--parent", epic.id).bean;
		const dependency = b("create", "External dependency", "--type", "task", "--status", "todo").bean;
		const blockedTask = b("create", "Dependency blocked", "--type", "task", "--status", "todo", "--parent", epic.id, "--blocked-by", dependency.id).bean;
		assert.deepEqual(await resolveScope(epic.id, cwd), { kind: "bean", target: epic.id });
		assert.deepEqual(await resolveScope("on", cwd), { kind: "session" });
		assert.deepEqual(await resolveScope("fix this parser", cwd), { kind: "prompt", target: "fix this parser" });
		await assert.rejects(() => resolveScope("missing-ab12", cwd), /Cannot resolve Bean/);
		assert.deepEqual(new Set((await snapshot(cwd, epic.id, [])).ready.map((item) => item.id)), new Set([task.id, approval.id]));
		b("update", dependency.id, "--status", "completed");
		assert.ok((await snapshot(cwd, epic.id, [])).ready.some((item) => item.id === blockedTask.id));

		const h = harness(cwd);
		await h.start();
		const activation = Date.now();
		assert.ok(Math.abs(h.state().deadline - activation - DEFAULT_DURATION_MS) < 1000);
		assert.equal(h.messages.length, 1);
		assert.equal((await h.event("agent_before_settle", { entries: [], outcome: "completed" })).continue, true);
		assert.equal((await h.event("agent_before_settle", { entries: [], outcome: "completed" })).continue, true);
		assert.equal(await h.event("agent_before_settle", { entries: [], outcome: "completed" }), undefined);
		assert.equal(h.state().enabled, false);
		assert.match(h.state().reason, /no tool activity/);

		await h.start("implement this parser --for 2h");
		await h.event("tool_execution_end", { toolName: "read", isError: false });
		assert.equal((await h.event("agent_before_settle", { entries: [], outcome: "completed" })).continue, true);
		await assert.rejects(() => h.call({ action: "idle" }), /concrete reason/);
		await h.call({ action: "defer", task: "One subtask", reason: "Which input format must it accept?" });
		assert.equal(h.state().enabled, true);
		await h.call({ action: "idle", reason: "The remaining subtask needs the recorded answer." });
		assert.equal(h.state().enabled, false);

		await h.start();
		const blockedQuestion = await h.event("tool_call", { toolName: "ask_user_question", input: { questions: [{ question: "Approve merge?" }] } });
		assert.equal(blockedQuestion.block, true);
		assert.equal(h.state().enabled, true);
		assert.match(h.state().deferred[0].reason, /Approve merge/);
		await h.call({ action: "idle", reason: "No other authorized session work remains." });
		assert.equal(h.state().enabled, true);
		assert.equal(h.state().phase, "idle");
		assert.equal(await h.event("agent_before_settle", { entries: [], outcome: "completed" }), undefined);
		await h.event("before_agent_start");
		assert.equal((await h.event("agent_before_settle", { entries: [], outcome: "completed" })).continue, true);
		await h.call({ action: "waiting", reason: "Worker run test-run is active. No independent task remains." });
		assert.equal(await h.event("agent_before_settle", { entries: [], outcome: "completed" }), undefined);
		await h.event("before_agent_start");
		assert.equal((await h.event("agent_before_settle", { entries: [], outcome: "completed" })).continue, true);
		await h.event("agent_settled", { aborted: true });
		assert.equal(h.state().enabled, false);
		assert.equal(await h.event("agent_before_settle", { entries: [], outcome: "completed" }), undefined);

		await h.start(epic.id);
		await assert.rejects(() => h.call({ action: "idle", reason: "One task is complete." }), /Runnable Beans remain/);
		await assert.rejects(() => h.call({ action: "waiting", reason: "One worker is active." }), /worker assignments/);
		await assert.rejects(() => h.call({ action: "waiting", workerBeanIds: [task.id], reason: "One worker is active." }), /worker assignments/);
		await assert.rejects(() => h.call({ action: "defer", task: "Unrelated", beanId: dependency.id, reason: "Need approval" }), /within the active scope/);
		await h.call({ action: "defer", task: approval.title, beanId: approval.id, reason: "Approve this source merge?" });
		const status = JSON.parse((await h.call({ action: "status" })).content[0].text);
		assert.ok(!status.ready.some((item: Bean) => item.id === approval.id));
		assert.ok(status.ready.some((item: Bean) => item.id === task.id));
		assert.equal((await h.event("agent_before_settle", { entries: [], outcome: "completed" })).continue, true);
		await h.call({ action: "defer", task: blockedTask.title, beanId: blockedTask.id, reason: "A separate review needs a human decision." });
		await assert.rejects(() => h.call({ action: "waiting", workerBeanIds: [task.id], reason: "A worker runs this task." }), /worker assignments/);
		b("update", task.id, "--status", "in-progress");
		await h.call({ action: "waiting", workerBeanIds: [task.id], reason: "An active worker runs this in-progress task." });
		assert.equal(h.state().phase, "waiting");
		assert.equal(await h.event("agent_before_settle", { entries: [], outcome: "completed" }), undefined);
		await h.start("off");
		assert.equal(h.state().enabled, false);
		assert.equal(h.aborted(), false);

		await h.start("on --for 0.0001m");
		await new Promise((resolve) => setTimeout(resolve, 15));
		assert.equal((await h.event("tool_call", { toolName: "write", input: {} })).block, true);
		await h.event("turn_end");
		assert.equal(h.aborted(), true);
		assert.equal(h.state().enabled, false);

		await h.start();
		await h.event("ui_prompt_start");
		assert.equal(h.state().enabled, false);
		await h.start();
		await h.event("agent_before_settle", { entries: [], outcome: "error" });
		assert.equal(h.state().enabled, false);
		await h.start();
		await h.event("session_tree");
		assert.equal(h.state().enabled, false);
		await h.start();
		await h.event("session_shutdown");
		assert.equal(await h.event("agent_before_settle", { entries: [], outcome: "completed" }), undefined);
		await assert.rejects(() => h.call({ action: "status" }), /off/);
		console.log("Autonomous parser, Beans, continuation, deferral, lifecycle, and deadline checks passed.");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
