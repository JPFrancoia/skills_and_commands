import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  ["whitespace without progress", 'emit("toolcall_start",{toolName:"dream_finding",contentIndex:0});setInterval(()=>emit("toolcall_delta",{contentIndex:0,delta:" "}),10);', /tool call.*timed out/i],
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

test("useful argument output can exceed the inactivity interval", async (t) => {
  const f = fixture(t, `if(phase==="extract"){${recordFinding}} else {
    const emit=(type,fields)=>console.log(JSON.stringify({type:"message_update",assistantMessageEvent:{type,...fields}}));
    emit("toolcall_start",{toolName:"dream_memory_edit",contentIndex:0});
    for(let i=0;i<8;i++){
      await new Promise(resolve=>setTimeout(resolve,50));
      emit("toolcall_delta",{contentIndex:0,delta:"useful output"});
    }
    emit("toolcall_end",{contentIndex:0});
  }`);
  assert.equal((await f.run()).status, "ready");
  assert.equal(f.calls().filter(c=>c.phase==="consolidate").length, 1);
});

test("argument progress stops protecting a stalled call", async (t) => {
  const f = fixture(t, `const emit=(type,fields)=>console.log(JSON.stringify({type:"message_update",assistantMessageEvent:{type,...fields}}));
    emit("toolcall_start",{toolName:"dream_finding",contentIndex:0});
    for(let i=0;i<5;i++){
      await new Promise(resolve=>setTimeout(resolve,50));
      emit("toolcall_delta",{contentIndex:0,delta:"useful output"});
    }
    setInterval(()=>{},1000); await new Promise(()=>{});
  `);
  const result = await f.run();
  assert.equal(result.status, "failed");
  assert.match(result.error, /tool call.*timed out/i);
  assert.equal(f.calls().length, 3);
});

test("the total limit still stops endless useful output", async (t) => {
  const f = fixture(t, `const emit=(type,fields)=>console.log(JSON.stringify({type:"message_update",assistantMessageEvent:{type,...fields}}));
    emit("toolcall_start",{toolName:"dream_finding",contentIndex:0});
    setInterval(()=>emit("toolcall_delta",{contentIndex:0,delta:"x"}),10);
    await new Promise(()=>{});
  `);
  const result = await f.run({ timeoutMs: 500 });
  assert.equal(result.status, "failed");
  assert.match(result.error, /Worker timed out after 500ms/);
  assert.equal(f.calls().length, 3);
});

test("route worker and orchestrator models and keep legacy defaults", async (t) => {
  for (const orchestratorModel of [undefined, "other/orchestrator"]) {
    const f = fixture(t, `if(phase==="extract"){${recordFinding}}
      const args=process.argv.slice(2);
      appendFileSync(join(job,"models"),JSON.stringify({phase,model:args[args.indexOf("--model")+1]})+"\\n");
    `);
    writeJson(f.manifestPath, { ...JSON.parse(readFileSync(f.manifestPath)), orchestratorModel });
    assert.equal((await f.run()).status, "ready");
    assert.deepEqual(readFileSync(join(f.jobDir, "models"), "utf8").trim().split("\n").map(JSON.parse), [
      { phase: "extract", model: "test/model" },
      { phase: "consolidate", model: orchestratorModel ?? "test/model" },
    ]);
  }
});

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

