import { afterEach, describe, expect, it, vi } from "vitest";
import { initTheme, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  Container, Input, KeybindingsManager, Text, TUI_KEYBINDINGS, TuiAltScreen,
  type OverlayHandle, type Terminal,
} from "@earendil-works/pi-tui";
import btwExtension, { type BtwOverlayComponent } from "../extensions/btw";

initTheme("dark", false);
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function fixture(answer?: string) {
  let sendInput!: (data: string) => void;
  const terminal: Terminal = {
    columns: 100, rows: 30, kittyProtocolActive: false,
    start: (onInput) => { sendInput = onInput; }, stop: vi.fn(), write: vi.fn(),
    moveBy: vi.fn(), hideCursor: vi.fn(), showCursor: vi.fn(), clearLine: vi.fn(),
    clearFromCursor: vi.fn(), clearScreen: vi.fn(), setTitle: vi.fn(), setProgress: vi.fn(),
  };
  const tui = new TuiAltScreen(terminal, false);
  cleanups.push(() => tui.stop());
  const document = new Container();
  document.addChild(new Text(Array.from({ length: 80 }, (_, i) => `Parent line ${i}`).join("\n"), 0, 0));
  const editor = new Input();
  document.addChild(editor);
  tui.addChild(document);
  tui.setFocus(editor);
  tui.start();

  const theme = {
    fg: (_color: string, value: string) => value, bg: (_color: string, value: string) => value,
    bold: (value: string) => value, italic: (value: string) => value,
  };
  const keybindings = new KeybindingsManager(TUI_KEYBINDINGS);
  const commands = new Map<string, any>();
  const shortcuts = new Map<string, any>();
  const events = new Map<string, Function>();
  const overlays: Array<{ component: BtwOverlayComponent; handle: OverlayHandle; closed: boolean }> = [];
  const subscriptions = new Set<() => void>();
  const ui = {
    theme, notify: vi.fn(), setWidget: vi.fn(),
    onTerminalInput(listener: any) {
      const unsubscribe = tui.addInputListener(listener);
      const release = () => { subscriptions.delete(release); unsubscribe(); };
      subscriptions.add(release);
      return release;
    },
    custom(factory: any, options: any) {
      return new Promise<void>((resolve, reject) => {
        let entry: typeof overlays[number] | undefined;
        let component: BtwOverlayComponent | undefined;
        const done = () => {
          if (entry?.closed) return;
          if (entry) {
            entry.closed = true;
            entry.handle.hide();
          }
          component?.dispose();
          resolve();
        };
        Promise.resolve(factory(tui, theme, keybindings, done)).then((created) => {
          component = created;
          entry = { component: created, handle: tui.showOverlay(created, options.overlayOptions), closed: false };
          overlays.push(entry);
          options.onHandle(entry.handle);
        }).catch(reject);
      });
    },
  };
  const api = {
    on: (name: string, handler: Function) => events.set(name, handler),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    registerShortcut: (name: string, shortcut: any) => shortcuts.set(name, shortcut),
    registerMessageRenderer: vi.fn(), getThinkingLevel: () => "off",
  } as unknown as ExtensionAPI;
  btwExtension(api);
  const ctx = {
    mode: "tui", hasUI: true, ui, cwd: "/test/project", model: undefined,
    sessionManager: { getBranch: () => answer ? [{
      type: "custom", customType: "btw-thread-entry",
      data: { question: "Previous BTW question", thinking: "", answer, provider: "test", model: "test", api: "openai-responses", thinkingLevel: "off", timestamp: 1 },
    }] : [] }, getSystemPrompt: () => "Test prompt",
  } as unknown as ExtensionCommandContext;
  cleanups.push(() => events.get("session_shutdown")?.({}, ctx));
  await events.get("session_start")?.({}, ctx);
  const command = async () => { await commands.get("btw").handler("", ctx); await Promise.resolve(); tui.renderNow(); };
  const shortcut = async (name = "ctrl+alt+w") => { await shortcuts.get(name).handler(ctx); tui.renderNow(); };
  const question = {
    focused: false, render: () => ["MAIN QUESTION waiting"], invalidate() {},
    handleInput: vi.fn(),
  };
  const mountQuestion = async () => {
    document.addChild(question);
    tui.setFocus(question);
    await Promise.resolve();
    tui.renderNow();
  };
  const input = (data: string) => { sendInput(data); tui.renderNow(); };
  const overlay = () => overlays.at(-1)!;
  return { tui, terminal, editor, overlays, subscriptions, command, shortcut, question, mountQuestion, input, overlay };
}

