import { redirect } from "next/navigation";
import {
  readAdminCountry,
  readAdminCountryLinks,
  readAdminProducts,
  readRegulatoryRegimes,
  type AdminCountryProductLinkData
} from "../../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../../lib/backoffice-auth";
import {
  COUNTRY_TOGGLEABLE_FLAGS,
  PRODUCT_TOGGLEABLE_FLAGS,
  PUBLIC_ACTIVATION_FLAGS,
  SENSITIVE_FLAG_EXPLANATION,
  adminReadErrorMessage,
  canApprovePublicActivation,
  flagLabel,
  formatDate
} from "../../../lib/catalog-messages";
import { BlockersList } from "../../../lib/ui/catalog-action-result";
import {
  Badge,
  Button,
  Card,
  DataTable,
  DescriptionList,
  Grid,
  Notice,
  PageHeader,
  PageStack,
  StateMessage,
  StatusBadge,
  catalogStatusTones
} from "../../../lib/ui/admin-ui";
import {
  CountryStatusForm,
  CreateCountryLinkForm,
  EditCountryForm,
  FlagToggleForm,
  RetireCountryLinkForm
} from "../../catalog-forms";

interface CountryDetailPageProps {
  params: Promise<{ countryId: string }>;
}

function FlagBadge({ value }: { value: boolean }) {
  return <Badge tone={value ? "warning" : "disabled"}>{value ? "Ouvert" : "Fermé"}</Badge>;
}

