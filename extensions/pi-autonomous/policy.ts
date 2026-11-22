export const DEFAULT_DURATION_MS = 8 * 60 * 60 * 1000;
export const EMPTY_CONTINUATION_LIMIT = 3;

export type Scope = { kind: "session" } | { kind: "bean" | "prompt"; target: string };
export type Command = { action: "off" } | { action: "status" } | { action: "start"; target: string; durationMs: number };
export type DeferredWork = { task: string; reason: string; beanId?: string };

export function parseCommand(args: string): Command {
	let target = args.trim();
	if (target === "off" || target === "status") return { action: target };
	let durationMs = DEFAULT_DURATION_MS;
	const duration = target.match(/(?:^|\s)--for\s+(\d+(?:\.\d+)?)(m|h)\s*$/);
	if (duration) {
		durationMs = Number(duration[1]) * (duration[2] === "h" ? 3600000 : 60000);
		target = target.slice(0, duration.index).trim();
	}
	if (/(?:^|\s)--for(?:\s|=|$)/.test(target) || !Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > 2147483647) {
		throw new Error("Use --for with a positive duration, such as --for 30m or --for 8h. Maximum: 596 hours.");
	}
	if (!target || target === "off" || target === "status") {
		throw new Error("Use /autonomous on, /autonomous <bean-id>, or /autonomous <prompt>. Add --for 2h to change the duration.");
	}
	return { action: "start", target, durationMs };
}

export function looksLikeBeanId(value: string): boolean {
	return /^[a-z0-9]+(?:_[a-z0-9]+)*-[a-z0-9]{4}$/.test(value);
}

export function scopeLabel(scope: Scope): string {
	return scope.kind === "session" ? "authorized work in this session" : `${scope.kind}: ${scope.target}`;
}

export function instructions(scope: Scope, deadline: number, deferred: DeferredWork[]): string {
	return [
		"Autonomous mode is active.",
		`Scope: ${scopeLabel(scope)}. Deadline: ${new Date(deadline).toISOString()}.`,
		"Select useful work within this scope that needs no human answer or approval. Execute the next step instead of only describing it.",
		"Read project instructions and the relevant plan before implementation. Preserve all approval, security, repository, and scope boundaries.",
		"Do not merge, deploy, access accounts, spend money, or change external systems without the required existing permission.",
		"If one task needs human input, use autonomous_work with action defer and a concrete question or approval request. Then select another authorized task.",
		"Do not ask blocking questions or guess an answer. Do not treat a blocked approval as permission. Do not bypass another extension's permission controls.",
		"Use autonomous_work with action status to refresh available work and recorded blockers.",
		scope.kind === "bean"
			? "Work only on the exact Bean and its descendants. Read each selected Bean before acting. Do not work on external dependencies or unrelated Beans. Resume only in-progress work that belongs to this session. Recheck dependencies before starting each task."
			: "Keep work inside the authorized session goal or supplied task. Do not invent unrelated work to fill the time.",
		"Finish all runnable work before calling autonomous_work with action idle and evidence. One finished subtask does not finish the scope.",
		"Use action waiting only when background workers are active and no other authorized work can proceed. Their normal notifications resume the task.",
		"Include the same scope, deadline, and approval boundaries in delegated assignments. Do not launch work that cannot stop safely by the deadline.",
		"No token limit applies. Stop at the time limit and leave a clear record of completed work and remaining blockers.",
		deferred.length ? `Deferred work, not permission to proceed: ${JSON.stringify(deferred)}` : "No human-input blockers are recorded yet.",
	].join("\n");
}
