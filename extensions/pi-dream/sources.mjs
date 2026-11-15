import { createHash } from "node:crypto";
import { closeSync, constants, lstatSync, openSync, readFileSync } from "node:fs";

export const SOURCE_PAGE_LIMIT = 8_000;
export const SOURCE_MATCH_LIMIT = 20;
export const SOURCE_BATCH_LIMIT = 8;
export const SOURCE_BATCH_CHARACTERS = 16_000;

export function redactTranscript(text) {
  return text
    .replace(/("(?:api[_-]?key|token|secret|password)"\s*:\s*")(?:\\.|[^"\\])*"/gi, '$1[REDACTED]"')
    .replace(/(Authorization:\s*Bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9._-]{6,}\b/g, "[REDACTED]")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s"']+/gi, "$1[REDACTED]");
}

export function contentText(content, argumentLimit = Infinity) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => {
    if (part?.type === "text" && typeof part.text === "string") return [part.text];
    if (part?.type !== "toolCall" || typeof part.name !== "string") return [];
    const args = redactTranscript(JSON.stringify(part.arguments ?? {}));
    return [`[tool call ${part.name}] ${args.length > argumentLimit ? `${args.slice(0, argumentLimit)} [... cut]` : args}`];
  }).join("\n");
}

export function buildSource(input) {
  const entries = input.entries.flatMap((entry) => {
    if (entry.type !== "message") return [];
    const message = entry.message;
    if (!["user", "assistant", "toolResult"].includes(message?.role)) return [];
    const text = redactTranscript(contentText(message.content)).trim();
    if (!text) return [];
    return [{ entryId: entry.id, role: message.role, timestamp: entry.timestamp, text,
      ...(typeof message.toolName === "string" ? { toolName: message.toolName } : {}),
      ...(message.isError === true ? { isError: true } : {}) }];
  });
  return { sessionId: input.sessionId, cwd: input.cwd, createdAt: input.created, entries };
}

// Old exports have no structured boundaries and can contain clipped tool output.
export function parseTranscript(text) {
  const headers = [...text.matchAll(/^## entry ([^\s|]+) \| (user|assistant|toolResult)([^\n]*)\n/gm)];
  const entries = headers.map((match, index) => ({
    entryId: match[1], role: match[2],
    text: text.slice(match.index + match[0].length, headers[index + 1]?.index ?? text.length).trim(),
  }));
  if (new Set(entries.map((entry) => entry.entryId)).size !== entries.length) {
    throw new Error("The legacy transcript has ambiguous entry IDs.");
  }
  return entries;
}

export function sourcesHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function sourceStamp(path) {
  const stat = lstatSync(path, { bigint: true });
  if (stat.isSymbolicLink()) throw new Error("The source snapshot cannot be a symlink.");
  if (!stat.isFile()) throw new Error("The source snapshot must be a regular file.");
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
}

export function loadSources(path, expectedHash) {
  const before = sourceStamp(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let text;
  try {
    text = readFileSync(fd, "utf8");
    if (sourceStamp(path) !== before) throw new Error("The source snapshot changed while it was read.");
  } finally {
    closeSync(fd);
  }
  if (expectedHash && sourcesHash(text) !== expectedHash) throw new Error("The source snapshot changed.");
  const data = JSON.parse(text);
  if (!data || data.version !== 1 || !Array.isArray(data.sessions)) throw new Error("The source snapshot is invalid.");
  const sessions = new Set();
  for (const session of data.sessions) {
    if (typeof session.sessionId !== "string" || !session.sessionId || sessions.has(session.sessionId) || !Array.isArray(session.entries)) {
      throw new Error("The source session is invalid or duplicated.");
    }
    sessions.add(session.sessionId);
    const entries = new Set();
    for (const entry of session.entries) {
      if (typeof entry.entryId !== "string" || !entry.entryId || entries.has(entry.entryId) ||
          !["user", "assistant", "toolResult"].includes(entry.role) || typeof entry.text !== "string") {
        throw new Error("The source entry is invalid or duplicated.");
      }
      entries.add(entry.entryId);
    }
  }
  return data;
}

// Each worker owns one immutable snapshot. The runner still rechecks its full hash.
export function createSourceLoader() {
  let cached;
  return (path, expectedHash) => {
    const stamp = sourceStamp(path);
    if (cached?.path === path && cached.expectedHash === expectedHash) {
      if (stamp !== cached.stamp) throw new Error("The source snapshot changed.");
      return cached.data;
    }
    const data = loadSources(path, expectedHash);
    if (sourceStamp(path) !== stamp) throw new Error("The source snapshot changed while it was loaded.");
    for (const session of data.sessions) {
      for (const entry of session.entries) Object.freeze(entry);
      Object.freeze(session.entries);
      Object.freeze(session);
    }
    Object.freeze(data.sessions);
    Object.freeze(data);
    cached = { path, expectedHash, stamp, data };
    return data;
  };
}

export function validateEvidence(entries, evidence) {
  if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > 3) {
    throw new Error("Use one to three evidence quotes.");
  }
  return evidence.map((item) => {
    const matches = entries.filter((entry) => entry.entryId === item.entryId);
    if (matches.length !== 1) throw new Error(`The evidence entry ${item.entryId} is not in the source or is ambiguous.`);
    const entry = matches[0];
    if (typeof item.quote !== "string" || !item.quote.trim() || item.quote.length > 500 || !entry.text.includes(item.quote)) {
      throw new Error(`The evidence quote for ${item.entryId} is not in that entry or exceeds 500 characters.`);
    }
    return { entryId: entry.entryId, quote: item.quote, role: entry.role,
      ...(entry.timestamp ? { timestamp: entry.timestamp } : {}) };
  });
}

function integer(value, minimum, maximum, name) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`The ${name} must be an integer from ${minimum} to ${maximum}.`);
  }
}

