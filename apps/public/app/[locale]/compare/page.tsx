import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../i18n/routing";
import { OfferScore, ScoreBreakdown, SponsoredBadge } from "../../components/offer-cards";
import { JourneyHeroNotice } from "../../components/public-journey";
import { EntrySelector, type EntrySelectorProduct } from "../../components/site/entry-selector";
import { BackendText } from "../../components/ui/backend-text";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { Hero } from "../../components/ui/hero";
import { Icon, type IconName } from "../../components/ui/icons";
import { IconTile } from "../../components/ui/icon-tile";
import { Notice } from "../../components/ui/notice";
import { Section } from "../../components/ui/section";
import { comparePublicOffers, listPublicProducts } from "../../lib/public-api";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import { readVisitorCountry } from "../../lib/visitor-country";
import "../../styles/pages/journey.css";

/**
 * Side-by-side comparison of 2 to 4 indicative offers, aligned criterion by criterion.
 *
 * `/comparer` with no `ids` is where the header's main call to action lands, so it is an entry
 * point, not an error: it offers the country/product selector and says how a comparison is built.
 * "Selection incomplete" is kept for what it actually describes - a selection that came in wrong.
 */

type SearchParams = Record<string, string | string[] | undefined>;

/** The three moves that produce a comparison, in the order the visitor makes them. */
const HOW_STEPS = ["country", "offers", "compare"] as const;
const HOW_ICONS: Record<(typeof HOW_STEPS)[number], IconName> = {
  country: "map-pin",
  offers: "list",
  compare: "scale"
};

function idsFrom(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(raw.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean))];
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Compare" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/compare", locale });
}

