"use client";

import { FormEvent, useMemo, useState } from "react";
import { track } from "../../lib/analytics";
import { submitPartnerApplication, type PartnerApplicationSubmission } from "../../lib/public-api";
import { Button } from "../ui/button";
import { Field, fieldControlProps } from "../ui/field";
import { Notice } from "../ui/notice";
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
 */
export interface PartnerApplicationFormLabels {
  legalName: string;
  tradeName: string;
  tradeNameHint: string;
  country: string;
  countryPlaceholder: string;
  licenceLegend: string;
  licenseNumber: string;
  licenseExpiresAt: string;
  licenseExpiresAtHint: string;
  licenseIssuingAuthority: string;
  licenseIssuingAuthorityHint: string;
  productsLegend: string;
  productsHint: string;
  productsNone: string;
  monthlyCapacity: string;
  monthlyCapacityHint: string;
  contactLegend: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactPhoneHint: string;
  whatsapp: string;
  whatsappHint: string;
  planLegend: string;
  message: string;
  messageHint: string;
  consent: string;
  website: string;
  submit: string;
  submitting: string;
  errors: {
    required: string;
    licenseExpiresAtFuture: string;
    invalidEmail: string;
    invalidPhone: string;
    productsRequired: string;
    consentRequired: string;
    generic: string;
  };
  success: {
    title: string;
    referencePrefix: string;
    nextStepsTitle: string;
    fallbackNextSteps: readonly string[];
  };
}

export interface PartnerApplicationFormProps {
  countries: readonly PartnerApplicationCountryOption[];
  /** Products of every selectable country, keyed by ISO code, so switching country needs no fetch. */
  productsByCountry: Readonly<Record<string, readonly PartnerApplicationProductOption[]>>;
  plans: readonly RadioCardOption[];
  labels: PartnerApplicationFormLabels;
  defaultCountry?: string;
}

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string }
  | { status: "success"; message: string; publicReference: string; nextSteps: readonly string[] };

/**
 * Broker acquisition form (SITE-410). Submits exactly the shared `partnerApplicationCreateSchema`
 * input: an application only ever records evidence of intent for the compliance team to review, it
 * never activates a partner. Document upload is deliberately out of scope for this release - the
 * confirmation screen says a copy of the licence will be requested by e-mail - so the field list and
 * the two-column layout below leave room for a file input to be added later without restructuring:
 * it would join the licence fieldset as one more `Field`, and the payload would move to `FormData`.
 */
