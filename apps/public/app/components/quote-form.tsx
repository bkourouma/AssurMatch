"use client";

import { FormEvent, useState } from "react";
import { submitPublicQuoteRequest, type PublicQuoteFormState } from "../lib/public-api";
import { IndicativeOfferNotice } from "./public-journey";

export function QuoteFormShell({ countryCode, productKey, quoteForm }: { countryCode: string; productKey: string; quoteForm: PublicQuoteFormState }) {
  const [result, setResult] = useState<{ status: "idle" | "submitting" | "success" | "error"; message?: string; publicReference?: string }>({ status: "idle" });

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
      contact: {
        displayName: String(formData.get("displayName") ?? "").trim() || undefined,
        email: String(formData.get("email") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim()
      },
      answers: {},
      consent: {
        accepted: true,
        consentTextId: quoteForm.consent.consentTextId,
        version: quoteForm.consent.version,
        contentHash: quoteForm.consent.contentHash
      }
    });
    if (response.status === "success") {
      setResult({ status: "success", message: response.publicMessage, publicReference: response.publicReference ?? "" });
      event.currentTarget.reset();
      return;
    }
    setResult({ status: "error", message: response.publicMessage });
  }

  return (
    <form onSubmit={submit}>
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
      <label>
        <input name="consent" type="checkbox" required />
        J'accepte que ma demande soit transmise a un courtier partenaire eligible pour ce pays et ce produit.
      </label>
      <IndicativeOfferNotice />
      {result.status === "success" ? (
        <p role="status">Demande recue. Reference publique: <strong>{result.publicReference}</strong></p>
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
