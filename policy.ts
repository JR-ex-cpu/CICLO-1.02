import { DEFAULT_POLICY, type Kind, type Policy } from "./types";

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

const KIND_WORDS: Record<Kind, string[]> = {
  pulse: ["pulso", "pulsos", "orbe", "orbes", "nodo", "nodos", "anillo", "anillos"],
  core: ["nucleo", "nucleos", "core", "centro", "central", "lleno"],
  trap: ["trampa", "trampas", "cebo", "cebos", "peligro", "x", "rombo"],
  bonus: ["bonus", "extra", "raro", "rara", "doble anillo"],
};

function kindsMentioned(text: string): Kind[] {
  const found: Kind[] = [];
  for (const kind of Object.keys(KIND_WORDS) as Kind[]) {
    if (KIND_WORDS[kind].some((w) => text.includes(w))) found.push(kind);
  }
  return found;
}

export function parsePolicyLocal(raw: string, prev: Policy): Policy {
  const text = fold(raw);
  if (!text) return prev;

  if (/\b(reset|reinicia|normal|todo|limpiar politica|default)\b/.test(text)) {
    return { ...DEFAULT_POLICY, note: "Política restablecida." };
  }

  const next: Policy = {
    prefer: [...prev.prefer],
    avoid: [...prev.avoid],
    speed: prev.speed,
    delayMs: prev.delayMs,
    note: "",
  };

  const mentioned = kindsMentioned(text);

  if (
    /\b(ignora|ignorar|evita|evitar|no toques|sin|no click|no clic)\b/.test(text) &&
    mentioned.length
  ) {
    for (const k of mentioned) {
      if (!next.avoid.includes(k)) next.avoid.push(k);
      next.prefer = next.prefer.filter((p) => p !== k);
    }
  } else if (
    /\b(solo|solamente|prioriza|prioridad|enfocate|enfoca|clickea|clica|clic en)\b/.test(
      text,
    ) &&
    mentioned.length
  ) {
    next.prefer = mentioned;
    next.avoid = next.avoid.filter((k) => !mentioned.includes(k));
  }

  if (/\b(mas rapido|rapido|aceler|x2|speed up|deprisa)\b/.test(text)) {
    next.speed = Math.min(2.4, +(next.speed * 1.35).toFixed(2));
  } else if (/\b(mas lento|lento|despacio|calma|slow)\b/.test(text)) {
    next.speed = Math.max(0.45, +(next.speed * 0.72).toFixed(2));
  } else if (/\bvelocidad\s*(\d+(?:[.,]\d+)?)/.test(text)) {
    const m = text.match(/\bvelocidad\s*(\d+(?:[.,]\d+)?)/);
    if (m) next.speed = Math.max(0.4, Math.min(2.5, Number(m[1]!.replace(",", "."))));
  }

  if (/\b(espera|pausa|delay|despues)\b/.test(text)) {
    const ms = text.match(/(\d+)\s*(ms|milis|s|seg)/);
    if (ms) {
      const n = Number(ms[1]);
      next.delayMs = ms[2] === "s" || ms[2] === "seg" ? n * 1000 : n;
      next.delayMs = Math.max(0, Math.min(800, next.delayMs));
    } else {
      next.delayMs = Math.min(800, next.delayMs + 120);
    }
  }

  if (/\bsin espera\b/.test(text)) next.delayMs = 0;

  const bits: string[] = [];
  if (next.prefer.length) bits.push(`prioriza ${next.prefer.join(", ")}`);
  if (next.avoid.length) bits.push(`evita ${next.avoid.join(", ")}`);
  if (next.speed !== 1) bits.push(`vel ${next.speed.toFixed(2)}×`);
  if (next.delayMs) bits.push(`espera ${next.delayMs} ms`);
  next.note = bits.length ? `Listo: ${bits.join(" · ")}.` : "Prompt recibido.";
  return next;
}

export function allowedKind(kind: Kind, policy: Policy) {
  if (policy.avoid.includes(kind)) return false;
  if (policy.prefer.length && !policy.prefer.includes(kind)) return false;
  return true;
}

export function mergePolicies(local: Policy, remote: Partial<Policy> | null): Policy {
  if (!remote) return local;
  return {
    prefer: remote.prefer ?? local.prefer,
    avoid: remote.avoid ?? local.avoid,
    speed: remote.speed ?? local.speed,
    delayMs: remote.delayMs ?? local.delayMs,
    note: remote.note || local.note,
  };
}