export function readSource(data, { sessionId, entryId, offset = 0, limit = SOURCE_PAGE_LIMIT }) {
  integer(offset, 0, Number.MAX_SAFE_INTEGER, "offset");
  integer(limit, 1, SOURCE_PAGE_LIMIT, "limit");
  const session = data.sessions.find((item) => item.sessionId === sessionId);
  if (!session) throw new Error(`The source session ${sessionId} is not available in this job.`);
  const index = session.entries.findIndex((entry) => entry.entryId === entryId);
  if (index < 0) throw new Error(`The source entry ${entryId} is not available in session ${sessionId}.`);
  const entry = session.entries[index];
  if (offset > entry.text.length) throw new Error("The offset exceeds the source entry length.");
  const end = Math.min(entry.text.length, offset + limit);
  return { sessionId, ...entry, text: entry.text.slice(offset, end), offset, totalCharacters: entry.text.length,
    nextOffset: end < entry.text.length ? end : null,
    previousEntryId: session.entries[index - 1]?.entryId ?? null,
    nextEntryId: session.entries[index + 1]?.entryId ?? null,
    limited: session.limited === true };
}

export function searchSources(data, { query, sessionId, offset = 0 }) {
  if (typeof query !== "string" || !query.trim() || query.length > 200) throw new Error("Use a search query of 1 to 200 characters.");
  integer(offset, 0, Number.MAX_SAFE_INTEGER, "offset");
  if (sessionId && !data.sessions.some((session) => session.sessionId === sessionId)) {
    throw new Error(`The source session ${sessionId} is not available in this job.`);
  }
  const needle = query.toLowerCase();
  const matches = [];
  let skipped = 0;
  for (const session of data.sessions) {
    if (sessionId && session.sessionId !== sessionId) continue;
    for (const entry of session.entries) {
      const position = entry.text.toLowerCase().indexOf(needle);
      if (position < 0) continue;
      if (skipped++ < offset) continue;
      if (matches.length === SOURCE_MATCH_LIMIT) return { matches, nextOffset: offset + matches.length };
      const start = Math.max(0, position - 80);
      matches.push({ sessionId: session.sessionId, entryId: entry.entryId, role: entry.role,
        ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
        excerpt: entry.text.slice(start, start + 240), offset: start, limited: session.limited === true });
    }
  }
  return { matches, nextOffset: null };
}


export function sourceBatch(data, requests) {
  if (!Array.isArray(requests) || !requests.length || requests.length > SOURCE_BATCH_LIMIT) {
    throw new Error(`Supply one to ${SOURCE_BATCH_LIMIT} source requests.`);
  }
  let remaining = SOURCE_BATCH_CHARACTERS;
  return requests.map((input, index) => {
    try {
      if (!["search", "read"].includes(input.action)) throw new Error("Use search or read for each source request.");
      const result = input.action === "search" ? searchSources(data, input) : readSource(data, input);
      const size = input.action === "search"
        ? result.matches.reduce((total, match) => total + match.excerpt.length, 0) : result.text.length;
      if (size > remaining) return { index, deferred: true };
      remaining -= size;
      return { index, result };
    } catch (error) {
      return { index, error: error.message };
    }
  });
}
