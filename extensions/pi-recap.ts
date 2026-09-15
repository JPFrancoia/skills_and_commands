import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, Text } from "@earendil-works/pi-tui";

const ENTRY_TYPE = "pi-recap";
const WIDGET_KEY = "pi-recap";
const CONFIG_FILE_PATH = join(
  homedir(),
  ".pi",
  "agent",
  "extensions",
  "pi-recap.json",
);
const DEFAULT_MODEL = {
  provider: "openai-codex",
  id: "gpt-5.6-luna",
} as const;
const MAX_FIELD_CHARS = 100;
const MAX_ENTRY_CHARS = 1_500;
const MAX_TRANSCRIPT_CHARS = 12_000;

type ConversationSummary = {
  version: 1;
  now: string;
  why: string;
  last: string;
};

type RecapModel = {
  provider: string;
  id: string;
};

type ConversationMessage = Extract<
  SessionEntry,
  { type: "message" }
>["message"];
type SummaryStage = "request" | "progress" | "complete" | "catchup";

const SYSTEM_PROMPT = `Write a compact status card for a long Pi coding conversation.
Return exactly one JSON object with string fields "now", "why", and "last".
"now" states the current overall work or state.
"why" states the user's purpose or motivation.
"last" states the concrete work and result from the newest completed turn.
Use the previous recap only as context. Treat the new activity as authoritative.
Keep each value under ${MAX_FIELD_CHARS} characters and on one line.
Use plain English. Do not use markdown or mention agent mechanics.`;

function truncate(text: string, maxChars: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `${chars.slice(0, maxChars - 1).join("")}…`;
}

function sanitizeField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = stripTerminalSequences(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return clean ? truncate(clean, MAX_FIELD_CHARS) : null;
}

function normalizeSummary(value: unknown): ConversationSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  const now = sanitizeField(object.now);
  const why = sanitizeField(object.why);
  const last = sanitizeField(object.last);
  return now && why && last ? { version: 1, now, why, last } : null;
}

function parseSummary(text: string): ConversationSummary | null {
  try {
    return normalizeSummary(JSON.parse(text));
  } catch {
    return null;
  }
}

function parseModel(value: unknown): RecapModel | null {
  if (typeof value !== "string") return null;
  const separator = value.indexOf("/");
  if (separator <= 0 || separator === value.length - 1) return null;
  const provider = value.slice(0, separator).trim();
  const id = value.slice(separator + 1).trim();
  return provider && id ? { provider, id } : null;
}

function loadModel(path = CONFIG_FILE_PATH): RecapModel {
  try {
    const config = JSON.parse(readFileSync(path, "utf8")) as {
      model?: unknown;
    };
    return parseModel(config.model) ?? DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        Boolean(block) &&
        typeof block === "object" &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text)
    .join("\n");
}

