import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { TENANT_SUSPENDED_MESSAGE, canMutateOffers, isTenantReadOnly } from "../../lib/broker-permissions";
import { readOfferScopeChoices } from "../../lib/offer-api";
import { readBrokerInsurersForCountries } from "../../lib/lot4-offers-api";
import { Button, Notice, PageHeader, PageStack } from "../../lib/ui/broker-ui";
import { CreateBrokerOfferForm } from "../offer-forms";

/**
 * Spec 052 US1: creation of an offer (owner and managers). The country x product choices come from
 * the broker coverage (`GET /broker/offers/coverage`: licence + active authorisations, non-public
 * countries included); the API re-runs the same check on create (422 OFFER_SCOPE_NOT_COVERED).
 */
const BREADCRUMB = [{ label: "Activité" }, { label: "Mes offres", href: "/offers" }, { label: "Nouvelle offre" }];

export default async function NewBrokerOfferPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/offers/new", session.status));
  const header = (
    <PageHeader
      breadcrumb={BREADCRUMB}
      title="Nouvelle offre"
      description="Offre indicative ou privée. Une offre indicative est publiée après validation par AssurMatch ; une offre privée n'est jamais affichée au public."
    />
  );
  if (session.status !== "authenticated" || !canMutateOffers(session.profile)) {
    const suspended = session.status === "authenticated" && isTenantReadOnly(session.profile);
    return (
      <PageStack>
        {header}
        <Notice tone="warning">
          {suspended ? TENANT_SUSPENDED_MESSAGE : "Création réservée au propriétaire et aux managers du cabinet. Les agents et les comptes en lecture seule consultent uniquement."}
        </Notice>
        <div>
          <Button href="/offers" variant="secondary">Retour à mes offres</Button>
        </div>
      </PageStack>
    );
  }
  const scopes = await readOfferScopeChoices();
  const insurers = await readBrokerInsurersForCountries(scopes.map((scope) => scope.countryId));
  return (
    <PageStack>
      {header}
      <CreateBrokerOfferForm
        scopes={scopes.map((scope) => ({ value: `${scope.countryId}:${scope.productId}`, label: `${scope.countryLabel} — ${scope.productLabel}` }))}
        insurers={insurers}
      />
    </PageStack>
  );
}
