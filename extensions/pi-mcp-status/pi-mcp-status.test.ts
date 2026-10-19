import assert from "node:assert/strict";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import mcpStatus from "./pi-mcp-status.ts";

const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
const statuses: Array<string | undefined> = [];
let tools: Array<{ exposure: string; namespace?: { name: string } }> = [];
let tick: (() => void) | undefined;
let stopped = 0;
let unrefed = 0;
const ctx = {
	hasUI: true,
	ui: {
		theme: { fg: (_color: string, text: string) => text },
		setStatus: (key: string, value: string | undefined) => {
			assert.equal(key, "mcp-status");
			statuses.push(value);
		},
	},
} as unknown as ExtensionContext;
const pi = {
	getAllTools: () => tools,
	on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => void) => handlers.set(event, handler),
} as unknown as ExtensionAPI;
const original = { setInterval, clearInterval };
try {
	globalThis.setInterval = ((callback: () => void, delay: number) => {
		assert.equal(delay, 1000);
		tick = callback;
		return { unref: () => unrefed++ };
	}) as unknown as typeof setInterval;
	globalThis.clearInterval = ((timer: unknown) => { if (timer) stopped++; }) as typeof clearInterval;
	mcpStatus(pi);
	handlers.get("session_start")!({}, ctx);
	assert.equal(statuses.at(-1), "🔌 0");
	tools = [
		{ exposure: "direct", namespace: { name: "mcp__server_one" } },
		{ exposure: "codemode", namespace: { name: "mcp__server_one" } },
		{ exposure: "deferred", namespace: { name: "mcp__flint" } },
		{ exposure: "hidden", namespace: { name: "mcp__disabled" } },
		{ exposure: "direct", namespace: { name: "unrelated" } },
		{ exposure: "direct" },
	];
	tick!();
	assert.equal(statuses.at(-1), "🔌 2");
	tools.forEach((tool) => { tool.exposure = "hidden"; });
	tick!();
	assert.equal(statuses.at(-1), "🔌 0");
	handlers.get("session_start")!({}, ctx);
	assert.equal(stopped, 1);
	assert.equal(unrefed, 2);
	handlers.get("session_shutdown")!({}, ctx);
	assert.equal(stopped, 2);
	assert.equal(statuses.at(-1), undefined);
	handlers.get("session_start")!({}, { ...ctx, hasUI: false });
	assert.equal(unrefed, 2);
} finally {
	Object.assign(globalThis, original);
}
console.log("ok");
