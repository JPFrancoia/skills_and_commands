import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import usageStatusExtension from "./index.js";
import { fetchProviderQuotas } from "../../lib/quotas.js";

vi.mock("../../config.js", () => ({
  QUOTAS_CONFIG_UPDATED_EVENT: "quotas:config:updated",
  QUOTAS_EXTENSIONS_REGISTER_EVENT: "quotas:extensions:register",
  QUOTAS_EXTENSIONS_REQUEST_EVENT: "quotas:extensions:request",
  configLoader: {
    load: vi.fn(async () => undefined),
    getConfig: vi.fn(() => ({
      configVersion: "test",
      quotasCommand: true,
      providerCommands: true,
      usageStatus: true,
      quotaWarnings: true,
      deferToSynthetic: true,
    })),
  },
}));

vi.mock("../../lib/auth.js", () => ({ quotaAuthStorage: () => ({}) }));

vi.mock("../../lib/quotas.js", () => ({
  isSupportedProvider: (provider: string | undefined) =>
    ["anthropic", "openai-codex", "synthetic"].includes(provider ?? ""),
  fetchProviderQuotas: vi.fn(async () => ({
    success: true,
    data: { provider: "anthropic", windows: [] },
  })),
}));

const STALE_CONTEXT_ERROR =
  "This extension ctx is stale after session replacement or reload.";

type EventHandler = (event: unknown, ctx: ExtensionContext) => unknown;

function createFakePi() {
  const extensionHandlers = new Map<string, EventHandler[]>();
  const eventBusHandlers = new Map<string, Array<(data: unknown) => void>>();

  const pi = {
    on(event: string, handler: EventHandler) {
      const handlers = extensionHandlers.get(event) ?? [];
      handlers.push(handler);
      extensionHandlers.set(event, handlers);
    },
    events: {
      on(channel: string, handler: (data: unknown) => void) {
        const handlers = eventBusHandlers.get(channel) ?? [];
        handlers.push(handler);
        eventBusHandlers.set(channel, handlers);
        return () => {
          const current = eventBusHandlers.get(channel) ?? [];
          eventBusHandlers.set(channel, current.filter((entry) => entry !== handler));
        };
      },
      emit(channel: string, data: unknown) {
        for (const handler of eventBusHandlers.get(channel) ?? []) handler(data);
      },
    },
  } as unknown as ExtensionAPI;

  return {
    pi,
    async emitExtensionEvent(event: string, ctx: ExtensionContext, data = {}) {
      for (const handler of extensionHandlers.get(event) ?? []) {
        await handler({ type: event, reason: "test", ...data }, ctx);
      }
    },
    emitBusEvent(channel: string, data: unknown) {
      pi.events.emit(channel, data);
    },
    listenerCount(channel: string) {
      return eventBusHandlers.get(channel)?.length ?? 0;
    },
  };
}

