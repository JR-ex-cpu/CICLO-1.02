import { learnFromEvents } from "./detect";
import { allowedKind } from "./policy";
import type {
  CycleStep,
  EngineMode,
  Kind,
  LogLine,
  Policy,
  SimEvent,
  Target,
} from "./types";

type Goal = {
  step: CycleStep;
  cycle: number;
  nx: number;
  ny: number;
};

export class ClickEngine {
  mode: EngineMode = "idle";
  events: SimEvent[] = [];
  steps: CycleStep[] = [];
  period = 0;
  origin = 0;
  confidence = 0;
  ghost = { x: 0.5, y: 0.5 };
  phase = 0;
  observeUntil = 0;
  observeTotal = 8000;
  autoRun = false;
  log: LogLine[] = [];
  private fired = new Set<string>();
  private goal: Goal | null = null;
  private reduceMotion = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    }
  }

  private pushLog(text: string, t = performance.now()) {
    this.log.unshift({ t, text });
    if (this.log.length > 14) this.log.length = 14;
  }

  noteSpawn(t: number, kind: Kind, nx: number, ny: number) {
    if (this.mode !== "observing" && this.mode !== "recording") return;
    this.events.push({ t, kind, nx, ny, source: "spawn" });
    if (this.events.length > 420) this.events.splice(0, this.events.length - 320);
  }

  noteUserClick(t: number, kind: Kind | null, nx: number, ny: number) {
    if (this.mode !== "recording" && this.mode !== "observing") return;
    if (!kind) return;
    this.events.push({ t, kind, nx, ny, source: "click" });
    this.pushLog(`mano ${kind}`, t);
  }

  startObserve(now: number, ms = 8000, thenRun = false) {
    this.mode = "observing";
    this.autoRun = thenRun;
    this.observeTotal = ms;
    this.observeUntil = now + ms;
    this.events = [];
    this.goal = null;
    this.fired.clear();
    this.pushLog("observando pantalla", now);
  }

  startRecord(now: number) {
    this.mode = "recording";
    this.autoRun = false;
    this.events = [];
    this.goal = null;
    this.fired.clear();
    this.pushLog("grabando clics", now);
  }

  stopRecord(now: number) {
    this.learn(now);
  }

  learn(now: number) {
    const result = learnFromEvents(this.events);
    if (!result) {
      this.mode = "idle";
      this.steps = [];
      this.period = 0;
      this.confidence = 0;
      this.autoRun = false;
      this.pushLog("poca señal — observa más", now);
      return false;
    }
    this.period = result.period;
    this.confidence = result.confidence;
    this.origin = result.origin;
    this.steps = result.steps;
    this.goal = null;
    this.fired.clear();
    this.pushLog(
      `ciclo ${result.period} ms · ${result.steps.length} pasos · ${(result.confidence * 100).toFixed(0)}%`,
      now,
    );
    if (this.autoRun) {
      this.autoRun = false;
      this.startRun(now);
      return true;
    }
    this.mode = "ready";
    return true;
  }

  startRun(now: number) {
    if (!this.period || !this.steps.length) return;
    this.mode = "running";
    this.origin = now - (this.phase || 0);
    this.goal = null;
    this.fired.clear();
    this.pushLog("ejecutando ciclo", now);
  }

  stop(now: number) {
    this.mode = this.steps.length ? "ready" : "idle";
    this.goal = null;
    this.autoRun = false;
    this.pushLog("detenido", now);
  }

  observeProgress(now: number) {
    if (this.mode !== "observing") return 0;
    const left = this.observeUntil - now;
    return Math.max(0, Math.min(1, 1 - left / this.observeTotal));
  }

  tick(
    now: number,
    dt: number,
    targets: Target[],
    policy: Policy,
    userSpeed: number,
  ): { nx: number; ny: number } | null {
    if (this.mode === "observing" && now >= this.observeUntil) {
      this.learn(now);
    }

    if (!this.period) {
      this.phase = 0;
      return null;
    }

    const elapsed = now - this.origin;
    this.phase = ((elapsed % this.period) + this.period) % this.period;
    if (this.mode !== "running") return null;

    const speed = Math.max(0.4, Math.min(2.6, userSpeed * policy.speed));
    this.pickGoal(elapsed, targets, policy);

    if (!this.goal) return null;

    const gx = this.goal.nx;
    const gy = this.goal.ny;
    if (this.reduceMotion) {
      this.ghost.x = gx;
      this.ghost.y = gy;
    } else {
      const k = 1 - Math.exp(-dt * 0.014 * speed);
      this.ghost.x += (gx - this.ghost.x) * k;
      this.ghost.y += (gy - this.ghost.y) * k;
    }

    const dist = Math.hypot(this.ghost.x - gx, this.ghost.y - gy);
    const ready = dist < (this.reduceMotion ? 0.2 : 0.022);
    if (!ready) return null;

    const key = `${this.goal.cycle}:${this.goal.step.id}`;
    this.fired.add(key);
    const click = { nx: this.ghost.x, ny: this.ghost.y };
    this.goal = null;
    return click;
  }

  private pickGoal(elapsed: number, targets: Target[], policy: Policy) {
    if (this.goal) {
      const key = `${this.goal.cycle}:${this.goal.step.id}`;
      if (this.fired.has(key)) this.goal = null;
    }
    if (this.goal) return;

    const cycle = Math.floor(elapsed / this.period);
    const phase = this.phase;
    const windowMs = 180 + policy.delayMs;
    const ranked = [...this.steps].sort((a, b) => {
      const da = (a.offsetMs - phase + this.period) % this.period;
      const db = (b.offsetMs - phase + this.period) % this.period;
      return da - db;
    });

    for (const step of ranked) {
      if (!allowedKind(step.kind, policy)) continue;
      const delta = (step.offsetMs - phase + this.period) % this.period;
      const overdue = (phase - step.offsetMs + this.period) % this.period;
      const due = delta < windowMs || overdue < 90;
      if (!due) continue;
      const key = `${cycle}:${step.id}`;
      if (this.fired.has(key)) continue;

      const live = nearest(targets, step, policy);
      this.goal = {
        step,
        cycle,
        nx: live?.nx ?? step.nx,
        ny: live?.ny ?? step.ny,
      };
      return;
    }
  }

  adapt(hit: Target | null, now: number) {
    if (!hit) {
      this.pushLog("fallo", now);
      return;
    }
    this.pushLog(`acierto ${hit.kind}`, now);
    const close = this.steps.find(
      (s) => s.kind === hit.kind && Math.hypot(s.nx - hit.nx, s.ny - hit.ny) < 0.14,
    );
    if (close) close.weight += 0.15;
  }
}

function nearest(targets: Target[], step: CycleStep, policy: Policy) {
  let best: Target | null = null;
  let bestD = step.radius + 0.04;
  for (const tg of targets) {
    if (tg.kind !== step.kind) continue;
    if (!allowedKind(tg.kind, policy)) continue;
    const d = Math.hypot(tg.nx - step.nx, tg.ny - step.ny);
    if (d < bestD) {
      bestD = d;
      best = tg;
    }
  }
  return best;
}
