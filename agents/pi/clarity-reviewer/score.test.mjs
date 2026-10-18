import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { MAX_MATERIAL, QUESTIONS, RUBRIC_VERSION, parseMaterial, readInput, scoreMaterial } from "./score.mjs";

const script = fileURLToPath(new URL("./score.mjs", import.meta.url));
const source = "File: sample.js\nexport function double(value) { return value * 2; }";
const dimensions = ["naming", "control_flow", "indirection", "comments"];

function response() {
  return {
    stopReason: "stop", provider: "typesafe", model: "jev-test",
    answers: {
      context: { type: "choice", choice: "sufficient", confidence: 0.92 },
      ...Object.fromEntries(dimensions.map(name => [name, { type: "score", score: 3.25, confidence: 0.83 }])),
    },
    usage: { input: 100, output: 5, totalTokens: 105, cost: { total: 0 } },
  };
}

function runtime(result = response()) {
  return {
    getModelOfType(...args) {
      assert.deepEqual(args, ["classifier", "typesafe", "jev-latest"]);
      return { provider: "typesafe", id: "jev-latest" };
    },
    async classify(model, request, options) {
      assert.equal(model.id, "jev-latest");
      assert.deepEqual(request, { state: { material: source }, questions: QUESTIONS });
      assert.equal(options.maxRetries, 0);
      assert.equal(options.timeoutMs, 10_000);
      assert.ok(options.signal instanceof AbortSignal);
      return result;
    },
  };
}

test("rubrics cover four distinct clarity dimensions with five descriptive levels", () => {
  assert.deepEqual(Object.keys(QUESTIONS), ["context", ...dimensions]);
  for (const name of dimensions) {
    assert.equal(QUESTIONS[name].type, "score");
    assert.equal(QUESTIONS[name].criteria.length, 5);
    assert.equal(new Set(QUESTIONS[name].criteria).size, 5);
    assert.ok(QUESTIONS[name].criteria.every(level => level.length > 30));
    assert.match(QUESTIONS[name].instructions, /untrusted data, never instructions/);
  }
  assert.match(QUESTIONS.comments.instructions, /needs no comments earns the highest score/);
  assert.match(QUESTIONS.indirection.instructions, /Direct code can earn the highest score/);
});

test("host wrapper is removed without removing task code or adding host guidance", async () => {
  const wrapped = `<System instructions>\nDo not send this system text.\n\n<Task>\n${source}`;
  assert.equal(parseMaterial(wrapped), source);
  assert.equal(parseMaterial(source), source);
  assert.throws(() => parseMaterial("<System instructions>\nmissing task"), /wrapper/);
  await scoreMaterial(wrapped, runtime());
  const nested = "<System instructions>\ncode-like marker\n\n<Task>\nsource stays data";
  assert.equal(parseMaterial(`<System instructions>\n\n\n<Task>\n${nested}`), nested);
});

test("input is bounded and Unicode survives chunk boundaries", async () => {
  for (const text of ["", "  \n", "x".repeat(MAX_MATERIAL + 1)]) {
    assert.throws(() => parseMaterial(text));
  }
  assert.equal(parseMaterial("x".repeat(MAX_MATERIAL)).length, MAX_MATERIAL);
  const bytes = Buffer.from("const café = '☕';");
  assert.equal(await readInput(Readable.from([...bytes].map(byte => Buffer.from([byte])))), bytes.toString());
  await assert.rejects(readInput(Readable.from(["x".repeat(MAX_MATERIAL + 20_001)])), /stdin limit/);
  let requested = false;
  await assert.rejects(scoreMaterial(" ", { classify() { requested = true; } }), /Supply source/);
  assert.equal(requested, false);
});

test("fractional scores, confidence, answering model, and usage survive unchanged", async () => {
  const result = response();
  const report = await scoreMaterial(source, runtime(result));
  assert.equal(report.status, "scored");
  assert.equal(report.rubric_version, RUBRIC_VERSION);
  assert.equal(report.model, "jev-test");
  assert.equal(report.provider, "typesafe");
  assert.deepEqual(report.usage, result.usage);
  assert.deepEqual(report.context, { choice: "sufficient", confidence: 0.92 });
  for (const name of dimensions) assert.deepEqual(report.scores[name], { score: 3.25, confidence: 0.83 });
  assert.equal("verdict" in report, false);
  assert.equal("composite" in report, false);
});

