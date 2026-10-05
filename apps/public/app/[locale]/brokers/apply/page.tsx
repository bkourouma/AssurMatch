import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { toLocale, type AppLocale } from "../../../../i18n/routing";
import { PartnerApplicationForm, type PartnerApplicationFormLabels, type PartnerApplicationProductOption } from "../../../components/forms/partner-application-form";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { Notice } from "../../../components/ui/notice";
import { Section } from "../../../components/ui/section";
import { Reveal } from "../../../components/motion/reveal";
import { brokerPlans } from "../../../content/brokers";
import { listPartnerApplicationOptions, submitPartnerApplication, type PartnerApplicationSubmission } from "../../../lib/public-api";
import { buildMetadata, localePath, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";
import { readVisitorCountryCode } from "../../../lib/visitor-country";
import type { RadioCardOption } from "../../../components/ui/radio-cards";
import type { BrokerPlanKey } from "../../../content/brokers";

type SearchParams = Record<string, string | string[] | undefined>;

const PLAN_KEYS: readonly BrokerPlanKey[] = ["starter", "pro", "enterprise"];
const KNOWN_APPLY_ERROR_KEYS = ["applicationFailed", "rateLimited", "apiUnavailable"] as const;
type KnownApplyErrorKey = (typeof KNOWN_APPLY_ERROR_KEYS)[number];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * SITE-410: the broker application form. The page itself stays a server component: it resolves the
 * eligible countries (open and pilot only - a waitlisted country has no partner broker yet), their
 * products, and every translated label, then hands all of it to the client `PartnerApplicationForm`,
 * which owns the interaction.
 */

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "BrokerApply" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/brokers/apply", locale });
}

