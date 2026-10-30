import { rawKeyHint, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, type KeyId } from "@earendil-works/pi-tui";
import type { Recorder } from "@handy-computer/recorder";
import { prepareAuth, readConfig, SAMPLE_RATE, transcribe, type VoiceConfig } from "./gemini.ts";
import { clearStatus, RecordingMeter, showStatus } from "./visualizer.ts";

const MIN_SECONDS = 0.3;
const SUMMARY_MS = 5_000;

type State =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "recording"; recorder: Recorder; config: VoiceConfig }
  | { phase: "transcribing"; abort: AbortController };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function piVoice(pi: ExtensionAPI): void {
  let shortcut = "ctrl+space";
  try { shortcut = readConfig().shortcut; } catch { /* Reported when recording starts. */ }

  let state: State = { phase: "idle" };
  let stopListening: (() => void) | undefined;
  let summaryTimer: ReturnType<typeof setTimeout> | undefined;

  function listen(ctx: ExtensionContext): void {
    stopListening?.();
    stopListening = ctx.ui.onTerminalInput((data) => {
      if (state.phase === "recording") {
        if (matchesKey(data, "space") || matchesKey(data, shortcut as KeyId)) {
          void stop(ctx);
          return { consume: true };
        }
        if (matchesKey(data, "escape")) {
          void discard(ctx);
          return { consume: true };
        }
      }
      if (state.phase === "transcribing" && matchesKey(data, "escape")) {
        state.abort.abort();
        return { consume: true };
      }
    });
  }

  function unlisten(): void {
    stopListening?.();
    stopListening = undefined;
  }

  async function start(ctx: ExtensionContext): Promise<void> {
    if (summaryTimer) clearTimeout(summaryTimer);
    state = { phase: "starting" };
    showStatus(ctx, "Starting microphone…");
    try {
      const config = readConfig();
      if (!config.apiKeyPassPath) void prepareAuth().catch(() => undefined); // Overlap ADC loading with the recording.
      const { permissionStatus, Recorder } = await import("@handy-computer/recorder");
      if (process.platform === "darwin" && permissionStatus() === "denied") {
        throw new Error("Microphone access is denied. Allow your terminal in System Settings → Privacy & Security → Microphone.");
      }
      let meter: RecordingMeter | undefined;
      const recorder = await Recorder.open({
        sampleRate: SAMPLE_RATE,
        channels: "mono",
        framesPerChunk: 512,
        onChunk: ({ samples }) => meter?.push(samples),
        onFailure: (error) => ctx.ui.notify(`Microphone stopped: ${error.message}`, "warning"),
      });
      recorder.start();
      meter = new RecordingMeter(ctx, `${rawKeyHint(`space/${shortcut}`, "to transcribe")}  ${rawKeyHint("escape", "to discard")}`);
      state = { phase: "recording", recorder, config };
      listen(ctx);
    } catch (error) {
      state = { phase: "idle" };
      clearStatus(ctx);
      ctx.ui.notify(`Recording failed to start: ${message(error)}`, "error");
    }
  }

  async function finishRecording(recorder: Recorder): Promise<Float32Array> {
    try {
      return (await recorder.stop()).samples;
    } finally {
      await recorder.close().catch(() => undefined);
    }
  }

  async function discard(ctx: ExtensionContext): Promise<void> {
    if (state.phase !== "recording") return;
    const { recorder } = state;
    state = { phase: "idle" };
    unlisten();
    clearStatus(ctx);
    await finishRecording(recorder).catch(() => undefined);
    ctx.ui.notify("Recording discarded", "info");
  }

  async function stop(ctx: ExtensionContext): Promise<void> {
    if (state.phase !== "recording") return;
    const { recorder, config } = state;
    const abort = new AbortController();
    state = { phase: "transcribing", abort };
    showStatus(ctx, "Transcribing…", rawKeyHint("escape", "to cancel"));
    const stoppedAt = performance.now();
    try {
      const samples = await finishRecording(recorder);
      const seconds = samples.length / SAMPLE_RATE;
      if (seconds < MIN_SECONDS) {
        ctx.ui.notify("Recording too short", "warning");
        clearStatus(ctx);
        return;
      }
      const text = await transcribe(samples, config, abort.signal);
      if (!text) {
        ctx.ui.notify(`No speech detected in ${seconds.toFixed(1)}s of audio`, "warning");
        clearStatus(ctx);
        return;
      }
      ctx.ui.pasteToEditor(text);
      showStatus(ctx, `Transcribed ${seconds.toFixed(1)}s of audio in ${((performance.now() - stoppedAt) / 1000).toFixed(1)}s`);
      summaryTimer = setTimeout(() => clearStatus(ctx), SUMMARY_MS);
    } catch (error) {
      clearStatus(ctx);
      if (abort.signal.aborted) ctx.ui.notify("Transcription cancelled", "info");
      else ctx.ui.notify(`Transcription failed: ${message(error)}`, "error");
    } finally {
      state = { phase: "idle" };
      unlisten();
    }
  }

  async function toggle(ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI) return;
    if (state.phase === "idle") await start(ctx);
    else if (state.phase === "recording") await stop(ctx);
  }

  pi.registerShortcut(shortcut as Parameters<ExtensionAPI["registerShortcut"]>[0], {
    description: "Toggle voice dictation",
    handler: toggle,
  });

  pi.registerCommand("voice", {
    description: "Start or stop voice dictation",
    handler: (_args, ctx) => toggle(ctx),
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    unlisten();
    if (summaryTimer) clearTimeout(summaryTimer);
    if (state.phase === "transcribing") state.abort.abort();
    if (state.phase === "recording") await finishRecording(state.recorder).catch(() => undefined);
    state = { phase: "idle" };
    clearStatus(ctx);
  });
}
