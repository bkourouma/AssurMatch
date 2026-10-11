import { readRoutingPendingQueue, readRoutingRules, type RoutingRuleData } from "../lib/admin-api";
import {
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
import { AssignPendingQuoteForm, CreateRoutingRuleForm, ReassignLeadForm, UpdateRoutingRuleForm } from "./routing-forms";

const modeLabels: Record<RoutingRuleData["mode"], string> = {
  first_eligible: "Premier eligible",
  round_robin: "Round-robin",
  priority: "Priorite commerciale",
  capacity: "Capacite",
  performance: "Performance",
  exclusive: "Exclusif",
  manual: "Manuel",
  multi_send: "Multi-courtiers"
};

export default async function RoutingPage() {
  const [rules, pending] = await Promise.all([readRoutingRules(), readRoutingPendingQueue()]);
  const unauthenticated = rules.unauthenticated || pending.unauthenticated;
  const forbidden = rules.forbidden && pending.forbidden;
  const activeRules = rules.data.items.filter((rule) => rule.status === "active");

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue" }, { label: "Routage" }]}
        title="Regles de routage"
        description="Regles auditees par pays et produit. Chaque mode classe uniquement des courtiers partenaires deja juges eligibles: licence valide, autorisations pays/produit, capacite et quota mensuel."
      />
      <StateMessage>Le mode multi-envoi ne s'applique que si le flag est ouvert et si le visiteur l'accepte: sinon la demande part a un seul courtier partenaire, avec un motif audite. Le routage assiste par IA n'est pas propose: l'IA ne decide jamais de l'eligibilite.</StateMessage>

      {unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {forbidden ? <StateMessage tone="danger">Acces routage refuse pour ce role admin.</StateMessage> : null}
      {rules.status === "error" ? <StateMessage tone="danger">Regles indisponibles: {rules.error}</StateMessage> : null}

      {rules.status === "success" ? (
        <>
          <StatStrip
            label="Synthese routage"
            items={[
              { label: "Regles actives", value: activeRules.length, tone: "success" },
              { label: "Regles desactivees", value: rules.data.total - activeRules.length, tone: "disabled" },
              { label: "Demandes en attente d'assignation", value: pending.status === "success" ? pending.data.total : "-", tone: pending.data.total > 0 ? "warning" : "neutral", href: "#assignation-manuelle" }
            ]}
          />

          <Card title="Regles">
            <DataTable
              columns={[
                { key: "country", header: "Pays", render: (rule) => <span className="bo-ref">{rule.countryId.slice(0, 8)}</span> },
                { key: "product", header: "Produit", render: (rule) => (rule.productId ? <span className="bo-ref">{rule.productId.slice(0, 8)}</span> : "Tous") },
                { key: "mode", header: "Mode", render: (rule) => modeLabels[rule.mode] },
                { key: "status", header: "Statut", render: (rule) => <StatusBadge status={rule.status} tones={ruleStatusTones} /> },
                { key: "version", header: "Version", render: (rule) => rule.version, numeric: true, align: "right" },
                { key: "parameters", header: "Parametres", render: (rule) => rule.mode === "priority" ? `${rule.priorities.length} priorite(s)` : rule.mode === "exclusive" ? `exclusif ${rule.exclusivePartnerTenantId?.slice(0, 8) ?? "-"}` : rule.mode === "multi_send" ? `jusqu'a ${rule.maxRecipients} courtiers, si le visiteur l'accepte` : rule.description ?? "-" },
                { key: "id", header: "Identifiant", render: (rule) => <span className="bo-ref">{rule.id}</span> }
              ]}
              items={rules.data.items}
              getKey={(rule) => rule.id}
              emptyLabel="Aucune regle: le routage applique le premier courtier partenaire eligible."
              aria-label="Regles de routage"
            />
          </Card>

          <Grid columns="two">
            <CreateRoutingRuleForm />
            <UpdateRoutingRuleForm ruleIds={rules.data.items.map((rule) => rule.id)} />
          </Grid>

          <div id="assignation-manuelle">
          <Card
            title="Assignation manuelle"
            description="Demandes consenties parquees par une regle en mode manuel. Seuls les courtiers partenaires eligibles sont proposes; l'assignation est auditee et notifie le courtier."
          >
            {pending.status === "forbidden" ? <StateMessage tone="warning">File d'assignation non accessible pour ce role.</StateMessage> : null}
            <DataTable
              columns={[
                { key: "reference", header: "Reference", render: (quote) => <span className="bo-ref">{quote.publicReference}</span> },
                { key: "scope", header: "Scope", render: (quote) => `${quote.countryCode} / ${quote.productKey}` },
                { key: "createdAt", header: "Recue le", render: (quote) => new Date(quote.createdAt).toISOString().slice(0, 16).replace("T", " ") },
                { key: "candidates", header: "Candidats eligibles", render: (quote) => `${quote.candidates.filter((candidate) => candidate.eligible).length} / ${quote.candidates.length}` },
                { key: "assign", header: "Assigner", render: (quote) => <AssignPendingQuoteForm quote={quote} /> }
              ]}
              items={pending.data.items}
              getKey={(quote) => quote.quoteRequestId}
              emptyLabel="Aucune demande en attente d'assignation manuelle."
              aria-label="Demandes en attente d'assignation manuelle"
            />
          </Card>
          </div>

          <ReassignLeadForm />
        </>
      ) : null}
    </PageStack>
  );
}
