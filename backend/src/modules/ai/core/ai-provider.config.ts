import { AnthropicAiProvider } from "./anthropic-ai-provider";
import { TemplateAiProvider, type AiProviderPort } from "./ai-provider.port";

export const DEFAULT_AI_MODEL = "claude-opus-5";

/**
 * Provider selection. The deterministic template provider is the default so that no model is
 * called unless an operator explicitly configures one; the template also serves as the fallback.
 */
export function resolveAiProvider(env: Record<string, string | undefined> = process.env): { primary: AiProviderPort; fallback: AiProviderPort } {
  const fallback = new TemplateAiProvider();
  const mode = env.ASSURMATCH_AI_PROVIDER ?? "template";
  if (mode === "template") return { primary: fallback, fallback };
  if (mode === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("ASSURMATCH_AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
    return {
      primary: new AnthropicAiProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ASSURMATCH_AI_MODEL ?? DEFAULT_AI_MODEL,
        fallbacks: env.ASSURMATCH_AI_FALLBACKS !== "false",
        timeoutMs: Number(env.ASSURMATCH_AI_TIMEOUT_MS ?? "60000")
      }),
      fallback
    };
  }
  throw new Error(`Unknown ASSURMATCH_AI_PROVIDER mode: ${mode}`);
}

export function validateAiEnvironment(env: Record<string, string | undefined> = process.env): void {
  const mode = env.ASSURMATCH_AI_PROVIDER;
  if (mode && !["template", "anthropic"].includes(mode)) throw new Error("ASSURMATCH_AI_PROVIDER must be template or anthropic");
  if (mode === "anthropic" && !env.ANTHROPIC_API_KEY) throw new Error("ASSURMATCH_AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
}
