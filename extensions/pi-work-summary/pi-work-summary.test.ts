import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { ExtensionAPI, ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import type { Message, SavedGroup } from "./src/work-groups.ts";

const require = createRequire(import.meta.url);
process.env.NODE_PATH = [
  join(homedir(), ".pi", "agent", "npm", "node_modules"),
  join(homedir(), ".npm-global", "lib", "node_modules", "@earendil-works", "pi-coding-agent", "node_modules"),
  process.env.NODE_PATH,
].filter(Boolean).join(delimiter);
(require("node:module") as { _initPaths(): void })._initPaths();

const { Config, SUMMARY_LIMITS, SUMMARY_MODEL } = await import("./src/config.ts");
const { WorkGroups, loadModel, savedGroup, shortSummary, snapshot, summaryInput, SUMMARY_PROMPT } = await import("./src/work-groups.ts");
const { RunGrouping, formatDuration } = await import("./src/run-grouping.ts");
const { Painter, formatStartTime } = await import("./src/row.ts");
const { CompactLine } = await import("./src/components.ts");
const { attachWorkSummaries, renderOrder } = await import("./index.ts");
const { installBridges } = await import("./src/bridge.ts");
const { patchCore } = await import("./src/core-patch.ts");
const core = await import("@earendil-works/pi-coding-agent");
const { stripTerminalSequences, visibleWidth } = await import("@earendil-works/pi-tui");

const temp = mkdtempSync(join(tmpdir(), "pi-work-summary-"));
const configPath = join(temp, "settings.json");
try {
  assert.deepEqual(loadModel(configPath), SUMMARY_MODEL);
  writeFileSync(configPath, JSON.stringify({ workSummary: { model: "anthropic/claude-haiku-4-5" }, recap: { model: "ignored/model" } }));
  assert.deepEqual(loadModel(configPath), { provider: "anthropic", id: "claude-haiku-4-5" });
  for (const model of [null, 1, "invalid", "/id", "provider/", "  /  "]) {
    writeFileSync(configPath, JSON.stringify({ workSummary: { model } }));
    assert.deepEqual(loadModel(configPath), SUMMARY_MODEL);
  }
  writeFileSync(configPath, "broken JSON");
  assert.deepEqual(loadModel(configPath), SUMMARY_MODEL);
} finally { rmSync(temp, { recursive: true, force: true }); }

const thinking = { type: "thinking", thinking: "PRIVATE_THINKING_MUST_NOT_LEAVE_THE_PROCESS" };
const tool = (id: string) => ({ type: "toolCall", id, name: "bash", arguments: { command: "npm test" } });
const assistant = (timestamp: number, content: unknown[], provider?: string, model?: string): Message => ({ role: "assistant", timestamp, content, provider, model });
const thoughtChanges: SavedGroup[] = [];
const thoughtTracker = new WorkGroups((group) => thoughtChanges.push(snapshot(group)));
thoughtTracker.message(assistant(100, [thinking]), false, 200);
thoughtTracker.message(assistant(100, [thinking, { type: "text", text: "I will locate the files." }]), true, 300);
thoughtTracker.message(assistant(400, [{ type: "toolCall", id: "private", name: "think", arguments: { text: thinking.thinking } }]), true, 500);
thoughtTracker.settle(600, false);
assert.equal(thoughtTracker.groups.size, 0, "thinking alone must not create a work summary");
assert.equal(thoughtChanges.length, 0);

const changes: { group: SavedGroup; final: boolean }[] = [];
const tracker = new WorkGroups((group, final) => changes.push({ group: snapshot(group), final }));
tracker.setContext(["User: Fix five tests for the server."]);
tracker.turnStarted(1_000);
tracker.message(assistant(1_100, [thinking, thinking, tool("one")], "openai-codex", "gpt-6.1-sol"), false, 1_200);
tracker.message(assistant(1_100, [thinking, thinking, tool("one")], "openai-codex", "gpt-6.1-sol"), true, 1_300);
tracker.result("one", "bash", [{ type: "text", text: "Five tests pass" }], false);
tracker.turnStarted(2_000);
tracker.message(assistant(2_100, [thinking, tool("two")], "openai-codex", "gpt-6.2-astra"), true, 2_200);
assert.equal(tracker.groups.size, 1, "tool-only model turns stay in the same visible group");
const group = [...tracker.groups.values()][0];
assert.deepEqual(group.memberIds, ["one", "two"], "only tool calls belong to work summaries");
assert.equal(group.startedAt, 1_000);
assert.deepEqual(group.models, [
  { provider: "openai-codex", model: "gpt-6.1-sol" },
  { provider: "openai-codex", model: "gpt-6.2-astra" },
]);
assert.equal(JSON.parse(summaryInput(group)).state, "running");
assert.doesNotMatch(summaryInput(group), /PRIVATE_THINKING/);
assert.match(summaryInput(group), /Fix five tests/);
assert.match(summaryInput(group), /Five tests pass/);
group.summary = "I am fixing five tests for the server. All five pass so far.";
tracker.message(assistant(3_100, [thinking, { type: "text", text: "All five tests pass." }]), false, 3_500);
assert.equal(group.endedAt, 3_500);
assert.equal(group.summary, undefined, "do not retain present-tense text on a finished group");
tracker.message(assistant(3_100, [thinking, { type: "text", text: "All five tests pass. No server changed." }, tool("three")]), true, 3_800);
assert.equal(group.endedAt, 3_500, "the end time does not drift during text streaming");
assert.equal(changes.filter((change) => change.final).length, 1);
assert.equal(JSON.parse(summaryInput(group)).state, "finished");
assert.match(summaryInput(group), /No server changed/);
assert.equal(tracker.groups.size, 2);
const second = [...tracker.groups.values()][1];
assert.equal(second.startedAt, 3_500, "the next group does not include the previous work");
tracker.result("three", "bash", [{ type: "text", text: "Two tests still fail. Missing fixture data." }], true);
tracker.settle(4_500, true);
assert.equal(second.endedAt, 4_500);
assert.equal(JSON.parse(summaryInput(second)).interrupted, true);
assert.match(summaryInput(second), /error.*Two tests still fail/);
assert.match(SUMMARY_PROMPT, /past tense for actions/);
assert.match(SUMMARY_PROMPT, /current results and unresolved problems/);
assert.match(SUMMARY_PROMPT, /Do not use jargon/);
assert.match(SUMMARY_PROMPT, /I located the files needed to answer the question/);
assert.match(SUMMARY_PROMPT, /I read the guide to understand the extension/);
assert.match(SUMMARY_PROMPT, /Do not append generic warnings/);
assert.match(SUMMARY_PROMPT, /Do not explain the product/);
assert.match(SUMMARY_PROMPT, /If state is "running", start with "I am"/);
assert.match(SUMMARY_PROMPT, /Do not summarize facts from file contents/);
assert.match(SUMMARY_PROMPT, /Do not use semicolons/);
const concise = "I located the files needed to answer the question.";
assert.equal(shortSummary([{ type: "text", text: concise }]), concise);
assert.equal(shortSummary([{ type: "text", text: "word ".repeat(80) }]).split(" ").length, 25);
assert.ok(shortSummary("longword ".repeat(80)).length <= SUMMARY_LIMITS.outputChars);
assert.ok(shortSummary("x".repeat(400)).length <= SUMMARY_LIMITS.outputChars);
assert.match(SUMMARY_PROMPT, /does not mean the task succeeded/);
assert.match(SUMMARY_PROMPT, /untrusted data/);
assert.ok(summaryInput(group).length < SUMMARY_LIMITS.inputChars);
assert.equal(savedGroup({ ...snapshot(second), endedAt: -1 }), undefined);
assert.equal(savedGroup({ ...snapshot(second), memberIds: [5] }), undefined);
assert.deepEqual(savedGroup({ ...snapshot(second), summary: "\x1b[31mWorked on five tests.\x1b[0m\nTwo still fail." })?.summary, "Worked on five tests. Two still fail.");
assert.equal(formatDuration(65_000), "1m 5s");
const expectedStart = new Date(1_000);
assert.equal(formatStartTime(1_000), [expectedStart.getHours(), expectedStart.getMinutes(), expectedStart.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":"));
assert.deepEqual(savedGroup({ ...snapshot(second), models: [{ provider: "p", model: "m" }, { provider: 1, model: "bad" }] })?.models, [{ provider: "p", model: "m" }]);
assert.equal(savedGroup({ ...snapshot(second), id: "think:t100:0", memberIds: ["think:t100:0"] }), undefined);
assert.deepEqual(savedGroup({ ...snapshot(second), id: "think:t100:0", memberIds: ["think:t100:0", "three", "think:t200:0"] })?.memberIds, ["three"]);
assert.equal(savedGroup({ ...snapshot(second), id: "think:t100:0", memberIds: ["think:t100:0", "three"] })?.id, "three");

const config = new Config();
const grouping = new RunGrouping(config);
const painter = new Painter({ fg: (_color, text) => text }, config);
grouping.observe("a", "read", "success", false);
grouping.observe("b", "bash", "failure", false);
const finished: SavedGroup = {
  version: 1, id: "a", memberIds: ["a", "b"], startedAt: 1_000, endedAt: 43_000,
  summary: "I worked on fixing five tests for the server. Two still fail because the test data is missing.",
  models: [{ provider: "openai-codex", model: "gpt-6.1-sol" }],
};
grouping.setWork(finished);
assert.equal(grouping.rowFor("a", painter, () => ({ gutter: "", text: "base" })), null);
const line = new CompactLine();
line.setRow(() => grouping.rowFor("b", painter, () => ({ gutter: "", text: "base" })));
const narrow = line.render(32);
assert.match(narrow.join("\n"), /read ×1.*bash ×1/);
assert.match(narrow.map(l => l.trim()).join(" "), /42s · Tool error/);
assert.ok(narrow.length > 2);
assert.ok(narrow.every((part) => visibleWidth(part) <= 32));
assert.equal(visibleWidth(narrow[0]), 32);
const startTime = new Date(1_000);
const expectedTime = [startTime.getHours(), startTime.getMinutes(), startTime.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
assert.ok(narrow[1].startsWith(`${expectedTime}  `));
assert.ok(narrow.join("").replace(/\s/g, "").includes("openai-codex/gpt-6.1-sol"));
const summaryLine = narrow.findIndex((part) => part.includes("I worked on fixing"));
assert.ok(summaryLine >= 0 && narrow.slice(summaryLine + 1).some((part) => part.startsWith("  ")), "summary continuations keep their indent");
const tighter = line.render(24);
assert.ok(tighter.every((part) => visibleWidth(part) <= 24));
const modelLine = tighter.findIndex(part => part.includes("openai-codex/"));
assert.ok(modelLine >= 0 && tighter.slice(modelLine + 1).every(part => part.startsWith("          ")));
assert.ok(tighter.slice(modelLine).join("").replace(/\s/g, "").includes("openai-codex/gpt-6.1-sol"));
assert.ok(narrow.every((part) => !part.includes("▌")), "do not draw a vertical bar");
assert.match(narrow.map((part) => part.trim()).join(" "), /test data is missing/);
const colored = new Painter({ fg: (color, text) => `<${color}>${text}</${color}>` }, config);
const paintedWork = colored.work({ gutter: "", text: "read ×1" }, "1s", concise, 1_000, [{ provider: "openai-codex", model: "gpt-6.1-sol" }]);
assert.match(paintedWork.description ?? "", /^<muted>/);
assert.match(paintedWork.metadata ?? "", /openai-codex\/gpt-6.1-sol.*1s/);
assert.ok(grouping.open("b"));
assert.equal(grouping.rowFor("a", painter, () => ({ gutter: "", text: "read" }))?.header?.text, "▾ Expanded · click to fold");
assert.equal(grouping.rowFor("b", painter, () => ({ gutter: "", text: "bash" }))?.description, finished.summary);
assert.ok(grouping.close("a"));
grouping.retain(["b"]);
assert.equal(grouping.rowFor("b", painter, () => ({ gutter: "", text: "bash" }))?.description, undefined);

// Exercise the public event path without a remote provider or a terminal.
const handlers = new Map<string, Array<(event: any, ctx: ExtensionContext) => void>>();
const appended: { customType: string; data: SavedGroup }[] = [];
const pi = {
  on(name: string, handler: (event: any, ctx: ExtensionContext) => void) {
    handlers.set(name, [...(handlers.get(name) ?? []), handler]);
  },
  appendEntry(customType: string, data: SavedGroup) { appended.push({ customType, data }); },
} as unknown as ExtensionAPI;
let branch: SessionEntry[] = [];
let available = true;
let setupThrows = false;
const warnings: string[] = [];
const requests: Array<{ input: string; signal: AbortSignal; resolve: (response: any) => void; reject: (error: Error) => void }> = [];
const context = {
  hasUI: true, mode: "tui",
  ui: { notify: (text: string) => warnings.push(text) },
  sessionManager: { getBranch: () => branch, buildContextEntries: () => branch },
  modelRegistry: {
    find: () => available ? SUMMARY_MODEL : undefined,
    hasConfiguredAuth: () => true,
    streamSimple: (_model: unknown, input: any, options: any) => {
      if (setupThrows) throw new Error("Provider setup failed");
      assert.equal(options.reasoning, "minimal");
      assert.equal(options.maxRetries, 0);
      assert.equal(options.timeoutMs, 10_000);
      return { result: () => new Promise((resolve, reject) => requests.push({
        input: input.messages[0].content[0].text, signal: options.signal, resolve, reject,
      })) };
    },
  },
} as unknown as ExtensionContext;
const liveGrouping = new RunGrouping(config);
attachWorkSummaries(pi, liveGrouping, () => {});
function emit(name: string, event: any = {}) { for (const handler of handlers.get(name) ?? []) handler(event, context); }
async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
const entry = (message: Message): SessionEntry => ({ type: "message", id: randomId(), parentId: null, timestamp: new Date().toISOString(), message }) as SessionEntry;
function randomId() { return Math.random().toString(36).slice(2); }
const report = (text: string) => ({ stopReason: "stop", content: [{ type: "text", text }] });

const originalDebounce = SUMMARY_LIMITS.debounceMs;
const originalRefresh = SUMMARY_LIMITS.refreshMs;
SUMMARY_LIMITS.debounceMs = 1;
SUMMARY_LIMITS.refreshMs = 0;
emit("session_start");
assert.equal(requests.length, 0, "opening history does not call the summary model");
emit("before_agent_start");
emit("message_update", { message: assistant(9_000, [thinking]) });
emit("message_end", { message: assistant(9_000, [thinking]) });
emit("agent_settled", { aborted: false });
await new Promise((resolve) => setTimeout(resolve, 10));
await flush();
assert.equal(requests.length, 0, "thinking alone must not call the summary model");
assert.equal(appended.length, 0, "thinking alone must not save summary entries");
emit("before_agent_start");
emit("turn_start", { timestamp: Date.now() - 1_000 });
const action = assistant(10_000, [tool("live")], "openai-codex", "gpt-6.1-sol");
emit("message_update", { message: action });
await new Promise((resolve) => setTimeout(resolve, 10));
await flush();
assert.equal(requests.length, 1);
assert.equal(JSON.parse(requests[0].input).state, "running");
const completion = assistant(11_000, [{ type: "text", text: "Five tests now pass." }]);
emit("message_update", { message: completion });
assert.ok(requests[0].signal.aborted);
requests[0].resolve(report("I am fixing five tests."));
await flush();
assert.equal(appended.length, 0, "a late live response must not become a finished summary");
emit("message_end", { message: completion });
await flush();
assert.equal(requests.length, 2);
assert.equal(JSON.parse(requests[1].input).state, "finished");
assert.equal(appended.length, 1, "save elapsed time before the model responds");
requests[1].resolve(report("I fixed five tests for the server. All five now pass."));
await flush();
assert.equal(appended.length, 2);
assert.match(appended[1].data.summary!, /All five now pass/);
assert.deepEqual(appended[1].data.models, [{ provider: "openai-codex", model: "gpt-6.1-sol" }]);

const stored = { type: "custom", id: "saved", customType: "pi-work-summary", data: appended[1].data } as SessionEntry;
branch = [entry(action), entry(completion), stored];
assert.deepEqual(renderOrder(branch), ["live", "prose:t11000:0"]);
emit("session_tree");
assert.equal(requests.length, 2, "restoring saved summaries costs no model calls");
liveGrouping.observe("live", "bash", "success", false);
assert.match(liveGrouping.rowFor("live", painter, () => ({ gutter: "", text: "bash" }))?.description ?? "", /All five now pass/);
branch = [entry(assistant(10_000, [thinking, tool("live")], "openai-codex", "gpt-6.1-sol")), entry(completion), {
  ...stored, data: { ...appended[1].data, models: undefined, id: "think:t10000:0", memberIds: ["think:t10000:0", "live", "think:t11000:0"] },
} as SessionEntry];
emit("session_tree");
liveGrouping.observeThinking({}, 0, true, false, 10_000);
liveGrouping.observe("live", "bash", "success", false);
assert.match(liveGrouping.rowFor("live", painter, () => ({ gutter: "", text: "bash" }))?.description ?? "", /All five now pass/);
assert.match(liveGrouping.rowFor("live", painter, () => ({ gutter: "", text: "bash" }))?.metadata ?? "", /openai-codex\/gpt-6.1-sol/);
assert.equal(liveGrouping.rowFor("think:t10000:0", painter, () => ({ gutter: "", text: "thinking" }))?.description, undefined);
assert.equal(requests.length, 2, "legacy replay does not call the summary model");
branch = [];
emit("session_tree");
liveGrouping.observe("live", "bash", "success", false);
assert.equal(liveGrouping.rowFor("live", painter, () => ({ gutter: "", text: "bash" }))?.description, undefined);

emit("before_agent_start");
emit("message_end", { message: assistant(12_000, [tool("late")]) });
emit("agent_settled", { aborted: true });
await flush();
const stale = requests.at(-1)!;
emit("session_tree");
assert.ok(stale.signal.aborted);
const beforeLate = appended.length;
stale.resolve(report("This result belongs to another branch."));
await flush();
assert.equal(appended.length, beforeLate);

available = false;
emit("before_agent_start");
emit("message_end", { message: assistant(13_000, [tool("unavailable")]) });
emit("agent_settled", { aborted: false });
assert.match(warnings.at(-1)!, /model unavailable/);
assert.ok(appended.at(-1)?.data.endedAt);
available = true;
setupThrows = true;
emit("session_tree");
emit("before_agent_start");
emit("message_end", { message: assistant(14_000, [tool("throw")]) });
emit("agent_settled", { aborted: false });
await flush();
assert.match(warnings.at(-1)!, /Provider setup failed/);
emit("session_shutdown");
SUMMARY_LIMITS.debounceMs = originalDebounce;
SUMMARY_LIMITS.refreshMs = originalRefresh;

// Check the copied renderer against real Pi components and preserve tool ownership.
core.initTheme("dark");
const nativeThinking = new core.AssistantMessageComponent(assistant(20_000, [thinking]) as any, true).render(100);
const nativeExpandedThinking = new core.AssistantMessageComponent(assistant(20_000, [thinking]) as any, false).render(100);
function thinkingCycle() {
  const message = assistant(21_000, [thinking]);
  const component = new core.AssistantMessageComponent(message as any, true);
  component.updateContent(message as any, true);
  const streaming = component.render(100);
  const region = (component as any).contentContainer.children.find((child: any) => typeof child.onMouse === "function");
  assert.ok(region, "native thinking has a mouse control");
  const click = region.handleMouse({ type: "click", button: "left", x: 0, y: 0 });
  const opened = component.render(100);
  component.updateContent(message as any, false);
  return { streaming, click, opened, finished: component.render(100) };
}
const nativeThinkingCycle = thinkingCycle();
const renderedGrouping = new RunGrouping(config);
installBridges({ config, grouping: renderedGrouping });
patchCore(core);
patchCore(core);
assert.equal(config.get("thinkingAsToolCall"), false);
assert.deepEqual(thinkingCycle(), nativeThinkingCycle, "preserve native thinking during streaming and mouse expansion");
assert.deepEqual(new core.AssistantMessageComponent(assistant(20_000, [thinking]) as any, false).render(100), nativeExpandedThinking, "preserve expanded native thinking");
const realAssistant = new core.AssistantMessageComponent(assistant(20_000, [thinking]) as any, true);
const realTool = new core.ToolExecutionComponent("bash", "real-tool", { command: "npm test" }, undefined, undefined, { requestRender() {} } as any, process.cwd());
realTool.updateResult({ content: [{ type: "text", text: "Five tests pass" }], isError: false } as any);
renderedGrouping.setWork({
  version: 1, id: "real-tool", memberIds: ["real-tool"],
  startedAt: 1_000, endedAt: 43_000, summary: "I fixed five tests for the server. All five now pass.",
  models: [{ provider: "openai-codex", model: "gpt-6.1-sol" }],
});
const rendered = [...realAssistant.render(100), ...realTool.render(100)].map(stripTerminalSequences).join("\n");
assert.deepEqual(realAssistant.render(100), nativeThinking, "preserve native thinking rendering");
assert.doesNotMatch(rendered, /think ×|▌/);
assert.match(rendered, /bash npm test/);
assert.match(rendered, /openai-codex\/gpt-6.1-sol · 42s/);
assert.match(rendered, /I fixed five tests for the server/);
assert.ok(rendered.includes(formatStartTime(1_000)));
assert.ok(visibleWidth(stripTerminalSequences(realTool.render(100)[0])) <= 100);
assert.equal((realTool as any).toolDefinition, undefined, "rendering must not register or replace tool definitions");
assert.ok(realTool.render(20).every((part) => visibleWidth(part) <= 20));
assert.doesNotMatch(readFileSync(new URL("./index.ts", import.meta.url), "utf8"), /registerCommand|config-file|saveBasicSettings/);
console.log("pi-work-summary tests passed");
