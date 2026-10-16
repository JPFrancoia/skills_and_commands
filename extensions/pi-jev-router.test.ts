import assert from "node:assert/strict";
import type { ClassifierContext, ModelsClassifierOptions } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ModelRoute,
  ModelRouteRequest,
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
const ctx = {
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
  ["routine", "gpt-6.1-sol"],
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
  model: model("gpt-6.1-sol"),
  thinkingLevel: "low" as const,
  message: { role: "assistant", stopReason: "error" } as NonNullable<ModelRouteRequest["failed"]>["message"],
};
assert.equal((await router.route(request({ reason: "retry", previous, failed }), ctx)).model.id, "gpt-6.1-sol");
assert.equal((await router.route(request({ reason: "direct" }), ctx)).model.id, "gpt-6.1-sol");
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
assert.deepEqual(calls.at(-1)?.context.state, { prompt: "Latest\nrequest" });
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
  assert.equal((await router.route(request(), ctx)).model.id, "gpt-6.1-sol");
}
failure = new Error("Synthetic provider failure");
assert.equal((await router.route(request(), ctx)).model.id, "gpt-6.1-sol");
failure = undefined;
response = choice("simple");

const beforeUnavailable = calls.length;
classifierAvailable = false;
assert.equal((await router.route(request(), ctx)).model.id, "gpt-6.1-sol");
classifierAvailable = true;
unauthenticated.add("jev-latest");
assert.equal((await router.route(request(), ctx)).model.id, "gpt-6.1-sol");
unauthenticated.clear();
assert.equal((await router.route(request({ messages: [] }), ctx)).model.id, "gpt-6.1-sol");
assert.equal(calls.length, beforeUnavailable);

missing.add("gpt-6-luna");
assert.equal((await router.route(request(), ctx)).model.id, "gpt-6.1-sol");
missing.clear();
unauthenticated.add("gpt-6-luna");
assert.equal((await router.route(request(), ctx)).model.id, "gpt-6.1-sol");
unauthenticated.clear();
response = choice("routine");
missing.add("gpt-6.1-sol");
await assert.rejects(async () => router.route(request(), ctx), /requires authenticated/);
missing.clear();
unauthenticated.add("gpt-6.1-sol");
await assert.rejects(async () => router.route(request(), ctx), /requires authenticated/);
unauthenticated.clear();

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

console.log("ok: three levels, sticky calls, retries, rerouting, fallback, bounds, auth, cancellation");
