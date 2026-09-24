import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../../i18n/routing";
import { BackendText } from "../../../../components/ui/backend-text";
import { Badge } from "../../../../components/ui/badge";
import { Breadcrumb } from "../../../../components/ui/breadcrumb";
import { Button } from "../../../../components/ui/button";
import { EmptyState } from "../../../../components/ui/empty-state";
import { Hero } from "../../../../components/ui/hero";
import { Icon } from "../../../../components/ui/icons";
import { Reveal } from "../../../../components/motion/reveal";
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

/** Two letters standing in for an insurer logo, e.g. "Assureur Demo Atlantique" -> "AA". */
function initials(name: string): string {
  const words = name.split(/\s+/).map((word) => word.trim()).filter(Boolean);
  const firstWord = words[0] ?? "";
  const lastWord = words.length > 1 ? words[words.length - 1] ?? "" : firstWord;
  return `${firstWord.charAt(0)}${words.length > 1 ? lastWord.charAt(0) : firstWord.charAt(1)}`;
}

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
        kicker={countries("breadcrumb")}
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
            tone="muted"
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
            tone="muted"
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
          <Reveal as="ul" stagger className="am-j-cardgrid">
            {state.data.map((insurer) => {
              const productLinks = insurer.productKeys.map((key) => ({
                raw: key,
                match: countryProducts.data.find((candidate) => candidate.key.toLowerCase() === key.toLowerCase())
              }));
              return (
                <li key={insurer.insurerName}>
                  <div className="am-j-insurer__head">
                    <span className="am-j-initials" aria-hidden="true">
                      {initials(insurer.insurerName)}
                    </span>
                    <div>
                      <h2 className="am-j-insurer__name">
                        <BackendText>{insurer.insurerName}</BackendText>
                      </h2>
                      <p className="am-j-meta">
                        <span>
                          <Icon name="list" size={16} />
                          {t("offersCount", { count: insurer.offerCount })}
                        </span>
                      </p>
                    </div>
                  </div>
                  {productLinks.length > 0 ? (
                    <>
                      <p className="am-j-meta">{t("productsLabel")}</p>
                      <div className="am-j-cardgrid__actions">
                        {productLinks.map(({ raw, match }) =>
                          match ? (
                            <Button
                              key={raw}
                              variant="secondary"
                              size="sm"
                              href={{
                                pathname: "/countries/[countryCode]/products/[productKey]/offers",
                                params: { countryCode, productKey: match.key },
                                query: { insurer: insurer.insurerName }
                              }}
                              iconAfter={<Icon name="arrow-right" size={16} />}
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
          </Reveal>
        ) : null}
      </Section>
    </>
  );
}
