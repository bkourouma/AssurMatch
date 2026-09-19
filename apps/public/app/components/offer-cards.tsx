import { useLocale, useTranslations } from "next-intl";
import type { OfferDetail, OfferSummary } from "../../../../packages/shared/contracts/quote.contracts";
import { BackendText } from "./ui/backend-text";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Icon } from "./ui/icons";
import { Notice } from "./ui/notice";
import { ScorePill } from "./ui/score-pill";
import { formatDate, formatMoney } from "../lib/country-format";

const paymentKeys = ["annual", "semiannual", "quarterly", "monthly"] as const;
type PaymentKey = (typeof paymentKeys)[number];

const criterionKeys = [
  "guaranteeLevel",
  "price",
  "deductible",
  "processingSpeed",
  "paymentFlexibility",
  "informationQuality",
  "userPreferences"
] as const;
type CriterionKey = (typeof criterionKeys)[number];

function paymentKeyOf(value: string | undefined): PaymentKey | null {
  return value && (paymentKeys as readonly string[]).includes(value) ? (value as PaymentKey) : null;
}

function criterionKeyOf(value: string): CriterionKey | null {
  return (criterionKeys as readonly string[]).includes(value) ? (value as CriterionKey) : null;
}

/**
 * Sponsorship must always be visible next to the offer name (Constitution VIII), and it wears the
 * warning tone: green is a validation colour and never signals a paid placement.
 */
export function SponsoredBadge({ offer }: { offer: Pick<OfferSummary, "isSponsored" | "sponsorLabel"> }) {
  const t = useTranslations("OfferCards");
  if (!offer.isSponsored) return null;
  return (
    <Badge tone="sponsored" icon={<Icon name="star" size={16} />} title={t("sponsoredTitle")}>
      {offer.sponsorLabel ? t("sponsoredWithLabel", { label: offer.sponsorLabel }) : t("sponsored")}
    </Badge>
  );
}

/** Indicative score out of 100, with the per-criterion explanation folded underneath. */
export function OfferScore({ score }: { score: NonNullable<OfferSummary["score"]> }) {
  const t = useTranslations("OfferCards");
  return <ScorePill score={score.total} label={t("scoreAria", { total: score.total })} />;
}

