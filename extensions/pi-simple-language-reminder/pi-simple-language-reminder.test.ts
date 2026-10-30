import assert from "node:assert/strict";
import type { AgentMessage, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import simpleLanguageReminder from "./pi-simple-language-reminder.ts";

let contextHandler: ((event: { messages: AgentMessage[] }) => { messages: AgentMessage[] }) | undefined;
const pi = {
	on(event: string, handler: typeof contextHandler) {
		assert.equal(event, "context");
		contextHandler = handler;
	},
} as unknown as ExtensionAPI;

simpleLanguageReminder(pi);
assert.ok(contextHandler);

const original = { role: "user", content: "Explain the API.", timestamp: 1 } as AgentMessage;
const result = contextHandler({ messages: [original] });
assert.equal(result.messages.length, 2);
assert.equal(result.messages[0], original);
assert.deepEqual(result.messages[1], {
	role: "custom",
	customType: "simple-language-reminder",
	content:
		"Use ASD-STE100 Simplified Technical English for prose. Use short, direct sentences and active voice. Preserve code identifiers, commands, file paths, error messages, and quoted text exactly. If docs/CONTEXT.md exists, use its defined terms consistently. Otherwise, prefer common words. Define each necessary technical term at first use.",
	display: false,
	timestamp: result.messages[1].timestamp,
});
assert.equal(Number.isFinite(result.messages[1].timestamp), true);

console.log("ok");
