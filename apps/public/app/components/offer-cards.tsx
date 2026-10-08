import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { OfferDetail, OfferSummary } from "../../../../packages/shared/contracts/quote.contracts";
import { BackendText } from "./ui/backend-text";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Icon } from "./ui/icons";
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
 * orange of the palette: orange means "sponsored" and nothing else, green never signals a paid
 * placement.
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

/** Indicative score out of 100: outlined, because it is indicative. */
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
      <div className="am-j-score__body">
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
      </div>
    </details>
  );
}

/**
 * Guarantees as a ruled list: a green tick for an included guarantee (green means "included" and
 * nothing else), a neutral minus otherwise. The word itself stays for assistive technology.
 */
export function GuaranteeList({ offer }: { offer: OfferSummary | OfferDetail }) {
  const t = useTranslations("OfferCards");
  if (offer.guarantees.length === 0) return null;
  return (
    <ul className="am-j-ticks" data-size="sm">
      {offer.guarantees.map((guarantee) => (
        <li key={guarantee.key} data-included={guarantee.included ? "true" : "false"}>
          <Icon name={guarantee.included ? "check" : "minus"} size={20} />
          <span>
            <span className="am-visually-hidden">{`${guarantee.included ? t("included") : t("notIncluded")} : `}</span>
            <BackendText>{guarantee.label}</BackendText>
            {guarantee.detail ? (
              <span className="am-j-ticks__detail">
                <BackendText>{guarantee.detail}</BackendText>
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Criteria of an offer as a ruled definition list.
 *
 * `variant="card"` drops everything the card already prints above the disclosure - the price, the
 * fact grid and the update date - so "Garanties détaillées" adds information rather than repeating
 * it. `variant="full"` keeps the complete list for the offer detail page, which is the canonical
 * reference of an offer.
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
          <div>
            <dt>{t("criteria.price")}</dt>
            <dd>
              {offer.indicativePriceMin !== undefined ? t("fromAmount", { amount: money(offer.indicativePriceMin) }) : t("priceToConfirm")} (
              <BackendText>{offer.indicativePriceLabel}</BackendText>)
            </dd>
          </div>
          <div>
            <dt>{t("criteria.partner")}</dt>
            <dd>
              <BackendText>{offer.partnerName ?? offer.brokerName ?? t("defaultPartner")}</BackendText>
            </dd>
          </div>
          <div>
            <dt>{t("criteria.insurer")}</dt>
            <dd>
              <BackendText>{offer.insurerName ?? t("notProvided")}</BackendText>
            </dd>
          </div>
        </>
      )}
      <div>
        <dt>{t("criteria.guaranteeLevel")}</dt>
        <dd>{offer.guaranteeLevel !== undefined ? t("guaranteeLevelValue", { level: offer.guaranteeLevel }) : t("notProvided")}</dd>
      </div>
      {repeated ? null : (
        <>
          <div>
            <dt>{t("criteria.deductible")}</dt>
            <dd className="am-tabular">{money(offer.deductibleAmount)}</dd>
          </div>
          <div>
            <dt>{t("criteria.ceiling")}</dt>
            <dd className="am-tabular">{money(offer.coverageCeiling)}</dd>
          </div>
          <div>
            <dt>{t("criteria.processing")}</dt>
            <dd>{offer.processingDelayDays !== undefined ? t("processingDays", { days: offer.processingDelayDays }) : t("notProvided")}</dd>
          </div>
          <div>
            <dt>{t("criteria.payment")}</dt>
            <dd>{paymentKey ? t(`payment.${paymentKey}`) : offer.paymentFlexibility ?? t("notProvided")}</dd>
          </div>
        </>
      )}
      {offer.guarantees.length > 0 ? (
        <div>
          <dt>{t("criteria.guarantees")}</dt>
          <dd>
            <GuaranteeList offer={offer} />
          </dd>
        </div>
      ) : null}
      {/* On the card, the update date sits at first level (FR-011, `content/02`), outside this
          drawer; the detail page's full criteria list shows it here. */}
      {!repeated && offer.updatedAt ? (
        <div>
          <dt>{t("criteria.updatedAt")}</dt>
          <dd>{formatDate(offer.updatedAt, { locale, ...(countryCode ? { countryIso: countryCode } : {}) })}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/**
 * Indicative price block. Dashed, like everything that is still to be confirmed: the amount, the
 * offer's own price label and the "à confirmer par le courtier partenaire" sentence travel together
 * and are never closable.
 */
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
      <p className="am-j-price__amount am-tabular">{amount ? t("fromAmount", { amount }) : t("priceToConfirm")}</p>
      <p className="am-j-price__note">
        <BackendText>{offer.indicativePriceLabel}</BackendText>
      </p>
      <p className="am-j-price__notice">{t("priceNotice")}</p>
    </div>
  );
}

/**
 * Guarantees as small labels on the card: a green tick when included, a neutral minus when not. The
 * full list with details lives in the card's disclosure and on the detail page.
 */
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

/** One cell of the card's fixed label grid: the label is always printed, the value or "non renseigné". */
function GridCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="am-j-offer__cell">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * One indicative offer of the list. Every card has the same structure, in the same order, whatever
 * the offer carries: name (and the sponsored label when there is one), score, update date, the dashed
 * indicative price, then a fixed grid of six labelled facts, so the columns read across the cards.
 * A missing value prints "non renseigné" in its cell rather than collapsing the grid.
 */
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
  const locale = useLocale();
  const params = { countryCode, productKey };
  const money = (value: number | undefined) =>
    formatMoney(value, { locale, iso: countryCode, ...(currency ? { currency } : {}) }) ?? t("notProvided");
  const paymentKey = paymentKeyOf(offer.paymentFlexibility);

  return (
    <article className="am-j-offer" aria-label={offer.name} data-sponsored={offer.isSponsored ? "true" : undefined}>
      <header className="am-j-offer__head">
        <div className="am-j-offer__ident">
          <h3 className="am-j-offer__name">
            <BackendText>{offer.name}</BackendText>
          </h3>
          <SponsoredBadge offer={offer} />
          <p className="am-j-offer__updated">
            {t("criteria.updatedAt")} :{" "}
            {offer.updatedAt ? formatDate(offer.updatedAt, { locale, countryIso: countryCode }) : t("notProvided")}
          </p>
        </div>
        {offer.score ? <OfferScore score={offer.score} size="lg" /> : null}
      </header>

      <div className="am-j-offer__body">
        <OfferPrice offer={offer} countryCode={countryCode} currency={currency} />
        <dl className="am-j-offer__grid">
          <GridCell label={t("criteria.insurer")}>
            <BackendText>{offer.insurerName ?? t("notProvided")}</BackendText>
          </GridCell>
          <GridCell label={t("criteria.partner")}>
            <BackendText>{offer.partnerName ?? offer.brokerName ?? t("defaultPartner")}</BackendText>
          </GridCell>
          <GridCell label={t("criteria.deductible")}>
            <span className="am-tabular">{money(offer.deductibleAmount)}</span>
          </GridCell>
          <GridCell label={t("criteria.ceiling")}>
            <span className="am-tabular">{money(offer.coverageCeiling)}</span>
          </GridCell>
          <GridCell label={t("criteria.processing")}>
            {offer.processingDelayDays !== undefined ? t("processingDays", { days: offer.processingDelayDays }) : t("notProvided")}
          </GridCell>
          <GridCell label={t("criteria.payment")}>
            {paymentKey ? t(`payment.${paymentKey}`) : offer.paymentFlexibility ?? t("notProvided")}
          </GridCell>
        </dl>
      </div>

      {offer.guaranteeSummary ? (
        <p className="am-j-offer__summary">
          <BackendText>{offer.guaranteeSummary}</BackendText>
        </p>
      ) : null}

      <OfferGuarantees offer={offer} limit={GUARANTEES_ON_CARD} />

      {/* Only what the card has not already shown: guarantee level, the full guarantees with their
          details and the score breakdown. */}
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

      <footer className="am-j-offer__foot">
        {/* The checkbox is attached to the comparison form through `form=`, so the list still
            submits a selection without any JavaScript. The accessible name is the visible word
            plus the offer name, so it stays unique in the list. */}
        <label className="am-j-pick" title={t("selectLabel")}>
          <input type="checkbox" name="ids" value={offer.id} form="compare-form" />
          <span className="am-j-pick__off">{t("pick")}</span>
          <span className="am-j-pick__on">{t("picked")}</span>
          {/* Comma-separated so the accessible name reads "Ajouter a la comparaison, {name}" /
              "Retirer de la comparaison, {name}" (charte 5), never the two run together. */}
          <span className="am-visually-hidden">
            {", "}
            <BackendText>{offer.name}</BackendText>
          </span>
        </label>

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
      </footer>
    </article>
  );
}