describe("BTW foreground input with the real fullscreen TUI", () => {
  it("settles queued restoration when an open BTW overlay is focused again", async () => {
    const f = await fixture();
    await f.command();
    await f.mountQuestion();
    const callbacks: Array<() => void> = [];
    // Capture microtasks so a regression cannot starve Vitest's timeout timer.
    const queue = vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => callbacks.push(callback));
    try {
      await f.command();
      for (let i = 0; i < 8 && callbacks.length; i++) callbacks.shift()!();
      expect(callbacks).toHaveLength(0);
      expect(f.tui.getFocusedComponent()).toBe(f.overlay().component);
      f.input("follow-up");
      expect(f.overlay().component.getDraft()).toBe("follow-up");
      f.input("\x1b");
      expect(f.overlay().closed).toBe(true);
      expect(f.tui.getFocusedComponent()).toBe(f.question);
      expect(f.question.handleInput).not.toHaveBeenCalled();
      for (const callback of callbacks.splice(0)) callback();
      expect(callbacks).toHaveLength(0);
    } finally {
      queue.mockRestore();
    }
  });

  it.each(["before", "after"])("keeps typing and Escape in BTW when a question opens %s BTW", async (order) => {
    const f = await fixture();
    if (order === "before") await f.mountQuestion();
    await f.command();
    if (order === "after") await f.mountQuestion();
    f.input("draft");
    expect(f.overlay().component.getDraft()).toBe("draft");
    expect(f.question.handleInput).not.toHaveBeenCalled();
    f.input("\x1b");
    expect(f.overlay().closed).toBe(true);
    expect(f.question.handleInput).not.toHaveBeenCalled();
    expect(f.tui.getFocusedComponent()).toBe(f.question);
    expect(f.subscriptions.size).toBe(0);
    f.input("\r");
    expect(f.question.handleInput).toHaveBeenCalledWith("\r");
  });

  it("releases foreground input through the focus shortcut and restores it without duplicate listeners", async () => {
    const f = await fixture();
    await f.command();
    await f.mountQuestion();
    f.input("\x1b\x17");
    f.input("answer");
    expect(f.question.handleInput).toHaveBeenCalledWith("answer");
    expect(f.overlay().closed).toBe(false);
    await f.shortcut();
    f.input("draft");
    expect(f.overlay().component.getDraft()).toBe("draft");
    f.input("\x1b");
    expect(f.tui.getFocusedComponent()).toBe(f.question);
    expect(f.subscriptions.size).toBe(0);
    await f.command();
    expect(f.subscriptions.size).toBe(1);
    f.input("x");
    expect(f.overlay().component.getDraft()).toBe("draftx");
  });

  it("routes keys during the focus handoff without forwarding terminal reports or key releases", async () => {
    const f = await fixture();
    await f.command();
    const mounting = f.mountQuestion();
    f.input("draft");
    f.input("\x1b[27;1:3u");
    f.input("\x1b[6;20;10t");
    await mounting;
    expect(f.overlay().component.getDraft()).toBe("draft");
    expect(f.overlay().closed).toBe(false);
    expect(f.question.handleInput).not.toHaveBeenCalled();
  });

  it("preserves the waiting question and draft through a width change", async () => {
    const f = await fixture();
    await f.command();
    await f.mountQuestion();
    f.input("draft");
    await f.shortcut("alt+w");
    expect(f.overlays).toHaveLength(2);
    expect(f.overlays[0].closed).toBe(true);
    expect(f.overlay().component.getDraft()).toBe("draft");
    expect(f.subscriptions.size).toBe(1);
    f.input("\x1b");
    expect(f.tui.getFocusedComponent()).toBe(f.question);
    expect(f.question.handleInput).not.toHaveBeenCalled();
    expect(f.subscriptions.size).toBe(0);
  });

  it.each([false, true])("returns to a later overlay only while it remains open (cancelled: %j)", async (cancelled) => {
    const f = await fixture();
    await f.command();
    const other = { focused: false, render: () => ["Another dialog"], invalidate() {}, handleInput: vi.fn() };
    const handle = f.tui.showOverlay(other);
    await Promise.resolve();
    expect(f.tui.getFocusedComponent()).toBe(f.overlay().component);
    if (cancelled) handle.hide();
    f.input("\x1b");
    expect(f.tui.getFocusedComponent()).toBe(cancelled ? f.editor : other);
    expect(other.handleInput).not.toHaveBeenCalled();
    handle.hide();
  });

  it("cleans up the input subscription when mounting the overlay fails", async () => {
    const f = await fixture();
    vi.spyOn(f.tui, "showOverlay").mockImplementationOnce(() => { throw new Error("Fixture mount failure"); });
    await f.command();
    expect(f.subscriptions.size).toBe(0);
    await f.command();
    expect(f.subscriptions.size).toBe(1);
  });

  it.each(["\x1b[5~", "\x1b[6~"])("keeps paging in BTW when a question takes focus (%j)", async (key) => {
    const f = await fixture(Array.from({ length: 60 }, (_, i) => `BTW line ${i}`).join("\n"));
    await f.command();
    await f.mountQuestion();
    const scrollParent = vi.spyOn(f.tui, "scrollBy");
    const input = vi.spyOn(f.overlay().component, "handleInput");
    f.input(key);
    expect(input).toHaveBeenCalledWith(key);
    expect(scrollParent).not.toHaveBeenCalled();
    expect(f.question.handleInput).not.toHaveBeenCalled();
  });

  it("routes normalized wheel events to the BTW transcript without scrolling the parent", async () => {
    const f = await fixture(Array.from({ length: 60 }, (_, i) => `BTW line ${i}`).join("\n"));
    await f.command();
    const component = f.overlay().component;
    f.tui.renderNow();
    const bounds = f.overlay().handle.getBounds()!;
    const before = component.render(bounds.width).join("\n");
    const viewportTop = f.tui.viewportTop;
    const mouse = vi.spyOn(component, "handleMouse");
    f.input(`\x1b[<64;${bounds.col + 3};${bounds.row + 6}M`);
    expect(mouse).toHaveReturnedWith(expect.objectContaining({ handled: true }));
    expect(component.render(bounds.width).join("\n")).not.toBe(before);
    expect(f.tui.viewportTop).toBe(viewportTop);
    f.input(`\x1b[<65;${bounds.col + 3};${bounds.row + 6}M`);
    expect(component.render(bounds.width).join("\n")).toBe(before);
    expect(f.tui.viewportTop).toBe(viewportTop);
    expect(f.terminal.write).not.toHaveBeenCalledWith("\x1b[?1000l\x1b[?1006l");
  });
});
