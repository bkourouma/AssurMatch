import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../i18n/routing";
import { OfferPreview } from "../components/home/offer-preview";
import { GuideCard } from "../components/institutional/guide-card";
import { EntrySelector, type EntrySelectorProduct } from "../components/site/entry-selector";
import { PlatformStatusNotice } from "../components/site/platform-status-notice";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Hero } from "../components/ui/hero";
import { Icon, type IconName } from "../components/ui/icons";
import { IconTile } from "../components/ui/icon-tile";
import { Notice } from "../components/ui/notice";
import { Section } from "../components/ui/section";
import { Stat } from "../components/ui/stat";
import { Reveal } from "../components/motion/reveal";
import { listGuides } from "../content/guides";
import { formatDate } from "../lib/country-format";
import { getPublicStats, listPublicProducts } from "../lib/public-api";
import type { PublicStats } from "../lib/public-api";
import { buildMetadata } from "../lib/seo";
import type { PageMetadata } from "../lib/seo";
import { readVisitorCountry } from "../lib/visitor-country";
import "../styles/pages/home.css";

/**
 * Public home page (SITE-101 to SITE-106).
 *
 * The visitor country is a default, never a redirection: it pre-selects the entry form and the page
 * says so in as many words. Every figure comes from `GET /public-stats`; nothing is hard-coded.
 *
 * There is no breadcrumb here on purpose: a single "Accueil" crumb on the home page itself says
 * nothing a visitor does not already know, and the BreadcrumbList it emitted described a trail of
 * one. Every other page keeps its breadcrumb and its structured data.
 */

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Home" });
  return buildMetadata({ title: t("title"), description: t("metaDescription"), href: "/", locale });
}

/**
 * The counters come straight from `GET /public-stats`, whose shape is fixed by the shared contract.
 * A value is rendered only when the endpoint really sent a finite number, so a partial or degraded
 * response shows fewer counters rather than a zero the catalogue never reported.
 */
