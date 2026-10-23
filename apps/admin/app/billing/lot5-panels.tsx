import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  FilterBar,
  Form,
  FormActions,
  Notice,
  Select,
  StatStrip,
  StateMessage,
  fieldControlProps
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";
import type { DraftInvoiceData } from "../lib/admin-api";
import {
  readAddOnPrices,
  readPartnerAddOns,
  readPartnerSubscription,
  readPlanChangeRequests,
  type BillingAddOnPrice,
  type PartnerAddOn,
  type PlanChangeRequest,
  type PlanChangeRequestStatus
} from "./lot5-api";
import {
  AddOnPriceForm,
  AddOnPriceToggleForm,
  AssignAddOnForm,
  EndAddOnForm,
  PlanChangeDecisionForm,
  SubscriptionForm,
  type Lot5PartnerChoice
} from "./lot5-forms";
import {
  ADD_ON_KIND_LABELS,
  PLAN_CHANGE_EFFECT_NOTICE,
  PLAN_CHANGE_STATUS_FILTER_OPTIONS,
  PLAN_CHANGE_STATUS_LABELS,
  PLAN_CHANGE_STATUS_TONES,
  PLAN_LABELS,
  SUBSCRIPTION_ROUTING_NOTICE,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONES,
  billingLineKindLabel
} from "./lot5-labels";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAN_CHANGE_STATUSES = new Set(["pending", "accepted", "refused", "cancelled"]);

function xof(amount: number): string {
  return `${amount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} XOF`;
}

function day(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-";
}

function readFailure(label: string, state: { status: string; error?: string | undefined }) {
  if (state.status === "success") return null;
  if (state.status === "forbidden") return <StateMessage tone="warning">{label} : accès refusé pour ce rôle.</StateMessage>;
  if (state.status === "unauthenticated") return <StateMessage tone="danger">Session admin requise.</StateMessage>;
  return <StateMessage tone="danger">{label} indisponible ({state.error ?? "erreur"}).</StateMessage>;
}

/** Draft lines of every partner, with the Lot 5 kinds (`setup_fee`, `add_on`) worded for finance. */
export function DraftLinesPanel({ drafts }: { drafts: DraftInvoiceData[] }) {
  type Row = DraftInvoiceData["lines"][number] & { key: string; partnerName: string; reference: string };
  const rows: Row[] = drafts.flatMap((draft) =>
    draft.lines.map((line, index) => ({ ...line, key: `${draft.id}-${index}`, partnerName: draft.partnerName, reference: draft.reference }))
  );
  const columns: Array<DataTableColumn<Row>> = [
    { key: "partner", header: "Partenaire", render: (row) => <strong>{row.partnerName}</strong> },
    { key: "reference", header: "Référence", render: (row) => <code>{row.reference}</code> },
    { key: "kind", header: "Nature", render: (row) => billingLineKindLabel(row.kind) },
    { key: "label", header: "Libellé", render: (row) => row.label },
    { key: "quantity", header: "Quantité", render: (row) => row.quantity, numeric: true, align: "right" },
    { key: "unit", header: "Prix unitaire", render: (row) => xof(row.unitAmount), numeric: true, align: "right" },
    { key: "amount", header: "Montant", render: (row) => xof(row.amount), numeric: true, align: "right" }
  ];
  return (
    <Card title="Lignes des brouillons" description="Les frais d'installation ne figurent que sur la première facture du courtier ; un module complémentaire est facturé chaque mois.">
      <DataTable columns={columns} items={rows} getKey={(row) => row.key} emptyLabel="Aucune ligne de brouillon." aria-label="Lignes des brouillons mensuels" />
    </Card>
  );
}

function priceColumns(): Array<DataTableColumn<BillingAddOnPrice>> {
  return [
    { key: "country", header: "Pays", render: (price) => price.countryCode },
    { key: "plan", header: "Plan", render: (price) => PLAN_LABELS[price.plan] ?? price.plan },
    { key: "kind", header: "Type de module", render: (price) => ADD_ON_KIND_LABELS[price.kind] ?? price.kind },
    { key: "amount", header: "Montant mensuel", render: (price) => xof(price.monthlyAmount), numeric: true, align: "right" },
    {
      key: "enabled",
      header: "État",
      render: (price) => <Badge tone={price.enabled ? "success" : "disabled"}>{price.enabled ? "Activé" : "Désactivé"}</Badge>
    },
    { key: "updatedAt", header: "Mis à jour le", render: (price) => day(price.updatedAt) },
    { key: "toggle", header: "Activer ou désactiver", render: (price) => <AddOnPriceToggleForm price={price} /> }
  ];
}

