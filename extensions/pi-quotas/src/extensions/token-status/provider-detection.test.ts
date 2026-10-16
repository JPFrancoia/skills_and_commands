import { describe, expect, it } from "vitest";

// Extract isGoProvider logic for testing
function isGoProvider(provider: string | undefined): boolean {
  if (!provider) return false;
  return provider === "opencode-go" || provider.startsWith("opencode-go/");
}

describe("isGoProvider", () => {
  it("detects opencode-go provider", () => {
    expect(isGoProvider("opencode-go")).toBe(true);
  });

  it("detects opencode-go/ prefixed providers", () => {
    expect(isGoProvider("opencode-go/anthropic")).toBe(true);
    expect(isGoProvider("opencode-go/openai")).toBe(true);
  });

  it("rejects non-go providers", () => {
    expect(isGoProvider("opencode")).toBe(false);
    expect(isGoProvider("anthropic")).toBe(false);
    expect(isGoProvider("openai")).toBe(false);
    expect(isGoProvider("github-copilot")).toBe(false);
  });

  it("rejects undefined/empty", () => {
    expect(isGoProvider(undefined)).toBe(false);
    expect(isGoProvider("")).toBe(false);
  });
});
