"use client";

import { useEffect, useState } from "react";
import { readVisitorAi, readVisitorAiAvailability, requestVisitorAi, type VisitorAiInteraction } from "../lib/public-api";

type Mode = "product" | "faq" | "summary" | "consistency";

const MODE_CONFIG: Record<Mode, { assistType: string; title: string; placeholder?: string; button: string }> = {
  product: { assistType: "visitor_product_assistant", title: "Assistant IA d'aide a la comprehension: quel type d'assurance ?", placeholder: "Decrivez votre besoin (ex: proteger ma voiture utilisee au quotidien)", button: "Demander une orientation indicative" },
  faq: { assistType: "visitor_faq", title: "Question generale sur l'assurance", placeholder: "Posez une question generale (sans donnees personnelles)", button: "Poser ma question" },
  summary: { assistType: "visitor_request_summary", title: "Resume IA de mon besoin avant envoi", button: "Resumer mon besoin" },
  consistency: { assistType: "visitor_consistency_check", title: "Verification IA de coherence", button: "Verifier mes reponses" }
};

/**
 * Public AI assistance: hidden entirely when the assist type is disabled for the country/product
 * (Constitution: no AI proposed when flags are off), asynchronous (queue + poll), always labelled
 * as indicative assistance with the fixed disclaimer.
 */
export function VisitorAiAssistant({ countryCode, productKey, mode, answers = {} }: { countryCode: string; productKey?: string; mode: Mode; answers?: Record<string, unknown> }) {
  const config = MODE_CONFIG[mode];
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
        setState({ status: "error", message: "L'assistant IA met trop de temps a repondre. Reessayez plus tard." });
      }
    }, 750);
    return () => clearInterval(timer);
  }, [state.status, state.interaction]);

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
    setState({ status: "error", message: result.publicMessage ?? "Assistant indisponible." });
  }

  const interaction = state.status === "done" ? state.interaction : undefined;

  return (
    <section aria-label={config.title} data-visitor-ai={mode}>
      <h3>{config.title}</h3>
      <p>{interaction?.assistanceLabel ?? "Assistance IA d'aide a la comprehension"}: reponse indicative, sans conseil personnalise. Ne saisissez pas de donnees personnelles.</p>
      {config.placeholder ? (
        <label>
          Votre question
          <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={600} rows={3} placeholder={config.placeholder} />
        </label>
      ) : null}
      <button type="button" onClick={submit} disabled={state.status === "submitting" || state.status === "polling" || (Boolean(config.placeholder) && text.trim().length < 5)}>
        {state.status === "submitting" || state.status === "polling" ? "Assistance en cours..." : config.button}
      </button>
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
      {interaction?.status === "completed" && interaction.outputText ? (
        <div role="status">
          <p>{interaction.outputText}</p>
          {interaction.fallback ? <p>Reponse generee par l'assistant de secours (mode simplifie).</p> : null}
        </div>
      ) : null}
      {interaction?.status === "refused" ? <p role="alert">L'assistant IA n'a pas pu produire de reponse conforme pour cette demande. Un courtier partenaire pourra vous repondre apres votre demande de devis.</p> : null}
      {interaction?.status === "failed" ? <p role="alert">Assistant indisponible pour le moment.</p> : null}
    </section>
  );
}
