"use client";

import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import { Link } from "../../i18n/navigation";
import { submitPublicQuoteRequest, type PublicQuoteFormField, type PublicQuoteFormState } from "../lib/public-api";
import { IndicativeOfferNotice } from "./public-journey";
import { VisitorAiAssistant } from "./visitor-ai-assistant";
import { BackendText } from "./ui/backend-text";
import { EmptyState } from "./ui/empty-state";
import { Field, fieldControlProps } from "./ui/field";
import { Notice } from "./ui/notice";

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

function QuoteFormFieldInput({ field, chooseLabel, requiredLabel }: { field: PublicQuoteFormField; chooseLabel: string; requiredLabel: string }) {
  const name = `answer_${field.key}`;
  const id = `am-answer-${field.key}`;

  if (field.type === "checkbox") {
    // Never pre-ticked: a declarative answer is given, never withdrawn.
    return (
      <label htmlFor={id}>
        <input id={id} name={name} type="checkbox" required={field.required} />
        <BackendText>{field.label}</BackendText>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <Field id={id} label={field.label} required={field.required} requiredLabel={requiredLabel}>
        <select {...fieldControlProps(id, { required: field.required })} name={name} defaultValue="">
          <option value="" disabled={field.required}>
            {chooseLabel}
          </option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  const inputType =
    field.type === "phone"
      ? "tel"
      : field.type === "number"
        ? "number"
        : field.type === "date"
          ? "date"
          : field.type === "email"
            ? "email"
            : "text";

  return (
    <Field id={id} label={field.label} required={field.required} requiredLabel={requiredLabel}>
      <input {...fieldControlProps(id, { required: field.required })} name={name} type={inputType} />
    </Field>
  );
}

export function QuoteFormShell({ countryCode, productKey, quoteForm, selectedOfferId }: { countryCode: string; productKey: string; quoteForm: PublicQuoteFormState; selectedOfferId?: string | undefined }) {
  const t = useTranslations("QuoteForm");
  const forms = useTranslations("Forms");
  const [result, setResult] = useState<{ status: "idle" | "submitting" | "success" | "error"; message?: string; publicReference?: string; verificationToken?: string }>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // currentTarget is null once the event has been through an await, so the element is captured first.
    const form = event.currentTarget;
    const formData = new FormData(form);
    const consent = formData.get("consent") === "on";
    if (!consent) {
      setResult({ status: "error", message: t("consentRequired") });
      return;
    }
    setResult({ status: "submitting", message: t("submitting") });
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
      form.reset();
      return;
    }
    setResult({ status: "error", message: response.publicMessage });
  }

  return (
    <form className="pub-card pub-form" onSubmit={submit}>
      {selectedOfferId ? <Notice tone="indicative">{t("preselected")}</Notice> : null}

      <fieldset>
        <legend>{t("contactLegend")}</legend>
        <div className="pub-form__grid pub-form__grid--two">
          <Field id="am-quote-name" label={t("name")} hint={t("nameHint")}>
            <input
              {...fieldControlProps("am-quote-name", { hint: t("nameHint") })}
              name="displayName"
              autoComplete="name"
            />
          </Field>
          <Field id="am-quote-email" label={t("email")} hint={t("emailHint")} required requiredLabel={forms("required")}>
            <input
              {...fieldControlProps("am-quote-email", { hint: t("emailHint"), required: true })}
              name="email"
              type="email"
              autoComplete="email"
            />
          </Field>
          <Field id="am-quote-phone" label={t("phone")} hint={t("phoneHint")} required requiredLabel={forms("required")}>
            <input
              {...fieldControlProps("am-quote-phone", { hint: t("phoneHint"), required: true })}
              name="phone"
              type="tel"
              autoComplete="tel"
            />
          </Field>
        </div>
      </fieldset>

      {quoteForm.fields.length > 0 ? (
        <fieldset>
          <legend>{t("needLegend")}</legend>
          <div className="pub-form__grid pub-form__grid--two">
            {quoteForm.fields.map((field) => (
              <QuoteFormFieldInput key={field.key} field={field} chooseLabel={t("choose")} requiredLabel={forms("required")} />
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset>
        <legend>{t("consentLegend")}</legend>
        {/* Consent boxes are never pre-ticked: consent is given, never withdrawn. */}
        <label htmlFor="am-quote-consent">
          <input id="am-quote-consent" name="consent" type="checkbox" required />
          {t("consentLabel")}
        </label>
        <label htmlFor="am-quote-multi-broker">
          <input id="am-quote-multi-broker" name="multiBroker" type="checkbox" />
          {t("multiBrokerLabel")}
        </label>
      </fieldset>

      <IndicativeOfferNotice />

      <section className="am-stack">
        <h2 className="pub-card__title">{t("assistanceTitle")}</h2>
        <p className="am-field__hint">{t("assistanceLead")}</p>
        <VisitorAiAssistant countryCode={countryCode} productKey={productKey} mode="summary" answers={{}} />
        <VisitorAiAssistant countryCode={countryCode} productKey={productKey} mode="consistency" answers={{}} />
      </section>

      {result.status === "success" ? (
        <Notice tone="success" title={t("successTitle")} role="status">
          {t("successPrefix")} <strong>{result.publicReference}</strong>
          {result.verificationToken ? (
            <>
              {" "}
              <Link
                href={{
                  pathname: "/quote-requests/[publicReference]",
                  params: { publicReference: result.publicReference ?? "" },
                  query: { token: result.verificationToken }
                }}
              >
                {t("trackLink")}
              </Link>
            </>
          ) : null}
        </Notice>
      ) : null}
      {result.status === "error" ? (
        <Notice tone="error" role="alert">
          {result.message}
        </Notice>
      ) : null}
      {result.status === "submitting" ? (
        <Notice tone="info" role="status">
          {result.message}
        </Notice>
      ) : null}

      <div className="am-cluster">
        <button className="am-button" data-variant="primary" type="submit" disabled={result.status === "submitting"}>
          <span>{t("submit")}</span>
        </button>
        <p className="am-field__hint">{t("fineprint")}</p>
      </div>
    </form>
  );
}

export function QuoteBlockedState() {
  const t = useTranslations("QuoteForm");
  return <EmptyState title={t("blocked.title")} description={t("blocked.description")} />;
}
