"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { readVisitorAi, readVisitorAiAvailability, requestVisitorAi, type VisitorAiInteraction } from "../lib/public-api";
import { AiBox } from "./ui/ai-box";
import { BackendText } from "./ui/backend-text";
import { Field, fieldControlProps } from "./ui/field";
import { Notice } from "./ui/notice";

type Mode = "product" | "faq" | "summary" | "consistency";

const MODE_CONFIG: Record<Mode, { assistType: string; hasInput: boolean }> = {
  product: { assistType: "visitor_product_assistant", hasInput: true },
  faq: { assistType: "visitor_faq", hasInput: true },
  summary: { assistType: "visitor_request_summary", hasInput: false },
  consistency: { assistType: "visitor_consistency_check", hasInput: false }
};

/**
 * Public AI assistance: hidden entirely when the assist type is disabled for the country/product
 * (Constitution: no AI proposed when flags are off), asynchronous (queue + poll), always framed by
 * the `AiBox` primitive so the "genere par IA" label and the disclaimer are permanently on screen.
 * It is never required to move forward: nothing here blocks a quote request.
 */
export function VisitorAiAssistant({ countryCode, productKey, mode, answers = {} }: { countryCode: string; productKey?: string; mode: Mode; answers?: Record<string, unknown> }) {
  const t = useTranslations("VisitorAi");
  const common = useTranslations("Common");
  const config = MODE_CONFIG[mode];
  const title = t(`modes.${mode}.title`);
  const buttonLabel = t(`modes.${mode}.button`);
  const placeholder = mode === "product" ? t("modes.product.placeholder") : mode === "faq" ? t("modes.faq.placeholder") : undefined;
  const [available, setAvailable] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<{ status: "idle" | "submitting" | "polling" | "done" | "error"; message?: string; interaction?: VisitorAiInteraction }>({ status: "idle" });

  useEffect(() => {
    let active = true;
    readVisitorAiAvailability(countryCode, productKey).then((availability) => {
      if (active) setAvailable(availability.some((entry) => entry.assistType === config.assistType && entry.enabled));
    });
    return () => {
      active = false;
    };
  }, [countryCode, productKey, config.assistType]);

  useEffect(() => {
    if (state.status !== "polling" || !state.interaction) return;
    const interactionId = state.interaction.id;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      const interaction = await readVisitorAi(interactionId);
      if (interaction && interaction.status !== "queued") {
        clearInterval(timer);
        setState({ status: "done", interaction });
      } else if (attempts >= 20) {
        clearInterval(timer);
        setState({ status: "error", message: t("timeout") });
      }
    }, 750);
    return () => clearInterval(timer);
  }, [state.status, state.interaction, t]);

  if (available !== true) return null;

  async function submit() {
    setState({ status: "submitting" });
    const body: Record<string, unknown> = { countryCode, ...(productKey ? { productKey } : {}) };
    if (mode === "product") body.need = text;
    if (mode === "faq") body.question = text;
    if (mode === "summary" || mode === "consistency") body.answers = answers;
    const result = await requestVisitorAi(config.assistType, body);
    if (result.status === "queued" && result.interaction) {
      setState(result.interaction.status === "queued" ? { status: "polling", interaction: result.interaction } : { status: "done", interaction: result.interaction });
      return;
    }
    setState({ status: "error", message: result.publicMessage ?? t("unavailable") });
  }

  const interaction = state.status === "done" ? state.interaction : undefined;
  const busy = state.status === "submitting" || state.status === "polling";
  const inputId = `am-visitor-ai-${mode}`;

  return (
    <div data-visitor-ai={mode}>
      <AiBox generatedLabel={common("aiGenerated")} disclaimer={common("aiDisclaimer")} title={title} ariaLabel={title}>
        <p className="am-field__hint">{t("note", { label: interaction?.assistanceLabel ?? t("defaultLabel") })}</p>
        <p className="am-field__hint">{t("optional")}</p>
        {config.hasInput ? (
          <Field id={inputId} label={t("questionLabel")}>
            <textarea
              {...fieldControlProps(inputId, {})}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={600}
              rows={3}
              placeholder={placeholder}
            />
          </Field>
        ) : null}
        <div className="am-cluster">
          <button
            className="am-button"
            data-variant="secondary"
            type="button"
            onClick={submit}
            disabled={busy || (config.hasInput && text.trim().length < 5)}
          >
            <span>{busy ? t("pending") : buttonLabel}</span>
          </button>
        </div>
        {state.status === "error" ? (
          <Notice tone="error" role="alert">
            {state.message}
          </Notice>
        ) : null}
        {interaction?.status === "completed" && interaction.outputText ? (
          <div role="status">
            <p>
              <BackendText>{interaction.outputText}</BackendText>
            </p>
            {interaction.fallback ? <p className="am-field__hint">{t("fallback")}</p> : null}
          </div>
        ) : null}
        {interaction?.status === "refused" ? (
          <Notice tone="info" role="alert">
            {t("refused")}
          </Notice>
        ) : null}
        {interaction?.status === "failed" ? (
          <Notice tone="error" role="alert">
            {t("failed")}
          </Notice>
        ) : null}
      </AiBox>
    </div>
  );
}
