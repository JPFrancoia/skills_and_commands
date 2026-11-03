import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { QuotaAuthStorage } from "../types/quotas.js";

type CompatibleModelRegistry = {
  authStorage?: QuotaAuthStorage;
  getApiKeyForProvider?: (provider: string) => Promise<string | undefined>;
  getProviderAuth?: (provider: string) => Promise<unknown>;
};

function storedCredential(provider: string): unknown {
  try {
    const authPath = join(getAgentDir(), "auth.json");
    const credentials = JSON.parse(readFileSync(authPath, "utf8")) as Record<
      string,
      unknown
    >;
    return credentials[provider];
  } catch {
    return undefined;
  }
}

/**
 * Support both upstream Pi's legacy `modelRegistry.authStorage` API and
 * newer Pi distributions that expose resolved provider auth through methods.
 */
export function quotaAuthStorage(
  modelRegistry: CompatibleModelRegistry,
): QuotaAuthStorage {
  const legacy = modelRegistry.authStorage;
  if (legacy) return legacy;

  return {
    // Quota endpoints need stored OAuth metadata such as the GitHub refresh
    // token and Codex account id, which resolved provider auth omits.
    get: storedCredential,
    getApiKey: async (provider: string) => {
      const apiKey = await modelRegistry.getApiKeyForProvider?.(provider);
      if (apiKey) return apiKey;

      const result = await modelRegistry.getProviderAuth?.(provider) as
        | {
            auth?: {
              apiKey?: string;
              headers?: Record<string, string | null | undefined>;
            };
          }
        | undefined;
      const authorization = result?.auth?.headers?.Authorization;
      return result?.auth?.apiKey ?? authorization?.replace(/^Bearer\s+/i, "");
    },
  };
}
