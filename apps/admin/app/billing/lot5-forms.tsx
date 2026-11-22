"use client";

import { useActionState, useId } from "react";
import {
  ActionNotice,
  Button,
  Card,
  Checkbox,
  Cluster,
  ConfirmDialog,
  Field,
  Form,
  FormActions,
  FormRow,
  FormSection,
  Input,
  Select,
  fieldControlProps
} from "../lib/ui/admin-ui";
import { UnsavedChangesNotice } from "../lib/ui/unsaved-changes-notice";
import {
  assignAddOnAction,
  decidePlanChangeAction,
  endAddOnAction,
  updateSubscriptionAction,
  upsertAddOnPriceAction,
  type Lot5ActionState
} from "./lot5-actions";
import { ADD_ON_KIND_LABELS, ADD_ON_KIND_OPTIONS, PLAN_LABELS, PLAN_OPTIONS, SUBSCRIPTION_STATUS_OPTIONS, SUBSCRIPTION_ROUTING_NOTICE } from "./lot5-labels";

const initialState: Lot5ActionState = { status: "idle" };

export interface Lot5PartnerChoice {
  partnerId: string;
  partnerName: string;
}

/** Records the monthly price of an add-on for a country and a plan. Disabled unless explicitly opened. */
export function AddOnPriceForm() {
  const [state, formAction, pending] = useActionState(upsertAddOnPriceAction, initialState);
  const base = useId();
  const ids = { kind: `${base}-kind`, plan: `${base}-plan`, country: `${base}-country`, amount: `${base}-amount`, reason: `${base}-reason` };

  return (
    <Card title="Enregistrer le prix d'un module" description="Un prix n'est appliqué que s'il est activé. Par défaut, un module reste désactivé.">
      <Form action={formAction} columns={2} data-lot5-form="add-on-price">
        <ActionNotice state={state} />
        <FormRow full>
          <FormSection legend="Périmètre du prix" description="Un prix existant pour le même module, plan et pays est remplacé.">
            <Field id={ids.kind} label="Type de module" required>
              <Select {...fieldControlProps(ids.kind, { required: true })} name="kind" defaultValue="api" options={ADD_ON_KIND_OPTIONS} />
            </Field>
            <Field id={ids.plan} label="Plan" required>
              <Select {...fieldControlProps(ids.plan, { required: true })} name="plan" defaultValue="pro" options={PLAN_OPTIONS} />
            </Field>
            <Field id={ids.country} label="Pays (code ISO)" required hint="Code pays sur 2 lettres, par exemple CI.">
              <Input
                {...fieldControlProps(ids.country, { required: true, hint: "Code pays sur 2 lettres, par exemple CI." })}
                name="countryCode"
                minLength={2}
                maxLength={2}
                pattern="[A-Za-z]{2}"
                title="Code pays sur 2 lettres, par exemple CI."
                placeholder="Ex. : CI"
              />
            </Field>
          </FormSection>
        </FormRow>
        <FormRow full>
          <FormSection legend="Montant et activation">
            <Field id={ids.amount} label="Montant mensuel (XOF)" required hint="Entre 0 et 10 000 000 XOF.">
              <Input {...fieldControlProps(ids.amount, { required: true, hint: "Entre 0 et 10 000 000 XOF." })} name="monthlyAmount" type="number" min={0} max={10000000} step={100} defaultValue={0} />
            </Field>
            <Checkbox name="enabled" label="Activé" hint="Décoché : le prix est enregistré mais le module n'est pas proposé." />
            <Field id={ids.reason} label="Motif (audité)" required hint="3 caractères au moins.">
              <Input {...fieldControlProps(ids.reason, { required: true, hint: "3 caractères au moins." })} name="reason" minLength={3} maxLength={300} placeholder="Ex. : Tarif 2026 négocié" />
            </Field>
          </FormSection>
        </FormRow>
        <FormRow full>
          <FormActions>
            <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer le prix</Button>
          </FormActions>
        </FormRow>
      </Form>
    </Card>
  );
}

