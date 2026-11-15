import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  withLock, validateMarkdown, frontMatter, DESCRIPTION_LIMIT, scopeMatches,
  NOTE_KINDS, SUBJECT_LIMIT, STATEMENT_LIMIT, readJson, writeJson,
} from "./store.mjs";
import { createSourceLoader, loadSources, parseTranscript, validateEvidence, readSource, searchSources, sourceBatch, SOURCE_PAGE_LIMIT, SOURCE_BATCH_LIMIT } from "./sources.mjs";
import { REVIEW_OUTCOMES, recordSearch, recordSourceRead, recordOutcomes, closeSearches, reviewProgress, reviewResponse, finishReview, reviewContinuation } from "./review.mjs";
import { atomicWrite, formatMarkdown } from "./format-memory.mjs";
export { validateMarkdown, SUBJECT_LIMIT, STATEMENT_LIMIT } from "./store.mjs";

export type Evidence = { entryId: string; quote: string; role?: string; timestamp?: string };
export const FINDING_KINDS = NOTE_KINDS as readonly ["fact", "preference", "correction", "procedure", "failure", "stale"];
export type FindingInput = {
  kind: (typeof FINDING_KINDS)[number];
  subject: string;
  statement: string;
  memoryPath?: string;
  evidence: Evidence[];
};
// Notes are leads, not evidence. Only source-backed findings can support an edit.
export type Finding = FindingInput & { id?: string; sessionId: string; source?: "note"; noteId?: string; entryId?: string };
export type FindingContext = {
  memoryRoot: string;
  sessionId: string;
  transcript: string;
  findingsPath: string;
  sourceEntries?: Array<{ entryId: string; role: string; text: string; timestamp?: string }>;
  assignId?: boolean;
};
export type EditInput = {
  action: "write" | "delete" | "move";
  path: string;
  expectedHash: string;
  content?: string;
  destination?: string;
  expectedDestinationHash?: string;
  reason: string;
  findingIds: string[];
};
export type EditContext = {
  memoryRoot: string;
  jobDir: string;
  jobId: string;
  findings: Finding[];
  cwd?: string;
  reviewPaths?: string[];
  now?: () => string;
};

const QUOTE_LIMIT = 500;
const EVIDENCE_LIMIT = 3;

type EditResult = {
  action: EditInput["action"];
  path: string;
  oldHash: string;
  newHash: string;
  sourcePath?: string;
};

const MISSING = "missing";

export function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function sha256File(path: string): string {
  return sha256Text(readFileSync(path, "utf8"));
}

function cleanRelativePath(input: string): string {
  const value = input.startsWith("@") ? input.slice(1) : input;
  if (!value || isAbsolute(value) || value.includes("\\")) {
    throw new Error("The path is outside the memory store.");
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("The path is outside the memory store.");
  }
  if (parts.some((part) => part.startsWith("."))) {
    throw new Error("The path uses a hidden path.");
  }
  if (extname(value).toLowerCase() !== ".md") {
    throw new Error("The memory path must name a Markdown file.");
  }
  return parts.join("/");
}

function rejectSymlinkPath(root: string, absolutePath: string): void {
  let current = resolve(root);
  const targetRelative = relative(current, absolutePath);
  for (const part of targetRelative.split(sep)) {
    current = join(current, part);
    if (!existsSync(current)) continue;
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error("The memory path contains a symlink.");
    }
  }
}

export function resolveMemoryPath(root: string, input: string): string {
  const clean = cleanRelativePath(input);
  const rootPath = resolve(root);
  const target = resolve(rootPath, clean);
  const rel = relative(rootPath, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error("The path is outside the memory store.");
  }
  rejectSymlinkPath(rootPath, target);
  return target;
}

export type MemoryEntry = { path: string; description: string; scope?: string; bytes: number; hash: string };

