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
  /** Empty option of the country select: the field stays optional. */
  countryUnspecified: string;
  /** Shown in the summary notice, and only when more than one control is invalid. */
  errorSummary: string;
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

/** One row of the public country directory, reduced to what the select needs. */
export interface ContactFormCountry {
  isoCode: string;
  name: string;
}

export interface ContactFormProps {
  labels: ContactFormLabels;
  /** Open and upcoming countries, read server-side from the public directory. */
  countries: readonly ContactFormCountry[];
}

type FormStatus = "idle" | "submitting" | "success" | "error";

interface FieldErrors {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

const countryCodePattern = /^[A-Za-z]{2}$/;

/** Tab order of the text controls: the first invalid one is the one that gets focus on a failed submit. */
const FIELD_FOCUS_ORDER = ["name", "email", "subject", "message"] as const;

function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Moves focus to the first control the visitor has to fix. Without it a failed submit left focus on
 * the submit button, at the bottom of a long form, with the error messages off screen.
 */
function focusFirstInvalid(form: HTMLFormElement, errors: FieldErrors, consentMissing: boolean): void {
  for (const field of FIELD_FOCUS_ORDER) {
    if (!errors[field]) continue;
    const control = form.elements.namedItem(field);
    if (control instanceof HTMLElement) {
      control.focus();
      return;
    }
  }
  if (!consentMissing) return;
  const consentBox = form.elements.namedItem("consent");
  if (consentBox instanceof HTMLElement) consentBox.focus();
}

export function ContactForm({ labels, countries }: ContactFormProps) {
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
    const consentMissing = !consent;

    setFieldErrors(nextErrors);
    setConsentError(consentMissing ? labels.consentRequired : null);

    // One invalid control says it once, in its own error line. The summary notice is only added when
    // several controls are wrong and the visitor needs to know there is more than what is in view.
    const invalidCount = Object.keys(nextErrors).length + (consentMissing ? 1 : 0);
    if (invalidCount > 0) {
      setStatus("error");
      setErrorMessage(invalidCount > 1 ? labels.errorSummary : null);
      focusFirstInvalid(form, nextErrors, consentMissing);
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
        {reference ? <p className="am-tabular">{labels.successReferenceTemplate.replace("{reference}", reference)}</p> : null}
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            setStatus("idle");
            setReference(null);
            setFieldErrors({});
            setConsentError(null);
            setErrorMessage(null);
          }}
        >
          {labels.newMessage}
        </Button>
      </Notice>
    );
  }

  return (
    <form className="am-stack" onSubmit={handleSubmit} noValidate>
      <RadioCards name="audience" legend={labels.audienceLegend} options={labels.audienceOptions} defaultValue="visitor" required />

      {/* Short identity fields side by side from 768px; the subject and the message keep a full row. */}
      <div className="am-form-grid">
        <Field id="contact-name" label={labels.name} required requiredLabel={labels.requiredMark} leading="user" {...(fieldErrors.name ? { error: fieldErrors.name } : {})}>
          <input {...fieldControlProps("contact-name", { required: true, ...(fieldErrors.name ? { error: fieldErrors.name } : {}) })} name="name" type="text" autoComplete="name" />
        </Field>

        <Field id="contact-email" label={labels.email} required requiredLabel={labels.requiredMark} leading="mail" {...(fieldErrors.email ? { error: fieldErrors.email } : {})}>
          <input {...fieldControlProps("contact-email", { required: true, ...(fieldErrors.email ? { error: fieldErrors.email } : {}) })} name="email" type="email" autoComplete="email" />
        </Field>

        <Field id="contact-phone" label={labels.phone} leading="phone">
          <input {...fieldControlProps("contact-phone", {})} name="phone" type="tel" autoComplete="tel" />
        </Field>

        {/*
          A select, not a free-text box: the two-letter input silently dropped anything that was not
          an ISO code ("Côte d'Ivoire", "CIV", "225"), so the visitor thought the value had been sent.
          The empty option keeps the field optional; the submitted value is the ISO code.
        */}
        <Field id="contact-country" label={labels.country} leading="map-pin">
          <select {...fieldControlProps("contact-country", {})} name="countryCode" defaultValue="" autoComplete="country">
            <option value="">{labels.countryUnspecified}</option>
            {countries.map((country) => (
              <option key={country.isoCode} value={country.isoCode}>
                {country.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="contact-subject"
          label={labels.subject}
          required
          requiredLabel={labels.requiredMark}
          className="am-form-grid__full"
          {...(fieldErrors.subject ? { error: fieldErrors.subject } : {})}
        >
          <input {...fieldControlProps("contact-subject", { required: true, ...(fieldErrors.subject ? { error: fieldErrors.subject } : {}) })} name="subject" type="text" />
        </Field>

        <Field
          id="contact-message"
          label={labels.message}
          required
          requiredLabel={labels.requiredMark}
          className="am-form-grid__full"
          {...(fieldErrors.message ? { error: fieldErrors.message } : {})}
        >
          <textarea {...fieldControlProps("contact-message", { required: true, ...(fieldErrors.message ? { error: fieldErrors.message } : {}) })} name="message" rows={6} />
        </Field>
      </div>

      <div className="am-visually-hidden" aria-hidden="true">
        <label htmlFor="contact-website">{labels.honeypot}</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="am-form-consent">
        <label className="am-checkline" htmlFor="contact-consent">
          <input
            id="contact-consent"
            name="consent"
            type="checkbox"
            aria-invalid={consentError ? true : undefined}
            aria-describedby={consentError ? "contact-consent-error" : undefined}
          />
          <span>{labels.consent}</span>
        </label>
        <p className="am-field__hint">
          {labels.consentHintPrefix} <Link href="/privacy">{labels.privacyLinkLabel}</Link>.
        </p>
        {consentError ? (
          <p className="am-field__error" id="contact-consent-error" role="alert">
            {consentError}
          </p>
        ) : null}
      </div>

      {status === "error" && errorMessage ? (
        <Notice tone="error" role="alert">
          {errorMessage}
        </Notice>
      ) : null}

      <div className="am-cluster">
        <Button type="submit" size="lg" loading={status === "submitting"}>
          {status === "submitting" ? labels.sending : labels.submit}
        </Button>
      </div>
    </form>
  );
}
