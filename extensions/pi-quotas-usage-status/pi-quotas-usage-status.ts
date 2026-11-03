import type {
	ExtensionAPI,
	ExtensionContext,
	ExtensionEvent,
} from "@earendil-works/pi-coding-agent";
import { quotaAuthStorage } from "./lib/auth.js";
import {
	fetchProviderQuotas,
	isSupportedProvider,
} from "./lib/quotas.js";
import type { QuotaWindow } from "./types/quotas.js";
import {
	assessWindow,
	formatTimeRemaining,
} from "./utils/quotas-severity.js";
import { formatWindowStatus, type WindowStatus } from "./format-status.js";

const SYNTHETIC_EXTENSIONS_REGISTER_EVENT = "synthetic:extensions:register";
const EXTENSION_ID = "pi-quotas-usage";
const REFRESH_INTERVAL_MS = 60_000;
const STALE_CONTEXT_MESSAGE = "This extension ctx is stale";

type MessageStartEvent = Extract<ExtensionEvent, { type: "message_start" }>;
type FetchProviderQuotas = typeof fetchProviderQuotas;

interface SyntheticExtensionsRegisterPayload {
	feature: string;
}

function isStaleContextError(error: unknown): boolean {
	return error instanceof Error && error.message.includes(STALE_CONTEXT_MESSAGE);
}

export function getContextProvider(
	ctx: ExtensionContext | undefined,
	message?: MessageStartEvent["message"],
): string | undefined {
	if (!ctx) return undefined;
	try {
		const selected = ctx.model;
		if (selected?.api !== "pi-virtual") return selected?.provider;
		if (message?.role === "assistant") {
			return message.api === "pi-virtual" ? undefined : message.provider;
		}
		const branch = ctx.sessionManager.getBranch();
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry.type === "message" && entry.message.role === "assistant") {
				return entry.message.api === "pi-virtual" ? undefined : entry.message.provider;
			}
		}
		return undefined;
	} catch (error) {
		if (isStaleContextError(error)) return undefined;
		throw error;
	}
}

function formatFooterResetTime(resetsAt: string): string {
	const remaining = formatTimeRemaining(new Date(resetsAt));
	return remaining === "now" ? "now" : `in ${remaining}`;
}

export function formatStatus(ctx: Pick<ExtensionContext, "ui">, windows: WindowStatus[]): string {
	const theme = ctx.ui.theme;
	return windows
		.map((window) => {
			const core = formatWindowStatus(theme, window);
			const reset = window.resetsAt
				? theme.fg("dim", ` (↺${formatFooterResetTime(window.resetsAt)})`)
				: "";
			return `${core}${reset}`;
		})
		.join(" ");
}

const ANTHROPIC_SUBSCRIPTION_WINDOW_LABELS = new Set([
	"5h",
	"7d",
	"7d Sonnet",
	"7d Opus",
	"7d Opus (legacy)",
]);

function shouldShowInStatus(window: QuotaWindow): boolean {
	return !(
		window.provider === "anthropic" &&
		ANTHROPIC_SUBSCRIPTION_WINDOW_LABELS.has(window.label)
	);
}

export function toWindowStatus(window: QuotaWindow): WindowStatus {
	return {
		label: window.label,
		usedPercent: window.usedPercent,
		severity: assessWindow(window).severity,
		resetsAt: window.resetsAt.getTime() > 0 ? window.resetsAt.toISOString() : null,
		limited: window.limited ?? false,
		isCurrency: window.isCurrency,
		usedValue: window.usedValue,
		limitValue: window.limitValue,
	};
}

export function toStatusWindows(windows: QuotaWindow[]): WindowStatus[] {
	return windows.filter(shouldShowInStatus).map(toWindowStatus);
}

export function formatStatusForFooter(
	ctx: Pick<ExtensionContext, "ui">,
	windows: WindowStatus[],
): string | undefined {
	if (windows.length === 0) return undefined;
	return formatStatus(ctx, windows);
}

