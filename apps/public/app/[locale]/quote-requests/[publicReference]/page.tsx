import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type {
  PublicBrokerStatus,
  PublicQuoteStatus,
  PublicTimelineStep
} from "../../../../../../packages/shared/contracts/public-quote-status";
import {
  PUBLIC_PROPOSAL_STATUSES,
  VISITOR_DECLINE_REASONS,
  type PublicLeadProposal,
  type VisitorDeclineReason
} from "../../../../../../packages/shared/contracts/lead-proposals";
import { toLocale } from "../../../../i18n/routing";
import { ConsentWithdrawal } from "../../../components/forms/consent-withdrawal";
import { CopyReference } from "../../../components/journey/copy-reference";
import { IndicativeOfferNotice } from "../../../components/public-journey";
import { QuoteDocumentUpload } from "../../../components/quote-document-upload";
import { QuoteProposalCard, type QuoteProposalCardLabels } from "../../../components/tracking/quote-proposal-card";
import type { ProposalResponseFormLabels } from "../../../components/tracking/proposal-response-form";
import { hasProposals, QuoteProposalsSlot } from "../../../components/tracking/quote-proposals-slot";
import { BackendText } from "../../../components/ui/backend-text";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { Icon } from "../../../components/ui/icons";
import { IconTile, type IconTileTone } from "../../../components/ui/icon-tile";
import type { IconName } from "../../../components/ui/icons";
import { Notice } from "../../../components/ui/notice";
import { Section } from "../../../components/ui/section";
import { getPublicQuoteStatus, listQuoteDocuments } from "../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";
import "../../../styles/pages/journey.css";

/**
 * Visitor tracking space of a quote request (spec 054 US1). It is never indexed, is served with
 * `Referrer-Policy: no-referrer` (next.config.ts), and is reachable only with the visitor access
 * token handed out at the end of the request or in a notification e-mail.
 *
 * The status comes from `GET /quote-requests/:publicReference?token=` (no-store): a public
 * projection only, never the form answers nor the visitor's contact details. Every refusal of the
 * API is the same neutral 404, so the page shows one neutral message and a way to receive a new
 * link, whatever the reason (unknown reference, wrong, expired or revoked token).
 */

type SearchParams = Record<string, string | string[] | undefined>;
type PageParams = { locale: string; publicReference: string };

const scanKeys = ["pending", "clean", "infected", "failed"] as const;
type ScanKey = (typeof scanKeys)[number];

/** Visual state of a scanned document; green is reserved for the one validating outcome. */
const SCAN_VISUALS: Record<ScanKey, { icon: IconName; tone: IconTileTone }> = {
  pending: { icon: "clock", tone: "neutral" },
  clean: { icon: "file-check", tone: "success" },
  infected: { icon: "alert-triangle", tone: "danger" },
  failed: { icon: "refresh", tone: "warning" }
};

/** Status headline visuals; green only for the one outcome the visitor is waiting for. */
const STATUS_VISUALS: Record<PublicQuoteStatus, { icon: IconName; tone: IconTileTone }> = {
  received: { icon: "check-circle", tone: "neutral" },
  in_review: { icon: "clock", tone: "neutral" },
  transmitted: { icon: "handshake", tone: "neutral" },
  in_progress: { icon: "user-check", tone: "neutral" },
  proposal_available: { icon: "file-check", tone: "success" },
  closed: { icon: "list", tone: "neutral" },
  not_transmitted: { icon: "info", tone: "warning" }
};

const TIMELINE_ICONS: Record<PublicTimelineStep, IconName> = {
  received: "check-circle",
  in_review: "clock",
  transmitted: "handshake",
  accepted: "user-check",
  reassigned: "refresh",
  closed: "list",
  consent_withdrawn: "x-circle",
  not_transmitted: "info"
};

