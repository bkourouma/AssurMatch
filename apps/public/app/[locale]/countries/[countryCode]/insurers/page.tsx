import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "../../../../../i18n/navigation";
import { toLocale } from "../../../../../i18n/routing";
import { InitialsTile } from "../../../../components/journey/tiles";
import { BackendText } from "../../../../components/ui/backend-text";
import { Breadcrumb } from "../../../../components/ui/breadcrumb";
import { Button } from "../../../../components/ui/button";
import { EmptyState } from "../../../../components/ui/empty-state";
import { Hero } from "../../../../components/ui/hero";
import { Icon } from "../../../../components/ui/icons";
import { Section } from "../../../../components/ui/section";
import { listCountryDirectory, listCountryInsurers, listPublicProducts } from "../../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../../lib/seo";
import type { PageMetadata } from "../../../../lib/seo";

/**
 * Insurer directory of a country (SITE-404). The insurer carries the risk, the partner broker
 * handles the relationship: the intro sentence above the list states this split, and every offer
 * count comes straight from the API, never a guess. An API error or an empty catalogue always
 * renders `EmptyState`, never an invented insurer.
 *
 * Each insurer is one ruled row: the initials plate, the name, the number of public offers, then one
 * link per product it appears in, leading to that product's offers filtered on the insurer. A row
 * holds several destinations here, so the row itself is not a link and carries no arrow.
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
      <Hero
        title={t("heading", { countryCode: countryName })}
        lead={t("intro")}
        size="sm"
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: countries("breadcrumb"), url: localeUrl(locale, "/countries") },
              { name: countryName, url: localeUrl(locale, "/countries/[countryCode]", { countryCode }) },
              { name: t("breadcrumb"), url: localeUrl(locale, "/countries/[countryCode]/insurers", { countryCode }) }
            ]}
          />
        }
      />

      <Section ariaLabel={t("listLabel")}>
        {state.status === "error" ? (
          <EmptyState
            icon="wifi-off"
            align="center"
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
            icon="landmark"
            align="center"
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
          <ul className="am-j-insurers" aria-label={t("listLabel")}>
            {state.data.map((insurer) => {
              const productLinks = insurer.productKeys.map((key) => ({
                raw: key,
                match: countryProducts.data.find((candidate) => candidate.key.toLowerCase() === key.toLowerCase())
              }));
              return (
                <li className="am-j-insurer" key={insurer.insurerName}>
                  <InitialsTile name={insurer.insurerName} />
                  <div className="am-j-insurer__text">
                    <h2 className="am-j-insurer__name">
                      <BackendText>{insurer.insurerName}</BackendText>
                    </h2>
                    <p className="am-j-insurer__meta">{t("offersCount", { count: insurer.offerCount })}</p>
                    {productLinks.length > 0 ? (
                      <p className="am-j-insurer__links">
                        <span className="am-j-insurer__label">{t("productsLabel")}</span>
                        {productLinks.map(({ raw, match }) =>
                          match ? (
                            <Link
                              key={raw}
                              href={{
                                pathname: "/countries/[countryCode]/products/[productKey]/offers",
                                params: { countryCode, productKey: match.key },
                                query: { insurer: insurer.insurerName }
                              }}
                            >
                              <span>
                                {t("viewOffers")} <BackendText>{match.name}</BackendText>
                              </span>
                              <Icon name="arrow-right" size={18} />
                            </Link>
                          ) : (
                            <span className="am-j-insurer__plain" key={raw}>
                              <BackendText>{raw}</BackendText>
                            </span>
                          )
                        )}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Section>
    </>
  );
}
