import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  SessionManager,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { listMarkdown, resolveMemoryPath } from "./worker-extension.ts";

const DEFAULT_BATCH = 10;
const MAX_BATCH = 25;
const DEFAULT_CONCURRENCY = 3;
const INDEX_FILE_LIMIT = 100;
const INDEX_CHARACTER_LIMIT = 12_000;

type FileHashes = Record<string, string>;
export type CandidateManifest = {
  version: 1;
  baseCommit: string;
  files: FileHashes;
};

type JobManifest = {
  version: 1;
  id: string;
  cwd: string;
  createdAt: string;
  model: string;
  concurrency: number;
  memoryRoot: string;
  candidateRoot: string;
  jobDir: string;
  workerExtension: string;
  sessionIds: string[];
  transcripts: Array<{ sessionId: string; path: string; createdAt: string }>;
  base: CandidateManifest;
};

type JobState = {
  version: 1;
  id: string;
  status: "queued" | "running" | "ready" | "failed" | "applied" | "discarded";
  completed: number;
  total: number;
  concurrency?: number;
  currentSessionId?: string;
  runningSessionIds?: string[];
  error?: string;
  updatedAt: string;
};

type TranscriptInput = {
  sessionId: string;
  cwd: string;
  created: string;
  entries: SessionEntry[];
};

function dreamHome(): string {
  return process.env.PI_DREAM_HOME ?? join(homedir(), ".pi", "agent", "dreams");
}

function memoryRoot(): string {
  return process.env.PI_DREAM_MEMORY_ROOT ?? join(homedir(), ".pi", "agent", "memory");
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitCommit(cwd: string, message: string): void {
  execFileSync(
    "git",
    [
      "-C",
      cwd,
      "-c",
      "user.name=Pi Dream",
      "-c",
      "user.email=pi-dream@local",
      "commit",
      "-m",
      message,
    ],
    { stdio: "ignore" },
  );
}

function atomicJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, path);
}

export function parseBatchCount(raw: string, fallback: number, maximum: number): number {
  if (!raw.trim()) return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new Error("The session count must be a number.");
  return Math.min(Math.max(Number(raw.trim()), 1), maximum);
}