export function listMarkdown(root: string): MemoryEntry[] {
  if (!existsSync(root)) return [];
  const result: MemoryEntry[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".md") continue;
      const content = readFileSync(absolute, "utf8");
      try {
        result.push({
          path: relative(root, absolute).split(sep).join("/"),
          ...frontMatter(content),
          bytes: Buffer.byteLength(content),
          hash: sha256Text(content),
        });
      } catch {
        continue;
      }
    }
  };
  walk(root);
  return result.sort((a, b) => a.path.localeCompare(b.path));
}

function currentHash(path: string): string {
  return existsSync(path) ? sha256File(path) : MISSING;
}

function requireHash(actual: string, expected: string, path: string): void {
  if (actual !== expected) {
    throw new Error(`The hash changed for ${path}. Expected ${expected}. Found ${actual}.`);
  }
}

export function appendFinding(context: FindingContext, input: FindingInput): Finding {
  if (!FINDING_KINDS.includes(input.kind)) throw new Error(`The finding kind is invalid: ${input.kind}`);
  const subject = input.subject.trim();
  const statement = input.statement.trim();
  if (!subject || subject.length > SUBJECT_LIMIT) {
    throw new Error(`The subject must have 1 to ${SUBJECT_LIMIT} characters.`);
  }
  if (!statement || statement.length > STATEMENT_LIMIT) {
    throw new Error(`The statement must have 1 to ${STATEMENT_LIMIT} characters.`);
  }
  if (input.memoryPath) resolveMemoryPath(context.memoryRoot, input.memoryPath);
  const evidence = validateEvidence(context.sourceEntries ?? parseTranscript(context.transcript), input.evidence);
  const finding: Finding = {
    sessionId: context.sessionId,
    kind: input.kind,
    subject,
    statement,
    ...(input.memoryPath ? { memoryPath: input.memoryPath.replace(/^@/, "") } : {}),
    evidence,
    ...(context.assignId ? { id: `f${readFindings(context.findingsPath).length + 1}` } : {}),
  };
  mkdirSync(dirname(context.findingsPath), { recursive: true });
  appendFileSync(context.findingsPath, `${JSON.stringify(finding)}\n`, "utf8");
  return finding;
}

export function readFindings(path: string): Finding[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Finding);
}

function validateWrittenMarkdown(content: string, cwd?: string): void {
  const { description, scope } = frontMatter(content);
  const body = content.replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---(?:\n|$)/, "");
  const firstLine = body.split("\n").find((line) => line.trim()) ?? "";
  // A field below the front matter has no effect, so the scope check would not see it.
  if (/^(scope|description):/.test(firstLine.trim())) {
    throw new Error(`The line "${firstLine.trim()}" is below the front matter. Move it between the two --- lines.`);
  }
  if (description.length > DESCRIPTION_LIMIT) {
    throw new Error(`The description is longer than ${DESCRIPTION_LIMIT} characters. Use one short line.`);
  }
  if (scope !== undefined && !scope.startsWith("~/") && !scope.startsWith("/")) {
    throw new Error("The scope must be an absolute path or start with ~/.");
  }
  // A narrower scope would hide the file from the sessions that produced its findings.
  if (scope !== undefined && cwd && !scopeMatches(scope, cwd)) {
    throw new Error(`The scope ${scope} does not contain the batch folder ${cwd}. Use that folder or a parent folder, or remove scope.`);
  }
}

