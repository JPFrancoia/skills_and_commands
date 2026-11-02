import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
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

const tempRoot = mkdtempSync(join(tmpdir(), "pi-dream-"));
const dreamHome = join(tempRoot, "dream-home");
const memoryRoot = join(tempRoot, "memory");
process.env.PI_DREAM_HOME = dreamHome;
process.env.PI_DREAM_MEMORY_ROOT = memoryRoot;

const { default: piDream, __test__: dreamTest } = await import("./index.ts");
const { default: workerExtension, __test__: workerTest } = await import(
  "./worker-extension.ts"
);
const { runJob } = await import("./runner.mjs");

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
  }).trim();
}

function messageEntry(
  id: string,
  role: "system" | "user" | "assistant" | "toolResult",
  content: string,
): SessionEntry {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: "2026-11-02T12:00:00.000Z",
    message: {
      role,
      content,
      timestamp: Date.parse("2026-11-02T12:00:00.000Z"),
    },
  } as SessionEntry;
}

try {
  assert.equal(dreamTest.parseBatchCount("", 10, 25), 10);
  assert.equal(dreamTest.parseBatchCount("3", 10, 25), 3);
  assert.equal(dreamTest.parseBatchCount("999", 10, 25), 25);
  assert.throws(() => dreamTest.parseBatchCount("none", 10, 25), /number/);

  const branch = [
    messageEntry("sys-1", "system", "Private system text"),
    messageEntry(
      "user-1",
      "user",
      "Use short replies. Authorization: Bearer secret-value",
    ),
    messageEntry("assistant-1", "assistant", "I will use short replies."),
    messageEntry("tool-1", "toolResult", "Result with sk-test-secret"),
    {
      type: "custom",
      id: "custom-1",
      parentId: "tool-1",
      timestamp: "2026-11-02T12:00:01.000Z",
      customType: "private-state",
      data: { value: "do not export" },
    } as SessionEntry,
  ];
  const transcript = dreamTest.buildTranscript({
    sessionId: "session-1",
    cwd: "/tmp/project",
    created: "2026-11-02T12:00:00.000Z",
    entries: branch,
  });
  assert.match(transcript, /entry user-1/);
  assert.match(transcript, /Use short replies/);
  assert.match(transcript, /\[REDACTED\]/);
  assert.doesNotMatch(transcript, /Private system text/);
  assert.doesNotMatch(transcript, /do not export/);
  assert.doesNotMatch(transcript, /secret-value|sk-test-secret/);

  mkdirSync(join(memoryRoot, "global"), { recursive: true });
  writeFileSync(
    join(memoryRoot, "global", "preferences.md"),
    "---\ndescription: Stable response preferences.\n---\n\n# Preferences\n\nUse direct answers.\n",
  );
  writeFileSync(join(memoryRoot, "global", "invalid.md"), "# Missing description\n");
  const index = dreamTest.buildMemoryIndex(memoryRoot, 20, 4_000);
  assert.match(index, /global\/preferences\.md/);
  assert.match(index, /Stable response preferences/);
  assert.doesNotMatch(index, /Use direct answers/);
  assert.doesNotMatch(index, /invalid\.md/);

  assert.equal(
    workerTest.resolveMemoryPath(memoryRoot, "global/preferences.md"),
    join(memoryRoot, "global", "preferences.md"),
  );
  assert.throws(
    () => workerTest.resolveMemoryPath(memoryRoot, "../outside.md"),
    /outside the memory store/,
  );
  assert.throws(
    () => workerTest.resolveMemoryPath(memoryRoot, ".dream/state.md"),
    /hidden path/,
  );
  assert.throws(
    () => workerTest.validateMarkdown("# No front matter\n"),
    /description/,
  );

  const jobDir = join(dreamHome, "jobs", "job-1");
  mkdirSync(jobDir, { recursive: true });
  const evidenceTranscript = [
    "# Pi session evidence",
    "",
    "## entry user-1 | user",
    "Use short replies.",
  ].join("\n");
  const editContext = {
    memoryRoot,
    jobDir,
    jobId: "job-1",
    sessionId: "session-1",
    transcript: evidenceTranscript,
    now: () => "2026-11-02T12:30:00.000Z",
  };
  const created = await workerTest.applyMemoryEdit(editContext, {
    action: "write",
    path: "global/answers.md",
    expectedHash: "missing",
    content:
      "---\ndescription: Stable answer style.\n---\n\n# Answer style\n\nUse short replies.\n",
    reason: "Keep the explicit response preference.",
    evidence: [{ entryId: "user-1", quote: "Use short replies." }],
  });
  assert.equal(created.path, "global/answers.md");
  assert.equal(created.oldHash, "missing");
  assert.notEqual(created.newHash, "missing");
  assert.match(readFileSync(join(jobDir, "writes.jsonl"), "utf8"), /session-1/);
  assert.match(readFileSync(join(jobDir, "writes.jsonl"), "utf8"), /user-1/);

  await assert.rejects(
    workerTest.applyMemoryEdit(editContext, {
      action: "write",
      path: "global/answers.md",
      expectedHash: "stale-hash",
      content:
        "---\ndescription: Stable answer style.\n---\n\n# Answer style\n\nUse direct replies.\n",
      reason: "Change the preference.",
      evidence: [{ entryId: "user-1", quote: "Use short replies." }],
    }),
    /hash changed/,
  );
  await assert.rejects(
    workerTest.applyMemoryEdit(editContext, {
      action: "write",
      path: "global/answers.md",
      expectedHash: created.newHash,
      content:
        "---\ndescription: Stable answer style.\n---\n\n# Answer style\n\nUse direct replies.\n",
      reason: "Use unsupported evidence.",
      evidence: [{ entryId: "user-1", quote: "A quote that is not present." }],
    }),
    /evidence quote/,
  );

  const outside = join(tempRoot, "outside");
  mkdirSync(outside, { recursive: true });
  symlinkSync(outside, join(memoryRoot, "escape"), "dir");
  await assert.rejects(
    workerTest.applyMemoryEdit(editContext, {
      action: "write",
      path: "escape/file.md",
      expectedHash: "missing",
      content:
        "---\ndescription: Invalid escaped file.\n---\n\n# Escaped\n",
      reason: "Test the boundary.",
      evidence: [{ entryId: "user-1", quote: "Use short replies." }],
    }),
    /symlink/,
  );

  const sourceHash = workerTest.sha256File(
    join(memoryRoot, "global", "answers.md"),
  );
  const moved = await workerTest.applyMemoryEdit(editContext, {
    action: "move",
    path: "global/answers.md",
    expectedHash: sourceHash,
    destination: "global/style.md",
    expectedDestinationHash: "missing",
    reason: "Use a clearer file name.",
    evidence: [{ entryId: "user-1", quote: "Use short replies." }],
  });
  assert.equal(moved.path, "global/style.md");
  assert.equal(existsSync(join(memoryRoot, "global", "answers.md")), false);
  assert.equal(existsSync(join(memoryRoot, "global", "style.md")), true);

  await workerTest.applyMemoryEdit(editContext, {
    action: "delete",
    path: "global/style.md",
    expectedHash: moved.newHash,
    reason: "Remove a duplicate file.",
    evidence: [{ entryId: "user-1", quote: "Use short replies." }],
  });
  assert.equal(existsSync(join(memoryRoot, "global", "style.md")), false);

  const liveRoot = join(tempRoot, "live-memory");
  const candidateRoot = join(tempRoot, "candidate-memory");
  dreamTest.initializeMemoryStore(liveRoot);
  mkdirSync(join(liveRoot, "global"), { recursive: true });
  const baseContent =
    "---\ndescription: Base memory.\n---\n\n# Base\n\nOriginal.\n";
  writeFileSync(join(liveRoot, "global", "base.md"), baseContent);
  git(liveRoot, "add", ".");
  git(
    liveRoot,
    "-c",
    "user.name=Pi Dream",
    "-c",
    "user.email=pi-dream@local",
    "commit",
    "-m",
    "Add base memory",
  );
  const manifest = dreamTest.createCandidateClone(liveRoot, candidateRoot);
  writeFileSync(
    join(candidateRoot, "global", "base.md"),
    "---\ndescription: Base memory.\n---\n\n# Base\n\nImproved.\n",
  );
  git(candidateRoot, "add", ".");
  git(
    candidateRoot,
    "-c",
    "user.name=Pi Dream",
    "-c",
    "user.email=pi-dream@local",
    "commit",
    "-m",
    "Improve base memory",
  );
  assert.match(readFileSync(join(liveRoot, "global", "base.md"), "utf8"), /Original/);
  assert.deepEqual(dreamTest.verifyLiveBase(liveRoot, manifest), []);
  writeFileSync(join(liveRoot, "global", "base.md"), `${baseContent}\nLocal edit.\n`);
  assert.match(dreamTest.verifyLiveBase(liveRoot, manifest).join("\n"), /global\/base\.md/);
  writeFileSync(join(liveRoot, "global", "base.md"), baseContent);
  dreamTest.applyCandidate(liveRoot, candidateRoot, manifest);
  assert.match(readFileSync(join(liveRoot, "global", "base.md"), "utf8"), /Improved/);

  const processedPath = join(dreamHome, "state.json");
  dreamTest.markSessionsProcessed(processedPath, ["session-1", "session-2"]);
  dreamTest.markSessionsProcessed(processedPath, ["session-2", "session-3"]);
  assert.deepEqual(dreamTest.loadProcessedSessions(processedPath), [
    "session-1",
    "session-2",
    "session-3",
  ]);

  const commands = new Map<string, { handler: Function }>();
  const tools = new Map<string, { execute: Function }>();
  const events = new Map<string, Function>();
  const pi = {
    registerCommand(name: string, options: { handler: Function }) {
      commands.set(name, options);
    },
    registerTool(tool: { name: string; execute: Function }) {
      tools.set(tool.name, tool);
    },
    on(name: string, handler: Function) {
      events.set(name, handler);
    },
    getSettings() {
      return { dream: { model: "openai-codex/gpt-test" } };
    },
  } as unknown as ExtensionAPI;
  piDream(pi);
  assert.deepEqual([...commands.keys()].sort(), [
    "dream",
    "dream-apply",
    "dream-discard",
    "dream-review",
    "dream-status",
  ]);
  assert.deepEqual([...tools.keys()], ["dream_memory"]);

  const promptEvent = { systemPromptOptions: { sections: {} as Record<string, string> } };
  events.get("before_agent_start")?.(promptEvent, {} as ExtensionContext);
  assert.match(promptEvent.systemPromptOptions.sections["dream-memory"], /global\/preferences\.md/);
  assert.doesNotMatch(promptEvent.systemPromptOptions.sections["dream-memory"], /Use direct answers/);

  const workerTools: string[] = [];
  workerExtension({
    registerTool(tool: { name: string }) {
      workerTools.push(tool.name);
    },
  } as unknown as ExtensionAPI);
  assert.deepEqual(workerTools.sort(), [
    "dream_memory_edit",
    "dream_memory_list",
    "dream_memory_read",
  ]);

  const runnerLive = join(tempRoot, "runner-live");
  const runnerCandidate = join(tempRoot, "runner-candidate");
  const runnerJob = join(tempRoot, "runner-job");
  const runnerTranscripts = join(runnerJob, "transcripts");
  dreamTest.initializeMemoryStore(runnerLive);
  const runnerBase = dreamTest.createCandidateClone(runnerLive, runnerCandidate);
  mkdirSync(runnerTranscripts, { recursive: true });
  const transcriptPaths = ["runner-session-1", "runner-session-2"].map(
    (sessionId) => {
      const path = join(runnerTranscripts, `${sessionId}.md`);
      writeFileSync(path, `## entry user-1 | user\nRemember ${sessionId}.\n`);
      return { sessionId, path, createdAt: "2026-11-02T12:00:00.000Z" };
    },
  );
  const fakePi = join(tempRoot, "fake-pi.sh");
  writeFileSync(
    fakePi,
    [
      "#!/bin/sh",
      'printf "%s\\n" "$PI_DREAM_SESSION_ID" >> "$PI_DREAM_JOB_DIR/fake-calls"',
      'mkdir -p "$PI_DREAM_MEMORY_ROOT/global"',
      'cat > "$PI_DREAM_MEMORY_ROOT/global/$PI_DREAM_SESSION_ID.md" <<EOF',
      "---",
      'description: Memory from $PI_DREAM_SESSION_ID.',
      "---",
      "",
      '# $PI_DREAM_SESSION_ID',
      "EOF",
    ].join("\n"),
  );
  chmodSync(fakePi, 0o755);
  const runnerManifestPath = join(runnerJob, "manifest.json");
  writeFileSync(
    runnerManifestPath,
    JSON.stringify({
      version: 1,
      id: "runner-job",
      cwd: tempRoot,
      createdAt: "2026-11-02T12:00:00.000Z",
      model: "test/model",
      memoryRoot: runnerLive,
      candidateRoot: runnerCandidate,
      jobDir: runnerJob,
      workerExtension: join(tempRoot, "worker-extension.ts"),
      sessionIds: transcriptPaths.map((item) => item.sessionId),
      transcripts: transcriptPaths,
      base: runnerBase,
    }),
  );
  writeFileSync(
    join(runnerJob, "state.json"),
    JSON.stringify({
      version: 1,
      id: "runner-job",
      status: "queued",
      completed: 0,
      total: 2,
      updatedAt: "2026-11-02T12:00:00.000Z",
    }),
  );
  assert.deepEqual(runJob(runnerManifestPath, { piBin: fakePi }), {
    status: "ready",
  });
  assert.deepEqual(
    readFileSync(join(runnerJob, "fake-calls"), "utf8").trim().split("\n"),
    ["runner-session-1", "runner-session-2"],
  );
  const runnerState = JSON.parse(
    readFileSync(join(runnerJob, "state.json"), "utf8"),
  );
  assert.equal(runnerState.status, "ready");
  assert.equal(runnerState.completed, 2);
  assert.equal(
    Number(git(runnerCandidate, "rev-list", "--count", `${runnerBase.baseCommit}..HEAD`)),
    2,
  );

  console.log("pi-dream tests passed");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
