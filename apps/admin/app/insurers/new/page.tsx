import { redirect } from "next/navigation";
import { readAdminCountries } from "../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { PageHeader, PageStack } from "../../lib/ui/admin-ui";
import { CreateInsurerForm } from "../insurer-forms";

/** Spec 070: creation of an insurer for a country (the API checks the operator scope and the unique pays + code). */
export default async function NewInsurerPage() {
  const path = "/insurers/new";
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(path, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(path)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(path)}`);
  const countries = await readAdminCountries();
  if (countries.unauthenticated) redirect(loginRedirect(path, countries.error ?? "session_required"));
  const countryChoices = countries.data
    .filter((country) => country.status !== "retired")
    .map((country) => ({ value: country.id, label: `${country.name} (${country.isoCode})` }));
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Assureurs", href: "/insurers" }, { label: "Nouvel assureur" }]}
        kicker="Catalogue"
        title="Nouvel assureur"
        description="Ajout d'un assureur au référentiel d'un pays."
      />
      <CreateInsurerForm countries={countryChoices} />
    </PageStack>
  );
}
