import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

const require = createRequire(import.meta.url);
const Module = require("node:module") as { _initPaths(): void };
process.env.NODE_PATH = [
  join(homedir(), ".pi", "agent", "npm", "node_modules"),
  join(
    homedir(),
    ".npm-global",
    "lib",
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
    "node_modules",
  ),
  join(homedir(), ".npm-global", "lib", "node_modules"),
  process.env.NODE_PATH,
]
  .filter(Boolean)
  .join(delimiter);
Module._initPaths();

const { default: piRecap, __test__ } = await import("./pi-recap.ts");

const clean = __test__.parseSummary(
  JSON.stringify({
    now: "\u001b[31mRepairing login\u001b[0m",
    why: "Keep users signed in\nwithout errors",
    last: "Inspected the failing request",
  }),
);
assert.deepEqual(clean, {
  version: 1,
  now: "Repairing login",
  why: "Keep users signed in without errors",
  last: "Inspected the failing request",
});
assert.equal(__test__.parseSummary('{"now":"Only one field"}'), null);
assert.deepEqual(__test__.parseModel("anthropic/claude-haiku-4-5"), {
  provider: "anthropic",
  id: "claude-haiku-4-5",
});
assert.equal(__test__.parseModel("invalid"), null);

const configDir = mkdtempSync(join(tmpdir(), "pi-recap-"));
const configPath = join(configDir, "config.json");
try {
  writeFileSync(configPath, JSON.stringify({ model: "openai-codex/gpt-5.5" }));
  assert.deepEqual(__test__.loadModel(configPath), {
    provider: "openai-codex",
    id: "gpt-5.5",
  });
  writeFileSync(configPath, JSON.stringify({ model: "invalid" }));
  assert.deepEqual(__test__.loadModel(configPath), {
    provider: "openai-codex",
    id: "gpt-5.6-luna",
  });
  assert.deepEqual(__test__.loadModel(join(configDir, "missing.json")), {
    provider: "openai-codex",
    id: "gpt-5.6-luna",
  });
} finally {
  rmSync(configDir, { recursive: true, force: true });
}

function sessionEntry(value: Partial<SessionEntry>): SessionEntry {
  return {
    type: "message",
    id: crypto.randomUUID().slice(0, 8),
    parentId: null,
    timestamp: new Date().toISOString(),
    ...value,
  } as SessionEntry;
}

function assistant(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "stop",
    timestamp: Date.now(),
  } as AssistantMessage;
}

async function flushAsyncWork(): Promise<void> {
  for (let step = 0; step < 10; step++) await Promise.resolve();
}

const storedData = {
  version: 1 as const,
  now: "Building a local summary extension",
  why: "Make old conversations clear at a glance",
  last: "Selected milestone updates",
};
const stored = sessionEntry({
  type: "custom",
  customType: "pi-recap",
  data: storedData,
});
assert.deepEqual(__test__.latestStoredSummary([stored]), {
  index: 0,
  summary: storedData,
});
assert.deepEqual(__test__.immediateSummary(storedData, "Add live updates"), {
  version: 1,
  now: "Add live updates",
  why: storedData.why,
  last: storedData.last,
});
const contextEntries = [
  sessionEntry({
    message: {
      role: "user",
      content: "Show useful summaries while the agent works",
      timestamp: Date.now(),
    },
  }),
  sessionEntry({ message: assistant("Added live milestone updates.") }),
];
assert.deepEqual(
  __test__.immediateSummary(undefined, "maybe now?", contextEntries),
  {
    version: 1,
    now: "Show useful summaries while the agent works",
    why: "Show useful summaries while the agent works",
    last: "Added live milestone updates.",
  },
);

const events = new Map<
  string,
  (event: Record<string, unknown>, ctx: ExtensionContext) => void
>();
const appended: Array<{ type: string; data: unknown }> = [];
const pi = {
  on(
    name: string,
    handler: (event: Record<string, unknown>, ctx: ExtensionContext) => void,
  ) {
    events.set(name, handler);
  },
  appendEntry(type: string, data: unknown) {
    appended.push({ type, data });
  },
} as unknown as ExtensionAPI;
piRecap(pi);

let branch: SessionEntry[] = [stored];
const widgets: unknown[] = [];
const requestedModels: string[] = [];
const requests: Array<{
  context: { messages: Array<{ content: Array<{ text: string }> }> };
  reasoningEffort?: string;
  resolve: (message: AssistantMessage) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}> = [];
