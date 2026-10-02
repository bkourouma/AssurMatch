"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Link } from "../../i18n/navigation";
import { submitPublicQuoteRequest, type PublicQuoteFormField, type PublicQuoteFormState } from "../lib/public-api";
import { VisitorAiAssistant } from "./visitor-ai-assistant";
import { BackendText } from "./ui/backend-text";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty-state";
import { Field, fieldControlProps } from "./ui/field";
import { Icon } from "./ui/icons";
import { IconTile } from "./ui/icon-tile";
import { Notice } from "./ui/notice";
import { ProgressBar } from "./ui/progress-bar";
import "../styles/pages/quote.css";

/** Identity of the broker resolved for a preselected offer (spec 050, decision D4). */
export interface ResponsibleBrokerInfo {
  name: string;
  licenceNumber?: string;
  issuingAuthority?: string;
}

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

/** Discreet "(optional)" marker after the label of every non-required field (content/06 2.11). */
function withOptionalTag(label: string, required: boolean, optionalTag: string): string {
  return required ? label : `${label} (${optionalTag})`;
}

function QuoteFormFieldInput({
  field,
  chooseLabel,
  requiredLabel,
  optionalTag,
  error
}: {
  field: PublicQuoteFormField;
  chooseLabel: string;
  requiredLabel: string;
  optionalTag: string;
  error?: string | undefined;
}) {
  const name = `answer_${field.key}`;
  const id = `am-answer-${field.key}`;
  const label = withOptionalTag(field.label, field.required, optionalTag);

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
      <Field id={id} label={label} required={field.required} requiredLabel={requiredLabel} error={error}>
        <select {...fieldControlProps(id, { required: field.required, error })} name={name} defaultValue="">
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
    <Field id={id} label={label} required={field.required} requiredLabel={requiredLabel} error={error}>
      <input {...fieldControlProps(id, { required: field.required, error })} name={name} type={inputType} />
    </Field>
  );
}

/** Numbered heading of a step: focus lands here after "Continuer" so a screen reader announces it. */
function StepHeading({ index, legend, headingRef }: { index: number; legend: string; headingRef?: RefObject<HTMLHeadingElement | null> }) {
  return (
    <legend className="am-j-form__legend">
      <span className="am-j-form__step am-tabular" aria-hidden="true">
        {index}
      </span>
      <h2 className="am-quote-step__title" tabIndex={-1} ref={headingRef}>
        {legend}
      </h2>
    </legend>
  );
}

type ReviewRow = { label: string; value: string };

interface ResponsibleBrokerBlockProps {
  broker?: ResponsibleBrokerInfo | undefined;
  hasSelectedOffer: boolean;
  productName: string;
  countryName: string;
}

/** D4: the broker who will confirm the offer is named before the consent box whenever it is knowable. */
function ResponsibleBrokerBlock({ broker, hasSelectedOffer, productName, countryName }: ResponsibleBrokerBlockProps) {
  const t = useTranslations("QuoteForm");
  if (!hasSelectedOffer) {
    return <p>{t("brokerConfirm.routing", { product: productName, country: countryName })}</p>;
  }
  if (broker?.licenceNumber && broker.issuingAuthority) {
    return (
      <p>
        <BackendText>
          {t("brokerConfirm.resolved", { name: broker.name, licence: broker.licenceNumber, authority: broker.issuingAuthority })}
        </BackendText>
      </p>
    );
  }
  if (broker?.name) {
    return (
      <p>
        <BackendText>{t("brokerConfirm.namedOnly", { name: broker.name })}</BackendText>
      </p>
    );
  }
  return <p>{t("preselected.generic")}</p>;
}

