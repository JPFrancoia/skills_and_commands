import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const require = createRequire(import.meta.url);
const Module = require("node:module") as { _initPaths(): void };
process.env.NODE_PATH = [
	join(homedir(), ".pi", "agent", "npm", "node_modules"),
	join(homedir(), ".npm-global", "lib", "node_modules"),
	process.env.NODE_PATH,
].filter(Boolean).join(delimiter);
Module._initPaths();

const { default: vertex429Retry } = await import("./vertex-429-retry.ts");

let handler: ((event: unknown) => unknown) | undefined;
const pi = {
	on(event: string, fn: (event: unknown) => unknown) {
		if (event === "message_end") handler = fn;
	},
} as unknown as ExtensionAPI;

vertex429Retry(pi);
assert.ok(handler, "message_end handler registered");

const errored = (errorMessage: string, provider = "claude-gateway") => ({
	message: { role: "assistant", stopReason: "error", provider, errorMessage },
});

const transient =
	'Vertex API error 429: Quota exceeded for quota metric ... limit: base_model:claude-opus-5 per_minute';

// Gateway proxies Vertex, so the provider name no longer says "vertex": rewrite anyway.
const rewritten = handler(errored(transient)) as { message: { errorMessage: string } };
assert.match(rewritten.message.errorMessage, /^\[retryable-throttle\] rate limit 429: /);
assert.doesNotMatch(rewritten.message.errorMessage, /quota exceeded/i);

// Daily/account quotas carry no per-minute hint: leave them non-retryable.
assert.equal(handler(errored("429 Quota exceeded: daily request limit reached")), undefined);

// Already rewritten stays untouched (idempotent), and non-error messages are ignored.
assert.equal(handler(errored(`[retryable-throttle] rate limit 429: ${transient}`)), undefined);
assert.equal(handler({ message: { role: "assistant", stopReason: "stop" } }), undefined);

console.log("vertex-429-retry: ok");
