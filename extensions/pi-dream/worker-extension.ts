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

export type Evidence = { entryId: string; quote: string };
export type EditInput = {
  action: "write" | "delete" | "move";
  path: string;
  expectedHash: string;
  content?: string;
  destination?: string;
  expectedDestinationHash?: string;
  reason: string;
  evidence: Evidence[];
};
export type EditContext = {
  memoryRoot: string;
  jobDir: string;
  jobId: string;
  sessionId: string;
  transcript: string;
  now?: () => string;
};

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

export function validateMarkdown(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) {
    throw new Error("The Markdown file needs front matter with a description.");
  }
  const description = match[1]
    .split("\n")
    .map((line) => line.match(/^description:\s*(.+)\s*$/)?.[1]?.trim())
    .find(Boolean);
  if (!description) {
    throw new Error("The Markdown front matter needs a description.");
  }
  return description.replace(/^['"]|['"]$/g, "");
}

export function listMarkdown(root: string): Array<{
  path: string;
  description: string;
  hash: string;
}> {
  if (!existsSync(root)) return [];
  const result: Array<{ path: string; description: string; hash: string }> = [];
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
          description: validateMarkdown(content),
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
  for (const item of evidence) {
    if (!item.entryId.trim() || !transcript.includes(`entry ${item.entryId}`)) {
      throw new Error(`The evidence entry ${item.entryId} is not in the transcript.`);
    }
    if (!item.quote.trim() || !transcript.includes(item.quote)) {
      throw new Error(`The evidence quote for ${item.entryId} is not in the transcript.`);
    }
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
  if (!input.reason.trim()) throw new Error("The edit reason is required.");
  validateEvidence(context.transcript, input.evidence);

  const sourcePath = resolveMemoryPath(context.memoryRoot, input.path);
  const oldHash = currentHash(sourcePath);
  requireHash(oldHash, input.expectedHash, input.path);

  let resultPath = input.path;
  let newHash = MISSING;
  if (input.action === "write") {
    if (input.content === undefined) throw new Error("Write operations need content.");
    validateMarkdown(input.content);
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
    version: 1,
    jobId: context.jobId,
    sessionId: context.sessionId,
    author: "Pi Dream worker",
    time: (context.now ?? (() => new Date().toISOString()))(),
    action: input.action,
    path: resultPath,
    sourcePath: input.action === "move" ? input.path : undefined,
    oldHash,
    newHash,
    reason: input.reason,
    evidence: input.evidence,
  };
  appendFileSync(join(context.jobDir, "writes.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  return {
    action: input.action,
    path: resultPath,
    sourcePath: record.sourcePath,
    oldHash,
    newHash,
  };
}

function workerContext(): EditContext {
  const memoryRoot = process.env.PI_DREAM_MEMORY_ROOT;
  const jobDir = process.env.PI_DREAM_JOB_DIR;
  const jobId = process.env.PI_DREAM_JOB_ID;
  const sessionId = process.env.PI_DREAM_SESSION_ID;
  const transcriptPath = process.env.PI_DREAM_TRANSCRIPT;
  if (!memoryRoot || !jobDir || !jobId || !sessionId || !transcriptPath) {
    throw new Error("Pi Dream worker environment is incomplete.");
  }
  return {
    memoryRoot,
    jobDir,
    jobId,
    sessionId,
    transcript: readFileSync(transcriptPath, "utf8"),
  };
}

const evidenceSchema = Type.Array(
  Type.Object({
    entryId: Type.String({ minLength: 1 }),
    quote: Type.String({ minLength: 1 }),
  }),
  { minItems: 1 },
);

export default function workerExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "dream_memory_list",
    label: "List dream memory",
    description: "List candidate Markdown memory files with descriptions and SHA-256 hashes.",
    parameters: Type.Object({}),
    executionMode: "sequential",
    async execute() {
      const context = workerContext();
      return {
        content: [{ type: "text", text: JSON.stringify(listMarkdown(context.memoryRoot), null, 2) }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "dream_memory_read",
    label: "Read dream memory",
    description: "Read one candidate Markdown memory file.",
    parameters: Type.Object({ path: Type.String({ minLength: 1 }) }),
    executionMode: "sequential",
    async execute(_id, input) {
      const context = workerContext();
      const path = resolveMemoryPath(context.memoryRoot, input.path);
      return {
        content: [{ type: "text", text: readFileSync(path, "utf8") }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "dream_memory_edit",
    label: "Edit dream memory",
    description: "Write, delete, or move one candidate Markdown memory file after a hash check.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("write"),
        Type.Literal("delete"),
        Type.Literal("move"),
      ]),
      path: Type.String({ minLength: 1 }),
      expectedHash: Type.String({ minLength: 1 }),
      content: Type.Optional(Type.String()),
      destination: Type.Optional(Type.String()),
      expectedDestinationHash: Type.Optional(Type.String()),
      reason: Type.String({ minLength: 1 }),
      evidence: evidenceSchema,
    }),
    executionMode: "sequential",
    async execute(_id, input) {
      const result = await applyMemoryEdit(workerContext(), input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: result,
      };
    },
  });
}

export const __test__ = {
  applyMemoryEdit,
  listMarkdown,
  resolveMemoryPath,
  sha256File,
  sha256Text,
  validateMarkdown,
};