function statValue(source: PublicStats | null, key: "openCountries" | "activeBrokers" | "validatedOffers"): number | undefined {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function statDate(source: PublicStats | null): string | undefined {
  return typeof source?.computedAt === "string" ? source.computedAt : undefined;
}

export default async function PublicHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  const visitor = await readVisitorCountry();
  const selectable = visitor.directory.filter((country) => country.availability !== "waitlist");
  const preselected = selectable.find((country) => country.isoCode === visitor.isoCode) ?? selectable[0];
  const products = preselected ? (await listPublicProducts(preselected.isoCode)).data : [];
  const entryProducts: EntrySelectorProduct[] = products.map((product) => ({
    key: product.key,
    name: product.name,
    ...(preselected ? { countryIso: preselected.isoCode } : {})
  }));

  const stats = await getPublicStats();
  const counters =
    stats.status === "success"
      ? [
          { key: "countries", icon: "globe" as IconName, label: t("stats.countries"), value: statValue(stats.data, "openCountries") },
          { key: "partners", icon: "handshake" as IconName, label: t("stats.partners"), value: statValue(stats.data, "activeBrokers") },
          { key: "offers", icon: "badge-check" as IconName, label: t("stats.offers"), value: statValue(stats.data, "validatedOffers") }
        ].filter((counter): counter is { key: string; icon: IconName; label: string; value: number } => counter.value !== undefined)
      : [];
  const computedAt = stats.status === "success" ? statDate(stats.data) : undefined;

  const steps = [
    { key: "compare", icon: "search" as IconName, title: t("steps.compare.title"), body: t("steps.compare.description") },
    { key: "quote", icon: "file-text" as IconName, title: t("steps.quote.title"), body: t("steps.quote.description") },
    { key: "broker", icon: "handshake" as IconName, title: t("steps.broker.title"), body: t("steps.broker.description") }
  ];

  const does = [t("role.does.compare"), t("role.does.explain"), t("role.does.transmit"), t("role.does.flag")];
  const doesNot = [t("role.doesNot.sell"), t("role.doesNot.issue"), t("role.doesNot.collect"), t("role.doesNot.advise")];

  const guides = listGuides(locale).slice(0, 3);

  return (
    <>
      <Hero
        className="am-home-hero"
        size="lg"
        kicker={t("kicker")}
        title={t("title")}
        lead={t("lead")}
        aside={<OfferPreview />}
      >
        <p className="am-home-hero__place">
          <Icon name="map-pin" size={18} />
          <span>{preselected ? t("preselected", { country: preselected.name }) : t("preselectedNone")}</span>
        </p>
        {selectable.length > 0 ? (
          <EntrySelector
            title={t("entryTitle")}
            countries={selectable.map((country) => ({ isoCode: country.isoCode, name: country.name }))}
            products={entryProducts}
            defaultCountry={preselected?.isoCode ?? null}
          />
        ) : (
          <Notice tone="info">{t("entryUnavailable")}</Notice>
        )}
      </Hero>

      {counters.length > 0 ? (
        <Section tone="muted" kicker={t("statsKicker")} title={t("stats.title")} lead={t("stats.lead")}>
          <Reveal as="ul" stagger className="am-home-stats">
            {counters.map((counter) => (
              <li key={counter.key}>
                <Card tone="muted" padding="lg">
                  <Stat icon={counter.icon} label={counter.label} value={counter.value} locale={locale} />
                </Card>
              </li>
            ))}
          </Reveal>
          <div className="am-home-stats__notes">
            {computedAt ? <p>{t("stats.updatedAt", { date: formatDate(computedAt, { locale }) })}</p> : null}
            <p>{t("stats.indicative")}</p>
          </div>
        </Section>
      ) : null}

      <Section kicker={t("stepsKicker")} title={t("stepsTitle")} lead={t("stepsLead")}>
        <Reveal as="ol" stagger className="am-home-steps">
          {steps.map((step, index) => (
            <Card as="li" key={step.key} className="am-home-step" padding="lg">
              <div className="am-home-step__head">
                <IconTile name={step.icon} size="lg" />
                <span className="am-home-step__index am-tabular" aria-hidden="true">
                  {index + 1}
                </span>
              </div>
              <h3 className="am-home-step__title">{step.title}</h3>
              <p className="am-home-step__body">{step.body}</p>
            </Card>
          ))}
        </Reveal>
        <div className="am-cluster">
          <Button href="/how-it-works" variant="secondary" iconAfter={<Icon name="arrow-right" size={18} />}>
            {t("stepsLink")}
          </Button>
        </div>
      </Section>

      <Section tone="muted" kicker={t("roleKicker")} title={t("statusTitle")} lead={t("statusLead")}>
        <div className="am-home-role">
          <Reveal className="am-home-role__intro" from="left">
            <PlatformStatusNotice />
            <p className="am-home-role__detail">{t("statusDetail")}</p>
            <div className="am-cluster">
              <Button href="/regulatory-status" variant="secondary" iconAfter={<Icon name="arrow-right" size={18} />}>
                {t("regulatoryLink")}
              </Button>
            </div>
            <p className="am-home-role__note">{t("regulatoryLead")}</p>
          </Reveal>

          <Reveal from="right">
            <Card padding="lg" className="am-home-role__lists">
              <div className="am-home-role__group" data-tone="does">
                <h3 className="am-home-role__grouptitle">
                  <Icon name="check-circle" size={20} />
                  {t("role.does.title")}
                </h3>
                <ul className="am-checklist" data-tone="does">
                  {does.map((line) => (
                    <li key={line}>
                      <Icon name="check-circle" size={18} />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="am-home-role__group" data-tone="doesnot">
                <h3 className="am-home-role__grouptitle">
                  <Icon name="x-circle" size={20} />
                  {t("role.doesNot.title")}
                </h3>
                <ul className="am-checklist" data-tone="doesnot">
                  {doesNot.map((line) => (
                    <li key={line}>
                      <Icon name="x-circle" size={18} />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          </Reveal>
        </div>
      </Section>

      {guides.length > 0 ? (
        <Section kicker={t("guides.kicker")} title={t("guides.title")} lead={t("guides.lead")}>
          <Reveal as="ul" stagger className="am-home-guides">
            {guides.map((guide) => (
              <GuideCard
                key={guide.slug}
                slug={guide.slug}
                title={guide.title}
                description={guide.description}
                meta={t("guides.updated", { date: formatDate(guide.updatedAt, { locale }) })}
                readLabel={t("guides.read")}
              />
            ))}
          </Reveal>
          <div className="am-cluster">
            <Button href="/guides" variant="secondary" iconAfter={<Icon name="arrow-right" size={18} />}>
              {t("guides.all")}
            </Button>
          </div>
        </Section>
      ) : null}

      {/* Brand signature: the home page is the only surface that carries it. */}
      <Section
        tone="navy"
        align="center"
        className="am-home-signature"
        kicker={t("signatureKicker")}
        title={t("signature")}
        lead={t("signatureLead")}
        actions={
          <Button href="/countries" size="lg" icon={<Icon name="search" size={20} />}>
            {t("compare")}
          </Button>
        }
      >
        <Notice tone="indicative" className="am-home-signature__notice">
          {t("fineprint")}
        </Notice>
      </Section>
    </>
  );
}
