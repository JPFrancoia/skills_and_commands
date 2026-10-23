import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const require = createRequire(import.meta.url);
const Module = require("node:module") as { _initPaths(): void };
process.env.NODE_PATH = [
	join(homedir(), ".pi", "agent", "npm", "node_modules"),
	join(homedir(), ".npm-global", "lib", "node_modules", "@earendil-works", "pi-coding-agent", "node_modules"),
	join(homedir(), ".npm-global", "lib", "node_modules"),
	"/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules",
	"/opt/homebrew/lib/node_modules",
	process.env.NODE_PATH,
].filter(Boolean).join(delimiter);
Module._initPaths();

const { default: timestamps, __test__ } = await import("./pi-message-timestamps.ts");
const { AssistantMessageComponent, initTheme } = await import("@earendil-works/pi-coding-agent");
const { stripTerminalSequences, visibleWidth } = await import("@earendil-works/pi-tui");

const timestamp = new Date(2026, 0, 2, 3, 4, 5).getTime();
assert.equal(__test__.formatTime(timestamp), "03:04:05");

type Data = { timestamp: number; role?: string };
type Renderer = (entry: { data: Data }, options: unknown, colors: typeof theme) => { render(width: number): string[] } | undefined;
const theme = { fg: (_color: string, text: string) => text };
const handlers = new Map<string, (...args: any[]) => void>();
let renderEntry: Renderer | undefined;
const appended: Array<{ type: string; data: Data }> = [];
const pi = {
	registerEntryRenderer(type: string, renderer: Renderer) {
		assert.equal(type, "message-timestamp");
		renderEntry = renderer;
	},
	on(event: string, handler: (...args: any[]) => void) {
		handlers.set(event, handler);
	},
	appendEntry(type: string, data: Data) {
		appended.push({ type, data });
	},
} as unknown as ExtensionAPI;

timestamps(pi);
assert.ok(renderEntry);
// An independent assistant entry survives even when minimalist hides its message.
assert.equal(renderEntry({ data: { timestamp, role: "assistant" } }, {}, theme), undefined);
assert.deepEqual(
	renderEntry({ data: { timestamp, role: "user" } }, {}, theme)?.render(80).map((line) => line.trimEnd()),
	["── 03:04:05 ──"],
);

let branch = [{ type: "message", message: { role: "user", timestamp } }];
const context = { ui: { theme }, sessionManager: { getBranch: () => branch } };
handlers.get("session_start")?.({}, context);
assert.ok(renderEntry({ data: { timestamp } }, {}, theme), "retain legacy user timestamps");
assert.equal(renderEntry({ data: { timestamp: timestamp + 1_000 } }, {}, theme), undefined, "hide legacy assistant timestamps");
branch = [{ type: "message", message: { role: "user", timestamp: timestamp + 2_000 } }];
handlers.get("session_tree")?.({}, context);
assert.equal(renderEntry({ data: { timestamp } }, {}, theme), undefined, "do not retain timestamps from the previous branch");
assert.ok(renderEntry({ data: { timestamp: timestamp + 2_000 } }, {}, theme));
// Pi reconstructs custom entries before it emits session_start on reload.
handlers.get("session_shutdown")?.({}, context);
timestamps(pi);
assert.ok(renderEntry({ data: { timestamp: timestamp + 2_000 } }, {}, theme), "retain user timestamps during reload reconstruction");
handlers.get("session_start")?.({}, context);

for (const role of ["user", "assistant", "toolResult"]) {
	handlers.get("message_start")?.({ message: { role, timestamp } }, context);
}
assert.deepEqual(appended, [{ type: "message-timestamp", data: { timestamp, role: "user" } }]);

const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");
const message = {
	role: "assistant" as const,
	content: [{ type: "text" as const, text: "Visible answer" }],
	timestamp,
	stopReason: "stop" as const,
};
initTheme("dark");
const component = new AssistantMessageComponent(message as any);
const lines = component.render(80);
assert.match(plain(lines), /── 03:04:05 ──\n/);
assert.match(plain(lines), /Visible answer/);
assert.equal(plain(lines).match(/03:04:05/g)?.length, 1);
assert.ok(lines[0].includes("\x1b]133;A\x07"), "preserve terminal prompt markers");
assert.ok(component.render(5).every((line) => visibleWidth(line) <= 5), "respect narrow terminal widths");
component.updateContent({ ...message, content: [] } as any);
assert.deepEqual(component.render(80), [], "tool-only assistant messages have no timestamp");
component.updateContent({ ...message, content: [], stopReason: "error", errorMessage: "Provider failed" } as any);
assert.match(plain(component.render(80)), /── 03:04:05 ──\n/);
assert.match(plain(component.render(80)), /Provider failed/);
handlers.get("session_shutdown")?.({}, context);
assert.doesNotMatch(plain(component.render(80)), /03:04:05/, "unloading restores native rendering");
handlers.get("session_start")?.({}, context);

// Model both extension load orders without depending on an installed third-party package.
for (const timestampsFirst of [true, false]) {
	let hidden = false;
	const proto = { render(_width: number) { return ["", "Visible answer"]; } };
	const fold = () => {
		const next = proto.render;
		proto.render = function (width) { return hidden ? [] : next.call(this, width); };
	};
	if (!timestampsFirst) fold();
	__test__.patchAssistantTimestamps(proto);
	if (timestampsFirst) fold();
	const instance = Object.assign(Object.create(proto), { lastMessage: message });
	assert.match(plain(instance.render(80)), /03:04:05/);
	hidden = true;
	assert.deepEqual(instance.render(80), [], "folded output must not retain a timestamp or spacer");
	hidden = false;
	__test__.patchAssistantTimestamps(proto);
	assert.equal(plain(instance.render(80)).match(/03:04:05/g)?.length, 1, "reload must not add duplicate timestamps");
	assert.equal(instance.render(80).length, 2, "preserve mouse coordinates by keeping the original line count");
}

console.log("ok");