const BROKER_STATUSES: readonly PublicBrokerStatus[] = ["transmitted", "in_progress", "proposal_available", "closed"];
const QUOTE_STATUSES: readonly PublicQuoteStatus[] = ["received", "in_review", "transmitted", "in_progress", "proposal_available", "closed", "not_transmitted"];
const TIMELINE_STEPS: readonly PublicTimelineStep[] = ["received", "in_review", "transmitted", "accepted", "reassigned", "closed", "consent_withdrawn", "not_transmitted"];

function scanKeyOf(status: string): ScanKey | null {
  return (scanKeys as readonly string[]).includes(status) ? (status as ScanKey) : null;
}

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, publicReference } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "QuoteRequest" });
  return {
    ...buildMetadata({
      title: t("trackingTitle", { reference: publicReference }),
      description: t("description"),
      href: "/quote-requests/[publicReference]",
      params: { publicReference },
      locale,
      noindex: true
    }),
    // The token sits in the URL: it must never leak through a Referer header.
    referrer: "no-referrer"
  };
}

export default async function PublicQuoteTrackingPage({
  params,
  searchParams
}: {
  params: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
}) {
  const { locale: rawLocale, publicReference } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations("QuoteRequest");
  const common = await getTranslations("Common");
  const format = await getFormatter();
  const query = searchParams ? await searchParams : {};
  const tokenParam = Array.isArray(query.token) ? query.token[0] : query.token;
  const token = tokenParam && /^[A-Za-z0-9_-]{16,}$/.test(tokenParam) ? tokenParam : undefined;

  const [statusResult, documents] = token
    ? await Promise.all([getPublicQuoteStatus(publicReference, token), listQuoteDocuments(publicReference, token)])
    : [undefined, undefined];
  const view = statusResult?.status === "success" ? statusResult.data : undefined;

  const formatDate = (value: string | null | undefined): string | null => {
    const date = validDate(value);
    return date ? format.dateTime(date, { dateStyle: "long" }) : null;
  };

  const hero = (
    <Hero
      kicker={t("kicker")}
      title={view ? t("title", { reference: publicReference }) : t("breadcrumb")}
      lead={t("intro")}
      size="sm"
      breadcrumb={
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            {
              name: t("breadcrumb"),
              url: localeUrl(locale, "/quote-requests/[publicReference]", { publicReference })
            }
          ]}
        />
      }
    >
      <IndicativeOfferNotice />
    </Hero>
  );

  // No token, or any refusal of the API: one neutral message, whatever the reason.
  if (!token || !view) {
    const message =
      statusResult?.status === "rate_limited"
        ? t("access.rateLimited")
        : statusResult?.status === "error"
          ? t("access.unavailable")
          : t("access.body");
    return (
      <>
        {hero}
        <Section>
          <div className="am-stack am-stack--lg am-j-column">
            <EmptyState
              icon="lock"
              tone="muted"
              align="center"
              title={t("access.title")}
              description={message}
              action={
                <Button variant="primary" href="/track" icon={<Icon name="mail" size={18} />}>
                  {t("access.cta")}
                </Button>
              }
            />
          </div>
        </Section>
      </>
    );
  }

  const status: PublicQuoteStatus = isOneOf(QUOTE_STATUSES, view.status) ? view.status : "received";
  const statusVisual = STATUS_VISUALS[status];
  const expiry = formatDate(view.tokenExpiresAt);
  const withdrawnAt = formatDate(view.consent.withdrawnAt);
  const timeline = view.timeline.filter((entry) => isOneOf(TIMELINE_STEPS, entry.step));

  // Spec 055: broker proposals, newest first as the API sends them; never re-ordered or ranked here.
  const proposals: PublicLeadProposal[] = view.consent.withdrawn
    ? []
    : (view.proposals ?? []).filter((proposal) => isOneOf(PUBLIC_PROPOSAL_STATUSES, proposal.status));

  const formatAmount = (amount: number, currency: string): string => {
    try {
      return format.number(amount, { style: "currency", currency, maximumFractionDigits: 0 });
    } catch {
      return `${format.number(amount, { maximumFractionDigits: 0 })} ${currency}`;
    }
  };

  const proposalPrice = (proposal: PublicLeadProposal): string | null => {
    const { priceMin, priceMax, currency } = proposal;
    if (priceMin !== undefined && priceMax !== undefined) {
      return priceMin === priceMax
        ? t("proposals.priceSingle", { amount: formatAmount(priceMin, currency) })
        : t("proposals.priceRange", { min: formatAmount(priceMin, currency), max: formatAmount(priceMax, currency) });
    }
    if (priceMin !== undefined) return t("proposals.priceFrom", { amount: formatAmount(priceMin, currency) });
    if (priceMax !== undefined) return t("proposals.priceUpTo", { amount: formatAmount(priceMax, currency) });
    return null;
  };

  const declineReasonLabels = Object.fromEntries(
    VISITOR_DECLINE_REASONS.map((reason) => [reason, t(`proposals.response.declineReasons.${reason}`)])
  ) as Record<VisitorDeclineReason, string>;

  const responseLabels: ProposalResponseFormLabels = {
    legend: t("proposals.response.legend"),
    intro: t("proposals.response.intro"),
    interested: t("proposals.response.interested"),
    declined: t("proposals.response.declined"),
    question: t("proposals.response.question"),
    callbackSlot: t("proposals.response.callbackSlot"),
    callbackSlotHint: t("proposals.response.callbackSlotHint"),
    declineReason: t("proposals.response.declineReason"),
    declineReasonNone: t("proposals.response.declineReasonNone"),
    declineReasons: declineReasonLabels,
    questionLabel: t("proposals.response.questionLabel"),
    questionHint: t("proposals.response.questionHint"),
    questionRequired: t("proposals.response.questionRequired"),
    submit: t("proposals.response.submit"),
    sending: t("proposals.response.sending"),
    recordedTitle: t("proposals.response.recordedTitle"),
    recorded: {
      interested: t("proposals.response.recordedInterested"),
      declined: t("proposals.response.recordedDeclined"),
      question: t("proposals.response.recordedQuestion")
    },
    // Formatted in the browser once the API returns the recording time.
    recordedAt: t("proposals.response.recordedAt", { date: "{date}" }),
    notRespondable: t("proposals.response.notRespondable"),
    rateLimited: t("proposals.response.rateLimited"),
    invalid: t("proposals.response.invalid"),
    denied: t("proposals.response.denied"),
    error: t("proposals.response.error")
  };

  const proposalStatusLabels = Object.fromEntries(
    PUBLIC_PROPOSAL_STATUSES.map((value) => [value, t(`proposals.status.${value}`)])
  ) as QuoteProposalCardLabels["status"];

  const proposalLabels = (proposal: PublicLeadProposal): QuoteProposalCardLabels => {
    const validUntil = formatDate(proposal.validUntil) ?? proposal.validUntil;
    const response = proposal.visitorResponse;
    const previousLines: string[] = [];
    if (response) {
      previousLines.push(t(`proposals.response.previousType.${response.type}`));
      if (response.callbackSlot) previousLines.push(t("proposals.response.previousSlot", { slot: response.callbackSlot }));
      if (response.declineReason && isOneOf(VISITOR_DECLINE_REASONS, response.declineReason)) {
        previousLines.push(t("proposals.response.previousReason", { reason: declineReasonLabels[response.declineReason] }));
      }
      if (response.question) previousLines.push(t("proposals.response.previousQuestion", { question: response.question }));
      const at = formatDate(response.at);
      if (at) previousLines.push(t("proposals.response.recordedAt", { date: at }));
    }
    return {
      from: t("proposals.from", { partner: proposal.partnerName }),
      sentAt: t("proposals.sentAt", { date: formatDate(proposal.sentAt) ?? proposal.sentAt }),
      validUntil: t("proposals.validUntil", { date: validUntil }),
      validUntilExpired: t("proposals.validUntilExpired", { date: validUntil }),
      messageLabel: t("proposals.messageLabel"),
      priceLabel: t("proposals.priceLabel"),
      price: proposalPrice(proposal),
      guaranteesLabel: t("proposals.guaranteesLabel"),
      noGuarantees: t("proposals.noGuarantees"),
      document: t("proposals.document"),
      documentHint: t("proposals.documentHint"),
      noticeTitle: t("proposals.noticeTitle"),
      status: proposalStatusLabels,
      closedBody: t("proposals.closedBody"),
      expiredBody: t("proposals.expiredBody"),
      previousTitle: t("proposals.response.previousTitle"),
      previousLines,
      changeHint: t("proposals.response.changeHint"),
      response: responseLabels
    };
  };

  return (
    <>
      {hero}

      <Section title={t("statusTitle")} ariaLabel={t("journeyLabel")}>
        <div className="am-stack am-stack--xl am-j-column">
          <div className="am-j-reference">
            <p className="am-j-reference__label">{t("referenceLabel")}</p>
            <div className="am-j-reference__row">
              <p className="am-j-reference__value am-tabular">{publicReference}</p>
              <CopyReference value={publicReference} label={t("copy")} copiedLabel={t("copied")} />
            </div>
          </div>

          <div className="am-j-panel" role="status" data-status={status}>
            <div className="am-j-panel__head">
              <IconTile name={statusVisual.icon} tone={statusVisual.tone} size="lg" />
              <div>
                <p className="am-j-fineprint">{t("statusLabel")}</p>
                <h2 className="am-j-panel__title">{t(`status.${status}.headline`)}</h2>
              </div>
            </div>
            <p className="am-j-panel__lead">{t(`status.${status}.body`)}</p>
          </div>

          {view.consent.withdrawn ? (
            <Notice tone="info" role="status">
              {withdrawnAt ? t("consentWithdrawnNotice", { date: withdrawnAt }) : t("consentWithdrawnNoDate")}
            </Notice>
          ) : null}

          <div className="am-j-panel">
            <div className="am-j-panel__head">
              <IconTile name="users" size="lg" />
              <h2 className="am-j-panel__title">{t("brokers.title")}</h2>
            </div>
            {view.brokers.length > 0 ? (
              <ul className="am-j-list">
                {view.brokers.map((broker, index) => {
                  const since = formatDate(broker.since);
                  const label = isOneOf(BROKER_STATUSES, broker.status) ? t(`brokers.status.${broker.status}`) : t("brokers.status.transmitted");
                  return (
                    <li key={`${broker.partnerName}-${index}`}>
                      <Icon name="building" size={18} />
                      <span>
                        <strong>
                          <BackendText>{broker.partnerName}</BackendText>
                        </strong>
                        {" - "}
                        {label}
                        {since ? ` (${t("brokers.since", { date: since })})` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="am-j-fineprint">{t("brokers.empty")}</p>
            )}
          </div>

          {timeline.length > 0 ? (
            <div className="am-j-panel">
              <div className="am-j-panel__head">
                <IconTile name="clock" size="lg" />
                <h2 className="am-j-panel__title">{t("timeline.title")}</h2>
              </div>
              <ol className="am-j-list" aria-label={t("timeline.title")}>
                {timeline.map((entry, index) => {
                  const at = formatDate(entry.at);
                  return (
                    <li key={`${entry.step}-${entry.at}-${index}`}>
                      <Icon name={TIMELINE_ICONS[entry.step]} size={18} />
                      <span>
                        <strong>{t(`timeline.steps.${entry.step}`)}</strong>
                        {at ? ` - ${at}` : ""}
                        {entry.partnerName ? (
                          <>
                            <br />
                            <BackendText>{t("timeline.partner", { partner: entry.partnerName })}</BackendText>
                          </>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}

          <Notice tone="info">{t("role")}</Notice>
          <Notice tone="info">{t("fineprint")}</Notice>
          <p className="am-j-fineprint">{expiry ? t("expiry", { date: expiry }) : t("expiryUnknown")}</p>
        </div>
      </Section>

      {/* Spec 055: the broker proposals; the slot renders nothing while there is none. */}
      <QuoteProposalsSlot
        proposals={hasProposals({ proposals }) ? proposals : undefined}
        title={t("proposals.title")}
        lead={t("proposals.lead")}
      >
        <div className="am-stack am-stack--lg" role="list" aria-label={t("proposals.listLabel")}>
          {proposals.map((proposal) => (
            <div role="listitem" key={proposal.id}>
              <QuoteProposalCard
                proposal={proposal}
                publicReference={publicReference}
                token={token}
                locale={locale}
                labels={proposalLabels(proposal)}
              />
            </div>
          ))}
        </div>
      </QuoteProposalsSlot>

      <Section title={t("documentsTitle")} tone="muted">
        <div className="am-stack am-stack--lg am-j-column">
          {documents?.status === "success" && documents.data ? (
            <>
              {documents.data.items.length > 0 ? (
                <ul className="am-j-documents">
                  {documents.data.items.map((document) => {
                    const key = scanKeyOf(document.scanStatus);
                    const visual = key ? SCAN_VISUALS[key] : SCAN_VISUALS.pending;
                    return (
                      <li className="am-j-document" key={document.id}>
                        <IconTile name={visual.icon} tone={visual.tone} size="sm" />
                        <p className="am-j-document__text">
                          <BackendText>
                            {t("documentLine", {
                              label: document.label,
                              fileName: document.fileName,
                              size: Math.ceil(document.sizeBytes / 1024),
                              status: key ? t(`scan.${key}`) : document.scanStatus
                            })}
                          </BackendText>
                          {document.sharedWithBroker ? t("sharedWithBroker") : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="am-j-fineprint">{t("noDocuments")}</p>
              )}
              {documents.data.uploadEnabled && !view.consent.withdrawn ? (
                <QuoteDocumentUpload
                  publicReference={publicReference}
                  token={token}
                  remainingSlots={documents.data.remainingSlots}
                />
              ) : (
                <Notice tone="info" role="status">
                  {t("uploadDisabled")}
                </Notice>
              )}
            </>
          ) : (
            <EmptyState
              icon="file-text"
              tone="muted"
              align="center"
              title={t("unavailable")}
              description={documents?.publicMessage ?? t("noToken")}
            />
          )}
        </div>
      </Section>

      {/* Consent withdrawal: clearly separated from the rest of the tracking page. */}
      {view.consent.withdrawn ? null : (
        <Section title={t("withdrawal.title")} lead={t("withdrawal.lead")}>
          <div className="am-j-column">
            <div className="am-j-panel am-j-panel--muted">
              <ConsentWithdrawal
                publicReference={publicReference}
                token={token}
                labels={{
                  explanation: t("withdrawal.explanation"),
                  confirmToggle: t("withdrawal.confirmToggle"),
                  confirmQuestion: t("withdrawal.confirmQuestion", { reference: publicReference }),
                  confirm: t("withdrawal.confirm"),
                  cancel: t("withdrawal.cancel"),
                  submitting: t("withdrawal.submitting"),
                  successTitle: t("withdrawal.successTitle"),
                  successTitleAlready: t("withdrawal.successTitleAlready"),
                  successDescription: t("withdrawal.successDescription"),
                  error: t("withdrawal.error")
                }}
              />
            </div>
          </div>
        </Section>
      )}

      <Section spacing="compact">
        <div className="am-cluster am-j-column">
          <Button variant="secondary" href="/countries" icon={<Icon name="globe" size={18} />}>
            {t("backToCountries")}
          </Button>
        </div>
      </Section>
    </>
  );
}
