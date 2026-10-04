import type { CycleStep, Kind, SimEvent } from "./types";

const MIN_PERIOD = 700;
const MAX_PERIOD = 8000;
const BIN = 50;

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function detectPeriod(timestamps: number[]): {
  period: number;
  confidence: number;
} | null {
  if (timestamps.length < 4) return null;

  const counts = new Map<number, number>();
  const bump = (delta: number, w: number) => {
    if (delta < MIN_PERIOD || delta > MAX_PERIOD) return;
    const b = Math.round(delta / BIN) * BIN;
    counts.set(b, (counts.get(b) ?? 0) + w);
  };

  for (let i = 1; i < timestamps.length; i++) {
    bump(timestamps[i]! - timestamps[i - 1]!, 1);
  }
  const cap = Math.min(timestamps.length, 48);
  for (let i = 0; i < cap; i++) {
    for (let j = i + 1; j < cap; j++) {
      bump(timestamps[j]! - timestamps[i]!, 0.35);
    }
  }

  let best = 0;
  let bestScore = 0;
  for (const [p, c] of counts) {
    const score =
      c + (counts.get(p - BIN) ?? 0) * 0.45 + (counts.get(p + BIN) ?? 0) * 0.45;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (!best) return null;

  const confidence = clamp01(bestScore / Math.max(6, timestamps.length * 0.85));
  return { period: best, confidence };
}

export function buildSteps(
  events: SimEvent[],
  period: number,
  origin: number,
): CycleStep[] {
  const clusters: CycleStep[] = [];

  for (const e of events) {
    const phase = ((e.t - origin) % period + period) % period;
    let merged = false;
    for (const c of clusters) {
      if (c.kind !== e.kind) continue;
      const dPhase = Math.min(
        Math.abs(c.offsetMs - phase),
        period - Math.abs(c.offsetMs - phase),
      );
      const dPos = Math.hypot(c.nx - e.nx, c.ny - e.ny);
      if (dPhase < 200 && dPos < 0.14) {
        const w = c.weight + 1;
        c.offsetMs = (c.offsetMs * c.weight + phase) / w;
        c.nx = (c.nx * c.weight + e.nx) / w;
        c.ny = (c.ny * c.weight + e.ny) / w;
        c.weight = w;
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({
        id: `${e.kind}-${clusters.length}`,
        offsetMs: phase,
        kind: e.kind,
        nx: e.nx,
        ny: e.ny,
        radius: 0.09,
        weight: 1,
      });
    }
  }

  const minW = events.length >= 10 ? 2 : 1;
  return clusters
    .filter((c) => c.weight >= minW)
    .sort((a, b) => a.offsetMs - b.offsetMs)
    .map((c, i) => ({ ...c, id: `${c.kind}-${i}` }));
}

export function learnFromEvents(events: SimEvent[]): {
  period: number;
  confidence: number;
  origin: number;
  steps: CycleStep[];
} | null {
  if (events.length < 4) return null;
  const byKind = new Map<Kind, number[]>();
  for (const e of events) {
    const list = byKind.get(e.kind) ?? [];
    list.push(e.t);
    byKind.set(e.kind, list);
  }

  let best:
    | { period: number; confidence: number; kind: Kind }
    | null = null;
  for (const [kind, ts] of byKind) {
    const found = detectPeriod(ts);
    if (!found) continue;
    if (!best || found.confidence > best.confidence) {
      best = { ...found, kind };
    }
  }
  const fallback = detectPeriod(events.map((e) => e.t));
  const period = best?.period ?? fallback?.period;
  if (!period) return null;

  const origin = events[0]!.t;
  const steps = buildSteps(events, period, origin);
  if (!steps.length) return null;

  const conf = clamp01(
    (best?.confidence ?? fallback?.confidence ?? 0.3) *
      Math.min(1, steps.length / 3),
  );
  return { period, confidence: conf, origin, steps };
}
