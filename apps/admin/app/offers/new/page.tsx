import { redirect } from "next/navigation";
import { readAdminCountries, readAdminPartners, readAdminProducts } from "../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { canPrepareOffer } from "../../lib/offer-messages";
import { Notice, PageHeader, PageStack } from "../../lib/ui/admin-ui";
import { CreateOfferForm } from "../offer-forms";

/**
 * Spec 052 US5: creation of an offer for a partner (country admin within its scope, content admin,
 * super admin). The API checks the partner's licensed coverage (422 OFFER_SCOPE_NOT_COVERED).
 */
export default async function NewAdminOfferPage() {
  const path = "/offers/new";
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(path, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(path)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(path)}`);
  const header = (
    <PageHeader
      breadcrumb={[{ label: "Catalogue" }, { label: "Offres indicatives", href: "/offers" }, { label: "Nouvelle offre" }]}
      kicker="Catalogue"
      title="Nouvelle offre"
      description="Préparation d'une offre pour le compte d'un courtier. Offre indicative : prix à confirmer par le courtier partenaire."
    />
  );
  if (!canPrepareOffer(session.profile.roles)) {
    return (
      <PageStack>
        {header}
        <Notice tone="warning">Création réservée aux rôles super_admin, admin_pays (son pays) et content_admin.</Notice>
      </PageStack>
    );
  }

  const [countries, products, partners] = await Promise.all([readAdminCountries(), readAdminProducts(), readAdminPartners()]);
  if (countries.unauthenticated) redirect(loginRedirect(path, countries.error ?? "session_required"));
  const partnerChoices = partners.data
    .filter((partner) => partner.status !== "retired")
    .map((partner) => ({ value: partner.id, label: partner.tradeName || partner.legalName }));
  const countryChoices = countries.data
    .filter((country) => country.status !== "retired")
    .map((country) => ({ value: country.id, label: `${country.name} (${country.isoCode})` }));
  const productChoices = products.data
    .filter((product) => product.status !== "retired")
    .map((product) => ({ value: product.id, label: product.name }));

  return (
    <PageStack>
      {header}
      <CreateOfferForm partners={partnerChoices} scopes={{ countries: countryChoices, products: productChoices }} />
    </PageStack>
  );
}
