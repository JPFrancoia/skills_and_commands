import assert from "node:assert/strict";
import type { ClassifierContext, ModelsClassifierOptions } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ModelRoute,
  ModelRouteRequest,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import jevRouter from "./pi-jev-router.ts";

let router!: Parameters<ExtensionAPI["registerVirtualModel"]>[0];
jevRouter({ registerVirtualModel: (definition: typeof router) => { router = definition; } } as ExtensionAPI);
assert.equal(router.provider, "jev");
assert.equal(router.id, "auto");

function model(id: string, provider = "openai-codex"): ModelRoute["model"] {
  return { id, provider } as ModelRoute["model"];
}

function request(overrides: Partial<ModelRouteRequest> = {}): ModelRouteRequest {
  return {
    model: model("auto", "jev"),
    reason: "user",
    thinkingLevel: "high",
    messages: [{ role: "user", content: "Implement an ordinary feature", timestamp: 0 }],
    ...overrides,
  };
}

function choice(label: string) {
  return { stopReason: "stop", answers: { complexity: { type: "choice", choice: label } } };
}

let response: unknown = choice("routine");
let failure: Error | undefined;
let classifierAvailable = true;
let onClassify: (() => void) | undefined;
const missing = new Set<string>();
const unauthenticated = new Set<string>();
const calls: Array<{ context: ClassifierContext; options?: ModelsClassifierOptions }> = [];
const usageRecords: Array<Parameters<SessionManager["appendUsage"]>> = [];
const warnings: string[] = [];
const sessionManager = {
  appendUsage: (...args: Parameters<SessionManager["appendUsage"]>) => { usageRecords.push(args); },
};
const ctx = {
  sessionManager,
  ui: { notify: (message: string) => { warnings.push(message); } },
  modelRegistry: {
    find: (_provider: string, id: string) => missing.has(id) ? undefined : model(id),
    findOfType: () => classifierAvailable ? model("jev-latest", "typesafe") : undefined,
    hasConfiguredAuth: (candidate: ModelRoute["model"]) => !unauthenticated.has(candidate.id),
    getProviderAuthStatus: () => ({ configured: !unauthenticated.has("jev-latest") }),
    classify: async (_model: unknown, context: ClassifierContext, options?: ModelsClassifierOptions) => {
      calls.push({ context, options });
      onClassify?.();
      if (failure) throw failure;
      return response;
    },
  },
} as unknown as ExtensionContext;

for (const [level, id] of [
  ["simple", "gpt-6-luna"],
  ["routine", "gpt-5.6-sol"],
  ["very_complex", "gpt-6-astra"],
]) {
  response = choice(level);
  const result = await router.route(request(), ctx);
  assert.equal(result.model.id, id);
  assert.equal(result.thinkingLevel, "high");
}
assert.equal(calls.length, 3);
assert.equal(calls[0].options?.timeoutMs, 5_000);
assert.equal(calls[0].options?.maxRetries, 0);
assert.deepEqual(Object.keys(calls[0].context.questions.complexity.criteria ?? {}), ["simple", "routine", "very_complex"]);

const previous = { model: model("gpt-6-astra"), thinkingLevel: "medium" as const };
const count = calls.length;
for (const reason of ["continuation", "retry", "direct"] as const) {
  const result = await router.route(request({ reason, previous }), ctx);
  assert.equal(result.model.id, "gpt-6-astra");
  assert.equal(result.thinkingLevel, "medium");
}
assert.equal(calls.length, count);

const failed = {
  model: model("gpt-5.6-sol"),
  thinkingLevel: "low" as const,
  message: { role: "assistant", stopReason: "error" } as NonNullable<ModelRouteRequest["failed"]>["message"],
};
assert.equal((await router.route(request({ reason: "retry", previous, failed }), ctx)).model.id, "gpt-5.6-sol");
assert.equal((await router.route(request({ reason: "direct" }), ctx)).model.id, "gpt-5.6-sol");
assert.equal(calls.length, count);

// A successful write must not force a switch to Luna.
assert.equal((await router.route(request({
  reason: "continuation",
  previous,
  messages: [
    ...request().messages,
    { role: "toolResult", toolCallId: "write-1", toolName: "write", content: [], isError: false, timestamp: 0 },
  ],
}), ctx)).model.id, "gpt-6-astra");
response = choice("simple");
assert.equal((await router.route(request({ previous, state: { phase: "implementation", model: "gpt-5.6-luna" } }), ctx)).model.id, "gpt-6-luna");
assert.equal(calls.length, count + 1);