function addOnColumns(partnerNames: Map<string, string>): Array<DataTableColumn<PartnerAddOn>> {
  return [
    { key: "partner", header: "Courtier", render: (addOn) => <strong>{partnerNames.get(addOn.partnerId) ?? addOn.partnerId.slice(0, 8)}</strong> },
    { key: "kind", header: "Module", render: (addOn) => ADD_ON_KIND_LABELS[addOn.kind] ?? addOn.kind },
    {
      key: "status",
      header: "Statut",
      render: (addOn) => <Badge tone={addOn.status === "active" ? "success" : "disabled"}>{addOn.status === "active" ? "Actif" : "Terminé"}</Badge>
    },
    { key: "assignedAt", header: "Affecté le", render: (addOn) => day(addOn.assignedAt) },
    { key: "endedAt", header: "Terminé le", render: (addOn) => day(addOn.endedAt) },
    { key: "reason", header: "Motif", render: (addOn) => addOn.reason },
    { key: "end", header: "Fin d'affectation", render: (addOn) => (addOn.status === "active" ? <EndAddOnForm addOnId={addOn.id} /> : "-") }
  ];
}

function PlanChangeEffect({ request }: { request: PlanChangeRequest }) {
  if (request.status === "accepted") return <>À partir du {day(request.effectiveAt)} (prochain cycle)</>;
  if (request.status === "pending") return <>Au prochain cycle mensuel si acceptée</>;
  return <>-</>;
}

function planChangeColumns(): Array<DataTableColumn<PlanChangeRequest>> {
  return [
    { key: "partner", header: "Courtier", render: (request) => <strong>{request.partnerName ?? request.partnerId.slice(0, 8)}</strong> },
    { key: "change", header: "Changement", render: (request) => `${PLAN_LABELS[request.currentPlan] ?? request.currentPlan} vers ${PLAN_LABELS[request.requestedPlan] ?? request.requestedPlan}` },
    { key: "justification", header: "Justification", render: (request) => request.justification },
    { key: "requestedAt", header: "Demandée le", render: (request) => day(request.requestedAt) },
    {
      key: "status",
      header: "Statut",
      render: (request) => <Badge tone={PLAN_CHANGE_STATUS_TONES[request.status] ?? "neutral"}>{PLAN_CHANGE_STATUS_LABELS[request.status] ?? request.status}</Badge>
    },
    { key: "effect", header: "Effet", render: (request) => <PlanChangeEffect request={request} /> },
    {
      key: "decision",
      header: "Décision",
      render: (request) =>
        request.status === "pending" ? (
          <PlanChangeDecisionForm requestId={request.id} />
        ) : (
          <span>{request.decisionReason ? `${day(request.decidedAt)} - ${request.decisionReason}` : day(request.decidedAt)}</span>
        )
    }
  ];
}

export interface Lot5PanelsProps {
  partners: Lot5PartnerChoice[];
  /** Partner chosen in the subscription selector (query string). */
  subscriptionPartnerId: string;
  /** Status filter of the plan-change inbox (query string). */
  planStatus: string;
}

/**
 * Lot 5 (spec 071): "Modules et abonnements" tab of the admin billing page. The caller only renders it
 * for roles holding `billing:plan_manage` (finance admin, super admin); the API re-checks every call.
 */
