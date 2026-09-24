import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../../i18n/routing";
import { Breadcrumb } from "../../../../components/ui/breadcrumb";
import { BrokerBlock } from "../../../../components/ui/broker-block";
import { Button } from "../../../../components/ui/button";
import { EmptyState } from "../../../../components/ui/empty-state";
import { Hero } from "../../../../components/ui/hero";
import { Icon } from "../../../../components/ui/icons";
import { Reveal } from "../../../../components/motion/reveal";
import { Section } from "../../../../components/ui/section";
import { listCountryDirectory, listCountryPartners, listPublicProducts } from "../../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../../lib/seo";
import type { PageMetadata } from "../../../../lib/seo";

/**
 * Broker directory of a country (SITE-404). Every partner shown here holds a valid licence: the
 * intro sentence above the grid states the broker's role (Constitution I and II) so a visitor never
 * mistakes a directory listing for a binding offer. An API error or an empty catalogue always renders
 * `EmptyState`, never an invented broker.
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
  const t = await getTranslations({ locale, namespace: "Directory.brokers" });
  const countryName = await resolveCountryName(countryCode);
  return buildMetadata({
    title: t("title", { countryCode: countryName }),
    description: t("description", { countryCode: countryName }),
    href: "/countries/[countryCode]/brokers",
    params: { countryCode },
    locale
  });
}

export default async function CountryBrokersPage({ params }: { params: Promise<PageParams> }) {
  const { locale: rawLocale, countryCode } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const t = await getTranslations("Directory.brokers");
  const common = await getTranslations("Common");
  const countries = await getTranslations("Countries");

  const countryName = await resolveCountryName(countryCode);
  const partners = await listCountryPartners(countryCode);
  const countryProducts = await listPublicProducts(countryCode);
  const brokerLabels = {
    licenceNumber: common("licenceNumber"),
    issuingAuthority: common("issuingAuthority"),
    city: common("city"),
    products: common("products"),
    approved: common("approved")
  };

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
              { name: t("breadcrumb"), url: localeUrl(locale, "/countries/[countryCode]/brokers", { countryCode }) }
            ]}
          />
        }
      />

      {/* No section heading: the hero's H1 already names this list, and the cards carry no heading
          of their own, so there is no level to skip over. */}
      <Section ariaLabel={t("listLabel")}>
        {partners.status === "error" ? (
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

        {partners.status !== "error" && partners.data.length === 0 ? (
          <EmptyState
            icon="users"
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

        {partners.status !== "error" && partners.data.length > 0 ? (
          <Reveal as="ul" stagger className="am-j-cardgrid">
            {partners.data.map((partner) => {
              const productLabels = partner.productKeys.map((key) => {
                const match = countryProducts.data.find((candidate) => candidate.key.toLowerCase() === key.toLowerCase());
                return match ? match.name : key;
              });
              return (
                <li key={partner.id}>
                  <BrokerBlock
                    displayName={partner.displayName}
                    licenceNumber={partner.licenseNumber}
                    issuingAuthority={partner.issuingAuthority}
                    labels={brokerLabels}
                    approved
                    {...(partner.city ? { city: partner.city } : {})}
                    {...(productLabels.length > 0 ? { products: productLabels } : {})}
                  />
                  <div className="am-j-cardgrid__actions">
                    <Button
                      variant="secondary"
                      href={{ pathname: "/countries/[countryCode]/brokers/[partnerId]", params: { countryCode, partnerId: partner.id } }}
                      iconAfter={<Icon name="arrow-right" size={18} />}
                    >
                      {t("viewBroker")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </Reveal>
        ) : null}
      </Section>
    </>
  );
}