test("retry publication with recorded models and reject a changed orchestrator", async (t) => {
  for (const orchestratorModel of [undefined, "other/orchestrator"]) {
    const f = fixture(t, `if(phase==="extract"){${recordFinding}}`);
    const manifest = { ...JSON.parse(readFileSync(f.manifestPath)), orchestratorModel };
    writeJson(f.manifestPath, manifest);
    const lock = join(f.memoryRoot, ".git", "refs", "heads", "dream", "job.lock");
    mkdirSync(join(f.memoryRoot, ".git", "refs", "heads", "dream"), { recursive: true });
    writeFileSync(lock, "Do not delete an active lock.");
    assert.equal((await f.run()).status, "failed");
    rmSync(lock);
    const before = f.calls().length;
    writeJson(f.manifestPath, { ...manifest, orchestratorModel: "changed/model" });
    const changed = await f.run({ resume: true });
    assert.equal(changed.status, "failed");
    assert.match(changed.error, /Consolidation completion changed or is invalid/);
    assert.equal(f.calls().length, before);
    writeJson(f.manifestPath, manifest);
    assert.equal((await f.run({ resume: true })).status, "ready");
    assert.equal(f.calls().length, before);
  }
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

test("reject a quote attributed to the wrong entry in new and legacy jobs", async (t) => {
  const { sourcesHash } = await import("./sources.mjs");
  for (const structured of [false, true]) {
    const bad = { ...finding, evidence: [{ entryId: "user-1", quote: "Use long replies." }] };
    const f = fixture(t, `writeFileSync(process.env.PI_DREAM_FINDINGS,JSON.stringify(${JSON.stringify(bad)})+"\\n");`);
    writeFileSync(f.transcripts[0].path, "## entry user-1 | user\nUse short replies.\n## entry assistant-1 | assistant\nUse long replies.\n");
    if (structured) {
      const text = JSON.stringify({ version: 1, sessions: [{ sessionId: "one", entries: [
        { entryId: "user-1", role: "user", text: "Use short replies." },
        { entryId: "assistant-1", role: "assistant", text: "Use long replies." },
      ] }] });
      writeFileSync(join(f.jobDir, "sources.json"), text);
      writeJson(f.manifestPath, { ...JSON.parse(readFileSync(f.manifestPath)), sourcesHash: sourcesHash(text) });
    }
    const result = await f.run();
    assert.equal(result.status, "failed");
    assert.match(result.error, /not in that entry/);
    assert.equal(existsSync(join(f.worker(), "result.json")), false);
    assert.equal(git(f.memoryRoot, ["rev-parse", "HEAD"]), f.base.baseCommit);
  }
});

test("reject source changes before resume launches another worker", async (t) => {
  const { sourcesHash } = await import("./sources.mjs");
  const f = fixture(t, 'console.error("Model not found");process.exit(1);');
  const text = JSON.stringify({ version: 1, sessions: [{ sessionId: "one", entries: [
    { entryId: "user-1", role: "user", text: "Use short replies." },
  ] }] });
  writeFileSync(join(f.jobDir, "sources.json"), text);
  writeJson(f.manifestPath, { ...JSON.parse(readFileSync(f.manifestPath)), sourcesHash: sourcesHash(text) });
  assert.equal((await f.run()).status, "failed");
  writeFileSync(join(f.jobDir, "sources.json"), "{}");
  const result = await f.run({ resume: true });
  assert.equal(result.status, "failed");
  assert.match(result.error, /source snapshot changed/);
  assert.equal(f.calls().length, 1);
});

test("targeted checks run without findings and reject unselected changes", async (t) => {
  for (const outside of [false, true]) {
    const f = fixture(t, outside
      ? 'writeFileSync(join(process.env.PI_DREAM_MEMORY_ROOT,"outside.md"),"---\\ndescription: Outside.\\n---\\n\\nNo.\\n");'
      : "", []);
    writeJson(f.manifestPath, { ...JSON.parse(readFileSync(f.manifestPath)), reviewPaths: ["README.md"] });
    const result = await f.run();
    assert.deepEqual(f.calls().map((call) => call.phase), ["consolidate"]);
    assert.equal(result.status, "failed");
    if (outside) assert.match(result.error, /unselected file/);
    else assert.match(result.error, /review.*incomplete/i);
    assert.equal(git(f.memoryRoot, ["rev-parse", "HEAD"]), f.base.baseCommit);
  }
});

test("consolidation cannot replace its input findings", async (t) => {
  const f = fixture(t, `if(phase==="extract"){${recordFinding}} else {writeFileSync(process.env.PI_DREAM_FINDINGS,"");}`);
  const result = await f.run();
  assert.equal(result.status, "failed");
  assert.match(result.error, /changed its input findings/);
});

test("a successful stop without review coverage cannot publish a check", async (t) => {
  const f = fixture(t, "", []);
  writeJson(f.manifestPath, { ...JSON.parse(readFileSync(f.manifestPath)), reviewPaths: ["README.md"] });
  const result = await f.run();
  assert.equal(result.status, "failed");
  assert.match(result.error, /review.*incomplete/i);
  assert.equal(existsSync(join(f.memoryRoot, ".git", "refs", "heads", "dream", "job")), false);
  assert.equal(git(f.memoryRoot, ["rev-parse", "HEAD"]), f.base.baseCommit);
});

const completeReview = `
  const {recordOutcomes,finishReview} = await import(${JSON.stringify(new URL("./review.mjs", import.meta.url).href)});
  const review=JSON.parse(readFileSync(process.env.PI_DREAM_REVIEW_FILE));
  review.readPaths=review.files.map(file=>file.path);
  recordOutcomes(review,review.files.flatMap(file=>file.passages.map(p=>({id:p.id,outcome:"unsupported",
    reason:"No source sessions exist in this isolated fixture.",findingIds:[],searchIds:[]}))),[],{sessions:[]});
  finishReview(review,"Compared the whole selection. Preserved all unsupported content.",process.env.PI_DREAM_MEMORY_ROOT);
  writeFileSync(process.env.PI_DREAM_REVIEW_FILE,JSON.stringify(review));
`;

test("resume continues an incomplete combined check without changing accepted memory", async (t) => {
  const f = fixture(t, `if(existsSync(join(job,"recover"))){${completeReview}}`, []);
  writeJson(f.manifestPath, { ...JSON.parse(readFileSync(f.manifestPath)), reviewPaths: ["README.md"] });
  assert.equal((await f.run()).status, "failed");
  assert.equal(existsSync(join(f.jobDir, "workers", "consolidate", "result.json")), false);
  assert.match(readFileSync(join(f.jobDir, "report.md"), "utf8"), /unchecked/);
  writeFileSync(join(f.jobDir, "recover"), "");
  assert.equal((await f.run({ resume: true })).status, "ready");
  assert.deepEqual(f.calls().map((call) => call.phase), ["consolidate", "consolidate"]);
  assert.equal(git(f.memoryRoot, ["diff", "--name-only", "master..dream/job"]), "");
  assert.equal(git(f.memoryRoot, ["rev-parse", "HEAD"]), f.base.baseCommit);
});

test("publication retries bind review coverage and reject legacy completion without coverage", async (t) => {
  const f = fixture(t, completeReview, []);
  writeJson(f.manifestPath, { ...JSON.parse(readFileSync(f.manifestPath)), reviewPaths: ["README.md"] });
  const lock = join(f.memoryRoot, ".git", "refs", "heads", "dream", "job.lock");
  mkdirSync(join(f.memoryRoot, ".git", "refs", "heads", "dream"), { recursive: true });
  writeFileSync(lock, "Active test lock.");
  assert.equal((await f.run()).status, "failed");
  const resultPath = join(f.jobDir, "workers", "consolidate", "result.json");
  const completion = JSON.parse(readFileSync(resultPath));
  const original = readFileSync(completion.reviewPath, "utf8");
  rmSync(lock);
  writeFileSync(completion.reviewPath, original + " ");
  let result = await f.run({ resume: true });
  assert.equal(result.status, "failed");
  assert.match(result.error, /review completion record changed/);
  assert.equal(f.calls().length, 1);
  assert.equal(existsSync(join(f.memoryRoot, ".git", "refs", "heads", "dream", "job")), false);
  writeFileSync(completion.reviewPath, original);
  const { reviewPath, reviewHash, ...legacy } = completion;
  writeJson(resultPath, legacy);
  result = await f.run({ resume: true });
  assert.equal(result.status, "failed");
  assert.match(result.error, /no review coverage record/);
  assert.equal(f.calls().length, 1);
  writeJson(resultPath, completion);
  assert.equal((await f.run({ resume: true })).status, "ready");
  assert.equal(f.calls().length, 1);
  assert.equal(JSON.parse(readFileSync(join(f.jobDir, "review-progress.json"))).complete, true);
});

test("resume retains outcomes from a failed combined attempt", async (t) => {
  const f = fixture(t, `const r=JSON.parse(readFileSync(process.env.PI_DREAM_REVIEW_FILE));
    if(!existsSync(join(job,"recover"))){
      r.readPaths=["README.md"];
      r.outcomes.p1={id:"p1",outcome:"unsupported",reason:"Saved work before interruption.",findingIds:[],searchIds:[]};
      writeFileSync(process.env.PI_DREAM_REVIEW_FILE,JSON.stringify(r));
      console.error("Interrupted after saved work.");process.exit(1);
    }
    if(r.outcomes.p1?.reason!=="Saved work before interruption.")throw new Error("Saved review work was lost.");
    ${completeReview}`, []);
  writeJson(f.manifestPath, { ...JSON.parse(readFileSync(f.manifestPath)), reviewPaths: ["README.md"] });
  assert.equal((await f.run()).status, "failed");
  writeFileSync(join(f.jobDir, "recover"), "");
  const result = await f.run({ resume: true });
  assert.equal(result.status, "ready", result.error);
  assert.equal(git(f.memoryRoot, ["rev-parse", "HEAD"]), f.base.baseCommit);
});


const savePartialReview = `
  const {recordSearch,recordSourceRead,recordOutcomes,finishReview} = await import(${JSON.stringify(new URL("./review.mjs", import.meta.url).href)});
  const {readSource,searchSources,sourcesHash} = await import(${JSON.stringify(new URL("./sources.mjs", import.meta.url).href)});
  const review=JSON.parse(readFileSync(process.env.PI_DREAM_REVIEW_FILE));
  const sources=JSON.parse(readFileSync(process.env.PI_DREAM_SOURCES));
  if(!existsSync(join(job,"recover"))) {
    const finding={...${JSON.stringify(finding)},id:"f1"};
    writeFileSync(process.env.PI_DREAM_FINDINGS,JSON.stringify(finding)+"\\n");
    review.readPaths=["README.md"];
    const query={query:"short replies"};
    recordSearch(review,query,searchSources(sources,query));
    recordSourceRead(review,readSource(sources,{sessionId:"one",entryId:"user-1"}));
    recordOutcomes(review,[{id:"p1",outcome:"corrected",reason:"Saved correction.",findingIds:["f1"],searchIds:["q1"]}],[finding],sources);
    const path=join(process.env.PI_DREAM_MEMORY_ROOT,"README.md");
    const oldHash=sourcesHash(readFileSync(path));
    writeFileSync(path,"---\\ndescription: Test memory.\\n---\\n\\nUse short replies.\\n");
    const record={version:2,jobId:"job",action:"write",path:"README.md",oldHash,newHash:sourcesHash(readFileSync(path)),
      reason:"Source-backed correction.",findingIds:["f1"],evidence:finding.evidence.map(e=>({sessionId:"one",...e}))};
    writeFileSync(join(process.env.PI_DREAM_JOB_DIR,"writes.jsonl"),JSON.stringify(record)+"\\n");
    writeFileSync(process.env.PI_DREAM_REVIEW_FILE,JSON.stringify(review));
    setInterval(()=>{},1000); await new Promise(()=>{});
  } else {
    if(review.outcomes.p1?.reason!=="Saved correction." || review.reads.length!==1 || review.searches.length!==1) throw new Error("Lost saved review.");
    const findings=readFileSync(process.env.PI_DREAM_FINDINGS,"utf8").trim().split("\\n").map(JSON.parse);
    if(findings.length!==1 || findings[0].id!=="f1") throw new Error("Lost saved findings.");
    if(!readFileSync(join(process.env.PI_DREAM_MEMORY_ROOT,"README.md"),"utf8").includes("Use short replies.")) throw new Error("Lost candidate edit.");
    finishReview(review,"Compared all selected files using the saved evidence and corrected candidate.",process.env.PI_DREAM_MEMORY_ROOT);
    writeFileSync(process.env.PI_DREAM_REVIEW_FILE,JSON.stringify(review));
  }
`;

function partialFixture(t) {
  const f = fixture(t, savePartialReview, []);
  writeJson(join(f.jobDir, "sources.json"), { version: 1, sessions: [{ sessionId: "one", entries: [
    { entryId: "user-1", role: "user", text: "Use short replies." },
  ] }] });
  const text = readFileSync(join(f.jobDir, "sources.json"));
  // The production runner also binds this snapshot before its first model call.
  const manifest = { ...JSON.parse(readFileSync(f.manifestPath)), reviewPaths: ["README.md"],
    sourcesHash: createHash("sha256").update(text).digest("hex") };
  writeJson(f.manifestPath, manifest);
  return f;
}

function attemptPath(f) {
  const dir = join(f.jobDir, "workers", "consolidate");
  return join(dir, readdirSync(dir).find((name) => name.startsWith("attempt-")));
}

test("timeout recovery retains findings, outcomes, receipts, edits, and the original base", async (t) => {
  const f = partialFixture(t);
  const result = await f.run({ timeoutMs: 300 });
  assert.equal(result.status, "failed");
  assert.match(result.error, /timed out/);
  const attempt = attemptPath(f);
  const before = Object.fromEntries(["review.json", "findings.jsonl", "writes.jsonl", "worker.log"]
    .map((name) => [name, readFileSync(join(attempt, name), "utf8")]));
  assert.equal(existsSync(join(attempt, "checkpoint.json")), true);
  assert.match(readFileSync(join(f.jobDir, "report.md"), "utf8"), /Saved work remains/);
  writeFileSync(join(f.memoryRoot, "new.md"), "---\ndescription: New accepted memory.\n---\nNew fact.\n");
  git(f.memoryRoot, ["add", "."]);
  git(f.memoryRoot, ["-c", "user.name=Test", "-c", "user.email=test@local", "commit", "-qm", "New accepted memory"]);
  const master = git(f.memoryRoot, ["rev-parse", "HEAD"]);
  writeFileSync(join(f.jobDir, "recover"), "");
  const resumed = await f.run({ resume: true });
  assert.equal(resumed.status, "ready", resumed.error);
  assert.equal(JSON.parse(readFileSync(f.manifestPath)).base.baseCommit, f.base.baseCommit);
  assert.equal(git(f.memoryRoot, ["rev-parse", "HEAD"]), master);
  assert.match(git(f.memoryRoot, ["show", "dream/job:README.md"]), /Use short replies/);
  assert.equal(readFileSync(join(f.jobDir, "writes.jsonl"), "utf8"), before["writes.jsonl"]);
  for (const [name, text] of Object.entries(before)) assert.equal(readFileSync(join(attempt, name), "utf8"), text);
});

test("old attempts without input records or checkpoints recover through validation", async (t) => {
  const f = partialFixture(t);
  assert.equal((await f.run({ timeoutMs: 300 })).status, "failed");
  for (const name of ["input.json", "checkpoint.json"]) rmSync(join(attemptPath(f), name));
  const writesPath = join(attemptPath(f), "writes.jsonl");
  const write = JSON.parse(readFileSync(writesPath, "utf8").trim());
  writeFileSync(writesPath, JSON.stringify({ ...write, path: "@README.md" }) + "\n");
  writeFileSync(join(f.jobDir, "recover"), "");
  const result = await f.run({ resume: true });
  assert.equal(result.status, "ready", result.error);
});

test("changed saved checkpoints stop resume before a worker starts", async (t) => {
  for (const name of ["review.json", "findings.jsonl", "writes.jsonl", "candidate/README.md", "input.json"]) {
    const f = partialFixture(t);
    await f.run({ timeoutMs: 300 });
    const path = join(attemptPath(f), name);
    if (name === "input.json") writeJson(path, { version: 1, inputHash: "changed" });
    else writeFileSync(path, readFileSync(path, "utf8") + " ");
    const calls = f.calls().length;
    const result = await f.run({ resume: true });
    assert.equal(result.status, "failed");
    assert.match(result.error, /saved review.*changed/);
    assert.equal(f.calls().length, calls);
  }
});

test("legacy partial recovery rejects invalid evidence, receipts, edits, and paths", async (t) => {
  for (const corrupt of ["outcome", "search", "read", "finding", "edit", "candidate", "symlink", "original", "selection"]) {
    const f = partialFixture(t);
    await f.run({ timeoutMs: 300 });
    const attempt = attemptPath(f);
    for (const name of ["input.json", "checkpoint.json"]) rmSync(join(attempt, name));
    const reviewPath = join(attempt, "review.json");
    const review = JSON.parse(readFileSync(reviewPath));
    if (corrupt === "outcome") review.outcomes.p1.findingIds = ["invented"];
    if (corrupt === "search") review.searches[0].pages[0].matches = [];
    if (corrupt === "read") review.reads[0].end = 999;
    writeJson(reviewPath, review);
    if (corrupt === "finding") writeFileSync(join(attempt, "findings.jsonl"), JSON.stringify({ ...finding, id: "f1", evidence: [{entryId:"user-1",quote:"invented"}] }) + "\n");
    if (corrupt === "edit") writeFileSync(join(attempt, "writes.jsonl"), "");
    if (corrupt === "candidate") writeFileSync(join(attempt, "candidate", "README.md"), "changed");
    if (corrupt === "symlink") { rmSync(reviewPath); symlinkSync(join(f.jobDir,"sources.json"), reviewPath); }
    if (corrupt === "original") writeFileSync(join(f.candidateRoot, "README.md"), "changed");
    if (corrupt === "selection") writeJson(f.manifestPath, { ...JSON.parse(readFileSync(f.manifestPath)), reviewPaths: [] });
    const calls = f.calls().length;
    const result = await f.run({ resume: true });
    assert.equal(result.status, "failed", corrupt);
    assert.equal(f.calls().length, calls, corrupt);
    assert.equal(git(f.memoryRoot, ["rev-parse", "HEAD"]), f.base.baseCommit);
  }
});


for (const [bytes, expected] of [[20_000, "ready"], [66_000, "failed"]]) {
  test(`finding batches keep a bounded argument limit at ${bytes} bytes`, async (t) => {
    const f = fixture(t, `
      if(phase==="extract"){${recordFinding}} else {
        const emit=(type,fields)=>console.log(JSON.stringify({type:"message_update",assistantMessageEvent:{type,...fields}}));
        emit("toolcall_start",{toolName:"dream_finding_batch",contentIndex:0});
        emit("toolcall_delta",{contentIndex:0,delta:"x".repeat(${bytes})});
        emit("toolcall_end",{contentIndex:0});
      }
    `);
    const result = await f.run();
    assert.equal(result.status, expected);
    if (expected === "failed") assert.match(result.error, /65536-byte size limit/);
  });
}


test("partial recovery preserves search closures and rejects invalid closure metadata", async (t) => {
  for (const corrupt of [false, true]) {
    const f = partialFixture(t);
    const sourcesPath = join(f.jobDir, "sources.json");
    const data = JSON.parse(readFileSync(sourcesPath));
    data.sessions[0].entries.push(...Array.from({ length: 21 }, (_, index) => ({
      entryId: `explore-${index}`, role: "user", text: "exploratory topic",
    })));
    writeJson(sourcesPath, data);
    writeJson(f.manifestPath, { ...JSON.parse(readFileSync(f.manifestPath)),
      sourcesHash: createHash("sha256").update(readFileSync(sourcesPath)).digest("hex") });
    let worker = readFileSync(f.piBin, "utf8");
    worker = worker.replace("const {recordSearch,recordSourceRead,recordOutcomes,finishReview}",
      "const {recordSearch,recordSourceRead,recordOutcomes,finishReview,closeSearches}");
    worker = worker.replace('const query={query:"short replies"};',
      'const unused={query:"exploratory"}; const unusedId=recordSearch(review,unused,searchSources(sources,unused)); closeSearches(review,[{id:unusedId,reason:"Unused exploration."}]); const query={query:"short replies"};');
    worker = worker.replace('searchIds:["q1"]', 'searchIds:["q2"]');
    worker = worker.replace('review.searches.length!==1', 'review.searches.length!==2 || review.searches[0].closedReason!=="Unused exploration."');
    writeFileSync(f.piBin, worker);
    assert.equal((await f.run({ timeoutMs: 300 })).status, "failed");
    const attempt = attemptPath(f);
    const before = readFileSync(join(attempt, "review.json"), "utf8");
    const calls = f.calls().length;
    if (corrupt) {
      rmSync(join(attempt, "checkpoint.json"));
      const review = JSON.parse(before);
      review.searches[0].closedReason = " ";
      writeJson(join(attempt, "review.json"), review);
    }
    writeFileSync(join(f.jobDir, "recover"), "");
    const result = await f.run({ resume: true });
    assert.equal(result.status, corrupt ? "failed" : "ready", result.error);
    if (corrupt) {
      assert.match(result.error, /search closure.*explanation/);
      assert.equal(f.calls().length, calls);
    } else {
      assert.equal(readFileSync(join(attempt, "review.json"), "utf8"), before);
      const review = JSON.parse(readFileSync(join(f.jobDir, "review.json")));
      assert.equal(review.searches[0].closedReason, "Unused exploration.");
      assert.equal(review.outcomes.p1.reason, "Saved correction.");
      assert.match(readFileSync(join(f.jobDir, "report.md"), "utf8"), /Unused exploration/);
    }
    assert.equal(git(f.memoryRoot, ["rev-parse", "HEAD"]), f.base.baseCommit);
  }
});
