"use client";

import { useActionState, useId } from "react";
import type { PendingManualQuoteData } from "../lib/admin-api";
import {
  ActionNotice,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Form,
  FormActions,
  Input,
  Notice,
  Select,
  Textarea,
  fieldControlProps
} from "../lib/ui/admin-ui";
import { assignPendingQuoteAction, createRoutingRuleAction, reassignLeadAction, updateRoutingRuleAction, type RoutingActionState } from "./actions";

const initialState: RoutingActionState = { status: "idle" };

const modeOptions: Array<{ value: string; label: string }> = [
  { value: "first_eligible", label: "Premier eligible (comportement historique)" },
  { value: "round_robin", label: "Round-robin (le moins recemment servi)" },
  { value: "priority", label: "Priorite commerciale (ordre configure)" },
  { value: "capacity", label: "Capacite (quota mensuel restant)" },
  { value: "performance", label: "Performance (taux d'acceptation, reactivite)" },
  { value: "exclusive", label: "Exclusif (un seul courtier partenaire)" },
  { value: "manual", label: "Manuel (assignation par un admin)" },
  { value: "multi_send", label: "Multi-courtiers (si le flag est ouvert et si le visiteur l'accepte)" }
];

function ModeSelect({ id, name, required }: { id: string; name: string; required?: boolean }) {
  return (
    <Select {...fieldControlProps(id, { required })} name={name} defaultValue={required ? "round_robin" : ""}>
      {required ? null : <option value="">(inchange)</option>}
      {modeOptions.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </Select>
  );
}

export function CreateRoutingRuleForm() {
  const [state, formAction, pending] = useActionState(createRoutingRuleAction, initialState);
  const base = useId();
  const ids = {
    countryId: `${base}-country`,
    productId: `${base}-product`,
    mode: `${base}-mode`,
    priorities: `${base}-priorities`,
    exclusive: `${base}-exclusive`,
    maxRecipients: `${base}-max`,
    description: `${base}-description`,
    reason: `${base}-reason`
  };

  return (
    <Card title="Creer une regle de routage">
      <Form action={formAction} data-routing-form="create">
        <ActionNotice state={state} />
        <Field id={ids.countryId} label="Pays (UUID)" required>
          <Input {...fieldControlProps(ids.countryId, { required: true })} name="countryId" />
        </Field>
        <Field id={ids.productId} label="Produit (UUID, vide = tous les produits du pays)">
          <Input {...fieldControlProps(ids.productId)} name="productId" />
        </Field>
        <Field id={ids.mode} label="Mode" required>
          <ModeSelect id={ids.mode} name="mode" required />
        </Field>
        <Field id={ids.priorities} label="Priorites (partnerId:priorite, une par ligne, mode priorite)">
          <Textarea {...fieldControlProps(ids.priorities)} name="priorities" rows={3} />
        </Field>
        <Field id={ids.exclusive} label="Courtier partenaire exclusif (UUID, mode exclusif)">
          <Input {...fieldControlProps(ids.exclusive)} name="exclusivePartnerTenantId" />
        </Field>
        <Field id={ids.maxRecipients} label="Nombre maximum de courtiers (mode multi-courtiers, 2 a 5)">
          <Input {...fieldControlProps(ids.maxRecipients)} name="maxRecipients" type="number" min={2} max={5} defaultValue={3} />
        </Field>
        <Field id={ids.description} label="Description">
          <Input {...fieldControlProps(ids.description)} name="description" maxLength={500} />
        </Field>
        <Field id={ids.reason} label="Motif (audite)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Creation...">Creer la regle</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function UpdateRoutingRuleForm({ ruleIds }: { ruleIds: string[] }) {
  const [state, formAction, pending] = useActionState(updateRoutingRuleAction, initialState);
  const base = useId();
  const ids = {
    ruleId: `${base}-rule`,
    mode: `${base}-mode`,
    status: `${base}-status`,
    priorities: `${base}-priorities`,
    exclusive: `${base}-exclusive`,
    description: `${base}-description`,
    reason: `${base}-reason`
  };

  return (
    <Card title="Mettre a jour une regle">
      <Form action={formAction} data-routing-form="update">
        <ActionNotice state={state} />
        <Field id={ids.ruleId} label="Regle" required>
          <Select {...fieldControlProps(ids.ruleId, { required: true })} name="ruleId" options={ruleIds.map((id) => ({ value: id, label: id }))} />
        </Field>
        <Field id={ids.mode} label="Mode">
          <ModeSelect id={ids.mode} name="mode" />
        </Field>
        <Field id={ids.status} label="Statut">
          <Select {...fieldControlProps(ids.status)} name="status" defaultValue="">
            <option value="">(inchange)</option>
            <option value="active">active</option>
            <option value="disabled">desactivee</option>
          </Select>
        </Field>
        <Field id={ids.priorities} label="Priorites (partnerId:priorite, une par ligne)">
          <Textarea {...fieldControlProps(ids.priorities)} name="priorities" rows={3} />
        </Field>
        <Field id={ids.exclusive} label="Courtier partenaire exclusif (UUID)">
          <Input {...fieldControlProps(ids.exclusive)} name="exclusivePartnerTenantId" />
        </Field>
        <Field id={ids.description} label="Description">
          <Input {...fieldControlProps(ids.description)} name="description" maxLength={500} />
        </Field>
        <Field id={ids.reason} label="Motif (audite)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Mise a jour..." disabled={ruleIds.length === 0}>Mettre a jour</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function AssignPendingQuoteForm({ quote }: { quote: PendingManualQuoteData }) {
  const [state, formAction, pending] = useActionState(assignPendingQuoteAction, initialState);
  const eligible = quote.candidates.filter((candidate) => candidate.eligible);
  const base = useId();
  const ids = { partner: `${base}-partner`, reason: `${base}-reason` };

  return (
    <Form action={formAction} data-routing-form="assign">
      <ActionNotice state={state} />
      <input type="hidden" name="quoteRequestId" value={quote.quoteRequestId} />
      <Field id={ids.partner} label="Courtier partenaire eligible" required>
        <Select
          {...fieldControlProps(ids.partner, { required: true })}
          name="partnerTenantId"
          options={eligible.map((candidate) => ({ value: candidate.partnerTenantId, label: `${candidate.legalName} (${candidate.plan})` }))}
        />
      </Field>
      <Field id={ids.reason} label="Motif (audite)" required>
        <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" pending={pending} pendingLabel="Assignation..." disabled={eligible.length === 0}>Assigner</Button>
      </FormActions>
      {eligible.length === 0 ? (
        <Notice tone="danger">Aucun courtier partenaire eligible: verifier licences, autorisations et quotas.</Notice>
      ) : null}
    </Form>
  );
}

export function ReassignLeadForm() {
  const [state, formAction] = useActionState(reassignLeadAction, initialState);
  const base = useId();
  const ids = { assignmentId: `${base}-assignment`, partner: `${base}-partner`, reason: `${base}-reason` };

  return (
    <Card
      title="Reassigner un lead"
      description="Le nouveau courtier partenaire doit etre eligible (licence, autorisations, quota). L'ancien perd l'acces au lead et le nouveau est notifie."
    >
      <ConfirmDialog
        triggerLabel="Reassigner un lead"
        triggerVariant="secondary"
        title="Reassigner un lead"
        description="Le nouveau courtier partenaire doit etre eligible (licence, autorisations, quota). L'ancien perd l'acces au lead et le nouveau est notifie."
        confirmLabel="Reassigner"
        cancelLabel="Annuler"
        tone="danger"
        formAction={formAction}
        dataAttributes={{ "data-routing-form": "reassign" }}
      >
        <ActionNotice state={state} />
        <Field id={ids.assignmentId} label="Assignation (UUID)" required>
          <Input {...fieldControlProps(ids.assignmentId, { required: true })} name="assignmentId" />
        </Field>
        <Field id={ids.partner} label="Nouveau courtier partenaire (UUID)" required>
          <Input {...fieldControlProps(ids.partner, { required: true })} name="partnerTenantId" />
        </Field>
        <Field id={ids.reason} label="Motif (audite)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}
