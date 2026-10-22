import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Link } from "../../../../../../../i18n/navigation";
import { toLocale, type AppLocale } from "../../../../../../../i18n/routing";
import { JourneyRoute } from "../../../../../../components/journey/journey-route";
import { QuoteBlockedState, QuoteFormShell, type ResponsibleBrokerInfo } from "../../../../../../components/quote-form";
import { TechnicalRoleNotice } from "../../../../../../components/public-journey";
import { BackendText } from "../../../../../../components/ui/backend-text";
import { Breadcrumb } from "../../../../../../components/ui/breadcrumb";
import { EmptyState } from "../../../../../../components/ui/empty-state";
import { Hero } from "../../../../../../components/ui/hero";
import { Notice } from "../../../../../../components/ui/notice";
import { Pictogram, productPictogram } from "../../../../../../components/ui/pictogram";
import { Section } from "../../../../../../components/ui/section";
import {
  getPublicQuoteForm,
  getQuoteOptions,
  listCountryDirectory,
  listCountryPartners,
  listPublicProducts,
  submitPublicQuoteRequest,
  type PublicQuoteFormField,
  type PublicQuoteFormState
} from "../../../../../../lib/public-api";
import { readQuoteOfferIds } from "../../../../../../lib/quote-journey";
import { buildMetadata, localeUrl, localePath } from "../../../../../../lib/seo";
import type { PageMetadata } from "../../../../../../lib/seo";

/**
 * Quote request of a product. The page is never indexed: it carries visitor data. The form itself is
 * a client boundary, the page only resolves the published definition, the D4 broker identification and
 * the journey chrome; `submitQuoteRequestAction` below is the D6 no-JavaScript fallback.
 */

type SearchParams = Record<string, string | string[] | undefined>;
type PageParams = { locale: string; countryCode: string; productKey: string };

