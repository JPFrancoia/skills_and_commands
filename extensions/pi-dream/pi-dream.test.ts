import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
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
import { delimiter, join, relative, resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
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
const { withLock } = await import("./store.mjs");

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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
  assert.equal(dreamTest.parseBatchCount("", 10, 100), 10);
  assert.equal(dreamTest.parseBatchCount("3", 10, 100), 3);
  assert.equal(dreamTest.parseBatchCount("100", 10, 100), 100);
  assert.equal(dreamTest.parseBatchCount("999", 10, 100), 100);
  assert.throws(() => dreamTest.parseBatchCount("none", 10, 100), /number/);

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
  assert.equal(dreamTest.buildMemoryIndex(memoryRoot, 0, 4_000), "No accepted dream memory exists.");
  assert.equal(dreamTest.buildMemoryIndex(memoryRoot, 20, 28), "Accepted dream memory files:");

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
  const manifest = dreamTest.createCandidateSnapshot(liveRoot, candidateRoot);
  writeFileSync(
    join(candidateRoot, "global", "base.md"),
    "---\ndescription: Base memory.\n---\n\n# Base\n\nImproved.\n",
  );
  const snapshotJob = join(dreamHome, "jobs", "snapshot-job");
  mkdirSync(snapshotJob, { recursive: true });
  const snapshotManifest = {
    version: 2, id: "snapshot-job", jobDir: snapshotJob,
    memoryRoot: liveRoot, candidateRoot, base: manifest,
    sessionIds: ["snapshot-session"],
  };
  writeFileSync(join(snapshotJob, "manifest.json"), JSON.stringify(snapshotManifest));
  writeFileSync(join(snapshotJob, "state.json"), JSON.stringify({
    id: "snapshot-job", status: "running", completed: 1, total: 1,
  }));
  assert.equal(existsSync(join(candidateRoot, ".git")), false);
  assert.equal(git(liveRoot, "branch", "--show-current"), "master");
  writeFileSync(join(liveRoot, "staged.txt"), "Unrelated staged data\n");
  git(liveRoot, "add", "staged.txt");
  const beforeIndex = readFileSync(join(liveRoot, ".git", "index"));
  const published = dreamTest.publishJob(snapshotManifest);
  assert.equal(git(liveRoot, "rev-parse", "HEAD"), manifest.baseCommit);
  assert.deepEqual(readFileSync(join(liveRoot, ".git", "index")), beforeIndex);
  assert.match(readFileSync(join(liveRoot, "global", "base.md"), "utf8"), /Original/);
  assert.match(git(liveRoot, "diff", "master..dream/snapshot-job"), /Improved/);
  assert.equal(git(liveRoot, "diff", "--name-only", "master..dream/snapshot-job"), "global/base.md");
  assert.throws(() => dreamTest.applyReviewBranch(snapshotManifest), /local changes/);
  git(liveRoot, "reset", "--", "staged.txt");
  rmSync(join(liveRoot, "staged.txt"));
  dreamTest.applyReviewBranch(snapshotManifest);
  writeFileSync(join(snapshotJob, "state.json"), JSON.stringify({
    id: "snapshot-job", status: "ready", publishedCommit: published,
  }));
  dreamTest.reconcileJobs(dreamHome);
  assert.equal(JSON.parse(readFileSync(join(snapshotJob, "state.json"), "utf8")).status, "applied");
  assert.match(readFileSync(join(liveRoot, "global", "base.md"), "utf8"), /Improved/);

  const processedPath = join(dreamHome, "state.json");
  dreamTest.markSessionsProcessed(processedPath, ["session-1", "session-2"]);
  dreamTest.markSessionsProcessed(processedPath, ["session-2", "session-3"]);
  assert.deepEqual(dreamTest.loadProcessedSessions(processedPath), [
    "session-1",
    "session-2",
    "session-3",
    "snapshot-session",
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
  assert.deepEqual([...tools.keys()], []);

  const originalList = SessionManager.list;
  try {
    SessionManager.list = async () => Array.from({ length: 101 }, (_, index) => ({
      id: `limit-session-${index}`, modified: new Date(index),
    })) as Awaited<ReturnType<typeof SessionManager.list>>;
    for (const [args, count] of [["", 10], ["3", 3], ["100", 100], ["999", 100]] as const) {
      let confirmation = "";
      await commands.get("dream")!.handler(args, {
        cwd: tempRoot, hasUI: true,
        modelRegistry: { find: () => ({ api: "test" }) },
        ui: {
          confirm: async (_title: string, text: string) => {
            confirmation = text;
            return false;
          },
        },
      } as unknown as ExtensionContext);
      assert.ok(confirmation.startsWith(`${count} session(s)`));
      assert.match(confirmation, /Up to 10 worker\(s\) will run at once\./);
    }
  } finally {
    SessionManager.list = originalList;
  }

  const statusHome = join(tempRoot, "status-home");
  process.env.PI_DREAM_HOME = statusHome;
  const statuses = new Map<string, string | undefined>();
  const statusNotifications: Array<{ message: string; level: string }> = [];
  let statusUpdates = 0;
  const uiContext = {
    hasUI: true,
    ui: {
      theme: { fg: (_color: string, text: string) => text },
      setStatus: (key: string, value: string | undefined) => {
        statusUpdates += 1;
        statuses.set(key, value);
      },
      notify: (message: string, level: string) => statusNotifications.push({ message, level }),
    },
  } as unknown as ExtensionContext;
  const refreshStatus = () => events.get("session_start")!({}, uiContext);
  const statusJob = join(statusHome, "jobs", "status-job");
  const statePath = join(statusJob, "state.json");
  try {
    await refreshStatus();
    assert.equal(statuses.get("dream"), "🌙 dream: idle");
    mkdirSync(statusJob, { recursive: true });
    for (const status of ["queued", "running", "ready", "failed", "applied", "discarded"]) {
      writeFileSync(statePath, JSON.stringify({
        id: "status-job", status, completed: 2, total: 3,
        error: status === "failed" ? "Codex quota exhausted." : undefined,
      }));
      await refreshStatus();
      const label = ["queued", "running", "ready"].includes(status) ? "2/3" : status;
      assert.equal(statuses.get("dream"), `🌙 dream: ${label}`);
    }
    assert.deepEqual(statusNotifications, [{
      level: "error",
      message: "Pi Dream job status-job failed after 2/3 sessions.\nCodex quota exhausted.\nRun /dream-status status-job.",
    }]);
    writeFileSync(statePath, JSON.stringify({
      id: "status-job", status: "failed", completed: 2, total: 3, error: "Codex quota exhausted.",
    }));
    await refreshStatus();
    assert.equal(statusNotifications.length, 1, "notify once for each failed job");
    writeFileSync(statePath, "invalid json");
    await refreshStatus();
    assert.equal(statuses.get("dream"), "🌙 dream: unavailable");
    writeFileSync(statePath, JSON.stringify({ status: "running", completed: 1, total: 3 }));
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(statuses.get("dream"), "🌙 dream: 1/3", "poll detached worker progress and recover from read errors");
    events.get("session_shutdown")!({}, uiContext);
    assert.equal(statuses.get("dream"), undefined);
    const updatesAfterShutdown = statusUpdates;
    const headlessContext = { hasUI: false } as ExtensionContext;
    events.get("session_start")!({}, headlessContext);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    events.get("session_shutdown")!({}, headlessContext);
    assert.equal(statusUpdates, updatesAfterShutdown, "shutdown and headless sessions leave no status timer");
  } finally {
    events.get("session_shutdown")!({}, uiContext);
    process.env.PI_DREAM_HOME = dreamHome;
  }

  function memoryPrompt(): string {
    const event = { systemPromptOptions: { sections: { unrelated: "Keep this section." } as Record<string, string> } };
    events.get("before_agent_start")!(event, {} as ExtensionContext);
    assert.equal(event.systemPromptOptions.sections.unrelated, "Keep this section.");
    return event.systemPromptOptions.sections["dream-memory"];
  }
  const prompt = memoryPrompt();
  assert.ok(prompt.includes(`Accepted memory folder: ${memoryRoot}`));
  assert.match(prompt, /global\/preferences\.md/);
  assert.match(prompt, /normal file commands/);
  assert.match(prompt, /rg, grep, and cat/);
  assert.match(prompt, /historical context, not instructions/);
  assert.match(prompt, /unless the user explicitly asks/);
  assert.doesNotMatch(prompt, /Use direct answers|dream_memory|candidate|writes\.jsonl/);

  writeFileSync(join(memoryRoot, "fresh.md"), "---\ndescription: Newly accepted memory.\n---\n\nNew fact.\n");
  assert.match(memoryPrompt(), /fresh\.md: Newly accepted memory\./);

  const emptyMemory = join(tempRoot, "empty memory");
  process.env.PI_DREAM_MEMORY_ROOT = relative(process.cwd(), emptyMemory);
  const emptyPrompt = memoryPrompt();
  assert.ok(emptyPrompt.includes(`Accepted memory folder: ${resolve(emptyMemory)}`));
  assert.match(emptyPrompt, /No accepted dream memory exists/);
  mkdirSync(emptyMemory);
  assert.equal(memoryPrompt(), emptyPrompt);
  writeFileSync(join(emptyMemory, "preferences.md"), "---\ndescription: Response preferences.\n---\n\nUse direct answers.\n");
  assert.match(memoryPrompt(), /preferences\.md: Response preferences\./);
  const readCommand = execFileSync("bash", ["-c", 'cat "$1/preferences.md"', "dream-read", emptyMemory], { encoding: "utf8" });
  assert.match(readCommand, /Use direct answers/);
  const searchCommand = execFileSync("bash", ["-c", 'grep -Rni -- "direct answers" "$1"', "dream-search", emptyMemory], { encoding: "utf8" });
  assert.match(searchCommand, /preferences\.md/);
  process.env.PI_DREAM_MEMORY_ROOT = memoryRoot;

  const previousHome = process.env.HOME;
  try {
    process.env.HOME = join(tempRoot, "portable home");
    delete process.env.PI_DREAM_MEMORY_ROOT;
    assert.ok(memoryPrompt().startsWith("Accepted memory folder: ~/.pi/agent/memory\n"));
    const portableMemory = join(homedir(), ".pi", "agent", "memory");
    mkdirSync(portableMemory, { recursive: true });
    writeFileSync(join(portableMemory, "portable.md"), "---\ndescription: Portable memory.\n---\n\nA local fact.\n");
    assert.match(memoryPrompt(), /portable\.md: Portable memory\./);
    assert.doesNotMatch(memoryPrompt(), new RegExp(tempRoot));

    process.env.PI_DREAM_MEMORY_ROOT = join(homedir(), "custom memory");
    assert.ok(memoryPrompt().startsWith("Accepted memory folder: ~/custom memory\n"));
    process.env.PI_DREAM_MEMORY_ROOT = homedir();
    assert.ok(memoryPrompt().startsWith("Accepted memory folder: ~\n"));
    process.env.PI_DREAM_MEMORY_ROOT = `${homedir()}-other/memory`;
    assert.ok(memoryPrompt().startsWith(`Accepted memory folder: ${process.env.PI_DREAM_MEMORY_ROOT}\n`));
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    process.env.PI_DREAM_MEMORY_ROOT = memoryRoot;
  }

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
  const runnerBase = dreamTest.createCandidateSnapshot(runnerLive, runnerCandidate);
  mkdirSync(runnerTranscripts, { recursive: true });
  const transcriptPaths = ["runner-session-1", "runner-session-2", "runner-session-3"].map(
    (sessionId, index) => {
      const path = join(runnerTranscripts, `${sessionId}.md`);
      const largeEvidence = index === 0 ? "x".repeat(256 * 1024) : "";
      writeFileSync(path, `## entry user-1 | user\nRemember ${sessionId}.\n${largeEvidence}`);
      return { sessionId, path, createdAt: "2026-11-02T12:00:00.000Z" };
    },
  );
  const fakePi = join(tempRoot, "fake-pi.sh");
  writeFileSync(
    fakePi,
    [
      "#!/bin/sh",
      'printf "%s\\n" "$PI_DREAM_SESSION_ID" >> "$PI_DREAM_PARENT_JOB_DIR/fake-calls"',
      'wc -c >> "$PI_DREAM_PARENT_JOB_DIR/fake-input-sizes"',
      'touch "$PI_DREAM_PARENT_JOB_DIR/started-$PI_DREAM_SESSION_ID"',
      'case "$PI_DREAM_SESSION_ID" in',
      "  runner-session-1|runner-session-2)",
      '    while [ ! -f "$PI_DREAM_PARENT_JOB_DIR/started-runner-session-1" ] || [ ! -f "$PI_DREAM_PARENT_JOB_DIR/started-runner-session-2" ]; do sleep 0.01; done',
      "    ;;",
      "esac",
      "dd if=/dev/zero bs=1048576 count=2 2>/dev/null",
      'mkdir -p "$PI_DREAM_MEMORY_ROOT/global"',
      'cat > "$PI_DREAM_MEMORY_ROOT/global/$PI_DREAM_SESSION_ID.md" <<EOF',
      "---",
      'description: Memory from $PI_DREAM_SESSION_ID.',
      "---",
      "",
      '# $PI_DREAM_SESSION_ID',
      "EOF",
      'printf "{\\"sessionId\\":\\"%s\\",\\"action\\":\\"write\\",\\"path\\":\\"global/%s.md\\",\\"reason\\":\\"test\\",\\"evidence\\":[]}\\n" "$PI_DREAM_SESSION_ID" "$PI_DREAM_SESSION_ID" >> "$PI_DREAM_JOB_DIR/writes.jsonl"',
    ].join("\n"),
  );
  chmodSync(fakePi, 0o755);
  const runnerManifestPath = join(runnerJob, "manifest.json");
  writeFileSync(
    runnerManifestPath,
    JSON.stringify({
      version: 2,
      id: "runner-job",
      cwd: tempRoot,
      createdAt: "2026-11-02T12:00:00.000Z",
      model: "test/model",
      concurrency: 2,
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
      version: 2,
      id: "runner-job",
      status: "queued",
      completed: 0,
      total: 3,
      updatedAt: "2026-11-02T12:00:00.000Z",
    }),
  );
  assert.deepEqual(await runJob(runnerManifestPath, { piBin: fakePi, timeoutMs: 5_000 }), {
    status: "ready",
  });
  assert.deepEqual(
    readFileSync(join(runnerJob, "fake-calls"), "utf8").trim().split("\n").sort(),
    ["runner-session-1", "runner-session-2", "runner-session-3"],
  );
  const inputSizes = readFileSync(join(runnerJob, "fake-input-sizes"), "utf8")
    .trim()
    .split("\n")
    .map(Number);
  assert.equal(inputSizes.length, 3);
  assert.ok(Math.max(...inputSizes) > 256 * 1024);
  const runnerState = JSON.parse(
    readFileSync(join(runnerJob, "state.json"), "utf8"),
  );
  assert.equal(runnerState.status, "ready");
  assert.equal(runnerState.completed, 3);
  assert.deepEqual(runnerState.runningSessionIds, []);
  assert.equal(
    Number(git(runnerLive, "rev-list", "--count", `${runnerBase.baseCommit}..dream/runner-job`)),
    1,
  );
  assert.equal(git(runnerLive, "log", "-1", "--format=%s", "dream/runner-job"), "Dream batch runner-job");
  assert.equal(git(runnerLive, "rev-parse", "HEAD"), runnerBase.baseCommit);
  assert.equal(existsSync(join(runnerCandidate, ".git")), false);
  assert.deepEqual(
    readFileSync(join(runnerJob, "writes.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).sessionId).sort(),
    transcriptPaths.map((item) => item.sessionId).sort(),
  );
  for (const [index, transcript] of transcriptPaths.entries()) {
    const workerRoot = join(
      runnerJob,
      "workers",
      `${String(index).padStart(3, "0")}-${transcript.sessionId}`,
      "candidate",
    );
    assert.equal(existsSync(workerRoot), false);
  }

  const limitPi = join(tempRoot, "limit-pi.mjs");
  writeFileSync(limitPi, [
    "#!/usr/bin/env node",
    'import { readFileSync } from "node:fs";',
    'import { join } from "node:path";',
    `import { withLock, writeJson } from ${JSON.stringify(new URL("./store.mjs", import.meta.url).href)};`,
    "readFileSync(0);",
    'const root = process.env.PI_DREAM_JOB_DIR;',
    'const path = join(root, "counts.json");',
    'await withLock(join(root, ".counts-lock"), () => {',
    '  const state = JSON.parse(readFileSync(path, "utf8"));',
    '  state.active += 1;',
    '  state.peak = Math.max(state.peak, state.active);',
    '  state.calls.push(process.env.PI_DREAM_SESSION_ID);',
    '  writeJson(path, state);',
    '});',
    'while (JSON.parse(readFileSync(path, "utf8")).calls.length < 10) {',
    '  await new Promise((resolve) => setTimeout(resolve, 10));',
    '}',
    'await new Promise((resolve) => setTimeout(resolve, 20));',
    'await withLock(join(root, ".counts-lock"), () => {',
    '  const state = JSON.parse(readFileSync(path, "utf8"));',
    '  state.active -= 1;',
    '  writeJson(path, state);',
    '});',
  ].join("\n"));
  chmodSync(limitPi, 0o755);
  for (const requested of [undefined, 100]) {
    const id = requested === undefined ? "limit-default" : "limit-capped";
    const dir = join(tempRoot, id);
    const candidate = join(dir, "candidate");
    const base = dreamTest.createCandidateSnapshot(runnerLive, candidate);
    const transcripts = Array.from({ length: 100 }, (_, index) => ({
      ...transcriptPaths[1], sessionId: `${id}-${index}`,
    }));
    const manifestPath = join(dir, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({
      version: 2, id, model: "test/model", concurrency: requested,
      memoryRoot: runnerLive, candidateRoot: candidate, jobDir: dir,
      workerExtension: join(tempRoot, "worker-extension.ts"),
      sessionIds: transcripts.map((item) => item.sessionId), transcripts, base,
    }));
    writeFileSync(join(dir, "state.json"), JSON.stringify({ id, status: "queued", completed: 0, total: 100 }));
    writeFileSync(join(dir, "counts.json"), JSON.stringify({ active: 0, peak: 0, calls: [] }));
    assert.deepEqual(await runJob(manifestPath, { piBin: limitPi, timeoutMs: 10_000 }), { status: "ready" });
    const counts = JSON.parse(readFileSync(join(dir, "counts.json"), "utf8"));
    assert.equal(counts.active, 0);
    assert.equal(counts.peak, 10);
    assert.deepEqual(counts.calls.sort(), transcripts.map((item) => item.sessionId).sort());
    const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
    assert.equal(state.completed, 100);
    assert.equal(state.concurrency, 10);
    assert.equal(git(runnerLive, "rev-parse", "HEAD"), base.baseCommit);
  }

  const conflictLive = join(tempRoot, "conflict-live");
  const conflictCandidate = join(tempRoot, "conflict-candidate");
  const conflictJob = join(tempRoot, "conflict-job");
  const conflictTranscripts = join(conflictJob, "transcripts");
  dreamTest.initializeMemoryStore(conflictLive);
  mkdirSync(join(conflictLive, "global"), { recursive: true });
  writeFileSync(
    join(conflictLive, "global", "shared.md"),
    "---\ndescription: Shared memory.\n---\n\n# Shared\n",
  );
  execFileSync("git", ["-C", conflictLive, "add", "."]);
  execFileSync("git", [
    "-C",
    conflictLive,
    "-c",
    "user.name=Pi Dream",
    "-c",
    "user.email=pi-dream@local",
    "commit",
    "-m",
    "Add shared memory",
  ]);
  const conflictBase = dreamTest.createCandidateSnapshot(conflictLive, conflictCandidate);
  mkdirSync(conflictTranscripts, { recursive: true });
  const conflictSessions = ["conflict-session-1", "conflict-session-2"].map((sessionId) => {
    const path = join(conflictTranscripts, `${sessionId}.md`);
    writeFileSync(path, `## entry user-1 | user\nRemember ${sessionId}.\n`);
    return { sessionId, path, createdAt: "2026-11-02T12:00:00.000Z" };
  });
  const conflictPi = join(tempRoot, "conflict-pi.sh");
  writeFileSync(
    conflictPi,
    [
      "#!/bin/sh",
      'printf "%s\\n" "$PI_DREAM_SESSION_ID" >> "$PI_DREAM_PARENT_JOB_DIR/conflict-calls"',
      'printf "\\n%s\\n" "$PI_DREAM_SESSION_ID" >> "$PI_DREAM_MEMORY_ROOT/global/shared.md"',
      'printf "{\\"sessionId\\":\\"%s\\",\\"action\\":\\"write\\",\\"path\\":\\"global/shared.md\\",\\"reason\\":\\"test\\",\\"evidence\\":[]}\\n" "$PI_DREAM_SESSION_ID" >> "$PI_DREAM_JOB_DIR/writes.jsonl"',
      "cat >/dev/null",
    ].join("\n"),
  );
  chmodSync(conflictPi, 0o755);
  const conflictManifestPath = join(conflictJob, "manifest.json");
  writeFileSync(
    conflictManifestPath,
    JSON.stringify({
      version: 2,
      id: "conflict-job",
      cwd: tempRoot,
      createdAt: "2026-11-02T12:00:00.000Z",
      model: "test/model",
      concurrency: 2,
      memoryRoot: conflictLive,
      candidateRoot: conflictCandidate,
      jobDir: conflictJob,
      workerExtension: join(tempRoot, "worker-extension.ts"),
      sessionIds: conflictSessions.map((item) => item.sessionId),
      transcripts: conflictSessions,
      base: conflictBase,
    }),
  );
  writeFileSync(
    join(conflictJob, "state.json"),
    JSON.stringify({
      version: 2,
      id: "conflict-job",
      status: "queued",
      completed: 0,
      total: 2,
      updatedAt: "2026-11-02T12:00:00.000Z",
    }),
  );
  assert.deepEqual(await runJob(conflictManifestPath, { piBin: conflictPi }), {
    status: "ready",
  });
  const conflictCalls = readFileSync(join(conflictJob, "conflict-calls"), "utf8")
    .trim()
    .split("\n");
  assert.equal(conflictCalls.filter((value) => value === "conflict-session-1").length, 1);
  assert.equal(conflictCalls.filter((value) => value === "conflict-session-2").length, 1);
  const sharedMemory = readFileSync(join(conflictCandidate, "global", "shared.md"), "utf8");
  assert.equal(sharedMemory.match(/conflict-session-1/g)?.length, 1);
  assert.equal(sharedMemory.match(/conflict-session-2/g)?.length, 1);
  assert.deepEqual(
    readFileSync(join(conflictJob, "writes.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).sessionId).sort(),
    conflictSessions.map((item) => item.sessionId).sort(),
  );

  const competing = await Promise.allSettled(["A", "B"].map((name) => workerTest.applyMemoryEdit(editContext, {
    action: "write", path: "global/race.md", expectedHash: "missing",
    content: `---\ndescription: Race result.\n---\n\n${name}\n`,
    reason: "Keep a supported preference.",
    evidence: [{ entryId: "user-1", quote: "Use short replies." }],
  })));
  assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(competing.filter((result) => result.status === "rejected").length, 1);
  const raceRecords = readFileSync(join(jobDir, "writes.jsonl"), "utf8")
    .split("\n").filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(raceRecords.filter((record) => record.path === "global/race.md").length, 1);

  const concurrentHome = join(tempRoot, "concurrent-home");
  const concurrentMemory = join(tempRoot, "concurrent-memory");
  dreamTest.initializeMemoryStore(concurrentMemory);
  writeFileSync(join(concurrentMemory, "keep.txt"), "Keep non-memory tracked files.\n");
  git(concurrentMemory, "add", "keep.txt");
  git(concurrentMemory, "-c", "user.name=Test", "-c", "user.email=test@local", "commit", "-m", "Keep metadata");
  function makeJob(id: string, root = concurrentMemory) {
    const dir = join(concurrentHome, "jobs", id);
    const candidate = join(dir, "candidate");
    const base = dreamTest.createCandidateSnapshot(root, candidate);
    const transcript = join(dir, "transcript.md");
    writeFileSync(transcript, "## entry user-1 | user\nUse short replies.\n");
    const manifest = {
      version: 2, id, cwd: tempRoot, createdAt: "2026-11-03T12:00:00.000Z",
      model: "test/model", concurrency: 1, memoryRoot: root, candidateRoot: candidate,
      jobDir: dir, workerExtension: join(tempRoot, "worker-extension.ts"),
      sessionIds: [id], transcripts: [{ sessionId: id, path: transcript }], base,
    };
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
    writeFileSync(join(dir, "state.json"), JSON.stringify({
      version: 1, id, status: "queued", completed: 0, total: 1,
    }));
    return manifest;
  }
  const batchA = makeJob("batch-a");
  const batchB = makeJob("batch-b");
  assert.equal(batchA.base.baseCommit, batchB.base.baseCommit);
  const batchPi = join(tempRoot, "batch-pi.sh");
  writeFileSync(batchPi, [
    "#!/bin/sh", "cat >/dev/null",
    `touch "${tempRoot}/$PI_DREAM_SESSION_ID.started"`,
    `while [ ! -f "${tempRoot}/batch-a.started" ] || [ ! -f "${tempRoot}/batch-b.started" ]; do sleep 0.01; done`,
    'printf "---\\ndescription: Concurrent memory.\\n---\\n\\n%s\\n" "$PI_DREAM_SESSION_ID" > "$PI_DREAM_MEMORY_ROOT/$PI_DREAM_SESSION_ID.md"',
  ].join("\n").replace('printf "---', 'printf -- "---'));
  chmodSync(batchPi, 0o755);
  const concurrentResults = await Promise.all([batchA, batchB].map((manifest) =>
    runJob(join(manifest.jobDir, "manifest.json"), { piBin: batchPi, timeoutMs: 5_000 })));
  assert.deepEqual(concurrentResults.map((result) => result.status), ["ready", "ready"]);
  assert.equal(git(concurrentMemory, "rev-parse", "HEAD"), batchA.base.baseCommit);
  assert.equal(git(concurrentMemory, "status", "--porcelain"), "");
  assert.equal(git(concurrentMemory, "show", "dream/batch-a:keep.txt"), "Keep non-memory tracked files.");
  assert.equal(git(concurrentMemory, "diff", "--name-only", "master..dream/batch-a"), "batch-a.md");
  assert.equal(git(concurrentMemory, "diff", "--name-only", "master..dream/batch-b"), "batch-b.md");
  const candidates = [{ id: "batch-a" }, { id: "batch-b" }, { id: "free" }];
  assert.deepEqual(dreamTest.availableSessions(concurrentHome, candidates), [{ id: "free" }]);
  git(concurrentMemory, "merge", "--ff-only", "dream/batch-a");
  dreamTest.reconcileJobs(concurrentHome);
  assert.deepEqual(dreamTest.loadProcessedSessions(join(concurrentHome, "state.json")), ["batch-a"]);
  assert.throws(() => dreamTest.applyReviewBranch(batchB), /merge it manually/);
  git(concurrentMemory, "-c", "user.name=Test", "-c", "user.email=test@local", "merge", "--no-edit", "dream/batch-b");
  dreamTest.reconcileJobs(concurrentHome);
  assert.deepEqual(dreamTest.loadProcessedSessions(join(concurrentHome, "state.json")), ["batch-a", "batch-b"]);
  assert.equal(git(concurrentMemory, "branch", "--show-current"), "master");

  const notifications: string[] = [];
  const commandContext = {
    cwd: tempRoot,
    hasUI: true,
    ui: { confirm: async () => true, notify: (message: string) => notifications.push(message) },
  } as unknown as ExtensionContext;
  process.env.PI_DREAM_HOME = concurrentHome;
  process.env.PI_DREAM_MEMORY_ROOT = concurrentMemory;
  const empty = makeJob("empty");
  const emptyCommit = dreamTest.publishJob(empty);
  writeFileSync(join(empty.jobDir, "state.json"), JSON.stringify({
    id: empty.id, status: "ready", completed: 1, total: 1,
    publishedCommit: emptyCommit, branch: "dream/empty",
  }));
  assert.notEqual(emptyCommit, empty.base.baseCommit, "empty batches still need explicit acceptance");
  await commands.get("dream-review")!.handler("empty", commandContext);
  assert.match(readFileSync(join(empty.jobDir, "diff.md"), "utf8"), /No file changes/);
  assert.match(notifications.at(-1)!, /dream\/empty/);
  const originalStatusList = SessionManager.list;
  let projectSessionIds = ["batch-a", "batch-b", "empty", "free"];
  SessionManager.list = async () => projectSessionIds.map((id) => ({ id })) as Awaited<ReturnType<typeof SessionManager.list>>;
  try {
    await commands.get("dream-status")!.handler("", commandContext);
    assert.match(notifications.at(-1)!, new RegExp(`Project sessions for ${tempRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: 2 accepted, 1 reserved, 1 available, 4 total\\.`));
    assert.match(notifications.at(-1)!, /batch-a: applied/);
    assert.match(notifications.at(-1)!, /empty: ready/);
    await commands.get("dream-apply")!.handler("empty", commandContext);
    assert.equal(git(concurrentMemory, "rev-parse", "HEAD"), emptyCommit);
    assert.ok(dreamTest.loadProcessedSessions(join(concurrentHome, "state.json")).includes("empty"));
    assert.throws(() => git(concurrentMemory, "rev-parse", "--verify", "refs/heads/dream/empty"));
    projectSessionIds = ["batch-a", "batch-b", "empty"];
    await commands.get("dream-status")!.handler("", commandContext);
    assert.match(notifications.at(-1)!, /3 accepted, 0 reserved, 0 available, 3 total\./);
    assert.match(notifications.at(-1)!, /All project sessions are accepted\./);
  } finally {
    SessionManager.list = originalStatusList;
  }

  for (const amend of [false, true]) {
    const id = amend ? "amended" : "corrected";
    const edited = makeJob(id);
    const correctionPath = `${id}.md`;
    writeFileSync(join(edited.candidateRoot, correctionPath),
      "---\ndescription: Correctable memory.\n---\n\nOriginal proposal.\n");
    const originalCommit = dreamTest.publishJob(edited);
    writeFileSync(join(edited.jobDir, "state.json"), JSON.stringify({
      id, status: "ready", completed: 1, total: 1,
      publishedCommit: originalCommit, branch: `dream/${id}`,
    }));
    git(concurrentMemory, "switch", `dream/${id}`);
    writeFileSync(join(concurrentMemory, correctionPath),
      "---\ndescription: Correctable memory.\n---\n\nUser correction.\n");
    git(concurrentMemory, "add", correctionPath);
    git(concurrentMemory, "-c", "user.name=Test", "-c", "user.email=test@local",
      "commit", ...(amend ? ["--amend"] : []), "-m", "Correct the proposal");
    const correctedCommit = git(concurrentMemory, "rev-parse", "HEAD");
    git(concurrentMemory, "switch", "master");
    assert.notEqual(correctedCommit, originalCommit);
    if (amend) {
      assert.throws(() => git(concurrentMemory, "merge-base", "--is-ancestor", originalCommit, correctedCommit));
    }
    const masterBeforeApply = git(concurrentMemory, "rev-parse", "HEAD");
    await commands.get("dream-apply")!.handler(id, {
      ...commandContext, ui: { ...commandContext.ui, confirm: async () => false },
    });
    assert.equal(git(concurrentMemory, "rev-parse", "HEAD"), masterBeforeApply);
    assert.equal(git(concurrentMemory, "rev-parse", `dream/${id}`), correctedCommit);
    assert.equal(JSON.parse(readFileSync(join(edited.jobDir, "state.json"), "utf8")).publishedCommit, originalCommit);
    if (!amend) {
      await commands.get("dream-review")!.handler(id, commandContext);
      const report = readFileSync(join(edited.jobDir, "diff.md"), "utf8");
      assert.match(report, /User correction/);
      assert.match(report, /Correct the proposal/);
      assert.equal(git(concurrentMemory, "rev-parse", "HEAD"), masterBeforeApply);
    }
    await commands.get("dream-apply")!.handler(id, commandContext);
    assert.equal(git(concurrentMemory, "rev-parse", "HEAD"), correctedCommit);
    assert.match(readFileSync(join(concurrentMemory, correctionPath), "utf8"), /User correction/);
    const acceptedState = JSON.parse(readFileSync(join(edited.jobDir, "state.json"), "utf8"));
    assert.equal(acceptedState.status, "applied");
    assert.equal(acceptedState.publishedCommit, correctedCommit);
    assert.ok(dreamTest.loadProcessedSessions(join(concurrentHome, "state.json")).includes(id));
    assert.equal(git(concurrentMemory, "branch", "--show-current"), "master");
    assert.throws(() => git(concurrentMemory, "rev-parse", "--verify", `refs/heads/dream/${id}`));
  }

  const refused = makeJob("refused-apply");
  const refusedCommit = dreamTest.publishJob(refused);
  writeFileSync(join(refused.jobDir, "state.json"), JSON.stringify({
    id: refused.id, status: "ready", publishedCommit: refusedCommit,
  }));
  writeFileSync(join(concurrentMemory, "local.txt"), "Uncommitted work.\n");
  await assert.rejects(commands.get("dream-apply")!.handler(refused.id, commandContext), /local changes/);
  assert.equal(git(concurrentMemory, "rev-parse", "dream/refused-apply"), refusedCommit);
  rmSync(join(concurrentMemory, "local.txt"));
  writeFileSync(join(concurrentMemory, "accepted.txt"), "Another accepted commit.\n");
  git(concurrentMemory, "add", "accepted.txt");
  git(concurrentMemory, "-c", "user.name=Test", "-c", "user.email=test@local", "commit", "-m", "Advance accepted memory");
  await assert.rejects(commands.get("dream-apply")!.handler(refused.id, commandContext), /merge it manually/);
  assert.equal(git(concurrentMemory, "rev-parse", "dream/refused-apply"), refusedCommit);

  const cleanupFailure = makeJob("cleanup-failure");
  const cleanupCommit = dreamTest.publishJob(cleanupFailure);
  writeFileSync(join(cleanupFailure.jobDir, "state.json"), JSON.stringify({
    id: cleanupFailure.id, status: "ready", publishedCommit: cleanupCommit,
  }));
  const refLock = join(concurrentMemory, ".git", "refs", "heads", "dream", "cleanup-failure.lock");
  writeFileSync(refLock, "Another Git process owns this lock.\n");
  try {
    await commands.get("dream-apply")!.handler(cleanupFailure.id, commandContext);
    assert.equal(git(concurrentMemory, "rev-parse", "HEAD"), cleanupCommit);
    assert.equal(git(concurrentMemory, "rev-parse", "dream/cleanup-failure"), cleanupCommit);
    assert.equal(JSON.parse(readFileSync(join(cleanupFailure.jobDir, "state.json"), "utf8")).status, "applied");
    assert.ok(dreamTest.loadProcessedSessions(join(concurrentHome, "state.json")).includes(cleanupFailure.id));
    assert.match(notifications.at(-1)!, /Applied Pi Dream job cleanup-failure, but the review branch could not be deleted\./);
  } finally {
    rmSync(refLock);
  }
  assert.equal(git(concurrentMemory, "rev-parse", "dream/batch-a").length > 0, true);

  const missing = makeJob("missing-branch");
  dreamTest.publishJob(missing);
  git(concurrentMemory, "branch", "-D", "dream/missing-branch");
  assert.throws(() => dreamTest.publishJob(missing));
  assert.throws(() => git(concurrentMemory, "rev-parse", "--verify", "refs/heads/dream/missing-branch"));

  const discarded = makeJob("discard-me");
  const discardedCommit = dreamTest.publishJob(discarded);
  writeFileSync(join(discarded.jobDir, "state.json"), JSON.stringify({
    id: discarded.id, status: "ready", publishedCommit: discardedCommit,
  }));
  await commands.get("dream-discard")!.handler("discard-me", commandContext);
  assert.equal(existsSync(discarded.candidateRoot), false);
  assert.throws(() => git(concurrentMemory, "rev-parse", "--verify", "refs/heads/dream/discard-me"));
  assert.deepEqual(dreamTest.availableSessions(concurrentHome, [{ id: "discard-me" }]), [{ id: "discard-me" }]);
  assert.throws(() => dreamTest.selectJob(concurrentHome, "../escape"), /invalid/);
  assert.throws(() => dreamTest.selectJob(concurrentHome, "unknown"), /does not exist/);

  const failed = makeJob("failed");
  const failPi = join(tempRoot, "fail-pi.sh");
  writeFileSync(failPi, "#!/bin/sh\ncat >/dev/null\nprintf 'Codex quota exhausted.\\n' >&2\nexit 1\n");
  chmodSync(failPi, 0o755);
  assert.equal((await runJob(join(failed.jobDir, "manifest.json"), { piBin: failPi })).status, "failed");
  const failedState = JSON.parse(readFileSync(join(failed.jobDir, "state.json"), "utf8"));
  const failedWorker = join(failed.jobDir, "workers", "000-failed");
  assert.match(failedState.error, /Codex quota exhausted\./);
  assert.match(failedState.error, /worker\.error\.log/);
  assert.equal(readFileSync(join(failedWorker, "worker.error.log"), "utf8"), "Codex quota exhausted.\n");
  assert.doesNotMatch(readFileSync(join(failedWorker, "worker.log"), "utf8"), /Codex quota exhausted/);
  assert.throws(() => git(concurrentMemory, "rev-parse", "--verify", "refs/heads/dream/failed"));
  assert.deepEqual(dreamTest.availableSessions(concurrentHome, [{ id: "failed" }]), [{ id: "failed" }]);

  const silentFailure = makeJob("silent-failure");
  const silentFailPi = join(tempRoot, "silent-fail-pi.sh");
  writeFileSync(silentFailPi, "#!/bin/sh\ncat >/dev/null\nexit 1\n");
  chmodSync(silentFailPi, 0o755);
  assert.equal((await runJob(join(silentFailure.jobDir, "manifest.json"), { piBin: silentFailPi })).status, "failed");
  const silentState = JSON.parse(readFileSync(join(silentFailure.jobDir, "state.json"), "utf8"));
  assert.match(silentState.error, /Worker exited with status 1\./);
  assert.match(silentState.error, /worker\.error\.log/);

  const legacy = makeJob("legacy");
  rmSync(legacy.candidateRoot, { recursive: true });
  git(concurrentMemory, "clone", "--quiet", concurrentMemory, legacy.candidateRoot);
  writeFileSync(join(legacy.candidateRoot, "legacy.md"), "---\ndescription: Legacy memory.\n---\n\nLegacy.\n");
  git(legacy.candidateRoot, "add", ".");
  git(legacy.candidateRoot, "-c", "user.name=Test", "-c", "user.email=test@local", "commit", "-m", "Legacy proposal");
  writeFileSync(join(legacy.jobDir, "manifest.json"), JSON.stringify({ ...legacy, version: 1 }));
  writeFileSync(join(legacy.jobDir, "state.json"), JSON.stringify({ id: legacy.id, status: "ready" }));
  await commands.get("dream-review")!.handler("legacy", commandContext);
  assert.equal(git(concurrentMemory, "show", "dream/legacy:legacy.md"), "---\ndescription: Legacy memory.\n---\n\nLegacy.");
  assert.equal(git(concurrentMemory, "branch", "--show-current"), "master");
  assert.equal(existsSync(join(concurrentMemory, "legacy.md")), false);
  assert.equal(existsSync(join(legacy.candidateRoot, ".git")), true);

  const renamed = join(tempRoot, "rename-memory");
  dreamTest.initializeMemoryStore(renamed);
  git(renamed, "branch", "-m", "main");
  dreamTest.initializeMemoryStore(renamed);
  assert.equal(git(renamed, "branch", "--show-current"), "master");
  git(renamed, "branch", "-m", "main");
  git(renamed, "branch", "master");
  assert.throws(() => dreamTest.initializeMemoryStore(renamed), /Both main and master/);

  const bad = makeJob("invalid-memory");
  writeFileSync(join(bad.candidateRoot, "invalid.md"), "Missing metadata\n");
  assert.throws(() => dreamTest.publishJob(bad), /front matter/);
  assert.throws(() => git(concurrentMemory, "rev-parse", "--verify", "refs/heads/dream/invalid-memory"));

  let inLock = 0;
  await Promise.all([1, 2].map(() => withLock(join(tempRoot, "test-lock"), async () => {
    inLock += 1;
    assert.equal(inLock, 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    inLock -= 1;
  })));
  mkdirSync(join(tempRoot, "stale-lock"));
  await assert.rejects(withLock(join(tempRoot, "stale-lock"), () => {}, 1), /Lock timed out/);
  const claimHome = join(tempRoot, "claims");
  const storeUrl = new URL("./store.mjs", import.meta.url).href;
  async function childRun(code: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", code]);
      let output = "";
      let errors = "";
      child.stdout.on("data", (data) => { output += data; });
      child.stderr.on("data", (data) => { errors += data; });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
    });
  }
  const claims = await Promise.all(["one", "two"].map((id) => childRun(`
    import { withLock, availableSessions, writeJson, markSessionsProcessed } from ${JSON.stringify(storeUrl)};
    import { join } from "node:path";
    const home = ${JSON.stringify(claimHome)};
    await withLock(join(home, ".state-lock"), async () => {
      const chosen = availableSessions(home, [{ id: "reserved-1" }, { id: "reserved-2" }])[0];
      if (!chosen) throw new Error("A distinct session must remain available.");
      await new Promise((resolve) => setTimeout(resolve, 40));
      const dir = join(home, "jobs", ${JSON.stringify(id)});
      writeJson(join(dir, "manifest.json"), { sessionIds: [chosen.id] });
      writeJson(join(dir, "state.json"), { status: "queued" });
      markSessionsProcessed(join(home, "other-state.json"), [${JSON.stringify(id)}]);
      console.log(chosen.id);
    });
  `)));
  assert.deepEqual(claims.sort(), ["reserved-1", "reserved-2"]);
  assert.deepEqual(dreamTest.loadProcessedSessions(join(claimHome, "other-state.json")), ["one", "two"]);

  const deleteJob = makeJob("delete-test");
  rmSync(join(deleteJob.candidateRoot, "README.md"));
  dreamTest.publishJob(deleteJob);
  assert.equal(git(concurrentMemory, "diff", "--name-status", "master..dream/delete-test"), "D\tREADME.md");
  assert.equal(existsSync(join(concurrentMemory, "README.md")), true);
  const symlinkJob = makeJob("symlink-test");
  symlinkSync(outside, join(symlinkJob.candidateRoot, "escape"), "dir");
  assert.throws(() => dreamTest.publishJob(symlinkJob), /symlink/);
  assert.equal(git(concurrentMemory, "branch", "--show-current"), "master");

  process.env.PI_DREAM_HOME = dreamHome;
  process.env.PI_DREAM_MEMORY_ROOT = memoryRoot;

  console.log("pi-dream tests passed");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
