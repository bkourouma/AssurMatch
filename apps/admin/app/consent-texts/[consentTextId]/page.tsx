import { redirect } from "next/navigation";
import { readAdminConsentText, readAdminCountries, readAdminProducts } from "../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { adminReadErrorMessage, canApprovePublicActivation, formatDate } from "../../lib/catalog-messages";
import {
  Badge,
  Button,
  Card,
  DescriptionList,
  Grid,
  Notice,
  PageHeader,
  PageStack,
  StateMessage,
  StatusBadge,
  consentTextStatusTones
} from "../../lib/ui/admin-ui";
import { PublishConsentTextForm, RetireConsentTextForm } from "../consent-forms";

interface ConsentTextDetailPageProps {
  params: Promise<{ consentTextId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConsentTextDetailPage({ params, searchParams }: ConsentTextDetailPageProps) {
  const { consentTextId } = await params;
  const path = `/consent-texts/${consentTextId}`;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(path, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(path)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(path)}`);
  const canApprove = canApprovePublicActivation(session.profile.roles);
  const query = searchParams ? await searchParams : {};
  const created = query.notice === "created";

  const [result, countries, products] = await Promise.all([
    readAdminConsentText(consentTextId, { preview: true }),
    readAdminCountries(),
    readAdminProducts()
  ]);
  if (result.unauthenticated) redirect(loginRedirect(path, result.error ?? "session_required"));
  const text = result.data;

  if (!text) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Consentements", href: "/consent-texts" }, { label: "Detail" }]}
          title="Texte indisponible"
          actions={<Button href="/consent-texts" variant="secondary">Retour aux textes</Button>}
        />
        <StateMessage tone="danger">
          {result.forbidden ? "Accès aux textes de consentement réservé à la conformité (compliance_admin, super_admin)." : adminReadErrorMessage(result.error)}
        </StateMessage>
      </PageStack>
    );
  }

  const country = countries.data.find((candidate) => candidate.id === text.countryId);
  const product = text.productId ? products.data.find((candidate) => candidate.id === text.productId) : undefined;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Consentements", href: "/consent-texts" }, { label: text.version }]}
        kicker="Texte de consentement"
        title={`${text.purpose} · ${country?.isoCode ?? text.countryId.slice(0, 8)} · ${text.language} · ${text.version}`}
        description="L'empreinte porte sur le modèle (variables non résolues) ; c'est elle qui est conservée avec chaque preuve de consentement."
        actions={<Button href="/consent-texts" variant="secondary">Retour aux textes</Button>}
      />

      {created ? <Notice tone="success">Brouillon créé. Il n&apos;est utilisé par aucun formulaire tant qu&apos;il n&apos;est pas publié.</Notice> : null}

      {text.supersededBy ? (
        <Notice tone="warning" title="Version remplacée">
          Une version publiée plus récente existe : <a href={`/consent-texts/${encodeURIComponent(text.supersededBy)}`}>voir la version la plus récente</a>.
          Les formulaires de devis qui lient encore cette version sont signalés « consentement remplacé ».
        </Notice>
      ) : null}

      <Card title="Synthese">
        <DescriptionList
          columns={2}
          items={[
            { term: "Statut", value: <StatusBadge status={text.status} tones={consentTextStatusTones} /> },
            { term: "Finalité", value: text.purpose },
            { term: "Pays", value: country ? `${country.isoCode} - ${country.name}` : text.countryId },
            { term: "Produit", value: product ? `${product.key} - ${product.name}` : text.productId ?? "Tous les produits" },
            { term: "Canal", value: text.channel },
            { term: "Destinataire", value: text.recipientCategory },
            { term: "Langue", value: text.language },
            { term: "Version", value: text.version },
            { term: "Empreinte (sha256)", value: <code>{text.contentHash}</code> },
            { term: "Publié le", value: formatDate(text.publishedAt) },
            { term: "Retiré le", value: formatDate(text.retiredAt) },
            { term: "Remplacé par", value: text.supersededBy ? <a href={`/consent-texts/${encodeURIComponent(text.supersededBy)}`}><code>{text.supersededBy}</code></a> : "-" }
          ]}
        />
      </Card>

      <Grid columns="two">
        <Card title="Contenu (modèle)">
          {text.content ? (
            <pre className="bo-description" style={{ whiteSpace: "pre-wrap" }}>{text.content}</pre>
          ) : (
            <Notice tone="danger">Texte sans contenu : il ne peut pas être publié. Créez une nouvelle version avec son contenu complet.</Notice>
          )}
        </Card>
        <Card title="Aperçu" description="Variables résolues avec des valeurs d'exemple, tel que le visiteur le lira.">
          {text.preview ? <p>{text.preview}</p> : <StateMessage>Aperçu indisponible.</StateMessage>}
        </Card>
      </Grid>

      {canApprove ? (
        <Grid columns="two">
          {text.status === "draft" || text.status === "review" ? (
            <PublishConsentTextForm consentTextId={text.id} version={text.version} />
          ) : (
            <Card title="Publication">
              {text.status === "published" ? (
                <p className="bo-description">Texte publié : il est immuable. Une correction passe par une nouvelle version.</p>
              ) : (
                <p className="bo-description">Texte retiré : il ne peut plus être publié.</p>
              )}
            </Card>
          )}
          {text.status !== "retired" ? <RetireConsentTextForm consentTextId={text.id} /> : <Badge tone="disabled">Retiré</Badge>}
        </Grid>
      ) : (
        <StateMessage>La publication et le retrait sont réservés à la conformité (compliance_admin, super_admin).</StateMessage>
      )}
    </PageStack>
  );
}
