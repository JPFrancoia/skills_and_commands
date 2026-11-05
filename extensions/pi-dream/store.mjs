import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync,
  rmdirSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

export function git(root, args, options = {}) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  }).trim();
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

export async function withLock(path, action, timeoutMs = 10_000) {
  mkdirSync(dirname(path), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      mkdirSync(path);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      // shortcut: crashes leave this lock, inspect its owner before manual removal.
      if (Date.now() >= deadline) throw new Error(`Lock timed out: ${path}. Check for an active process before removing a stale lock.`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await action();
  } finally {
    rmdirSync(path);
  }
}

function memoryPath(path) {
  return /\.md$/i.test(path) && !path.includes("\\") &&
    path.split("/").every((part) => part && !part.startsWith("."));
}

export const DESCRIPTION_LIMIT = 150;

/** @returns {{description: string, scope?: string}} */
export function frontMatter(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new Error("The Markdown file needs front matter with a description.");
  const field = (name) => match[1].split("\n")
    .map((line) => line.startsWith(`${name}:`) ? line.slice(name.length + 1).trim() : "")
    .find(Boolean)?.replace(/^['"]|['"]$/g, "");
  const description = field("description");
  if (!description) throw new Error("The Markdown front matter needs a description.");
  const scope = field("scope");
  return scope ? { description, scope } : { description };
}

// True when cwd is the scope folder or inside it. A file without scope matches every cwd.
export function scopeMatches(scope, cwd) {
  if (!scope) return true;
  const folder = resolve(scope === "~" || scope.startsWith("~/") ? join(homedir(), scope.slice(1)) : scope);
  const current = resolve(cwd);
  return current === folder || current.startsWith(`${folder}${sep}`);
}

export function validateMarkdown(content) {
  return frontMatter(content).description;
}

export function memoryFiles(root) {
  const files = [];
  if (!existsSync(root)) return files;
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`The memory path contains a symlink: ${path}`);
      if (entry.isDirectory()) walk(join(dir, entry.name), path);
      else if (entry.isFile() && memoryPath(path)) files.push(path);
    }
  };
  walk(root, "");
  return files.sort();
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

/** @returns {{version: 1, baseCommit: string, files: Record<string, string>}} */
export function createSnapshot(root, candidateRoot) {
  const baseCommit = git(root, ["rev-parse", "refs/heads/master"]);
  mkdirSync(candidateRoot, { recursive: true });
  if (readdirSync(candidateRoot).length) throw new Error("The candidate folder is not empty.");
  const files = {};
  const rows = git(root, ["ls-tree", "-r", "-z", baseCommit]).split("\0").filter(Boolean);
  for (const row of rows) {
    const tab = row.indexOf("\t");
    const [mode, type, object] = row.slice(0, tab).split(" ");
    const path = row.slice(tab + 1);
    if (type !== "blob" || !["100644", "100755"].includes(mode) || !memoryPath(path)) continue;
    const content = execFileSync("git", ["-C", root, "cat-file", "blob", object]);
    mkdirSync(dirname(join(candidateRoot, path)), { recursive: true });
    writeFileSync(join(candidateRoot, path), content);
    files[path] = hash(content);
  }
  return { version: 1, baseCommit, files };
}

export function assertMaster(root) {
  if (git(root, ["symbolic-ref", "--short", "HEAD"]) !== "master") {
    throw new Error("The accepted memory repository must stay on master.");
  }
}

export function reviewRef(id) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new Error("The job ID is invalid.");
  return `refs/heads/dream/${id}`;
}

