import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "../../../i18n/navigation";
import { toLocale } from "../../../i18n/routing";
import { BackendText } from "../../components/ui/backend-text";
import { Badge } from "../../components/ui/badge";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { Hero } from "../../components/ui/hero";
import { Notice } from "../../components/ui/notice";
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
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: t("breadcrumb"), url: localeUrl(locale, "/countries") }
          ]}
        />
      </div>

      <Hero title={t("title")} lead={t("lead")} />

      {directory.status === "error" ? (
        <Section>
          <EmptyState
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
          <EmptyState title={t("empty.title")} description={t("empty.description")} />
        </Section>
      ) : null}

      {directory.status !== "error" && directory.data.length > 0 ? (
        <>
          {groups
            .filter((group) => group.countries.length > 0)
            .map((group) => (
              <Section key={group.availability} title={t(`${group.availability}.title`)} lead={t(`${group.availability}.lead`)}>
                <p className="am-field__hint">{t("count", { count: group.countries.length })}</p>
                <ul className="am-countrygrid">
                  {group.countries.map((country) => (
                    <li className="am-countrycard" key={country.isoCode}>
                      <h3 className="pub-card__title">
                        <Link href={{ pathname: "/countries/[countryCode]", params: { countryCode: country.isoCode } }}>
                          <BackendText>{country.name}</BackendText>
                        </Link>
                      </h3>
                      <p>
                        <Badge tone={availabilityTone[country.availability]}>{t(`availability.${country.availability}`)}</Badge>
                      </p>
                      <div className="am-cluster">
                        <Button
                          variant="secondary"
                          href={{ pathname: "/countries/[countryCode]", params: { countryCode: country.isoCode } }}
                        >
                          {country.availability === "waitlist" ? t("join") : t("view")}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            ))}

          <Section>
            <Notice tone="info">{t("fineprint")}</Notice>
          </Section>
        </>
      ) : null}
    </>
  );
}
