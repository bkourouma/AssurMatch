"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "../../../i18n/navigation";
import { toLocale } from "../../../i18n/routing";
import { track } from "../../lib/analytics";
import { submitPartnerApplication, type PartnerApplicationSubmission } from "../../lib/public-api";
import { Button } from "../ui/button";
import { Divider } from "../ui/divider";
import { Field, fieldControlProps } from "../ui/field";
import { Icon } from "../ui/icons";
import { Notice } from "../ui/notice";
import { ProgressBar } from "../ui/progress-bar";
import { RadioCards, type RadioCardOption } from "../ui/radio-cards";

export interface PartnerApplicationCountryOption {
  isoCode: string;
  name: string;
}

export interface PartnerApplicationProductOption {
  key: string;
  name: string;
}

/**
 * Labels are passed in rather than read with `useTranslations`: the `BrokerApply` namespace is not
 * part of the client bundle the locale layout declares (only QuoteForm, VisitorAi, DocumentUpload,
 * Journey, Api, Common and Forms are), so the server page resolves the copy and this boundary only
 * ships the interaction. Mirrors the pattern used by `waitlist-form.tsx` and `contact-form.tsx`.
 *
 * Spec 050 D6: the form is a 4-step wizard on the client, and exactly the same fieldsets rendered one
 * after another - no JavaScript required - when the step controller never mounts. `progress` and
 * `review` are only ever read once a script runs (see `styles/brokers.css` for the CSS gate), so their
 * strings never appear in the no-JS fallback either.
 */
export interface PartnerApplicationFormLabels {
  legalName: string;
  legalNameHint: string;
  tradeName: string;
  tradeNameHint: string;
  country: string;
  countryHint: string;
  countryPlaceholder: string;
  /** Section 1: "Société" - the company's identity. */
  identityLegend: string;
  /** Section 3: "Agrément et capacité" - the licence, the products and the monthly capacity. */
  licenceLegend: string;
  licenceIntro: string;
  licenseNumber: string;
  licenseNumberHint: string;
  licenseExpiresAt: string;
  licenseExpiresAtHint: string;
  licenseIssuingAuthority: string;
  licenseIssuingAuthorityHint: string;
  productsLegend: string;
  productsHint: string;
  productsNone: string;
  monthlyCapacity: string;
  monthlyCapacityHint: string;
  /** Section 2: "Contact". */
  contactLegend: string;
  contactName: string;
  contactNameHint: string;
  contactEmail: string;
  contactEmailHint: string;
  contactPhone: string;
  contactPhoneHint: string;
  whatsapp: string;
  whatsappHint: string;
  planLegend: string;
  planHint: string;
  /** Section 4: "Formule et consentement" - the desired plan, the message and the consent line. */
  messageLegend: string;
  message: string;
  messageHint: string;
  consent: string;
  website: string;
  submit: string;
  submitting: string;
  continueLabel: string;
  backLabel: string;
  review: {
    editLabel: string;
    societyTitle: string;
    contactTitle: string;
    licenceTitle: string;
  };
  progress: {
    navLabel: string;
    /** Four short section titles shown next to each circle: "Societe", "Contact", … */
    sectionTitles: readonly string[];
    /** Four accessible sentences, "Etape 1 sur 4" to "Etape 4 sur 4", one per step. */
    stepLabels: readonly string[];
  };
  errors: {
    required: string;
    licenseExpiresAtFuture: string;
    invalidEmail: string;
    invalidPhone: string;
    productsRequired: string;
    consentRequired: string;
    generic: string;
    rateLimited: string;
    countryClosed: string;
    network: string;
  };
}

