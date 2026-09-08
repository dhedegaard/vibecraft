/** Samples kept in the graph (one per `SAMPLE_INTERVAL`). */
const HISTORY = 60;
const SAMPLE_INTERVAL_MS = 250;

/**
 * Measures how much of the main thread's frame budget goes unused and draws it
 * as a sparkline. Only JavaScript time is visible from here; GPU work is not.
 */
export class CpuGraph {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly label: HTMLElement;
  private readonly history: number[] = [];
  private frameStart = 0;
  private busyMs = 0;
  private windowStart = performance.now();

  constructor(canvas: HTMLCanvasElement, label: HTMLElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unsupported');
    this.ctx = ctx;
    this.label = label;
    this.draw();
  }

  /** Call at the top of every tick, before any simulation work. */
  begin(): void {
    this.frameStart = performance.now();
  }

  /** Call once the tick's work (including rendering) is done. */
  end(): void {
    const now = performance.now();
    this.busyMs += now - this.frameStart;
    const elapsed = now - this.windowStart;
    if (elapsed < SAMPLE_INTERVAL_MS) return;

    const idle = Math.max(0, Math.min(1, 1 - this.busyMs / elapsed));
    this.history.push(idle);
    if (this.history.length > HISTORY) this.history.shift();
    this.busyMs = 0;
    this.windowStart = now;
    this.label.textContent = `idle ${Math.round(idle * 100)}%`;
    this.draw();
  }

  private draw(): void {
    const { ctx } = this;
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);

    const step = width / (HISTORY - 1);
    const offset = HISTORY - this.history.length;
    ctx.beginPath();
    ctx.moveTo(offset * step, height);
    this.history.forEach((idle, i) => ctx.lineTo((offset + i) * step, height - idle * (height - 1)));
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(120, 220, 140, 0.35)';
    ctx.fill();

    ctx.beginPath();
    this.history.forEach((idle, i) => {
      const x = (offset + i) * step;
      const y = height - idle * (height - 1);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#7ddc8c';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
