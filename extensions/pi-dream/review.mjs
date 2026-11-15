import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryFiles } from "./store.mjs";
import { sourcesHash, validateEvidence, searchSources, SOURCE_PAGE_LIMIT } from "./sources.mjs";

const REVIEW_STALL_CONTINUATIONS = 3;
const REVIEW_PAGE_ITEMS = 10;
const REVIEW_PAGE_CHARACTERS = 8000;
export const REVIEW_OUTCOMES = ["supported", "corrected", "unsupported", "nonfactual"];

function textHash(root, path) {
  return existsSync(join(root, path)) ? sourcesHash(readFileSync(join(root, path))) : "missing";
}

// These are coverage units, not a claim parser. Every claim in a unit still needs review.
function passages(text) {
  const body = text.replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---(?:\n|$)/, "");
  return body.split(/\n\s*\n|\n(?=\s*(?:[-*+] |\d+\. ))/).map((part) => part.trim())
    .filter(Boolean);
}

export function createReview(manifest) {
  const available = new Set(memoryFiles(manifest.candidateRoot));
  let next = 0;
  const files = manifest.reviewPaths.map((path) => {
    if (!available.has(path)) throw new Error(`The review file is not in the candidate: ${path}`);
    const text = readFileSync(join(manifest.candidateRoot, path), "utf8");
    return { path, hash: sourcesHash(text), passages: passages(text).map((text) => ({ id: `p${++next}`, text })) };
  });
  return { version: 1, sourcesHash: manifest.sourcesHash, files, readPaths: [], searches: [], reads: [], outcomes: {} };
}

export function recordSearch(review, input, result) {
  let search = review.searches.find((item) => item.query === input.query && item.sessionId === input.sessionId);
  if (!search) {
    search = { id: `q${review.searches.length + 1}`, query: input.query,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}), pages: [] };
    review.searches.push(search);
  }
  if (search.closedReason !== undefined) {
    delete search.closedReason;
    delete review.comparison;
    delete review.finalHashes;
  }
  const offset = input.offset ?? 0;
  search.pages = search.pages.filter((page) => page.offset !== offset);
  search.pages.push({ offset, nextOffset: result.nextOffset,
    matches: (result.matches ?? []).map((match) => ({ sessionId: match.sessionId, entryId: match.entryId,
      offset: match.offset, end: match.offset + match.excerpt.length })) });
  return search.id;
}

export function recordSourceRead(review, result) {
  review.reads.push({ sessionId: result.sessionId, entryId: result.entryId,
    offset: result.offset, end: result.offset + result.text.length });
}

function exhausted(search) {
  let offset = 0;
  const seen = new Set();
  while (!seen.has(offset)) {
    seen.add(offset);
    const page = search.pages.find((item) => item.offset === offset);
    if (!page) return false;
    if (page.nextOffset === null) return true;
    if (!Number.isSafeInteger(page.nextOffset) || page.nextOffset <= offset) return false;
    offset = page.nextOffset;
  }
  return false;
}

function completedSearches(review, search) {
  if (search.closedReason !== undefined) return [];
  if (exhausted(search)) return [search];
  return review.searches.filter((other) =>
    other.id !== search.id && other.closedReason === undefined && exhausted(other) &&
    (!search.sessionId || other.sessionId === search.sessionId) &&
    other.query.toLowerCase().includes(search.query.toLowerCase()) &&
    (other.query.length > search.query.length || (!search.sessionId && other.sessionId)));
}

export function resolvedSearch(review, search) {
  return completedSearches(review, search).length > 0;
}

function explanation(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 4000) {
    throw new Error(`The ${label} needs an explanation of 1 to 4000 characters.`);
  }
}

function validateSearchClosures(review) {
  for (const search of review.searches) {
    if (search.closedReason === undefined) continue;
    explanation(search.closedReason, "search closure");
    if (exhausted(search)) throw new Error(`Completed search ${search.id} cannot be closed.`);
    if (Object.values(review.outcomes).some((outcome) => outcome.searchIds.includes(search.id))) {
      throw new Error(`Search ${search.id} is used by a review outcome and cannot be closed.`);
    }
  }
}