export function publishJob(manifest) {
  const { memoryRoot: root, jobDir, candidateRoot, base } = manifest;
  assertMaster(root);
  const statePath = join(jobDir, "state.json");
  const state = readJson(statePath);
  const ref = reviewRef(manifest.id);
  if (state.publishedCommit) {
    const commit = git(root, ["rev-parse", ref]);
    if (commit !== state.publishedCommit) writeJson(statePath, { ...state, publishedCommit: commit });
    return commit;
  }
  let commit;
  if (manifest.version === 1 && existsSync(join(candidateRoot, ".git"))) {
    git(root, ["fetch", "--quiet", "--no-write-fetch-head", candidateRoot, `HEAD:${ref}`]);
    commit = git(root, ["rev-parse", ref]);
  } else {
    const index = resolve(jobDir, `publish-${randomUUID()}.index`);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    try {
      git(root, ["read-tree", base.baseCommit], { env });
      const paths = memoryFiles(candidateRoot);
      const removed = Object.keys(base.files).filter((path) => !paths.includes(path));
      for (const path of removed) git(root, ["update-index", "--force-remove", "--", path], { env });
      for (const path of paths) {
        const content = readFileSync(join(candidateRoot, path));
        validateMarkdown(content.toString("utf8"));
        if (hash(content) === base.files[path]) continue;
        const object = git(root, ["hash-object", "-w", "--stdin"], {
          input: content, stdio: ["pipe", "pipe", "pipe"],
        });
        const original = git(root, ["ls-tree", base.baseCommit, "--", path]);
        const mode = original.startsWith("100755 ") ? "100755" : "100644";
        if (original && !/^100(?:644|755) /.test(original)) {
          throw new Error(`The candidate cannot replace a non-file Git entry: ${path}`);
        }
        git(root, ["update-index", "--add", "--cacheinfo", mode, object, path], { env });
      }
      const tree = git(root, ["write-tree"], { env });
      commit = git(root, [
        "-c", "user.name=Pi Dream", "-c", "user.email=pi-dream@local",
        "commit-tree", tree, "-p", base.baseCommit, "-m", `Dream batch ${manifest.id}`,
      ]);
      const zero = "0".repeat(commit.length);
      git(root, ["update-ref", ref, commit, zero]);
    } finally {
      rmSync(index, { force: true });
      rmSync(`${index}.lock`, { force: true });
    }
  }
  writeJson(statePath, { ...state, publishedCommit: commit, branch: ref.slice("refs/heads/".length) });
  return commit;
}

export function jobDirectories(home) {
  const root = join(home, "jobs");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .filter((path) => existsSync(join(path, "manifest.json")) && existsSync(join(path, "state.json")));
}

export function loadProcessedSessions(path) {
  if (!existsSync(path)) return [];
  const data = readJson(path);
  return Array.isArray(data.processed)
    ? data.processed.filter((value) => typeof value === "string").sort()
    : [];
}

export function markSessionsProcessed(path, sessionIds) {
  const processed = [...new Set([...loadProcessedSessions(path), ...sessionIds])].sort();
  writeJson(path, { version: 1, processed });
}

export function reconcileJobs(home) {
  for (const dir of jobDirectories(home)) {
    const statePath = join(dir, "state.json");
    const state = readJson(statePath);
    if (state.status !== "ready" || !state.publishedCommit) continue;
    const manifest = readJson(join(dir, "manifest.json"));
    const result = (() => {
      try {
        git(manifest.memoryRoot, ["merge-base", "--is-ancestor", state.publishedCommit, "refs/heads/master"]);
        return true;
      } catch { return false; }
    })();
    if (!result) continue;
    markSessionsProcessed(join(home, "state.json"), manifest.sessionIds);
    writeJson(statePath, { ...state, status: "applied", updatedAt: new Date().toISOString() });
  }
}

export function availableSessions(home, sessions) {
  reconcileJobs(home);
  const excluded = new Set(loadProcessedSessions(join(home, "state.json")));
  for (const dir of jobDirectories(home)) {
    const state = readJson(join(dir, "state.json"));
    if (["queued", "running", "ready"].includes(state.status)) {
      readJson(join(dir, "manifest.json")).sessionIds.forEach((id) => excluded.add(id));
    }
  }
  return sessions.filter((session) => !excluded.has(session.id));
}