export default async function PublicComparePage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Compare");
  const common = await getTranslations("Common");
  const query = searchParams ? await searchParams : {};
  const ids = idsFrom(query.ids);
  const priority = Array.isArray(query.priority) ? query.priority[0] : query.priority;
  const selectionValid = ids.length >= 2 && ids.length <= 4;
  // No ids at all is the landing state of the main call to action; ids that do not make a valid
  // selection are a real error and keep their own message.
  const entryState = ids.length === 0;
  const comparison = selectionValid ? await comparePublicOffers(ids, priority) : null;

  // Same entry point as the home page: the visitor country is a default, never a redirection.
  const visitor = entryState ? await readVisitorCountry() : null;
  const selectable = visitor ? visitor.directory.filter((country) => country.availability !== "waitlist") : [];
  const preselected = selectable.find((country) => country.isoCode === visitor?.isoCode) ?? selectable[0];
  const entryProducts: EntrySelectorProduct[] =
    entryState && preselected
      ? (await listPublicProducts(preselected.isoCode)).data.map((product) => ({
          key: product.key,
          name: product.name,
          countryIso: preselected.isoCode
        }))
      : [];

  function cell(value: string | number | boolean | null): string {
    if (value === null) return common("notProvided");
    if (typeof value === "boolean") return value ? common("yes") : common("no");
    return String(value);
  }

  const items = comparison?.status === "success" ? comparison.data?.items ?? [] : [];
  const compared = comparison?.status === "success" && comparison.data ? comparison.data : null;

  const breadcrumb = (
    <Breadcrumb
      label={common("breadcrumbLabel")}
      items={[
        { name: common("home"), url: localeUrl(locale, "/") },
        { name: t("breadcrumb"), url: localeUrl(locale, "/compare") }
      ]}
    />
  );

  return (
    <>
      <Hero
        kicker={t("kicker")}
        title={entryState ? t("start.title") : t("title")}
        lead={entryState ? t("start.lead") : t("lead")}
        size="sm"
        breadcrumb={breadcrumb}
        {...(entryState && selectable.length > 0
          ? {
              aside: (
                <div className="am-j-entry">
                  <EntrySelector
                    title={t("start.selectorTitle")}
                    countries={selectable.map((country) => ({ isoCode: country.isoCode, name: country.name }))}
                    products={entryProducts}
                    defaultCountry={preselected?.isoCode ?? null}
                  />
                </div>
              )
            }
          : {})}
      >
        <JourneyHeroNotice />
      </Hero>

      {entryState ? (
        <Section title={t("how.title")} lead={t("how.lead")} tone="muted">
          <ol className="am-j-features">
            {HOW_STEPS.map((step) => (
              <li className="am-j-feature" key={step}>
                <IconTile name={HOW_ICONS[step]} size="sm" />
                <div>
                  <p className="am-j-feature__title">{t(`how.${step}.title`)}</p>
                  <p className="am-j-feature__detail">{t(`how.${step}.description`)}</p>
                </div>
              </li>
            ))}
          </ol>
          {selectable.length === 0 ? (
            <div className="am-cluster am-j-tail">
              <Button href="/countries" icon={<Icon name="globe" size={18} />}>
                {t("seeCountries")}
              </Button>
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* One empty state, one way forward: the page never repeats the same button twice. */}
      {!entryState && !selectionValid ? (
        <Section>
          <EmptyState
            icon="scale"
            tone="muted"
            align="center"
            title={t("selectionError.title")}
            description={t("selectionError.description")}
            action={
              <Button href="/countries" icon={<Icon name="globe" size={18} />}>
                {t("seeCountries")}
              </Button>
            }
          />
        </Section>
      ) : null}

      {comparison && !compared ? (
        <Section>
          <EmptyState
            icon="wifi-off"
            tone="muted"
            align="center"
            title={t("unavailable.title")}
            description={comparison.publicMessage ?? t("unavailable.description")}
            action={
              <Button href="/countries" variant="secondary">
                {t("seeCountries")}
              </Button>
            }
          />
        </Section>
      ) : null}

      {compared ? (
        <>
          <Section title={t("tableLabel")} spacing="compact">
            <div className="am-stack am-stack--lg">
              <Notice tone="indicative">
                <BackendText>{compared.disclaimer}</BackendText>
              </Notice>
              <div>
                <p className="am-j-scroll-hint">{t("scrollHint")}</p>
                <div className="am-table-wrap">
                  <table className="am-table am-table--striped am-j-compare" aria-label={t("tableLabel")}>
                    <thead>
                      <tr>
                        <th scope="col">{t("criterion")}</th>
                        {items.map((offer) => (
                          <th scope="col" key={offer.id}>
                            <span className="am-j-compare__head">
                              <span className="am-j-compare__name">
                                <BackendText>{offer.name}</BackendText>
                              </span>
                              {offer.score ? <OfferScore score={offer.score} /> : null}
                              <SponsoredBadge offer={offer} />
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {compared.rows.map((row) => (
                        <tr key={row.key}>
                          <th scope="row">
                            <BackendText>{row.label}</BackendText>
                          </th>
                          {items.map((offer) => (
                            <td key={offer.id}>
                              <BackendText>{cell(row.values[offer.id] ?? null)}</BackendText>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Section>

          <Section title={t("scoresTitle")} tone="muted">
            <ul className="am-j-scorecards">
              {items.map((offer) => (
                <li className="am-j-scorecard" key={offer.id}>
                  <div className="am-j-scorecard__head">
                    <h3 className="am-j-scorecard__title">
                      <BackendText>{offer.name}</BackendText>
                    </h3>
                    {offer.score ? <OfferScore score={offer.score} size="lg" /> : null}
                  </div>
                  <SponsoredBadge offer={offer} />
                  {offer.score ? <ScoreBreakdown score={offer.score} /> : null}
                  <div className="am-cluster">
                    <Button
                      variant="secondary"
                      href={{ pathname: "/offers/[offerId]", params: { offerId: offer.id } }}
                      iconAfter={<Icon name="arrow-right" size={18} />}
                    >
                      {common("seeDetail")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section ariaLabel={t("journeyLabel")} spacing="compact">
            <div className="am-cluster">
              <Button variant="secondary" href="/countries" icon={<Icon name="globe" size={18} />}>
                {t("seeCountries")}
              </Button>
            </div>
          </Section>
        </>
      ) : null}
    </>
  );
}
