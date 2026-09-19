import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../../i18n/routing";
import { BackendText } from "../../../../components/ui/backend-text";
import { Badge } from "../../../../components/ui/badge";
import { Breadcrumb } from "../../../../components/ui/breadcrumb";
import { Button } from "../../../../components/ui/button";
import { EmptyState } from "../../../../components/ui/empty-state";
import { Hero } from "../../../../components/ui/hero";
import { Section } from "../../../../components/ui/section";
import { listCountryDirectory, listCountryInsurers, listPublicProducts } from "../../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../../lib/seo";
import type { PageMetadata } from "../../../../lib/seo";

/**
 * Insurer directory of a country (SITE-404). The insurer carries the risk, the partner broker
 * handles the relationship: the intro sentence above the list states this split, and every offer
 * count comes straight from the API, never a guess. An API error or an empty catalogue always
 * renders `EmptyState`, never an invented insurer.
 */

type PageParams = { locale: string; countryCode: string };

async function resolveCountryName(countryCode: string): Promise<string> {
  const directory = await listCountryDirectory();
  const iso = countryCode.trim().toUpperCase();
  return directory.data.find((item) => item.isoCode.toUpperCase() === iso)?.name ?? iso;
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, countryCode } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "Directory.insurers" });
  const countryName = await resolveCountryName(countryCode);
  return buildMetadata({
    title: t("title", { countryCode: countryName }),
    description: t("description", { countryCode: countryName }),
    href: "/countries/[countryCode]/insurers",
    params: { countryCode },
    locale
  });
}

export default async function CountryInsurersPage({ params }: { params: Promise<PageParams> }) {
  const { locale: rawLocale, countryCode } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const t = await getTranslations("Directory.insurers");
  const common = await getTranslations("Common");
  const countries = await getTranslations("Countries");

  const countryName = await resolveCountryName(countryCode);
  const state = await listCountryInsurers(countryCode);
  const countryProducts = await listPublicProducts(countryCode);

  return (
    <>
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: countries("breadcrumb"), url: localeUrl(locale, "/countries") },
            { name: countryName, url: localeUrl(locale, "/countries/[countryCode]", { countryCode }) },
            { name: t("breadcrumb"), url: localeUrl(locale, "/countries/[countryCode]/insurers", { countryCode }) }
          ]}
        />
      </div>

      <Hero title={t("heading", { countryCode: countryName })} lead={t("intro")} />

      <Section ariaLabel={t("listLabel")}>
        {state.status === "error" ? (
          <EmptyState
            title={t("error.title")}
            description={t("error.description")}
            action={
              <Button variant="secondary" href={{ pathname: "/countries/[countryCode]", params: { countryCode } }}>
                {t("emptyAction", { countryCode: countryName })}
              </Button>
            }
          />
        ) : null}

        {state.status !== "error" && state.data.length === 0 ? (
          <EmptyState
            title={t("empty.title")}
            description={t("empty.description")}
            action={
              <Button variant="secondary" href={{ pathname: "/countries/[countryCode]", params: { countryCode } }}>
                {t("emptyAction", { countryCode: countryName })}
              </Button>
            }
          />
        ) : null}

        {state.status !== "error" && state.data.length > 0 ? (
          <ul className="am-countrygrid">
            {state.data.map((insurer) => {
              const productLinks = insurer.productKeys.map((key) => ({
                raw: key,
                match: countryProducts.data.find((candidate) => candidate.key.toLowerCase() === key.toLowerCase())
              }));
              return (
                <li className="am-countrycard" key={insurer.insurerName}>
                  <h2 className="pub-card__title">
                    <BackendText>{insurer.insurerName}</BackendText>
                  </h2>
                  <p className="am-field__hint">{t("offersCount", { count: insurer.offerCount })}</p>
                  {productLinks.length > 0 ? (
                    <>
                      <p className="am-field__hint">{t("productsLabel")}</p>
                      <div className="am-cluster">
                        {productLinks.map(({ raw, match }) =>
                          match ? (
                            <Button
                              key={raw}
                              variant="secondary"
                              href={{
                                pathname: "/countries/[countryCode]/products/[productKey]/offers",
                                params: { countryCode, productKey: match.key },
                                query: { insurer: insurer.insurerName }
                              }}
                            >
                              {t("viewOffers")} <BackendText>{match.name}</BackendText>
                            </Button>
                          ) : (
                            <Badge key={raw} tone="neutral">
                              <BackendText>{raw}</BackendText>
                            </Badge>
                          )
                        )}
                      </div>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </Section>
    </>
  );
}
