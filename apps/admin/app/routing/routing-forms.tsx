"use client";

import { useActionState, useId, useState } from "react";
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
import { AI_ASSISTED_MODE_LABEL, AI_ASSISTED_MODE_NOTE } from "./routing-labels";
import { assignPendingQuoteAction, createRoutingRuleAction, precheckRoutingAction, reassignLeadAction, updateRoutingRuleAction, type RoutingActionState } from "./actions";

const initialState: RoutingActionState = { status: "idle" };

const modeOptions: Array<{ value: string; label: string }> = [
  { value: "first_eligible", label: "Premier éligible (comportement historique)" },
  { value: "round_robin", label: "Round-robin (le moins récemment servi)" },
  { value: "priority", label: "Priorité commerciale (ordre configuré)" },
  { value: "capacity", label: "Capacité (quota mensuel restant)" },
  { value: "performance", label: "Performance (taux d'acceptation, réactivité)" },
  { value: "exclusive", label: "Exclusif (un seul courtier partenaire)" },
  { value: "manual", label: "Manuel (assignation par un admin)" },
  { value: "multi_send", label: "Multi-courtiers (si le flag est ouvert et si le visiteur l'accepte)" },
  { value: "ai_assisted", label: AI_ASSISTED_MODE_LABEL }
];

