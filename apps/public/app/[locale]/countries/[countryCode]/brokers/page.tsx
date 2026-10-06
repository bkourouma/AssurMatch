import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../../i18n/routing";
import { InitialsTile } from "../../../../components/journey/tiles";
import { BackendText } from "../../../../components/ui/backend-text";
import { Badge } from "../../../../components/ui/badge";
import { Breadcrumb } from "../../../../components/ui/breadcrumb";
import { Button } from "../../../../components/ui/button";
import { Directory, type DirectoryItem } from "../../../../components/ui/directory";
import { EmptyState } from "../../../../components/ui/empty-state";
import { Hero } from "../../../../components/ui/hero";
import { Icon } from "../../../../components/ui/icons";
import { Section } from "../../../../components/ui/section";
import { listCountryDirectory, listCountryPartners, listPublicProducts } from "../../../../lib/public-api";
import { formatDate } from "../../../../lib/country-format";
import { buildMetadata, localeUrl } from "../../../../lib/seo";
import type { PageMetadata } from "../../../../lib/seo";

/**
 * Broker directory of a country (SITE-404). Every partner shown here holds a valid licence: the
 * intro sentence on the sign states the broker's role (Constitution I and II) so a visitor never
 * mistakes a directory listing for a binding offer. An API error or an empty catalogue always renders
 * `EmptyState`, never an invented broker.
 *
 * Each broker is one directory row leading to its profile: the initials plate, the name with the
 * green "Agréé" label (green means approved), the licence line, the products and the licence end.
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
  const rows: DirectoryItem[] = partners.data.map((partner) => {
    const productLabels = partner.productKeys.map((key) => {
      const match = countryProducts.data.find((candidate) => candidate.key.toLowerCase() === key.toLowerCase());
      return match ? match.name : key;
    });
    return {
      key: partner.id,
      tile: <InitialsTile name={partner.displayName} />,
      title: (
        <>
          <BackendText>{partner.displayName}</BackendText>{" "}
          <Badge tone="approved" icon={<Icon name="badge-check" size={16} />}>
            {common("approved")}
          </Badge>
          <span className="am-visually-hidden">{` - ${t("viewBroker")}`}</span>
        </>
      ),
      meta: (
        <>
          <span className="am-j-rowline">
            {common("licenceNumber")} <BackendText>{partner.licenseNumber}</BackendText>
            {" - "}
            {common("issuingAuthority")} <BackendText>{partner.issuingAuthority}</BackendText>
            {partner.city ? (
              <>
                {" - "}
                {common("city")} <BackendText>{partner.city}</BackendText>
              </>
            ) : null}
          </span>
          {productLabels.length > 0 ? (
            <span className="am-j-rowline">
              <strong>{common("products")}</strong> <BackendText>{productLabels.join(", ")}</BackendText>
            </span>
          ) : null}
          {partner.licenseExpiresAt ? (
            <span className="am-j-rowline">
              {t("validUntil", { date: formatDate(partner.licenseExpiresAt, { locale, countryIso: countryCode }) })}
            </span>
          ) : null}
        </>
      ),
      href: { pathname: "/countries/[countryCode]/brokers/[partnerId]", params: { countryCode, partnerId: partner.id } }
    };
  });

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
              { name: t("breadcrumb"), url: localeUrl(locale, "/countries/[countryCode]/brokers", { countryCode }) }
            ]}
          />
        }
      />

      {/* No section heading: the sign's H1 already names this list, and the rows carry no heading
          of their own, so there is no level to skip over. */}
      <Section ariaLabel={t("listLabel")}>
        {partners.status === "error" ? (
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

        {partners.status !== "error" && partners.data.length === 0 ? (
          <EmptyState
            icon="users"
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

        {partners.status !== "error" && rows.length > 0 ? <Directory items={rows} label={t("listLabel")} columns={2} /> : null}
      </Section>
    </>
  );
}
