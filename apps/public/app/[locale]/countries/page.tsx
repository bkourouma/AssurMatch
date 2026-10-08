import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../i18n/routing";
import { IsoTile } from "../../components/journey/tiles";
import { Badge, type BadgeTone } from "../../components/ui/badge";
import { BackendText } from "../../components/ui/backend-text";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Directory, type DirectoryItem } from "../../components/ui/directory";
import { EmptyState } from "../../components/ui/empty-state";
import { Hero } from "../../components/ui/hero";
import { Section } from "../../components/ui/section";
import { listCountryDirectory, type CountryAvailability, type PublicCountryDirectoryItem } from "../../lib/public-api";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";

/**
 * Countries directory (SITE-107). The directory is split by availability: open countries and pilot
 * countries lead to their country page, countries on the waiting list lead to the same page, which
 * renders its waiting variant instead of a comparison journey. Each group is a directory of rows:
 * the ISO code plate, the country name, what it is open for, its availability label, and the arrow
 * to its page. The label repeats the group heading on purpose: a row read on its own (a screen reader
 * jumping between links, a visitor scanning a long list) still says whether the country is open.
 */

const AVAILABILITY_TONE: Record<CountryAvailability, BadgeTone> = { open: "new", pilot: "pilot", waitlist: "soon" };

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

  /** What the country is open for, on one line; a waiting country says what the visitor can do. */
  function countryRow(country: PublicCountryDirectoryItem): DirectoryItem {
    const capabilities = [
      country.comparisonEnabled ? t("capability.comparison") : null,
      country.quoteEnabled ? t("capability.quote") : null,
      country.currency ? country.currency : null
    ].filter((line): line is string => line !== null);
    const meta = country.availability === "waitlist" ? t("join") : capabilities.join(" · ");
    return {
      key: country.isoCode,
      tile: <IsoTile isoCode={country.isoCode} />,
      title: (
        <>
          <BackendText>{country.name}</BackendText>
          <span className="am-visually-hidden">{` - ${country.availability === "waitlist" ? t("join") : t("view")}`}</span>
        </>
      ),
      ...(meta ? { meta: <BackendText>{meta}</BackendText> } : {}),
      aside: <Badge tone={AVAILABILITY_TONE[country.availability]}>{t(`availability.${country.availability}`)}</Badge>,
      href: { pathname: "/countries/[countryCode]", params: { countryCode: country.isoCode } }
    };
  }

  const visibleGroups = groups.filter((group) => group.countries.length > 0);

  return (
    <>
      <Hero
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
          <EmptyState icon="globe" align="center" title={t("empty.title")} description={t("empty.description")} />
        </Section>
      ) : null}

      {directory.status !== "error" && directory.data.length > 0
        ? visibleGroups.map((group, index) => (
            <Section
              key={group.availability}
              title={t(`${group.availability}.title`)}
              lead={t(`${group.availability}.lead`)}
              tone={index % 2 === 1 ? "muted" : "default"}
            >
              <Directory
                items={group.countries.map(countryRow)}
                label={t(`${group.availability}.title`)}
                columns={2}
              />
              {index === visibleGroups.length - 1 ? <p className="am-j-note am-j-note--after">{t("fineprint")}</p> : null}
            </Section>
          ))
        : null}
    </>
  );
}
