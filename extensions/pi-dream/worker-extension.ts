import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { withLock, validateMarkdown, frontMatter, DESCRIPTION_LIMIT, scopeMatches } from "./store.mjs";
export { validateMarkdown } from "./store.mjs";

export type Evidence = { entryId: string; quote: string };
export const FINDING_KINDS = ["fact", "preference", "correction", "procedure", "failure", "stale"] as const;
export type FindingInput = {
  kind: (typeof FINDING_KINDS)[number];
  subject: string;
  statement: string;
  memoryPath?: string;
  evidence: Evidence[];
};
export type Finding = FindingInput & { id?: string; sessionId: string };
export type FindingContext = {
  memoryRoot: string;
  sessionId: string;
  transcript: string;
  findingsPath: string;
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
  now?: () => string;
};

const SUBJECT_LIMIT = 80;
const STATEMENT_LIMIT = 1_000;
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

function validateEvidence(transcript: string, evidence: Evidence[]): void {
  if (evidence.length === 0) {
    throw new Error("At least one evidence quote is required.");
  }
  if (evidence.length > EVIDENCE_LIMIT) {
    throw new Error(`Use at most ${EVIDENCE_LIMIT} evidence quotes.`);
  }
  for (const item of evidence) {
    if (item.quote.length > QUOTE_LIMIT) {
      throw new Error(`The evidence quote for ${item.entryId} is longer than ${QUOTE_LIMIT} characters.`);
    }
    if (!item.entryId.trim() || !transcript.includes(`entry ${item.entryId}`)) {
      throw new Error(`The evidence entry ${item.entryId} is not in the transcript.`);
    }
    if (!item.quote.trim() || !transcript.includes(item.quote)) {
      throw new Error(`The evidence quote for ${item.entryId} is not in the transcript.`);
    }
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
  validateEvidence(context.transcript, input.evidence);
  const finding: Finding = {
    sessionId: context.sessionId,
    kind: input.kind,
    subject,
    statement,
    ...(input.memoryPath ? { memoryPath: input.memoryPath.replace(/^@/, "") } : {}),
    evidence: input.evidence,
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

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.pi-dream-${process.pid}-${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, content, { encoding: "utf8", flag: "wx" });
    renameSync(tempPath, path);
  } finally {
    rmSync(tempPath, { force: true });
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
      return finding;
    });

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
      atomicWrite(sourcePath, input.content);
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

function findingContext(): FindingContext {
  const [memoryRoot, sessionId, transcriptPath, findingsPath] = requireEnv(
    "PI_DREAM_MEMORY_ROOT", "PI_DREAM_SESSION_ID", "PI_DREAM_TRANSCRIPT", "PI_DREAM_FINDINGS",
  );
  return { memoryRoot, sessionId, findingsPath, transcript: readFileSync(transcriptPath, "utf8") };
}

function editContext(): EditContext {
  const [memoryRoot, jobDir, jobId, findingsPath] = requireEnv(
    "PI_DREAM_MEMORY_ROOT", "PI_DREAM_JOB_DIR", "PI_DREAM_JOB_ID", "PI_DREAM_FINDINGS",
  );
  return { memoryRoot, jobDir, jobId, findings: readFindings(findingsPath), cwd: process.env.PI_DREAM_CWD || undefined };
}

const evidenceSchema = Type.Array(
  Type.Object({
    entryId: Type.String({ minLength: 1 }),
    quote: Type.String({ minLength: 1, maxLength: QUOTE_LIMIT }),
  }),
  { minItems: 1, maxItems: EVIDENCE_LIMIT },
);

export default function workerExtension(pi: ExtensionAPI): void {
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
      return withLock(join(memoryRoot, ".edit-lock"), () => {
        const path = resolveMemoryPath(memoryRoot, input.path);
        return {
          content: [{ type: "text", text: readFileSync(path, "utf8") }],
          details: {},
        };
      });
    },
  });

  pi.registerTool({
    name: "dream_finding",
    label: "Record dream finding",
    description: "Record one durable finding from the session transcript, with exact quotes. This tool does not edit memory.",
    parameters: Type.Object({
      kind: Type.Union(FINDING_KINDS.map((kind) => Type.Literal(kind))),
      subject: Type.String({ minLength: 1, maxLength: SUBJECT_LIMIT }),
      statement: Type.String({ minLength: 1, maxLength: STATEMENT_LIMIT }),
      memoryPath: Type.Optional(Type.String({ minLength: 1 })),
      evidence: evidenceSchema,
    }),
    executionMode: "sequential",
    async execute(_id, input) {
      const finding = appendFinding(findingContext(), input);
      return { content: [{ type: "text", text: "Finding recorded." }], details: finding };
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