export function ScoreBreakdown({ score }: { score: NonNullable<OfferSummary["score"]> }) {
  const t = useTranslations("OfferCards");
  return (
    <details className="pub-score">
      <summary>{t("scoreSummary", { total: score.total })}</summary>
      <p className="pub-score__label">
        <BackendText>{score.label}</BackendText>
      </p>
      <div className="pub-table-wrap">
        <table className="pub-table">
          <thead>
            <tr>
              <th>{t("table.criterion")}</th>
              <th>{t("table.weight")}</th>
              <th>{t("table.points")}</th>
              <th>{t("table.explanation")}</th>
            </tr>
          </thead>
          <tbody>
            {score.breakdown.map((line) => {
              const key = criterionKeyOf(line.criterion);
              return (
                <tr key={line.criterion}>
                  <td>{key ? t(`criterionLabels.${key}`) : line.criterion}</td>
                  <td>{line.weight}%</td>
                  <td>{line.points}</td>
                  <td>
                    <BackendText>{line.explanation}</BackendText>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function OfferCriteria({
  offer,
  countryCode,
  currency
}: {
  offer: OfferSummary | OfferDetail;
  countryCode?: string | undefined;
  currency?: string | undefined;
}) {
  const t = useTranslations("OfferCards");
  const locale = useLocale();
  // Amounts and dates follow the country being browsed, not a hard-coded fr-FR/XOF pair.
  const money = (value: number | undefined) =>
    formatMoney(value, { locale, ...(countryCode ? { iso: countryCode } : {}), ...(currency ? { currency } : {}) }) ?? t("notProvided");
  const paymentKey = paymentKeyOf(offer.paymentFlexibility);

  return (
    <dl className="pub-criteria">
      <dt>{t("criteria.price")}</dt>
      <dd>
        {offer.indicativePriceMin !== undefined ? t("fromAmount", { amount: money(offer.indicativePriceMin) }) : t("priceToConfirm")} (
        <BackendText>{offer.indicativePriceLabel}</BackendText>)
      </dd>
      <dt>{t("criteria.partner")}</dt>
      <dd>
        <BackendText>{offer.partnerName ?? offer.brokerName ?? t("defaultPartner")}</BackendText>
      </dd>
      <dt>{t("criteria.insurer")}</dt>
      <dd>
        <BackendText>{offer.insurerName ?? t("notProvided")}</BackendText>
      </dd>
      <dt>{t("criteria.guaranteeLevel")}</dt>
      <dd>{offer.guaranteeLevel !== undefined ? t("guaranteeLevelValue", { level: offer.guaranteeLevel }) : t("notProvided")}</dd>
      <dt>{t("criteria.deductible")}</dt>
      <dd>{money(offer.deductibleAmount)}</dd>
      <dt>{t("criteria.ceiling")}</dt>
      <dd>{money(offer.coverageCeiling)}</dd>
      <dt>{t("criteria.processing")}</dt>
      <dd>{offer.processingDelayDays !== undefined ? t("processingDays", { days: offer.processingDelayDays }) : t("notProvided")}</dd>
      <dt>{t("criteria.payment")}</dt>
      <dd>{paymentKey ? t(`payment.${paymentKey}`) : offer.paymentFlexibility ?? t("notProvided")}</dd>
      {offer.guarantees.length > 0 ? (
        <>
          <dt>{t("criteria.guarantees")}</dt>
          <dd>
            <ul className="pub-list">
              {offer.guarantees.map((guarantee) => (
                <li key={guarantee.key}>
                  {guarantee.included ? t("included") : t("notIncluded")}:{" "}
                  <BackendText>
                    {guarantee.label}
                    {guarantee.detail ? ` (${guarantee.detail})` : ""}
                  </BackendText>
                </li>
              ))}
            </ul>
          </dd>
        </>
      ) : null}
      {offer.updatedAt ? (
        <>
          <dt>{t("criteria.updatedAt")}</dt>
          <dd>{formatDate(offer.updatedAt, { locale, ...(countryCode ? { countryIso: countryCode } : {}) })}</dd>
        </>
      ) : null}
    </dl>
  );
}

export function OfferCard({
  offer,
  countryCode,
  productKey,
  currency
}: {
  offer: OfferSummary;
  countryCode: string;
  productKey: string;
  currency?: string;
}) {
  const t = useTranslations("OfferCards");
  const params = { countryCode, productKey };

  return (
    <article className="pub-card pub-offer" aria-label={offer.name}>
      <div className="pub-offer__header">
        <h3 className="pub-offer__title">
          <label className="pub-offer__pick">
            <input type="checkbox" name="ids" value={offer.id} form="compare-form" aria-label={t("selectLabel")} />{" "}
            <BackendText>{offer.name}</BackendText>
          </label>
        </h3>
        <div className="am-cluster">
          {offer.score ? <OfferScore score={offer.score} /> : null}
          <SponsoredBadge offer={offer} />
        </div>
      </div>
      {offer.guaranteeSummary ? (
        <p className="pub-offer__summary">
          <BackendText>{offer.guaranteeSummary}</BackendText>
        </p>
      ) : null}
      {/* The indicative-price notice travels with the amount and can never be dismissed. */}
      <Notice tone="indicative">{t("priceNotice")}</Notice>
      <OfferCriteria offer={offer} countryCode={countryCode} currency={currency} />
      {offer.score ? <ScoreBreakdown score={offer.score} /> : null}
      <p className="pub-offer__disclaimer">
        <BackendText>{offer.disclaimer}</BackendText>
      </p>
      <nav className="am-cluster" aria-label={t("actionsLabel", { name: offer.name })}>
        <Button
          variant="secondary"
          href={{ pathname: "/offers/[offerId]", params: { offerId: offer.id }, query: { country: countryCode, product: productKey } }}
        >
          {t("detail")}
        </Button>
        <Button
          href={{
            pathname: "/countries/[countryCode]/products/[productKey]/quote",
            params,
            query: { offerId: offer.id }
          }}
        >
          {t("quote")}
        </Button>
      </nav>
    </article>
  );
}
