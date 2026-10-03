import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { TENANT_SUSPENDED_MESSAGE, canMutateOffers, isTenantReadOnly } from "../../lib/broker-permissions";
import { readOfferScopeChoices } from "../../lib/offer-api";
import { Button, Notice, PageHeader, PageStack } from "../../lib/ui/broker-ui";
import { CreateBrokerOfferForm } from "../offer-forms";

/**
 * Spec 052 US1: creation of an offer (owner and managers). The country x product choices come from
 * the open public catalogue; the API refuses a scope the broker's licence and authorisations do not
 * cover (422 OFFER_SCOPE_NOT_COVERED, shown with its reason).
 */
const BREADCRUMB = [{ label: "Activite" }, { label: "Mes offres", href: "/offers" }, { label: "Nouvelle offre" }];

export default async function NewBrokerOfferPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/offers/new", session.status));
  const header = (
    <PageHeader
      breadcrumb={BREADCRUMB}
      kicker="Offres"
      title="Nouvelle offre"
      description="Offre indicative : prix à confirmer par le courtier partenaire. Elle n'est publiée qu'après validation par AssurMatch."
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
        <Button href="/offers" variant="secondary">Retour à mes offres</Button>
      </PageStack>
    );
  }
  const scopes = await readOfferScopeChoices();
  return (
    <PageStack>
      {header}
      <CreateBrokerOfferForm scopes={scopes.map((scope) => ({ value: `${scope.countryId}:${scope.productId}`, label: `${scope.countryLabel} · ${scope.productLabel}` }))} />
    </PageStack>
  );
}
