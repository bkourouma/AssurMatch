import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { toLocale, type AppLocale } from "../../../../../../../i18n/routing";
import { JourneyRoute } from "../../../../../../components/journey/journey-route";
import { QuoteBlockedState, QuoteFormShell, type ResponsibleBrokerInfo } from "../../../../../../components/quote-form";
import { TechnicalRoleNotice } from "../../../../../../components/public-journey";
import { BackendText } from "../../../../../../components/ui/backend-text";
import { Breadcrumb } from "../../../../../../components/ui/breadcrumb";
import { Hero } from "../../../../../../components/ui/hero";
import { Notice } from "../../../../../../components/ui/notice";
import { Pictogram, productPictogram } from "../../../../../../components/ui/pictogram";
import { Section } from "../../../../../../components/ui/section";
import {
  getPublicOffer,
  getPublicQuoteForm,
  listCountryDirectory,
  listCountryPartners,
  listPublicProducts,
  submitPublicQuoteRequest,
  type PublicQuoteFormField,
  type PublicQuoteFormState
} from "../../../../../../lib/public-api";
import { buildMetadata, localeUrl, localePath } from "../../../../../../lib/seo";
import type { PageMetadata } from "../../../../../../lib/seo";

/**
 * Quote request of a product. The page is never indexed: it carries visitor data. The form itself is
 * a client boundary, the page only resolves the published definition, the D4 broker identification and
 * the journey chrome; `submitQuoteRequestAction` below is the D6 no-JavaScript fallback.
 */

type SearchParams = Record<string, string | string[] | undefined>;
type PageParams = { locale: string; countryCode: string; productKey: string };

const KNOWN_QUOTE_ERROR_KEYS = ["quoteRejected", "rateLimited", "apiUnavailable", "confirmationFailed"] as const;
type KnownQuoteErrorKey = (typeof KNOWN_QUOTE_ERROR_KEYS)[number];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Mirrors `collectAnswers` of `components/quote-form.tsx`: the client boundary cannot be imported
 * into this server action, since importing a "use client" module only yields component references. */
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

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, countryCode, productKey } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "QuoteForm" });
  return buildMetadata({
    title: t("title"),
    description: t("description"),
    href: "/countries/[countryCode]/products/[productKey]/quote",
    params: { countryCode, productKey },
    locale,
    noindex: true
  });
}

