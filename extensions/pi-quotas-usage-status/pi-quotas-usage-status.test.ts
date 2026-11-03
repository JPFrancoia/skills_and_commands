import assert from "node:assert/strict";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatWindowStatus } from "./format-status.ts";
import usageStatusExtension, {
	createStatusRefresher,
	formatStatus,
	getContextProvider,
	toStatusWindows,
	toWindowStatus,
} from "./pi-quotas-usage-status.ts";
import { parseCodexUsage } from "./providers/providers.ts";
import type { QuotasResult } from "./types/quotas.ts";

function assistant(provider: string, api = "test"): any {
	return { role: "assistant", provider, api, stopReason: "stop" };
}

function createContext(provider: string, api = "test", branch: unknown[] = []) {
	let stale = false;
	const statuses: Array<string | undefined> = [];
	const ctx = {
		get hasUI() {
			if (stale) throw new Error("This extension ctx is stale after session replacement or reload.");
			return true;
		},
		get model() {
			if (stale) throw new Error("This extension ctx is stale after session replacement or reload.");
			return { provider, api };
		},
		sessionManager: { getBranch: () => branch },
		modelRegistry: {
			authStorage: {
				get: () => undefined,
				getApiKey: async () => undefined,
			},
		},
		ui: {
			theme: { fg: (color: string, text: string) => `[${color}]${text}[/${color}]` },
			setStatus: (key: string, value: string | undefined) => {
				assert.equal(key, "pi-quotas-usage");
				statuses.push(value);
			},
		},
	} as unknown as ExtensionContext;

	return {
		ctx,
		statuses,
		setStale: () => {
			stale = true;
		},
	};
}

{
	const direct = createContext("openai-codex");
	assert.equal(getContextProvider(direct.ctx), "openai-codex");

	const routed = createContext("jev", "pi-virtual", [
		{ type: "message", message: assistant("anthropic") },
	]);
	assert.equal(getContextProvider(routed.ctx), "anthropic");
	assert.equal(
		getContextProvider(routed.ctx, assistant("openai-codex")),
		"openai-codex",
	);

	routed.setStale();
	assert.equal(getContextProvider(routed.ctx), undefined);
}

{
	const windows = parseCodexUsage({
		rate_limit: {
			primary_window: {
				used_percent: 25,
				limit_window_seconds: 18_000,
				reset_at: "2026-05-06T07:47:37Z",
			},
			secondary_window: {
				used_percent: 80,
				limit_window_seconds: 604_800,
				reset_at: "2026-05-12T07:47:37Z",
			},
		},
	});
	assert.deepEqual(
		windows.map((window) => [window.label, window.usedPercent]),
		[["5h", 25], ["7d", 80]],
	);
}

{
	const theme = { fg: (color: string, text: string) => `[${color}]${text}[/${color}]` };
	const output = formatWindowStatus(theme, {
		label: "5h",
		usedPercent: 25,
		severity: "none",
		resetsAt: null,
		limited: false,
		usedValue: 25,
		limitValue: 100,
	});
	assert.match(output, /75% left/);
	assert.match(output, /\[dim\]5h:/);

	const filtered = toStatusWindows([
		{
			provider: "anthropic",
			label: "5h",
			usedPercent: 10,
			resetsAt: new Date("2026-05-06T07:47:37Z"),
			windowSeconds: 18_000,
			usedValue: 10,
			limitValue: 100,
		},
		{
			provider: "anthropic",
			label: "Extra (USD)",
			usedPercent: 30,
			resetsAt: new Date("2026-06-01T00:00:00Z"),
			windowSeconds: 2_592_000,
			usedValue: 30,
			limitValue: 100,
			isCurrency: true,
		},
	]);
	assert.deepEqual(filtered.map((window) => window.label), ["Extra (USD)"]);

	const noReset = toWindowStatus({
		provider: "openai-codex",
		label: "Spend cap",
		usedPercent: 0,
		resetsAt: new Date(0),
		windowSeconds: 0,
		usedValue: 0,
		limitValue: 1,
	});
	assert.equal(noReset.resetsAt, null);
	assert.doesNotMatch(formatStatus({ ui: { theme } } as never, [noReset]), /↺/);
}

{
	let finish: (result: QuotasResult) => void = () => undefined;
	const fetchQuotas = () => new Promise<QuotasResult>((resolve) => {
		finish = resolve;
	});
	const refresher = createStatusRefresher(fetchQuotas as never);
	const { ctx, statuses } = createContext("jev", "pi-virtual");

	const oldRefresh = refresher.refreshFor(ctx, assistant("openai-codex"));
	await Promise.resolve();
	await refresher.refreshFor(ctx, assistant("unsupported"));
	finish({
		success: true,
		data: {
			provider: "openai-codex",
			windows: [{
				provider: "openai-codex",
				label: "5h",
				usedPercent: 25,
				resetsAt: new Date(Date.now() + 3_600_000),
				windowSeconds: 18_000,
				usedValue: 25,
				limitValue: 100,
			}],
		},
	});
	await oldRefresh;
	assert.equal(statuses.at(-1), undefined);
	assert.equal(statuses.some((status) => status?.includes("75% left")), false);
}

{
	const fetchQuotas = async (): Promise<QuotasResult> => ({
		success: false,
		error: { kind: "not_applicable", message: "Direct API key" },
	});
	const refresher = createStatusRefresher(fetchQuotas as never);
	const { ctx, statuses } = createContext("anthropic");
	await refresher.refreshFor(ctx);
	assert.equal(statuses.at(-1), undefined);
	assert.equal(statuses.includes("usage unavailable"), false);
}

{
	const extensionHandlers = new Map<string, (event: any, ctx: ExtensionContext) => unknown>();
	const busHandlers = new Map<string, (data: unknown) => void>();
	const pi = {
		on: (event: string, handler: (event: any, ctx: ExtensionContext) => unknown) => {
			extensionHandlers.set(event, handler);
		},
		events: {
			on: (event: string, handler: (data: unknown) => void) => {
				busHandlers.set(event, handler);
				return () => busHandlers.delete(event);
			},
		},
	} as unknown as ExtensionAPI;

	usageStatusExtension(pi);
	for (const event of ["session_start", "message_start", "turn_end", "model_select", "session_shutdown"]) {
		assert.ok(extensionHandlers.has(event), `${event} handler registered`);
	}
	assert.ok(busHandlers.has("synthetic:extensions:register"));

	const { ctx } = createContext("unsupported");
	extensionHandlers.get("session_shutdown")!({}, ctx);
	assert.equal(busHandlers.size, 0);
}

console.log("pi-quotas-usage-status: ok");
