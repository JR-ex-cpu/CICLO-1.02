import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ArenaSim } from "./sim";
import { ClickEngine } from "./engine";
import { parsePolicyLocal } from "./policy";
import { resumeAudio, tickSound } from "./audio";
import { interpretPrompt } from "./interpret";
import {
  DEFAULT_POLICY,
  type EngineMode,
  type LogLine,
  type Policy,
  type Scenario,
} from "./types";

export const sim = new ArenaSim();
export const engine = new ClickEngine();

type Frame = {
  energy: number;
  hits: number;
  misses: number;
  clicks: number;
  mode: EngineMode;
  period: number;
  confidence: number;
  phase: number;
  observeProgress: number;
  log: LogLine[];
  steps: number;
  ghost: { x: number; y: number };
};

type CicloState = Frame & {
  scenario: Scenario;
  speed: number;
  policy: Policy;
  prompt: string;
  promptPending: boolean;
  briefing: boolean;
  best: number;
  setPrompt: (v: string) => void;
  setScenario: (s: Scenario) => void;
  setSpeed: (n: number) => void;
  dismissBriefing: () => void;
  observe: () => void;
  record: () => void;
  stopRecord: () => void;
  run: () => void;
  halt: () => void;
  applyPrompt: () => Promise<void>;
  applyChip: (text: string) => void;
  syncFrame: (f: Frame) => void;
  registerClick: (nx: number, ny: number, now: number) => void;
};

const emptyFrame: Frame = {
  energy: 0,
  hits: 0,
  misses: 0,
  clicks: 0,
  mode: "idle",
  period: 0,
  confidence: 0,
  phase: 0,
  observeProgress: 0,
  log: [],
  steps: 0,
  ghost: { x: 0.5, y: 0.5 },
};

export const useCiclo = create<CicloState>()(
  persist(
    (set, get) => ({
      ...emptyFrame,
      scenario: "ola",
      speed: 1,
      policy: DEFAULT_POLICY,
      prompt: "",
      promptPending: false,
      briefing: true,
      best: 0,
      setPrompt: (v) => set({ prompt: v }),
      setScenario: (s) => {
        sim.reset(s, performance.now());
        sim.resetScore();
        engine.mode = "idle";
        engine.steps = [];
        engine.period = 0;
        engine.confidence = 0;
        engine.events = [];
        engine.autoRun = false;
        set({ ...emptyFrame, scenario: s });
      },
      setSpeed: (n) => set({ speed: n }),
      dismissBriefing: () => set({ briefing: false }),
      observe: () => {
        resumeAudio();
        engine.startObserve(performance.now(), 8000, false);
        set({ mode: "observing", observeProgress: 0 });
      },
      record: () => {
        resumeAudio();
        engine.startRecord(performance.now());
        set({ mode: "recording" });
      },
      stopRecord: () => {
        engine.stopRecord(performance.now());
        set({
          mode: engine.mode,
          period: engine.period,
          confidence: engine.confidence,
          steps: engine.steps.length,
          log: [...engine.log],
        });
      },
      run: () => {
        resumeAudio();
        if (!engine.period) {
          engine.startObserve(performance.now(), 8000, true);
          set({ mode: "observing", observeProgress: 0 });
          return;
        }
        engine.startRun(performance.now());
        set({ mode: "running" });
      },
      halt: () => {
        engine.stop(performance.now());
        set({ mode: engine.mode, log: [...engine.log] });
      },
      applyChip: (text) => {
        set({ prompt: text });
        void get().applyPrompt();
      },
      applyPrompt: async () => {
        const raw = get().prompt.trim();
        if (!raw || get().promptPending) return;
        const local = parsePolicyLocal(raw, get().policy);
        const speed = Math.max(0.4, Math.min(2.5, local.speed));
        set({
          policy: local,
          speed,
          promptPending: true,
          prompt: "",
        });
        try {
          const remote = await interpretPrompt({
            data: { prompt: raw, policy: local },
          });
          if (remote.ok) {
            const next = remote.policy;
            set({
              policy: next,
              speed: Math.max(0.4, Math.min(2.5, next.speed)),
              promptPending: false,
            });
            return;
          }
        } catch {
          /* local policy already applied */
        }
        set({ promptPending: false });
      },
      syncFrame: (f) => {
        const best = Math.max(get().best, f.energy);
        set({ ...f, best });
      },
      registerClick: (nx, ny, now) => {
        resumeAudio();
        const hit = sim.tryClick(nx, ny, now);
        tickSound(Boolean(hit));
        engine.noteUserClick(now, hit?.kind ?? null, nx, ny);
      },
    }),
    {
      name: "ciclo-v1",
      partialize: (s) => ({
        scenario: s.scenario,
        speed: s.speed,
        policy: s.policy,
        briefing: s.briefing,
        best: s.best,
      }),
    },
  ),
);
