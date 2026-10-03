import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../i18n/routing";
import { PartnerApplicationForm, type PartnerApplicationFormLabels, type PartnerApplicationProductOption } from "../../../components/forms/partner-application-form";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { Section } from "../../../components/ui/section";
import { Reveal } from "../../../components/motion/reveal";
import { brokerPlans } from "../../../content/brokers";
import { listPartnerApplicationOptions } from "../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";
import { readVisitorCountryCode } from "../../../lib/visitor-country";
import type { RadioCardOption } from "../../../components/ui/radio-cards";

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

export default async function BrokerApplyPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("BrokerApply");
  const common = await getTranslations("Common");

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
    tradeName: t("form.tradeName"),
    tradeNameHint: t("form.tradeNameHint"),
    country: t("form.country"),
    countryPlaceholder: t("form.countryPlaceholder"),
    identityLegend: t("form.identityLegend"),
    licenceLegend: t("form.licenceLegend"),
    licenseNumber: t("form.licenseNumber"),
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
    contactEmail: t("form.contactEmail"),
    contactPhone: t("form.contactPhone"),
    contactPhoneHint: t("form.contactPhoneHint"),
    whatsapp: t("form.whatsapp"),
    whatsappHint: t("form.whatsappHint"),
    planLegend: t("form.planLegend"),
    messageLegend: t("form.messageLegend"),
    message: t("form.message"),
    messageHint: t("form.messageHint"),
    consent: t("form.consent"),
    website: t("form.website"),
    submit: t("form.submit"),
    submitting: t("form.submitting"),
    errors: {
      required: t("form.errors.required"),
      licenseExpiresAtFuture: t("form.errors.licenseExpiresAtFuture"),
      invalidEmail: t("form.errors.invalidEmail"),
      invalidPhone: t("form.errors.invalidPhone"),
      productsRequired: t("form.errors.productsRequired"),
      consentRequired: t("form.errors.consentRequired"),
      generic: t("form.errors.generic")
    },
    success: {
      title: t("form.success.title"),
      referencePrefix: t("form.success.referencePrefix"),
      nextStepsTitle: t("form.success.nextStepsTitle"),
      fallbackNextSteps: t.raw("form.success.fallbackNextSteps") as readonly string[]
    }
  };

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
        {eligibleCountries.length === 0 ? (
          <EmptyState title={t("noCountries.title")} description={t("noCountries.description")} />
        ) : (
          <Reveal as="div">
            <PartnerApplicationForm
              countries={eligibleCountries.map((country) => ({ isoCode: country.isoCode, name: country.name }))}
              productsByCountry={productsByCountry}
              plans={planOptions}
              labels={labels}
              {...(defaultCountry ? { defaultCountry } : {})}
            />
          </Reveal>
        )}
      </Section>
    </>
  );
}
