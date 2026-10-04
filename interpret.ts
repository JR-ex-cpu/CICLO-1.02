import { createServerFn } from "@tanstack/react-start";
import type { Kind, Policy } from "./types";

const KINDS: Kind[] = ["pulse", "core", "trap", "bonus"];

function asKinds(value: unknown): Kind[] {
  if (!Array.isArray(value)) return [];
  return value.filter((k): k is Kind => KINDS.includes(k as Kind));
}

export const interpretPrompt = createServerFn({ method: "POST" })
  .validator((input: { prompt: string; policy: Policy }) => input)
  .handler(async ({ data }): Promise<{ ok: true; policy: Policy } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "AI is not available" };
    }

    const prompt = data.prompt.slice(0, 400);
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 280,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              'Eres el intérprete de un auto-clicker. Devuelve SOLO JSON: {"prefer":[],"avoid":[],"speed":number,"delayMs":number,"note":"frase corta en español"}. Kinds válidos: pulse, core, trap, bonus. speed 0.4–2.5 (1 = igual). delayMs 0–800. Arrays vacíos = sin filtro. No inventes kinds. Si pide reset, arrays vacíos y speed 1 delayMs 0.',
          },
          {
            role: "user",
            content: `Política actual: ${JSON.stringify(data.policy)}\nInstrucción: ${prompt}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `xAI API error ${res.status}` };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: "Respuesta ilegible" };

    try {
      const parsed = JSON.parse(match[0]) as Partial<Policy>;
      const speed = Number(parsed.speed);
      const delayMs = Number(parsed.delayMs);
      return {
        ok: true,
        policy: {
          prefer: asKinds(parsed.prefer),
          avoid: asKinds(parsed.avoid),
          speed: Number.isFinite(speed) ? Math.max(0.4, Math.min(2.5, speed)) : data.policy.speed,
          delayMs: Number.isFinite(delayMs) ? Math.max(0, Math.min(800, delayMs)) : data.policy.delayMs,
          note: typeof parsed.note === "string" ? parsed.note.slice(0, 140) : "Política actualizada.",
        },
      };
    } catch {
      return { ok: false, error: "JSON inválido" };
    }
  });
