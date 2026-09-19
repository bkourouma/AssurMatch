import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../i18n/routing";
import { OfferScore, ScoreBreakdown, SponsoredBadge } from "../../components/offer-cards";
import { IndicativeOfferNotice, TechnicalRoleNotice } from "../../components/public-journey";
import { BackendText } from "../../components/ui/backend-text";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { Hero } from "../../components/ui/hero";
import { Notice } from "../../components/ui/notice";
import { Section } from "../../components/ui/section";
import { comparePublicOffers } from "../../lib/public-api";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";

/** Side-by-side comparison of 2 to 4 indicative offers, aligned criterion by criterion. */

type SearchParams = Record<string, string | string[] | undefined>;

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
  const comparison = ids.length >= 2 && ids.length <= 4 ? await comparePublicOffers(ids, priority) : null;

  function cell(value: string | number | boolean | null): string {
    if (value === null) return common("notProvided");
    if (typeof value === "boolean") return value ? common("yes") : common("no");
    return String(value);
  }

  const items = comparison?.status === "success" ? comparison.data?.items ?? [] : [];

  return (
    <>
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: t("breadcrumb"), url: localeUrl(locale, "/compare") }
          ]}
        />
      </div>

      <Hero title={t("title")} lead={t("lead")}>
        <TechnicalRoleNotice />
        <IndicativeOfferNotice />
      </Hero>

      {ids.length < 2 || ids.length > 4 ? (
        <Section>
          <EmptyState
            title={t("selectionError.title")}
            description={t("selectionError.description")}
            action={
              <Button href="/countries" variant="secondary">
                {t("backToCountries")}
              </Button>
            }
          />
        </Section>
      ) : null}

      {comparison && (comparison.status === "error" || !comparison.data) ? (
        <Section>
          <EmptyState title={t("unavailable.title")} description={comparison.publicMessage ?? t("unavailable.description")} />
        </Section>
      ) : null}

      {comparison?.status === "success" && comparison.data ? (
        <>
          <Section title={t("tableLabel")}>
            <Notice tone="indicative">
              <BackendText>{comparison.data.disclaimer}</BackendText>
            </Notice>
            <div className="pub-table-wrap">
              <table className="pub-table" aria-label={t("tableLabel")}>
                <thead>
                  <tr>
                    <th>{t("criterion")}</th>
                    {items.map((offer) => (
                      <th key={offer.id}>
                        <BackendText>{offer.name}</BackendText>
                        <br />
                        <SponsoredBadge offer={offer} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.data.rows.map((row) => (
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
          </Section>

          <Section title={t("scoresTitle")} tone="muted">
            <ul className="pub-cards pub-cards--two">
              {items.map((offer) => (
                <li className="pub-card" key={offer.id}>
                  <div className="pub-offer__header">
                    <h3 className="pub-card__title">
                      <BackendText>{offer.name}</BackendText>
                    </h3>
                    {offer.score ? <OfferScore score={offer.score} /> : null}
                  </div>
                  {offer.score ? <ScoreBreakdown score={offer.score} /> : null}
                  <div className="am-cluster">
                    <Button variant="secondary" href={{ pathname: "/offers/[offerId]", params: { offerId: offer.id } }}>
                      {common("seeDetail")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </>
      ) : null}

      <Section ariaLabel={t("journeyLabel")}>
        <div className="am-cluster">
          <Button variant="secondary" href="/countries">
            {t("backToCountries")}
          </Button>
        </div>
      </Section>
    </>
  );
}
