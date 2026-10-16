import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface OpenCodeGoConfig {
  workspaceId: string;
  authCookie: string;
}

export type ResolvedOpenCodeGoConfig =
  | { state: "none" }
  | { state: "configured"; config: OpenCodeGoConfig; source: string }
  | { state: "incomplete"; source: string; missing: string }
  | { state: "invalid"; source: string; error: string };

function getConfigCandidatePaths(): string[] {
  const home = homedir();
  return [
    join(home, ".config", "opencode", "opencode-quota", "opencode-go.json"),
    join(home, ".config", "opencode-go", "config.json"),
  ];
}

async function readConfigFile(
  path: string,
): Promise<
  | { state: "missing" }
  | { state: "loaded"; config: Partial<OpenCodeGoConfig> }
  | { state: "invalid"; error: string }
> {
  try {
    const data = await readFile(path, "utf-8");
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        state: "invalid",
        error: "Config file must contain a JSON object",
      };
    }
    return { state: "loaded", config: parsed as Partial<OpenCodeGoConfig> };
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return { state: "missing" };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      state: "invalid",
      error: `Failed to read config file: ${message}`,
    };
  }
}

export function resolveOpenCodeGoConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedOpenCodeGoConfig | null {
  const workspaceId = env.OPENCODE_GO_WORKSPACE_ID?.trim();
  const authCookie = env.OPENCODE_GO_AUTH_COOKIE?.trim();

  if (!workspaceId && !authCookie) return null;

  if (workspaceId && authCookie) {
    return {
      state: "configured",
      config: { workspaceId, authCookie },
      source: "env",
    };
  }

  return {
    state: "incomplete",
    source: "env",
    missing: workspaceId
      ? "OPENCODE_GO_AUTH_COOKIE"
      : "OPENCODE_GO_WORKSPACE_ID",
  };
}

export async function resolveOpenCodeGoConfig(): Promise<ResolvedOpenCodeGoConfig> {
  const envResult = resolveOpenCodeGoConfigFromEnv();
  if (envResult) return envResult;

  const candidates = getConfigCandidatePaths();
  for (const path of candidates) {
    const fileResult = await readConfigFile(path);
    if (fileResult.state === "missing") continue;
    if (fileResult.state === "invalid") {
      return { state: "invalid", source: path, error: fileResult.error };
    }

    const config = fileResult.config;
    const workspaceId =
      typeof config.workspaceId === "string" ? config.workspaceId.trim() : "";
    const authCookie =
      typeof config.authCookie === "string" ? config.authCookie.trim() : "";

    if (workspaceId && authCookie) {
      return {
        state: "configured",
        config: { workspaceId, authCookie },
        source: path,
      };
    }

    const missing = !workspaceId ? "workspaceId" : "authCookie";
    return { state: "incomplete", source: path, missing };
  }

  return { state: "none" };
}

let cachedConfig: ResolvedOpenCodeGoConfig | null = null;
let cachedAt = 0;

const CACHE_MAX_AGE_MS = 30_000;

export async function resolveOpenCodeGoConfigCached(params?: {
  maxAgeMs?: number;
}): Promise<ResolvedOpenCodeGoConfig> {
  const maxAgeMs = Math.max(0, params?.maxAgeMs ?? CACHE_MAX_AGE_MS);
  const now = Date.now();
  if (cachedConfig && now - cachedAt < maxAgeMs) {
    return cachedConfig;
  }
  cachedConfig = await resolveOpenCodeGoConfig();
  cachedAt = now;
  return cachedConfig;
}