export function closeSearches(review, closures) {
  if (!Array.isArray(closures) || !closures.length || closures.length > 20) {
    throw new Error("Supply one to twenty search closures.");
  }
  const seen = new Set();
  for (const closure of closures) {
    const search = review.searches.find((item) => item.id === closure?.id);
    if (!search) throw new Error(`Search ${closure?.id} does not exist.`);
    if (seen.has(search.id)) throw new Error(`Search ${search.id} occurs more than once.`);
    seen.add(search.id);
    explanation(closure.reason, "search closure");
    if (Object.values(review.outcomes).some((outcome) => outcome.searchIds.includes(search.id))) {
      throw new Error(`Search ${search.id} is used by a review outcome and cannot be closed.`);
    }
    if (resolvedSearch(review, search)) throw new Error(`Search ${search.id} is already complete or narrowed.`);
  }
  for (const { id, reason } of closures) {
    const search = review.searches.find((item) => item.id === id);
    if (search.closedReason === reason) continue;
    search.closedReason = reason;
    delete review.comparison;
    delete review.finalHashes;
  }
}

function validateOutcome(review, outcome, findings, sources) {
  if (!review.files.some((file) => file.passages.some((passage) => passage.id === outcome.id))) {
    throw new Error(`The review passage ${outcome.id} does not exist.`);
  }
  if (!REVIEW_OUTCOMES.includes(outcome.outcome)) throw new Error("The review outcome is invalid.");
  explanation(outcome.reason, "review outcome");
  if (!Array.isArray(outcome.findingIds) || !Array.isArray(outcome.searchIds)) {
    throw new Error("Each review outcome needs findingIds and searchIds arrays.");
  }
  for (const id of outcome.searchIds) {
    const search = review.searches.find((item) => item.id === id);
    if (!search || !resolvedSearch(review, search)) {
      throw new Error(`Search ${id} is incomplete. Read its remaining pages or complete a narrower search.`);
    }
    if (outcome.outcome === "unsupported" && !completedSearches(review, search).some((completed) =>
      completed.pages.every((page) => page.matches.every((match) => review.reads.some((read) =>
        read.sessionId === match.sessionId && read.entryId === match.entryId &&
        read.offset <= match.offset && read.end >= match.end))))) {
      throw new Error(`Read the matching source passages for search ${id} before recording missing evidence, or use a narrower search.`);
    }
  }
  if (outcome.outcome === "unsupported" && sources.sessions.length && !outcome.searchIds.length) {
    throw new Error("Missing evidence needs a completed source search, not an unchecked claim.");
  }
  if (["supported", "corrected"].includes(outcome.outcome) && !outcome.findingIds.length) {
    throw new Error("Supported or corrected passages need source-backed findings.");
  }
  for (const id of outcome.findingIds) {
    const finding = findings.find((item) => item.id === id);
    if (!finding || finding.source === "note") throw new Error(`Finding ${id} is missing or is only a note.`);
    const session = sources.sessions.find((item) => item.sessionId === finding.sessionId);
    if (!session) throw new Error(`The source session for finding ${id} is missing.`);
    for (const evidence of validateEvidence(session.entries, finding.evidence)) {
      const entry = session.entries.find((item) => item.entryId === evidence.entryId);
      const read = review.reads.some((item) => item.sessionId === finding.sessionId &&
        item.entryId === evidence.entryId && entry.text.slice(item.offset, item.end).includes(evidence.quote));
      if (!read) throw new Error(`Read the source evidence for finding ${id} before recording its review outcome.`);
    }
  }
}

export function recordOutcomes(review, outcomes, findings, sources) {
  if (!Array.isArray(outcomes) || !outcomes.length) throw new Error("Supply at least one review outcome.");
  for (const outcome of outcomes) validateOutcome(review, outcome, findings, sources);
  for (const outcome of outcomes) review.outcomes[outcome.id] = outcome;
  delete review.comparison;
  delete review.finalHashes;
}

export function reviewProgress(review, candidateRoot) {
  const pending = review.files.flatMap((file) => file.passages
    .filter((passage) => !review.outcomes[passage.id]).map((passage) => ({ path: file.path, ...passage })));
  const unread = review.files.filter((file) => !review.readPaths.includes(file.path)).map((file) => file.path);
  const openSearches = review.searches.filter((search) => search.closedReason === undefined && !resolvedSearch(review, search));
  const comparisonCurrent = !!review.comparison && review.files.every((file) =>
    review.finalHashes?.[file.path] === textHash(candidateRoot, file.path));
  return {
    reviewedFiles: review.files.filter((file) => !unread.includes(file.path) &&
      file.passages.every((passage) => review.outcomes[passage.id])).length,
    totalFiles: review.files.length,
    reviewedPassages: Object.keys(review.outcomes).length,
    totalPassages: review.files.reduce((sum, file) => sum + file.passages.length, 0),
    unread, pending, openSearches,
    closedSearchCount: review.searches.filter((search) => search.closedReason !== undefined).length,
    comparisonCurrent,
    complete: !pending.length && !unread.length && !openSearches.length && comparisonCurrent,
  };
}

