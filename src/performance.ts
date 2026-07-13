export type PerformanceContext = Record<string, number | string | boolean>;

export type StatSummary = {
  count: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
};

export type PerformanceSummary = {
  enabled: boolean;
  frames: number;
  elapsedMs: number;
  fps: StatSummary;
  frameIntervalMs: StatSummary;
  frameCpuMs: StatSummary;
  spans: Record<string, StatSummary>;
  workload: {
    maxEnemies: number;
    maxProjectiles: number;
  };
};

type FrameSample = {
  atMs: number;
  intervalMs?: number;
  cpuMs: number;
  context: PerformanceContext;
};

export type PerformanceCapture = {
  summary: PerformanceSummary;
  samples: {
    frames: FrameSample[];
    spans: Record<string, number[]>;
  };
};

export type PerformanceRecorder = {
  readonly enabled: boolean;
  frame<T>(timestamp: number, context: PerformanceContext, run: () => T): T;
  span<T>(name: string, run: () => T): T;
  reset(): void;
  summary(): PerformanceSummary;
  exportData(): PerformanceCapture;
};

const MAX_SAMPLES = 7_200;
const enabled =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).get("perf") === "1";

class NoopPerformanceRecorder implements PerformanceRecorder {
  readonly enabled = false;

  frame<T>(_timestamp: number, _context: PerformanceContext, run: () => T) {
    return run();
  }

  span<T>(_name: string, run: () => T) {
    return run();
  }

  reset() {}

  summary(): PerformanceSummary {
    return emptySummary();
  }

  exportData(): PerformanceCapture {
    return { summary: this.summary(), samples: { frames: [], spans: {} } };
  }
}

class ActivePerformanceRecorder implements PerformanceRecorder {
  readonly enabled = true;
  private readonly frames: FrameSample[] = [];
  private readonly spans = new Map<string, number[]>();
  private startedAt = performance.now();
  private previousFrameTimestamp?: number;

  frame<T>(timestamp: number, context: PerformanceContext, run: () => T) {
    const intervalMs =
      this.previousFrameTimestamp === undefined
        ? undefined
        : timestamp - this.previousFrameTimestamp;
    this.previousFrameTimestamp = timestamp;
    const startedAt = performance.now();
    try {
      return run();
    } finally {
      this.frames.push({
        atMs: timestamp - this.startedAt,
        intervalMs,
        cpuMs: performance.now() - startedAt,
        context: { ...context },
      });
      if (this.frames.length > MAX_SAMPLES)
        this.frames.splice(0, this.frames.length - MAX_SAMPLES);
    }
  }

  span<T>(name: string, run: () => T) {
    const startedAt = performance.now();
    try {
      return run();
    } finally {
      const durations = this.spans.get(name) ?? [];
      durations.push(performance.now() - startedAt);
      if (durations.length > MAX_SAMPLES)
        durations.splice(0, durations.length - MAX_SAMPLES);
      this.spans.set(name, durations);
    }
  }

  reset() {
    this.frames.length = 0;
    this.spans.clear();
    this.startedAt = performance.now();
    this.previousFrameTimestamp = undefined;
  }

  summary(): PerformanceSummary {
    const intervals = this.frames.flatMap((frame) =>
      frame.intervalMs === undefined ? [] : [frame.intervalMs],
    );
    const spanSummaries: Record<string, StatSummary> = {};
    for (const [name, durations] of this.spans)
      spanSummaries[name] = summarize(durations);
    return {
      enabled: true,
      frames: this.frames.length,
      elapsedMs: round(performance.now() - this.startedAt),
      fps: summarize(intervals.map((interval) => 1_000 / interval)),
      frameIntervalMs: summarize(intervals),
      frameCpuMs: summarize(this.frames.map((frame) => frame.cpuMs)),
      spans: spanSummaries,
      workload: {
        maxEnemies: maxContextValue(this.frames, "enemies"),
        maxProjectiles: maxContextValue(this.frames, "projectiles"),
      },
    };
  }

  exportData(): PerformanceCapture {
    return {
      summary: this.summary(),
      samples: {
        frames: [...this.frames],
        spans: Object.fromEntries(
          [...this.spans].map(([name, values]) => [name, [...values]]),
        ),
      },
    };
  }
}

export const performanceRecorder: PerformanceRecorder = enabled
  ? new ActivePerformanceRecorder()
  : new NoopPerformanceRecorder();

export function summarize(values: readonly number[]): StatSummary {
  if (values.length === 0)
    return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: values.length,
    avg: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
  };
}

function percentile(sorted: readonly number[], percent: number) {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percent) - 1),
  );
  return sorted[index];
}

function maxContextValue(frames: readonly FrameSample[], name: string) {
  return frames.reduce((maximum, frame) => {
    const value = frame.context[name];
    return typeof value === "number" ? Math.max(maximum, value) : maximum;
  }, 0);
}

function emptySummary(): PerformanceSummary {
  const empty = summarize([]);
  return {
    enabled: false,
    frames: 0,
    elapsedMs: 0,
    fps: empty,
    frameIntervalMs: empty,
    frameCpuMs: empty,
    spans: {},
    workload: { maxEnemies: 0, maxProjectiles: 0 },
  };
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}
