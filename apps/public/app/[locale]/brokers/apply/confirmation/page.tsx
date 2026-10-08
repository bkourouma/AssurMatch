import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../../i18n/routing";
import { Breadcrumb } from "../../../../components/ui/breadcrumb";
import { Button } from "../../../../components/ui/button";
import { Hero } from "../../../../components/ui/hero";
import { Icon, type IconName } from "../../../../components/ui/icons";
import { Route } from "../../../../components/ui/route-line";
import { Section } from "../../../../components/ui/section";
import { buildMetadata, localeUrl } from "../../../../lib/seo";
import type { PageMetadata } from "../../../../lib/seo";

/**
 * Spec 050 D7/FR-030: dedicated confirmation page for the broker application, reached after a
 * successful submission with only the public reference carried over as a query parameter - never a
 * name, an e-mail or a phone number (constitution IV/VI: no personal data leaves the form's own
 * request). The page is purely static: it never calls the API, it only reads what the form gave it.
 * `noindex` because a URL with someone else's reference in it is not a page search engines should
 * list, even though the reference itself carries no personal data.
 *
 * The navy sign says the application was received and prints the reference on a light plate; the
 * next steps follow as a route. None of those steps confirms anything yet, so no stop is green.
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

  const breadcrumb = (
    <Breadcrumb
      label={common("breadcrumbLabel")}
      items={[
        { name: common("home"), url: localeUrl(locale, "/") },
        { name: brokers("breadcrumb"), url: localeUrl(locale, "/brokers") },
        { name: t("breadcrumb"), url: localeUrl(locale, "/brokers/apply/confirmation") }
      ]}
    />
  );

  if (!reference) {
    return (
      <Hero
        className="am-brokers-sign"
        title={t("missing.title")}
        lead={t("missing.body")}
        breadcrumb={breadcrumb}
        actions={
          <Button href="/brokers/apply" icon={<Icon name="arrow-left" size={20} />}>
            {t("missing.cta")}
          </Button>
        }
      />
    );
  }

  const notes: ReadonlyArray<{ key: string; icon: IconName; text: string }> = [
    { key: "noDelay", icon: "clock", text: t("received.noDelay") },
    { key: "prepare", icon: "file-text", text: t("received.prepare") },
    { key: "noAccess", icon: "lock", text: t("received.noAccess") }
  ];

  return (
    <>
      <Hero className="am-brokers-sign" title={t("received.title")} breadcrumb={breadcrumb}>
        <p className="am-applyref">
          <span className="am-applyref__label">{t("received.referencePrefix")}</span>{" "}
          <span className="am-applyref__value am-tabular">{reference}</span>
        </p>
      </Hero>

      <Section title={t("received.nextStepsTitle")}>
        <Route
          className="am-brokers-route"
          stops={[
            { key: "review", title: t("received.steps.review") },
            { key: "licence", title: t("received.steps.licenceCheck") },
            { key: "contact", title: t("received.steps.contact") }
          ]}
        />

        <ul className="am-brokerlist am-brokerlist--icons am-applynotes">
          {notes.map((note) => (
            <li key={note.key}>
              <Icon name={note.icon} size={22} />
              <span>{note.text}</span>
            </li>
          ))}
        </ul>

        <div className="am-cluster am-applyactions">
          <Button href="/brokers">{t("received.backCta")}</Button>
          <Button href="/contact" variant="secondary">
            {t("received.contactCta")}
          </Button>
        </div>
      </Section>
    </>
  );
}
