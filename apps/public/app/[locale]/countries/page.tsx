import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "../../../i18n/navigation";
import { toLocale } from "../../../i18n/routing";
import { CountryFlag } from "../../components/journey/country-flag";
import { BackendText } from "../../components/ui/backend-text";
import { Badge } from "../../components/ui/badge";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { Hero } from "../../components/ui/hero";
import { Icon } from "../../components/ui/icons";
import { Notice } from "../../components/ui/notice";
import { Reveal } from "../../components/motion/reveal";
import { Section } from "../../components/ui/section";
import { listCountryDirectory, type CountryAvailability, type PublicCountryDirectoryItem } from "../../lib/public-api";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";

/**
 * Countries directory (SITE-107). The directory is split by availability: open countries and pilot
 * countries lead to their country page, countries on the waiting list lead to the same page, which
 * renders its waiting variant instead of a comparison journey.
 */

const availabilityTone: Record<CountryAvailability, "new" | "pilot" | "soon"> = {
  open: "new",
  pilot: "pilot",
  waitlist: "soon"
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Countries" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/countries", locale });
}

export default async function PublicCountriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Countries");
  const common = await getTranslations("Common");
  const directory = await listCountryDirectory();

  const groups: Array<{ availability: CountryAvailability; countries: PublicCountryDirectoryItem[] }> = [
    { availability: "open", countries: directory.data.filter((country) => country.availability === "open") },
    { availability: "pilot", countries: directory.data.filter((country) => country.availability === "pilot") },
    { availability: "waitlist", countries: directory.data.filter((country) => country.availability === "waitlist") }
  ];

  return (
    <>
      <Hero
        kicker={t("kicker")}
        title={t("title")}
        lead={t("lead")}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/countries") }
            ]}
          />
        }
      />

      {directory.status === "error" ? (
        <Section>
          <EmptyState
            icon="wifi-off"
            align="center"
            tone="muted"
            title={t("error.title")}
            description={t("error.description")}
            action={
              <Button href="/" variant="secondary">
                {common("home")}
              </Button>
            }
          />
        </Section>
      ) : null}

      {directory.status !== "error" && directory.data.length === 0 ? (
        <Section>
          <EmptyState icon="globe" align="center" tone="muted" title={t("empty.title")} description={t("empty.description")} />
        </Section>
      ) : null}

      {directory.status !== "error" && directory.data.length > 0 ? (
        <>
          {groups
            .filter((group) => group.countries.length > 0)
            .map((group, index) => (
              <Section
                key={group.availability}
                kicker={t("count", { count: group.countries.length })}
                title={t(`${group.availability}.title`)}
                lead={t(`${group.availability}.lead`)}
                tone={index % 2 === 1 ? "muted" : "default"}
              >
                <Reveal as="ul" stagger className="am-j-countries">
                  {group.countries.map((country) => (
                    <li className="am-j-country" key={country.isoCode}>
                      <div className="am-j-country__head">
                        <CountryFlag isoCode={country.isoCode} />
                        <h3 className="am-j-country__name">
                          <Link href={{ pathname: "/countries/[countryCode]", params: { countryCode: country.isoCode } }}>
                            <BackendText>{country.name}</BackendText>
                            <span className="am-visually-hidden">
                              {` - ${country.availability === "waitlist" ? t("join") : t("view")}`}
                            </span>
                          </Link>
                        </h3>
                        <span className="am-j-country__arrow">
                          <Icon name="arrow-right" size={20} />
                        </span>
                      </div>
                      <div className="am-cluster">
                        <Badge tone={availabilityTone[country.availability]}>{t(`availability.${country.availability}`)}</Badge>
                      </div>
                      <ul className="am-pill-list">
                        {country.comparisonEnabled ? (
                          <li className="am-pill">
                            <Icon name="scale" size={16} />
                            {t("capability.comparison")}
                          </li>
                        ) : null}
                        {country.quoteEnabled ? (
                          <li className="am-pill">
                            <Icon name="file-text" size={16} />
                            {t("capability.quote")}
                          </li>
                        ) : null}
                        {country.currency ? (
                          <li className="am-pill">
                            <Icon name="coins" size={16} />
                            <BackendText>{country.currency}</BackendText>
                          </li>
                        ) : null}
                      </ul>
                    </li>
                  ))}
                </Reveal>
              </Section>
            ))}

          <Section spacing="compact">
            <Notice tone="info">{t("fineprint")}</Notice>
          </Section>
        </>
      ) : null}
    </>
  );
}
