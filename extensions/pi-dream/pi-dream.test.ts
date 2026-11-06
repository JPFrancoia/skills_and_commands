import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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
const { runJob, __test__: runnerTest } = await import("./runner.mjs");
const { withLock, writeNote, availableNotes } = await import("./store.mjs");

const successfulWorkerEnd = `printf '\\n%s\\n' '{"type":"agent_end","messages":[{"role":"assistant","stopReason":"stop"}]}'`;

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
      type: "message", id: "assistant-2", parentId: "tool-1", timestamp: "2026-11-02T12:00:00.000Z",
      message: {
        role: "assistant", timestamp: 0,
        content: [
          { type: "thinking", thinking: "Private reasoning" },
          { type: "toolCall", id: "call-1", name: "bash", arguments: { command: "npm test" } },
          { type: "toolCall", id: "call-2", name: "write", arguments: { content: "w".repeat(3_000) } },
        ],
      },
    } as unknown as SessionEntry,
    {
      type: "message", id: "tool-2", parentId: "assistant-2", timestamp: "2026-11-02T12:00:00.000Z",
      message: {
        role: "toolResult", toolCallId: "call-1", toolName: "bash", isError: false, timestamp: 0,
        content: [{ type: "text", text: `HEAD${"o".repeat(5_000)}TAIL` }],
      },
    } as unknown as SessionEntry,
    {
      type: "message", id: "tool-3", parentId: "tool-2", timestamp: "2026-11-02T12:00:00.000Z",
      message: {
        role: "toolResult", toolCallId: "call-2", toolName: "write", isError: true, timestamp: 0,
        content: [{ type: "text", text: `ERRSTART${"e".repeat(10_000)}ERREND` }],
      },
    } as unknown as SessionEntry,
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
  assert.match(transcript, /\[tool call bash\] \{"command":"npm test"\}/);
  assert.match(transcript, /\[tool call write\] \{"content":"w+ \[\.\.\. cut\]/);
  assert.doesNotMatch(transcript, /Private reasoning/);
  assert.match(transcript, /## entry tool-2 \| toolResult \| bash\nHEAD/);
  assert.match(transcript, /\]\no+TAIL\n/);
  assert.match(transcript, /\[\.\.\. 4008 characters cut \.\.\.\]/);
  assert.match(transcript, /## entry tool-3 \| toolResult \| write \| error\nERRSTART/);
  assert.match(transcript, /\[\.\.\. 2014 characters cut \.\.\.\]\ne+ERREND/);
  assert.equal(dreamTest.clipMiddle("short", 10), "short");

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
    dreamTest.buildMemoryIndex(memoryRoot, 0, 4_000),
    "Accepted dream memory files:\n1 more file(s) are not listed. Search them with rg.",
  );
  assert.equal(
    dreamTest.buildMemoryIndex(memoryRoot, 20, 28),
    "Accepted dream memory files:\n1 more file(s) are not listed. Search them with rg.",
  );
  writeFileSync(
    join(memoryRoot, "global", "scoped.md"),
    "---\ndescription: Project only.\nscope: /tmp/project\n---\n\nScoped fact.\n",
  );
  writeFileSync(
    join(memoryRoot, "global", "long.md"),
    `---\ndescription: ${"d".repeat(400)}\n---\n\nLong description.\n`,
  );
  assert.match(dreamTest.buildMemoryIndex(memoryRoot, 20, 4_000, "/tmp/project/sub"), /scoped\.md: Project only/);
  assert.match(dreamTest.buildMemoryIndex(memoryRoot, 20, 4_000, "/tmp/project"), /scoped\.md/);
  assert.doesNotMatch(dreamTest.buildMemoryIndex(memoryRoot, 20, 4_000, "/tmp/projectile"), /scoped\.md/);
  assert.doesNotMatch(dreamTest.buildMemoryIndex(memoryRoot, 20, 4_000, "/tmp/other"), /scoped\.md/);
  assert.match(dreamTest.buildMemoryIndex(memoryRoot, 20, 4_000, "/tmp/other"), new RegExp(`long\\.md: ${"d".repeat(147)}\\.\\.\\.\\n`));
  assert.equal(dreamTest.scopeMatches("~/work", join(homedir(), "work", "repo")), true);
  assert.equal(dreamTest.scopeMatches("~/work", join(homedir(), "workshop")), false);
  assert.equal(dreamTest.scopeMatches(undefined, "/anywhere"), true);
  rmSync(join(memoryRoot, "global", "scoped.md"));
  rmSync(join(memoryRoot, "global", "long.md"));

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
  const findingsPath = join(jobDir, "worker-findings.jsonl");
  const findingContext = { memoryRoot, sessionId: "session-1", transcript: evidenceTranscript, findingsPath };
  const finding = workerTest.appendFinding(findingContext, {
    kind: "preference", subject: "answer style", statement: "The user wants short replies.",
    memoryPath: "global/answers.md",
    evidence: [{ entryId: "user-1", quote: "Use short replies." }],
  });
  assert.equal(finding.sessionId, "session-1");
  assert.deepEqual(workerTest.readFindings(findingsPath).map((item) => item.subject), ["answer style"]);
  assert.throws(() => workerTest.appendFinding(findingContext, {
    kind: "fact", subject: "x", statement: "Unsupported.",
    evidence: [{ entryId: "user-1", quote: "A quote that is not present." }],
  }), /evidence quote/);
  assert.throws(() => workerTest.appendFinding(findingContext, {
    kind: "fact", subject: "x", statement: "Wrong entry.",
    evidence: [{ entryId: "user-9", quote: "Use short replies." }],
  }), /entry user-9/);
  assert.throws(() => workerTest.appendFinding(findingContext, {
    kind: "guess" as "fact", subject: "x", statement: "Bad kind.",
    evidence: [{ entryId: "user-1", quote: "Use short replies." }],
  }), /kind is invalid/);
  assert.throws(() => workerTest.appendFinding(findingContext, {
    kind: "fact", subject: "s".repeat(81), statement: "Long subject.",
    evidence: [{ entryId: "user-1", quote: "Use short replies." }],
  }), /subject/);
  assert.throws(() => workerTest.appendFinding(findingContext, {
    kind: "fact", subject: "x", statement: "Escaping path.", memoryPath: "../outside.md",
    evidence: [{ entryId: "user-1", quote: "Use short replies." }],
  }), /outside the memory store/);
  assert.equal(workerTest.readFindings(findingsPath).length, 1);
  const editContext = {
    memoryRoot,
    jobDir,
    jobId: "job-1",
    findings: [{ id: "f1", ...finding }],
    now: () => "2026-11-02T12:30:00.000Z",
  };
  const created = await workerTest.applyMemoryEdit(editContext, {
    action: "write",
    path: "global/answers.md",
    expectedHash: "missing",
    content:
      "---\ndescription: Stable answer style.\n---\n\n# Answer style\n\nUse short replies.\n",
    reason: "Keep the explicit response preference.",
    findingIds: ["f1"],
  });
  assert.equal(created.path, "global/answers.md");
  assert.equal(created.oldHash, "missing");
  assert.notEqual(created.newHash, "missing");
  const createdRecord = JSON.parse(readFileSync(join(jobDir, "writes.jsonl"), "utf8").trim());
  assert.deepEqual(createdRecord.findingIds, ["f1"]);
  assert.deepEqual(createdRecord.sessionIds, ["session-1"]);
  assert.deepEqual(createdRecord.evidence, [{ sessionId: "session-1", entryId: "user-1", quote: "Use short replies." }]);

  await assert.rejects(
    workerTest.applyMemoryEdit(editContext, {
      action: "write",
      path: "global/answers.md",
      expectedHash: "stale-hash",
      content:
        "---\ndescription: Stable answer style.\n---\n\n# Answer style\n\nUse direct replies.\n",
      reason: "Change the preference.",
      findingIds: ["f1"],
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
      reason: "Use an unknown finding.",
      findingIds: ["f9"],
    }),
    /finding f9 does not exist/,
  );
  await assert.rejects(
    workerTest.applyMemoryEdit(editContext, {
      action: "write",
      path: "global/answers.md",
      expectedHash: created.newHash,
      content: `---\ndescription: ${"d".repeat(151)}\n---\n\nToo long.\n`,
      reason: "Use a long description.",
      findingIds: [],
    }),
    /longer than 150 characters/,
  );
  await assert.rejects(
    workerTest.applyMemoryEdit(editContext, {
      action: "write",
      path: "global/answers.md",
      expectedHash: created.newHash,
      content: "---\ndescription: Relative scope.\nscope: projects/x\n---\n\nBad scope.\n",
      reason: "Use a relative scope.",
      findingIds: [],
    }),
    /scope must be an absolute path/,
  );
  await assert.rejects(
    workerTest.applyMemoryEdit(editContext, {
      action: "write",
      path: "global/answers.md",
      expectedHash: created.newHash,
      content: "---\ndescription: Body scope.\n---\n\nscope: ~/work\n\nBody scope.\n",
      reason: "Put scope in the body.",
      findingIds: [],
    }),
    /below the front matter/,
  );
  for (const expectedHash of ["", "none"]) {
    const fresh = await workerTest.applyMemoryEdit(editContext, {
      action: "write",
      path: `global/new-${expectedHash || "empty"}.md`,
      expectedHash,
      content: "---\ndescription: New file.\n---\n\nNew.\n",
      reason: "Create a file without the missing keyword.",
      findingIds: [],
    });
    assert.equal(fresh.oldHash, "missing");
    rmSync(join(memoryRoot, fresh.path));
  }
  await assert.rejects(
    workerTest.applyMemoryEdit(editContext, {
      action: "write",
      path: "global/answers.md",
      expectedHash: "none",
      content: "---\ndescription: Overwrite.\n---\n\nOverwrite.\n",
      reason: "Overwrite an existing file without its hash.",
      findingIds: [],
    }),
    /hash changed/,
  );
  await assert.rejects(
    workerTest.applyMemoryEdit({ ...editContext, cwd: join(homedir(), "work") }, {
      action: "write",
      path: "global/answers.md",
      expectedHash: created.newHash,
      content: "---\ndescription: Too narrow.\nscope: ~/work/sub\n---\n\nNarrow scope.\n",
      reason: "Use a scope below the batch folder.",
      findingIds: [],
    }),
    /does not contain the batch folder/,
  );
  const scopedEdit = await workerTest.applyMemoryEdit({ ...editContext, cwd: join(homedir(), "work", "repo") }, {
    action: "write",
    path: "global/answers.md",
    expectedHash: created.newHash,
    content: "---\ndescription: Stable answer style.\nscope: ~/work\n---\n\n# Answer style\n\nUse short replies.\n",
    reason: "Limit the file to one project.",
    findingIds: [],
  });
  assert.deepEqual(
    workerTest.listMarkdown(memoryRoot).find((entry) => entry.path === "global/answers.md")?.scope,
    "~/work",
  );
  const cleanupRecord = JSON.parse(readFileSync(join(jobDir, "writes.jsonl"), "utf8").trim().split("\n").at(-1)!);
  assert.deepEqual([cleanupRecord.findingIds, cleanupRecord.sessionIds, cleanupRecord.evidence], [[], [], []]);

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
      findingIds: ["f1"],
    }),
    /symlink/,
  );

  const sourceHash = scopedEdit.newHash;
  const moved = await workerTest.applyMemoryEdit(editContext, {
    action: "move",
    path: "global/answers.md",
    expectedHash: sourceHash,
    destination: "global/style.md",
    expectedDestinationHash: "missing",
    reason: "Use a clearer file name.",
    findingIds: ["f1"],
  });
  assert.equal(moved.path, "global/style.md");
  assert.equal(existsSync(join(memoryRoot, "global", "answers.md")), false);
  assert.equal(existsSync(join(memoryRoot, "global", "style.md")), true);

  await workerTest.applyMemoryEdit(editContext, {
    action: "delete",
    path: "global/style.md",
    expectedHash: moved.newHash,
    reason: "Remove a duplicate file.",
    findingIds: ["f1"],
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

  const modelContext = {
    model: { provider: "active", id: "current", api: "test" },
    modelRegistry: { find: (provider: string) => provider === "virtual" ? { api: "pi-virtual" } : undefined },
  } as unknown as ExtensionContext;
  const selectModels = (dream: Record<string, unknown>, ctx = modelContext) => {
    const api = { getSettings: () => ({ dream }) } as unknown as ExtensionAPI;
    return ["workerModel", "orchestratorModel"].map((role) =>
      dreamTest.selectModel(api, ctx, role as "workerModel" | "orchestratorModel"));
  };
  assert.deepEqual(selectModels({}), ["active/current", "active/current"]);
  assert.deepEqual(selectModels({ model: "default/model" }), ["default/model", "default/model"]);
  assert.deepEqual(selectModels({ model: "default/model", workerModel: "pool/model" }), ["pool/model", "default/model"]);
  assert.deepEqual(selectModels({ model: "default/model", orchestratorModel: "review/model" }), ["default/model", "review/model"]);
  assert.deepEqual(selectModels({ workerModel: "pool/model", orchestratorModel: "review/model" }), ["pool/model", "review/model"]);
  const virtualContext = { ...modelContext, model: { provider: "virtual", id: "router", api: "pi-virtual" } } as ExtensionContext;
  assert.deepEqual(selectModels({}, virtualContext), [null, null]);
  assert.deepEqual(selectModels({ workerModel: "pool/model", orchestratorModel: "review/model" }, virtualContext),
    ["pool/model", "review/model"]);
  for (const invalid of ["", "missing-slash", "/model", "provider/", "provider/model name", 123, "virtual/router"]) {
    assert.deepEqual(selectModels({ model: invalid }), [null, null]);
    assert.deepEqual(selectModels({ model: "default/model", workerModel: invalid }), [null, "default/model"]);
    assert.deepEqual(selectModels({ model: "default/model", orchestratorModel: invalid }), ["default/model", null]);
  }

  const commands = new Map<string, { handler: Function }>();
  const tools = new Map<string, { execute: Function }>();
  const events = new Map<string, Function>();
  let dreamSettings: Record<string, unknown> = { model: "openai-codex/gpt-test" };
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
      return { dream: dreamSettings };
    },
  } as unknown as ExtensionAPI;
  piDream(pi);
  assert.deepEqual([...commands.keys()].sort(), [
    "dream",
    "dream-apply",
    "dream-discard",
    "dream-resume",
    "dream-review",
    "dream-status",
  ]);
  assert.deepEqual([...tools.keys()], ["dream_note"]);

  const noteContext = {
    cwd: tempRoot, sessionManager: { getSessionId: () => "note-session" },
  } as unknown as ExtensionContext;
  const noteResult = await tools.get("dream_note")!.execute("call-1", {
    kind: "preference", subject: "reply style", statement: "Use short replies.", memoryPath: "@global/preferences.md",
  }, undefined, undefined, noteContext);
  const noteFiles = readdirSync(join(dreamHome, "inbox"));
  assert.equal(noteFiles.length, 1);
  const storedNote = JSON.parse(readFileSync(join(dreamHome, "inbox", noteFiles[0]), "utf8"));
  assert.equal(storedNote.sessionId, "note-session");
  assert.equal(storedNote.cwd, tempRoot);
  assert.equal(storedNote.memoryPath, "global/preferences.md");
  assert.equal(storedNote.kind, "preference");
  assert.match(noteResult.content[0].text, new RegExp(`Note ${storedNote.id} recorded`));
  await assert.rejects(tools.get("dream_note")!.execute("call-2", {
    kind: "fact", subject: "long", statement: "x".repeat(1_001),
  }, undefined, undefined, noteContext), /invalid/);
  await assert.rejects(tools.get("dream_note")!.execute("call-3", {
    kind: "fact", subject: "bad path", statement: "A fact.", memoryPath: "/etc/passwd.md",
  }, undefined, undefined, noteContext), /invalid/);
  assert.equal(readdirSync(join(dreamHome, "inbox")).length, 1);

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
      assert.ok(confirmation.startsWith(`${count} session(s) and 1 note(s)`), confirmation);
      assert.match(confirmation, /Up to 10 worker\(s\) will run at once\./);
      assert.match(confirmation, /worker model openai-codex\/gpt-test/);
      assert.match(confirmation, /orchestrator model openai-codex\/gpt-test/);
    }
  } finally {
    SessionManager.list = originalList;
  }

  const roleHome = join(tempRoot, "role-home");
  const roleMemory = join(tempRoot, "role-memory");
  const rolePi = join(tempRoot, "role-pi.mjs");
  writeFileSync(rolePi, [
    "#!/usr/bin/env node",
    'import { appendFileSync, readFileSync, writeFileSync } from "node:fs";',
    'import { join } from "node:path";',
    "readFileSync(0);",
    'const phase = process.env.PI_DREAM_PHASE;',
    'const args = process.argv.slice(2);',
    'appendFileSync(join(process.env.PI_DREAM_PARENT_JOB_DIR, "models.jsonl"), JSON.stringify({ phase, model: args[args.indexOf("--model") + 1] }) + "\\n");',
    'if (phase === "extract") writeFileSync(process.env.PI_DREAM_FINDINGS, JSON.stringify({ sessionId: process.env.PI_DREAM_SESSION_ID, kind: "preference", subject: "test replies", statement: "Use short replies.", evidence: [{ entryId: "user-1", quote: "Use short replies." }] }) + "\\n");',
    'console.log(JSON.stringify({ type: "agent_end", messages: [{ role: "assistant", stopReason: "stop" }] }));',
  ].join("\n"));
  chmodSync(rolePi, 0o755);
  const originalOpen = SessionManager.open;
  const savedRolePiBin = process.env.PI_DREAM_PI_BIN;
  try {
    process.env.PI_DREAM_HOME = roleHome;
    process.env.PI_DREAM_MEMORY_ROOT = roleMemory;
    process.env.PI_DREAM_PI_BIN = rolePi;
    dreamSettings = { model: "default/model", workerModel: "pool/model", orchestratorModel: "other/orchestrator" };
    SessionManager.list = async () => [{
      id: "role-session", path: join(tempRoot, "role-session.jsonl"), cwd: tempRoot,
      created: new Date(0), modified: new Date(0),
    }] as Awaited<ReturnType<typeof SessionManager.list>>;
    SessionManager.open = (() => ({
      getBranch: () => [messageEntry("user-1", "user", "Use short replies.")],
    })) as unknown as typeof SessionManager.open;
    let confirmation = "";
    await commands.get("dream")!.handler("1", {
      ...modelContext, cwd: tempRoot, hasUI: true,
      ui: {
        confirm: async (_title: string, text: string) => { confirmation = text; return true; },
        notify: () => {},
      },
    } as unknown as ExtensionContext);
    assert.match(confirmation, /worker model pool\/model/);
    assert.match(confirmation, /orchestrator model other\/orchestrator/);
    const [id] = readdirSync(join(roleHome, "jobs"));
    const dir = join(roleHome, "jobs", id);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    assert.equal(manifest.model, "pool/model");
    assert.equal(manifest.orchestratorModel, "other/orchestrator");
    const deadline = Date.now() + 5_000;
    let state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
    while (["queued", "running"].includes(state.status)) {
      if (Date.now() > deadline) throw new Error("The role model command did not finish.");
      await new Promise((resolve) => setTimeout(resolve, 20));
      state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
    }
    assert.equal(state.status, "ready", state.error);
    assert.deepEqual(readFileSync(join(dir, "models.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line)), [
      { phase: "extract", model: "pool/model" },
      { phase: "consolidate", model: "other/orchestrator" },
    ]);
    assert.equal(git(roleMemory, "rev-parse", "HEAD"), manifest.base.baseCommit);
  } finally {
    SessionManager.list = originalList;
    SessionManager.open = originalOpen;
    dreamSettings = { model: "openai-codex/gpt-test" };
    process.env.PI_DREAM_HOME = dreamHome;
    process.env.PI_DREAM_MEMORY_ROOT = memoryRoot;
    if (savedRolePiBin === undefined) delete process.env.PI_DREAM_PI_BIN;
    else process.env.PI_DREAM_PI_BIN = savedRolePiBin;
  }

  assert.deepEqual(dreamTest.workerExtensions(pi), []);
  const extensionPaths = dreamTest.workerExtensions({
    getSettings: () => ({ dream: { extensions: ["~/gateway/index.ts", "/abs/provider.ts", 3, ""] } }),
  } as unknown as ExtensionAPI);
  assert.deepEqual(extensionPaths, [join(homedir(), "gateway/index.ts"), "/abs/provider.ts"]);
  const args = runnerTest.workerArgs({ workerExtension: "/w.ts", extensions: extensionPaths, model: "p/m" });
  assert.deepEqual(args.slice(args.indexOf("--extension"), args.indexOf("--tools")), [
    "--extension", "/w.ts", "--extension", extensionPaths[0], "--extension", "/abs/provider.ts",
  ]);
  assert.ok(runnerTest.workerArgs({ workerExtension: "/w.ts", model: "p/m" }).includes("--no-extensions"));

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
    "dream_finding",
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
      successfulWorkerEnd,
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
    'console.log(JSON.stringify({type:"agent_end",messages:[{role:"assistant",stopReason:"stop"}]}));',
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
      successfulWorkerEnd,
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

  const poolStarts: number[] = [];
  const poolFailure = await runnerTest.runPool([30, 5, 5, 5, 5], 2, async (delay: number, index: number) => {
    poolStarts.push(index);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return { ok: index !== 2, error: `failed ${index}` };
  });
  assert.deepEqual(poolFailure, { ok: false, error: "failed 2" });
  assert.deepEqual(poolStarts.slice(0, 3), [0, 1, 2], "a slow worker does not block the next worker");
  assert.ok(!poolStarts.includes(4), "no new worker starts after a failure");

  const phaseLive = join(tempRoot, "phase-live");
  const phaseJob = join(tempRoot, "phase-job");
  const phaseCandidate = join(phaseJob, "candidate");
  dreamTest.initializeMemoryStore(phaseLive);
  const phaseBase = dreamTest.createCandidateSnapshot(phaseLive, phaseCandidate);
  mkdirSync(join(phaseJob, "transcripts"), { recursive: true });
  const phaseSessions = ["phase-a", "phase-b", "phase-c"].map((sessionId) => {
    const path = join(phaseJob, "transcripts", `${sessionId}.md`);
    writeFileSync(path, `## entry user-1 | user\nRemember ${sessionId}.\n`);
    return { sessionId, path, createdAt: "2026-11-02T12:00:00.000Z" };
  });
  const phasePi = join(tempRoot, "phase-pi.sh");
  writeFileSync(phasePi, [
    "#!/bin/sh",
    'if [ "$PI_DREAM_PHASE" = "consolidate" ]; then',
    '  cat > "$PI_DREAM_PARENT_JOB_DIR/consolidate-prompt.md"',
    '  printf "%s\\n" "$*" > "$PI_DREAM_PARENT_JOB_DIR/consolidate-args"',
    '  cp "$PI_DREAM_FINDINGS" "$PI_DREAM_PARENT_JOB_DIR/seen-findings.jsonl"',
    '  printf "%s" "$PI_DREAM_CWD" > "$PI_DREAM_PARENT_JOB_DIR/consolidate-cwd"',
    '  printf -- "---\\ndescription: Shared subject.\\n---\\n\\nMerged.\\n" > "$PI_DREAM_MEMORY_ROOT/merged.md"',
    successfulWorkerEnd,
    "  exit 0",
    "fi",
    "cat >/dev/null",
    'printf "%s\\n" "$*" > "$PI_DREAM_PARENT_JOB_DIR/extract-args"',
    'if [ "$PI_DREAM_SESSION_ID" != "phase-c" ]; then',
    '  printf "{\\"sessionId\\":\\"%s\\",\\"kind\\":\\"fact\\",\\"subject\\":\\"Shared Subject\\",\\"statement\\":\\"Fact from %s.\\",\\"evidence\\":[{\\"entryId\\":\\"user-1\\",\\"quote\\":\\"Remember %s.\\"}]}\\n" "$PI_DREAM_SESSION_ID" "$PI_DREAM_SESSION_ID" "$PI_DREAM_SESSION_ID" > "$PI_DREAM_FINDINGS"',
    "fi",
    successfulWorkerEnd,
  ].join("\n"));
  chmodSync(phasePi, 0o755);
  const phaseManifest = join(phaseJob, "manifest.json");
  writeFileSync(phaseManifest, JSON.stringify({
    version: 2, id: "phase-job", cwd: tempRoot, model: "test/model", concurrency: 3,
    memoryRoot: phaseLive, candidateRoot: phaseCandidate, jobDir: phaseJob,
    workerExtension: join(tempRoot, "worker-extension.ts"),
    sessionIds: phaseSessions.map((item) => item.sessionId), transcripts: phaseSessions, base: phaseBase,
  }));
  writeFileSync(join(phaseJob, "state.json"), JSON.stringify({ id: "phase-job", status: "queued", completed: 0, total: 3 }));
  assert.deepEqual(await runJob(phaseManifest, { piBin: phasePi, timeoutMs: 5_000 }), { status: "ready" });
  const merged = readFileSync(join(phaseJob, "findings.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(merged.map((item) => [item.id, item.sessionId]), [["f1", "phase-a"], ["f2", "phase-b"]]);
  assert.equal(readFileSync(join(phaseJob, "seen-findings.jsonl"), "utf8"), readFileSync(join(phaseJob, "findings.jsonl"), "utf8"));
  const consolidateText = readFileSync(join(phaseJob, "consolidate-prompt.md"), "utf8");
  assert.match(consolidateText, /from 2 of 3 session\(s\)/);
  assert.equal(readFileSync(join(phaseJob, "consolidate-cwd"), "utf8"), tempRoot);
  assert.match(consolidateText, /### Shared Subject \(2 session\(s\)\)/);
  assert.match(consolidateText, /- f1 \[fact\] \(session phase-a\) Fact from phase-a\./);
  assert.match(consolidateText, /  > user-1: Remember phase-b\./);
  assert.match(readFileSync(join(phaseJob, "consolidate-args"), "utf8"), /dream_memory_list,dream_memory_read,dream_memory_edit/);
  assert.match(readFileSync(join(phaseJob, "extract-args"), "utf8"), /dream_memory_list,dream_memory_read,dream_finding/);
  assert.doesNotMatch(readFileSync(join(phaseJob, "extract-args"), "utf8"), /dream_memory_edit/);
  assert.equal(git(phaseLive, "diff", "--name-only", "master..dream/phase-job"), "merged.md");
  assert.equal(JSON.parse(readFileSync(join(phaseJob, "state.json"), "utf8")).phase, undefined);

  const groups = runnerTest.groupFindings([
    { sessionId: "s1", subject: "B topic" }, { sessionId: "s1", subject: "a topic" },
    { sessionId: "s2", subject: "A  Topic" }, { sessionId: "s1", subject: "B topic" },
  ]);
  assert.deepEqual(groups.map((group: { subject: string; sessions: number }) => [group.subject, group.sessions]), [
    ["a topic", 2], ["B topic", 1],
  ]);
  const pathGroups = runnerTest.groupFindings([
    { sessionId: "s1", subject: "likec4 validate", memoryPath: "likec4.md" },
    { sessionId: "s2", subject: "likec4 build check", memoryPath: "likec4.md" },
    { sessionId: "s3", subject: "likec4 validate" },
  ]);
  assert.deepEqual(pathGroups.map((group: { subject: string; sessions: number }) => [group.subject, group.sessions]), [
    ["memory likec4.md", 2], ["likec4 validate", 1],
  ]);
  const pathPrompt = runnerTest.consolidatePrompt(
    { candidateRoot: phaseCandidate, cwd: join(homedir(), "projects"), transcripts: [{}, {}] },
    [{ id: "f1", sessionId: "s1", kind: "fact", subject: "likec4 validate", memoryPath: "likec4.md", statement: "Run validate.", evidence: [] }],
  );
  assert.match(pathPrompt, /### memory likec4\.md \(1 session\(s\)\)\n- f1 \[fact\] \(session s1, subject likec4 validate\) Run validate\./);
  assert.match(pathPrompt, /A scope line must name that folder or a parent folder, for example "scope: ~\/projects"/);

  const competing = await Promise.allSettled(["A", "B"].map((name) => workerTest.applyMemoryEdit(editContext, {
    action: "write", path: "global/race.md", expectedHash: "missing",
    content: `---\ndescription: Race result.\n---\n\n${name}\n`,
    reason: "Keep a supported preference.",
    findingIds: ["f1"],
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
    successfulWorkerEnd,
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
  // Different files merge without a worker. The result is one merge commit with both parents.
  const batchACommit = git(concurrentMemory, "rev-parse", "HEAD");
  const batchBTip = git(concurrentMemory, "rev-parse", "dream/batch-b");
  assert.equal(dreamTest.applyReviewBranch(batchB), "applied");
  const mergedCommit = git(concurrentMemory, "rev-parse", "HEAD");
  assert.equal(git(concurrentMemory, "rev-parse", "dream/batch-b"), mergedCommit);
  assert.deepEqual(git(concurrentMemory, "rev-parse", `${mergedCommit}^1`, `${mergedCommit}^2`).split("\n"),
    [batchACommit, batchBTip]);
  assert.equal(git(concurrentMemory, "diff", "--name-only", batchACommit, mergedCommit), "batch-b.md");
  assert.equal(git(concurrentMemory, "status", "--porcelain"), "");
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
  // A moved master without a text conflict merges and applies in one command.
  const advancedCommit = git(concurrentMemory, "rev-parse", "HEAD");
  await commands.get("dream-apply")!.handler(refused.id, commandContext);
  const refusedMerge = git(concurrentMemory, "rev-parse", "HEAD");
  assert.deepEqual(git(concurrentMemory, "rev-parse", `${refusedMerge}^1`, `${refusedMerge}^2`).split("\n"),
    [advancedCommit, refusedCommit]);
  assert.equal(JSON.parse(readFileSync(join(refused.jobDir, "state.json"), "utf8")).status, "applied");
  assert.match(notifications.at(-1)!, /Applied Pi Dream job refused-apply\./);
  assert.throws(() => git(concurrentMemory, "rev-parse", "--verify", "refs/heads/dream/refused-apply"));

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
  const failedRoot = join(failed.jobDir, "workers", "000-failed");
  const failedWorker = join(failedRoot, readdirSync(failedRoot).find((name) => name.startsWith("attempt-"))!);
  assert.match(failedState.error, /Codex quota exhausted\./);
  assert.match(failedState.error, /worker\.error\.log/);
  assert.equal(readFileSync(join(failedWorker, "worker.error.log"), "utf8"), "Codex quota exhausted.\n");
  assert.doesNotMatch(readFileSync(join(failedWorker, "worker.log"), "utf8"), /Codex quota exhausted/);
  assert.throws(() => git(concurrentMemory, "rev-parse", "--verify", "refs/heads/dream/failed"));
  assert.deepEqual(dreamTest.availableSessions(concurrentHome, [{ id: "failed" }]), [{ id: "failed" }]);

  const cancelledResume = makeJob("cancelled-resume");
  writeFileSync(join(cancelledResume.jobDir, "state.json"), JSON.stringify({
    id: cancelledResume.id, status: "failed", completed: 0, total: 1,
  }));
  let resumeConfirmation = "";
  await commands.get("dream-resume")!.handler(cancelledResume.id, {
    ...commandContext,
    ui: { ...commandContext.ui, confirm: async (_title: string, message: string) => {
      resumeConfirmation = message;
      return false;
    } },
  });
  assert.match(resumeConfirmation, /worker model test\/model/);
  assert.match(resumeConfirmation, /orchestrator model test\/model/);
  writeFileSync(join(cancelledResume.jobDir, "manifest.json"), JSON.stringify({
    ...cancelledResume, orchestratorModel: "other/orchestrator",
  }));
  await commands.get("dream-resume")!.handler(cancelledResume.id, {
    ...commandContext,
    ui: { ...commandContext.ui, confirm: async (_title: string, message: string) => {
      resumeConfirmation = message;
      return false;
    } },
  });
  assert.match(resumeConfirmation, /worker model test\/model/);
  assert.match(resumeConfirmation, /orchestrator model other\/orchestrator/);
  assert.match(resumeConfirmation, /unfinished transcripts/);
  assert.equal(JSON.parse(readFileSync(join(cancelledResume.jobDir, "state.json"), "utf8")).status, "failed");
  await commands.get("dream-resume")!.handler(cancelledResume.id, { ...commandContext, hasUI: false });
  assert.equal(JSON.parse(readFileSync(join(cancelledResume.jobDir, "state.json"), "utf8")).status, "failed");
  for (const status of ["ready", "applied", "discarded"]) {
    writeFileSync(join(cancelledResume.jobDir, "state.json"), JSON.stringify({ id: cancelledResume.id, status }));
    await assert.rejects(commands.get("dream-resume")!.handler(cancelledResume.id, commandContext), /cannot resume/);
  }
  writeFileSync(join(cancelledResume.jobDir, "state.json"), JSON.stringify({ id: cancelledResume.id, status: "failed" }));
  mkdirSync(join(cancelledResume.jobDir, ".runner-lock"));
  await assert.rejects(commands.get("dream-resume")!.handler(cancelledResume.id, commandContext), /runner lock/);
  rmSync(join(cancelledResume.jobDir, ".runner-lock"), { recursive: true });
  writeFileSync(join(cancelledResume.jobDir, "state.json"), JSON.stringify({
    id: cancelledResume.id, status: "running", runnerPid: process.pid,
  }));
  await assert.rejects(commands.get("dream-resume")!.handler(cancelledResume.id, commandContext), /still active/);
  writeFileSync(join(cancelledResume.jobDir, "state.json"), JSON.stringify({ id: cancelledResume.id, status: "failed" }));

  await assert.rejects(commands.get("dream-resume")!.handler(cancelledResume.id, {
    ...commandContext,
    ui: { ...commandContext.ui, confirm: async () => {
      writeFileSync(join(cancelledResume.jobDir, "state.json"), JSON.stringify({
        id: cancelledResume.id, status: "running", runnerPid: process.pid,
      }));
      return true;
    } },
  }), /still active/);
  assert.equal(JSON.parse(readFileSync(join(cancelledResume.jobDir, "state.json"), "utf8")).runnerPid, process.pid);
  writeFileSync(join(cancelledResume.jobDir, "state.json"), JSON.stringify({ id: cancelledResume.id, status: "failed" }));

  const reservedResume = makeJob("reserved-resume");
  writeFileSync(join(reservedResume.jobDir, "manifest.json"), JSON.stringify({
    ...reservedResume, sessionIds: cancelledResume.sessionIds,
  }));
  await assert.rejects(commands.get("dream-resume")!.handler(cancelledResume.id, commandContext), /already reserves/);
  writeFileSync(join(reservedResume.jobDir, "state.json"), JSON.stringify({ id: reservedResume.id, status: "failed" }));
  dreamTest.assertResumable(concurrentHome, cancelledResume.jobDir);
  dreamTest.markSessionsProcessed(join(concurrentHome, "state.json"), cancelledResume.sessionIds);
  await assert.rejects(commands.get("dream-resume")!.handler(cancelledResume.id, commandContext), /already accepted/);

  const resumeCli = makeJob("resume-cli");
  writeFileSync(join(resumeCli.jobDir, "state.json"), JSON.stringify({
    id: resumeCli.id, status: "failed", completed: 0, total: 1,
  }));
  const resumePi = join(tempRoot, "resume-pi.sh");
  writeFileSync(resumePi, ["#!/bin/sh", "cat >/dev/null", successfulWorkerEnd].join("\n"));
  chmodSync(resumePi, 0o755);
  const originalPiBin = process.env.PI_DREAM_PI_BIN;
  process.env.PI_DREAM_PI_BIN = resumePi;
  try {
    await commands.get("dream-resume")!.handler(resumeCli.id, commandContext);
    const deadline = Date.now() + 5_000;
    while (["running", "queued"].includes(JSON.parse(readFileSync(join(resumeCli.jobDir, "state.json"), "utf8")).status)) {
      if (Date.now() > deadline) throw new Error("The resume command did not finish.");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(JSON.parse(readFileSync(join(resumeCli.jobDir, "state.json"), "utf8")).status, "ready");
    assert.match(notifications.at(-1)!, /resumed/);
    assert.match(git(concurrentMemory, "log", "-1", "--format=%s", "dream/resume-cli"), /Dream batch resume-cli/);
  } finally {
    if (originalPiBin === undefined) delete process.env.PI_DREAM_PI_BIN;
    else process.env.PI_DREAM_PI_BIN = originalPiBin;
  }

  const silentFailure = makeJob("silent-failure");
  const silentFailPi = join(tempRoot, "silent-fail-pi.sh");
  writeFileSync(silentFailPi, "#!/bin/sh\ncat >/dev/null\nexit 1\n");
  chmodSync(silentFailPi, 0o755);
  assert.equal((await runJob(join(silentFailure.jobDir, "manifest.json"), { piBin: silentFailPi, retryDelayMs: 1 })).status, "failed");
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

  async function waitForJob(jobDir: string): Promise<{ status: string; error?: string; publishedCommit?: string }> {
    const deadline = Date.now() + 10_000;
    while (true) {
      const state = JSON.parse(readFileSync(join(jobDir, "state.json"), "utf8"));
      if (!["queued", "running"].includes(state.status)) return state;
      if (Date.now() > deadline) throw new Error(`The job ${jobDir} did not finish.`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  function readState(jobDir: string) {
    return JSON.parse(readFileSync(join(jobDir, "state.json"), "utf8"));
  }

  // Extraction never touches the candidate, so a moved master refreshes it before consolidation.
  const refresh = makeJob("refresh");
  const refreshPi = join(tempRoot, "refresh-pi.sh");
  writeFileSync(refreshPi, [
    "#!/bin/sh", "cat >/dev/null",
    `printf -- "---\\ndescription: Moved master.\\n---\\n\\nNew.\\n" > "${concurrentMemory}/moved.md"`,
    `git -C "${concurrentMemory}" add moved.md`,
    `git -C "${concurrentMemory}" -c user.name=Test -c user.email=test@local commit -q -m "Move master"`,
    successfulWorkerEnd,
  ].join("\n"));
  chmodSync(refreshPi, 0o755);
  assert.deepEqual(await runJob(join(refresh.jobDir, "manifest.json"), { piBin: refreshPi, timeoutMs: 5_000 }), { status: "ready" });
  const movedMaster = git(concurrentMemory, "rev-parse", "master");
  assert.notEqual(movedMaster, refresh.base.baseCommit);
  assert.equal(JSON.parse(readFileSync(join(refresh.jobDir, "manifest.json"), "utf8")).base.baseCommit, movedMaster);
  assert.equal(git(concurrentMemory, "rev-parse", "dream/refresh^"), movedMaster);
  assert.equal(existsSync(join(refresh.candidateRoot, "moved.md")), true);

  // Two batches change the same line. A worker resolves the conflict before the user applies.
  const conflictA = makeJob("conflict-a");
  const conflictB = makeJob("conflict-b");
  for (const [job, text] of [[conflictA, "Side A."], [conflictB, "Side B."]] as const) {
    writeFileSync(join(job.candidateRoot, "conflict.md"), `---\ndescription: Conflicting memory.\n---\n\n${text}\n`);
    const commit = dreamTest.publishJob(job);
    writeFileSync(join(job.jobDir, "state.json"), JSON.stringify({
      id: job.id, status: "ready", completed: 1, total: 1, publishedCommit: commit, branch: `dream/${job.id}`,
    }));
  }
  await commands.get("dream-apply")!.handler("conflict-a", commandContext);
  assert.equal(readState(conflictA.jobDir).status, "applied");
  const masterAfterA = git(concurrentMemory, "rev-parse", "HEAD");
  const conflictBTip = git(concurrentMemory, "rev-parse", "dream/conflict-b");
  const badMergePi = join(tempRoot, "bad-merge-pi.sh");
  writeFileSync(badMergePi, ["#!/bin/sh", 'cat > "$PI_DREAM_PARENT_JOB_DIR/prompt-$PI_DREAM_PHASE"', successfulWorkerEnd].join("\n"));
  chmodSync(badMergePi, 0o755);
  const mergePi = join(tempRoot, "merge-pi.sh");
  writeFileSync(mergePi, [
    "#!/bin/sh", "cat >/dev/null",
    'printf -- "---\\ndescription: Conflicting memory.\\n---\\n\\nSide A.\\nSide B.\\n" > "$PI_DREAM_MEMORY_ROOT/conflict.md"',
    successfulWorkerEnd,
  ].join("\n"));
  chmodSync(mergePi, 0o755);
  const savedPiBin = process.env.PI_DREAM_PI_BIN;
  try {
    process.env.PI_DREAM_PI_BIN = badMergePi;
    await commands.get("dream-apply")!.handler("conflict-b", commandContext);
    assert.match(notifications.at(-1)!, /master moved\. A worker resolves the merge for job conflict-b\./);
    const failedMerge = await waitForJob(conflictB.jobDir);
    assert.equal(failedMerge.status, "failed");
    assert.match(failedMerge.error!, /Conflict markers remain in conflict\.md\./);
    assert.equal(git(concurrentMemory, "rev-parse", "dream/conflict-b"), conflictBTip);
    assert.equal(git(concurrentMemory, "rev-parse", "HEAD"), masterAfterA);
    const mergePromptText = readFileSync(join(conflictB.jobDir, "prompt-merge"), "utf8");
    assert.match(mergePromptText, /master holds newer accepted memory/);
    assert.match(mergePromptText, /## Conflicted files\n\n- conflict\.md\n/);
    const mergeAttempts = readdirSync(join(conflictB.jobDir, "workers", "merge")).filter((name) => name.startsWith("attempt-"));
    assert.equal(mergeAttempts.length, 1);
    const conflicted = readFileSync(join(conflictB.jobDir, "workers", "merge", mergeAttempts[0], "candidate", "conflict.md"), "utf8");
    assert.match(conflicted, /^<<<<<<< /m);
    assert.match(conflicted, /^\|\|\|\|\|\|\| /m);
    assert.match(conflicted, /^>>>>>>> /m);
    assert.match(conflicted, /Side A\.[\s\S]*Side B\./);
    assert.throws(() => runnerTest.rejectConflictMarkers(join(conflictB.jobDir, "workers", "merge", mergeAttempts[0], "candidate")), /Conflict markers remain/);

    process.env.PI_DREAM_PI_BIN = mergePi;
    await commands.get("dream-resume")!.handler("conflict-b", commandContext);
    const resolved = await waitForJob(conflictB.jobDir);
    assert.equal(resolved.status, "ready", resolved.error);
    const resolvedTip = git(concurrentMemory, "rev-parse", "dream/conflict-b");
    assert.equal(resolved.publishedCommit, resolvedTip);
    assert.deepEqual(git(concurrentMemory, "rev-parse", `${resolvedTip}^1`, `${resolvedTip}^2`).split("\n"), [masterAfterA, conflictBTip]);
    assert.equal(git(concurrentMemory, "rev-parse", "HEAD"), masterAfterA);
    await commands.get("dream-review")!.handler("conflict-b", commandContext);
    const mergeReport = readFileSync(join(conflictB.jobDir, "diff.md"), "utf8");
    assert.match(mergeReport, /^\+Side B\.$/m);
    assert.doesNotMatch(mergeReport, /^-Side A\.$/m);
    assert.match(mergeReport, /Merge master into dream\/conflict-b/);
    await commands.get("dream-apply")!.handler("conflict-b", commandContext);
    assert.equal(git(concurrentMemory, "rev-parse", "HEAD"), resolvedTip);
    assert.equal(readFileSync(join(concurrentMemory, "conflict.md"), "utf8"), "---\ndescription: Conflicting memory.\n---\n\nSide A.\nSide B.\n");
    assert.equal(readState(conflictB.jobDir).status, "applied");
    assert.equal(git(concurrentMemory, "status", "--porcelain"), "");
  } finally {
    if (savedPiBin === undefined) delete process.env.PI_DREAM_PI_BIN;
    else process.env.PI_DREAM_PI_BIN = savedPiBin;
  }
  const underline = join(tempRoot, "underline");
  mkdirSync(underline);
  writeFileSync(join(underline, "h.md"), "---\ndescription: Heading underline.\n---\n\nTitle\n=======\n");
  runnerTest.rejectConflictMarkers(underline);

  // Notes: prompt section, scope, note-only batches, reservation, and inbox cleanup.
  const noteHome = join(tempRoot, "note-home");
  process.env.PI_DREAM_HOME = noteHome;
  const localNote = writeNote(noteHome, { kind: "fact", subject: "project port", statement: "The API listens on port 8080.", cwd: tempRoot, sessionId: "s-local" });
  const otherNote = writeNote(noteHome, { kind: "fact", subject: "other project", statement: "Hidden elsewhere.", cwd: join(tempRoot, "other"), sessionId: "s-other" });
  const globalNote = writeNote(noteHome, { kind: "preference", subject: "reply style", statement: "Use short\nreplies.", sessionId: "s-global" });
  writeFileSync(join(noteHome, "inbox", "broken.json"), "{not json");
  writeFileSync(join(noteHome, "inbox", "bad-kind.json"), JSON.stringify({ ...globalNote, id: "bad-kind", kind: "rumor" }));
  const noteEvent = { systemPromptOptions: { sections: {} as Record<string, string> } };
  events.get("before_agent_start")!(noteEvent, { cwd: tempRoot } as ExtensionContext);
  const notePrompt = noteEvent.systemPromptOptions.sections["dream-memory"];
  assert.match(notePrompt, /Call dream_note when you learn a durable fact/);
  assert.match(notePrompt, /Pending memory notes \(not yet consolidated\)\. Past sessions proposed these\. They are not accepted memory\./);
  assert.match(notePrompt, /^- \[fact\] project port: The API listens on port 8080\.$/m);
  assert.match(notePrompt, /^- \[preference\] reply style: Use short replies\.$/m);
  assert.doesNotMatch(notePrompt, /Hidden elsewhere|rumor/);
  const manyNotes = Array.from({ length: 60 }, (_, index) => ({ ...globalNote, id: `n${index}`, statement: `Statement ${index}.` }));
  assert.equal(dreamTest.buildNoteIndex(manyNotes, 50, 100_000).split("\n").length, 52);
  assert.match(dreamTest.buildNoteIndex(manyNotes, 50, 100_000), /10 more note\(s\) are not listed\.$/);
  assert.match(dreamTest.buildNoteIndex(manyNotes, 50, 200), /\d+ more note\(s\) are not listed\.$/);
  assert.equal(dreamTest.buildNoteIndex([], 50, 200), "");

  function noteJob(id: string, noteIds: string[]) {
    const dir = join(noteHome, "jobs", id);
    const candidate = join(dir, "candidate");
    const base = dreamTest.createCandidateSnapshot(concurrentMemory, candidate);
    const manifest = {
      version: 2, id, cwd: tempRoot, createdAt: "2026-11-06T12:00:00.000Z", model: "test/model", concurrency: 1,
      memoryRoot: concurrentMemory, candidateRoot: candidate, jobDir: dir,
      workerExtension: join(tempRoot, "worker-extension.ts"), sessionIds: [], noteIds, transcripts: [], base,
    };
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
    writeFileSync(join(dir, "state.json"), JSON.stringify({ version: 1, id, status: "queued", completed: 0, total: 0 }));
    return manifest;
  }
  const noteOnly = noteJob("note-only", [localNote.id, globalNote.id]);
  writeFileSync(join(noteOnly.jobDir, "notes.jsonl"), `${JSON.stringify(localNote)}\n${JSON.stringify(globalNote)}\n`);
  assert.deepEqual(availableNotes(noteHome, tempRoot).map((note: { id: string }) => note.id), []);
  assert.deepEqual(availableNotes(noteHome, join(tempRoot, "other")).map((note: { id: string }) => note.id), [otherNote.id]);
  const notePi = join(tempRoot, "note-pi.sh");
  writeFileSync(notePi, [
    "#!/bin/sh", 'cat > "$PI_DREAM_PARENT_JOB_DIR/prompt-$PI_DREAM_PHASE"',
    'printf -- "---\\ndescription: From notes.\\n---\\n\\nPort 8080.\\n" > "$PI_DREAM_MEMORY_ROOT/notes.md"',
    successfulWorkerEnd,
  ].join("\n"));
  chmodSync(notePi, 0o755);
  assert.deepEqual(await runJob(join(noteOnly.jobDir, "manifest.json"), { piBin: notePi, timeoutMs: 5_000 }), { status: "ready" });
  assert.equal(existsSync(join(noteOnly.jobDir, "prompt-extract")), false);
  const noteConsolidatePrompt = readFileSync(join(noteOnly.jobDir, "prompt-consolidate"), "utf8");
  assert.match(noteConsolidatePrompt, /2 finding\(s\) marked note are direct statements that a past session recorded with dream_note\. Treat them as high confidence\./);
  assert.match(noteConsolidatePrompt, /^- f1 \[fact, note\] \(session s-local\) The API listens on port 8080\.$/m);
  assert.match(noteConsolidatePrompt, new RegExp(`^  > ${localNote.id}: The API listens on port 8080\\.$`, "m"));
  const noteFindings = readFileSync(join(noteOnly.jobDir, "findings.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  assert.deepEqual(noteFindings.map((finding) => [finding.id, finding.source, finding.sessionId]), [["f1", "note", "s-local"], ["f2", "note", "s-global"]]);
  assert.deepEqual(noteFindings[0].evidence, [{ entryId: localNote.id, quote: localNote.statement }]);
  assert.equal(git(concurrentMemory, "diff", "--name-only", "master..dream/note-only"), "notes.md");
  git(concurrentMemory, "merge", "--ff-only", "dream/note-only");
  dreamTest.reconcileJobs(noteHome);
  assert.equal(readState(noteOnly.jobDir).status, "applied");
  assert.deepEqual(readdirSync(join(noteHome, "inbox")).sort(), ["bad-kind.json", "broken.json", `${otherNote.id}.json`].sort());

  const keepNote = writeNote(noteHome, { kind: "fact", subject: "keep", statement: "Kept after discard.", cwd: tempRoot, sessionId: "s-keep" });
  const discardNotes = noteJob("discard-notes", [keepNote.id]);
  const discardNotesCommit = dreamTest.publishJob(discardNotes);
  writeFileSync(join(discardNotes.jobDir, "state.json"), JSON.stringify({ id: discardNotes.id, status: "ready", publishedCommit: discardNotesCommit }));
  assert.deepEqual(availableNotes(noteHome, tempRoot).map((note: { id: string }) => note.id), []);
  await commands.get("dream-discard")!.handler("discard-notes", commandContext);
  assert.equal(readState(discardNotes.jobDir).status, "discarded");
  assert.equal(existsSync(join(noteHome, "inbox", `${keepNote.id}.json`)), true);
  assert.deepEqual(availableNotes(noteHome, tempRoot).map((note: { id: string }) => note.id), [keepNote.id]);

  process.env.PI_DREAM_HOME = dreamHome;
  process.env.PI_DREAM_MEMORY_ROOT = memoryRoot;

  console.log("pi-dream tests passed");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
