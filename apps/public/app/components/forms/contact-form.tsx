"use client";

import { FormEvent, useState } from "react";
import { Link } from "../../../i18n/navigation";
import { track } from "../../lib/analytics";
import { submitContact, type ContactSubmission } from "../../lib/public-api";
import { Button } from "../ui/button";
import { Field, fieldControlProps } from "../ui/field";
import { Notice } from "../ui/notice";
import { RadioCards, type RadioCardOption } from "../ui/radio-cards";

/**
 * Every visible string is passed in from the server page (`contact/page.tsx`), which already reads
 * "Contact" and "Forms" through `getTranslations`. This client component intentionally has no
 * `useTranslations` call of its own: the two namespaces are not part of the layout's client message
 * bundle, and this keeps it that way rather than widening what the browser downloads.
 */
export interface ContactFormLabels {
  audienceLegend: string;
  audienceOptions: readonly RadioCardOption[];
  name: string;
  email: string;
  phone: string;
  country: string;
  subject: string;
  message: string;
  honeypot: string;
  consent: string;
  consentRequired: string;
  consentHintPrefix: string;
  privacyLinkLabel: string;
  requiredMark: string;
  fieldRequired: string;
  invalidEmail: string;
  submit: string;
  sending: string;
  successTitle: string;
  successBody: string;
  /** Contains the literal substring "{reference}", replaced client-side once a reference exists. */
  successReferenceTemplate: string;
  newMessage: string;
}

export interface ContactFormProps {
  labels: ContactFormLabels;
}

type FormStatus = "idle" | "submitting" | "success" | "error";

interface FieldErrors {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

const countryCodePattern = /^[A-Za-z]{2}$/;

function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ContactForm({ labels }: ContactFormProps) {
  const [sessionId] = useState(newSessionId);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // A missing consent is an error of the consent box, not of the form as a whole.
  const [consentError, setConsentError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [reference, setReference] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    // Honeypot: a real visitor never sees or fills this field. A filled value means a bot filled every
    // input on the page; the form silently pretends success instead of teaching the bot what failed.
    const honeypotValue = String(formData.get("website") ?? "").trim();
    if (honeypotValue) {
      setStatus("success");
      setReference(sessionId);
      return;
    }

    const audienceRaw = String(formData.get("audience") ?? "visitor");
    const audience: ContactSubmission["audience"] = audienceRaw === "broker" || audienceRaw === "insurer" || audienceRaw === "press" ? audienceRaw : "visitor";
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const countryCodeRaw = String(formData.get("countryCode") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const consent = formData.get("consent") === "on";

    const nextErrors: FieldErrors = {};
    if (!name) nextErrors.name = labels.fieldRequired;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = labels.invalidEmail;
    if (!subject) nextErrors.subject = labels.fieldRequired;
    if (!message) nextErrors.message = labels.fieldRequired;
    setFieldErrors(nextErrors);

    if (!consent) {
      setStatus("error");
      setErrorMessage(labels.consentRequired);
      setConsentError(labels.consentRequired);
      return;
    }
    setConsentError(null);
    if (Object.keys(nextErrors).length > 0) {
      setStatus("error");
      setErrorMessage(null);
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    const response = await submitContact({
      audience,
      name,
      email,
      subject,
      message,
      consent: true,
      sessionId,
      ...(phone ? { phone } : {}),
      ...(countryCodePattern.test(countryCodeRaw) ? { countryCode: countryCodeRaw.toUpperCase() } : {})
    });

    if (response.status === "success") {
      setStatus("success");
      setReference(sessionId);
      track("contact_submitted", { audience });
      return;
    }

    setStatus("error");
    setErrorMessage(response.publicMessage);
  }

  if (status === "success") {
    return (
      <Notice tone="success" title={labels.successTitle} role="status">
        <p>{labels.successBody}</p>
        {reference ? <p>{labels.successReferenceTemplate.replace("{reference}", reference)}</p> : null}
        <button
          className="am-button"
          data-variant="secondary"
          type="button"
          onClick={() => {
            setStatus("idle");
            setReference(null);
            setFieldErrors({});
          }}
        >
          <span>{labels.newMessage}</span>
        </button>
      </Notice>
    );
  }

  return (
    <form className="am-stack" onSubmit={handleSubmit} noValidate>
      <RadioCards name="audience" legend={labels.audienceLegend} options={labels.audienceOptions} defaultValue="visitor" required />

      <Field id="contact-name" label={labels.name} required requiredLabel={labels.requiredMark} {...(fieldErrors.name ? { error: fieldErrors.name } : {})}>
        <input {...fieldControlProps("contact-name", { required: true, ...(fieldErrors.name ? { error: fieldErrors.name } : {}) })} name="name" type="text" autoComplete="name" />
      </Field>

      <Field id="contact-email" label={labels.email} required requiredLabel={labels.requiredMark} {...(fieldErrors.email ? { error: fieldErrors.email } : {})}>
        <input {...fieldControlProps("contact-email", { required: true, ...(fieldErrors.email ? { error: fieldErrors.email } : {}) })} name="email" type="email" autoComplete="email" />
      </Field>

      <Field id="contact-phone" label={labels.phone}>
        <input {...fieldControlProps("contact-phone", {})} name="phone" type="tel" autoComplete="tel" />
      </Field>

      <Field id="contact-country" label={labels.country}>
        <input {...fieldControlProps("contact-country", {})} name="countryCode" type="text" maxLength={2} autoComplete="off" />
      </Field>

      <Field id="contact-subject" label={labels.subject} required requiredLabel={labels.requiredMark} {...(fieldErrors.subject ? { error: fieldErrors.subject } : {})}>
        <input {...fieldControlProps("contact-subject", { required: true, ...(fieldErrors.subject ? { error: fieldErrors.subject } : {}) })} name="subject" type="text" />
      </Field>

      <Field id="contact-message" label={labels.message} required requiredLabel={labels.requiredMark} {...(fieldErrors.message ? { error: fieldErrors.message } : {})}>
        <textarea {...fieldControlProps("contact-message", { required: true, ...(fieldErrors.message ? { error: fieldErrors.message } : {}) })} name="message" rows={6} />
      </Field>

      <div className="am-visually-hidden" aria-hidden="true">
        <label htmlFor="contact-website">{labels.honeypot}</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <label className="am-radiocard" htmlFor="contact-consent">
        <input
          id="contact-consent"
          name="consent"
          type="checkbox"
          aria-invalid={consentError ? true : undefined}
          aria-describedby={consentError ? "contact-consent-error" : undefined}
        />
        <span className="am-radiocard__body">
          <span className="am-radiocard__label">{labels.consent}</span>
        </span>
      </label>
      <p className="am-field__hint">
        {labels.consentHintPrefix} <Link href="/privacy">{labels.privacyLinkLabel}</Link>.
      </p>
      {consentError ? (
        <p className="am-field__error" id="contact-consent-error" role="alert">
          {consentError}
        </p>
      ) : null}

      {status === "error" && errorMessage ? (
        <Notice tone="error" role="alert">
          {errorMessage}
        </Notice>
      ) : null}

      <div className="am-cluster">
        <Button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? labels.sending : labels.submit}
        </Button>
      </div>
    </form>
  );
}
