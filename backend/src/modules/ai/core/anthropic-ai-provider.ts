import Anthropic from "@anthropic-ai/sdk";
import type { AiGenerateRequest, AiGenerateResult, AiProviderPort } from "./ai-provider.port";

export interface AnthropicProviderConfig {
  apiKey: string;
  model: string;
  /** Server-side refusal fallbacks (beta); on by default so a policy decline is retried on a fallback model. */
  fallbacks: boolean;
  timeoutMs: number;
}

export class AiProviderError extends Error {
  constructor(public readonly kind: "rate_limited" | "authentication" | "bad_request" | "refusal" | "timeout" | "api_error" | "unknown", message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

/** Model provider through the official Anthropic SDK. Outputs are short assistance texts, hence the modest token cap. */
export class AnthropicAiProvider implements AiProviderPort {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(private readonly config: AnthropicProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 1 });
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    try {
      const response = this.config.fallbacks
        ? await this.client.beta.messages.create({
          model: this.config.model,
          max_tokens: request.maxOutputTokens,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low" },
          system: request.system,
          messages: [{ role: "user", content: request.user }]
        })
        : await this.client.messages.create({
          model: this.config.model,
          max_tokens: request.maxOutputTokens,
          output_config: { effort: "low" },
          system: request.system,
          messages: [{ role: "user", content: request.user }]
        });
      if (response.stop_reason === "refusal") throw new AiProviderError("refusal", "The model declined the request");
      const text = (response.content as Array<{ type: string; text?: string }>)
        .flatMap((block) => (block.type === "text" && typeof block.text === "string" ? [block.text] : []))
        .join("\n")
        .trim();
      if (!text) throw new AiProviderError("api_error", "The model returned no text");
      return {
        text,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof Anthropic.RateLimitError) throw new AiProviderError("rate_limited", error.message);
      if (error instanceof Anthropic.AuthenticationError) throw new AiProviderError("authentication", error.message);
      if (error instanceof Anthropic.BadRequestError) throw new AiProviderError("bad_request", error.message);
      if (error instanceof Anthropic.APIConnectionTimeoutError) throw new AiProviderError("timeout", error.message);
      if (error instanceof Anthropic.APIError) throw new AiProviderError("api_error", error.message);
      throw new AiProviderError("unknown", error instanceof Error ? error.message : "unknown provider error");
    }
  }
}
