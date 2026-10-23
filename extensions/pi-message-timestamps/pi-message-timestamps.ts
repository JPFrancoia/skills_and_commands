/**
 * pi-message-timestamps — show local time with visible user and assistant messages.
 *
 * Install this folder with pi install /path/to/pi-message-timestamps, then run /reload.
 */

import { AssistantMessageComponent, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, Text, truncateToWidth } from "@earendil-works/pi-tui";

const ENTRY = "message-timestamp";
const PATCHED = Symbol.for("pi.message-timestamps.patched");
const STATE = Symbol.for("pi.message-timestamps.state");
type TimestampState = { getTheme?: () => Theme; userTimestamps: Set<number> };
const state = ((AssistantMessageComponent.prototype as unknown as { [key: symbol]: TimestampState })[STATE]
	??= { userTimestamps: new Set<number>() });

type TimestampData = { timestamp: number; role?: "user" | "assistant" };
type AssistantRenderer = {
	lastMessage?: { timestamp: number };
	render(width: number): string[];
};

function formatTime(timestamp: number): string {
	const time = new Date(timestamp);
	return [time.getHours(), time.getMinutes(), time.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
}

function patchAssistantTimestamps(proto: AssistantRenderer): void {
	const marked = proto as AssistantRenderer & { [key: symbol]: boolean };
	if (marked[PATCHED]) return;
	const render = proto.render;
	proto.render = function (width) {
		const lines = render.call(this, width);
		const theme = state.getTheme?.();
		if (!theme || !this.lastMessage || !lines.some((line) => stripTerminalSequences(line).trim())) return lines;
		if (stripTerminalSequences(lines[0]).trim()) return lines;
		// Keep Pi's blank separator above the timestamp for visual space after activity summaries.
		const header = theme.fg("dim", `── ${formatTime(this.lastMessage.timestamp)} ──`);
		return [lines[0], truncateToWidth(header, width), "", ...lines.slice(1)];
	};
	marked[PATCHED] = true;
}

export default function (pi: ExtensionAPI) {
	// Pi rebuilds history before session_start on reload. Retain the previous user lookup.
	const { userTimestamps } = state;
	const refresh = (_event: unknown, ctx: ExtensionContext) => {
		state.getTheme = () => ctx.ui.theme;
		userTimestamps.clear();
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "message" && entry.message.role === "user") userTimestamps.add(entry.message.timestamp);
		}
	};

	patchAssistantTimestamps(AssistantMessageComponent.prototype as unknown as AssistantRenderer);
	pi.registerEntryRenderer<TimestampData>(ENTRY, (entry, _options, theme) => {
		const data = entry.data;
		if (!data || (data.role ? data.role !== "user" : !userTimestamps.has(data.timestamp))) return undefined;
		return new Text(theme.fg("dim", `── ${formatTime(data.timestamp)} ──`), 0, 0);
	});
	pi.on("session_start", refresh);
	pi.on("session_tree", refresh);
	pi.on("session_shutdown", () => { state.getTheme = undefined; });
	pi.on("message_start", (event) => {
		if (event.message.role === "user") {
			userTimestamps.add(event.message.timestamp);
			pi.appendEntry<TimestampData>(ENTRY, { timestamp: event.message.timestamp, role: "user" });
		}
	});
}

export const __test__ = { formatTime, patchAssistantTimestamps };