export function createStatusRefresher(fetchQuotas: FetchProviderQuotas = fetchProviderQuotas) {
	let refreshTimer: ReturnType<typeof setInterval> | undefined;
	let activeContext: ExtensionContext | undefined;
	let activeProvider: string | undefined;
	let inFlight = false;
	let queued = false;
	let generation = 0;

	function deactivate(): void {
		if (refreshTimer) clearInterval(refreshTimer);
		refreshTimer = undefined;
		activeContext = undefined;
		activeProvider = undefined;
		queued = false;
		generation++;
	}

	function setStatusSafely(
		ctx: ExtensionContext | undefined,
		text: string | undefined | ((current: ExtensionContext) => string | undefined),
	): boolean {
		if (!ctx) return false;
		try {
			if (!ctx.hasUI) return true;
			ctx.ui.setStatus(EXTENSION_ID, typeof text === "function" ? text(ctx) : text);
			return true;
		} catch (error) {
			if (isStaleContextError(error) && activeContext === ctx) deactivate();
			return false;
		}
	}

	async function update(ctx: ExtensionContext, requestGeneration = generation): Promise<void> {
		if (inFlight) {
			queued = true;
			return;
		}
		inFlight = true;
		try {
			if (requestGeneration !== generation || activeContext !== ctx) return;
			if (!ctx.hasUI || !activeProvider || !isSupportedProvider(activeProvider)) return;

			const provider = activeProvider;
			const result = await fetchQuotas(quotaAuthStorage(ctx.modelRegistry), provider);
			if (requestGeneration !== generation || activeContext !== ctx) return;

			if (!result.success) {
				if (result.error.kind === "not_applicable") {
					setStatusSafely(ctx, undefined);
					return;
				}
				setStatusSafely(ctx, (current) => current.ui.theme.fg("warning", "usage unavailable"));
				return;
			}
			const windows = toStatusWindows(result.data.windows);
			setStatusSafely(ctx, formatStatusForFooter(ctx, windows));
		} catch (error) {
			if (isStaleContextError(error)) {
				if (activeContext === ctx) deactivate();
				return;
			}
			setStatusSafely(ctx, (current) => current.ui.theme.fg("warning", "usage unavailable"));
		} finally {
			inFlight = false;
			if (queued && activeContext) {
				queued = false;
				void update(activeContext, generation).catch(() => undefined);
			}
		}
	}

	return {
		async refreshFor(ctx: ExtensionContext, message?: MessageStartEvent["message"]): Promise<void> {
			const provider = getContextProvider(ctx, message);
			if (provider !== activeProvider) setStatusSafely(ctx, undefined);
			activeContext = ctx;
			activeProvider = provider;
			generation++;
			const requestGeneration = generation;
			if (!activeProvider || !isSupportedProvider(activeProvider)) {
				setStatusSafely(ctx, undefined);
				return;
			}
			await update(ctx, requestGeneration);
		},
		start(): void {
			if (refreshTimer) clearInterval(refreshTimer);
			refreshTimer = setInterval(() => {
				if (activeContext) void update(activeContext, generation).catch(() => undefined);
			}, REFRESH_INTERVAL_MS);
			refreshTimer.unref?.();
		},
		stop(ctx?: ExtensionContext): void {
			deactivate();
			setStatusSafely(ctx, undefined);
		},
	};
}

export default function usageStatusExtension(pi: ExtensionAPI) {
	const refresher = createStatusRefresher();
	const unsubscribeEventBusListeners: Array<() => void> = [];
	let currentContext: ExtensionContext | undefined;
	let syntheticUsageActive = false;

	unsubscribeEventBusListeners.push(
		pi.events.on(SYNTHETIC_EXTENSIONS_REGISTER_EVENT, (data: unknown) => {
			const { feature } = data as SyntheticExtensionsRegisterPayload;
			if (feature !== "usageStatus") return;
			syntheticUsageActive = true;
			if (currentContext && getContextProvider(currentContext) === "synthetic") {
				refresher.stop(currentContext);
			}
		}),
	);

	function shouldDeferToSynthetic(provider: string | undefined): boolean {
		return syntheticUsageActive && provider === "synthetic";
	}

	function scheduleRefresh(ctx: ExtensionContext, message?: MessageStartEvent["message"]): void {
		refresher.start();
		void refresher.refreshFor(ctx, message).catch(() => undefined);
	}

	pi.on("session_start", (_event, ctx) => {
		currentContext = ctx;
		if (shouldDeferToSynthetic(getContextProvider(ctx))) {
			refresher.stop(ctx);
			return;
		}
		scheduleRefresh(ctx);
	});

	pi.on("message_start", (event, ctx) => {
		if (event.message.role !== "assistant") return;
		currentContext = ctx;
		if (shouldDeferToSynthetic(getContextProvider(ctx, event.message))) {
			refresher.stop(ctx);
			return;
		}
		scheduleRefresh(ctx, event.message);
	});

	pi.on("turn_end", (_event, ctx) => {
		currentContext = ctx;
		if (shouldDeferToSynthetic(getContextProvider(ctx))) {
			refresher.stop(ctx);
			return;
		}
		scheduleRefresh(ctx);
	});

	pi.on("model_select", (_event, ctx) => {
		currentContext = ctx;
		if (shouldDeferToSynthetic(getContextProvider(ctx))) {
			refresher.stop(ctx);
			return;
		}
		scheduleRefresh(ctx);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		currentContext = undefined;
		syntheticUsageActive = false;
		refresher.stop(ctx);
		for (const unsubscribe of unsubscribeEventBusListeners.splice(0)) unsubscribe();
	});
}