await router.route(request({ messages: [
  { role: "user", content: "Earlier request", timestamp: 0 },
  { role: "user", content: [{ type: "text", text: "Latest" }, { type: "text", text: "request" }], timestamp: 1 },
] }), ctx);
assert.equal(calls.at(-1)?.context.state.prompt, "Latest\nrequest");
assert.match(calls.at(-1)?.context.state.recentActivity as string, /Earlier request/);
await router.route(request({ messages: [{ role: "user", content: "x".repeat(20_000), timestamp: 0 }] }), ctx);
assert.equal((calls.at(-1)?.context.state.prompt as string).length, 16_000);

for (const unusable of [
  { stopReason: "error", answers: {} },
  { stopReason: "aborted", answers: {} },
  { stopReason: "stop", answers: {} },
  { stopReason: "stop", answers: { complexity: { type: "score", score: 2 } } },
  choice("unknown"),
  choice("constructor"),
]) {
  response = unusable;
  assert.equal((await router.route(request(), ctx)).model.id, "gpt-5.6-sol");
}
failure = new Error("Synthetic provider failure");
assert.equal((await router.route(request(), ctx)).model.id, "gpt-5.6-sol");
failure = undefined;
response = choice("simple");

const beforeUnavailable = calls.length;
classifierAvailable = false;
assert.equal((await router.route(request(), ctx)).model.id, "gpt-5.6-sol");
classifierAvailable = true;
unauthenticated.add("jev-latest");
assert.equal((await router.route(request(), ctx)).model.id, "gpt-5.6-sol");
unauthenticated.clear();
assert.equal((await router.route(request({ messages: [] }), ctx)).model.id, "gpt-5.6-sol");
assert.equal(calls.length, beforeUnavailable);

missing.add("gpt-6-luna");
assert.equal((await router.route(request(), ctx)).model.id, "gpt-5.6-sol");
missing.clear();
unauthenticated.add("gpt-6-luna");
assert.equal((await router.route(request(), ctx)).model.id, "gpt-5.6-sol");
unauthenticated.clear();
response = choice("routine");
missing.add("gpt-5.6-sol");
await assert.rejects(async () => router.route(request(), ctx), /requires authenticated/);
missing.clear();
unauthenticated.add("gpt-5.6-sol");
await assert.rejects(async () => router.route(request(), ctx), /requires authenticated/);
unauthenticated.clear();

const stalledMessages: ModelRouteRequest["messages"] = [
  ...request().messages,
  { role: "assistant", content: [{ type: "text", text: "The same fix failed again. I am retrying the same approach without a diagnosis." }], timestamp: 1 } as ModelRouteRequest["messages"][number],
  ...[1, 2, 3].map((index) => ({
    role: "toolResult" as const, toolCallId: `test-${index}`, toolName: "bash",
    content: [{ type: "text" as const, text: "FAIL: the same test still fails after another attempted fix" }],
    isError: true, timestamp: index + 1,
  })),
];
response = choice("very_complex");
assert.equal((await router.route(request({
  reason: "continuation", previous: { model: model("gpt-5.6-sol"), thinkingLevel: "high" }, messages: stalledMessages,
}), ctx)).model.id, "gpt-6-astra");

assert.equal(calls.at(-1)?.context.state.escalationOnly, true);
assert.equal(calls.at(-1)?.context.state.currentModel, "gpt-5.6-sol");
assert.match(calls.at(-1)?.context.state.recentActivity as string, /same test still fails/);
assert.match(calls.at(-1)?.context.questions.complexity.instructions ?? "", /untrusted evidence/);
const complexity = calls.at(-1)!.context.questions.complexity;
assert.match(complexity.instructions ?? "", /Prefer routine \(Sol\) when the required capability is unclear/);
assert.match(complexity.instructions ?? "", /Ordinary debugging, recurring errors, or user corrections alone do not justify Astra/);
assert.doesNotMatch(complexity.instructions ?? "", /Do not wait for the user|Choose routine only when/);
assert.match(complexity.criteria?.routine ?? "", /ordinary debugging and corrections/);
assert.match(complexity.criteria?.very_complex ?? "", /persistent failure after meaningfully different approaches/);
assert.match(complexity.criteria?.very_complex ?? "", /clearly exceed routine work/);

