import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DeferredWork, Scope } from "./policy.ts";
import { looksLikeBeanId } from "./policy.ts";

const exec = promisify(execFile);
export interface Bean {
	id: string;
	title: string;
	status: string;
	type: string;
	parent?: string;
	blocked_by?: string[];
}

async function beansJson(cwd: string, args: string[], signal?: AbortSignal): Promise<unknown> {
	const result = await exec("beans", [...args, "--json"], { cwd, timeout: 5000, maxBuffer: 1024 * 1024, signal });
	return JSON.parse(result.stdout);
}

function parseBean(value: unknown): Bean {
	if (!value || typeof value !== "object") throw new Error("Invalid Beans JSON record.");
	const bean = value as Bean;
	if (![bean.id, bean.title, bean.status, bean.type].every((field) => typeof field === "string" && field.length > 0)
		|| (bean.parent !== undefined && typeof bean.parent !== "string")
		|| (bean.blocked_by !== undefined && (!Array.isArray(bean.blocked_by) || !bean.blocked_by.every((id) => typeof id === "string")))) {
		throw new Error("Invalid Beans JSON fields.");
	}
	return bean;
}

function parseList(value: unknown): Bean[] {
	if (value === null) return [];
	if (!Array.isArray(value)) throw new Error("Expected a Beans JSON array.");
	const beans = value.map(parseBean);
	if (new Set(beans.map((bean) => bean.id)).size !== beans.length) throw new Error("Duplicate Beans IDs.");
	return beans;
}

export async function resolveScope(target: string, cwd: string): Promise<Scope> {
	if (target === "on") return { kind: "session" };
	if (!/\s/.test(target) && /^[a-zA-Z0-9_-]+$/.test(target)) {
		try {
			const bean = parseBean(await beansJson(cwd, ["show", target]));
			if (bean.id !== target) throw new Error("Beans did not return the exact requested ID.");
			return { kind: "bean", target };
		} catch (error) {
			if (looksLikeBeanId(target)) throw new Error(`Cannot resolve Bean ${target}. Check the exact ID and Beans configuration.`, { cause: error });
		}
	}
	return { kind: "prompt", target };
}

export function selectWork(all: Bean[], blocked: Bean[], rootId: string, deferred: DeferredWork[]) {
	const root = all.find((bean) => bean.id === rootId);
	if (!root) throw new Error(`Bean ${rootId} is absent. Autonomous scope cannot expand.`);
	const byId = new Map(all.map((bean) => [bean.id, bean]));
	const blockedIds = new Set(blocked.map((bean) => bean.id));
	const deferredIds = new Set(deferred.flatMap((item) => item.beanId ? [item.beanId] : []));
	const scope = new Set([rootId]);
	for (let previousSize = -1; previousSize !== scope.size;) {
		previousSize = scope.size;
		for (const bean of all) if (bean.parent && scope.has(bean.parent)) scope.add(bean.id);
	}
	const scoped = all.filter((bean) => scope.has(bean.id));
	const runnableStatus = (bean: Bean) => bean.status === "todo" || bean.status === "in-progress";
	function blockedByAncestor(bean: Bean): boolean {
		const visited = new Set<string>();
		let current: Bean | undefined = bean;
		while (current) {
			if (visited.has(current.id)) throw new Error("Beans parent relationships contain a cycle.");
			visited.add(current.id);
			if (!runnableStatus(current) || blockedIds.has(current.id) || deferredIds.has(current.id)) return true;
			if (current.blocked_by?.some((id) => {
				const dependency = byId.get(id);
				return !dependency || !["completed", "scrapped"].includes(dependency.status) || deferredIds.has(id);
			})) return true;
			if (current.parent && !byId.has(current.parent)) return true;
			current = current.parent ? byId.get(current.parent) : undefined;
		}
		return false;
	}
	const ready = scoped.filter((bean) => {
		if (!runnableStatus(bean) || blockedByAncestor(bean)) return false;
		// Parents remain work summaries until their unfinished children are resolved.
		return !all.some((child) => child.parent === bean.id && child.status !== "completed" && child.status !== "scrapped");
	});
	return {
		root,
		ready,
		remaining: scoped.filter((bean) => bean.status !== "completed" && bean.status !== "scrapped"),
	};
}

export async function snapshot(cwd: string, rootId: string, deferred: DeferredWork[], signal?: AbortSignal) {
	const [all, blocked] = await Promise.all([
		beansJson(cwd, ["list"], signal),
		beansJson(cwd, ["list", "--is-blocked"], signal),
	]);
	return selectWork(parseList(all), parseList(blocked), rootId, deferred);
}
