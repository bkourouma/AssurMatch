import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../../../../i18n/routing";
import { QuoteBlockedState, QuoteFormShell } from "../../../../../../components/quote-form";
import { TechnicalRoleNotice } from "../../../../../../components/public-journey";
import { Breadcrumb } from "../../../../../../components/ui/breadcrumb";
import { Hero } from "../../../../../../components/ui/hero";
import { Icon } from "../../../../../../components/ui/icons";
import { Section } from "../../../../../../components/ui/section";
import { getPublicQuoteForm, listCountryDirectory, listPublicProducts } from "../../../../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../../../../lib/seo";
import type { PageMetadata } from "../../../../../../lib/seo";

/**
 * Quote request of a product. The page is never indexed: it carries visitor data. The form itself is
 * a client boundary, the page only resolves the published definition and the journey chrome.
 */

type SearchParams = Record<string, string | string[] | undefined>;
type PageParams = { locale: string; countryCode: string; productKey: string };

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

  const query = searchParams ? await searchParams : {};
  const offerIdParam = Array.isArray(query.offerId) ? query.offerId[0] : query.offerId;
  const selectedOfferId = offerIdParam && /^[0-9a-f-]{36}$/i.test(offerIdParam) ? offerIdParam : undefined;
  const quoteForm = await getPublicQuoteForm(countryCode, productKey);

  const directory = await listCountryDirectory();
  const iso = countryCode.trim().toUpperCase();
  const countryName = directory.data.find((item) => item.isoCode.toUpperCase() === iso)?.name ?? iso;
  const products = await listPublicProducts(countryCode);
  const productName = products.data.find((item) => item.key === productKey)?.name ?? productKey;

  return (
    <>
      <Hero
        className="am-hero--spotlight"
        kicker={
          <>
            <span className="am-status-ping" aria-hidden="true" />
            {t("kicker", { product: productName, country: countryName })}
          </>
        }
        title={t.rich("heroTitle", { accent: (chunks) => <span className="am-hero__accent">{chunks}</span> })}
        lead={t("lead")}
        size="sm"
        aside={
          <section className="am-j-countrycard am-j-countrycard--live am-j-journeycard" aria-label={t("journey.label")}>
            <p className="am-j-journeycard__title">{t("journey.title")}</p>
            <ol className="am-j-journeycard__steps">
              <li>
                <span className="am-j-journeycard__icon" aria-hidden="true">
                  <Icon name="user" size={16} />
                </span>
                <span>
                  <strong>{t("journey.contactTitle")}</strong>
                  <span>{t("journey.contactBody")}</span>
                </span>
              </li>
              <li>
                <span className="am-j-journeycard__icon" aria-hidden="true">
                  <Icon name="lock" size={16} />
                </span>
                <span>
                  <strong>{t("journey.consentTitle")}</strong>
                  <span>{t("journey.consentBody")}</span>
                </span>
              </li>
              <li>
                <span className="am-j-journeycard__icon" aria-hidden="true">
                  <Icon name="handshake" size={16} />
                </span>
                <span>
                  <strong>{t("journey.brokerTitle")}</strong>
                  <span>{t("journey.brokerBody")}</span>
                </span>
              </li>
            </ol>
            <p className="am-j-countrycard__licensed">
              <span className="am-j-countrycard__shield" aria-hidden="true">
                <Icon name="check" size={12} />
              </span>
              {t("journey.noAccount")}
            </p>
          </section>
        }
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
        <TechnicalRoleNotice />
      </Hero>

      <Section>
        <div className="am-stack am-stack--xl am-j-column">
          {/* The stepper travels with the form: only the client boundary knows the request went
              through, and it moves to step 4 the moment it does. */}
          {quoteForm.status === "success" && quoteForm.data ? (
            <QuoteFormShell
              countryCode={countryCode}
              productKey={productKey}
              quoteForm={quoteForm.data}
              selectedOfferId={selectedOfferId}
            />
          ) : (
            <QuoteBlockedState />
          )}
        </div>
      </Section>
    </>
  );
}