const sol = { model: model("gpt-5.6-sol"), thinkingLevel: "medium" as const };
response = choice("routine");
let ongoing = await router.route(request(), ctx);
const beforePeriodic = calls.length;
for (let step = 1; step <= 4; step++) {
  ongoing = await router.route(request({ reason: "continuation", previous: sol, state: ongoing.state }), ctx);
  assert.equal(ongoing.model.id, sol.model.id);
}
assert.equal(calls.length, beforePeriodic);
response = choice("very_complex");
ongoing = await router.route(request({ reason: "continuation", previous: sol, state: ongoing.state }), ctx);
assert.equal(ongoing.model.id, "gpt-6-astra");
assert.equal(calls.length, beforePeriodic + 1);
assert.equal(calls.at(-1)?.context.state.escalationOnly, true);
const beforeStickyAstra = calls.length;
for (let step = 0; step < 8; step++) {
  ongoing = await router.route(request({ reason: "continuation", previous: ongoing, state: ongoing.state }), ctx);
  assert.equal(ongoing.model.id, "gpt-6-astra");
}
assert.equal(calls.length, beforeStickyAstra);
response = choice("simple");
ongoing = await router.route(request({ previous: ongoing, state: ongoing.state }), ctx);
assert.equal(ongoing.model.id, "gpt-6-luna");
assert.equal(calls.at(-1)?.context.state.escalationOnly, false);
assert.equal(calls.at(-1)?.context.state.elapsedMinutes, 0);

const dueState = { continuations: 4, startedAt: Date.now(), checkedAt: Date.now(), toolErrors: 0 };
for (const tier of ["simple", "routine"]) {
  response = choice(tier);
  const retained = await router.route(request({ reason: "continuation", previous: sol, state: dueState }), ctx);
  assert.equal(retained.model.id, sol.model.id);
  assert.equal(retained.thinkingLevel, "medium");
}
for (const tier of ["simple", "routine"]) {
  response = choice(tier);
  const retained = await router.route(request({
    reason: "continuation", previous: { model: model("gpt-6-luna"), thinkingLevel: "low" }, state: dueState,
  }), ctx);
  assert.equal(retained.model.id, "gpt-6-luna");
  assert.equal(retained.thinkingLevel, "low");
}
failure = new Error("Synthetic escalation classifier failure");
assert.equal((await router.route(request({ reason: "continuation", previous: sol, state: dueState }), ctx)).model.id, sol.model.id);
failure = undefined;
response = choice("unknown");
assert.equal((await router.route(request({ reason: "continuation", previous: sol, state: dueState }), ctx)).model.id, sol.model.id);
classifierAvailable = false;
assert.equal((await router.route(request({ reason: "continuation", previous: sol, state: dueState }), ctx)).model.id, sol.model.id);
classifierAvailable = true;

response = choice("routine");
const beforeErrorCheck = calls.length;
ongoing = await router.route(request({ reason: "continuation", previous: sol, messages: stalledMessages }), ctx);
assert.equal(calls.length, beforeErrorCheck + 1);
ongoing = await router.route(request({ reason: "continuation", previous: sol, messages: stalledMessages, state: ongoing.state }), ctx);
assert.equal(calls.length, beforeErrorCheck + 1);
const newErrors = [...stalledMessages, ...stalledMessages.slice(-3)];
await router.route(request({ reason: "continuation", previous: sol, messages: newErrors, state: ongoing.state }), ctx);
assert.equal(calls.length, beforeErrorCheck + 2);
const beforeSingleError = calls.length;
await router.route(request({ reason: "continuation", previous: sol, messages: stalledMessages.slice(0, 3) }), ctx);
assert.equal(calls.length, beforeSingleError);

const beforeTimedCheck = calls.length;
const tenMinutesAgo = Date.now() - 600_001;
response = choice("very_complex");
assert.equal((await router.route(request({
  reason: "continuation", previous: sol,
  state: { continuations: 0, startedAt: tenMinutesAgo, checkedAt: tenMinutesAgo, toolErrors: 0 },
}), ctx)).model.id, "gpt-6-astra");
assert.equal(calls.length, beforeTimedCheck + 1);
assert.equal(calls.at(-1)?.context.state.elapsedMinutes, 10);
for (const reason of ["direct", "retry"] as const) {
  assert.equal((await router.route(request({ reason, previous: sol, state: dueState, messages: stalledMessages }), ctx)).model.id, sol.model.id);
}
assert.equal(calls.length, beforeTimedCheck + 1);

missing.add("gpt-6-astra");
assert.equal((await router.route(request({ reason: "continuation", previous: sol, state: dueState }), ctx)).model.id, sol.model.id);
missing.clear();
unauthenticated.add("gpt-6-astra");
assert.equal((await router.route(request({ reason: "continuation", previous: sol, state: dueState }), ctx)).model.id, sol.model.id);
unauthenticated.clear();

