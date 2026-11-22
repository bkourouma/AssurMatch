import { readAdminCountries, readAdminProducts, readRoutingPendingQueue, readRoutingRules, type RoutingRuleData } from "../lib/admin-api";
import {
  Button,
  Card,
  DataTable,
  Grid,
  PageHeader,
  PageStack,
  StateMessage,
  StatStrip,
  StatusBadge,
  ruleStatusTones
} from "../lib/ui/admin-ui";
import type { PendingManualQuoteData } from "../lib/admin-api";
import { AI_ASSISTED_MODE_LABEL, AI_ASSISTED_MODE_NOTE, candidateReasonLabel, parkedReasonLabel, qualityScoreLabel } from "./routing-labels";
import { AssignPendingQuoteForm, CreateRoutingRuleForm, ReassignLeadForm, RoutingPrecheckForm, UpdateRoutingRuleForm } from "./routing-forms";
import { readFailureDetail } from "../lib/auth-error-messages";

const modeLabels: Record<RoutingRuleData["mode"], string> = {
  first_eligible: "Premier éligible",
  round_robin: "Round-robin",
  priority: "Priorité commerciale",
  capacity: "Capacité",
  performance: "Performance",
  exclusive: "Exclusif",
  manual: "Manuel",
  multi_send: "Multi-courtiers",
  ai_assisted: AI_ASSISTED_MODE_LABEL
};