// Page original indices so recording earlier outcomes cannot shift the next page.
export function reviewResponse(review, candidateRoot, input) {
  const { pending, unread, openSearches, ...counts } = reviewProgress(review, candidateRoot);
  const summary = { ...counts, pendingPassages: pending.length, unreadFiles: unread.length,
    openSearchCount: openSearches.length };
  const history = input.action === "history";
  if (input.action !== "status" && !history) return summary;

  const all = review.files.flatMap((file) => file.passages.map((passage) => ({ path: file.path, ...passage,
    ...(history ? { text: JSON.stringify(review.outcomes[passage.id] ?? null) } : {}) })));
  let { passage = 0, offset = 0 } = input.cursor ?? {};
  const searchOffset = input.searchOffset ?? 0;
  if (![passage, offset, searchOffset].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      passage > all.length || offset > (all[passage]?.text.length ?? 0) || searchOffset > review.searches.length) {
    throw new Error("The review page cursor is invalid. Use the cursor returned by dream_review status.");
  }
  const page = [];
  let remaining = REVIEW_PAGE_CHARACTERS;
  while (passage < all.length) {
    const item = all[passage];
    if ((history ? !review.outcomes[item.id] : review.outcomes[item.id]) || offset === item.text.length) {
      passage += 1;
      offset = 0;
      continue;
    }
    if (page.length === REVIEW_PAGE_ITEMS || !remaining) break;
    const text = item.text.slice(offset, offset + remaining);
    page.push({ ...item, text, offset, totalCharacters: item.text.length });
    remaining -= text.length;
    offset += text.length;
  }
  if (history) return { ...summary, recorded: page, nextCursor: passage < all.length ? { passage, offset } : null };
  const searchPage = [];
  let searchIndex = searchOffset;
  for (; searchIndex < review.searches.length; searchIndex += 1) {
    const search = review.searches[searchIndex];
    if (search.closedReason !== undefined || resolvedSearch(review, search)) continue;
    if (searchPage.length === REVIEW_PAGE_ITEMS) break;
    let nextOffset = 0;
    while (true) {
      const entry = search.pages.find((item) => item.offset === nextOffset);
      if (!entry || !Number.isSafeInteger(entry.nextOffset) || entry.nextOffset <= nextOffset) break;
      nextOffset = entry.nextOffset;
    }
    searchPage.push({ id: search.id, query: search.query, sessionId: search.sessionId, nextOffset });
  }
  return { ...summary, pending: page, nextCursor: passage < all.length ? { passage, offset } : null,
    unread: unread.slice(0, REVIEW_PAGE_ITEMS), openSearches: searchPage,
    nextSearchOffset: searchIndex < review.searches.length ? searchIndex : null };
}

export function finishReview(review, comparison, candidateRoot) {
  validateSearchClosures(review);
  explanation(comparison, "combined comparison");
  const progress = reviewProgress(review, candidateRoot);
  if (progress.pending.length || progress.unread.length || progress.openSearches.length) {
    throw new Error("The combined review is incomplete. Use dream_review status to inspect the remaining work.");
  }
  review.comparison = comparison;
  review.finalHashes = Object.fromEntries(review.files.map((file) => [file.path, textHash(candidateRoot, file.path)]));
}

export function validateReviewState(review, manifest, findings, sources) {
  const expected = createReview(manifest);
  if (review?.version !== 1 || review.sourcesHash !== expected.sourcesHash ||
      JSON.stringify(review.files) !== JSON.stringify(expected.files)) {
    throw new Error("The review inputs changed or the review record is missing.");
  }
  validateSearchClosures(review);
  for (const [id, outcome] of Object.entries(review.outcomes)) {
    if (outcome.id !== id) throw new Error("The review outcome ID changed.");
    validateOutcome(review, outcome, findings, sources);
  }
}