export interface PartnerApplicationFormProps {
  countries: readonly PartnerApplicationCountryOption[];
  /** Products of every selectable country, keyed by ISO code, so switching country needs no fetch. */
  productsByCountry: Readonly<Record<string, readonly PartnerApplicationProductOption[]>>;
  plans: readonly RadioCardOption[];
  labels: PartnerApplicationFormLabels;
  defaultCountry?: string;
  /** Preselects a plan from `?formule=<key>` on `/brokers/apply` (linked from the pricing cards). */
  defaultPlan?: string;
  /**
   * Server action bound in `brokers/apply/page.tsx` (spec 050, decision D6): the browser's native
   * submission of this form invokes it, so a visitor without JavaScript still sends a real application
   * instead of a GET carrying their name, e-mail, phone and licence number in the URL. Without
   * JavaScript every fieldset above is visible at once (see the class comment), so this single-shot
   * submission carries every field the wizard collects across its four steps. When JavaScript runs,
   * `handleSubmit` below calls `preventDefault()` before the browser gets to use it.
   */
  formAction?: ((formData: FormData) => Promise<void>) | undefined;
}

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOTAL_STEPS = 4;

type FieldName =
  | "legalName"
  | "countryCode"
  | "licenseNumber"
  | "licenseExpiresAt"
  | "productKeys"
  | "monthlyCapacity"
  | "contactName"
  | "contactEmail"
  | "contactPhone"
  | "whatsapp"
  | "desiredPlan"
  | "consent";

type FieldErrors = Partial<Record<FieldName, string>>;

/** Which fields belong to which step, so "Continuer" only validates the step being left. */
const STEP_FIELDS: Record<number, readonly FieldName[]> = {
  1: ["legalName", "countryCode"],
  2: ["contactName", "contactEmail", "contactPhone", "whatsapp"],
  3: ["licenseNumber", "licenseExpiresAt", "productKeys", "monthlyCapacity"],
  4: ["desiredPlan", "consent"]
};

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

interface ReviewSnapshot {
  legalName: string;
  tradeName: string;
  countryName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  whatsapp: string;
  licenseNumber: string;
  licenseExpiresAt: string;
  licenseIssuingAuthority: string;
  productNames: readonly string[];
  monthlyCapacity: string;
}

function readValues(formData: FormData) {
  return {
    legalName: String(formData.get("legalName") ?? "").trim(),
    tradeName: String(formData.get("tradeName") ?? "").trim(),
    selectedCountry: String(formData.get("countryCode") ?? "").trim(),
    licenseNumber: String(formData.get("licenseNumber") ?? "").trim(),
    licenseExpiresAt: String(formData.get("licenseExpiresAt") ?? "").trim(),
    licenseIssuingAuthority: String(formData.get("licenseIssuingAuthority") ?? "").trim(),
    productKeys: formData.getAll("productKeys").map((value) => String(value)).filter(Boolean),
    monthlyCapacityRaw: String(formData.get("monthlyCapacity") ?? "").trim(),
    contactName: String(formData.get("contactName") ?? "").trim(),
    contactEmail: String(formData.get("contactEmail") ?? "").trim(),
    contactPhone: String(formData.get("contactPhone") ?? "").trim(),
    whatsapp: String(formData.get("whatsapp") ?? "").trim(),
    desiredPlan: String(formData.get("desiredPlan") ?? "").trim(),
    message: String(formData.get("message") ?? "").trim(),
    consent: formData.get("consent") === "on",
    website: String(formData.get("website") ?? "").trim()
  };
}

function validateAll(values: ReturnType<typeof readValues>, labels: PartnerApplicationFormLabels): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.legalName) errors.legalName = labels.errors.required;
  if (!values.selectedCountry) errors.countryCode = labels.errors.required;
  if (!values.licenseNumber) errors.licenseNumber = labels.errors.required;
  if (!values.licenseExpiresAt) {
    errors.licenseExpiresAt = labels.errors.required;
  } else {
    const expiry = new Date(`${values.licenseExpiresAt}T00:00:00.000Z`);
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      errors.licenseExpiresAt = labels.errors.licenseExpiresAtFuture;
    }
  }
  if (values.productKeys.length === 0) errors.productKeys = labels.errors.productsRequired;
  const monthlyCapacity = Number(values.monthlyCapacityRaw);
  if (!values.monthlyCapacityRaw || !Number.isInteger(monthlyCapacity) || monthlyCapacity < 1) {
    errors.monthlyCapacity = labels.errors.required;
  }
  if (!values.contactName) errors.contactName = labels.errors.required;
  if (!values.contactEmail || !EMAIL_PATTERN.test(values.contactEmail)) errors.contactEmail = labels.errors.invalidEmail;
  if (!values.contactPhone || !PHONE_PATTERN.test(values.contactPhone)) errors.contactPhone = labels.errors.invalidPhone;
  if (values.whatsapp && !PHONE_PATTERN.test(values.whatsapp)) errors.whatsapp = labels.errors.invalidPhone;
  if (!values.desiredPlan) errors.desiredPlan = labels.errors.required;
  if (!values.consent) errors.consent = labels.errors.consentRequired;
  return errors;
}

