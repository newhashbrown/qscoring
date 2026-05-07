import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ScoreResult } from "@/lib/scoring";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * Returns natural-language commentary explaining the score.
 * Returns null when:
 *  - The Cloudflare AI binding is unavailable (e.g. plain `next dev` without wrangler)
 *  - The AI call fails for any reason
 *
 * Callers should treat null as "no commentary available" and skip rendering the section.
 */
export async function generateCommentary(score: ScoreResult): Promise<string | null> {
  let ai: Ai | undefined;
  try {
    const ctx = getCloudflareContext();
    ai = ctx?.env?.AI;
  } catch {
    // getCloudflareContext throws when not running inside the Worker — treat as unavailable.
  }
  if (!ai) return null;

  try {
    const result = (await ai.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(score) },
      ],
      max_tokens: 280,
      temperature: 0.3,
    })) as { response?: string } | string;

    const text = typeof result === "string" ? result : result?.response ?? "";
    const cleaned = text.trim();
    return cleaned.length > 0 ? cleaned : null;
  } catch (err) {
    console.error("Commentary generation failed:", err);
    return null;
  }
}