const boundedHistory: ModelRouteRequest["messages"] = [
  { role: "system", content: "PRIVATE_SYSTEM", timestamp: 0 },
  ...Array.from({ length: 20 }, (_, index) => ({ role: "user" as const, content: `user-${index}:` + "x".repeat(2_000), timestamp: index })),
  { role: "assistant", content: [
    { type: "thinking", thinking: "PRIVATE_THINKING" },
    { type: "toolCall", id: "call", name: "bash", arguments: { secret: "PRIVATE_ARGUMENT" } },
    { type: "text", text: "visible progress" },
  ], timestamp: 21 } as ModelRouteRequest["messages"][number],
  { role: "toolResult", toolCallId: "call", toolName: "bash", content: [{ type: "text", text: "visible result" }],
    details: { secret: "PRIVATE_DETAILS" }, isError: false, timestamp: 22 },
];
await router.route(request({ messages: boundedHistory }), ctx);
const activity = calls.at(-1)?.context.state.recentActivity as string;
assert.ok(activity.length <= 12_000);
assert.doesNotMatch(activity, /PRIVATE_|user-0:/);
assert.match(activity, /visible progress/);
assert.match(activity, /tool bash \(result\): visible result/);
response = choice("simple");

const aborted = new AbortController();
aborted.abort();
const beforeAbort = calls.length;
await assert.rejects(async () => router.route(request({ signal: aborted.signal }), ctx), { name: "AbortError" });
assert.equal(calls.length, beforeAbort);
const midRequest = new AbortController();
onClassify = () => midRequest.abort();
await assert.rejects(async () => router.route(request({ signal: midRequest.signal }), ctx), { name: "AbortError" });
assert.equal(calls.at(-1)?.options?.signal, midRequest.signal);
onClassify = undefined;

assert.equal(usageRecords.length, 0);
const usage = {
  input: 120,
  output: 8,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 128,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const withUsage = (result = choice("simple")) => ({
  ...result,
  provider: "typesafe",
  model: "jev-1.14.0",
  usage,
});
response = withUsage();
assert.equal((await router.route(request(), ctx)).model.id, "gpt-6-luna");
assert.equal(usageRecords.length, 1);
assert.deepEqual(usageRecords[0], ["classifier", "typesafe", "jev-1.14.0", usage]);
assert.equal(usageRecords[0][3], usage);
for (const reason of ["continuation", "retry", "direct"] as const) {
  await router.route(request({ reason, previous }), ctx);
}
assert.equal(usageRecords.length, 1);
await router.route(request(), ctx);
assert.equal(usageRecords.length, 2);
response = { ...withUsage(), stopReason: "error", answers: {} };
assert.equal((await router.route(request(), ctx)).model.id, "gpt-5.6-sol");
assert.equal(usageRecords.length, 3);
response = choice("simple");
await router.route(request(), ctx);
assert.equal(usageRecords.length, 3);
failure = new Error("Synthetic provider failure without usage");
await router.route(request(), ctx);
failure = undefined;
assert.equal(usageRecords.length, 3);

const canceledWithUsage = new AbortController();
response = withUsage();
onClassify = () => canceledWithUsage.abort();
await assert.rejects(async () => router.route(request({ signal: canceledWithUsage.signal }), ctx), { name: "AbortError" });
onClassify = undefined;
assert.equal(usageRecords.length, 4);

const unavailableRecorder = {
  ...ctx,
  sessionManager: {},
} as unknown as ExtensionContext;
assert.equal((await router.route(request(), unavailableRecorder)).model.id, "gpt-6-luna");
assert.equal(usageRecords.length, 4);
assert.equal(warnings.length, 1);
assert.match(warnings[0], /usage.*appendUsage/i);

const brokenRecorder = {
  ...ctx,
  sessionManager: { appendUsage: () => { throw new Error("Synthetic usage persistence failure"); } },
} as unknown as ExtensionContext;
await assert.rejects(async () => router.route(request(), brokenRecorder), /usage persistence failure/);
assert.equal(warnings.length, 1);

const beforeEscalationUsage = usageRecords.length;
response = withUsage(choice("very_complex"));
assert.equal((await router.route(request({ reason: "continuation", previous: sol, state: dueState }), ctx)).model.id, "gpt-6-astra");
assert.equal(usageRecords.length, beforeEscalationUsage + 1);
const canceledEscalation = new AbortController();
onClassify = () => canceledEscalation.abort();
await assert.rejects(async () => router.route(request({
  reason: "continuation", previous: sol, state: dueState, signal: canceledEscalation.signal,
}), ctx), { name: "AbortError" });
onClassify = undefined;
assert.equal(usageRecords.length, beforeEscalationUsage + 2);

console.log("ok: three levels, escalation, cadence, history bounds, sticky calls, retries, rerouting, fallback, auth, cancellation, usage accounting");