function ModeSelect({ id, name, required }: { id: string; name: string; required?: boolean }) {
  return (
    <Select {...fieldControlProps(id, { required })} name={name} defaultValue={required ? "round_robin" : ""}>
      {required ? null : <option value="">(inchangé)</option>}
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
    <Card title="Créer une règle de routage">
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
        <Notice tone="info">{AI_ASSISTED_MODE_NOTE}</Notice>
        <Field id={ids.priorities} label="Priorités (partnerId:priorité, une par ligne, mode priorité)">
          <Textarea {...fieldControlProps(ids.priorities)} name="priorities" rows={3} />
        </Field>
        <Field id={ids.exclusive} label="Courtier partenaire exclusif (UUID, mode exclusif)">
          <Input {...fieldControlProps(ids.exclusive)} name="exclusivePartnerTenantId" />
        </Field>
        <Field id={ids.maxRecipients} label="Nombre maximum de courtiers (mode multi-courtiers, 2 à 5)">
          <Input {...fieldControlProps(ids.maxRecipients)} name="maxRecipients" type="number" min={2} max={5} defaultValue={3} />
        </Field>
        <Field id={ids.description} label="Description">
          <Input {...fieldControlProps(ids.description)} name="description" maxLength={500} />
        </Field>
        <Field id={ids.reason} label="Motif (audité)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer la règle</Button>
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
    <Card title="Mettre à jour une règle">
      <Form action={formAction} data-routing-form="update">
        <ActionNotice state={state} />
        <Field id={ids.ruleId} label="Règle" required>
          <Select {...fieldControlProps(ids.ruleId, { required: true })} name="ruleId" options={ruleIds.map((id) => ({ value: id, label: id }))} />
        </Field>
        <Field id={ids.mode} label="Mode">
          <ModeSelect id={ids.mode} name="mode" />
        </Field>
        <Field id={ids.status} label="Statut">
          <Select {...fieldControlProps(ids.status)} name="status" defaultValue="">
            <option value="">(inchangé)</option>
            <option value="active">active</option>
            <option value="disabled">désactivée</option>
          </Select>
        </Field>
        <Notice tone="info">{AI_ASSISTED_MODE_NOTE}</Notice>
        <Field id={ids.priorities} label="Priorités (partnerId:priorité, une par ligne)">
          <Textarea {...fieldControlProps(ids.priorities)} name="priorities" rows={3} />
        </Field>
        <Field id={ids.exclusive} label="Courtier partenaire exclusif (UUID)">
          <Input {...fieldControlProps(ids.exclusive)} name="exclusivePartnerTenantId" />
        </Field>
        <Field id={ids.description} label="Description">
          <Input {...fieldControlProps(ids.description)} name="description" maxLength={500} />
        </Field>
        <Field id={ids.reason} label="Motif (audité)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Mise à jour..." disabled={ruleIds.length === 0}>Mettre à jour</Button>
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
  const [selectedPartner, setSelectedPartner] = useState<string>(eligible[0]?.partnerTenantId ?? "");
  const suggestion = quote.aiSuggestion ?? null;
  const suggestedCandidate = suggestion ? eligible.find((candidate) => candidate.partnerTenantId === suggestion.partnerTenantId) : undefined;

  return (
    <Form action={formAction} data-routing-form="assign">
      <ActionNotice state={state} />
      <input type="hidden" name="quoteRequestId" value={quote.quoteRequestId} />
      {suggestion ? (
        <Notice tone="info">
          <p>
            Suggestion IA (indicative) : {suggestedCandidate?.legalName ?? suggestion.partnerTenantId.slice(0, 8)}, {suggestion.rationale}
          </p>
          <p>La suggestion n'affecte rien : vous validez en assignant vous-même.</p>
          {suggestedCandidate ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => setSelectedPartner(suggestedCandidate.partnerTenantId)}>
              Pré-sélectionner ce courtier
            </Button>
          ) : (
            <p>Ce courtier n'est plus éligible : choisissez un autre courtier.</p>
          )}
        </Notice>
      ) : null}
      <Field id={ids.partner} label="Courtier partenaire éligible" required>
        <Select
          {...fieldControlProps(ids.partner, { required: true })}
          name="partnerTenantId"
          value={selectedPartner}
          onChange={(event) => setSelectedPartner(event.target.value)}
          options={eligible.map((candidate) => ({ value: candidate.partnerTenantId, label: `${candidate.legalName} (${candidate.plan})` }))}
        />
      </Field>
      <Field id={ids.reason} label="Motif (audité)" required>
        <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" pending={pending} pendingLabel="Assignation..." disabled={eligible.length === 0}>Assigner</Button>
      </FormActions>
      {eligible.length === 0 ? (
        <Notice tone="danger">Aucun courtier partenaire éligible: vérifier licences, autorisations et quotas.</Notice>
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
      title="Réassigner un lead"
      description="Le nouveau courtier partenaire doit être éligible (licence, autorisations, quota). L'ancien perd l'accès au lead et le nouveau est notifié."
    >
      <ConfirmDialog
        triggerLabel="Réassigner un lead"
        triggerVariant="secondary"
        title="Réassigner un lead"
        description="Le nouveau courtier partenaire doit être éligible (licence, autorisations, quota). L'ancien perd l'accès au lead et le nouveau est notifié."
        confirmLabel="Réassigner"
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
        <Field id={ids.reason} label="Motif (audité)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

// Lot 6 (spec 073 T402)
export function RoutingPrecheckForm() {
  const [state, formAction, pending] = useActionState(precheckRoutingAction, initialState);
  const base = useId();
  const ids = { partner: `${base}-partner`, country: `${base}-country`, product: `${base}-product`, consent: `${base}-consent` };

  return (
    <Card title="Pré-contrôle de routage" description="Vérifie l'éligibilité d'un courtier partenaire pour un pays, un produit et un consentement. Chaque vérification est auditée.">
      <Form action={formAction} data-routing-form="precheck">
        <Notice tone="info">Simulation : aucun courtier notifié, aucun lead transmis.</Notice>
        <ActionNotice state={state} />
        <Field id={ids.partner} label="Courtier partenaire (UUID)" required>
          <Input {...fieldControlProps(ids.partner, { required: true })} name="partnerTenantId" />
        </Field>
        <Field id={ids.country} label="Pays (UUID)" required>
          <Input {...fieldControlProps(ids.country, { required: true })} name="countryId" />
        </Field>
        <Field id={ids.product} label="Produit (UUID)" required>
          <Input {...fieldControlProps(ids.product, { required: true })} name="productId" />
        </Field>
        <Field id={ids.consent} label="Identifiant de consentement (UUID)">
          <Input {...fieldControlProps(ids.consent)} name="consentRecordId" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Vérification...">Vérifier l'éligibilité</Button>
        </FormActions>
      </Form>
    </Card>
  );
}
// Lot 6 (end)
