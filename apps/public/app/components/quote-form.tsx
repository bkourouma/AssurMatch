"use client";

import { FormEvent, useState } from "react";
import { submitPublicQuoteRequest, type PublicQuoteFormField, type PublicQuoteFormState } from "../lib/public-api";
import { IndicativeOfferNotice } from "./public-journey";
import { VisitorAiAssistant } from "./visitor-ai-assistant";

/**
 * Spec 043: answers used to be submitted as an empty object, so a published definition's fields were
 * fetched and then ignored - the broker received a lead with nothing in it. Answers are read back
 * from the rendered fields only, so nothing the definition did not declare is ever transmitted.
 */
function collectAnswers(formData: FormData, fields: PublicQuoteFormField[]): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = formData.get(`answer_${field.key}`);
    if (field.type === "checkbox") {
      answers[field.key] = raw === "on";
      continue;
    }
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) continue;
    answers[field.key] = field.type === "number" ? Number(value) : value;
  }
  return answers;
}

function QuoteFormFieldInput({ field }: { field: PublicQuoteFormField }) {
  const name = `answer_${field.key}`;
  if (field.type === "select") {
    return (
      <label>
        {field.label}
        <select name={name} required={field.required} defaultValue="">
          <option value="" disabled={field.required}>Choisir</option>
          {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label>
        <input name={name} type="checkbox" required={field.required} />
        {field.label}
      </label>
    );
  }
  const inputType = field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : "text";
  return (
    <label>
      {field.label}
      <input name={name} type={inputType} required={field.required} />
    </label>
  );
}

export function QuoteFormShell({ countryCode, productKey, quoteForm, selectedOfferId }: { countryCode: string; productKey: string; quoteForm: PublicQuoteFormState; selectedOfferId?: string | undefined }) {
  const [result, setResult] = useState<{ status: "idle" | "submitting" | "success" | "error"; message?: string; publicReference?: string; verificationToken?: string }>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const consent = formData.get("consent") === "on";
    if (!consent) {
      setResult({ status: "error", message: "Le consentement est obligatoire avant toute transmission." });
      return;
    }
    setResult({ status: "submitting", message: "Envoi en cours." });
    const response = await submitPublicQuoteRequest({
      countryCode,
      productKey,
      formDefinitionId: quoteForm.formDefinitionId,
      ...(selectedOfferId ? { selectedOfferId } : {}),
      contact: {
        displayName: String(formData.get("displayName") ?? "").trim() || undefined,
        email: String(formData.get("email") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim()
      },
      answers: collectAnswers(formData, quoteForm.fields),
      consent: {
        accepted: true,
        consentTextId: quoteForm.consent.consentTextId,
        version: quoteForm.consent.version,
        contentHash: quoteForm.consent.contentHash,
        // Spec 042: unticked means a single broker, which is also the historical behaviour.
        multiBrokerAccepted: formData.get("multiBroker") === "on"
      }
    });
    if (response.status === "success") {
      setResult({ status: "success", message: response.publicMessage, publicReference: response.publicReference ?? "", ...(response.verificationToken ? { verificationToken: response.verificationToken } : {}) });
      event.currentTarget.reset();
      return;
    }
    setResult({ status: "error", message: response.publicMessage });
  }

  return (
    <form onSubmit={submit}>
      {selectedOfferId ? <p>Offre indicative preselectionnee: le courtier partenaire responsable confirmera le devis et les conditions.</p> : null}
      <label>
        Nom
        <input name="displayName" autoComplete="name" />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Telephone
        <input name="phone" type="tel" autoComplete="tel" required />
      </label>
      {quoteForm.fields.map((field) => <QuoteFormFieldInput key={field.key} field={field} />)}
      <label>
        <input name="consent" type="checkbox" required />
        J'accepte que ma demande soit transmise a un courtier partenaire eligible pour ce pays et ce produit.
      </label>
      <label>
        <input name="multiBroker" type="checkbox" />
        Facultatif: j'accepte d'etre rappele par plusieurs courtiers partenaires eligibles (jusqu'a 3). Sans cette case, votre demande n'est transmise qu'a un seul courtier.
      </label>
      <IndicativeOfferNotice />
      <VisitorAiAssistant countryCode={countryCode} productKey={productKey} mode="summary" answers={{}} />
      <VisitorAiAssistant countryCode={countryCode} productKey={productKey} mode="consistency" answers={{}} />
      {result.status === "success" ? (
        <p role="status">
          Demande recue. Reference publique: <strong>{result.publicReference}</strong>
          {result.verificationToken ? (
            <>
              {" "}
              <a href={`/quote-requests/${encodeURIComponent(result.publicReference ?? "")}?token=${encodeURIComponent(result.verificationToken)}`}>Suivre ma demande et ajouter des documents (optionnel)</a>
            </>
          ) : null}
        </p>
      ) : null}
      {result.status === "error" ? <p role="alert">{result.message}</p> : null}
      {result.status === "submitting" ? <p role="status">{result.message}</p> : null}
      <button type="submit" disabled={result.status === "submitting"}>Demander un devis</button>
    </form>
  );
}

export function QuoteBlockedState() {
  return <p>La demande de devis n'est pas disponible pour ce pays ou ce produit.</p>;
}