export function redactTranscript(text: string): string {
  return text
    .replace(/(Authorization:\s*Bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9._-]{6,}\b/g, "[REDACTED]")
    .replace(
      /((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s"']+/gi,
      "$1[REDACTED]",
    );
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => item && typeof item === "object" && (item as { type?: string }).type === "text")
    .map((item) => (item as { text?: unknown }).text)
    .filter((text): text is string => typeof text === "string")
    .join("\n");
}

export function buildTranscript(input: TranscriptInput): string {
  const lines = [
    "# Pi session evidence",
    "",
    `Session: ${input.sessionId}`,
    `Working directory: ${input.cwd}`,
    `Created: ${input.created}`,
  ];
  for (const entry of input.entries) {
    if (entry.type !== "message") continue;
    const message = entry.message as { role?: string; content?: unknown };
    if (!message || !["user", "assistant", "toolResult"].includes(message.role ?? "")) continue;
    const text = contentText(message.content).trim();
    if (!text) continue;
    lines.push("", `## entry ${entry.id} | ${message.role}`, redactTranscript(text));
  }
  return `${lines.join("\n")}\n`;
}

export function buildMemoryIndex(root: string, fileLimit: number, characterLimit: number): string {
  const entries = listMarkdown(root).slice(0, fileLimit);
  if (entries.length === 0) return "No accepted dream memory exists.";
  let result = "Accepted dream memory files:\n";
  for (const entry of entries) {
    const line = `- ${entry.path}: ${entry.description}\n`;
    if (result.length + line.length > characterLimit) break;
    result += line;
  }
  return result.trimEnd();
}

function fileHashes(root: string): FileHashes {
  return Object.fromEntries(listMarkdown(root).map((entry) => [entry.path, entry.hash]));
}

export function initializeMemoryStore(root: string): void {
  mkdirSync(root, { recursive: true });
  if (!existsSync(join(root, ".git"))) {
    execFileSync("git", ["init", "-b", "main", root], { stdio: "ignore" });
  }
  let hasHead = true;
  try {
    git(root, ["rev-parse", "--verify", "HEAD"]);
  } catch {
    hasHead = false;
  }
  if (hasHead) return;
  const readme = join(root, "README.md");
  if (!existsSync(readme)) {
    writeFileSync(
      readme,
      "---\ndescription: Rules for the accepted Pi Dream memory store.\n---\n\n# Pi Dream memory\n\nDream workers store reviewed memory in this repository.\n",
      "utf8",
    );
  }
  git(root, ["add", "."]);
  gitCommit(root, "Initialize Pi Dream memory");
}

export function createCandidateClone(root: string, candidateRoot: string): CandidateManifest {
  initializeMemoryStore(root);
  rmSync(candidateRoot, { recursive: true, force: true });
  mkdirSync(dirname(candidateRoot), { recursive: true });
  execFileSync("git", ["clone", "--quiet", "--no-hardlinks", root, candidateRoot]);
  return {
    version: 1,
    baseCommit: git(root, ["rev-parse", "HEAD"]),
    files: fileHashes(root),
  };
}

export function verifyLiveBase(root: string, manifest: CandidateManifest): string[] {
  const conflicts: string[] = [];
  let head = "missing";
  try {
    head = git(root, ["rev-parse", "HEAD"]);
  } catch {
    conflicts.push("The live memory Git repository has no valid HEAD.");
  }
  if (head !== manifest.baseCommit) conflicts.push("The live memory Git commit changed.");
  const current = fileHashes(root);
  for (const path of new Set([...Object.keys(manifest.files), ...Object.keys(current)])) {
    if (manifest.files[path] !== current[path]) conflicts.push(path);
  }
  return conflicts;
}

export function applyCandidate(
  root: string,
  candidateRoot: string,
  manifest: CandidateManifest,
): void {
  const conflicts = verifyLiveBase(root, manifest);
  if (conflicts.length > 0) {
    throw new Error(`The live memory changed:\n${conflicts.join("\n")}`);
  }
  const candidateHead = git(candidateRoot, ["rev-parse", "HEAD"]);
  git(root, ["fetch", "--quiet", candidateRoot, candidateHead]);
  git(root, ["merge", "--ff-only", "FETCH_HEAD"]);
}

export function loadProcessedSessions(path: string): string[] {
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf8")) as { processed?: unknown };
  if (!Array.isArray(data.processed)) return [];
  return data.processed.filter((value): value is string => typeof value === "string").sort();
}

export function markSessionsProcessed(path: string, sessionIds: string[]): void {
  const processed = [...new Set([...loadProcessedSessions(path), ...sessionIds])].sort();
  atomicJson(path, { version: 1, processed });
}

function latestJobDir(home: string): string | null {
  const jobsRoot = join(home, "jobs");
  if (!existsSync(jobsRoot)) return null;
  const jobs = readdirSync(jobsRoot)
    .map((name) => join(jobsRoot, name))
    .filter((path) => statSync(path).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return jobs[0] ?? null;
}

function readJob<T>(jobDir: string, name: string): T {
  return JSON.parse(readFileSync(join(jobDir, name), "utf8")) as T;
}

function writeState(jobDir: string, state: JobState): void {
  atomicJson(join(jobDir, "state.json"), state);
}

function selectModel(pi: ExtensionAPI, ctx: ExtensionContext): string | null {
  const settings = pi.getSettings() as { dream?: { model?: unknown } };
  if (typeof settings.dream?.model === "string" && settings.dream.model.includes("/")) {
    const [provider, ...idParts] = settings.dream.model.split("/");
    const model = ctx.modelRegistry.find(provider, idParts.join("/"));
    return model?.api === "pi-virtual" ? null : settings.dream.model;
  }
  if (ctx.model?.provider && ctx.model.id && ctx.model.api !== "pi-virtual") {
    return `${ctx.model.provider}/${ctx.model.id}`;
  }
  return null;
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
}

async function startDream(pi: ExtensionAPI, args: string, ctx: ExtensionContext): Promise<void> {
  const count = parseBatchCount(args, DEFAULT_BATCH, MAX_BATCH);
  const model = selectModel(pi, ctx);
  if (!model) {
    notify(ctx, "Set dream.model to a concrete provider/model value.", "error");
    return;
  }
  const statePath = join(dreamHome(), "state.json");
  const processed = new Set(loadProcessedSessions(statePath));
  const sessions = (await SessionManager.list(ctx.cwd))
    .filter((session) => !processed.has(session.id))
    .sort((a, b) => a.modified.getTime() - b.modified.getTime())
    .slice(0, count);
  if (sessions.length === 0) {
    notify(ctx, "No unprocessed sessions exist for this working directory.");
    return;
  }
  if (!ctx.hasUI) {
    notify(ctx, "Pi Dream needs an interactive confirmation.", "error");
    return;
  }
  const concurrency = Math.min(DEFAULT_CONCURRENCY, sessions.length);
  const approved = await ctx.ui.confirm(
    "Start Pi Dream?",
    `${sessions.length} session(s) from ${ctx.cwd} will go to ${model}. ${concurrency} worker(s) will run at once.`,
  );
  if (!approved) return;

  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const jobDir = join(dreamHome(), "jobs", id);
  const transcriptDir = join(jobDir, "transcripts");
  const candidateRoot = join(jobDir, "candidate");
  mkdirSync(transcriptDir, { recursive: true });
  const base = createCandidateClone(memoryRoot(), candidateRoot);
  const transcripts: JobManifest["transcripts"] = [];
  for (const session of sessions) {
    const manager = SessionManager.open(session.path);
    const transcriptPath = join(transcriptDir, `${session.id}.md`);
    writeFileSync(
      transcriptPath,
      buildTranscript({
        sessionId: session.id,
        cwd: session.cwd || ctx.cwd,
        created: session.created.toISOString(),
        entries: manager.getBranch(),
      }),
      "utf8",
    );
    transcripts.push({
      sessionId: session.id,
      path: transcriptPath,
      createdAt: session.created.toISOString(),
    });
  }
  const extensionDir = dirname(fileURLToPath(import.meta.url));
  const manifest: JobManifest = {
    version: 1,
    id,
    cwd: ctx.cwd,
    createdAt: new Date().toISOString(),
    model,
    concurrency,
    memoryRoot: memoryRoot(),
    candidateRoot,
    jobDir,
    workerExtension: join(extensionDir, "worker-extension.ts"),
    sessionIds: sessions.map((session) => session.id),
    transcripts,
    base,
  };
  atomicJson(join(jobDir, "manifest.json"), manifest);
  writeState(jobDir, {
    version: 1,
    id,
    status: "queued",
    completed: 0,
    total: sessions.length,
    concurrency,
    runningSessionIds: [],
    updatedAt: new Date().toISOString(),
  });
  const child = spawn(process.execPath, [join(extensionDir, "runner.mjs"), join(jobDir, "manifest.json")], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  notify(ctx, `Pi Dream job ${id} started. Use /dream-status.`);
}

function reviewJob(jobDir: string, ctx: ExtensionContext): void {
  const manifest = readJob<JobManifest>(jobDir, "manifest.json");
  const state = readJob<JobState>(jobDir, "state.json");
  if (state.status !== "ready") {
    notify(ctx, `The latest job is ${state.status}.`, "warning");
    return;
  }
  const range = `${manifest.base.baseCommit}..HEAD`;
  const stat = git(manifest.candidateRoot, ["diff", "--stat", range]);
  const diff = git(manifest.candidateRoot, ["diff", range, "--"]);
  const log = git(manifest.candidateRoot, ["log", "--oneline", range]);
  const writesPath = join(jobDir, "writes.jsonl");
  const writes = existsSync(writesPath)
    ? readFileSync(writesPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as {
          sessionId: string;
          action: string;
          path: string;
          reason: string;
          evidence: unknown[];
        })
    : [];
  const writeRows = writes.map(
    (write) =>
      `| ${write.sessionId} | ${write.action} | ${write.path} | ${write.evidence.length} | ${write.reason.replaceAll("|", "\\|")} |`,
  );
  const reviewPath = join(jobDir, "diff.md");
  const review = [
    "# Pi Dream review",
    "",
    "## Changes",
    "",
    "```text",
    stat || "No file changes.",
    "```",
    "",
    "## Diff",
    "",
    "```diff",
    diff || "No file changes.",
    "```",
    "",
    "## Session commits",
    "",
    "```text",
    log || "No commits.",
    "```",
    "",
    "## Evidence records",
    "",
    "| Session | Action | Path | Quotes | Reason |",
    "| --- | --- | --- | ---: | --- |",
    ...(writeRows.length > 0 ? writeRows : ["| - | - | - | 0 | No memory writes. |"]),
    "",
  ].join("\n");
  writeFileSync(reviewPath, review, "utf8");
  notify(ctx, `Review file: ${reviewPath}`);
}

function registerMemoryTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "dream_memory",
    label: "Dream memory",
    description: "List, search, or read accepted Markdown memory.",
    promptSnippet: "List, search, or read accepted dream memory",
    promptGuidelines: [
      "Use dream_memory when accepted memory can help with a user preference, project fact, or repeated procedure.",
    ],
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("list"),
        Type.Literal("search"),
        Type.Literal("read"),
      ]),
      path: Type.Optional(Type.String()),
      query: Type.Optional(Type.String()),
    }),
    async execute(_id, input) {
      const root = memoryRoot();
      if (input.action === "list") {
        return { content: [{ type: "text", text: buildMemoryIndex(root, INDEX_FILE_LIMIT, INDEX_CHARACTER_LIMIT) }], details: {} };
      }
      if (input.action === "read") {
        if (!input.path) throw new Error("The read action needs a path.");
        return { content: [{ type: "text", text: readFileSync(resolveMemoryPath(root, input.path), "utf8") }], details: {} };
      }
      const query = input.query?.trim().toLowerCase();
      if (!query) throw new Error("The search action needs a query.");
      const matches = listMarkdown(root)
        .filter((entry) => {
          const content = readFileSync(resolveMemoryPath(root, entry.path), "utf8");
          return `${entry.path}\n${entry.description}\n${content}`.toLowerCase().includes(query);
        })
        .slice(0, 10);
      return { content: [{ type: "text", text: JSON.stringify(matches, null, 2) }], details: {} };
    },
  });
}

