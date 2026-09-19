import { readRoutingPendingQueue, readRoutingRules, type RoutingRuleData } from "../lib/admin-api";
import { Badge, Card, DataTable, KpiCard, PageHeader, StateMessage } from "../lib/ui/admin-ui";
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
    <div className="page-stack">
      <PageHeader
        kicker="Routage des leads"
        title="Regles de routage"
        description="Regles configurables et auditees par pays/produit. Chaque mode classe uniquement des courtiers partenaires deja juges eligibles: licence valide, autorisations pays/produit, capacite et quota mensuel."
      />

      {unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {forbidden ? <StateMessage tone="danger">Acces routage refuse pour ce role admin.</StateMessage> : null}
      {rules.status === "error" ? <StateMessage tone="danger">Regles indisponibles: {rules.error}</StateMessage> : null}

      {rules.status === "success" ? (
        <>
          <section className="admin-grid admin-grid--kpi" aria-label="Synthese routage">
            <KpiCard label="Regles actives" value={activeRules.length} tone="success" />
            <KpiCard label="Regles desactivees" value={rules.data.total - activeRules.length} tone="disabled" />
            <KpiCard label="Demandes en attente d'assignation" value={pending.status === "success" ? pending.data.total : "-"} tone={pending.data.total > 0 ? "warning" : "neutral"} />
          </section>

          <Card>
            <h2 className="section-title">Regles</h2>
            <DataTable
              columns={[
                { header: "Pays", render: (rule) => <code>{rule.countryId.slice(0, 8)}</code> },
                { header: "Produit", render: (rule) => (rule.productId ? <code>{rule.productId.slice(0, 8)}</code> : "Tous") },
                { header: "Mode", render: (rule) => modeLabels[rule.mode] },
                { header: "Statut", render: (rule) => <Badge tone={rule.status === "active" ? "success" : "disabled"}>{rule.status}</Badge> },
                { header: "Version", render: (rule) => rule.version },
                { header: "Parametres", render: (rule) => rule.mode === "priority" ? `${rule.priorities.length} priorite(s)` : rule.mode === "exclusive" ? `exclusif ${rule.exclusivePartnerTenantId?.slice(0, 8) ?? "-"}` : rule.mode === "multi_send" ? `jusqu'a ${rule.maxRecipients} courtiers, si le visiteur l'accepte` : rule.description ?? "-" },
                { header: "Identifiant", render: (rule) => <code>{rule.id}</code> }
              ]}
              items={rules.data.items}
              getKey={(rule) => rule.id}
              emptyLabel="Aucune regle: le routage applique le premier courtier partenaire eligible."
            />
          </Card>

          <section className="admin-grid admin-grid--two">
            <CreateRoutingRuleForm />
            <UpdateRoutingRuleForm ruleIds={rules.data.items.map((rule) => rule.id)} />
          </section>

          <Card>
            <h2 className="section-title">Assignation manuelle</h2>
            <p className="page-description">Demandes consenties parquees par une regle en mode manuel. Seuls les courtiers partenaires eligibles sont proposes; l'assignation est auditee et notifie le courtier.</p>
            {pending.status === "forbidden" ? <StateMessage tone="warning">File d'assignation non accessible pour ce role.</StateMessage> : null}
            <DataTable
              columns={[
                { header: "Reference", render: (quote) => <code>{quote.publicReference}</code> },
                { header: "Scope", render: (quote) => `${quote.countryCode} / ${quote.productKey}` },
                { header: "Recue le", render: (quote) => new Date(quote.createdAt).toISOString().slice(0, 16).replace("T", " ") },
                { header: "Candidats eligibles", render: (quote) => `${quote.candidates.filter((candidate) => candidate.eligible).length} / ${quote.candidates.length}` },
                { header: "Assigner", render: (quote) => <AssignPendingQuoteForm quote={quote} /> }
              ]}
              items={pending.data.items}
              getKey={(quote) => quote.quoteRequestId}
              emptyLabel="Aucune demande en attente d'assignation manuelle."
            />
          </Card>

          <ReassignLeadForm />

          <StateMessage>Le mode multi-envoi ne s'applique que si le flag est ouvert et si le visiteur l'accepte: sinon la demande part a un seul courtier partenaire, avec un motif audite. Le routage assiste par IA n'est pas propose: l'IA ne decide jamais de l'eligibilite.</StateMessage>
        </>
      ) : null}
    </div>
  );
}