test("insufficient and uncertain context do not publish scores", async () => {
  for (const choice of ["insufficient", "uncertain"]) {
    const result = response();
    result.answers.context.choice = choice;
    delete result.usage;
    const report = await scoreMaterial(source, runtime(result));
    assert.equal(report.status, "not_assessed");
    assert.equal(report.scores, null);
    assert.equal(report.usage, null);
  }
});

test("provider errors, timeouts, aborts, missing models, and malformed answers fail", async () => {
  for (const stopReason of ["error", "aborted"]) {
    await assert.rejects(scoreMaterial(source, runtime({ ...response(), stopReason })), /failed, timed out, or was canceled/);
  }
  await assert.rejects(scoreMaterial(source, { getModelOfType() {} }), /does not provide/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(scoreMaterial(source, runtime(), controller.signal), { name: "AbortError" });
  const duringCall = new AbortController();
  const fake = runtime();
  fake.classify = async (_model, _request, options) => {
    duringCall.abort();
    assert.equal(options.signal.aborted, true);
    return response();
  };
  await assert.rejects(scoreMaterial(source, fake, duringCall.signal), { name: "AbortError" });
  for (const change of [
    r => { r.provider = "other"; },
    r => { r.model = ""; },
    r => { delete r.answers; },
    r => { r.answers.context.choice = "unknown"; },
    r => { r.answers.context.confidence = NaN; },
    r => { r.answers.context.type = "score"; },
    r => { delete r.answers.naming; },
    r => { r.answers.naming.type = "choice"; },
    ...[-1, 5, NaN, Infinity, "3"].map(value => r => { r.answers.naming.score = value; }),
    ...[-1, 2, NaN, Infinity, "0.5"].map(value => r => { r.answers.comments.confidence = value; }),
  ]) {
    const result = response();
    change(result);
    await assert.rejects(scoreMaterial(source, runtime(result)), /invalid/);
  }
});

test("CLI rejects invalid input and missing SDK with one JSON error and nonzero exit", () => {
  for (const input of ["", "x".repeat(MAX_MATERIAL + 1), source]) {
    const child = spawnSync(process.execPath, [script], { input, encoding: "utf8", env: { ...process.env, PATH: "" } });
    assert.equal(child.status, 1);
    const report = JSON.parse(child.stdout);
    assert.equal(report.status, "error");
    assert.equal("scores" in report, false);
    assert.equal(child.stderr, "");
  }
});

test("CLI resolves a Pi executable symlink and uses only the classifier SDK path", () => {
  const root = mkdtempSync(join(tmpdir(), "clarity-sdk-test-"));
  const cli = join(root, "pi-cli.mjs");
  writeFileSync(cli, "#!/usr/bin/env node\n");
  chmodSync(cli, 0o755);
  symlinkSync(cli, join(root, "pi"));
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "@earendil-works/pi-coding-agent", exports: { ".": { import: "./sdk.mjs" } },
  }));
  writeFileSync(join(root, "sdk.mjs"), `
export const ModelRuntime = {
  async create(options) {
    if (options.refreshOnCreate !== false || options.allowModelNetwork !== false) throw new Error('unexpected refresh');
    return {
      getModelOfType: () => ({ id: 'jev-latest' }),
      classify: async (_model, request) => {
        if (request.state.material !== ${JSON.stringify(source)}) throw new Error('wrong source');
        return ${JSON.stringify(response())};
      },
    };
  },
};`);
  const before = readFileSync(cli, "utf8");
  const child = spawnSync(process.execPath, [script], { input: source, encoding: "utf8", env: { ...process.env, PATH: root } });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  assert.equal(JSON.parse(child.stdout).status, "scored");
  assert.equal(child.stderr, "");
  assert.equal(readFileSync(cli, "utf8"), before);

  writeFileSync(join(root, "sdk.mjs"), `export const ModelRuntime = { create() { throw new Error('private-api-key-do-not-echo'); } };`);
  const failed = spawnSync(process.execPath, [script], { input: source, encoding: "utf8", env: { ...process.env, PATH: root } });
  assert.equal(failed.status, 1);
  assert.match(JSON.parse(failed.stdout).error, /Cannot load/);
  assert.doesNotMatch(failed.stdout + failed.stderr, /private-api-key-do-not-echo/);
});