export default function piDream(pi: ExtensionAPI): void {
  registerMemoryTool(pi);

  pi.on("before_agent_start", (event) => {
    event.systemPromptOptions.sections["dream-memory"] = buildMemoryIndex(
      memoryRoot(),
      INDEX_FILE_LIMIT,
      INDEX_CHARACTER_LIMIT,
    );
  });

  pi.registerCommand("dream", {
    description: "Start a reviewed background memory batch",
    handler: (args, ctx) => startDream(pi, args, ctx),
  });

  pi.registerCommand("dream-status", {
    description: "Show the latest Pi Dream job state",
    handler: async (_args, ctx) => {
      const jobDir = latestJobDir(dreamHome());
      if (!jobDir) return notify(ctx, "No Pi Dream job exists.");
      const state = readJob<JobState>(jobDir, "state.json");
      const running = state.runningSessionIds?.length
        ? `\nRunning ${state.runningSessionIds.length}: ${state.runningSessionIds.join(", ")}`
        : "";
      notify(
        ctx,
        `${state.id}: ${state.status} (${state.completed}/${state.total})${running}${state.error ? `\n${state.error}` : ""}`,
      );
    },
  });

  pi.registerCommand("dream-review", {
    description: "Write a review for the latest Pi Dream candidate",
    handler: async (_args, ctx) => {
      const jobDir = latestJobDir(dreamHome());
      if (!jobDir) return notify(ctx, "No Pi Dream job exists.");
      reviewJob(jobDir, ctx);
    },
  });

  pi.registerCommand("dream-apply", {
    description: "Apply the latest reviewed Pi Dream candidate",
    handler: async (_args, ctx) => {
      const jobDir = latestJobDir(dreamHome());
      if (!jobDir) return notify(ctx, "No Pi Dream job exists.");
      const state = readJob<JobState>(jobDir, "state.json");
      const manifest = readJob<JobManifest>(jobDir, "manifest.json");
      if (state.status !== "ready") return notify(ctx, `The latest job is ${state.status}.`, "warning");
      const conflicts = verifyLiveBase(manifest.memoryRoot, manifest.base);
      if (conflicts.length > 0) return notify(ctx, `The live memory changed:\n${conflicts.join("\n")}`, "error");
      if (!ctx.hasUI || !(await ctx.ui.confirm("Apply Pi Dream?", `Apply job ${manifest.id} to accepted memory?`))) return;
      applyCandidate(manifest.memoryRoot, manifest.candidateRoot, manifest.base);
      markSessionsProcessed(join(dreamHome(), "state.json"), manifest.sessionIds);
      writeState(jobDir, { ...state, status: "applied", updatedAt: new Date().toISOString() });
      notify(ctx, `Applied Pi Dream job ${manifest.id}.`);
    },
  });

  pi.registerCommand("dream-discard", {
    description: "Discard the latest Pi Dream candidate",
    handler: async (_args, ctx) => {
      const jobDir = latestJobDir(dreamHome());
      if (!jobDir) return notify(ctx, "No Pi Dream job exists.");
      const state = readJob<JobState>(jobDir, "state.json");
      if (state.status === "running" || state.status === "queued") {
        return notify(ctx, "The latest job is still running.", "warning");
      }
      if (ctx.hasUI && !(await ctx.ui.confirm("Discard Pi Dream?", `Discard job ${basename(jobDir)}?`))) return;
      rmSync(join(jobDir, "candidate"), { recursive: true, force: true });
      writeState(jobDir, { ...state, status: "discarded", updatedAt: new Date().toISOString() });
      notify(ctx, `Discarded Pi Dream job ${basename(jobDir)}.`);
    },
  });
}

export const __test__ = {
  applyCandidate,
  buildMemoryIndex,
  buildTranscript,
  createCandidateClone,
  initializeMemoryStore,
  loadProcessedSessions,
  markSessionsProcessed,
  parseBatchCount,
  redactTranscript,
  verifyLiveBase,
};
