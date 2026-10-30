import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SAMPLE_RATE = 16_000;
export const CONFIG_PATH = join(homedir(), ".pi", "agent", "pi-voice.json");
const MODEL = "gemini-3.5-transcribe";

export type VoiceConfig = {
  /** Google Cloud project. Defaults to GOOGLE_CLOUD_PROJECT. */
  project?: string;
  /** Optional pass entry containing a service-account-bound Google Cloud API key. */
  apiKeyPassPath?: string;
  /** Vertex location for the model: "global", "us" or "eu". */
  location: string;
  /** BCP-47 codes, such as ["en-GB"]. Empty means automatic detection. */
  languageCodes: string[];
  /** "SMART" removes filler words and applies spoken corrections. "VERBATIM" keeps everything. */
  mode: "SMART" | "VERBATIM";
  /** Names and jargon the model should recognise. Up to 1,000 terms. */
  customVocabulary: string[];
  /** Pi shortcut that starts and stops recording. Read at startup. */
  shortcut: string;
};

const DEFAULTS: VoiceConfig = {
  location: "global",
  languageCodes: [],
  mode: "SMART",
  customVocabulary: [],
  shortcut: "ctrl+space",
};

export function readConfig(path = CONFIG_PATH): VoiceConfig {
  let file: Partial<VoiceConfig> = {};
  try {
    file = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ...DEFAULTS, project: process.env.GOOGLE_CLOUD_PROJECT, ...file };
}

/** 16-bit mono PCM WAV from the recorder's float samples. */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Buffer {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buffer.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return buffer;
}

export function endpoint(config: VoiceConfig): string {
  const host = config.location === "global"
    ? "aiplatform.googleapis.com"
    : `aiplatform.${config.location}.rep.googleapis.com`;
  return `https://${host}/v1/projects/${config.project}/locations/${config.location}/publishers/google/models/${MODEL}:generateContent`;
}

type GenerateResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
};

export function transcriptFrom(response: GenerateResponse): string {
  return (response.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

type AuthClient = { getRequestHeaders(): Promise<Record<string, string> | Headers> };
type CommandRunner = (file: string, args: string[], signal?: AbortSignal) => Promise<string>;
let authClient: Promise<AuthClient> | undefined;

/** Application Default Credentials, loaded once and refreshed by the library. */
export function prepareAuth(): Promise<AuthClient> {
  authClient ??= import("google-auth-library").then(({ GoogleAuth }) =>
    new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient()
  );
  authClient.catch(() => { authClient = undefined; });
  return authClient;
}

const runCommand: CommandRunner = (file, args, signal) => new Promise((resolve, reject) => {
  execFile(file, args, { encoding: "utf8", signal }, (error, stdout) => {
    if (error) reject(error);
    else resolve(stdout);
  });
});

/** Read the secret from the first line of a pass entry. */
export async function readApiKey(passPath: string, signal?: AbortSignal, run: CommandRunner = runCommand): Promise<string> {
  let output: string;
  try {
    output = await run("pass", ["show", passPath], signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`Cannot read Google API key from pass entry "${passPath}": ${error instanceof Error ? error.message : String(error)}`);
  }
  const key = output.split(/\r?\n/, 1)[0]?.trim();
  if (!key) throw new Error(`Pass entry "${passPath}" has an empty first line.`);
  return key;
}

export async function transcribe(samples: Float32Array, config: VoiceConfig, signal: AbortSignal): Promise<string> {
  if (!config.project) {
    throw new Error(`No Google Cloud project. Set GOOGLE_CLOUD_PROJECT or "project" in ${CONFIG_PATH}.`);
  }
  const headers = config.apiKeyPassPath
    ? new Headers({ "x-goog-api-key": await readApiKey(config.apiKeyPassPath, signal) })
    : new Headers(await (await prepareAuth()).getRequestHeaders());
  headers.set("Content-Type", "application/json");
  const audioTranscriptionConfig: Record<string, unknown> = { mode: config.mode };
  if (config.languageCodes.length) audioTranscriptionConfig.languageCodes = config.languageCodes;
  if (config.customVocabulary.length) audioTranscriptionConfig.customVocabulary = config.customVocabulary;

  const response = await fetch(endpoint(config), {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/wav", data: encodeWav(samples).toString("base64") } }] }],
      generationConfig: { audioTranscriptionConfig },
    }),
  });
  const body = await response.json().catch(() => ({})) as GenerateResponse;
  if (!response.ok) throw new Error(`Gemini returned ${response.status}: ${body.error?.message ?? response.statusText}`);
  return transcriptFrom(body);
}