/** Parked reasons (French), quality score and excluded candidates of one pending request. */
function PendingContext({ quote }: { quote: PendingManualQuoteData }) {
  const reasons = quote.parkedReasons ?? [];
  const excluded = quote.candidates.filter((candidate) => !candidate.eligible);
  return (
    <div>
      {reasons.length > 0 ? (
        <ul className="bo-list">
          {reasons.map((reason) => <li key={reason}>{parkedReasonLabel(reason)}</li>)}
        </ul>
      ) : <span>-</span>}
      {typeof quote.qualityScore === "number" ? <p>{qualityScoreLabel(quote.qualityScore)}</p> : null}
      {excluded.length > 0 ? (
        <details>
          <summary>{excluded.length} candidat(s) exclu(s)</summary>
          <ul className="bo-list">
            {excluded.map((candidate) => (
              <li key={candidate.partnerTenantId}>{candidate.legalName} : {candidate.reasons.map(candidateReasonLabel).join(", ") || "-"}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ruleSummary(rule: RoutingRuleData, scope: string): string {
  return `${scope} - ${modeLabels[rule.mode]} - v${rule.version}${rule.status === "active" ? "" : " (désactivée)"}`;
}

export default async function RoutingPage() {
  const [rules, pending, countries, products] = await Promise.all([readRoutingRules(), readRoutingPendingQueue(), readAdminCountries(), readAdminProducts()]);
  const unauthenticated = rules.unauthenticated || pending.unauthenticated;
  const forbidden = rules.forbidden && pending.forbidden;
  const activeRules = rules.data.items.filter((rule) => rule.status === "active");
  // Human names for the identifiers; when a list cannot be read the short identifier is shown instead.
  const countryList = countries.status === "success" ? countries.data : [];
  const productList = products.status === "success" ? products.data : [];
  const countryName = (id: string) => {
    const country = countryList.find((candidate) => candidate.id === id);
    return country ? `${country.isoCode} - ${country.name}` : id.slice(0, 8);
  };
  const productName = (id: string | null) => {
    if (!id) return "Tous les produits";
    return productList.find((candidate) => candidate.id === id)?.name ?? id.slice(0, 8);
  };
  const countryOptions = countryList.map((country) => ({ value: country.id, label: `${country.isoCode} - ${country.name}` }));
  const productOptions = productList.map((product) => ({ value: product.id, label: product.name }));
  // Active rules first so the ones that decide routing are read before the disabled ones.
  const orderedRules = [...rules.data.items].sort(
    (left, right) => Number(right.status === "active") - Number(left.status === "active") || countryName(left.countryId).localeCompare(countryName(right.countryId))
  );
  const ruleOptions = orderedRules.map((rule) => ({ id: rule.id, label: ruleSummary(rule, `${countryName(rule.countryId)} / ${productName(rule.productId)}`) }));
  // Oldest request first: it is the one that has waited the longest.
  const pendingItems = [...pending.data.items].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue" }, { label: "Routage" }]}
        title="Règles de routage"
        description="Règles auditées par pays et produit. Chaque mode classe uniquement des courtiers partenaires déjà jugés éligibles: licence valide, autorisations pays/produit, capacité et quota mensuel."
        actions={
          <>
            <Button href="/routing/anomalies" variant="secondary">Anomalies de routage</Button>
            <Button href="/routing/history" variant="secondary">Historique de routage</Button>
          </>
        }
      />
      <StateMessage>Le mode multi-envoi ne s'applique que si le flag est ouvert et si le visiteur l'accepte: sinon la demande part à un seul courtier partenaire, avec un motif audité. {AI_ASSISTED_MODE_NOTE}</StateMessage>

      {unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {forbidden ? <StateMessage tone="danger">Accès routage refusé pour ce rôle admin.</StateMessage> : null}
      {rules.status === "error" ? <StateMessage tone="danger">Règles indisponibles. {readFailureDetail(rules.error)}</StateMessage> : null}
      {pending.status === "error" ? <StateMessage tone="warning">File d'assignation manuelle indisponible. {readFailureDetail(pending.error)}</StateMessage> : null}

      {rules.status === "success" ? (
        <>
          <StatStrip
            label="Synthèse routage"
            items={[
              { label: "Règles actives", value: activeRules.length, tone: "success" },
              { label: "Règles désactivées", value: rules.data.total - activeRules.length, tone: "disabled" },
              { label: "Demandes en attente d'assignation", value: pending.status === "success" ? pending.data.total : "-", tone: pending.data.total > 0 ? "warning" : "neutral", href: "#assignation-manuelle" }
            ]}
          />

          <Card title="Règles" description="Les règles actives sont listées en premier. Pour modifier ou désactiver une règle, utilisez « Mettre à jour une règle » plus bas.">
            <DataTable
              columns={[
                { key: "country", header: "Pays", render: (rule) => countryName(rule.countryId) },
                { key: "product", header: "Produit", render: (rule) => productName(rule.productId) },
                { key: "mode", header: "Mode", render: (rule) => modeLabels[rule.mode] },
                { key: "status", header: "Statut", render: (rule) => <StatusBadge status={rule.status} tones={ruleStatusTones} /> },
                { key: "version", header: "Version", render: (rule) => rule.version, numeric: true, align: "right" },
                { key: "parameters", header: "Paramètres", render: (rule) => rule.mode === "priority" ? `${rule.priorities.length} priorité(s)` : rule.mode === "exclusive" ? `exclusif ${rule.exclusivePartnerTenantId?.slice(0, 8) ?? "-"}` : rule.mode === "multi_send" ? `jusqu'à ${rule.maxRecipients} courtiers, si le visiteur l'accepte` : rule.mode === "ai_assisted" ? "suggestion IA à valider par un admin" : rule.description ?? "-" },
                { key: "id", header: "Identifiant", render: (rule) => <span className="bo-ref">{rule.id}</span> }
              ]}
              items={orderedRules}
              getKey={(rule) => rule.id}
              dense
              emptyLabel="Aucune règle: le routage applique le premier courtier partenaire éligible."
              aria-label="Règles de routage"
            />
          </Card>

          <Grid columns="two">
            <CreateRoutingRuleForm countries={countryOptions} products={productOptions} />
            <UpdateRoutingRuleForm rules={ruleOptions} />
          </Grid>

          <div id="assignation-manuelle">
          <Card
            title="Assignation manuelle"
            description="Demandes consenties parquées par une règle en mode manuel, les plus anciennes d'abord. Seuls les courtiers partenaires éligibles sont proposés; l'assignation est auditée et notifie le courtier."
          >
            {pending.status === "forbidden" ? <StateMessage tone="warning">File d'assignation non accessible pour ce rôle.</StateMessage> : null}
            <DataTable
              columns={[
                { key: "reference", header: "Référence", render: (quote) => <span className="bo-ref">{quote.publicReference}</span> },
                { key: "scope", header: "Scope", render: (quote) => `${quote.countryCode} / ${quote.productKey}` },
                { key: "createdAt", header: "Reçue le", render: (quote) => new Date(quote.createdAt).toISOString().slice(0, 16).replace("T", " ") },
                { key: "candidates", header: "Candidats éligibles", render: (quote) => `${quote.candidates.filter((candidate) => candidate.eligible).length} / ${quote.candidates.length}` },
                { key: "context", header: "Motif de mise en attente", render: (quote) => <PendingContext quote={quote} /> },
                { key: "assign", header: "Assigner", render: (quote) => <AssignPendingQuoteForm quote={quote} /> }
              ]}
              items={pendingItems}
              getKey={(quote) => quote.quoteRequestId}
              emptyLabel="Aucune demande en attente d'assignation manuelle."
              emptyDescription="Les demandes apparaissent ici lorsqu'une règle en mode manuel les met en attente."
              aria-label="Demandes en attente d'assignation manuelle"
            />
          </Card>
          </div>

          <ReassignLeadForm />

          <RoutingPrecheckForm countries={countryOptions} products={productOptions} />
        </>
      ) : null}
    </PageStack>
  );
}