// Recovery checks receipts against the immutable snapshot, not the old model report.
export function validateReviewReceipts(review, sources) {
  validateSearchClosures(review);
  if (!Array.isArray(review.readPaths) || review.readPaths.some((path) => !review.files.some((file) => file.path === path))) {
    throw new Error("The saved review file reads are invalid.");
  }
  for (const read of review.reads) {
    const entry = sources.sessions.find((session) => session.sessionId === read.sessionId)?.entries
      .find((entry) => entry.entryId === read.entryId);
    if (!entry || !Number.isSafeInteger(read.offset) || !Number.isSafeInteger(read.end) ||
        read.offset < 0 || read.end < read.offset || read.end > entry.text.length || read.end - read.offset > SOURCE_PAGE_LIMIT) {
      throw new Error("The saved source-read range is invalid.");
    }
  }
  const replay = { searches: [] };
  for (const search of review.searches) {
    for (const page of search.pages) {
      const input = { query: search.query, sessionId: search.sessionId, offset: page.offset };
      recordSearch(replay, input, searchSources(sources, input));
    }
  }
  const receipts = review.searches.map(({ closedReason, ...search }) => search);
  if (JSON.stringify(replay.searches) !== JSON.stringify(receipts)) {
    throw new Error("The saved source searches changed or are invalid.");
  }
}

export function validateReview(review, manifest, candidateRoot, findings, sources) {
  validateReviewState(review, manifest, findings, sources);
  const progress = reviewProgress(review, candidateRoot);
  if (!progress.complete) {
    throw new Error(`The combined review is incomplete: ${progress.reviewedFiles}/${progress.totalFiles} files, ${progress.reviewedPassages}/${progress.totalPassages} passages. Finish the checks and combined comparison.`);
  }
  explanation(review.comparison, "combined comparison");
  return progress;
}

export function reviewReport(review, candidateRoot) {
  const progress = reviewProgress(review, candidateRoot);
  return [
    "## Review coverage", "",
    `${progress.reviewedFiles}/${progress.totalFiles} files and ${progress.reviewedPassages}/${progress.totalPassages} passages have recorded outcomes.`,
    "Recorded coverage does not prove that the evidence supports the conclusions.", "",
    ...review.files.flatMap((file) => [
      `### ${file.path}`, "",
      ...file.passages.map((passage) => {
        const outcome = review.outcomes[passage.id];
        return `- ${passage.id}: ${outcome?.outcome ?? "unchecked"} — ${outcome?.reason ?? "No outcome recorded."}`;
      }), "",
    ]),
    "### Combined comparison", "", review.comparison ?? "Not completed.", "",
    "### Searches narrowed instead of exhausted", "",
    ...review.searches.filter((search) => search.closedReason === undefined && !exhausted(search)).map((search) =>
      `- ${search.id}: ${search.query} (${resolvedSearch(review, search) ? "narrowed" : "incomplete"})`), "",
    "### Unused searches closed without evidence", "",
    ...review.searches.filter((search) => search.closedReason !== undefined).map((search) =>
      `- ${search.id}: ${search.query} (${search.sessionId ?? "all sessions"}) — ${search.closedReason}`), "",
  ].join("\n");
}

export function reviewContinuation(review, candidateRoot, state, entries) {
  const progress = reviewProgress(review, candidateRoot);
  if (progress.complete) return;
  const current = [progress.reviewedPassages, new Set(review.readPaths).size,
    review.searches.reduce((total, search) => total + search.pages.length, 0),
    new Set(review.reads.map((read) => JSON.stringify(read))).size, progress.closedSearchCount];
  const previous = state.progress ?? current.map(() => 0);
  const advanced = current.some((value, index) => value > previous[index]);
  state.progress = current.map((value, index) => Math.max(value, previous[index]));
  state.stalled = advanced ? 0 : (state.stalled ?? 0) + 1;
  if (state.stalled > REVIEW_STALL_CONTINUATIONS) return;
  return {
    entries: [...entries, {
      type: "custom_message", customType: "dream-review-incomplete", display: false,
      content: `The combined review is incomplete: ${progress.reviewedFiles}/${progress.totalFiles} files and ${progress.reviewedPassages}/${progress.totalPassages} passages. Continue the same review across all selected files. Use paged dream_review status only when you need more passages or open searches. Record outcomes for every passage, then finish the combined comparison. Do not stop to give an interim report. Missing evidence needs completed searches, not deferred work. Close discarded unused searches with dream_review close_searches and a reason. Closed searches cannot support outcomes. ${advanced ? "New review work was recorded. Continue within the remaining time limit." : `No new review work was recorded. This is no-progress continuation ${state.stalled} of ${REVIEW_STALL_CONTINUATIONS}.`}`,
    }],
    continue: true,
  };
}
