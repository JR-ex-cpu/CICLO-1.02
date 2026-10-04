import type { ClickEngine } from "./engine";
import type { ArenaSim } from "./sim";
import type { Kind, Target } from "./types";

function cssVar(el: HTMLElement, name: string, fallback: string) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function ring(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  width = 1.5,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function diamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  fill: boolean,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  else ctx.stroke();
  ctx.restore();
}

function life(tg: Target, now: number) {
  const span = tg.expires - tg.born;
  return Math.max(0, Math.min(1, (tg.expires - now) / span));
}

export function drawArena(
  canvas: HTMLCanvasElement,
  sim: ArenaSim,
  engine: ClickEngine,
  now: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = canvas.width / canvas.clientWidth || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const bg = cssVar(canvas, "--color-surface", "#141518");
  const fg = cssVar(canvas, "--color-fg", "#ecece8");
  const muted = cssVar(canvas, "--color-muted", "#8a8c89");
  const accent = cssVar(canvas, "--color-accent", "#c5cdc8");
  const danger = cssVar(canvas, "--color-danger", "#c45c4a");
  const ok = cssVar(canvas, "--color-ok", "#7d9a7e");
  const scale = Math.min(w, h) / 360;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const rad = Math.min(w, h) * 0.46;

  ctx.save();
  ctx.strokeStyle = fg;
  ctx.globalAlpha = 0.08;
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (rad * i) / 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - rad, cy);
  ctx.lineTo(cx + rad, cy);
  ctx.moveTo(cx, cy - rad);
  ctx.lineTo(cx, cy + rad);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = fg;
  ctx.globalAlpha = 0.05;
  const cells = 8;
  for (let i = 1; i < cells; i++) {
    const x = (w * i) / cells;
    const y = (h * i) / cells;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  if (engine.period > 0) {
    const ang = -Math.PI / 2 + (engine.phase / engine.period) * Math.PI * 2;
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = engine.mode === "running" ? 0.35 : 0.14;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
    ctx.stroke();
    ctx.restore();

    for (const step of engine.steps) {
      const a = -Math.PI / 2 + (step.offsetMs / engine.period) * Math.PI * 2;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      ctx.save();
      ctx.fillStyle = step.kind === "trap" ? danger : accent;
      ctx.globalAlpha = 0.25 + Math.min(0.6, step.weight * 0.08);
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  for (const r of sim.ripples) {
    const age = (now - r.born) / 420;
    const rr = 10 * scale + age * 32 * scale;
    ring(ctx, r.nx * w, r.ny * h, rr, r.hit ? accent : muted, 1.4, 1 - age);
  }

  for (const tg of sim.targets) {
    const x = tg.nx * w;
    const y = tg.ny * h;
    const a = 0.45 + life(tg, now) * 0.55;
    drawTarget(ctx, tg.kind, x, y, a, fg, accent, danger, ok, scale);
  }

  const gx = engine.ghost.x * w;
  const gy = engine.ghost.y * h;
  if (engine.mode === "running") {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    const g = 11 * scale;
    ctx.beginPath();
    ctx.arc(gx, gy, g, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx - g * 1.6, gy);
    ctx.lineTo(gx - g * 0.5, gy);
    ctx.moveTo(gx + g * 0.5, gy);
    ctx.lineTo(gx + g * 1.6, gy);
    ctx.moveTo(gx, gy - g * 1.6);
    ctx.lineTo(gx, gy - g * 0.5);
    ctx.moveTo(gx, gy + g * 0.5);
    ctx.lineTo(gx, gy + g * 1.6);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTarget(
  ctx: CanvasRenderingContext2D,
  kind: Kind,
  x: number,
  y: number,
  alpha: number,
  fg: string,
  accent: string,
  danger: string,
  ok: string,
  scale: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const s = Math.max(0.85, scale);
  if (kind === "pulse") {
    ring(ctx, x, y, 16 * s, fg, 2, 1);
    ring(ctx, x, y, 8 * s, accent, 1.4, 0.85);
    ctx.fillStyle = accent;
    ctx.globalAlpha = alpha * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, 4 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "core") {
    ctx.fillStyle = fg;
    ctx.globalAlpha = alpha * 0.95;
    ctx.beginPath();
    ctx.arc(x, y, 13 * s, 0, Math.PI * 2);
    ctx.fill();
    ring(ctx, x, y, 19 * s, accent, 1.6, alpha);
  } else if (kind === "trap") {
    diamond(ctx, x, y, 15 * s, danger, false);
    ctx.strokeStyle = danger;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 7 * s, y - 7 * s);
    ctx.lineTo(x + 7 * s, y + 7 * s);
    ctx.moveTo(x + 7 * s, y - 7 * s);
    ctx.lineTo(x - 7 * s, y + 7 * s);
    ctx.stroke();
  } else {
    ring(ctx, x, y, 18 * s, ok, 1.8, 1);
    ring(ctx, x, y, 10 * s, fg, 1.4, 0.95);
  }
  ctx.restore();
}