export default async function PublicQuotePage({
  params,
  searchParams
}: {
  params: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
}) {
  const { locale: rawLocale, countryCode, productKey } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations("QuoteForm");
  const common = await getTranslations("Common");
  const countries = await getTranslations("Countries");
  const api = await getTranslations("Api");

  const query = searchParams ? await searchParams : {};
  const offerIdParam = first(query.offerId);
  const selectedOfferId = offerIdParam && /^[0-9a-f-]{36}$/i.test(offerIdParam) ? offerIdParam : undefined;
  const quoteForm = await getPublicQuoteForm(countryCode, productKey);

  const directory = await listCountryDirectory();
  const iso = countryCode.trim().toUpperCase();
  const countryName = directory.data.find((item) => item.isoCode.toUpperCase() === iso)?.name ?? iso;
  const products = await listPublicProducts(countryCode);
  const productName = products.data.find((item) => item.key === productKey)?.name ?? productKey;

  // D4: with a preselected offer, the responsible broker is resolved the same way the offer detail
  // page does it - by trade name against the country's public partner directory - so its licence and
  // issuing authority can be named before the consent box. Without a match, the name alone is used;
  // without a name at all, the form falls back to the generic routing explanation.
  let responsibleBroker: ResponsibleBrokerInfo | undefined;
  if (selectedOfferId) {
    const offer = await getPublicOffer(selectedOfferId);
    const responsibleName = offer.status === "success" ? (offer.data?.partnerName ?? offer.data?.brokerName) : undefined;
    if (responsibleName) {
      const partners = await listCountryPartners(countryCode);
      const partner = partners.data.find((item) => item.displayName.trim().toLowerCase() === responsibleName.trim().toLowerCase());
      responsibleBroker = partner
        ? { name: partner.displayName, licenceNumber: partner.licenseNumber, issuingAuthority: partner.issuingAuthority }
        : { name: responsibleName };
    }
  }

  // Query-carried outcome of a no-JavaScript submission (D6): the server action below cannot keep any
  // React state, so a rejected submission redirects back here with the reason instead.
  const quoteErrorParam = first(query.quoteError);
  const quoteErrorText =
    quoteErrorParam === "consent"
      ? t("consentRequired")
      : quoteErrorParam && (KNOWN_QUOTE_ERROR_KEYS as readonly string[]).includes(quoteErrorParam)
        ? api(quoteErrorParam as KnownQuoteErrorKey)
        : undefined;

  /**
   * D6: the browser's native submission of the form (no JavaScript) posts here directly. With
   * JavaScript, `QuoteFormShell` calls `preventDefault()` in its own submit handler and this action is
   * never reached - the visible behaviour (the review step, the inline errors) only exists client-side.
   */
  async function submitQuoteRequestAction(
    boundCountryCode: string,
    boundProductKey: string,
    boundLocale: AppLocale,
    boundSelectedOfferId: string | undefined,
    boundQuoteForm: PublicQuoteFormState,
    formData: FormData
  ): Promise<void> {
    "use server";
    const quotePathname = "/countries/[countryCode]/products/[productKey]/quote" as const;
    const backToQuote = (errorKey: string): never => {
      const errorParams = new URLSearchParams({ quoteError: errorKey });
      if (boundSelectedOfferId) errorParams.set("offerId", boundSelectedOfferId);
      redirect(`${localePath(boundLocale, quotePathname, { countryCode: boundCountryCode, productKey: boundProductKey })}?${errorParams.toString()}`);
    };

    if (formData.get("consent") !== "on") {
      backToQuote("consent");
    }

    const incoming = await headers();
    const forwardedFor = incoming.get("x-forwarded-for")?.split(",")[0]?.trim() || incoming.get("x-real-ip")?.trim() || undefined;
    const response = await submitPublicQuoteRequest({
      countryCode: boundCountryCode,
      productKey: boundProductKey,
      formDefinitionId: boundQuoteForm.formDefinitionId,
      ...(boundSelectedOfferId ? { selectedOfferId: boundSelectedOfferId } : {}),
      contact: {
        displayName: String(formData.get("displayName") ?? "").trim() || undefined,
        email: String(formData.get("email") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim()
      },
      answers: collectAnswers(formData, boundQuoteForm.fields),
      consent: {
        accepted: true,
        consentTextId: boundQuoteForm.consent.consentTextId,
        version: boundQuoteForm.consent.version,
        contentHash: boundQuoteForm.consent.contentHash,
        multiBrokerAccepted: formData.get("multiBroker") === "on"
      }
    }, { forwardedFor });

    if (response.status !== "success" || !response.publicReference) {
      backToQuote(response.messageKey ?? "quoteRejected");
      return;
    }

    const trackingQuery = response.verificationToken ? `?token=${encodeURIComponent(response.verificationToken)}` : "";
    redirect(`${localePath(boundLocale, "/quote-requests/[publicReference]", { publicReference: response.publicReference })}${trackingQuery}`);
  }

  const boundSubmitAction =
    quoteForm.status === "success" && quoteForm.data
      ? submitQuoteRequestAction.bind(null, countryCode, productKey, locale, selectedOfferId, quoteForm.data)
      : undefined;

  return (
    <>
      <Hero
        title={t("title")}
        lead={t("lead")}
        size="sm"
        route={<JourneyRoute current="request" countryCode={countryCode} productKey={productKey} />}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: countries("breadcrumb"), url: localeUrl(locale, "/countries") },
              { name: countryName, url: localeUrl(locale, "/countries/[countryCode]", { countryCode }) },
              {
                name: productName,
                url: localeUrl(locale, "/countries/[countryCode]/products/[productKey]", { countryCode, productKey })
              },
              {
                name: t("breadcrumb"),
                url: localeUrl(locale, "/countries/[countryCode]/products/[productKey]/quote", { countryCode, productKey })
              }
            ]}
          />
        }
      >
        {/* Which request this is: the product and the country, next to the product's pictogram. */}
        <p className="am-j-context">
          <Pictogram name={productPictogram(productKey)} tile tone="light" size={24} />
          <BackendText>{t("kicker", { product: productName, country: countryName })}</BackendText>
        </p>
        <TechnicalRoleNotice />
      </Hero>

      <Section>
        <div className="am-stack am-stack--xl am-j-column">
          {quoteErrorText ? (
            <Notice tone="error" role="alert">
              {quoteErrorText}
            </Notice>
          ) : null}
          {/* The stepper travels with the form: only the client boundary knows the request went
              through, and it moves to step 4 the moment it does. */}
          {quoteForm.status === "success" && quoteForm.data ? (
            <QuoteFormShell
              countryCode={countryCode}
              productKey={productKey}
              countryName={countryName}
              productName={productName}
              quoteForm={quoteForm.data}
              selectedOfferId={selectedOfferId}
              responsibleBroker={responsibleBroker}
              formAction={boundSubmitAction}
            />
          ) : (
            <QuoteBlockedState />
          )}
        </div>
      </Section>
    </>
  );
}