export default async function CatalogCountryDetailPage({ params }: CountryDetailPageProps) {
  const { countryId } = await params;
  const path = `/catalog/countries/${countryId}`;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(path, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(path)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(path)}`);
  const canApprovePublic = canApprovePublicActivation(session.profile.roles);

  const [countryResult, linksResult, productsResult, regimesResult] = await Promise.all([
    readAdminCountry(countryId),
    readAdminCountryLinks(countryId),
    readAdminProducts(),
    readRegulatoryRegimes()
  ]);
  if (countryResult.unauthenticated) redirect(loginRedirect(path, countryResult.error ?? "session_required"));
  const country = countryResult.data;

  if (!country) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Pays", href: "/catalog/countries" }, { label: "Detail" }]}
          title="Pays indisponible"
          actions={<Button href="/catalog/countries" variant="secondary">Retour aux pays</Button>}
        />
        <StateMessage tone="danger">{adminReadErrorMessage(countryResult.error)}</StateMessage>
      </PageStack>
    );
  }

  const links: AdminCountryProductLinkData[] = linksResult.status === "success" ? linksResult.data : country.links ?? [];
  const products = productsResult.data;
  const productById = new Map(products.map((product) => [product.id, product]));
  const linkedIds = new Set(links.filter((link) => link.status !== "retired").map((link) => link.productId));
  const linkableProducts = products
    .filter((product) => !linkedIds.has(product.id) && product.status !== "retired")
    .map((product) => ({ value: product.id, label: `${product.name} (${product.key})` }));
  const regimeChoices = regimesResult.data.filter((regime) => regime.status !== "retired").map((regime) => ({ value: regime.id, label: `${regime.name} (${regime.key})` }));
  const regimeName = country.regulatoryRegimeId ? regimesResult.data.find((regime) => regime.id === country.regulatoryRegimeId)?.name ?? country.regulatoryRegimeId : null;
  const readOnlyFlags = Object.keys(country.flags).filter((key) => !(COUNTRY_TOGGLEABLE_FLAGS as readonly string[]).includes(key));
  const checklist = country.checklist;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Pays", href: "/catalog/countries" }, { label: country.isoCode }]}
        kicker="Fiche pays"
        title={`${country.name} (${country.isoCode})`}
        description="Chaque modification est auditée avec son motif. Une désactivation est immédiate ; une activation est soumise aux conditions de la checklist."
        actions={<Button href={`/activation-checklist?country=${encodeURIComponent(country.isoCode)}`} variant="secondary">Checklist du pays</Button>}
      />

      <Card title="Synthese">
        <DescriptionList
          columns={2}
          items={[
            { term: "Statut", value: <StatusBadge status={country.status} tones={catalogStatusTones} /> },
            { term: "Régime", value: regimeName ?? <Badge tone="warning">Non renseigné</Badge> },
            { term: "Famille réglementaire", value: country.regulatoryFamily },
            { term: "Langues", value: country.languages.join(", ") },
            { term: "Devise", value: country.currency },
            { term: "Fuseau", value: country.timezone },
            { term: "Téléphone", value: country.phoneDialCode ? `${country.phoneDialCode}, ${country.phoneNationalLengths.join(" ou ") || "?"} chiffres` : "Normalisation générique" },
            { term: "Public depuis", value: formatDate(country.publicSince) },
            { term: "Mis à jour", value: formatDate(country.updatedAt) }
          ]}
        />
      </Card>

      <Card title="Checklist d'activation du pays" description="Contrôles bloquants pour une ouverture au public. La liste est recalculée à chaque chargement.">
        {checklist ? (
          checklist.ready ? (
            <Notice tone="success">Aucun contrôle bloquant : l&apos;ouverture reste soumise au go/no-go conformité.</Notice>
          ) : (
            <>
              <Notice tone="warning">{`${checklist.blockers.length} contrôle(s) bloquant(s) avant toute ouverture au public.`}</Notice>
              <BlockersList blockers={checklist.blockers} scope={{ countryId: country.id }} />
            </>
          )
        ) : (
          <StateMessage>Résumé indisponible : consultez la checklist technique d&apos;activation.</StateMessage>
        )}
      </Card>

      <Grid columns="two">
        <EditCountryForm country={country} regimes={regimeChoices} />
        <CountryStatusForm countryId={country.id} currentStatus={country.status} canApprovePublic={canApprovePublic} />
      </Grid>

      <Card title="Flags du pays" description="Un formulaire par flag. Désactiver n'a aucune condition ; activer vérifie les conditions de la checklist.">
        <DataTable
          columns={[
            { key: "flag", header: "Flag", render: (key: string) => <><strong>{flagLabel(key)}</strong><div><code>{key}</code></div></> },
            { key: "value", header: "État", render: (key: string) => <FlagBadge value={country.flags[key as keyof typeof country.flags] === true} /> },
            {
              key: "action",
              header: "Action",
              render: (key: string) => {
                const current = country.flags[key as keyof typeof country.flags] === true;
                if (!current && PUBLIC_ACTIVATION_FLAGS.has(key) && !canApprovePublic) {
                  return <span className="bo-description">Activation réservée à la conformité (compliance_admin, super_admin).</span>;
                }
                return <FlagToggleForm target="country" countryId={country.id} flagKey={key} label={flagLabel(key)} currentValue={current} />;
              }
            }
          ]}
          items={[...COUNTRY_TOGGLEABLE_FLAGS]}
          getKey={(key) => key}
          emptyLabel="Aucun flag modifiable."
          aria-label="Flags modifiables du pays"
        />
        {readOnlyFlags.length > 0 ? (
          <Notice tone="info" title="Flags sensibles (lecture seule)">
            <ul className="bo-list">
              {readOnlyFlags.map((key) => (
                <li key={key}>
                  <code>{key}</code> : {country.flags[key as keyof typeof country.flags] ? "ouvert" : "fermé"}. {SENSITIVE_FLAG_EXPLANATION}
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </Card>

      <div id="liaisons">
        <Card
          title="Produits liés au pays"
          description="Le flag effectif lu par le parcours public est le flag produit ET le flag de la liaison. Une liaison se crée fermée."
        >
          {linksResult.forbidden ? <StateMessage tone="danger">{adminReadErrorMessage("access_denied")}</StateMessage> : null}
          <DataTable
            columns={[
              { key: "product", header: "Produit", render: (link: AdminCountryProductLinkData) => <a href={`/catalog/products/${encodeURIComponent(link.productId)}`}><strong>{link.productName}</strong> ({link.productKey})</a> },
              { key: "status", header: "Statut", render: (link: AdminCountryProductLinkData) => <StatusBadge status={link.status} tones={catalogStatusTones} /> },
              {
                key: "effective",
                header: "Flags effectifs",
                render: (link: AdminCountryProductLinkData) => (
                  <>
                    {PRODUCT_TOGGLEABLE_FLAGS.map((key) => (
                      <Badge key={key} tone={link.effectiveFlags[key] ? "warning" : "disabled"}>{`${flagLabel(key)} : ${link.effectiveFlags[key] ? "oui" : "non"}`}</Badge>
                    ))}
                  </>
                )
              }
            ]}
            items={links}
            getKey={(link) => link.productId}
            emptyLabel="Aucun produit lié : le pays ne propose aucun parcours."
            aria-label="Liaisons pays produit"
          />
        </Card>
      </div>

      {links.filter((link) => link.status !== "retired").map((link) => {
        const product = productById.get(link.productId);
        const sensitive = product ? product.sensitivity !== "standard" : false;
        return (
          <Card key={link.productId} title={`Liaison ${country.isoCode} × ${link.productName}`} description="Flags de la liaison : ils ne modifient pas les autres pays.">
            <Grid columns="two">
              {PRODUCT_TOGGLEABLE_FLAGS.map((key) => {
                const stored = link.flags[key];
                const current = stored ?? link.effectiveFlags[key];
                if (key === "product_manual_review_required" && current && sensitive && !canApprovePublic) {
                  return (
                    <p key={key} className="bo-description">
                      {flagLabel(key)} : actif. Produit sensible : seule la conformité peut lever la revue manuelle.
                    </p>
                  );
                }
                return (
                  <div key={key}>
                    <p>
                      <strong>{flagLabel(key)}</strong> <FlagBadge value={current === true} />
                      {stored === undefined ? <span className="bo-description"> (hérité du produit)</span> : null}
                    </p>
                    <FlagToggleForm target="link" countryId={country.id} productId={link.productId} flagKey={key} label={flagLabel(key)} currentValue={current === true} />
                  </div>
                );
              })}
            </Grid>
            <RetireCountryLinkForm countryId={country.id} productId={link.productId} productName={link.productName} />
          </Card>
        );
      })}

      <CreateCountryLinkForm countryId={country.id} products={linkableProducts} />
    </PageStack>
  );
}
