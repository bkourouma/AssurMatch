"use client";

import { FormEvent, useState } from "react";
import { track } from "../../lib/analytics";
import { submitWaitlist, type WaitlistSubmission } from "../../lib/public-api";
import { Button } from "../ui/button";
import { Field, fieldControlProps } from "../ui/field";
import { Notice } from "../ui/notice";

export interface WaitlistProductOption {
  key: string;
  name: string;
}

/**
 * Labels are passed in rather than read with `useTranslations`: the `Waitlist` namespace is not part
 * of the client bundle declared by the locale layout, so the server page resolves the copy and this
 * boundary only ships the interaction.
 */
export interface WaitlistFormLabels {
  legend: string;
  email: string;
  emailHint: string;
  emailRequired: string;
  product: string;
  productHint: string;
  productNone: string;
  consent: string;
  consentRequired: string;
  website: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successDescription: string;
  error: string;
}

export interface WaitlistFormProps {
  countryIso: string;
  labels: WaitlistFormLabels;
  products?: readonly WaitlistProductOption[];
}

/**
 * An error names the control it belongs to, so a missing consent is announced on the consent box
 * rather than under the e-mail field, where it used to appear and read as an e-mail problem.
 */
type ErrorField = "email" | "consent" | "form";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string; field: ErrorField }
  | { status: "success"; message: string };

/**
 * Waiting-list subscription of a country that is not open yet (SITE-109).
 *
 * The consent box is never pre-ticked, the `website` input is a honeypot a real visitor never fills,
 * and `sessionId` is a per-form identifier used by the backend abuse guard. Nothing here leads to a
 * quote: the country has no eligible partner broker yet.
 */
export function WaitlistForm({ countryIso, labels, products = [] }: WaitlistFormProps) {
  // Generated once per mounted form, so a reload is a new session for the abuse guard.
  const [sessionId] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : ""));
  const [state, setState] = useState<FormState>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const productKey = String(formData.get("productKey") ?? "").trim();
    const consent = formData.get("consent") === "on";
    const website = String(formData.get("website") ?? "").trim();

    if (!email) {
      setState({ status: "error", message: labels.emailRequired, field: "email" });
      return;
    }
    if (!consent) {
      setState({ status: "error", message: labels.consentRequired, field: "consent" });
      return;
    }

    setState({ status: "submitting" });
    // `WaitlistSubmission` is the shared contract input: the consent literal and the two abuse-guard
    // fields are part of it, so the payload is exactly what POST /waitlist validates.
    const payload: WaitlistSubmission = {
      countryCode: countryIso,
      email,
      consent: true,
      website,
      sessionId,
      ...(productKey ? { productKey } : {})
    };
    const result = await submitWaitlist(payload);
    if (result.status === "success") {
      track("waitlist_joined", { country: countryIso, ...(productKey ? { product: productKey } : {}) });
      setState({ status: "success", message: result.publicMessage });
      return;
    }
    setState({ status: "error", message: result.publicMessage || labels.error, field: "form" });
  }

  if (state.status === "success") {
    return (
      <Notice tone="success" title={labels.successTitle} role="status">
        {labels.successDescription}
      </Notice>
    );
  }

  const submitting = state.status === "submitting";
  const emailError = state.status === "error" && state.field === "email" ? state.message : undefined;
  const consentError = state.status === "error" && state.field === "consent" ? state.message : undefined;
  const formError = state.status === "error" && state.field === "form" ? state.message : undefined;

  return (
    <form className="am-stack" onSubmit={submit} aria-label={labels.legend} noValidate>
      <Field
        id="am-waitlist-email"
        label={labels.email}
        hint={labels.emailHint}
        required
        {...(emailError ? { error: emailError } : {})}
      >
        <input
          {...fieldControlProps("am-waitlist-email", { hint: labels.emailHint, error: emailError, required: true })}
          name="email"
          type="email"
          autoComplete="email"
          maxLength={180}
        />
      </Field>

      {products.length > 0 ? (
        <Field id="am-waitlist-product" label={labels.product} hint={labels.productHint}>
          <select
            {...fieldControlProps("am-waitlist-product", { hint: labels.productHint })}
            name="productKey"
            defaultValue=""
          >
            <option value="">{labels.productNone}</option>
            {products.map((product) => (
              <option key={product.key} value={product.key}>
                {product.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {/* Honeypot: hidden from people and from assistive technology, filled only by robots. */}
      <div className="am-visually-hidden" aria-hidden="true">
        <label htmlFor="am-waitlist-website">{labels.website}</label>
        <input id="am-waitlist-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <label htmlFor="am-waitlist-consent">
        <input
          id="am-waitlist-consent"
          name="consent"
          type="checkbox"
          aria-invalid={consentError ? true : undefined}
          aria-describedby={consentError ? "am-waitlist-consent-error" : undefined}
        />
        {labels.consent}
      </label>
      {consentError ? (
        <p className="am-field__error" id="am-waitlist-consent-error" role="alert">
          {consentError}
        </p>
      ) : null}
      {formError ? (
        <Notice tone="error" role="alert">
          {formError}
        </Notice>
      ) : null}

      <div className="am-cluster">
        <Button type="submit" disabled={submitting}>
          {submitting ? labels.submitting : labels.submit}
        </Button>
      </div>
    </form>
  );
}
