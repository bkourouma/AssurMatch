"use client";

import { FormEvent, useState } from "react";
import { useLocale } from "next-intl";
import { toLocale } from "../../../i18n/routing";
import { requestTrackingLink } from "../../lib/public-api";
import { Button } from "../ui/button";
import { Field, fieldControlProps } from "../ui/field";
import { Notice } from "../ui/notice";

/**
 * Spec 054 US2: tracking-link resend. The answer is always the same neutral confirmation, whether the
 * reference and the e-mail matched or not (FR-004): the page never reveals that a request exists.
 * The request goes from the browser so the API rate limit applies to the visitor's own address.
 *
 * Labels come from the server page: the `Tracking` namespace is not shipped to the browser.
 */
export interface TrackingLinkFormLabels {
  reference: string;
  referenceHint: string;
  email: string;
  honeypot: string;
  requiredMark: string;
  invalidReference: string;
  invalidEmail: string;
  submit: string;
  sending: string;
  confirmationTitle: string;
  confirmationBody: string;
  again: string;
  rateLimited: string;
  error: string;
}

type FormStatus = "idle" | "submitting" | "confirmed" | "rate_limited" | "error";

interface FieldErrors {
  reference?: string;
  email?: string;
}

const REFERENCE_PATTERN = /^[A-Za-z0-9-]{4,64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function TrackingLinkForm({ labels, defaultReference }: { labels: TrackingLinkFormLabels; defaultReference?: string }) {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errors, setErrors] = useState<FieldErrors>({});
  const locale = toLocale(useLocale());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const publicReference = String(formData.get("publicReference") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    // Honeypot: a real visitor never sees this field. A bot that fills it gets the same neutral
    // confirmation as everyone, and no request leaves the browser.
    const website = String(formData.get("website") ?? "").trim();

    const nextErrors: FieldErrors = {};
    if (!REFERENCE_PATTERN.test(publicReference)) nextErrors.reference = labels.invalidReference;
    if (!EMAIL_PATTERN.test(email) || email.length > 254) nextErrors.email = labels.invalidEmail;
    setErrors(nextErrors);
    if (nextErrors.reference || nextErrors.email) return;

    if (website) {
      setStatus("confirmed");
      return;
    }

    setStatus("submitting");
    const result = await requestTrackingLink({ publicReference, email, locale, website: "" });
    // A malformed body (400) is answered like an accepted one: nothing distinguishes a known pair.
    if (result === "accepted" || result === "invalid") setStatus("confirmed");
    else setStatus(result);
  }

  if (status === "confirmed") {
    return (
      <div className="am-stack">
        <Notice tone="success" title={labels.confirmationTitle} role="status">
          {labels.confirmationBody}
        </Notice>
        <div className="am-cluster">
          <Button variant="secondary" onClick={() => setStatus("idle")}>
            {labels.again}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className="am-stack" noValidate onSubmit={handleSubmit} data-form="tracking-link">
      {status === "rate_limited" ? (
        <Notice tone="error" role="alert">
          {labels.rateLimited}
        </Notice>
      ) : null}
      {status === "error" ? (
        <Notice tone="error" role="alert">
          {labels.error}
        </Notice>
      ) : null}
      <Field id="tracking-reference" label={labels.reference} hint={labels.referenceHint} error={errors.reference} required requiredLabel={labels.requiredMark}>
        <input
          {...fieldControlProps("tracking-reference", { hint: labels.referenceHint, error: errors.reference, required: true })}
          name="publicReference"
          type="text"
          autoComplete="off"
          maxLength={64}
          defaultValue={defaultReference ?? ""}
        />
      </Field>
      <Field id="tracking-email" label={labels.email} error={errors.email} required requiredLabel={labels.requiredMark} leading="mail">
        <input
          {...fieldControlProps("tracking-email", { error: errors.email, required: true })}
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
        />
      </Field>
      <div className="am-visually-hidden" aria-hidden="true">
        <label htmlFor="tracking-website">{labels.honeypot}</label>
        <input id="tracking-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="am-cluster">
        <Button type="submit" variant="primary" loading={status === "submitting"} disabled={status === "submitting"}>
          {status === "submitting" ? labels.sending : labels.submit}
        </Button>
      </div>
    </form>
  );
}