export function PartnerApplicationForm({ countries, productsByCountry, plans, labels, defaultCountry }: PartnerApplicationFormProps) {
  const initialCountry = defaultCountry && productsByCountry[defaultCountry] ? defaultCountry : (countries[0]?.isoCode ?? "");
  // Generated once per mounted form, so a reload is a new session for the abuse guard.
  const [sessionId] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : ""));
  const [countryCode, setCountryCode] = useState(initialCountry);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<FormState>({ status: "idle" });

  const products = useMemo(() => productsByCountry[countryCode] ?? [], [productsByCountry, countryCode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const legalName = String(formData.get("legalName") ?? "").trim();
    const tradeName = String(formData.get("tradeName") ?? "").trim();
    const selectedCountry = String(formData.get("countryCode") ?? "").trim();
    const licenseNumber = String(formData.get("licenseNumber") ?? "").trim();
    const licenseExpiresAt = String(formData.get("licenseExpiresAt") ?? "").trim();
    const licenseIssuingAuthority = String(formData.get("licenseIssuingAuthority") ?? "").trim();
    const productKeys = formData.getAll("productKeys").map((value) => String(value)).filter(Boolean);
    const monthlyCapacityRaw = String(formData.get("monthlyCapacity") ?? "").trim();
    const contactName = String(formData.get("contactName") ?? "").trim();
    const contactEmail = String(formData.get("contactEmail") ?? "").trim();
    const contactPhone = String(formData.get("contactPhone") ?? "").trim();
    const whatsapp = String(formData.get("whatsapp") ?? "").trim();
    const desiredPlan = String(formData.get("desiredPlan") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const consent = formData.get("consent") === "on";
    const website = String(formData.get("website") ?? "").trim();

    const errors: FieldErrors = {};
    if (!legalName) errors.legalName = labels.errors.required;
    if (!selectedCountry) errors.countryCode = labels.errors.required;
    if (!licenseNumber) errors.licenseNumber = labels.errors.required;
    if (!licenseExpiresAt) {
      errors.licenseExpiresAt = labels.errors.required;
    } else {
      const expiry = new Date(`${licenseExpiresAt}T00:00:00.000Z`);
      if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
        errors.licenseExpiresAt = labels.errors.licenseExpiresAtFuture;
      }
    }
    if (productKeys.length === 0) errors.productKeys = labels.errors.productsRequired;
    const monthlyCapacity = Number(monthlyCapacityRaw);
    if (!monthlyCapacityRaw || !Number.isInteger(monthlyCapacity) || monthlyCapacity < 1) {
      errors.monthlyCapacity = labels.errors.required;
    }
    if (!contactName) errors.contactName = labels.errors.required;
    if (!contactEmail || !EMAIL_PATTERN.test(contactEmail)) errors.contactEmail = labels.errors.invalidEmail;
    if (!contactPhone || !PHONE_PATTERN.test(contactPhone)) errors.contactPhone = labels.errors.invalidPhone;
    if (whatsapp && !PHONE_PATTERN.test(whatsapp)) errors.whatsapp = labels.errors.invalidPhone;
    if (!desiredPlan) errors.desiredPlan = labels.errors.required;
    if (!consent) errors.consent = labels.errors.consentRequired;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setState({ status: "error", message: labels.errors.generic });
      return;
    }

    setFieldErrors({});
    setState({ status: "submitting" });

    // `PartnerApplicationSubmission` is the shared contract input: sending exactly this shape is
    // what keeps this form compatible with POST /partners/applications once it is deployed.
    const payload: PartnerApplicationSubmission = {
      legalName,
      countryCode: selectedCountry,
      licenseNumber,
      licenseExpiresAt,
      productKeys,
      monthlyCapacity,
      contactName,
      contactEmail,
      contactPhone,
      desiredPlan: desiredPlan as PartnerApplicationSubmission["desiredPlan"],
      consent: true,
      website,
      sessionId,
      ...(tradeName ? { tradeName } : {}),
      ...(licenseIssuingAuthority ? { licenseIssuingAuthority } : {}),
      ...(whatsapp ? { whatsapp } : {}),
      ...(message ? { message } : {})
    };

    const result = await submitPartnerApplication(payload);
    if (result.status === "success" && result.publicReference) {
      track("partner_application_submitted", { country: selectedCountry, plan: desiredPlan });
      setState({
        status: "success",
        message: result.publicMessage,
        publicReference: result.publicReference,
        nextSteps: result.nextSteps && result.nextSteps.length > 0 ? result.nextSteps : labels.success.fallbackNextSteps
      });
      return;
    }
    setState({ status: "error", message: result.publicMessage || labels.errors.generic });
  }

  if (state.status === "success") {
    return (
      <Notice tone="success" title={labels.success.title} role="status">
        <p>
          {labels.success.referencePrefix} <strong>{state.publicReference}</strong>
        </p>
        <p>{labels.success.nextStepsTitle}</p>
        <ul className="pub-list">
          {state.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </Notice>
    );
  }

  const submitting = state.status === "submitting";

  return (
    <form className="am-stack" onSubmit={submit} noValidate>
      <fieldset>
        <legend>{labels.licenceLegend}</legend>
        <div className="pub-form__grid pub-form__grid--two">
          <Field id="am-apply-legalname" label={labels.legalName} required {...(fieldErrors.legalName ? { error: fieldErrors.legalName } : {})}>
            <input
              {...fieldControlProps("am-apply-legalname", { error: fieldErrors.legalName, required: true })}
              name="legalName"
              autoComplete="organization"
              maxLength={160}
            />
          </Field>
          <Field id="am-apply-tradename" label={labels.tradeName} hint={labels.tradeNameHint}>
            <input {...fieldControlProps("am-apply-tradename", { hint: labels.tradeNameHint })} name="tradeName" maxLength={160} />
          </Field>
          <Field id="am-apply-country" label={labels.country} required {...(fieldErrors.countryCode ? { error: fieldErrors.countryCode } : {})}>
            <select
              {...fieldControlProps("am-apply-country", { error: fieldErrors.countryCode, required: true })}
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
          <Field id="am-apply-licensenumber" label={labels.licenseNumber} required {...(fieldErrors.licenseNumber ? { error: fieldErrors.licenseNumber } : {})}>
            <input
              {...fieldControlProps("am-apply-licensenumber", { error: fieldErrors.licenseNumber, required: true })}
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
          <Field
            id="am-apply-issuingauthority"
            label={labels.licenseIssuingAuthority}
            hint={labels.licenseIssuingAuthorityHint}
          >
            <input
              {...fieldControlProps("am-apply-issuingauthority", { hint: labels.licenseIssuingAuthorityHint })}
              name="licenseIssuingAuthority"
              maxLength={160}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>{labels.productsLegend}</legend>
        <p className="pub-form__hint">{labels.productsHint}</p>
        {products.length > 0 ? (
          <div className="pub-form__grid pub-form__grid--two">
            {products.map((product) => (
              <label key={product.key} htmlFor={`am-apply-product-${product.key}`}>
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
            {fieldErrors.productKeys}
          </p>
        ) : null}
      </fieldset>

      <Field id="am-apply-capacity" label={labels.monthlyCapacity} hint={labels.monthlyCapacityHint} required {...(fieldErrors.monthlyCapacity ? { error: fieldErrors.monthlyCapacity } : {})}>
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

      <fieldset>
        <legend>{labels.contactLegend}</legend>
        <div className="pub-form__grid pub-form__grid--two">
          <Field id="am-apply-contactname" label={labels.contactName} required {...(fieldErrors.contactName ? { error: fieldErrors.contactName } : {})}>
            <input
              {...fieldControlProps("am-apply-contactname", { error: fieldErrors.contactName, required: true })}
              name="contactName"
              autoComplete="name"
              maxLength={120}
            />
          </Field>
          <Field id="am-apply-contactemail" label={labels.contactEmail} required {...(fieldErrors.contactEmail ? { error: fieldErrors.contactEmail } : {})}>
            <input
              {...fieldControlProps("am-apply-contactemail", { error: fieldErrors.contactEmail, required: true })}
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
      </fieldset>

      <RadioCards name="desiredPlan" legend={labels.planLegend} options={plans} required />
      {fieldErrors.desiredPlan ? (
        <p className="am-field__error" role="alert">
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

      <label htmlFor="am-apply-consent">
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
          {fieldErrors.consent}
        </p>
      ) : null}

      {state.status === "error" ? <p role="alert">{state.message}</p> : null}

      <div className="am-cluster">
        <Button type="submit" disabled={submitting}>
          {submitting ? labels.submitting : labels.submit}
        </Button>
      </div>
    </form>
  );
}