export default async function BrokerApplyPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("BrokerApply");
  const common = await getTranslations("Common");
  const api = await getTranslations("Api");

  const query = searchParams ? await searchParams : {};
  const formuleRaw = Array.isArray(query.formule) ? query.formule[0] : query.formule;
  const defaultPlan = formuleRaw && (PLAN_KEYS as readonly string[]).includes(formuleRaw) ? formuleRaw : undefined;

  // Query-carried outcome of a no-JavaScript submission (D6): the server action below cannot keep any
  // React state, so a rejected application redirects back here with the reason instead.
  const formErrorParam = first(query.formError);
  const formErrorText =
    formErrorParam === "consent"
      ? t("form.errors.consentRequired")
      : formErrorParam === "fieldRequired"
        ? t("form.errors.generic")
        : formErrorParam && (KNOWN_APPLY_ERROR_KEYS as readonly string[]).includes(formErrorParam)
          ? api(formErrorParam as KnownApplyErrorKey)
          : undefined;

  // Spec 059: countries accepting applications and the products a broker may apply for, whatever
  // the visitor journey flags - a country only opens to visitors once a licensed broker exists, so
  // the visitor-facing product list (listPublicProducts) left the first applicant with nothing to
  // select and the application could never be sent.
  const applicationOptions = await listPartnerApplicationOptions();
  const eligibleCountries = applicationOptions.data;
  const productsByCountry: Record<string, readonly PartnerApplicationProductOption[]> = Object.fromEntries(
    eligibleCountries.map((country) => [country.isoCode, country.products.map((product) => ({ key: product.key, name: product.name }))] as const)
  );

  const defaultCountry = await readVisitorCountryCode();

  const planOptions: RadioCardOption[] = brokerPlans(locale).map((plan) => ({
    value: plan.key,
    label: plan.name,
    description: plan.positioning
  }));

  const labels: PartnerApplicationFormLabels = {
    legalName: t("form.legalName"),
    legalNameHint: t("form.legalNameHint"),
    tradeName: t("form.tradeName"),
    tradeNameHint: t("form.tradeNameHint"),
    country: t("form.country"),
    countryHint: t("form.countryHint"),
    countryPlaceholder: t("form.countryPlaceholder"),
    identityLegend: t("form.identityLegend"),
    licenceLegend: t("form.licenceLegend"),
    licenceIntro: t("form.licenceIntro"),
    licenseNumber: t("form.licenseNumber"),
    licenseNumberHint: t("form.licenseNumberHint"),
    licenseExpiresAt: t("form.licenseExpiresAt"),
    licenseExpiresAtHint: t("form.licenseExpiresAtHint"),
    licenseIssuingAuthority: t("form.licenseIssuingAuthority"),
    licenseIssuingAuthorityHint: t("form.licenseIssuingAuthorityHint"),
    productsLegend: t("form.productsLegend"),
    productsHint: t("form.productsHint"),
    productsNone: t("form.productsNone"),
    monthlyCapacity: t("form.monthlyCapacity"),
    monthlyCapacityHint: t("form.monthlyCapacityHint"),
    contactLegend: t("form.contactLegend"),
    contactName: t("form.contactName"),
    contactNameHint: t("form.contactNameHint"),
    contactEmail: t("form.contactEmail"),
    contactEmailHint: t("form.contactEmailHint"),
    contactPhone: t("form.contactPhone"),
    contactPhoneHint: t("form.contactPhoneHint"),
    whatsapp: t("form.whatsapp"),
    whatsappHint: t("form.whatsappHint"),
    planLegend: t("form.planLegend"),
    planHint: t("form.planHint"),
    messageLegend: t("form.messageLegend"),
    message: t("form.message"),
    messageHint: t("form.messageHint"),
    consent: t("form.consent"),
    website: t("form.website"),
    submit: t("form.submit"),
    submitting: t("form.submitting"),
    continueLabel: t("form.continueLabel"),
    backLabel: t("form.backLabel"),
    review: {
      editLabel: t("form.review.editLabel"),
      societyTitle: t("form.review.societyTitle"),
      contactTitle: t("form.review.contactTitle"),
      licenceTitle: t("form.review.licenceTitle")
    },
    progress: {
      navLabel: t("form.progress.navLabel"),
      sectionTitles: t.raw("form.progress.sectionTitles") as readonly string[],
      stepLabels: t.raw("form.progress.stepLabels") as readonly string[]
    },
    errors: {
      required: t("form.errors.required"),
      licenseExpiresAtFuture: t("form.errors.licenseExpiresAtFuture"),
      invalidEmail: t("form.errors.invalidEmail"),
      invalidPhone: t("form.errors.invalidPhone"),
      productsRequired: t("form.errors.productsRequired"),
      consentRequired: t("form.errors.consentRequired"),
      generic: t("form.errors.generic"),
      rateLimited: t("form.errors.rateLimited"),
      countryClosed: t("form.errors.countryClosed"),
      network: t("form.errors.network")
    }
  };

  /**
   * D6: the browser's native submission of the form (no JavaScript) posts here directly. With
   * JavaScript, `PartnerApplicationForm` calls `preventDefault()` in its own submit handler and this
   * action is never reached - the visible behaviour (the stepper, the review step, inline errors) only
   * exists client-side. Without JavaScript every fieldset is visible at once (see the component's own
   * comment on the CSS gate), so every field the wizard collects is present in one submission.
   */
  async function submitApplicationAction(boundLocale: AppLocale, formData: FormData): Promise<void> {
    "use server";
    const applyPathname = "/brokers/apply" as const;
    const backToApply = (errorKey: string): never => {
      redirect(`${localePath(boundLocale, applyPathname)}?formError=${encodeURIComponent(errorKey)}`);
    };

    if (formData.get("consent") !== "on") {
      backToApply("consent");
    }

    const legalName = String(formData.get("legalName") ?? "").trim();
    const tradeName = String(formData.get("tradeName") ?? "").trim();
    const applicationCountryCode = String(formData.get("countryCode") ?? "").trim();
    const licenseNumber = String(formData.get("licenseNumber") ?? "").trim();
    const licenseExpiresAt = String(formData.get("licenseExpiresAt") ?? "").trim();
    const licenseIssuingAuthority = String(formData.get("licenseIssuingAuthority") ?? "").trim();
    const productKeys = formData.getAll("productKeys").map((value) => String(value)).filter(Boolean);
    const monthlyCapacityRaw = String(formData.get("monthlyCapacity") ?? "").trim();
    const monthlyCapacity = Number(monthlyCapacityRaw);
    const contactName = String(formData.get("contactName") ?? "").trim();
    const contactEmail = String(formData.get("contactEmail") ?? "").trim();
    const contactPhone = String(formData.get("contactPhone") ?? "").trim();
    const whatsapp = String(formData.get("whatsapp") ?? "").trim();
    const desiredPlan = String(formData.get("desiredPlan") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    // Honeypot: a real visitor never fills this field. It is forwarded as-is so the public API's abuse
    // guard rejects the submission exactly as it does for a JavaScript-driven one.
    const website = String(formData.get("website") ?? "").trim();

    if (
      !legalName ||
      !applicationCountryCode ||
      !licenseNumber ||
      !licenseExpiresAt ||
      productKeys.length === 0 ||
      !monthlyCapacityRaw ||
      !Number.isInteger(monthlyCapacity) ||
      monthlyCapacity < 1 ||
      !contactName ||
      !contactEmail ||
      !contactPhone ||
      !desiredPlan
    ) {
      backToApply("fieldRequired");
    }

    const incoming = await headers();
    const forwardedFor = incoming.get("x-forwarded-for")?.split(",")[0]?.trim() || incoming.get("x-real-ip")?.trim() || undefined;

    const response = await submitPartnerApplication(
      {
        legalName,
        countryCode: applicationCountryCode,
        licenseNumber,
        licenseExpiresAt,
        productKeys,
        monthlyCapacity,
        contactName,
        contactEmail,
        contactPhone,
        desiredPlan: desiredPlan as PartnerApplicationSubmission["desiredPlan"],
        consent: true,
        // The no-JavaScript path must pick the confirmation e-mail language like the client form does.
        locale: boundLocale,
        ...(website ? { website } : {}),
        ...(tradeName ? { tradeName } : {}),
        ...(licenseIssuingAuthority ? { licenseIssuingAuthority } : {}),
        ...(whatsapp ? { whatsapp } : {}),
        ...(message ? { message } : {})
      },
      { forwardedFor }
    );

    if (response.status !== "success" || !response.publicReference) {
      backToApply(response.messageKey ?? "applicationFailed");
      return;
    }

    // Spec 050 D7: only the public reference travels to the confirmation page, as a query parameter -
    // never a name, an e-mail or a phone number.
    redirect(`${localePath(boundLocale, "/brokers/apply/confirmation")}?reference=${encodeURIComponent(response.publicReference)}`);
  }

  const boundSubmitApplicationAction = submitApplicationAction.bind(null, locale);

  return (
    <>
      <Hero
        title={t("title")}
        lead={t("lead")}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/brokers/apply") }
            ]}
          />
        }
      />

      <Section width="narrow">
        {formErrorText ? (
          <Notice tone="error" role="alert">
            {formErrorText}
          </Notice>
        ) : null}
        {eligibleCountries.length === 0 ? (
          <EmptyState title={t("noCountries.title")} description={t("noCountries.description")} />
        ) : (
          <Reveal as="div">
            <PartnerApplicationForm
              countries={eligibleCountries.map((country) => ({ isoCode: country.isoCode, name: country.name }))}
              productsByCountry={productsByCountry}
              plans={planOptions}
              labels={labels}
              formAction={boundSubmitApplicationAction}
              {...(defaultCountry ? { defaultCountry } : {})}
              {...(defaultPlan ? { defaultPlan } : {})}
            />
          </Reveal>
        )}
      </Section>
    </>
  );
}