function createContext(provider: string, api = "test", branch: any[] = []) {
  let stale = false;
  const setStatus = vi.fn(() => {
    if (stale) throw new Error(STALE_CONTEXT_ERROR);
  });

  const ctx = {
    get hasUI() {
      if (stale) throw new Error(STALE_CONTEXT_ERROR);
      return true;
    },
    get model() {
      if (stale) throw new Error(STALE_CONTEXT_ERROR);
      return { provider, api };
    },
    sessionManager: { getBranch: () => branch },
    modelRegistry: { authStorage: {} },
    ui: {
      theme: { fg: (_color: string, text: string) => text },
      setStatus,
    },
  } as unknown as ExtensionContext;

  return {
    ctx,
    setStale() {
      stale = true;
    },
    setStatus,
    selectModel(nextProvider: string, nextApi = "test") {
      provider = nextProvider;
      api = nextApi;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("usage-status extension lifecycle", () => {
  it("ignores interval refreshes for stale session contexts", async () => {
    vi.useFakeTimers();
    const { pi, emitExtensionEvent } = createFakePi();
    const { ctx, setStale } = createContext("unsupported-provider");

    await usageStatusExtension(pi);
    await emitExtensionEvent("session_start", ctx);

    setStale();

    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
    await vi.runOnlyPendingTimersAsync();
  });

  it("does not throw when event-bus callbacks see a stale session context", async () => {
    const { pi, emitExtensionEvent, emitBusEvent } = createFakePi();
    const { ctx, setStale } = createContext("synthetic");

    await usageStatusExtension(pi);
    await emitExtensionEvent("session_start", ctx);

    setStale();

    expect(() => {
      emitBusEvent("synthetic:extensions:register", { feature: "usageStatus" });
      emitBusEvent("quotas:config:updated", {
        config: { usageStatus: true, deferToSynthetic: true },
      });
    }).not.toThrow();
  });

  it("unsubscribes event-bus listeners during session shutdown", async () => {
    const { pi, emitExtensionEvent, listenerCount } = createFakePi();
    const { ctx } = createContext("unsupported-provider");

    await usageStatusExtension(pi);
    expect(listenerCount("quotas:config:updated")).toBe(1);
    expect(listenerCount("synthetic:extensions:register")).toBe(1);
    expect(listenerCount("quotas:extensions:request")).toBe(1);

    await emitExtensionEvent("session_shutdown", ctx);

    expect(listenerCount("quotas:config:updated")).toBe(0);
    expect(listenerCount("synthetic:extensions:register")).toBe(0);
    expect(listenerCount("quotas:extensions:request")).toBe(0);
  });

  it("clears the footer silently for not_applicable credentials instead of warning", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchProviderQuotas).mockResolvedValueOnce({
      success: false,
      error: { kind: "not_applicable", message: "Direct API key" },
    } as any);

    const { pi, emitExtensionEvent } = createFakePi();
    const { ctx, setStatus } = createContext("anthropic");

    await usageStatusExtension(pi);
    await emitExtensionEvent("session_start", ctx);
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(0);

    const calls = setStatus.mock.calls as unknown as Array<[string, string | undefined]>;
    const last = calls[calls.length - 1]?.[1];
    expect(last).toBeUndefined();
    expect(calls.some((c) => c[1] === "usage unavailable")).toBe(false);
  });
});

function assistant(provider: string, api = "test") {
  return { role: "assistant", provider, api, stopReason: "stop" };
}

async function settleRefresh() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("routed-provider quota footer", () => {
  it("fetches Codex quota when a Jev request starts, before the response is saved", async () => {
    const fake = createFakePi();
    const { ctx, setStatus } = createContext("jev", "pi-virtual");
    vi.mocked(fetchProviderQuotas).mockResolvedValueOnce({ success: true, data: {
      provider: "openai-codex", windows: [{
        provider: "openai-codex", label: "5h", usedPercent: 25,
        resetsAt: new Date(Date.now() + 3_600_000), windowSeconds: 18_000,
        usedValue: 25, limitValue: 100,
      }],
    } } as any);
    await usageStatusExtension(fake.pi);
    await fake.emitExtensionEvent("session_start", ctx);
    expect(fetchProviderQuotas).not.toHaveBeenCalled();

    await fake.emitExtensionEvent("message_start", ctx, { message: assistant("openai-codex") });
    await settleRefresh();
    expect(fetchProviderQuotas).toHaveBeenLastCalledWith({}, "openai-codex");
    expect(setStatus).toHaveBeenLastCalledWith("pi-quotas-usage", expect.stringContaining("75% left"));
    await fake.emitExtensionEvent("session_shutdown", ctx);
  });

  it.each(["jev", "openai-codex"])("restores the physical provider under virtual selection %s", async (selected) => {
    const fake = createFakePi();
    const { ctx } = createContext(selected, "pi-virtual", [
      { type: "message", message: assistant("anthropic") },
      { type: "usage", provider: "typesafe" },
    ]);
    await usageStatusExtension(fake.pi);
    await fake.emitExtensionEvent("session_start", ctx);
    await settleRefresh();
    expect(fetchProviderQuotas).toHaveBeenLastCalledWith({}, "anthropic");
    await fake.emitExtensionEvent("session_shutdown", ctx);
  });

  it("uses a direct selection instead of a historical response", async () => {
    const fake = createFakePi();
    const { ctx } = createContext("openai-codex", "test", [
      { type: "message", message: assistant("anthropic") },
    ]);
    await usageStatusExtension(fake.pi);
    await fake.emitExtensionEvent("session_start", ctx);
    await settleRefresh();
    expect(fetchProviderQuotas).toHaveBeenLastCalledWith({}, "openai-codex");
    await fake.emitExtensionEvent("session_shutdown", ctx);
  });

  it("clears the previous provider during a switch and rejects its delayed result", async () => {
    const fake = createFakePi();
    const { ctx, setStatus } = createContext("jev", "pi-virtual");
    let finish: (result: any) => void = () => {};
    vi.mocked(fetchProviderQuotas).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await usageStatusExtension(fake.pi);
    await fake.emitExtensionEvent("message_start", ctx, { message: assistant("openai-codex") });
    await fake.emitExtensionEvent("message_start", ctx, { message: assistant("unsupported") });
    finish({ success: true, data: { provider: "openai-codex", windows: [{
      provider: "openai-codex", label: "5h", usedPercent: 25,
      resetsAt: new Date(Date.now() + 3_600_000), windowSeconds: 18_000,
      usedValue: 25, limitValue: 100,
    }] } });
    await settleRefresh();
    expect(setStatus).toHaveBeenLastCalledWith("pi-quotas-usage", undefined);
    expect(setStatus.mock.calls.some((call: any[]) => call[1]?.includes("75% left"))).toBe(false);
    await fake.emitExtensionEvent("session_shutdown", ctx);
  });

  it("follows a changed provider during streaming and on the refresh timer", async () => {
    vi.useFakeTimers();
    const fake = createFakePi();
    const { ctx } = createContext("jev", "pi-virtual");
    await usageStatusExtension(fake.pi);
    await fake.emitExtensionEvent("session_start", ctx);
    await fake.emitExtensionEvent("message_start", ctx, { message: assistant("openai-codex") });
    await settleRefresh();
    await fake.emitExtensionEvent("message_start", ctx, { message: assistant("anthropic") });
    await settleRefresh();
    expect(fetchProviderQuotas).toHaveBeenLastCalledWith({}, "anthropic");
    vi.mocked(fetchProviderQuotas).mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchProviderQuotas).toHaveBeenCalledExactlyOnceWith({}, "anthropic");
    await fake.emitExtensionEvent("session_shutdown", ctx);
  });

  it("does not guess a provider after virtual routing fails", async () => {
    const fake = createFakePi();
    const { ctx, setStatus } = createContext("jev", "pi-virtual", [
      { type: "message", message: assistant("openai-codex") },
      { type: "message", message: { ...assistant("jev", "pi-virtual"), stopReason: "error" } },
    ]);
    await usageStatusExtension(fake.pi);
    await fake.emitExtensionEvent("session_start", ctx);
    await settleRefresh();
    expect(fetchProviderQuotas).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenLastCalledWith("pi-quotas-usage", undefined);
    await fake.emitExtensionEvent("session_shutdown", ctx);
  });

  it("clears routed quota when a direct unsupported model is selected", async () => {
    const fake = createFakePi();
    const { ctx, selectModel, setStatus } = createContext("jev", "pi-virtual", [
      { type: "message", message: assistant("openai-codex") },
    ]);
    await usageStatusExtension(fake.pi);
    await fake.emitExtensionEvent("session_start", ctx);
    await settleRefresh();
    vi.mocked(fetchProviderQuotas).mockClear();
    selectModel("unsupported");
    await fake.emitExtensionEvent("model_select", ctx);
    await settleRefresh();
    expect(fetchProviderQuotas).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenLastCalledWith("pi-quotas-usage", undefined);
    await fake.emitExtensionEvent("session_shutdown", ctx);
  });

  it("preserves Synthetic deferral and restarts polling when routing away", async () => {
    vi.useFakeTimers();
    const fake = createFakePi();
    const { ctx, setStatus } = createContext("jev", "pi-virtual");
    await usageStatusExtension(fake.pi);
    fake.emitBusEvent("synthetic:extensions:register", { feature: "usageStatus" });
    await fake.emitExtensionEvent("message_start", ctx, { message: assistant("synthetic") });
    await settleRefresh();
    expect(fetchProviderQuotas).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenLastCalledWith("pi-quotas-usage", undefined);
    await fake.emitExtensionEvent("message_start", ctx, { message: assistant("openai-codex") });
    await settleRefresh();
    vi.mocked(fetchProviderQuotas).mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchProviderQuotas).toHaveBeenCalledExactlyOnceWith({}, "openai-codex");
    await fake.emitExtensionEvent("session_shutdown", ctx);
  });
});