export function QuoteFormShell({
  countryCode,
  productKey,
  countryName,
  productName,
  quoteForm,
  selectedOfferId,
  responsibleBroker,
  formAction
}: {
  countryCode: string;
  productKey: string;
  countryName: string;
  productName: string;
  quoteForm: PublicQuoteFormState;
  selectedOfferId?: string | undefined;
  responsibleBroker?: ResponsibleBrokerInfo | undefined;
  /**
   * Server action bound to this country/product/offer (spec 050, decision D6): the browser's native
   * submission of this form invokes it, so a visitor without JavaScript still sends a real request.
   * When JavaScript runs, `onSubmit` below calls `preventDefault()` before the browser gets to use it.
   */
  formAction?: ((formData: FormData) => Promise<void>) | undefined;
}) {
  const t = useTranslations("QuoteForm");
  const forms = useTranslations("Forms");
  const formRef = useRef<HTMLFormElement>(null);
  const needHeadingRef = useRef<HTMLHeadingElement>(null);
  const contactHeadingRef = useRef<HTMLHeadingElement>(null);
  const verifyHeadingRef = useRef<HTMLHeadingElement>(null);

  // Progressive enhancement (D6): both flip to their real value only after hydration, so a visitor
  // without JavaScript sees every fieldset stacked on one page, exactly as the no-JS fallback promises.
  const [jsEnabled, setJsEnabled] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [needErrors, setNeedErrors] = useState<Record<string, string>>({});
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<{ need: ReviewRow[]; name: string; email: string; phone: string } | null>(null);
  const [result, setResult] = useState<{ status: "idle" | "submitting" | "success" | "error"; message?: string; publicReference?: string; verificationToken?: string }>({ status: "idle" });

  useEffect(() => {
    setJsEnabled(true);
  }, []);

  useEffect(() => {
    const target = step === 1 ? needHeadingRef.current : step === 2 ? contactHeadingRef.current : verifyHeadingRef.current;
    target?.focus();
  }, [step]);

  /** Returns the fresh error map (never the possibly-stale state) so a caller can branch on it immediately. */
  function validateNeed(): Record<string, string> {
    if (!formRef.current) return {};
    const formData = new FormData(formRef.current);
    const errors: Record<string, string> = {};
    for (const field of quoteForm.fields) {
      if (!field.required || field.type === "checkbox") continue;
      const raw = formData.get(`answer_${field.key}`);
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value) errors[field.key] = forms("fieldRequired");
    }
    setNeedErrors(errors);
    return errors;
  }

  function validateContact(): Record<string, string> {
    if (!formRef.current) return {};
    const formData = new FormData(formRef.current);
    const errors: Record<string, string> = {};
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    if (!email) errors.email = forms("fieldRequired");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = forms("invalidEmail");
    if (!phone) errors.phone = forms("fieldRequired");
    else if (!/^[0-9+()\-\s]{6,}$/.test(phone)) errors.phone = forms("invalidPhone");
    setContactErrors(errors);
    return errors;
  }

  function buildReview(): { need: ReviewRow[]; name: string; email: string; phone: string } | null {
    if (!formRef.current) return null;
    const formData = new FormData(formRef.current);
    const need: ReviewRow[] = quoteForm.fields
      .filter((field) => field.type !== "checkbox")
      .map((field) => {
        const raw = formData.get(`answer_${field.key}`);
        const value = typeof raw === "string" ? raw.trim() : "";
        return { label: field.label, value: value || t("reviewEmpty") };
      });
    return {
      need,
      name: String(formData.get("displayName") ?? "").trim() || t("reviewEmpty"),
      email: String(formData.get("email") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim()
    };
  }

  /** Accessibility (content/06 2.12): a failed step validation moves focus to the first invalid field. */
  function focusFirstInvalidField(names: string[]) {
    if (!formRef.current) return;
    for (const name of names) {
      const el = formRef.current.elements.namedItem(name);
      if (el instanceof HTMLElement) {
        el.focus();
        return;
      }
    }
  }

  function goToStep2() {
    const errors = validateNeed();
    if (Object.keys(errors).length > 0) {
      focusFirstInvalidField(Object.keys(errors).map((key) => `answer_${key}`));
      return;
    }
    setStep(2);
  }

  function goToStep1() {
    setStep(1);
  }

  function goToStep2FromReview() {
    setStep(2);
  }

  function goToReview() {
    const errors = validateContact();
    if (Object.keys(errors).length > 0) {
      focusFirstInvalidField(["email", "phone"].filter((name) => name in errors));
      return;
    }
    setReview(buildReview());
    setStep(3);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const needIssues = validateNeed();
    const contactIssues = validateContact();
    if (Object.keys(needIssues).length > 0 || Object.keys(contactIssues).length > 0) {
      // A field left blank while the visitor jumped straight to consent (e.g. keyboard "Enter"):
      // send them back to the first step in error rather than submitting an incomplete request.
      setStep(Object.keys(needIssues).length > 0 ? 1 : 2);
      return;
    }
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
    { label: t("steps.need") },
    { label: t("steps.contact") },
    { label: t("steps.consent") },
    { label: t("steps.confirmation") }
  ];
  const current = sent ? steps.length : step;
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
          {result.message ? (
            <p className="am-j-fineprint">
              <BackendText>{result.message}</BackendText>
            </p>
          ) : null}
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

  const hasSelectedOffer = Boolean(selectedOfferId);
  const preselectedNotice = !hasSelectedOffer
    ? t("preselected.routing", { product: productName, country: countryName })
    : responsibleBroker?.licenceNumber
      ? t("preselected.resolved", { name: responsibleBroker.name, licence: responsibleBroker.licenceNumber })
      : responsibleBroker?.name
        ? t("preselected.namedOnly", { name: responsibleBroker.name })
        : t("preselected.generic");

  return (
    <div className="am-stack am-stack--xl">
      {stepper}
      <form
        ref={formRef}
        className="am-j-form am-quote-form"
        onSubmit={submit}
        {...(formAction ? { action: formAction } : {})}
      >
        {/* Step 1 - Votre besoin */}
        <fieldset className="am-quote-step" hidden={jsEnabled && step !== 1}>
          <StepHeading index={1} legend={t("steps.need")} headingRef={needHeadingRef} />
          <p className="am-j-panel__lead">{t("needIntro")}</p>
          <Notice tone="indicative">
            <BackendText>{preselectedNotice}</BackendText>
          </Notice>
          {quoteForm.fields.length > 0 ? (
            <div className="am-stack">
              <p className="am-j-panel__lead">{t("fieldsIntro")}</p>
              <div className="am-j-form__grid">
                {quoteForm.fields.map((field) => (
                  <QuoteFormFieldInput
                    key={field.key}
                    field={field}
                    chooseLabel={t("choose")}
                    requiredLabel={forms("required")}
                    optionalTag={t("optionalTag")}
                    error={needErrors[field.key]}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {jsEnabled ? (
            <div className="am-quote-nav">
              <Button type="button" size="lg" onClick={goToStep2} iconAfter={<Icon name="arrow-right" size={18} />}>
                {t("continueLabel")}
              </Button>
            </div>
          ) : null}
        </fieldset>

        {/* Step 2 - Vos coordonnees */}
        <fieldset className="am-quote-step" hidden={jsEnabled && step !== 2}>
          <StepHeading index={2} legend={t("steps.contact")} headingRef={contactHeadingRef} />
          <p className="am-j-panel__lead">{t("contactIntro")}</p>
          <div className="am-j-form__grid">
            <Field id="am-quote-name" label={withOptionalTag(t("name"), false, t("optionalTag"))} hint={t("nameHint")} leading="user">
              <input
                {...fieldControlProps("am-quote-name", { hint: t("nameHint") })}
                name="displayName"
                autoComplete="name"
              />
            </Field>
            <Field
              id="am-quote-email"
              label={t("email")}
              hint={t("emailHint")}
              required
              requiredLabel={forms("required")}
              leading="mail"
              error={contactErrors.email}
            >
              <input
                {...fieldControlProps("am-quote-email", { hint: t("emailHint"), required: true, error: contactErrors.email })}
                name="email"
                type="email"
                autoComplete="email"
              />
            </Field>
            <Field
              id="am-quote-phone"
              label={t("phone")}
              hint={t("phoneHint")}
              required
              requiredLabel={forms("required")}
              leading="phone"
              error={contactErrors.phone}
            >
              <input
                {...fieldControlProps("am-quote-phone", { hint: t("phoneHint"), required: true, error: contactErrors.phone })}
                name="phone"
                type="tel"
                autoComplete="tel"
              />
            </Field>
          </div>
          {jsEnabled ? (
            <div className="am-quote-nav">
              <Button type="button" variant="secondary" onClick={goToStep1} icon={<Icon name="arrow-left" size={18} />}>
                {t("backLabel")}
              </Button>
              <Button type="button" size="lg" onClick={goToReview} iconAfter={<Icon name="arrow-right" size={18} />}>
                {t("verifyLabel")}
              </Button>
            </div>
          ) : null}
        </fieldset>

        {/* Step 3 - Verification et consentement */}
        <fieldset className="am-quote-step" hidden={jsEnabled && step !== 3}>
          <StepHeading index={3} legend={t("steps.consent")} headingRef={verifyHeadingRef} />

          {jsEnabled && review ? (
            <div className="am-quote-review">
              <p className="am-j-panel__lead">{t("verifyIntro")}</p>
              <div className="am-quote-review__section">
                <div className="am-quote-review__head">
                  <h3>{t("reviewNeedTitle")}</h3>
                  <button type="button" className="am-quote-review__edit" onClick={goToStep1}>
                    {t("reviewEdit")}
                  </button>
                </div>
                {review.need.length > 0 ? (
                  <dl className="am-quote-review__list">
                    {review.need.map((row) => (
                      <div className="am-quote-review__row" key={row.label}>
                        <dt>
                          <BackendText>{row.label}</BackendText>
                        </dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
              <div className="am-quote-review__section">
                <div className="am-quote-review__head">
                  <h3>{t("reviewContactTitle")}</h3>
                  <button type="button" className="am-quote-review__edit" onClick={goToStep2FromReview}>
                    {t("reviewEdit")}
                  </button>
                </div>
                <dl className="am-quote-review__list">
                  <div className="am-quote-review__row">
                    <dt>{t("name")}</dt>
                    <dd>{review.name}</dd>
                  </div>
                  <div className="am-quote-review__row">
                    <dt>{t("email")}</dt>
                    <dd>{review.email}</dd>
                  </div>
                  <div className="am-quote-review__row">
                    <dt>{t("phone")}</dt>
                    <dd>{review.phone}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}

          {/* D4: the responsible broker is named before consent whenever the offer makes it knowable. */}
          <div className="am-j-block">
            <h3 className="am-quote-broker__title">{t("brokerTitle")}</h3>
            <ResponsibleBrokerBlock
              broker={responsibleBroker}
              hasSelectedOffer={hasSelectedOffer}
              productName={productName}
              countryName={countryName}
            />
          </div>

          <Notice tone="indicative" role="note">
            <p>{t("transmissionNotice")}</p>
            <p>
              <Link href="/our-commitment">{t("commitmentLink")}</Link>
            </p>
          </Notice>

          <div className="am-stack">
            <h3 className="am-quote-broker__title">{t("consentLegend")}</h3>
            <p className="am-j-panel__lead">{t("consentIntro")}</p>
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
          </div>

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
            {jsEnabled ? (
              <div className="am-quote-nav am-quote-nav--send">
                <Button type="button" variant="secondary" onClick={goToStep2} icon={<Icon name="arrow-left" size={18} />}>
                  {t("backLabel")}
                </Button>
                <Button type="submit" size="lg" loading={pending} disabled={pending} icon={<Icon name="send" size={18} />}>
                  {t("submit")}
                </Button>
              </div>
            ) : (
              <Button type="submit" size="lg" loading={pending} disabled={pending} icon={<Icon name="send" size={18} />}>
                {t("submit")}
              </Button>
            )}
            <p className="am-j-fineprint">{t("fineprint")}</p>
          </div>
        </fieldset>
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
