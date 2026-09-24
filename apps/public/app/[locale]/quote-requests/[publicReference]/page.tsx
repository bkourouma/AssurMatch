import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../i18n/routing";
import { ConsentWithdrawal } from "../../../components/forms/consent-withdrawal";
import { CopyReference } from "../../../components/journey/copy-reference";
import { IndicativeOfferNotice } from "../../../components/public-journey";
import { QuoteDocumentUpload } from "../../../components/quote-document-upload";
import { BackendText } from "../../../components/ui/backend-text";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { Icon } from "../../../components/ui/icons";
import { IconTile, type IconTileTone } from "../../../components/ui/icon-tile";
import type { IconName } from "../../../components/ui/icons";
import { Notice } from "../../../components/ui/notice";
import { ProgressBar } from "../../../components/ui/progress-bar";
import { Section } from "../../../components/ui/section";
import { listQuoteDocuments } from "../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";
import "../../../styles/pages/journey.css";

/**
 * Tracking page of a quote request. It is never indexed, is reachable only with the verification
 * token handed out at the end of the request, and carries the consent withdrawal (SITE-316, 317).
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

function scanKeyOf(status: string): ScanKey | null {
  return (scanKeys as readonly string[]).includes(status) ? (status as ScanKey) : null;
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, publicReference } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "QuoteRequest" });
  return buildMetadata({
    title: t("title", { reference: publicReference }),
    description: t("description"),
    href: "/quote-requests/[publicReference]",
    params: { publicReference },
    locale,
    noindex: true
  });
}

export default async function PublicQuoteConfirmationPage({
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
  const quote = await getTranslations("QuoteForm");
  const common = await getTranslations("Common");
  const query = searchParams ? await searchParams : {};
  const tokenParam = Array.isArray(query.token) ? query.token[0] : query.token;
  const token = tokenParam && /^[A-Za-z0-9_-]{16,}$/.test(tokenParam) ? tokenParam : undefined;
  const documents = token ? await listQuoteDocuments(publicReference, token) : undefined;

  const steps = [
    { label: quote("steps.contact") },
    { label: quote("steps.need") },
    { label: quote("steps.consent") },
    { label: quote("steps.confirmation") }
  ];

  return (
    <>
      <Hero
        kicker={t("kicker")}
        title={t("title", { reference: publicReference })}
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

      <Section ariaLabel={t("journeyLabel")}>
        <div className="am-stack am-stack--xl am-j-column">
          <ProgressBar
            steps={steps}
            current={4}
            label={quote("progressLabel")}
            stepLabel={quote("stepStatus", { current: 4, total: steps.length })}
          />

          <div className="am-j-reference">
            <p className="am-j-reference__label">{t("referenceLabel")}</p>
            <div className="am-j-reference__row">
              <p className="am-j-reference__value am-tabular">{publicReference}</p>
              <CopyReference value={publicReference} label={t("copy")} copiedLabel={t("copied")} />
            </div>
          </div>

          <div className="am-j-panel">
            <div className="am-j-panel__head">
              <IconTile name="list" size="lg" />
              <h2 className="am-j-panel__title">{t("nextSteps.title")}</h2>
            </div>
            <ul className="am-j-points">
              <li>
                <Icon name="check-circle" size={18} />
                {t("nextSteps.one")}
              </li>
              <li>
                <Icon name="handshake" size={18} />
                {t("nextSteps.two")}
              </li>
              <li>
                <Icon name="paperclip" size={18} />
                {t("nextSteps.three")}
              </li>
            </ul>
          </div>

          <Notice tone="info">{t("fineprint")}</Notice>
        </div>
      </Section>

      <Section title={t("documentsTitle")} tone="muted">
        <div className="am-stack am-stack--lg am-j-column">
          {!token ? <Notice tone="info">{t("noToken")}</Notice> : null}
          {token && documents?.status === "success" && documents.data ? (
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
              {documents.data.uploadEnabled ? (
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
          ) : null}
          {token && (documents?.status !== "success" || !documents.data) ? (
            <EmptyState
              icon="file-text"
              tone="muted"
              align="center"
              title={t("unavailable")}
              description={documents?.publicMessage ?? t("noToken")}
            />
          ) : null}
        </div>
      </Section>

      {/* Consent withdrawal: clearly separated from the rest of the tracking page. */}
      <Section title={t("withdrawal.title")} lead={t("withdrawal.lead")}>
        <div className="am-j-column">
          <div className="am-j-panel am-j-panel--muted">
            {token ? (
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
                  successDescription: t("withdrawal.successDescription"),
                  error: t("withdrawal.error")
                }}
              />
            ) : (
              <Notice tone="info">{t("withdrawal.noToken")}</Notice>
            )}
          </div>
        </div>
      </Section>

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
