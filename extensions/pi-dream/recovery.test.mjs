import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runJob } from "./runner.mjs";
import { createSnapshot, git, writeJson } from "./store.mjs";

const success = 'console.log(JSON.stringify({type:"agent_end",messages:[{role:"assistant",stopReason:"stop",content:[]}]}));';
const options = { timeoutMs: 5_000, retryDelayMs: 1, killGraceMs: 25, toolCallTimeoutMs: 200 };

function fixture(t, body, sessions = ["one"]) {
  const root = mkdtempSync(join(tmpdir(), "dream-recovery-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const memoryRoot = join(root, "memory");
  mkdirSync(memoryRoot);
  execFileSync("git", ["init", "-qb", "master", memoryRoot]);
  writeFileSync(join(memoryRoot, "README.md"), "---\ndescription: Test memory.\n---\n\nBase.\n");
  git(memoryRoot, ["add", "."]);
  git(memoryRoot, ["-c", "user.name=Test", "-c", "user.email=test@local", "commit", "-qm", "Base"]);
  const jobDir = join(root, "job");
  const candidateRoot = join(jobDir, "candidate");
  const base = createSnapshot(memoryRoot, candidateRoot);
  const transcripts = sessions.map((sessionId) => {
    const path = join(jobDir, `${sessionId}.md`);
    writeFileSync(path, "## entry user-1 | user\nUse short replies.\n");
    return { sessionId, path };
  });
  const manifest = { version: 2, id: "job", cwd: root, model: "test/model", concurrency: 1,
    memoryRoot, candidateRoot, jobDir, base, transcripts, sessionIds: sessions, workerExtension: "unused.ts" };
  const manifestPath = join(jobDir, "manifest.json");
  writeJson(manifestPath, manifest);
  writeJson(join(jobDir, "state.json"), { id: "job", status: "queued", completed: 0, total: sessions.length });
  const piBin = join(root, "worker.mjs");
  writeFileSync(piBin, `#!/usr/bin/env node\nimport {readFileSync,writeFileSync,appendFileSync,existsSync} from "node:fs";\nimport {join} from "node:path";\nreadFileSync(0);\nconst job=process.env.PI_DREAM_PARENT_JOB_DIR;\nconst phase=process.env.PI_DREAM_PHASE;\nconst id=process.env.PI_DREAM_SESSION_ID;\nappendFileSync(join(job,"calls"),JSON.stringify({phase,id,pid:process.pid})+"\\n");\n${body}\n${success}\n`);
  chmodSync(piBin, 0o755);
  return { ...manifest, manifestPath, piBin,
    run: (extra = {}) => runJob(manifestPath, { ...options, piBin, ...extra }),
    state: () => JSON.parse(readFileSync(join(jobDir, "state.json"), "utf8")),
    calls: () => readFileSync(join(jobDir, "calls"), "utf8").trim().split("\n").map(JSON.parse),
    worker: (id = "one", index = 0) => join(jobDir, "workers", `${String(index).padStart(3, "0")}-${id}`),
  };
}

const finding = { sessionId: "one", kind: "preference", subject: "test replies", statement: "Use short replies.",
  evidence: [{ entryId: "user-1", quote: "Use short replies." }] };
const recordFinding = `writeFileSync(process.env.PI_DREAM_FINDINGS,JSON.stringify(${JSON.stringify(finding)})+"\\n");`;

for (const [name, body, expected] of [
  ["whitespace", 'emit("toolcall_start",{toolName:"dream_finding",contentIndex:0}); emit("toolcall_delta",{contentIndex:0,delta:" ".repeat(5000)}); emit("toolcall_delta",{contentIndex:0,delta:" ".repeat(5000)});', /whitespace/],
  ["oversized call", 'emit("toolcall_start",{toolName:"dream_finding",contentIndex:0}); emit("toolcall_delta",{contentIndex:0,delta:"x".repeat(20000)});', /size limit/],
  ["unfinished call", 'emit("toolcall_start",{toolName:"dream_finding",contentIndex:0});', /tool call.*timed out/i],
  ["active but unfinished call", 'emit("toolcall_start",{toolName:"dream_finding",contentIndex:0});setInterval(()=>emit("toolcall_delta",{contentIndex:0,delta:"x"}),10);', /tool call.*timed out/i],
]) {
  test(`stop ${name} and retry only twice`, async (t) => {
    const f = fixture(t, `const emit=(type,fields)=>console.log(JSON.stringify({type:"message_update",assistantMessageEvent:{type,...fields}}));\n${body}\nprocess.on("SIGTERM",()=>{}); setInterval(()=>{},1000); await new Promise(()=>{});`);
    const result = await f.run();
    assert.equal(result.status, "failed");
    assert.match(result.error, expected);
    assert.equal(f.calls().length, 3);
    for (const { pid } of f.calls()) {
      assert.throws(() => process.kill(pid, 0), (error) => error.code === "ESRCH");
    }
    assert.equal(existsSync(join(f.worker(), "result.json")), false);
  });
}

test("keep only successful attempt findings", async (t) => {
  const f = fixture(t, `if(phase==="extract") { ${recordFinding}
    const flag=join(job,"retry-once"); if(!existsSync(flag)){writeFileSync(flag,"");console.error("503 Service Unavailable");process.exit(1);}
  }`);
  assert.equal((await f.run()).status, "ready");
  const lines = readFileSync(join(f.jobDir, "findings.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(f.calls().filter((c) => c.phase === "extract").length, 2);
  assert.equal(readdirSync(f.worker()).filter((p) => p.startsWith("attempt-")).length, 2);
  assert.equal(git(f.memoryRoot, ["rev-parse", "HEAD"]), f.base.baseCommit);
});

test("resume skips successful empty sessions and keeps the original base", async (t) => {
  const f = fixture(t, 'if(id==="two" && !existsSync(join(job,"recover"))){console.error("Model not found");process.exit(1);}', ["one", "two"]);
  assert.equal((await f.run()).status, "failed");
  assert.equal(f.state().completed, 1);
  writeFileSync(join(f.jobDir, "recover"), "");
  assert.equal((await f.run({ resume: true })).status, "ready");
  assert.equal(f.calls().filter((c) => c.id === "one").length, 1);
  assert.equal(f.calls().filter((c) => c.id === "two").length, 2);
  const before = f.calls().length;
  assert.equal((await f.run({ resume: true })).status, "ready");
  assert.equal(f.calls().length, before);
  assert.equal(git(f.memoryRoot, ["rev-parse", "HEAD"]), f.base.baseCommit);
});

test("reject changed completed transcripts and corrupt findings", async (t) => {
  for (const corrupt of ["transcript", "findings", "record"]) {
    const f = fixture(t, 'if(id==="two"){console.error("Model not found");process.exit(1);}', ["one", "two"]);
    assert.equal((await f.run()).status, "failed");
    if (corrupt === "transcript") writeFileSync(f.transcripts[0].path, "Changed evidence.");
    if (corrupt === "findings") writeFileSync(join(f.worker(), "findings.jsonl"), "{}\n");
    if (corrupt === "record") writeFileSync(join(f.worker(), "result.json"), "broken");
    const calls = f.calls().length;
    const result = await f.run({ resume: true });
    assert.equal(result.status, "failed");
    assert.match(result.error, /completion|changed|findings|JSON/i);
    assert.equal(f.calls().length, calls);
  }
});

test("recover legacy successful sessions, including zero findings", async (t) => {
  const f = fixture(t, "", ["one", "two"]);
  mkdirSync(f.worker(), { recursive: true });
  writeFileSync(join(f.worker(), "worker.log"), JSON.stringify({type:"agent_end",messages:[{role:"assistant",stopReason:"stop"}]})+"\n");
  writeFileSync(join(f.jobDir, "worker.log"), `\n## one\nstatus=completed\nlog=${join(f.worker(), "worker.log")}\nerror_log=${join(f.worker(), "worker.error.log")}\n`);
  writeJson(join(f.jobDir, "state.json"), { id: "job", status: "failed", completed: 1, total: 2 });
  assert.equal((await f.run({ resume: true })).status, "ready");
  assert.deepEqual(f.calls().map((c) => c.id), ["two"]);
  assert.equal(existsSync(join(f.worker(), "result.json")), true);
});

test("reject invalid findings and missing or failed final responses", async (t) => {
  for (const body of [
    'writeFileSync(process.env.PI_DREAM_FINDINGS,"{}\\n");',
    'process.exit(0);',
    'console.log(JSON.stringify({type:"agent_end",messages:[{role:"assistant",stopReason:"error",errorMessage:"401 Unauthorized"}]})); process.exit(0);',
  ]) {
    const f = fixture(t, body);
    assert.equal((await f.run()).status, "failed");
    assert.equal(existsSync(join(f.worker(), "result.json")), false);
    assert.equal(existsSync(join(f.memoryRoot, ".git", "refs", "heads", "dream", "job")), false);
  }
});

test("isolate partial consolidation and resume without extraction", async (t) => {
  const f = fixture(t, `if(phase==="extract"){${recordFinding}} else {
    writeFileSync(join(process.env.PI_DREAM_MEMORY_ROOT,"proposal.md"),"---\\ndescription: Proposal.\\n---\\n\\nComplete.\\n");
    writeFileSync(join(process.env.PI_DREAM_JOB_DIR,"writes.jsonl"),"{\\"action\\":\\"write\\"}\\n");
    if(!existsSync(join(job,"recover"))){console.error("Model not found");process.exit(1);}
  }`);
  assert.equal((await f.run()).status, "failed");
  assert.equal(f.state().phase, "consolidate");
  assert.equal(existsSync(join(f.candidateRoot, "proposal.md")), false);
  assert.equal(existsSync(join(f.jobDir, "writes.jsonl")), false);
  writeFileSync(join(f.jobDir, "recover"), "");
  assert.equal((await f.run({ resume: true })).status, "ready");
  assert.equal(f.calls().filter((c) => c.phase === "extract").length, 1);
  assert.equal(f.calls().filter((c) => c.phase === "consolidate").length, 2);
  assert.match(git(f.memoryRoot, ["show", "dream/job:proposal.md"]), /Complete/);
  assert.equal(readFileSync(join(f.jobDir, "writes.jsonl"), "utf8").trim().split("\n").length, 1);
});

test("retry publication without repeating successful consolidation", async (t) => {
  const f = fixture(t, `if(phase==="extract"){${recordFinding}}`);
  const lock = join(f.memoryRoot, ".git", "refs", "heads", "dream", "job.lock");
  mkdirSync(join(f.memoryRoot, ".git", "refs", "heads", "dream"), { recursive: true });
  writeFileSync(lock, "Do not delete an active lock.");
  assert.equal((await f.run()).status, "failed");
  rmSync(lock);
  const before = f.calls().length;
  assert.equal((await f.run({ resume: true })).status, "ready");
  assert.equal(f.calls().length, before);
});

test("reject concurrent resume and unsafe legacy consolidation", async (t) => {
  const f = fixture(t, "");
  mkdirSync(join(f.jobDir, ".runner-lock"));
  await assert.rejects(f.run({ resume: true, lockTimeoutMs: 5 }), /Lock timed out|active/i);
  assert.equal(existsSync(join(f.jobDir, ".runner-lock")), true);
  rmSync(join(f.jobDir, ".runner-lock"), { recursive: true });
  mkdirSync(join(f.jobDir, "workers", "consolidate"), { recursive: true });
  writeFileSync(join(f.jobDir, "workers", "consolidate", "worker.log"), "Partial legacy edits.");
  writeJson(join(f.jobDir, "state.json"), { id: "job", status: "failed", phase: "consolidate" });
  const result = await f.run({ resume: true });
  assert.equal(result.status, "failed");
  assert.match(result.error, /legacy consolidation/i);
  assert.equal(existsSync(join(f.jobDir, "calls")), false);
});

test("recover a successful attempt after interrupted promotion", async (t) => {
  const f = fixture(t, 'if(id==="two"){console.error("Model not found");process.exit(1);}', ["one", "two"]);
  assert.equal((await f.run()).status, "failed");
  rmSync(join(f.worker(), "result.json"));
  writeFileSync(join(f.worker(), "findings.jsonl"), "Uncommitted partial promotion.");
  assert.equal((await f.run({ resume: true })).status, "failed");
  assert.equal(f.calls().filter((c) => c.id === "one").length, 1);
  assert.equal(readFileSync(join(f.worker(), "findings.jsonl"), "utf8"), "");
  assert.equal(existsSync(join(f.worker(), "result.json")), true);
});

test("a later failed final response replaces earlier success", async (t) => {
  const f = fixture(t, `${success}
    console.log(JSON.stringify({type:"agent_end",messages:[{role:"assistant",stopReason:"error",errorMessage:"401 Unauthorized"}]}));process.exit(0);`);
  const result = await f.run();
  assert.equal(result.status, "failed");
  assert.match(result.error, /401 Unauthorized/);
  assert.equal(f.calls().length, 1);
});

test("missing worker executable fails once and releases the runner lock", async (t) => {
  const f = fixture(t, "");
  const result = await f.run({ piBin: join(f.jobDir, "missing-pi") });
  assert.equal(result.status, "failed");
  assert.match(result.error, /ENOENT/);
  assert.equal(existsSync(join(f.jobDir, ".runner-lock")), false);
  assert.equal(readdirSync(f.worker()).filter((name) => name.startsWith("attempt-")).length, 1);
});
