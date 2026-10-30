// Recording meter adapted from @earendil-works/pi-voice (MIT). See LICENSE.
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SAMPLE_RATE } from "./gemini.ts";

export const WIDGET_KEY = "pi-voice-meter";
const METER_UPDATE_MS = 50;
const LEVEL_GAIN = 36;
const DECAY = 0.65;
const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;
const BAND_EDGES_HZ = [80, 160, 250, 400, 650, 1000, 1600, 2500, 4000, 6000] as const;

function radix2Fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let index = 1, reversed = 0; index < n; index += 1) {
    let bit = n >> 1;
    while ((reversed & bit) !== 0) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      [re[index], re[reversed]] = [re[reversed]!, re[index]!];
      [im[index], im[reversed]] = [im[reversed]!, im[index]!];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepRe = Math.cos(angle);
    const stepIm = Math.sin(angle);
    const half = length >> 1;
    for (let start = 0; start < n; start += length) {
      let twiddleRe = 1;
      let twiddleIm = 0;
      for (let offset = 0; offset < half; offset += 1) {
        const even = start + offset;
        const odd = even + half;
        const oddRe = re[odd]! * twiddleRe - im[odd]! * twiddleIm;
        const oddIm = re[odd]! * twiddleIm + im[odd]! * twiddleRe;
        const evenRe = re[even]!;
        const evenIm = im[even]!;
        re[even] = evenRe + oddRe;
        im[even] = evenIm + oddIm;
        re[odd] = evenRe - oddRe;
        im[odd] = evenIm - oddIm;
        const nextRe = twiddleRe * stepRe - twiddleIm * stepIm;
        twiddleIm = twiddleRe * stepIm + twiddleIm * stepRe;
        twiddleRe = nextRe;
      }
    }
  }
}

function bandEnergies(samples: Float32Array, re: Float64Array, im: Float64Array): number[] {
  const n = re.length;
  re.fill(0);
  im.fill(0);
  for (let index = 0; index < n; index += 1) {
    re[index] = (samples[index] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (n - 1)));
  }
  radix2Fft(re, im);
  const bands: number[] = [];
  for (let band = 0; band < BAND_EDGES_HZ.length - 1; band += 1) {
    const start = Math.max(1, Math.floor((BAND_EDGES_HZ[band]! * n) / SAMPLE_RATE));
    const end = Math.min(n / 2, Math.ceil((BAND_EDGES_HZ[band + 1]! * n) / SAMPLE_RATE));
    let peak = 0;
    for (let bin = start; bin < end; bin += 1) peak = Math.max(peak, Math.hypot(re[bin]!, im[bin]!));
    bands.push(peak / n);
  }
  return bands;
}

function blockForLevel(level: number): string {
  const normalized = Math.min(1, Math.max(0, level) * LEVEL_GAIN);
  return BLOCKS[Math.round(Math.sqrt(normalized) * (BLOCKS.length - 1))] ?? "▁";
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
}

export function showStatus(ctx: ExtensionContext, text: string, hint?: string): void {
  if (!ctx.hasUI) return;
  const theme = ctx.ui.theme;
  ctx.ui.setWidget(WIDGET_KEY, [`${theme.fg("muted", text)}${hint ? `  ${hint}` : ""}`]);
}

export function clearStatus(ctx: ExtensionContext): void {
  if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
}

/** Left-to-right FFT meter shown above the editor while recording. */
export class RecordingMeter {
  private readonly bands = Array.from({ length: BAND_EDGES_HZ.length - 1 }, () => 0);
  private re = new Float64Array(0);
  private im = new Float64Array(0);
  private startedAt = Date.now();
  private nextPaintAt = 0;
  private lastLine: string | undefined;

  constructor(private readonly ctx: ExtensionContext, private readonly hints: string) {
    this.paint();
  }

  push(samples: Float32Array): void {
    if (samples.length < 2) return;
    const n = 2 ** Math.floor(Math.log2(samples.length));
    if (this.re.length !== n) {
      this.re = new Float64Array(n);
      this.im = new Float64Array(n);
    }
    const energies = bandEnergies(samples, this.re, this.im);
    for (let i = 0; i < this.bands.length; i += 1) {
      this.bands[i] = Math.max(energies[i] ?? 0, this.bands[i]! * DECAY);
    }
    const now = Date.now();
    if (now < this.nextPaintAt) return;
    this.nextPaintAt = now + METER_UPDATE_MS;
    this.paint();
  }

  private paint(): void {
    if (!this.ctx.hasUI) return;
    const theme = this.ctx.ui.theme;
    const line = [
      theme.fg("accent", this.bands.map(blockForLevel).join("")),
      theme.fg("muted", formatElapsed(Date.now() - this.startedAt)),
      this.hints,
    ].join("  ");
    if (line === this.lastLine) return;
    this.lastLine = line;
    this.ctx.ui.setWidget(WIDGET_KEY, [line]);
  }
}
