import { redirect } from "next/navigation";
import { readAiScopeFlags } from "../../lib/ai-scope-flags-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { Badge, Card, DataTable, PageHeader, PageStack, StateMessage } from "../../lib/ui/admin-ui";
import { ScopeFlagForm } from "./scope-flag-form";

const PAGE_PATH = "/ai-assistance/flags";

const PRODUCT_FLAG_LABELS: Record<string, string> = {
  product_ai_scoring_enabled: "Scoring IA",
  product_ai_form_assistant_enabled: "Assistant de formulaire IA"
};

function ValueBadge({ value }: { value: boolean }) {
  return <Badge tone={value ? "warning" : "disabled"}>{value ? "Actif" : "Désactivé"}</Badge>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 16).replace("T", " ");
}

export default async function AiScopeFlagsPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(PAGE_PATH, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(PAGE_PATH)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(PAGE_PATH)}`);

  const flags = await readAiScopeFlags();
  if (flags.status === "unauthenticated") redirect(loginRedirect(PAGE_PATH, flags.error ?? "session_required"));
  const { globalFlags, countries, products, history } = flags.data;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Plateforme" }, { label: "Assistance IA", href: "/ai-assistance" }, { label: "Flags IA" }]}
        kicker="IA contrôlée"
        title="Flags IA par pays et produit"
        description="L'IA reste une assistance avec validation humaine. Depuis cet écran, un flag par pays ou produit ne peut être que désactivé (motif audité) ; son activation est une décision de conformité appliquée par la commande d'exploitation. Aucun flag global n'est modifié ici."
      />

      {flags.status === "forbidden" ? <StateMessage tone="danger">Accès refusé pour ce rôle admin.</StateMessage> : null}
      {flags.status === "error" ? <StateMessage tone="danger">Flags IA indisponibles ({flags.error ?? "erreur"}). Réessayez plus tard.</StateMessage> : null}

      {flags.status === "success" ? (
        <>
          <Card
            title="Flags globaux IA (lecture seule)"
            description="Les flags globaux IA ne se changent pas ici : ils passent par la commande d'exploitation, avec référence de politique et approbateur."
          >
            <DataTable
              columns={[
                { key: "key", header: "Flag", render: (flag) => <code>{flag.key}</code> },
                { key: "value", header: "État", render: (flag) => <ValueBadge value={flag.value} /> }
              ]}
              items={globalFlags}
              getKey={(flag) => flag.key}
              emptyLabel="Aucun flag global IA référence."
              aria-label="Flags globaux IA"
            />
            <p className="bo-description">Commande d'exploitation :</p>
            <pre><code>npm run ops:apply-flag-policy -- --flag &lt;clé&gt; --value true --reference ... --approved-by ... --reason ...</code></pre>
          </Card>

          <Card title="Pays" description="Flag country_ai_enabled : ouvre l'assistance IA pour un pays.">
            <DataTable
              columns={[
                { key: "code", header: "Code", render: (country) => <code>{country.code}</code> },
                { key: "name", header: "Nom", render: (country) => country.name },
                { key: "state", header: "country_ai_enabled", render: (country) => <ValueBadge value={country.flags.country_ai_enabled} /> },
                {
                  key: "action",
                  header: "Action",
                  render: (country) => (
                    <ScopeFlagForm
                      scopeType="country"
                      scopeId={country.id}
                      scopeLabel={country.name}
                      flagKey="country_ai_enabled"
                      currentValue={country.flags.country_ai_enabled}
                    />
                  )
                }
              ]}
              items={countries}
              getKey={(country) => country.id}
              emptyLabel="Aucun pays référence."
              aria-label="Flags IA par pays"
            />
          </Card>

          <Card title="Produits" description="Scoring IA et assistant de formulaire IA, produit par produit.">
            <DataTable
              columns={[
                { key: "key", header: "Clé", render: (product) => <code>{product.key}</code> },
                { key: "name", header: "Nom", render: (product) => product.name },
                {
                  key: "sensitivity",
                  header: "Sensibilité",
                  render: (product) => <Badge tone={product.sensitivity === "highly_sensitive" ? "danger" : "neutral"}>{product.sensitivity}</Badge>
                },
                {
                  key: "flags",
                  header: "Flags IA",
                  render: (product) => (
                    <ul className="bo-list">
                      {(["product_ai_scoring_enabled", "product_ai_form_assistant_enabled"] as const).map((flagKey) => (
                        <li key={flagKey}>{PRODUCT_FLAG_LABELS[flagKey]} : <ValueBadge value={product.flags[flagKey]} /></li>
                      ))}
                    </ul>
                  )
                },
                {
                  key: "action",
                  header: "Actions",
                  render: (product) => (
                    <>
                      {(["product_ai_scoring_enabled", "product_ai_form_assistant_enabled"] as const).map((flagKey) => (
                        <ScopeFlagForm
                          key={flagKey}
                          scopeType="product"
                          scopeId={product.id}
                          scopeLabel={`${product.name} (${PRODUCT_FLAG_LABELS[flagKey]})`}
                          flagKey={flagKey}
                          currentValue={product.flags[flagKey]}
                          activationBlocked={product.sensitivity === "highly_sensitive"}
                        />
                      ))}
                    </>
                  )
                }
              ]}
              items={products}
              getKey={(product) => product.id}
              emptyLabel="Aucun produit référence."
              aria-label="Flags IA par produit"
            />
          </Card>

          <Card title="Historique récent" description="Derniers changements de flags IA, avec leur motif.">
            <DataTable
              columns={[
                { key: "changedAt", header: "Date", render: (entry) => formatDate(entry.changedAt) },
                { key: "key", header: "Flag", render: (entry) => <code>{entry.key}</code> },
                { key: "scope", header: "Portée", render: (entry) => `${entry.scopeType}${entry.scopeId ? ` / ${entry.scopeId}` : ""}` },
                { key: "value", header: "Valeur", render: (entry) => <ValueBadge value={entry.value} /> },
                { key: "reason", header: "Motif", render: (entry) => entry.reason ?? "-" }
              ]}
              items={history}
              getKey={(entry) => `${entry.key}:${entry.scopeId ?? ""}:${entry.changedAt}`}
              emptyLabel="Aucun changement enregistré."
              aria-label="Historique des flags IA"
            />
          </Card>

          <StateMessage tone="warning">
            L'IA est une assistance : toute sortie reste soumise à validation humaine. Aucun flag global n'est modifié depuis cet écran.
          </StateMessage>
        </>
      ) : null}
    </PageStack>
  );
}