/**
 * Broker acquisition form (spec 050 D6, D7). Submits exactly the shared `partnerApplicationCreateSchema`
 * input: an application only ever records evidence of intent for the compliance team to review, it
 * never activates a partner. On success the visitor is sent to the dedicated confirmation page with
 * only the public reference in the URL - never a name, an e-mail or a phone number.
 *
 * The 4 fieldsets are always in the DOM, in document order, exactly as the no-JS fallback needs them:
 * `styles/brokers.css` hides everything the wizard does not need (other steps, the progress bar, the
 * continue/back controls) behind `html[data-js="true"]`, an attribute this component sets on mount
 * alongside every other progressive-enhancement boundary in the app (`Reveal`, `AutoSubmit`). Without
 * JavaScript that attribute never appears, so every rule stays inactive and the visitor sees the same
 * one-page form as before spec 050, ending on the same "Envoyer ma candidature" button.
 */
export function PartnerApplicationForm({ countries, productsByCountry, plans, labels, defaultCountry, defaultPlan, formAction }: PartnerApplicationFormProps) {
  const initialCountry = defaultCountry && productsByCountry[defaultCountry] ? defaultCountry : (countries[0]?.isoCode ?? "");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Generated once per mounted form, so a reload is a new session for the abuse guard.
  const [sessionId] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : ""));
  const [countryCode, setCountryCode] = useState(initialCountry);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<FormState>({ status: "idle" });
  /** Spec 047: the language of the page, not of the browser, decides the confirmation e-mail. */
  const locale = toLocale(useLocale());
  const [currentStep, setCurrentStep] = useState(1);
  const [reviewSnapshot, setReviewSnapshot] = useState<ReviewSnapshot | null>(null);

  useEffect(() => {
    document.documentElement.dataset["js"] = "true";
  }, []);

  const products = useMemo(() => productsByCountry[countryCode] ?? [], [productsByCountry, countryCode]);

  function buildSnapshot(values: ReturnType<typeof readValues>): ReviewSnapshot {
    const countryName = countries.find((country) => country.isoCode === values.selectedCountry)?.name ?? values.selectedCountry;
    const countryProducts = productsByCountry[values.selectedCountry] ?? [];
    const productNames = values.productKeys.map((key) => countryProducts.find((product) => product.key === key)?.name ?? key);
    return {
      legalName: values.legalName,
      tradeName: values.tradeName,
      countryName,
      contactName: values.contactName,
      contactEmail: values.contactEmail,
      contactPhone: values.contactPhone,
      whatsapp: values.whatsapp,
      licenseNumber: values.licenseNumber,
      licenseExpiresAt: values.licenseExpiresAt,
      licenseIssuingAuthority: values.licenseIssuingAuthority,
      productNames,
      monthlyCapacity: values.monthlyCapacityRaw
    };
  }

  function goToStep(step: number) {
    setCurrentStep(step);
    formRef.current?.querySelector<HTMLElement>(`[data-step-panel="${step}"] legend`)?.focus();
  }

  function advance() {
    const form = formRef.current;
    if (!form) return;
    const values = readValues(new FormData(form));
    const allErrors = validateAll(values, labels);
    const stepKeys = STEP_FIELDS[currentStep] ?? [];
    const stepErrors: FieldErrors = {};
    for (const key of stepKeys) {
      if (allErrors[key]) stepErrors[key] = allErrors[key];
    }
    if (Object.keys(stepErrors).length > 0) {
      setFieldErrors((previous) => ({ ...previous, ...stepErrors }));
      setState({ status: "error", message: labels.errors.generic });
      return;
    }
    setFieldErrors((previous) => {
      const next = { ...previous };
      for (const key of stepKeys) delete next[key];
      return next;
    });
    setState({ status: "idle" });
    if (currentStep === 3) setReviewSnapshot(buildSnapshot(values));
    goToStep(Math.min(currentStep + 1, TOTAL_STEPS));
  }

  async function finalSubmit(form: HTMLFormElement) {
    const values = readValues(new FormData(form));
    const errors = validateAll(values, labels);

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setState({ status: "error", message: labels.errors.generic });
      // Send the visitor back to the first step that still has an error.
      const firstInvalidStep = [1, 2, 3, 4].find((step) => (STEP_FIELDS[step] ?? []).some((key) => errors[key]));
      if (firstInvalidStep) goToStep(firstInvalidStep);
      return;
    }

    setFieldErrors({});
    setState({ status: "submitting" });

    // `PartnerApplicationSubmission` is the shared contract input: sending exactly this shape is
    // what keeps this form compatible with POST /partners/applications once it is deployed.
    const payload: PartnerApplicationSubmission = {
      legalName: values.legalName,
      countryCode: values.selectedCountry,
      licenseNumber: values.licenseNumber,
      licenseExpiresAt: values.licenseExpiresAt,
      productKeys: values.productKeys,
      monthlyCapacity: Number(values.monthlyCapacityRaw),
      contactName: values.contactName,
      contactEmail: values.contactEmail,
      contactPhone: values.contactPhone,
      desiredPlan: values.desiredPlan as PartnerApplicationSubmission["desiredPlan"],
      consent: true,
      website: values.website,
      sessionId,
      locale,
      ...(values.tradeName ? { tradeName: values.tradeName } : {}),
      ...(values.licenseIssuingAuthority ? { licenseIssuingAuthority: values.licenseIssuingAuthority } : {}),
      ...(values.whatsapp ? { whatsapp: values.whatsapp } : {}),
      ...(values.message ? { message: values.message } : {})
    };

    const result = await submitPartnerApplication(payload);

    if (result.status === "success" && result.publicReference) {
      track("partner_application_submitted", { country: values.selectedCountry, plan: values.desiredPlan });
      // Spec 050 D7: only the public reference travels to the confirmation page, as a query
      // parameter - never a name, an e-mail or a phone number.
      router.push({ pathname: "/brokers/apply/confirmation", query: { reference: result.publicReference } });
      return;
    }

    if (result.status === "rate_limited") {
      setState({ status: "error", message: labels.errors.rateLimited });
      return;
    }
    if (result.error === "api_422") {
      setState({ status: "error", message: labels.errors.countryClosed });
      return;
    }
    if (result.messageKey === "apiUnavailable") {
      setState({ status: "error", message: labels.errors.network });
      return;
    }
    setState({ status: "error", message: result.publicMessage || labels.errors.generic });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentStep < TOTAL_STEPS) {
      advance();
      return;
    }
    void finalSubmit(event.currentTarget);
  }

  const submitting = state.status === "submitting";

  return (
    <form className="am-formcard" data-stepped="true" onSubmit={handleSubmit} noValidate ref={formRef} {...(formAction ? { action: formAction } : {})}>
      <div className="am-formstepper__progress">
        <ProgressBar
          steps={labels.progress.sectionTitles.map((label) => ({ label }))}
          current={currentStep}
          label={labels.progress.navLabel}
          stepLabel={labels.progress.stepLabels[currentStep - 1] ?? ""}
        />
      </div>

      <fieldset className="am-formstepper__panel" data-step-panel="1" data-step-active={String(currentStep === 1)}>
        <legend className="am-formsection__legend" tabIndex={-1}>
          <span className="am-formsection__index" aria-hidden="true">
            1
          </span>
          {labels.identityLegend}
        </legend>
        <div className="am-formcard__grid">
          <Field
            id="am-apply-legalname"
            label={labels.legalName}
            hint={labels.legalNameHint}
            required
            {...(fieldErrors.legalName ? { error: fieldErrors.legalName } : {})}
          >
            <input
              {...fieldControlProps("am-apply-legalname", { hint: labels.legalNameHint, error: fieldErrors.legalName, required: true })}
              name="legalName"
              autoComplete="organization"
              maxLength={160}
            />
          </Field>
          <Field id="am-apply-tradename" label={labels.tradeName} hint={labels.tradeNameHint}>
            <input {...fieldControlProps("am-apply-tradename", { hint: labels.tradeNameHint })} name="tradeName" maxLength={160} />
          </Field>
          <Field
            id="am-apply-country"
            label={labels.country}
            hint={labels.countryHint}
            required
            {...(fieldErrors.countryCode ? { error: fieldErrors.countryCode } : {})}
          >
            <select
              {...fieldControlProps("am-apply-country", { hint: labels.countryHint, error: fieldErrors.countryCode, required: true })}
              name="countryCode"
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
            >
              <option value="" disabled>
                {labels.countryPlaceholder}
              </option>
              {countries.map((country) => (
                <option key={country.isoCode} value={country.isoCode}>
                  {country.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="am-cluster">
          <span className="am-formstepper__navitem" data-role="continue" data-step-active="true">
            <Button type="submit">{labels.continueLabel}</Button>
          </span>
        </div>
      </fieldset>

      <Divider />

      <fieldset className="am-formstepper__panel" data-step-panel="2" data-step-active={String(currentStep === 2)}>
        <legend className="am-formsection__legend" tabIndex={-1}>
          <span className="am-formsection__index" aria-hidden="true">
            2
          </span>
          {labels.contactLegend}
        </legend>
        <div className="am-formcard__grid">
          <Field
            id="am-apply-contactname"
            label={labels.contactName}
            hint={labels.contactNameHint}
            required
            {...(fieldErrors.contactName ? { error: fieldErrors.contactName } : {})}
          >
            <input
              {...fieldControlProps("am-apply-contactname", { hint: labels.contactNameHint, error: fieldErrors.contactName, required: true })}
              name="contactName"
              autoComplete="name"
              maxLength={120}
            />
          </Field>
          <Field
            id="am-apply-contactemail"
            label={labels.contactEmail}
            hint={labels.contactEmailHint}
            required
            {...(fieldErrors.contactEmail ? { error: fieldErrors.contactEmail } : {})}
          >
            <input
              {...fieldControlProps("am-apply-contactemail", { hint: labels.contactEmailHint, error: fieldErrors.contactEmail, required: true })}
              name="contactEmail"
              type="email"
              autoComplete="email"
            />
          </Field>
          <Field
            id="am-apply-contactphone"
            label={labels.contactPhone}
            hint={labels.contactPhoneHint}
            required
            {...(fieldErrors.contactPhone ? { error: fieldErrors.contactPhone } : {})}
          >
            <input
              {...fieldControlProps("am-apply-contactphone", {
                hint: labels.contactPhoneHint,
                error: fieldErrors.contactPhone,
                required: true
              })}
              name="contactPhone"
              type="tel"
              autoComplete="tel"
            />
          </Field>
          <Field id="am-apply-whatsapp" label={labels.whatsapp} hint={labels.whatsappHint} {...(fieldErrors.whatsapp ? { error: fieldErrors.whatsapp } : {})}>
            <input
              {...fieldControlProps("am-apply-whatsapp", { hint: labels.whatsappHint, error: fieldErrors.whatsapp })}
              name="whatsapp"
              type="tel"
            />
          </Field>
        </div>
        <div className="am-cluster">
          <span className="am-formstepper__navitem" data-role="back" data-step-active="true">
            <Button type="button" variant="tertiary" onClick={() => goToStep(1)}>
              {labels.backLabel}
            </Button>
          </span>
          <span className="am-formstepper__navitem" data-role="continue" data-step-active="true">
            <Button type="submit">{labels.continueLabel}</Button>
          </span>
        </div>
      </fieldset>

      <Divider />

      <fieldset className="am-formstepper__panel" data-step-panel="3" data-step-active={String(currentStep === 3)}>
        <legend className="am-formsection__legend" tabIndex={-1}>
          <span className="am-formsection__index" aria-hidden="true">
            3
          </span>
          {labels.licenceLegend}
        </legend>
        <p className="am-field__hint">{labels.licenceIntro}</p>
        <div className="am-formcard__grid">
          <Field
            id="am-apply-licensenumber"
            label={labels.licenseNumber}
            hint={labels.licenseNumberHint}
            required
            {...(fieldErrors.licenseNumber ? { error: fieldErrors.licenseNumber } : {})}
          >
            <input
              {...fieldControlProps("am-apply-licensenumber", { hint: labels.licenseNumberHint, error: fieldErrors.licenseNumber, required: true })}
              name="licenseNumber"
              maxLength={64}
            />
          </Field>
          <Field
            id="am-apply-licenseexpires"
            label={labels.licenseExpiresAt}
            hint={labels.licenseExpiresAtHint}
            required
            {...(fieldErrors.licenseExpiresAt ? { error: fieldErrors.licenseExpiresAt } : {})}
          >
            <input
              {...fieldControlProps("am-apply-licenseexpires", {
                hint: labels.licenseExpiresAtHint,
                error: fieldErrors.licenseExpiresAt,
                required: true
              })}
              name="licenseExpiresAt"
              type="date"
            />
          </Field>
          <Field id="am-apply-issuingauthority" label={labels.licenseIssuingAuthority} hint={labels.licenseIssuingAuthorityHint}>
            <input
              {...fieldControlProps("am-apply-issuingauthority", { hint: labels.licenseIssuingAuthorityHint })}
              name="licenseIssuingAuthority"
              maxLength={160}
            />
          </Field>
          <Field
            id="am-apply-capacity"
            label={labels.monthlyCapacity}
            hint={labels.monthlyCapacityHint}
            required
            {...(fieldErrors.monthlyCapacity ? { error: fieldErrors.monthlyCapacity } : {})}
          >
            <input
              {...fieldControlProps("am-apply-capacity", {
                hint: labels.monthlyCapacityHint,
                error: fieldErrors.monthlyCapacity,
                required: true
              })}
              name="monthlyCapacity"
              type="number"
              min={1}
              max={10000}
              step={1}
            />
          </Field>
        </div>

        <div className="am-field">
          <span className="am-field__label">{labels.productsLegend}</span>
          <p className="am-field__hint">{labels.productsHint}</p>
          {products.length > 0 ? (
            <div className="am-formcard__products">
              {products.map((product) => (
                <label className="am-checkline" key={product.key} htmlFor={`am-apply-product-${product.key}`}>
                  <input id={`am-apply-product-${product.key}`} name="productKeys" type="checkbox" value={product.key} />
                  {product.name}
                </label>
              ))}
            </div>
          ) : (
            <p role="status">{labels.productsNone}</p>
          )}
          {fieldErrors.productKeys ? (
            <p className="am-field__error" role="alert">
              <Icon name="alert" size={16} />
              {fieldErrors.productKeys}
            </p>
          ) : null}
        </div>
        <div className="am-cluster">
          <span className="am-formstepper__navitem" data-role="back" data-step-active="true">
            <Button type="button" variant="tertiary" onClick={() => goToStep(2)}>
              {labels.backLabel}
            </Button>
          </span>
          <span className="am-formstepper__navitem" data-role="continue" data-step-active="true">
            <Button type="submit">{labels.continueLabel}</Button>
          </span>
        </div>
      </fieldset>

      <Divider />

      <fieldset className="am-formstepper__panel" data-step-panel="4" data-step-active={String(currentStep === 4)}>
        <legend className="am-formsection__legend" tabIndex={-1}>
          <span className="am-formsection__index" aria-hidden="true">
            4
          </span>
          {labels.messageLegend}
        </legend>

        {reviewSnapshot ? (
          <div className="am-review">
            <div className="am-review__section">
              <div className="am-review__head">
                <p className="am-review__title">{labels.review.societyTitle}</p>
                <Button type="button" variant="tertiary" size="sm" onClick={() => goToStep(1)}>
                  {labels.review.editLabel}
                </Button>
              </div>
              <dl className="am-review__list">
                <dt>{labels.legalName}</dt>
                <dd>{reviewSnapshot.legalName}</dd>
                {reviewSnapshot.tradeName ? (
                  <>
                    <dt>{labels.tradeName}</dt>
                    <dd>{reviewSnapshot.tradeName}</dd>
                  </>
                ) : null}
                <dt>{labels.country}</dt>
                <dd>{reviewSnapshot.countryName}</dd>
              </dl>
            </div>

            <div className="am-review__section">
              <div className="am-review__head">
                <p className="am-review__title">{labels.review.contactTitle}</p>
                <Button type="button" variant="tertiary" size="sm" onClick={() => goToStep(2)}>
                  {labels.review.editLabel}
                </Button>
              </div>
              <dl className="am-review__list">
                <dt>{labels.contactName}</dt>
                <dd>{reviewSnapshot.contactName}</dd>
                <dt>{labels.contactEmail}</dt>
                <dd>{reviewSnapshot.contactEmail}</dd>
                <dt>{labels.contactPhone}</dt>
                <dd>{reviewSnapshot.contactPhone}</dd>
                {reviewSnapshot.whatsapp ? (
                  <>
                    <dt>{labels.whatsapp}</dt>
                    <dd>{reviewSnapshot.whatsapp}</dd>
                  </>
                ) : null}
              </dl>
            </div>

            <div className="am-review__section">
              <div className="am-review__head">
                <p className="am-review__title">{labels.review.licenceTitle}</p>
                <Button type="button" variant="tertiary" size="sm" onClick={() => goToStep(3)}>
                  {labels.review.editLabel}
                </Button>
              </div>
              <dl className="am-review__list">
                <dt>{labels.licenseNumber}</dt>
                <dd>{reviewSnapshot.licenseNumber}</dd>
                <dt>{labels.licenseExpiresAt}</dt>
                <dd>{reviewSnapshot.licenseExpiresAt}</dd>
                {reviewSnapshot.licenseIssuingAuthority ? (
                  <>
                    <dt>{labels.licenseIssuingAuthority}</dt>
                    <dd>{reviewSnapshot.licenseIssuingAuthority}</dd>
                  </>
                ) : null}
                <dt>{labels.productsLegend}</dt>
                <dd>{reviewSnapshot.productNames.join(", ")}</dd>
                <dt>{labels.monthlyCapacity}</dt>
                <dd>{reviewSnapshot.monthlyCapacity}</dd>
              </dl>
            </div>
          </div>
        ) : null}

        <RadioCards name="desiredPlan" legend={labels.planLegend} options={plans} required {...(defaultPlan ? { defaultValue: defaultPlan } : {})} />
        <p className="am-field__hint">{labels.planHint}</p>
        {fieldErrors.desiredPlan ? (
          <p className="am-field__error" role="alert">
            <Icon name="alert" size={16} />
            {fieldErrors.desiredPlan}
          </p>
        ) : null}

        <Field id="am-apply-message" label={labels.message} hint={labels.messageHint}>
          <textarea {...fieldControlProps("am-apply-message", { hint: labels.messageHint })} name="message" maxLength={2000} />
        </Field>

        {/* Honeypot: hidden from people and from assistive technology, filled only by robots. */}
        <div className="am-visually-hidden" aria-hidden="true">
          <label htmlFor="am-apply-website">{labels.website}</label>
          <input id="am-apply-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>

        <label className="am-checkline" htmlFor="am-apply-consent">
          <input
            id="am-apply-consent"
            name="consent"
            type="checkbox"
            aria-invalid={fieldErrors.consent ? true : undefined}
            aria-describedby={fieldErrors.consent ? "am-apply-consent-error" : undefined}
          />
          {labels.consent}
        </label>
        {fieldErrors.consent ? (
          <p className="am-field__error" id="am-apply-consent-error" role="alert">
            <Icon name="alert" size={16} />
            {fieldErrors.consent}
          </p>
        ) : null}

        {state.status === "error" ? (
          <Notice tone="error" role="alert">
            {state.message}
          </Notice>
        ) : null}

        <div className="am-cluster">
          <span className="am-formstepper__navitem" data-role="back" data-step-active="true">
            <Button type="button" variant="tertiary" onClick={() => goToStep(3)}>
              {labels.backLabel}
            </Button>
          </span>
          <span className="am-formstepper__navitem" data-role="submit" data-step-active={String(currentStep === 4)}>
            <Button type="submit" disabled={submitting} loading={submitting}>
              {submitting ? labels.submitting : labels.submit}
            </Button>
          </span>
        </div>
      </fieldset>
    </form>
  );
}
