"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "../../i18n/navigation";
import { submitPublicQuoteRequest, type PublicQuoteFormField, type PublicQuoteFormState } from "../lib/public-api";
import { IndicativeOfferNotice } from "./public-journey";
import { VisitorAiAssistant } from "./visitor-ai-assistant";
import { BackendText } from "./ui/backend-text";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { Field, fieldControlProps } from "./ui/field";
import { Icon } from "./ui/icons";
import { IconTile } from "./ui/icon-tile";
import { Notice } from "./ui/notice";
import { ProgressBar } from "./ui/progress-bar";

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
      <label className="am-j-consent" htmlFor={id}>
        <input id={id} name={name} type="checkbox" required={field.required} />
        <span>
          <BackendText>{field.label}</BackendText>
        </span>
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

/** Numbered section of the form: the visitor sees where each answer belongs. */
function QuoteSection({ index, legend, children }: { index: number; legend: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="am-j-form__legend">
        <span className="am-j-form__step am-tabular" aria-hidden="true">
          {index}
        </span>
        {legend}
      </legend>
      {children}
    </fieldset>
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
      // No `form.reset()`: the form is replaced by the confirmation panel below, and emptying a form
      // that stays on screen next to "demande recue" reads as an invitation to send it again.
      setResult({ status: "success", message: response.publicMessage, publicReference: response.publicReference ?? "", ...(response.verificationToken ? { verificationToken: response.verificationToken } : {}) });
      return;
    }
    setResult({ status: "error", message: response.publicMessage });
  }

  const pending = result.status === "submitting";
  const sent = result.status === "success";

  // The stepper lives here rather than on the page: only this boundary knows the request went
  // through, and the journey is only at step 4 once it has.
  const steps = [
    { label: t("steps.contact") },
    { label: t("steps.need") },
    { label: t("steps.consent") },
    { label: t("steps.confirmation") }
  ];
  const current = sent ? steps.length : 1;
  const stepper = (
    <ProgressBar
      steps={steps}
      current={current}
      label={t("progressLabel")}
      stepLabel={t("stepStatus", { current, total: steps.length })}
    />
  );

  if (sent) {
    return (
      <div className="am-stack am-stack--xl">
        {stepper}
        <section className="am-j-sent" aria-label={t("successTitle")}>
          <IconTile name="check-circle" tone="success" size="lg" />
          <h2 className="am-j-sent__title">{t("successTitle")}</h2>
          <div className="am-j-reference">
            <p className="am-j-reference__label">{t("successPrefix")}</p>
            <p className="am-j-reference__value am-tabular">{result.publicReference}</p>
          </div>
          {result.verificationToken ? (
            <p>
              <Link
                href={{
                  pathname: "/quote-requests/[publicReference]",
                  params: { publicReference: result.publicReference ?? "" },
                  query: { token: result.verificationToken }
                }}
              >
                {t("trackLink")}
              </Link>
            </p>
          ) : null}
          <div className="am-j-sent__actions">
            <Button
              variant="secondary"
              href={{ pathname: "/countries/[countryCode]/products/[productKey]/offers", params: { countryCode, productKey } }}
              icon={<Icon name="arrow-left" size={18} />}
            >
              {t("backToOffers")}
            </Button>
          </div>
          <p className="am-j-fineprint">{t("fineprint")}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="am-stack am-stack--xl">
      {stepper}
      <form className="am-j-form" onSubmit={submit}>
        {selectedOfferId ? <Notice tone="indicative">{t("preselected")}</Notice> : null}

        <QuoteSection index={1} legend={t("contactLegend")}>
          <div className="am-j-form__grid">
            <Field id="am-quote-name" label={t("name")} hint={t("nameHint")} leading="user">
              <input
                {...fieldControlProps("am-quote-name", { hint: t("nameHint") })}
                name="displayName"
                autoComplete="name"
              />
            </Field>
            <Field id="am-quote-email" label={t("email")} hint={t("emailHint")} required requiredLabel={forms("required")} leading="mail">
              <input
                {...fieldControlProps("am-quote-email", { hint: t("emailHint"), required: true })}
                name="email"
                type="email"
                autoComplete="email"
              />
            </Field>
            <Field id="am-quote-phone" label={t("phone")} hint={t("phoneHint")} required requiredLabel={forms("required")} leading="phone">
              <input
                {...fieldControlProps("am-quote-phone", { hint: t("phoneHint"), required: true })}
                name="phone"
                type="tel"
                autoComplete="tel"
              />
            </Field>
          </div>
        </QuoteSection>

        {quoteForm.fields.length > 0 ? (
          <QuoteSection index={2} legend={t("needLegend")}>
            <div className="am-j-form__grid">
              {quoteForm.fields.map((field) => (
                <QuoteFormFieldInput key={field.key} field={field} chooseLabel={t("choose")} requiredLabel={forms("required")} />
              ))}
            </div>
          </QuoteSection>
        ) : null}

        <QuoteSection index={quoteForm.fields.length > 0 ? 3 : 2} legend={t("consentLegend")}>
          {/* Consent boxes are never pre-ticked: consent is given, never withdrawn. */}
          <div className="am-j-consents">
            <label className="am-j-consent" htmlFor="am-quote-consent">
              <input id="am-quote-consent" name="consent" type="checkbox" required />
              <span>{t("consentLabel")}</span>
            </label>
            <label className="am-j-consent" htmlFor="am-quote-multi-broker">
              <input id="am-quote-multi-broker" name="multiBroker" type="checkbox" />
              <span>{t("multiBrokerLabel")}</span>
            </label>
          </div>
          <div className="am-j-tail">
            <IndicativeOfferNotice />
          </div>
        </QuoteSection>

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

        <div className="am-j-form__footer">
          <Button type="submit" size="lg" loading={pending} disabled={pending} icon={<Icon name="send" size={18} />}>
            {t("submit")}
          </Button>
          <p className="am-j-fineprint">{t("fineprint")}</p>
        </div>
      </form>

      {/* Optional assistance, deliberately outside the form: it never blocks or gates the request.
          `am-j-optional` folds the whole panel away while no assistant is available for this
          country and product, so the heading never sits above an empty box. */}
      <section className="am-j-panel am-j-optional" aria-label={t("assistanceTitle")}>
        <div className="am-j-panel__head">
          <IconTile name="bot" size="lg" />
          <h2 className="am-j-panel__title">{t("assistanceTitle")}</h2>
        </div>
        <p className="am-j-panel__lead">{t("assistanceLead")}</p>
        <div className="am-j-assist">
          <VisitorAiAssistant countryCode={countryCode} productKey={productKey} mode="summary" answers={{}} />
          <VisitorAiAssistant countryCode={countryCode} productKey={productKey} mode="consistency" answers={{}} />
        </div>
      </section>
    </div>
  );
}

export function QuoteBlockedState() {
  const t = useTranslations("QuoteForm");
  return <EmptyState icon="lock" tone="muted" align="center" title={t("blocked.title")} description={t("blocked.description")} />;
}