export async function Lot5BillingPanels({ partners, subscriptionPartnerId, planStatus }: Lot5PanelsProps) {
  const partnerNames = new Map(partners.map((partner) => [partner.partnerId, partner.partnerName]));
  const selectedPartner = UUID.test(subscriptionPartnerId) ? subscriptionPartnerId : "";
  const statusFilter = PLAN_CHANGE_STATUSES.has(planStatus) ? (planStatus as PlanChangeRequestStatus) : undefined;
  const [prices, addOns, subscription, requests] = await Promise.all([
    readAddOnPrices(),
    readPartnerAddOns(),
    selectedPartner ? readPartnerSubscription(selectedPartner) : Promise.resolve(undefined),
    readPlanChangeRequests(statusFilter ? { status: statusFilter } : {})
  ]);
  const pendingCount = requests.status === "success" ? requests.data.items.filter((request) => request.status === "pending").length : 0;

  return (
    <>
      <StatStrip
        label="Synthèse modules et abonnements"
        items={[
          { label: "Prix de modules activés", value: prices.data.filter((price) => price.enabled).length, tone: "success" },
          { label: "Modules affectés (actifs)", value: addOns.data.filter((addOn) => addOn.status === "active").length, tone: "info" },
          { label: "Demandes de changement de plan en attente", value: pendingCount, tone: pendingCount > 0 ? "warning" : "neutral" }
        ]}
      />

      <Card
        title="Demandes de changement de plan"
        description="Le propriétaire d'un cabinet demande un autre plan ; la décision est auditée. Aucun paiement en ligne."
      >
        <Notice tone="info">{PLAN_CHANGE_EFFECT_NOTICE}</Notice>
        <FilterBar
          action="/billing"
          label="Filtrer les demandes de changement de plan"
          submitLabel="Filtrer"
          resetLabel="Réinitialiser"
          resetHref="/billing?tab=modules"
          activeCount={statusFilter ? 1 : 0}
        >
          <input type="hidden" name="tab" value="modules" />
          {selectedPartner ? <input type="hidden" name="abonnement" value={selectedPartner} /> : null}
          <Field id="plan-change-status" label="Statut">
            <Select {...fieldControlProps("plan-change-status")} name="planStatus" defaultValue={statusFilter ?? ""} options={PLAN_CHANGE_STATUS_FILTER_OPTIONS} />
          </Field>
        </FilterBar>
        {readFailure("Demandes de changement de plan", requests)}
        <DataTable
          columns={planChangeColumns()}
          items={requests.data.items}
          getKey={(request) => request.id}
          emptyLabel="Aucune demande de changement de plan."
          aria-label="Demandes de changement de plan"
        />
      </Card>

      <Card
        title="Prix des modules complémentaires"
        description="Accès API, marque blanche et module IA, par pays, plan et type. Tous les modules sont désactivés par défaut."
      >
        {readFailure("Prix des modules", prices)}
        <DataTable
          columns={priceColumns()}
          items={prices.data}
          getKey={(price) => price.id}
          emptyLabel="Aucun prix de module : aucun module n'est proposé."
          aria-label="Prix des modules complémentaires"
        />
      </Card>
      <AddOnPriceForm />

      <Card title="Modules affectés aux courtiers">
        {readFailure("Modules affectés", addOns)}
        <DataTable
          columns={addOnColumns(partnerNames)}
          items={addOns.data}
          getKey={(addOn) => addOn.id}
          emptyLabel="Aucun module affecté."
          aria-label="Modules affectés aux courtiers"
        />
      </Card>
      <AssignAddOnForm partners={partners} />

      <Card title="État d'abonnement d'un courtier" description={SUBSCRIPTION_ROUTING_NOTICE}>
        <Form method="get" action="/billing" columns={2}>
          <input type="hidden" name="tab" value="modules" />
          {statusFilter ? <input type="hidden" name="planStatus" value={statusFilter} /> : null}
          <Field id="subscription-partner" label="Courtier">
            <Select
              {...fieldControlProps("subscription-partner")}
              name="abonnement"
              defaultValue={selectedPartner}
              placeholder="Choisir un courtier"
              options={partners.map((partner) => ({ value: partner.partnerId, label: partner.partnerName }))}
            />
          </Field>
          <FormActions>
            <Button type="submit" variant="secondary">Afficher l'état</Button>
          </FormActions>
        </Form>
        {subscription ? readFailure("État d'abonnement", subscription) : null}
        {subscription?.status === "success" && subscription.data ? (
          <>
            <p>
              <Badge tone={SUBSCRIPTION_STATUS_TONES[subscription.data.status] ?? "neutral"}>
                {SUBSCRIPTION_STATUS_LABELS[subscription.data.status] ?? subscription.data.status}
              </Badge>{" "}
              Contrat : {subscription.data.contractExpiresAt ? `expire le ${day(subscription.data.contractExpiresAt)}` : "durée indéterminée"}.
              {subscription.data.reason ? ` Dernier motif : ${subscription.data.reason}.` : ""}
            </p>
            <SubscriptionForm
              key={subscription.data.partnerId}
              partnerId={subscription.data.partnerId}
              status={subscription.data.status}
              contractExpiresAt={subscription.data.contractExpiresAt}
            />
          </>
        ) : null}
        {!subscription ? <StateMessage tone="info">Choisissez un courtier pour afficher et modifier son état d'abonnement.</StateMessage> : null}
      </Card>
    </>
  );
}
