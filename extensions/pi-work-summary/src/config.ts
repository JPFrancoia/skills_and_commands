import type { ThemeColor } from "@earendil-works/pi-coding-agent";

export const DISPLAY = {
  compactRows: true,
  compactToolRows: true,
  groupToolRuns: true,
  thinkingAsToolCall: false,
  foldIntermediateActivity: false,
  foldEarlierTurnsOnly: false,
  activitySummary: "tools" as "tools" | "elapsed",
  gutter: false,
  timer: true,
  keepActiveToolsExpanded: false as boolean | "expanded",
  toolLingerSeconds: 0,
  keepActiveThinkingExpanded: false,
  thinkingLingerSeconds: 0,
  glyphStyle: "unicode" as "unicode" | "ascii",
  excludeTools: ["think"] as string[],
};

export const SUMMARY_MODEL = { provider: "openai-codex", id: "gpt-6-luna" };
export const SUMMARY_LIMITS = {
  inputChars: 12_000,
  itemChars: 1_500,
  outputChars: 220,
  outputTokens: 512,
  debounceMs: 400,
  refreshMs: 5_000,
  timeoutMs: 10_000,
};

export const OPEN_MARKER = { unicode: "▾", ascii: "v" };
const GLYPHS = {
  unicode: { done: "✓", failed: "✗", running: "•", queued: "›", gutter: "▌", timer: "⏱", count: "×" },
  ascii: { done: "+", failed: "x", running: "*", queued: ">", gutter: "|", timer: "", count: "x" },
};
const TOKENS = {
  label: "success", details: "toolTitle", thinking: "thinkingText", error: "error", outputGutter: "borderMuted",
} satisfies Record<string, ThemeColor>;

export class Config {
  get<K extends keyof typeof DISPLAY>(key: K): (typeof DISPLAY)[K] {
    return DISPLAY[key];
  }

  glyphs() { return GLYPHS[DISPLAY.glyphStyle]; }
  tokens() { return TOKENS; }
  compacts(name: string): boolean {
    return DISPLAY.compactRows && DISPLAY.compactToolRows && !DISPLAY.excludeTools.includes(name);
  }
}