/** Opens or closes an existing price row with an audited reason. */
export function AddOnPriceToggleForm({ price }: { price: { kind: string; plan: string; countryCode?: string; monthlyAmount?: number; enabled?: boolean } }) {
  const [state, formAction] = useActionState(upsertAddOnPriceAction, initialState);
  const base = useId();
  const reasonId = `${base}-reason`;
  const disabling = price.enabled === true;
  const verb = disabling ? "Désactiver" : "Activer";
  const target = `${ADD_ON_KIND_LABELS[price.kind] ?? price.kind}, plan ${PLAN_LABELS[price.plan] ?? price.plan}, pays ${price.countryCode ?? "?"}`;

  return (
    <ConfirmDialog
      triggerLabel={verb}
      triggerVariant={disabling ? "danger" : "secondary"}
      title={`${verb} le prix du module : ${target}`}
      description={
        disabling
          ? "Le module n'est plus proposé pour ce pays et ce plan ; le prix reste enregistré. Le motif est conservé dans le journal d'audit."
          : "Le module est proposé au prix enregistré pour ce pays et ce plan. Le motif est conservé dans le journal d'audit."
      }
      confirmLabel={verb}
      cancelLabel="Annuler"
      tone={disabling ? "danger" : "primary"}
      formAction={formAction}
      dataAttributes={{ "data-lot5-form": "add-on-price-toggle" }}
    >
      <ActionNotice state={state} />
      <input type="hidden" name="kind" value={price.kind} />
      <input type="hidden" name="plan" value={price.plan} />
      <input type="hidden" name="countryCode" value={price.countryCode ?? ""} />
      <input type="hidden" name="monthlyAmount" value={price.monthlyAmount ?? 0} />
      <input type="hidden" name="enabled" value={price.enabled ? "false" : "true"} />
      <Field id={reasonId} label="Motif (audité)" required hint="3 caractères au moins.">
        <Input {...fieldControlProps(reasonId, { required: true, hint: "3 caractères au moins." })} name="reason" minLength={3} maxLength={300} />
      </Field>
    </ConfirmDialog>
  );
}