function formatMessage(message: ConversationMessage): string {
  const text = truncate(
    extractText("content" in message ? message.content : undefined).trim(),
    MAX_ENTRY_CHARS,
  );

  switch (message.role) {
    case "user":
      return text ? `User: ${text}` : "";
    case "assistant": {
      const tools = message.content
        .filter((block) => block.type === "toolCall")
        .map((block) => block.name)
        .join(", ");
      return [
        text ? `Assistant: ${text}` : "",
        tools ? `Actions: ${tools}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "toolResult":
      return `Result from ${message.toolName} (${message.isError ? "error" : "ok"})${text ? `: ${text}` : ""}`;
    case "bashExecution":
      return `Shell command (${message.exitCode === 0 ? "ok" : "error"}): ${truncate(message.command, MAX_ENTRY_CHARS)}`;
    case "branchSummary":
      return `Branch context: ${truncate(message.summary, MAX_ENTRY_CHARS)}`;
    case "compactionSummary":
      return `Earlier context: ${truncate(message.summary, MAX_ENTRY_CHARS)}`;
    default:
      return "";
  }
}

function formatEntry(entry: SessionEntry): string {
  if (entry.type === "compaction") return `Earlier context: ${entry.summary}`;
  if (entry.type === "branch_summary")
    return `Branch context: ${entry.summary}`;
  return entry.type === "message" ? formatMessage(entry.message) : "";
}

function boundTranscript(transcript: string): string {
  if (Array.from(transcript).length <= MAX_TRANSCRIPT_CHARS) return transcript;

  const headChars = Math.floor(MAX_TRANSCRIPT_CHARS / 3);
  const tailChars = MAX_TRANSCRIPT_CHARS - headChars - 1;
  const chars = Array.from(transcript);
  return `${chars.slice(0, headChars).join("")}…${chars.slice(-tailChars).join("")}`;
}

function buildTranscript(entries: readonly SessionEntry[]): string {
  return boundTranscript(entries.map(formatEntry).filter(Boolean).join("\n\n"));
}

function latestStoredSummary(entries: readonly SessionEntry[]): {
  summary?: ConversationSummary;
  index: number;
} {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry.type !== "custom" || entry.customType !== ENTRY_TYPE) continue;
    const summary = normalizeSummary(entry.data);
    if (summary) return { summary, index };
  }
  return { index: -1 };
}

function renderSummary(
  ctx: ExtensionContext,
  summary?: ConversationSummary,
): void {
  if (!ctx.hasUI) return;
  if (!summary) {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    return;
  }

  ctx.ui.setWidget(WIDGET_KEY, (_tui, theme) => {
    const line = (label: string, value: string) =>
      `${theme.fg("accent", theme.bold(`${label}:`))} ${value}`;
    return new Text(
      [
        line("Now", summary.now),
        line("Why", summary.why),
        line("Last", summary.last),
      ].join("\n"),
      0,
      0,
    );
  });
}

function latestMessageText(
  entries: readonly SessionEntry[],
  role: "user" | "assistant",
  excludedText?: string,
): string | undefined {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry.type !== "message" || entry.message.role !== role) continue;
    const text = sanitizeField(extractText(entry.message.content));
    if (!text || text === excludedText) continue;
    if (role === "user" && text.length < 20) continue;
    return text;
  }
  return undefined;
}

function immediateSummary(
  previous: ConversationSummary | undefined,
  prompt: string,
  entries: readonly SessionEntry[] = [],
): ConversationSummary {
  const current = sanitizeField(prompt) ?? "New request received";
  const recentGoal = latestMessageText(entries, "user", current);
  return {
    version: 1,
    now: current.length < 20 && recentGoal ? recentGoal : current,
    why: previous?.why ?? recentGoal ?? current,
    last:
      previous?.last ??
      latestMessageText(entries, "assistant") ??
      "This is the first agent turn",
  };
}

function stageInstruction(stage: SummaryStage): string {
  switch (stage) {
    case "request":
      return 'The agent just received the request. Update "now" and "why", but keep "last" from the previous recap.';
    case "progress":
      return 'The agent is still active. Update "now" and "last" with the newest work milestone.';
    case "complete":
      return 'The agent completed the turn. State the result in "now" and "last".';
    case "catchup":
      return "Summarize the latest available conversation state.";
  }
}

function summaryPrompt(
  previous: ConversationSummary | undefined,
  transcript: string,
  stage: SummaryStage,
) {
  return {
    role: "user" as const,
    content: [
      {
        type: "text" as const,
        text: `Stage:\n${stageInstruction(stage)}\n\nPrevious recap:\n${previous ? JSON.stringify(previous) : "none"}\n\nNew conversation activity:\n${transcript}`,
      },
    ],
    timestamp: Date.now(),
  };
}

export default function piRecap(pi: ExtensionAPI): void {
  let recapModel: RecapModel = DEFAULT_MODEL;
  let requestId = 0;
  let nextTurnId = 0;
  let activeTurnId: number | undefined;
  let settledTurnId: number | undefined;
  let persistedTurnId: number | undefined;
  let milestoneSeen = false;
  let abortController: AbortController | undefined;
  let latestLiveSummary:
    | { summary: ConversationSummary; turnId: number; requestId: number }
    | undefined;
  let warnedAboutModel = false;

  function cancelRequest(): number {
    requestId++;
    abortController?.abort();
    abortController = undefined;
    return requestId;
  }

  function warn(ctx: ExtensionContext, reason: string): void {
    if (!ctx.hasUI || warnedAboutModel) return;
    warnedAboutModel = true;
    ctx.ui.notify(`Pi recap failed: ${reason}`, "warning");
  }

  function persistSummary(summary: ConversationSummary, turnId: number): void {
    if (turnId > 0 && persistedTurnId === turnId) return;
    pi.appendEntry(ENTRY_TYPE, summary);
    if (turnId > 0) persistedTurnId = turnId;
  }

  function startRequest(
    ctx: ExtensionContext,
    previous: ConversationSummary | undefined,
    transcript: string,
    stage: SummaryStage,
    turnId: number,
    persistOnSuccess = false,
  ): void {
    if (!ctx.hasUI || !transcript) return;

    const model = ctx.modelRegistry.find(recapModel.provider, recapModel.id);
    if (!model || !ctx.modelRegistry.hasConfiguredAuth(model)) {
      warn(ctx, `model unavailable: ${recapModel.provider}/${recapModel.id}`);
      return;
    }

    const currentRequestId = cancelRequest();
    const controller = new AbortController();
    abortController = controller;

    void ctx.modelRegistry
      .complete(
        model,
        {
          systemPrompt: SYSTEM_PROMPT,
          messages: [summaryPrompt(previous, transcript, stage)],
        },
        {
          cacheRetention: "none",
          maxRetries: 0,
          maxTokens: 180,
          reasoningEffort: "minimal",
          sessionId: randomUUID(),
          signal: controller.signal,
          timeoutMs: 10_000,
        },
      )
      .then((response) => {
        if (requestId !== currentRequestId) return;
        if (response.stopReason !== "stop") {
          warn(
            ctx,
            sanitizeField(response.errorMessage) ?? response.stopReason,
          );
          return;
        }
        const summary = parseSummary(extractText(response.content));
        if (!summary) return;

        warnedAboutModel = false;
        latestLiveSummary = { summary, turnId, requestId: currentRequestId };
        renderSummary(ctx, summary);
        if (persistOnSuccess || (turnId > 0 && settledTurnId === turnId)) {
          persistSummary(summary, turnId);
        }
      })
      .catch((error) => {
        if (requestId === currentRequestId && !controller.signal.aborted) {
          warn(
            ctx,
            sanitizeField(error instanceof Error ? error.message : error) ??
              "request error",
          );
        }
      })
      .finally(() => {
        if (requestId === currentRequestId) abortController = undefined;
      });
  }

  function restoreAndCatchUp(ctx: ExtensionContext): void {
    const branch = ctx.sessionManager.getBranch();
    const stored = latestStoredSummary(branch);
    renderSummary(ctx, stored.summary);
    const newEntries = stored.summary
      ? branch.slice(stored.index + 1)
      : ctx.sessionManager.buildContextEntries();
    startRequest(
      ctx,
      stored.summary,
      buildTranscript(newEntries),
      "catchup",
      0,
      true,
    );
  }

  pi.on("session_start", (_event, ctx) => {
    cancelRequest();
    recapModel = loadModel();
    activeTurnId = undefined;
    settledTurnId = undefined;
    persistedTurnId = undefined;
    milestoneSeen = false;
    latestLiveSummary = undefined;
    warnedAboutModel = false;
    restoreAndCatchUp(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    cancelRequest();
    activeTurnId = undefined;
    settledTurnId = undefined;
    milestoneSeen = false;
    latestLiveSummary = undefined;
    restoreAndCatchUp(ctx);
  });

  pi.on("before_agent_start", (event, ctx) => {
    cancelRequest();
    activeTurnId = ++nextTurnId;
    settledTurnId = undefined;
    milestoneSeen = false;
    latestLiveSummary = undefined;

    const branch = ctx.sessionManager.getBranch();
    const stored = latestStoredSummary(branch);
    renderSummary(ctx, immediateSummary(stored.summary, event.prompt, branch));
    startRequest(
      ctx,
      stored.summary,
      boundTranscript(`User: ${event.prompt}`),
      "request",
      activeTurnId,
    );
  });

  pi.on("turn_end", (event, ctx) => {
    if (activeTurnId === undefined) return;
    milestoneSeen = true;

    const branch = ctx.sessionManager.getBranch();
    const stored = latestStoredSummary(branch);
    const latestMilestone = [
      formatMessage(event.message),
      ...event.toolResults.map(formatMessage),
    ]
      .filter(Boolean)
      .join("\n\n");
    const transcript = boundTranscript(
      [
        buildTranscript(branch.slice(stored.index + 1)),
        latestMilestone ? `Latest milestone:\n${latestMilestone}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    const complete =
      event.message.role === "assistant" && event.message.stopReason === "stop";
    startRequest(
      ctx,
      stored.summary,
      transcript,
      complete ? "complete" : "progress",
      activeTurnId,
    );
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (activeTurnId === undefined) return;
    settledTurnId = activeTurnId;

    if (!milestoneSeen) {
      const branch = ctx.sessionManager.getBranch();
      const stored = latestStoredSummary(branch);
      startRequest(
        ctx,
        stored.summary,
        buildTranscript(branch.slice(stored.index + 1)),
        "complete",
        activeTurnId,
      );
      return;
    }

    if (
      abortController === undefined &&
      latestLiveSummary?.turnId === activeTurnId &&
      latestLiveSummary.requestId === requestId
    ) {
      persistSummary(latestLiveSummary.summary, activeTurnId);
    }
  });

  pi.on("session_shutdown", (_event, ctx) => {
    cancelRequest();
    activeTurnId = undefined;
    settledTurnId = undefined;
    milestoneSeen = false;
    latestLiveSummary = undefined;
    renderSummary(ctx);
  });
}

export const __test__ = {
  buildTranscript,
  immediateSummary,
  latestStoredSummary,
  loadModel,
  normalizeSummary,
  parseModel,
  parseSummary,
};