const KNOWN_QUOTE_ERROR_KEYS = ["quoteRejected", "rateLimited", "apiUnavailable", "confirmationFailed", "quotePhoneInvalid", "quoteConsentOutdated"] as const;
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
  // Spec 067 COMP-009: `?offerId=` may repeat (3 valid, distinct ids at most). The first is the primary
  // offer, the others only count with the visitor's explicit authorisation naming each broker.
  const offerIds = readQuoteOfferIds(query.offerId);
  const selectedOfferId = offerIds[0];
  const additionalOfferIds = offerIds.slice(1);
  // Spec 050 R6: the form is requested in the page language; another language is offered, never served.
  const quoteForm = await getPublicQuoteForm(countryCode, productKey, locale, selectedOfferId);

  // Spec 067: options besides the definition (multi-broker, documents, eligible brokers, offer brokers);
  // `null` on any failure, in which case the form behaves as a single-offer form without extras.
  const quoteOptions = quoteForm.status === "success" ? await getQuoteOptions(countryCode, productKey, offerIds) : null;

  const directory = await listCountryDirectory();
  const iso = countryCode.trim().toUpperCase();
  const countryName = directory.data.find((item) => item.isoCode.toUpperCase() === iso)?.name ?? iso;
  const products = await listPublicProducts(countryCode);
  const productName = products.data.find((item) => item.key === productKey)?.name ?? productKey;

  // D4 (spec 050) + FR-018 (spec 052): the quote form read names the selected offer's broker only
  // when that broker is eligible for the request. That served name is then looked up in the
  // country's public partner directory, so its licence and issuing authority can be shown before the
  // consent box. Without a served name, the form falls back to the generic pre-selection notice.
  let responsibleBroker: ResponsibleBrokerInfo | undefined;
  const servedPartnerName = selectedOfferId && quoteForm.status === "success" ? quoteForm.data.offerPartnerName?.trim() : undefined;
  if (servedPartnerName) {
    const partners = await listCountryPartners(countryCode);
    const partner = partners.data.find((item) => item.displayName.trim().toLowerCase() === servedPartnerName.toLowerCase());
    responsibleBroker = partner
      ? { name: partner.displayName, licenceNumber: partner.licenseNumber, issuingAuthority: partner.issuingAuthority }
      : { name: servedPartnerName };
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
    boundOfferIds: string[],
    boundQuoteForm: PublicQuoteFormState,
    formData: FormData
  ): Promise<void> {
    "use server";
    const quotePathname = "/countries/[countryCode]/products/[productKey]/quote" as const;
    const backToQuote = (errorKey: string): never => {
      const errorParams = new URLSearchParams({ quoteError: errorKey });
      for (const offerId of boundOfferIds) errorParams.append("offerId", offerId);
      redirect(`${localePath(boundLocale, quotePathname, { countryCode: boundCountryCode, productKey: boundProductKey })}?${errorParams.toString()}`);
    };

    if (formData.get("consent") !== "on") {
      backToQuote("consent");
    }

    // Spec 067: without JavaScript there are no documents (they are added from the tracking page) and no
    // marketing source. Further offers count only with the dedicated authorisation checkbox.
    const boundSelectedOfferId = boundOfferIds[0];
    const multiOffersAccepted = formData.get("multiBrokerOffers") === "on";
    const boundExtras = boundOfferIds.slice(1);
    const additionalOfferIds = multiOffersAccepted
      ? readQuoteOfferIds(formData.getAll("additionalOfferIds").map(String)).filter((id) => boundExtras.includes(id)).slice(0, 2)
      : [];
    const preferredIdRaw = String(formData.get("preferredPartnerId") ?? "").trim();
    const preferredPartnerId = !boundSelectedOfferId && readQuoteOfferIds(preferredIdRaw).length === 1 ? preferredIdRaw : undefined;
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();

    const incoming = await headers();
    const forwardedFor = incoming.get("x-forwarded-for")?.split(",")[0]?.trim() || incoming.get("x-real-ip")?.trim() || undefined;
    const response = await submitPublicQuoteRequest({
      countryCode: boundCountryCode,
      productKey: boundProductKey,
      formDefinitionId: boundQuoteForm.formDefinitionId,
      language: boundLocale,
      ...(boundSelectedOfferId ? { selectedOfferId: boundSelectedOfferId } : {}),
      ...(additionalOfferIds.length > 0 ? { additionalOfferIds } : {}),
      ...(preferredPartnerId ? { preferredPartnerId } : {}),
      contact: {
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        email: String(formData.get("email") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim()
      },
      answers: collectAnswers(formData, boundQuoteForm.fields),
      consent: {
        accepted: true,
        consentTextId: boundQuoteForm.consent.consentTextId,
        version: boundQuoteForm.consent.version,
        contentHash: boundQuoteForm.consent.contentHash,
        multiBrokerAccepted: multiOffersAccepted || formData.get("multiBroker") === "on"
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
    quoteForm.status === "success"
      ? submitQuoteRequestAction.bind(null, countryCode, productKey, locale, offerIds, quoteForm.data)
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

      <Section tone="muted">
        <div className="am-stack am-stack--xl am-j-column am-sheet">
          {quoteErrorText ? (
            <Notice tone="error" role="alert">
              {quoteErrorText}
            </Notice>
          ) : null}
          {/* The stepper travels with the form: only the client boundary knows the request went
              through, and it moves to step 4 the moment it does. */}
          {quoteForm.status === "success" ? (
            <QuoteFormShell
              countryCode={countryCode}
              productKey={productKey}
              countryName={countryName}
              productName={productName}
              language={locale}
              quoteForm={quoteForm.data}
              selectedOfferId={selectedOfferId}
              additionalOfferIds={additionalOfferIds}
              quoteOptions={quoteOptions}
              responsibleBroker={responsibleBroker}
              formAction={boundSubmitAction}
            />
          ) : quoteForm.status === "language_unavailable" ? (
            <EmptyState
              icon="globe"
              tone="muted"
              align="center"
              title={t("languageUnavailable.title")}
              description={t("languageUnavailable.description")}
              action={
                <ul className="am-stack" aria-label={t("languageUnavailable.listLabel")}>
                  {quoteForm.availableLanguages.map((language) => (
                    <li key={language}>
                      <Link
                        locale={language}
                        hrefLang={language}
                        href={{
                          pathname: "/countries/[countryCode]/products/[productKey]/quote",
                          params: { countryCode, productKey },
                          ...(offerIds.length > 0 ? { query: { offerId: offerIds } } : {})
                        }}
                      >
                        {t(`languageUnavailable.link.${language}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              }
            />
          ) : (
            <QuoteBlockedState />
          )}
        </div>
      </Section>
    </>
  );
}
