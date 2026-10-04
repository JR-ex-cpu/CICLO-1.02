let ctx: AudioContext | null = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function resumeAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

export function tickSound(hit: boolean) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = hit ? 740 : 196;
  gain.gain.value = hit ? 0.035 : 0.02;
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.07);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.08);
}
