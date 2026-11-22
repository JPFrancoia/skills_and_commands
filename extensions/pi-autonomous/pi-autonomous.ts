import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateHead } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolveScope, snapshot } from "./beans.ts";
import { EMPTY_CONTINUATION_LIMIT, instructions, parseCommand, scopeLabel, type DeferredWork, type Scope } from "./policy.ts";

type State = {
	enabled: boolean;
	scope: Scope;
	deadline: number;
	phase: "working" | "idle" | "waiting" | "stopped";
	reason: string;
	deferred: DeferredWork[];
	emptyContinuations: number;
	toolActivity: boolean;
};

export default function autonomous(pi: ExtensionAPI) {
	let state: State | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let generation = 0;

	function clearTimer() {
		if (timer) clearTimeout(timer);
		timer = undefined;
	}

	function display(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		const value = state?.enabled
			? `auto ${state.phase} · ${Math.max(0, Math.ceil((state.deadline - Date.now()) / 60000))}m`
			: undefined;
		ctx.ui.setStatus("autonomous", value);
	}

	function record(ctx: ExtensionContext) {
		pi.appendEntry("autonomous-state", state);
		display(ctx);
	}

	function stop(reason: string, ctx: ExtensionContext) {
		if (!state?.enabled) return;
		state.enabled = false;
		state.phase = "stopped";
		state.reason = reason;
		clearTimer();
		record(ctx);
		if (ctx.hasUI) ctx.ui.notify(`Autonomous mode stopped: ${reason}`, "info");
	}

	function expired() {
		return Boolean(state?.enabled && Date.now() >= state.deadline);
	}

	function defer(item: DeferredWork, ctx: ExtensionContext) {
		if (!state) return;
		if (!state.deferred.some((entry) => entry.task === item.task && entry.beanId === item.beanId && entry.reason === item.reason)) {
			state.deferred.push(item);
		}
		record(ctx);
	}

	async function work(ctx: ExtensionContext, signal?: AbortSignal) {
		const current = state;
		if (!current) throw new Error("Autonomous mode is off.");
		const data = current.scope.kind === "bean"
			? await snapshot(ctx.cwd, current.scope.target, current.deferred, signal)
			: undefined;
		if (state !== current || !current.enabled) throw new Error("Autonomous scope changed. Discard this result.");
		return data;
	}

	function report(ctx: ExtensionContext) {
		const content = state ? JSON.stringify({
			enabled: state.enabled,
			scope: state.scope,
			deadline: new Date(state.deadline).toISOString(),
			phase: state.phase,
			reason: state.reason,
			deferred: state.deferred,
		}, null, 2) : "Autonomous mode is off.";
		pi.sendMessage({ customType: "autonomous-status", content, display: true }, { triggerTurn: false });
		display(ctx);
	}

	pi.registerCommand("autonomous", {
		description: "Continue authorized work: on | <bean-id> | <prompt> [--for 8h] | off | status",
		getArgumentCompletions(prefix) {
			return ["on", "off", "status"].filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value }));
		},
		async handler(args, ctx) {
			try {
				const command = parseCommand(args);
				if (command.action === "off") {
					generation++;
					stop("Disabled by the user. Current work is not forcibly interrupted.", ctx);
					return;
				}
				if (command.action === "status") {
					if (expired()) stop("The time limit expired.", ctx);
					report(ctx);
					return;
				}
				const request = ++generation;
				const scope = await resolveScope(command.target, ctx.cwd);
				if (request !== generation) return;
				if (scope.kind === "bean") await snapshot(ctx.cwd, scope.target, []);
				if (request !== generation) return;
				clearTimer();
				state = {
					enabled: true, scope, deadline: Date.now() + command.durationMs,
					phase: "working", reason: "", deferred: [], emptyContinuations: 0, toolActivity: false,
				};
				record(ctx);
				timer = setTimeout(() => {
					if (!state?.enabled) return;
					if (ctx.isIdle()) stop("The time limit expired.", ctx);
					else if (ctx.hasUI) ctx.ui.notify("Autonomous time limit reached. No new tools will start. Current operations finish before the run stops.", "warning");
				}, command.durationMs);
				timer.unref();
				pi.sendUserMessage(`Work autonomously on ${scopeLabel(scope)}. Use autonomous_work to inspect the scope. Select and execute work that needs no human input.`, { deliverAs: "followUp" });
			} catch (error) {
				if (ctx.hasUI) ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				else throw error;
			}
		},
	});

	pi.on("context", (event, ctx) => {
		if (!state?.enabled) return;
		display(ctx);
		return { messages: [...event.messages, {
			role: "custom" as const, customType: "autonomous-instructions",
			content: instructions(state.scope, state.deadline, state.deferred), display: false, timestamp: Date.now(),
		}] };
	});

	pi.on("before_agent_start", () => {
		if (!state?.enabled) return;
		state.phase = "working";
		state.reason = "";
		state.emptyContinuations = 0;
	});

	pi.on("tool_call", (event, ctx) => {
		if (!state?.enabled) return;
		if (expired()) return { block: true, reason: "The autonomous time limit expired. Do not start more work.", terminate: true };
		if (event.toolName === "ask_user_question") {
			const reason = JSON.stringify(event.input);
			defer({ task: "Human question or approval", reason }, ctx);
			return { block: true, reason: "Autonomous mode deferred this question. No answer or approval was given. Record the affected task with autonomous_work action defer and select other authorized work." };
		}
	});

	pi.on("ui_prompt_start", (_event, ctx) => {
		stop("Another extension needs human input. No approval was supplied.", ctx);
	});

	pi.on("tool_execution_end", (event) => {
		if (state?.enabled && event.toolName !== "autonomous_work" && event.toolName !== "ask_user_question" && !event.isError) {
			state.toolActivity = true;
			state.emptyContinuations = 0;
		}
	});

	pi.on("turn_end", (_event, ctx) => {
		if (expired()) {
			stop("The time limit expired. Current operations reached a turn boundary.", ctx);
			ctx.abort();
		}
	});

	pi.on("agent_before_settle", async (event, ctx) => {
		if (!state?.enabled) return;
		if (expired()) { stop("The time limit expired.", ctx); return; }
		if (event.outcome !== "completed") { stop(`The run ended with ${event.outcome}.`, ctx); return; }
		if (state.phase === "idle" || state.phase === "waiting") return;
		const current = state;
		try {
			const available = await work(ctx);
			if (state !== current || !current.enabled || expired()) return;
			if (available && available.ready.length === 0) {
				stop("No runnable work remains in the Bean scope. Inspect /autonomous status for deferred human input.", ctx);
				return;
			}
			if (!current.toolActivity) current.emptyContinuations++;
			current.toolActivity = false;
			if (current.emptyContinuations >= EMPTY_CONTINUATION_LIMIT) {
				stop("Repeated continuation produced no tool activity. Inspect the remaining task before restarting.", ctx);
				return;
			}
			display(ctx);
			return {
				entries: [...event.entries, { type: "custom_message" as const, customType: "autonomous-continue", display: false,
					content: "Autonomous work is not finished. Execute the next authorized step. If human input blocks one task, record it and select another. Use autonomous_work to refresh the scope or record why no work remains." }],
				continue: true,
			};
		} catch (error) {
			if (state === current) stop(`Cannot refresh the work scope: ${error instanceof Error ? error.message : String(error)}`, ctx);
		}
	});

	pi.on("agent_settled", (event, ctx) => {
		if (event.aborted) stop("The run was aborted. Restart autonomous mode explicitly to continue.", ctx);
	});

	function reset() {
		generation++;
		clearTimer();
		state = undefined;
	}
	pi.on("session_start", reset);
	pi.on("session_shutdown", reset);
	pi.on("session_tree", (_event, ctx) => { stop("The active session branch changed.", ctx); });

	pi.registerTool({
		name: "autonomous_work",
		label: "Autonomous work",
		description: "Inspect autonomous scope, record deferred human input, or report no runnable work. status refreshes Bean descendants and blockers. defer records a task and question without granting permission. idle requires evidence that all scoped tasks are done or blocked. waiting requires active background workers and no other runnable work. For Bean scope, supply workerBeanIds for every ready Bean, each already in-progress. Output lists at most 50 ready and remaining Beans.",
		promptSnippet: "Inspect autonomous work and record blockers without asking the user",
		parameters: Type.Object({
			action: Type.Union([Type.Literal("status"), Type.Literal("defer"), Type.Literal("idle"), Type.Literal("waiting")]),
			task: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
			beanId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
			workerBeanIds: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 50 })),
			reason: Type.Optional(Type.String({ minLength: 1, maxLength: 8000 })),
		}),
		executionMode: "sequential",
		async execute(_id, input, signal, _update, ctx) {
			if (!state?.enabled) throw new Error("Autonomous mode is off. Only the user can enable it with /autonomous.");
			if (expired()) throw new Error("The autonomous time limit expired.");
			const current = state;
			const available = await work(ctx, signal);
			if (input.action !== "status" && !input.reason?.trim()) throw new Error("Supply a concrete reason and supporting evidence.");
			if (input.action === "defer") {
				if (!input.task?.trim()) throw new Error("Name the task that needs human input.");
				if (available && (!input.beanId || !available.remaining.some((bean) => bean.id === input.beanId))) {
					throw new Error("Supply an unfinished beanId within the active scope.");
				}
				defer({ task: input.task.trim(), reason: input.reason!.trim(), ...(input.beanId ? { beanId: input.beanId } : {}) }, ctx);
			}
			if (input.action === "idle" || input.action === "waiting") {
				if (input.action === "idle" && available?.ready.length) throw new Error("Runnable Beans remain. Defer each task that needs human input, then select another task.");
				if (input.action === "waiting" && available) {
					const workerIds = new Set(input.workerBeanIds ?? []);
					if (available.ready.some((bean) => !workerIds.has(bean.id))
						|| [...workerIds].some((id) => !available.ready.some((bean) => bean.id === id && bean.status === "in-progress"))) {
						throw new Error("Runnable Beans remain without worker assignments. Supply workerBeanIds only for ready, in-progress Beans with active workers.");
					}
				}
				current.phase = input.action;
				current.reason = input.reason!.trim();
				if (input.action === "idle" && current.scope.kind !== "session") stop(current.reason, ctx);
				else record(ctx);
			}
			const refreshed = input.action === "defer" ? await work(ctx, signal) : available;
			const content = JSON.stringify({
				enabled: current.enabled, scope: current.scope, deadline: new Date(current.deadline).toISOString(),
				phase: current.phase, reason: current.reason, deferred: current.deferred,
				...(refreshed ? {
					root: refreshed.root, ready: refreshed.ready.slice(0, 50), readyCount: refreshed.ready.length,
					remaining: refreshed.remaining.slice(0, 50), remainingCount: refreshed.remaining.length,
				} : {}),
			});
			const truncated = truncateHead(content);
			return { content: [{ type: "text", text: truncated.content + (truncated.truncated ? "\n[Output truncated. Use beans show or /autonomous status for details.]" : "") }], details: { phase: current.phase, enabled: current.enabled }, terminate: input.action === "idle" || input.action === "waiting" };
		},
	});
}
