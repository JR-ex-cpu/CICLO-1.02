import type { Kind, Ripple, Scenario, Target } from "./types";

type Osc = {
  kind: Kind;
  period: number;
  phase: number;
  duration: number;
  pos: (cycle: number) => { x: number; y: number };
};

function clamp01(n: number) {
  return Math.max(0.08, Math.min(0.92, n));
}

function jitter(x: number, y: number, amt: number, seed: number) {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const b = Math.sin(seed * 78.233) * 23421.631;
  const jx = (a - Math.floor(a)) * 2 - 1;
  const jy = (b - Math.floor(b)) * 2 - 1;
  return { x: clamp01(x + jx * amt), y: clamp01(y + jy * amt) };
}

function oscillators(scenario: Scenario): Osc[] {
  if (scenario === "doble") {
    return [
      {
        kind: "pulse",
        period: 1600,
        phase: 0,
        duration: 620,
        pos: (c) => jitter(0.28, 0.32, 0.03, c + 1),
      },
      {
        kind: "pulse",
        period: 1600,
        phase: 800,
        duration: 620,
        pos: (c) => jitter(0.72, 0.34, 0.03, c + 11),
      },
      {
        kind: "core",
        period: 3200,
        phase: 2100,
        duration: 700,
        pos: (c) => jitter(0.5, 0.58, 0.02, c + 21),
      },
      {
        kind: "bonus",
        period: 6400,
        phase: 400,
        duration: 800,
        pos: (c) => jitter(0.5, 0.22, 0.04, c + 41),
      },
    ];
  }
  if (scenario === "caos") {
    return [
      {
        kind: "pulse",
        period: 2400,
        phase: 0,
        duration: 640,
        pos: (c) => jitter(0.22, 0.3, 0.035, c + 2),
      },
      {
        kind: "pulse",
        period: 2400,
        phase: 500,
        duration: 640,
        pos: (c) => jitter(0.78, 0.3, 0.035, c + 12),
      },
      {
        kind: "pulse",
        period: 2400,
        phase: 1000,
        duration: 640,
        pos: (c) => jitter(0.5, 0.74, 0.035, c + 22),
      },
      {
        kind: "core",
        period: 2400,
        phase: 1650,
        duration: 540,
        pos: (c) => jitter(0.5, 0.48, 0.02, c + 32),
      },
      {
        kind: "trap",
        period: 1900,
        phase: 280,
        duration: 700,
        pos: (c) => {
          const a = (c * 0.7) % (Math.PI * 2);
          return jitter(0.5 + Math.cos(a) * 0.34, 0.5 + Math.sin(a) * 0.28, 0.02, c + 7);
        },
      },
      {
        kind: "trap",
        period: 1900,
        phase: 1100,
        duration: 700,
        pos: (c) => {
          const a = (c * 0.7 + Math.PI) % (Math.PI * 2);
          return jitter(0.5 + Math.cos(a) * 0.34, 0.5 + Math.sin(a) * 0.28, 0.02, c + 17);
        },
      },
    ];
  }
  return [
    {
      kind: "pulse",
      period: 2400,
      phase: 0,
      duration: 680,
      pos: (c) => jitter(0.24, 0.32, 0.028, c + 3),
    },
    {
      kind: "pulse",
      period: 2400,
      phase: 480,
      duration: 680,
      pos: (c) => jitter(0.76, 0.32, 0.028, c + 13),
    },
    {
      kind: "pulse",
      period: 2400,
      phase: 960,
      duration: 680,
      pos: (c) => jitter(0.5, 0.72, 0.028, c + 23),
    },
    {
      kind: "core",
      period: 2400,
      phase: 1620,
      duration: 560,
      pos: (c) => jitter(0.5, 0.48, 0.018, c + 33),
    },
  ];
}

const VALUE: Record<Kind, number> = {
  pulse: 4,
  core: 12,
  trap: -8,
  bonus: 20,
};

export class ArenaSim {
  targets: Target[] = [];
  ripples: Ripple[] = [];
  energy = 0;
  hits = 0;
  misses = 0;
  clicks = 0;
  spawned: { t: number; kind: Kind; nx: number; ny: number }[] = [];
  private nextId = 1;
  private lastCycle = new Map<string, number>();
  private osc: Osc[] = oscillators("ola");
  private origin = 0;
  scenario: Scenario = "ola";

  reset(scenario: Scenario, now: number) {
    this.scenario = scenario;
    this.osc = oscillators(scenario);
    this.targets = [];
    this.ripples = [];
    this.spawned = [];
    this.lastCycle.clear();
    this.origin = now;
    this.nextId = 1;
  }

  resetScore() {
    this.energy = 0;
    this.hits = 0;
    this.misses = 0;
    this.clicks = 0;
  }

  update(now: number) {
    const t = now - this.origin;
    const fresh: typeof this.spawned = [];

    for (let i = 0; i < this.osc.length; i++) {
      const o = this.osc[i]!;
      const shifted = t - o.phase;
      if (shifted < 0) continue;
      const cycle = Math.floor(shifted / o.period);
      const key = `${i}:${cycle}`;
      if (this.lastCycle.get(key)) continue;
      const into = shifted - cycle * o.period;
      if (into > o.duration) continue;
      this.lastCycle.set(key, 1);
      const p = o.pos(cycle);
      const target: Target = {
        id: this.nextId++,
        kind: o.kind,
        nx: p.x,
        ny: p.y,
        born: now,
        expires: now + o.duration,
      };
      this.targets.push(target);
      const ev = { t: now, kind: o.kind, nx: p.x, ny: p.y };
      this.spawned.push(ev);
      fresh.push(ev);
    }

    this.targets = this.targets.filter((tg) => tg.expires > now);
    this.ripples = this.ripples.filter((r) => now - r.born < 420);
    if (this.spawned.length > 360) this.spawned.splice(0, this.spawned.length - 280);
    if (this.lastCycle.size > 800) this.lastCycle.clear();
    return fresh;
  }

  tryClick(nx: number, ny: number, now: number, radius = 0.1) {
    this.clicks += 1;
    let best: Target | null = null;
    let bestD = radius;
    for (const tg of this.targets) {
      const d = Math.hypot(tg.nx - nx, tg.ny - ny);
      if (d < bestD) {
        bestD = d;
        best = tg;
      }
    }
    this.ripples.push({ nx, ny, born: now, hit: Boolean(best) });
    if (!best) {
      this.misses += 1;
      return null;
    }
    this.targets = this.targets.filter((t) => t.id !== best.id);
    this.hits += 1;
    this.energy += VALUE[best.kind];
    return best;
  }
}