export async function applyMemoryEdit(
  context: EditContext,
  input: EditInput,
): Promise<EditResult> {
  return withLock(join(context.memoryRoot, ".edit-lock"), async () => {
    if (!input.reason.trim()) throw new Error("The edit reason is required.");
    const byId = new Map(context.findings.map((finding) => [finding.id, finding]));
    const used = [...new Set(input.findingIds ?? [])].map((id) => {
      const finding = byId.get(id);
      if (!finding) throw new Error(`The finding ${id} does not exist.`);
      if (finding.source === "note") throw new Error(`The note ${id} is a lead, not evidence. Record a source-backed finding first.`);
      return finding;
    });

    if (context.reviewPaths && [input.path, ...(input.destination ? [input.destination] : [])]
      .some((path) => !context.reviewPaths!.includes(cleanRelativePath(path)))) {
      throw new Error("A targeted check can edit only its selected memory files.");
    }
    const sourcePath = resolveMemoryPath(context.memoryRoot, input.path);
    const oldHash = currentHash(sourcePath);
    // Models often send "" or "none" for a new file. Both mean the file must not exist.
    const expectedHash = ["", "none"].includes(input.expectedHash.trim().toLowerCase()) ? MISSING : input.expectedHash;
    requireHash(oldHash, expectedHash, input.path);

    let resultPath = input.path;
    let newHash = MISSING;
    if (input.action === "write") {
      if (input.content === undefined) throw new Error("Write operations need content.");
      validateWrittenMarkdown(input.content, context.cwd);
      const formatted = await formatMarkdown(input.content);
      validateWrittenMarkdown(formatted, context.cwd);
      atomicWrite(sourcePath, formatted);
      newHash = sha256File(sourcePath);
    } else if (input.action === "delete") {
      if (oldHash === MISSING) throw new Error(`The memory file does not exist: ${input.path}`);
      unlinkSync(sourcePath);
    } else {
      if (oldHash === MISSING) throw new Error(`The memory file does not exist: ${input.path}`);
      if (!input.destination) throw new Error("Move operations need a destination.");
      const destinationPath = resolveMemoryPath(context.memoryRoot, input.destination);
      const destinationHash = currentHash(destinationPath);
      requireHash(
        destinationHash,
        input.expectedDestinationHash ?? MISSING,
        input.destination,
      );
      mkdirSync(dirname(destinationPath), { recursive: true });
      renameSync(sourcePath, destinationPath);
      resultPath = input.destination;
      newHash = sha256File(destinationPath);
    }

    mkdirSync(context.jobDir, { recursive: true });
    const record = {
      version: 2,
      jobId: context.jobId,
      author: "Pi Dream consolidation",
      time: (context.now ?? (() => new Date().toISOString()))(),
      action: input.action,
      path: resultPath,
      sourcePath: input.action === "move" ? input.path : undefined,
      oldHash,
      newHash,
      reason: input.reason,
      findingIds: used.map((finding) => finding.id),
      sessionIds: [...new Set(used.map((finding) => finding.sessionId))],
      evidence: used.flatMap((finding) =>
        finding.evidence.map((item) => ({ sessionId: finding.sessionId, ...item }))),
    };
    appendFileSync(join(context.jobDir, "writes.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
    return {
      action: input.action,
      path: resultPath,
      sourcePath: record.sourcePath,
      oldHash,
      newHash,
    };
  });
}

function requireEnv(...names: string[]): string[] {
  const values = names.map((name) => process.env[name]);
  if (values.some((value) => !value)) throw new Error("Pi Dream worker environment is incomplete.");
  return values as string[];
}

function memoryRootFromEnv(): string {
  return requireEnv("PI_DREAM_MEMORY_ROOT")[0];
}

function findingContext(sources: ReturnType<typeof loadSources>, requestedSession?: string): FindingContext {
  const [memoryRoot, findingsPath] = requireEnv("PI_DREAM_MEMORY_ROOT", "PI_DREAM_FINDINGS");
  const extracting = process.env.PI_DREAM_PHASE === "extract";
  const sessionId = requestedSession ?? process.env.PI_DREAM_SESSION_ID;
  if (!sessionId || (extracting && sessionId !== process.env.PI_DREAM_SESSION_ID)) {
    throw new Error("Use a source session ID available to this worker.");
  }
  const source = sources.sessions.find((session) => session.sessionId === sessionId);
  if (!source) throw new Error(`The source session ${sessionId} is not available in this job.`);
  return { memoryRoot, sessionId, findingsPath, transcript: "", sourceEntries: source.entries, assignId: !extracting };
}

function editContext(): EditContext {
  const [memoryRoot, jobDir, jobId, findingsPath] = requireEnv(
    "PI_DREAM_MEMORY_ROOT", "PI_DREAM_JOB_DIR", "PI_DREAM_JOB_ID", "PI_DREAM_FINDINGS",
  );
  const reviewPaths = process.env.PI_DREAM_REVIEW_PATHS ? JSON.parse(process.env.PI_DREAM_REVIEW_PATHS) : undefined;
  return { memoryRoot, jobDir, jobId, findings: readFindings(findingsPath), reviewPaths,
    cwd: reviewPaths ? undefined : process.env.PI_DREAM_CWD || undefined };
}

const evidenceSchema = Type.Array(
  Type.Object({
    entryId: Type.String({ minLength: 1 }),
    quote: Type.String({ minLength: 1, maxLength: QUOTE_LIMIT }),
  }),
  { minItems: 1, maxItems: EVIDENCE_LIMIT },
);

function reviewFile(): string | undefined {
  return process.env.PI_DREAM_PHASE === "consolidate" ? process.env.PI_DREAM_REVIEW_FILE || undefined : undefined;
}

async function updateReview<T>(action: (review: any) => T): Promise<T | undefined> {
  const path = reviewFile();
  if (!path) return;
  return withLock(`${path}.lock`, () => {
    const review = readJson(path);
    const result = action(review);
    writeJson(path, review);
    const { pending, unread, openSearches, ...progress } = reviewProgress(review, memoryRootFromEnv());
    writeJson(join(requireEnv("PI_DREAM_PARENT_JOB_DIR")[0], "review-progress.json"), progress);
    return result;
  });
}

const sourceSearchFields = {
  query: Type.String({ minLength: 1, maxLength: 200 }),
  sessionId: Type.Optional(Type.String({ minLength: 1 })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
};
const sourceReadFields = {
  sessionId: Type.String({ minLength: 1 }),
  entryId: Type.String({ minLength: 1 }),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: SOURCE_PAGE_LIMIT })),
};
const findingSchema = Type.Object({
  sessionId: Type.Optional(Type.String({ minLength: 1 })),
  kind: Type.Union(FINDING_KINDS.map((kind) => Type.Literal(kind))),
  subject: Type.String({ minLength: 1, maxLength: SUBJECT_LIMIT }),
  statement: Type.String({ minLength: 1, maxLength: STATEMENT_LIMIT }),
  memoryPath: Type.Optional(Type.String({ minLength: 1 })),
  evidence: evidenceSchema,
});

