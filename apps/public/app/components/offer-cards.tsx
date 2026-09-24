import { useLocale, useTranslations } from "next-intl";
import type { OfferDetail, OfferSummary } from "../../../../packages/shared/contracts/quote.contracts";
import { BackendText } from "./ui/backend-text";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Icon, type IconName } from "./ui/icons";
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
export function OfferScore({ score, size }: { score: NonNullable<OfferSummary["score"]>; size?: "md" | "lg" }) {
  const t = useTranslations("OfferCards");
  return <ScorePill score={score.total} label={t("scoreAria", { total: score.total })} size={size ?? "md"} />;
}

/**
 * Per-criterion explanation of the indicative score.
 *
 * The table stacks into one labelled block per criterion under 680px rather than forcing a sideways
 * scroll inside an offer card, so the explicit ARIA roles restore the table semantics that the
 * `display: block` of the stacked layout would otherwise drop.
 */
export function ScoreBreakdown({ score }: { score: NonNullable<OfferSummary["score"]> }) {
  const t = useTranslations("OfferCards");
  return (
    <details className="am-j-score">
      <summary>{t("scoreSummary", { total: score.total })}</summary>
      <p className="am-j-score__label">
        <BackendText>{score.label}</BackendText>
      </p>
      <table className="am-j-scoretable" role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">
              {t("table.criterion")}
            </th>
            <th scope="col" role="columnheader">
              {t("table.weight")}
            </th>
            <th scope="col" role="columnheader">
              {t("table.points")}
            </th>
            <th scope="col" role="columnheader">
              {t("table.explanation")}
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {score.breakdown.map((line) => {
            const key = criterionKeyOf(line.criterion);
            return (
              <tr key={line.criterion} role="row">
                <td role="cell" data-label={t("table.criterion")}>
                  {key ? t(`criterionLabels.${key}`) : line.criterion}
                </td>
                <td role="cell" className="am-tabular" data-label={t("table.weight")}>
                  {line.weight}%
                </td>
                <td role="cell" className="am-tabular" data-label={t("table.points")}>
                  {line.points}
                </td>
                <td role="cell" data-label={t("table.explanation")}>
                  <BackendText>{line.explanation}</BackendText>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

/**
 * Criteria of an offer as a key/value list.
 *
 * `variant="card"` drops everything the card already prints above the disclosure - the price panel,
 * the four fact tiles and the insurer/partner line - so "tous les criteres" adds information rather
 * than repeating it a second time three centimetres lower. `variant="full"` keeps the complete list
 * for the offer detail page, which is the canonical reference of an offer.
 */
export function OfferCriteria({
  offer,
  countryCode,
  currency,
  variant = "full"
}: {
  offer: OfferSummary | OfferDetail;
  countryCode?: string | undefined;
  currency?: string | undefined;
  variant?: "full" | "card";
}) {
  const t = useTranslations("OfferCards");
  const locale = useLocale();
  // Amounts and dates follow the country being browsed, not a hard-coded fr-FR/XOF pair.
  const money = (value: number | undefined) =>
    formatMoney(value, { locale, ...(countryCode ? { iso: countryCode } : {}), ...(currency ? { currency } : {}) }) ?? t("notProvided");
  const paymentKey = paymentKeyOf(offer.paymentFlexibility);
  const repeated = variant === "card";

  return (
    <dl className="am-j-criteria">
      {repeated ? null : (
        <>
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
        </>
      )}
      <dt>{t("criteria.guaranteeLevel")}</dt>
      <dd>{offer.guaranteeLevel !== undefined ? t("guaranteeLevelValue", { level: offer.guaranteeLevel }) : t("notProvided")}</dd>
      {repeated ? null : (
        <>
          <dt>{t("criteria.deductible")}</dt>
          <dd>{money(offer.deductibleAmount)}</dd>
          <dt>{t("criteria.ceiling")}</dt>
          <dd>{money(offer.coverageCeiling)}</dd>
          <dt>{t("criteria.processing")}</dt>
          <dd>{offer.processingDelayDays !== undefined ? t("processingDays", { days: offer.processingDelayDays }) : t("notProvided")}</dd>
          <dt>{t("criteria.payment")}</dt>
          <dd>{paymentKey ? t(`payment.${paymentKey}`) : offer.paymentFlexibility ?? t("notProvided")}</dd>
        </>
      )}
      {offer.guarantees.length > 0 ? (
        <>
          <dt>{t("criteria.guarantees")}</dt>
          <dd>
            <ul className="am-j-bullets">
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

/**
 * Identity line of an offer: who carries the risk and who is responsible for the quote. The label of
 * each role is only exposed to assistive technology; the icon carries it visually.
 */
export function OfferParties({ offer }: { offer: OfferSummary | OfferDetail }) {
  const t = useTranslations("OfferCards");
  const partner = offer.partnerName ?? offer.brokerName;
  return (
    <p className="am-j-meta">
      {offer.insurerName ? (
        <span>
          <Icon name="building-2" size={16} />
          <span className="am-visually-hidden">{`${t("criteria.insurer")} `}</span>
          <BackendText>{offer.insurerName}</BackendText>
        </span>
      ) : null}
      {partner ? (
        <span>
          <Icon name="handshake" size={16} />
          <span className="am-visually-hidden">{`${t("criteria.partner")} `}</span>
          <BackendText>{partner}</BackendText>
        </span>
      ) : null}
    </p>
  );
}

/** Indicative price block. The indicative notice travels with the amount and is never closable. */
export function OfferPrice({
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
  const amount = formatMoney(offer.indicativePriceMin, {
    locale,
    ...(countryCode ? { iso: countryCode } : {}),
    ...(currency ? { currency } : {})
  });

  return (
    <div className="am-j-price">
      <p className="am-j-price__label">{t("criteria.price")}</p>
      <p className="am-j-price__amount am-tabular">
        {amount ? t("fromAmount", { amount }) : t("priceToConfirm")}
      </p>
      <p className="am-j-price__note">
        <BackendText>{offer.indicativePriceLabel}</BackendText>
      </p>
      <Notice tone="indicative" compact>
        {t("priceNotice")}
      </Notice>
    </div>
  );
}

const FACT_ICONS: Record<"deductible" | "ceiling" | "processing" | "payment", IconName> = {
  deductible: "coins",
  ceiling: "shield-check",
  processing: "clock",
  payment: "calendar"
};

/** Four mini statistics: franchise, plafond, delai de traitement, flexibilite de paiement. */
export function OfferFacts({
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
  const money = (value: number | undefined) =>
    formatMoney(value, { locale, ...(countryCode ? { iso: countryCode } : {}), ...(currency ? { currency } : {}) }) ?? t("notProvided");
  const paymentKey = paymentKeyOf(offer.paymentFlexibility);

  const facts: Array<{ key: keyof typeof FACT_ICONS; label: string; value: string }> = [
    { key: "deductible", label: t("criteria.deductible"), value: money(offer.deductibleAmount) },
    { key: "ceiling", label: t("criteria.ceiling"), value: money(offer.coverageCeiling) },
    {
      key: "processing",
      label: t("criteria.processing"),
      value: offer.processingDelayDays !== undefined ? t("processingDays", { days: offer.processingDelayDays }) : t("notProvided")
    },
    {
      key: "payment",
      label: t("criteria.payment"),
      value: paymentKey ? t(`payment.${paymentKey}`) : offer.paymentFlexibility ?? t("notProvided")
    }
  ];

  return (
    <div className="am-j-facts">
      {facts.map((fact) => (
        <div className="am-j-fact" key={fact.key}>
          <p className="am-j-fact__label">
            <Icon name={FACT_ICONS[fact.key]} size={16} />
            {fact.label}
          </p>
          <p className="am-j-fact__value am-tabular">{fact.value}</p>
        </div>
      ))}
    </div>
  );
}

/** Guarantees as pills: a green tick when included, a neutral minus when it is not. */
export function OfferGuarantees({ offer, limit }: { offer: OfferSummary | OfferDetail; limit?: number }) {
  const t = useTranslations("OfferCards");
  if (offer.guarantees.length === 0) return null;
  const shown = limit ? offer.guarantees.slice(0, limit) : offer.guarantees;
  const hidden = offer.guarantees.length - shown.length;

  return (
    <ul className="am-pill-list" aria-label={t("criteria.guarantees")}>
      {shown.map((guarantee) => (
        <li
          className="am-pill am-j-guarantee"
          key={guarantee.key}
          data-included={guarantee.included ? "true" : "false"}
          title={guarantee.detail ?? undefined}
        >
          <Icon name={guarantee.included ? "check" : "minus"} size={16} />
          <span className="am-visually-hidden">{`${guarantee.included ? t("included") : t("notIncluded")} : `}</span>
          <BackendText>{guarantee.label}</BackendText>
        </li>
      ))}
      {hidden > 0 ? <li className="am-pill">{t("moreGuarantees", { count: hidden })}</li> : null}
    </ul>
  );
}

const GUARANTEES_ON_CARD = 6;

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
    <article className="am-j-offer" aria-label={offer.name} data-sponsored={offer.isSponsored ? "true" : undefined}>
      <div className="am-j-offer__top">
        <div className="am-j-offer__ident">
          <div className="am-j-offer__titlerow">
            <h3 className="am-j-offer__name">
              <BackendText>{offer.name}</BackendText>
            </h3>
            <SponsoredBadge offer={offer} />
          </div>
          <OfferParties offer={offer} />
        </div>
        <div className="am-j-offer__side">
          {offer.score ? <OfferScore score={offer.score} size="lg" /> : null}
          {/* The checkbox is attached to the comparison form through `form=`, so the list still
              submits a selection without any JavaScript. The accessible name is the visible word
              plus the offer name, so it stays unique in the list. */}
          <label className="am-j-pick" title={t("selectLabel")}>
            <input type="checkbox" name="ids" value={offer.id} form="compare-form" />
            <span className="am-j-pick__off">{t("pick")}</span>
            <span className="am-j-pick__on">{t("picked")}</span>
            <span className="am-visually-hidden">
              <BackendText>{offer.name}</BackendText>
            </span>
          </label>
        </div>
      </div>

      {offer.guaranteeSummary ? (
        <p className="am-j-offer__summary">
          <BackendText>{offer.guaranteeSummary}</BackendText>
        </p>
      ) : null}

      <div className="am-j-offer__body">
        <OfferPrice offer={offer} countryCode={countryCode} currency={currency} />
        <OfferFacts offer={offer} countryCode={countryCode} currency={currency} />
      </div>

      <OfferGuarantees offer={offer} limit={GUARANTEES_ON_CARD} />

      {/* Only what the card has not already shown: guarantee level, the full guarantees with their
          details, the update date and the score breakdown. */}
      <details className="am-j-more">
        <summary>{t("detailsSummary")}</summary>
        <div className="am-j-more__body">
          <OfferCriteria offer={offer} countryCode={countryCode} currency={currency} variant="card" />
          {offer.score ? <ScoreBreakdown score={offer.score} /> : null}
        </div>
      </details>

      <p className="am-j-offer__disclaimer">
        <BackendText>{offer.disclaimer}</BackendText>
      </p>

      <nav className="am-j-offer__actions" aria-label={t("actionsLabel", { name: offer.name })}>
        <Button
          variant="secondary"
          href={{ pathname: "/offers/[offerId]", params: { offerId: offer.id }, query: { country: countryCode, product: productKey } }}
          iconAfter={<Icon name="arrow-right" size={18} />}
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