export function AssignAddOnForm({ partners }: { partners: Lot5PartnerChoice[] }) {
  const [state, formAction, pending] = useActionState(assignAddOnAction, initialState);
  const base = useId();
  const ids = { partner: `${base}-partner`, kind: `${base}-kind`, reason: `${base}-reason` };

  return (
    <Card title="Affecter un module à un courtier" description="Le module est facturé chaque mois au prix activé du pays et du plan du courtier, sous forme de ligne « Module complémentaire ».">
      <Form action={formAction} columns={2} data-lot5-form="add-on-assign">
        <ActionNotice state={state} />
        <Field id={ids.partner} label="Courtier" required>
          <Select
            {...fieldControlProps(ids.partner, { required: true })}
            name="partnerId"
            defaultValue=""
            placeholder={partners.length ? "Choisir un courtier" : "Aucun courtier disponible"}
            options={partners.map((partner) => ({ value: partner.partnerId, label: partner.partnerName }))}
          />
        </Field>
        <Field id={ids.kind} label="Type de module" required>
          <Select {...fieldControlProps(ids.kind, { required: true })} name="kind" defaultValue="api" options={ADD_ON_KIND_OPTIONS} />
        </Field>
        <Field id={ids.reason} label="Motif (audité)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" minLength={3} maxLength={300} placeholder="Ex. : Option demandée par le cabinet" />
        </Field>
        <FormActions>
          <Button type="submit" variant="secondary" pending={pending} pendingLabel="Affectation..." disabled={partners.length === 0}>Affecter le module</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function EndAddOnForm({ addOnId, label }: { addOnId: string; label: string }) {
  const [state, formAction] = useActionState(endAddOnAction, initialState);
  const base = useId();
  const reasonId = `${base}-reason`;

  return (
    <ConfirmDialog
      triggerLabel="Terminer l'affectation"
      triggerVariant="danger"
      title={`Terminer l'affectation : ${label}`}
      description="L'affectation du module à ce courtier prend fin. L'historique est conservé et le motif est audité."
      confirmLabel="Terminer l'affectation"
      cancelLabel="Annuler"
      tone="danger"
      formAction={formAction}
      dataAttributes={{ "data-lot5-form": "add-on-end" }}
    >
      <ActionNotice state={state} />
      <input type="hidden" name="addOnId" value={addOnId} />
      <Field id={reasonId} label="Motif (audité)" required hint="3 caractères au moins.">
        <Input {...fieldControlProps(reasonId, { required: true, hint: "3 caractères au moins." })} name="reason" minLength={3} maxLength={300} />
      </Field>
    </ConfirmDialog>
  );
}

export function SubscriptionForm({
  partnerId,
  status,
  contractExpiresAt
}: {
  partnerId: string;
  status: string;
  contractExpiresAt: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateSubscriptionAction, initialState);
  const base = useId();
  const ids = { status: `${base}-status`, expires: `${base}-expires`, reason: `${base}-reason` };

  return (
    <Form action={formAction} columns={2} data-lot5-form="subscription">
      <ActionNotice state={state} />
      <input type="hidden" name="partnerId" value={partnerId} />
      <Field id={ids.status} label="Statut de l'abonnement" required hint="Suspendu ou résilié : le courtier est exclu du routage des leads.">
        <Select {...fieldControlProps(ids.status, { required: true, hint: "Suspendu ou résilié : le courtier est exclu du routage des leads." })} name="status" defaultValue={status} options={SUBSCRIPTION_STATUS_OPTIONS} />
      </Field>
      <Field id={ids.expires} label="Date d'expiration du contrat (vide = durée indéterminée)">
        <Input {...fieldControlProps(ids.expires)} name="contractExpiresAt" type="date" defaultValue={contractExpiresAt ?? ""} />
      </Field>
      <Field id={ids.reason} label="Motif (audité)" required>
        <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" minLength={3} maxLength={300} placeholder="Ex. : Impayé constaté" />
      </Field>
      <FormRow full>
        <FormActions>
          <UnsavedChangesNotice />
          <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer l'état</Button>
        </FormActions>
      </FormRow>
      <p>{SUBSCRIPTION_ROUTING_NOTICE}</p>
    </Form>
  );
}

/** Accept or refuse a plan-change request; the reason is mandatory and audited. */
export function PlanChangeDecisionForm({ requestId, summary }: { requestId: string; summary: string }) {
  const [state, formAction] = useActionState(decidePlanChangeAction, initialState);
  const base = useId();

  function decisionDialog(decision: "accept" | "refuse") {
    const accepting = decision === "accept";
    const reasonId = `${base}-${decision}-reason`;
    return (
      <ConfirmDialog
        triggerLabel={accepting ? "Accepter" : "Refuser"}
        triggerVariant={accepting ? "primary" : "danger"}
        title={`${accepting ? "Accepter" : "Refuser"} la demande de changement de plan : ${summary}`}
        description={
          accepting
            ? "La demande prend effet au prochain cycle mensuel. La décision est auditée et le motif est obligatoire."
            : "La demande est refusée et le plan actuel est conservé. La décision est auditée et le motif est obligatoire."
        }
        confirmLabel={accepting ? "Accepter" : "Refuser"}
        cancelLabel="Annuler"
        tone={accepting ? "primary" : "danger"}
        formAction={formAction}
        confirmName="decision"
        confirmValue={decision}
        dataAttributes={{ "data-lot5-form": "plan-change-decision" }}
      >
        <ActionNotice state={state} />
        <input type="hidden" name="requestId" value={requestId} />
        <Field id={reasonId} label="Motif de la décision (obligatoire)" required hint="3 caractères au moins.">
          <Input {...fieldControlProps(reasonId, { required: true, hint: "3 caractères au moins." })} name="reason" minLength={3} maxLength={500} />
        </Field>
      </ConfirmDialog>
    );
  }

  return (
    <Cluster>
      {decisionDialog("accept")}
      {decisionDialog("refuse")}
    </Cluster>
  );
}
