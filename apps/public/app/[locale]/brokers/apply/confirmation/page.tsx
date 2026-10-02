import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../../i18n/routing";
import { Breadcrumb } from "../../../../components/ui/breadcrumb";
import { Button } from "../../../../components/ui/button";
import { IconTile } from "../../../../components/ui/icon-tile";
import { Section } from "../../../../components/ui/section";
import { Reveal } from "../../../../components/motion/reveal";
import { buildMetadata, localeUrl } from "../../../../lib/seo";
import type { PageMetadata } from "../../../../lib/seo";

/**
 * Spec 050 D7/FR-030: dedicated confirmation page for the broker application, reached after a
 * successful submission with only the public reference carried over as a query parameter - never a
 * name, an e-mail or a phone number (constitution IV/VI: no personal data leaves the form's own
 * request). The page is purely static: it never calls the API, it only reads what the form gave it.
 * `noindex` because a URL with someone else's reference in it is not a page search engines should
 * list, even though the reference itself carries no personal data.
 */

type SearchParams = Record<string, string | string[] | undefined>;

/** Public references look like "DQ-2026-A1B2C3D4": letters, digits and dashes, a reasonable length. A
 * value outside this shape is treated the same as a missing one - never rendered back to the visitor. */
const REFERENCE_PATTERN = /^[A-Za-z0-9-]{6,64}$/;

function readReference(query: SearchParams): string | undefined {
  const raw = Array.isArray(query.reference) ? query.reference[0] : query.reference;
  const trimmed = raw?.trim();
  return trimmed && REFERENCE_PATTERN.test(trimmed) ? trimmed : undefined;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "BrokerApplyConfirmation" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/brokers/apply/confirmation", locale, noindex: true });
}

export default async function BrokerApplyConfirmationPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("BrokerApplyConfirmation");
  const common = await getTranslations("Common");
  const brokers = await getTranslations("Brokers");

  const query = searchParams ? await searchParams : {};
  const reference = readReference(query);

  return (
    <>
      <div className="am-breadcrumbbar am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: brokers("breadcrumb"), url: localeUrl(locale, "/brokers") },
            { name: t("breadcrumb"), url: localeUrl(locale, "/brokers/apply/confirmation") }
          ]}
        />
      </div>

      <Section spacing="default" align="center" width="narrow">
        <Reveal as="div" from="scale">
          {reference ? (
            <div className="am-logincard">
              <IconTile name="check-circle" tone="success" size="lg" className="am-logincard__icon" />
              <h1 className="am-logincard__title">{t("received.title")}</h1>
              <p className="am-logincard__lead">
                {t("received.referencePrefix")} <span className="am-tabular">{reference}</span>
              </p>

              <ul className="am-steplist">
                <li>{t("received.steps.review")}</li>
                <li>{t("received.steps.licenceCheck")}</li>
                <li>{t("received.steps.contact")}</li>
              </ul>
              <p>{t("received.noDelay")}</p>
              <p>{t("received.prepare")}</p>
              <p>{t("received.noAccess")}</p>

              <div className="am-logincard__actions">
                <Button href="/brokers" fullWidth>
                  {t("received.backCta")}
                </Button>
                <Button href="/contact" variant="secondary" fullWidth>
                  {t("received.contactCta")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="am-logincard">
              <IconTile name="help-circle" tone="neutral" size="lg" className="am-logincard__icon" />
              <h1 className="am-logincard__title">{t("missing.title")}</h1>
              <p className="am-logincard__lead">{t("missing.body")}</p>
              <div className="am-logincard__actions">
                <Button href="/brokers/apply" fullWidth>
                  {t("missing.cta")}
                </Button>
              </div>
            </div>
          )}
        </Reveal>
      </Section>
    </>
  );
}
