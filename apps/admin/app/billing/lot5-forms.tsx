"use client";

import { useActionState, useId } from "react";
import {
  ActionNotice,
  Button,
  Card,
  Checkbox,
  Cluster,
  Field,
  Form,
  FormActions,
  Input,
  Select,
  fieldControlProps
} from "../lib/ui/admin-ui";
import {
  assignAddOnAction,
  decidePlanChangeAction,
  endAddOnAction,
  updateSubscriptionAction,
  upsertAddOnPriceAction,
  type Lot5ActionState
} from "./lot5-actions";
import { ADD_ON_KIND_OPTIONS, PLAN_OPTIONS, SUBSCRIPTION_STATUS_OPTIONS, SUBSCRIPTION_ROUTING_NOTICE } from "./lot5-labels";

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
        <Field id={ids.kind} label="Type de module" required>
          <Select {...fieldControlProps(ids.kind, { required: true })} name="kind" defaultValue="api" options={ADD_ON_KIND_OPTIONS} />
        </Field>
        <Field id={ids.plan} label="Plan" required>
          <Select {...fieldControlProps(ids.plan, { required: true })} name="plan" defaultValue="pro" options={PLAN_OPTIONS} />
        </Field>
        <Field id={ids.country} label="Pays (code ISO)" required>
          <Input {...fieldControlProps(ids.country, { required: true })} name="countryCode" maxLength={2} placeholder="CI" />
        </Field>
        <Field id={ids.amount} label="Montant mensuel (XOF)" required>
          <Input {...fieldControlProps(ids.amount, { required: true })} name="monthlyAmount" type="number" min={0} max={10000000} step={100} defaultValue={0} />
        </Field>
        <Field id={ids.reason} label="Motif (audité)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" placeholder="Motif du tarif" />
        </Field>
        <Checkbox name="enabled" label="Activé" hint="Décoché : le prix est enregistré mais le module n'est pas proposé." />
        <FormActions>
          <Button type="submit" variant="secondary" pending={pending} pendingLabel="Enregistrement...">Enregistrer le prix</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

/** Opens or closes an existing price row with an audited reason. */
export function AddOnPriceToggleForm({ price }: { price: { kind: string; plan: string; countryCode?: string; monthlyAmount?: number; enabled?: boolean } }) {
  const [state, formAction, pending] = useActionState(upsertAddOnPriceAction, initialState);
  const base = useId();
  const reasonId = `${base}-reason`;

  return (
    <Form action={formAction} data-lot5-form="add-on-price-toggle">
      <ActionNotice state={state} />
      <input type="hidden" name="kind" value={price.kind} />
      <input type="hidden" name="plan" value={price.plan} />
      <input type="hidden" name="countryCode" value={price.countryCode ?? ""} />
      <input type="hidden" name="monthlyAmount" value={price.monthlyAmount ?? 0} />
      <input type="hidden" name="enabled" value={price.enabled ? "false" : "true"} />
      <Field id={reasonId} label="Motif (audité)" required>
        <Input {...fieldControlProps(reasonId, { required: true })} name="reason" />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" variant={price.enabled ? "danger" : "secondary"} pending={pending} pendingLabel="Enregistrement...">
          {price.enabled ? "Désactiver" : "Activer"}
        </Button>
      </FormActions>
    </Form>
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
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" placeholder="Motif de l'affectation" />
        </Field>
        <FormActions>
          <Button type="submit" variant="secondary" pending={pending} pendingLabel="Affectation..." disabled={partners.length === 0}>Affecter le module</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function EndAddOnForm({ addOnId }: { addOnId: string }) {
  const [state, formAction, pending] = useActionState(endAddOnAction, initialState);
  const base = useId();
  const reasonId = `${base}-reason`;

  return (
    <Form action={formAction} data-lot5-form="add-on-end">
      <ActionNotice state={state} />
      <input type="hidden" name="addOnId" value={addOnId} />
      <Field id={reasonId} label="Motif (audité)" required>
        <Input {...fieldControlProps(reasonId, { required: true })} name="reason" />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" variant="danger" pending={pending} pendingLabel="Fin en cours...">Terminer l'affectation</Button>
      </FormActions>
    </Form>
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
      <Field id={ids.status} label="Statut de l'abonnement" required>
        <Select {...fieldControlProps(ids.status, { required: true })} name="status" defaultValue={status} options={SUBSCRIPTION_STATUS_OPTIONS} />
      </Field>
      <Field id={ids.expires} label="Date d'expiration du contrat (vide = durée indéterminée)">
        <Input {...fieldControlProps(ids.expires)} name="contractExpiresAt" type="date" defaultValue={contractExpiresAt ?? ""} />
      </Field>
      <Field id={ids.reason} label="Motif (audité)" required>
        <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" placeholder="Motif du changement d'état" />
      </Field>
      <FormActions>
        <Button type="submit" variant="secondary" pending={pending} pendingLabel="Enregistrement...">Enregistrer l'état</Button>
      </FormActions>
      <p>{SUBSCRIPTION_ROUTING_NOTICE}</p>
    </Form>
  );
}

/** Accept or refuse a plan-change request; the reason is mandatory and audited. */
export function PlanChangeDecisionForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(decidePlanChangeAction, initialState);
  const base = useId();
  const reasonId = `${base}-reason`;

  return (
    <Form action={formAction} data-lot5-form="plan-change-decision">
      <ActionNotice state={state} />
      <input type="hidden" name="requestId" value={requestId} />
      <Field id={reasonId} label="Motif de la décision (obligatoire)" required>
        <Input {...fieldControlProps(reasonId, { required: true })} name="reason" minLength={3} maxLength={500} />
      </Field>
      <FormActions>
        <Cluster>
          <Button type="submit" size="sm" name="decision" value="accept" pending={pending} pendingLabel="Décision...">Accepter</Button>
          <Button type="submit" size="sm" variant="danger" name="decision" value="refuse" disabled={pending}>Refuser</Button>
        </Cluster>
      </FormActions>
    </Form>
  );
}
