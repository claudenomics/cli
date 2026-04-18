import chalk from 'chalk';
import { colors } from '@claudenomics/logger';

export const SHIMMER_FRAMES = 16;
export const SHIMMER_DURATION_MS = 800;

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;
const SPINNER_INDENT = '   ';

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private label = '';
  private animated = false;
  private frameIdx = 0;

  start(label: string): void {
    this.label = label;
    if (!shouldAnimate()) {
      process.stdout.write(`${SPINNER_INDENT}${label}\n`);
      return;
    }
    this.animated = true;
    this.draw();
    this.timer = setInterval(() => this.draw(), SPINNER_INTERVAL_MS);
  }

  update(label: string): void {
    if (this.label === label) return;
    if (!this.animated) {
      process.stdout.write(`${SPINNER_INDENT}${label}\n`);
      this.label = label;
      return;
    }
    this.label = label;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.animated) {
      process.stdout.write('\r\x1b[2K');
      this.animated = false;
    }
  }

  private draw(): void {
    const frame = SPINNER_FRAMES[this.frameIdx++ % SPINNER_FRAMES.length]!;
    process.stdout.write(`\r\x1b[2K${SPINNER_INDENT}${colors.accent(frame)} ${colors.muted(this.label)}`);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shouldAnimate(): boolean {
  if (!process.stdout.isTTY) return false;
  if (chalk.level === 0) return false;
  return true;
}

export function shimmerFrame(text: string, frame: number, totalFrames: number): string {
  // Wave enters from -3 (off-screen left), exits at length+3.
  // Text fills with bright accent as the wave passes (left of wave = settled bright,
  // right of wave = still dim, at wave = bold-white shimmer with halo).
  const span = text.length + 6;
  const wavePos = ((frame - 1) / Math.max(1, totalFrames - 1)) * span - 3;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const dist = i - wavePos;
    if (dist >= -0.5 && dist < 0.5) out += chalk.bold(chalk.white(text[i]!));
    else if (Math.abs(dist) < 1.5) out += chalk.bold(colors.accent(text[i]!));
    else if (i < wavePos) out += colors.accent(text[i]!);
    else out += colors.accentDim(text[i]!);
  }
  return out;
}