const ctx = {
  hasUI: true,
  ui: {
    setWidget(_key: string, widget: unknown) {
      widgets.push(widget);
    },
    notify() {},
  },
  sessionManager: {
    getBranch: () => branch,
    buildContextEntries: () => branch,
  },
  modelRegistry: {
    find: (provider: string, id: string) => {
      requestedModels.push(`${provider}/${id}`);
      return { provider, id };
    },
    hasConfiguredAuth: () => true,
    complete: (
      _model: unknown,
      context: { messages: Array<{ content: Array<{ text: string }> }> },
      options: {
        reasoningEffort?: string;
        signal?: AbortSignal;
        timeoutMs?: number;
      },
    ) =>
      new Promise<AssistantMessage>((resolve) =>
        requests.push({ context, resolve, ...options }),
      ),
  },
} as unknown as ExtensionContext;

const fakeTheme = {
  fg: (_name: string, text: string) => text,
  bold: (text: string) => text,
};
function renderLatestWidget(): string[] {
  const widgetFactory = widgets.at(-1) as (
    tui: unknown,
    theme: typeof fakeTheme,
  ) => { render(width: number): string[] };
  return widgetFactory(undefined, fakeTheme)
    .render(120)
    .map((line) => line.trimEnd());
}

events.get("session_start")?.({}, ctx);
assert.equal(requests.length, 0);
assert.deepEqual(renderLatestWidget(), [
  "Now: Building a local summary extension",
  "Why: Make old conversations clear at a glance",
  "Last: Selected milestone updates",
]);

events.get("before_agent_start")?.(
  { prompt: "Show updates while you work" },
  ctx,
);
assert.equal(requests.length, 1);
assert.equal(requestedModels.at(-1), "openai-codex/gpt-5.6-luna");
assert.equal(requests[0].reasoningEffort, "minimal");
assert.equal(requests[0].timeoutMs, 10_000);
assert.deepEqual(renderLatestWidget(), [
  "Now: Show updates while you work",
  "Why: Make old conversations clear at a glance",
  "Last: Selected milestone updates",
]);
assert.match(requests[0].context.messages[0].content[0].text, /just received/);
requests[0].resolve(
  assistant(
    JSON.stringify({
      now: "Preparing live milestone summaries",
      why: "Let the user follow long agent work",
      last: "Selected milestone updates",
    }),
  ),
);
await flushAsyncWork();
assert.equal(appended.length, 0);

const finalMessage = assistant("Implemented live summaries.");
branch = [
  ...branch,
  sessionEntry({
    message: {
      role: "user",
      content: "Show updates while you work",
      timestamp: Date.now(),
    },
  }),
  sessionEntry({ message: finalMessage }),
];
events.get("turn_end")?.({ message: finalMessage, toolResults: [] }, ctx);
assert.equal(requests.length, 2);
assert.match(
  requests[1].context.messages[0].content[0].text,
  /completed the turn/,
);
requests[1].resolve(
  assistant(
    JSON.stringify({
      now: "Live milestone summaries are ready",
      why: "Let the user follow long agent work",
      last: "Implemented immediate and in-progress updates",
    }),
  ),
);
await flushAsyncWork();
assert.equal(appended.length, 0);
assert.deepEqual(renderLatestWidget(), [
  "Now: Live milestone summaries are ready",
  "Why: Let the user follow long agent work",
  "Last: Implemented immediate and in-progress updates",
]);

events.get("agent_settled")?.({}, ctx);
assert.deepEqual(appended, [
  {
    type: "pi-recap",
    data: {
      version: 1,
      now: "Live milestone summaries are ready",
      why: "Let the user follow long agent work",
      last: "Implemented immediate and in-progress updates",
    },
  },
]);

branch = [
  ...branch,
  sessionEntry({
    message: { role: "user", content: "Change it", timestamp: Date.now() },
  }),
];
events.get("before_agent_start")?.({ prompt: "Change it" }, ctx);
assert.equal(requests.length, 3);
events.get("before_agent_start")?.({ prompt: "Replace that request" }, ctx);
assert.equal(requests[2].signal?.aborted, true);
requests[2].resolve(assistant('{"now":"stale","why":"stale","last":"stale"}'));
await flushAsyncWork();
assert.equal(appended.length, 1);

console.log("ok");