export default function workerExtension(pi: ExtensionAPI): void {
  const loadWorkerSources = createSourceLoader();
  function workerSources() {
    const [path] = requireEnv("PI_DREAM_SOURCES");
    const data = loadWorkerSources(path, process.env.PI_DREAM_SOURCES_HASH || undefined);
    return process.env.PI_DREAM_PHASE === "extract"
      ? { ...data, sessions: data.sessions.filter((session) => session.sessionId === process.env.PI_DREAM_SESSION_ID) }
      : data;
  }
  const reviewContinuationState = {};
  pi.on("agent_before_settle", async (event) => {
    const path = reviewFile();
    if (!path) return;
    return reviewContinuation(readJson(path), memoryRootFromEnv(), reviewContinuationState, event.entries);
  });

  pi.registerTool({
    name: "dream_review",
    label: "Review selected memory",
    description: "Review all selected files together. status pages pending original passages and open search summaries. Pass nextCursor as cursor for more text, including long passages. Pass nextSearchOffset as searchOffset for more searches. history pages saved outcomes as JSON text, with the same cursor rules. Join all text parts for a record before reading its JSON. close_searches accepts up to twenty unused open search IDs with reasons. Closed searches cannot support outcomes. A repeated source search reopens its record. record, close_searches, and finish return counts only.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("status"), Type.Literal("history"), Type.Literal("record"), Type.Literal("close_searches"), Type.Literal("finish")]),
      cursor: Type.Optional(Type.Object({
        passage: Type.Integer({ minimum: 0, description: "Original passage index from nextCursor." }),
        offset: Type.Integer({ minimum: 0, description: "Text offset within that passage from nextCursor." }),
      })),
      searchOffset: Type.Optional(Type.Integer({ minimum: 0 })),
      outcomes: Type.Optional(Type.Array(Type.Object({
        id: Type.String({ description: "Original passage ID from review status." }),
        outcome: Type.Union(REVIEW_OUTCOMES.map((value) => Type.Literal(value))),
        reason: Type.String({ minLength: 1, maxLength: 4000 }),
        findingIds: Type.Array(Type.String()),
        searchIds: Type.Array(Type.String()),
      }), { minItems: 1, maxItems: 20 })),
      closures: Type.Optional(Type.Array(Type.Object({
        id: Type.String({ minLength: 1, description: "Unused open search ID from review status." }),
        reason: Type.String({ minLength: 1, maxLength: 4000, description: "Why this exploratory search is no longer needed." }),
      }), { minItems: 1, maxItems: 20 })),
      comparison: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })),
    }),
    executionMode: "sequential",
    async execute(_id, input) {
      if (!reviewFile()) throw new Error("This worker does not run a combined memory check.");
      const result = await updateReview((review) => {
        if (input.action === "record") {
          recordOutcomes(review, input.outcomes, readFindings(requireEnv("PI_DREAM_FINDINGS")[0]), workerSources());
        } else if (input.action === "close_searches") {
          closeSearches(review, input.closures);
        } else if (input.action === "finish") {
          finishReview(review, input.comparison, memoryRootFromEnv());
        }
        return reviewResponse(review, memoryRootFromEnv(), input);
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
  pi.registerTool({
    name: "dream_memory_list",
    label: "List dream memory",
    description: "List candidate Markdown memory files with descriptions, scopes, sizes, and SHA-256 hashes.",
    parameters: Type.Object({}),
    executionMode: "sequential",
    async execute() {
      const memoryRoot = memoryRootFromEnv();
      return withLock(join(memoryRoot, ".edit-lock"), () => ({
        content: [{ type: "text", text: JSON.stringify(listMarkdown(memoryRoot), null, 2) }],
        details: {},
      }));
    },
  });

  pi.registerTool({
    name: "dream_memory_read",
    label: "Read dream memory",
    description: "Read one candidate Markdown memory file.",
    parameters: Type.Object({ path: Type.String({ minLength: 1 }) }),
    executionMode: "sequential",
    async execute(_id, input) {
      const memoryRoot = memoryRootFromEnv();
      return withLock(join(memoryRoot, ".edit-lock"), async () => {
        const path = resolveMemoryPath(memoryRoot, input.path);
        const content = readFileSync(path, "utf8");
        await updateReview((review) => {
          const clean = cleanRelativePath(input.path);
          if (review.files.some((file) => file.path === clean) && !review.readPaths.includes(clean)) review.readPaths.push(clean);
        });
        return {
          content: [{ type: "text", text: content }],
          details: {},
        };
      });
    },
  });

  pi.registerTool({
    name: "dream_source_search",
    label: "Search dream sources",
    description: "Search this job's redacted source messages. Returns up to 20 matches with 240-character excerpts. Use offset to page matches.",
    parameters: Type.Object(sourceSearchFields),
    async execute(_id, input) {
      const result = searchSources(workerSources(), input);
      const searchId = await updateReview((review) => recordSearch(review, input, result));
      if (searchId) result.searchId = searchId;
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });

  pi.registerTool({
    name: "dream_source_read",
    label: "Read dream source",
    description: "Read one redacted source entry, up to 8000 characters. Use nextOffset for more text and adjacent entry IDs for context.",
    parameters: Type.Object(sourceReadFields),
    async execute(_id, input) {
      const result = readSource(workerSources(), input);
      await updateReview((review) => recordSourceRead(review, result));
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });

  pi.registerTool({
    name: "dream_source_batch",
    label: "Read dream evidence in batches",
    description: "Run up to eight independent source searches or reads. Results keep input indices. Total source text and excerpts are limited to 16000 characters. Retry only failed or deferred requests. Successful requests retain the same pagination and evidence records as single calls.",
    parameters: Type.Object({ requests: Type.Array(Type.Union([
      Type.Object({ action: Type.Literal("search"), ...sourceSearchFields }),
      Type.Object({ action: Type.Literal("read"), ...sourceReadFields }),
    ]), { minItems: 1, maxItems: SOURCE_BATCH_LIMIT }) }),
    async execute(_id, input) {
      const results = sourceBatch(workerSources(), input.requests);
      await updateReview((review) => {
        for (const item of results) {
          if (!item.result) continue;
          const request = input.requests[item.index];
          if (request.action === "search") item.result.searchId = recordSearch(review, request, item.result);
          else recordSourceRead(review, item.result);
        }
      });
      return { content: [{ type: "text", text: JSON.stringify(results) }], details: results };
    },
  });

  pi.registerTool({
    name: "dream_finding_batch",
    label: "Record dream findings in batches",
    description: "Record up to eight independent findings using exact source quotes. Each result has its input index and finding ID or error. Retry only failed inputs. Successful findings remain saved. This tool does not edit memory.",
    parameters: Type.Object({ findings: Type.Array(findingSchema, { minItems: 1, maxItems: SOURCE_BATCH_LIMIT }) }),
    executionMode: "sequential",
    async execute(_id, input) {
      if (!Array.isArray(input.findings) || !input.findings.length || input.findings.length > SOURCE_BATCH_LIMIT) {
        throw new Error(`Supply one to ${SOURCE_BATCH_LIMIT} findings.`);
      }
      const sources = workerSources();
      const results = input.findings.map((item, index) => {
        try {
          const finding = appendFinding(findingContext(sources, item.sessionId), item);
          return { index, recorded: true, ...(finding.id ? { id: finding.id } : {}) };
        } catch (error) {
          return { index, error: error instanceof Error ? error.message : String(error) };
        }
      });
      return { content: [{ type: "text", text: JSON.stringify(results) }], details: results };
    },
  });

  pi.registerTool({
    name: "dream_finding",
    label: "Record dream finding",
    description: "Record one durable finding with exact source quotes. During consolidation, supply sessionId. This tool does not edit memory.",
    parameters: findingSchema,
    executionMode: "sequential",
    async execute(_id, input) {
      const finding = appendFinding(findingContext(workerSources(), input.sessionId), input);
      return { content: [{ type: "text", text: finding.id ? `Finding ${finding.id} recorded.` : "Finding recorded." }], details: finding };
    },
  });

  pi.registerTool({
    name: "dream_memory_edit",
    label: "Edit dream memory",
    description: "Write, delete, or move one candidate Markdown memory file after a hash check. List the finding IDs that support the edit.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("write"),
        Type.Literal("delete"),
        Type.Literal("move"),
      ]),
      path: Type.String({ minLength: 1 }),
      expectedHash: Type.String({ description: 'SHA-256 hash from dream_memory_list or dream_memory_read. Use "missing" for a new file.' }),
      content: Type.Optional(Type.String()),
      destination: Type.Optional(Type.String()),
      expectedDestinationHash: Type.Optional(Type.String()),
      reason: Type.String({ minLength: 1 }),
      findingIds: Type.Array(Type.String({ minLength: 1 })),
    }),
    executionMode: "sequential",
    async execute(_id, input) {
      const result = await applyMemoryEdit(editContext(), input);
      await updateReview((review) => {
        delete review.comparison;
        delete review.finalHashes;
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: result,
      };
    },
  });
}

export const __test__ = {
  appendFinding,
  applyMemoryEdit,
  readFindings,
  listMarkdown,
  resolveMemoryPath,
  sha256File,
  sha256Text,
  validateMarkdown,
};
