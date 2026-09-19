import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../i18n/routing";
import { ConsentWithdrawal } from "../../../components/forms/consent-withdrawal";
import { IndicativeOfferNotice } from "../../../components/public-journey";
import { QuoteDocumentUpload } from "../../../components/quote-document-upload";
import { BackendText } from "../../../components/ui/backend-text";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { Notice } from "../../../components/ui/notice";
import { ProgressBar } from "../../../components/ui/progress-bar";
import { Section } from "../../../components/ui/section";
import { listQuoteDocuments } from "../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";

/**
 * Tracking page of a quote request. It is never indexed, is reachable only with the verification
 * token handed out at the end of the request, and carries the consent withdrawal (SITE-316, 317).
 */

type SearchParams = Record<string, string | string[] | undefined>;
type PageParams = { locale: string; publicReference: string };

const scanKeys = ["pending", "clean", "infected", "failed"] as const;
type ScanKey = (typeof scanKeys)[number];

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
      <div className="am-container">
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
      </div>

      <Hero kicker={t("kicker")} title={t("title", { reference: publicReference })} lead={t("intro")}>
        <IndicativeOfferNotice />
      </Hero>

      <Section>
        <ProgressBar
          steps={steps}
          current={4}
          label={quote("progressLabel")}
          stepLabel={quote("stepStatus", { current: 4, total: steps.length })}
        />
        <Notice tone="info">{t("fineprint")}</Notice>
      </Section>

      <Section title={t("documentsTitle")} tone="muted">
        {!token ? <Notice tone="info">{t("noToken")}</Notice> : null}
        {token && documents?.status === "success" && documents.data ? (
          <>
            {documents.data.items.length > 0 ? (
              <ul className="pub-list">
                {documents.data.items.map((document) => {
                  const key = scanKeyOf(document.scanStatus);
                  return (
                    <li key={document.id}>
                      <BackendText>
                        {t("documentLine", {
                          label: document.label,
                          fileName: document.fileName,
                          size: Math.ceil(document.sizeBytes / 1024),
                          status: key ? t(`scan.${key}`) : document.scanStatus
                        })}
                      </BackendText>
                      {document.sharedWithBroker ? t("sharedWithBroker") : ""}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="am-field__hint">{t("noDocuments")}</p>
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
          <EmptyState title={t("unavailable")} description={documents?.publicMessage ?? t("noToken")} />
        ) : null}
      </Section>

      {/* Consent withdrawal: clearly separated from the rest of the tracking page. */}
      <Section title={t("withdrawal.title")} lead={t("withdrawal.lead")}>
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
      </Section>

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
