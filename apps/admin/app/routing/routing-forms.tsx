"use client";

import { useActionState, useId, useState, type FormEvent } from "react";
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
import { AI_ASSISTED_MODE_LABEL, AI_ASSISTED_MODE_NOTE, REASON_HINT } from "./routing-labels";
import { assignPendingQuoteAction, createRoutingRuleAction, precheckRoutingAction, reassignLeadAction, updateRoutingRuleAction, type RoutingActionState } from "./actions";

const initialState: RoutingActionState = { status: "idle" };

export interface RoutingFormOption {
  value: string;
  label: string;
}

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
  // Creating a rule: the mode is a mandatory, explicit choice. The shared Select shows its "Choisir..."
  // placeholder, so the submitted value is never a silent default that differs from the first option shown.
  if (required) return <Select {...fieldControlProps(id, { required })} name={name} options={modeOptions} />;
  return (
    <Select {...fieldControlProps(id)} name={name} defaultValue="">
      <option value="">(inchangé)</option>
      {modeOptions.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </Select>
  );
}

/**
 * Identifier picked from a named list when the list could be read (the submitted value is the same
 * identifier), typed as an identifier otherwise.
 */
function IdentifierControl({
  id,
  name,
  options,
  required,
  emptyLabel,
  hint
}: {
  id: string;
  name: string;
  options: RoutingFormOption[];
  required?: boolean;
  emptyLabel?: string;
  hint?: string | undefined;
}) {
  const props = fieldControlProps(id, { required, hint });
  if (options.length === 0) return <Input {...props} name={name} />;
  if (emptyLabel) {
    return (
      <Select {...props} name={name} defaultValue="">
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
    );
  }
  return <Select {...props} name={name} options={options} />;
}

const PRIORITIES_HINT = "Une ligne par courtier : identifiantCourtier:priorité. Utilisé uniquement en mode Priorité commerciale.";
const EXCLUSIVE_HINT = "Identifiant (UUID) du courtier. Utilisé uniquement en mode Exclusif.";
const DESCRIPTION_HINT = "Facultatif, 500 caractères au plus.";
const COUNTRY_TYPED_HINT = "Identifiant (UUID) du pays.";
const PRODUCT_TYPED_HINT = "Laissez vide pour viser tous les produits du pays.";

export function CreateRoutingRuleForm({ countries, products }: { countries: RoutingFormOption[]; products: RoutingFormOption[] }) {
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
  const countryHint = countries.length > 0 ? undefined : COUNTRY_TYPED_HINT;
  const productHint = products.length > 0 ? undefined : PRODUCT_TYPED_HINT;

  return (
    <Card title="Créer une règle de routage" description="Une règle s'applique à un pays, et à un produit ou à tous les produits du pays. Les champs marqués * sont obligatoires.">
      <Form action={formAction} data-routing-form="create">
        <ActionNotice state={state} />
        <Field id={ids.countryId} label="Pays (UUID)" required hint={countryHint}>
          <IdentifierControl id={ids.countryId} name="countryId" options={countries} required hint={countryHint} />
        </Field>
        <Field id={ids.productId} label="Produit (UUID, vide = tous les produits du pays)" hint={productHint}>
          <IdentifierControl id={ids.productId} name="productId" options={products} emptyLabel="Tous les produits du pays" hint={productHint} />
        </Field>
        <Field id={ids.mode} label="Mode" required>
          <ModeSelect id={ids.mode} name="mode" required />
        </Field>
        <Notice tone="info">{AI_ASSISTED_MODE_NOTE}</Notice>
        <Field id={ids.priorities} label="Priorités (partnerId:priorité, une par ligne, mode priorité)" hint={PRIORITIES_HINT}>
          <Textarea {...fieldControlProps(ids.priorities, { hint: PRIORITIES_HINT })} name="priorities" rows={3} />
        </Field>
        <Field id={ids.exclusive} label="Courtier partenaire exclusif (UUID, mode exclusif)" hint={EXCLUSIVE_HINT}>
          <Input {...fieldControlProps(ids.exclusive, { hint: EXCLUSIVE_HINT })} name="exclusivePartnerTenantId" />
        </Field>
        <Field id={ids.maxRecipients} label="Nombre maximum de courtiers (mode multi-courtiers, 2 à 5)" hint="Utilisé uniquement en mode Multi-courtiers.">
          <Input {...fieldControlProps(ids.maxRecipients, { hint: "Utilisé uniquement en mode Multi-courtiers." })} name="maxRecipients" type="number" min={2} max={5} defaultValue={3} />
        </Field>
        <Field id={ids.description} label="Description" hint={DESCRIPTION_HINT}>
          <Input {...fieldControlProps(ids.description, { hint: DESCRIPTION_HINT })} name="description" maxLength={500} />
        </Field>
        <Field id={ids.reason} label="Motif (audité)" required requiredLabel="obligatoire" hint={REASON_HINT}>
          <Input {...fieldControlProps(ids.reason, { required: true, hint: REASON_HINT })} name="reason" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer la règle</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

const RULE_HINT = "Pays / produit - mode - version. Les règles désactivées sont indiquées.";
const STATUS_HINT = "Choisir « Désactivée » demande une confirmation.";

export function UpdateRoutingRuleForm({ rules }: { rules: Array<{ id: string; label: string }> }) {
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

  // Disabling a rule is the sensitive change of this form: the confirmation names the rule.
  function confirmDisable(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    if (data.get("status") !== "disabled") return;
    const label = rules.find((rule) => rule.id === data.get("ruleId"))?.label ?? "cette règle";
    if (!window.confirm(`Désactiver la règle « ${label} » ? Le changement est audité avec le motif saisi.`)) event.preventDefault();
  }

  return (
    <Card title="Mettre à jour une règle" description="Seuls les champs renseignés sont modifiés ; « (inchangé) » conserve la valeur actuelle. Chaque modification crée une nouvelle version.">
      <Form action={formAction} onSubmit={confirmDisable} data-routing-form="update">
        <ActionNotice state={state} />
        <Field id={ids.ruleId} label="Règle" required hint={RULE_HINT}>
          <Select {...fieldControlProps(ids.ruleId, { required: true, hint: RULE_HINT })} name="ruleId" options={rules.map((rule) => ({ value: rule.id, label: rule.label }))} />
        </Field>
        <Field id={ids.mode} label="Mode">
          <ModeSelect id={ids.mode} name="mode" />
        </Field>
        <Field id={ids.status} label="Statut" hint={STATUS_HINT}>
          <Select {...fieldControlProps(ids.status, { hint: STATUS_HINT })} name="status" defaultValue="">
            <option value="">(inchangé)</option>
            <option value="active">Active</option>
            <option value="disabled">Désactivée</option>
          </Select>
        </Field>
        <Notice tone="info">{AI_ASSISTED_MODE_NOTE}</Notice>
        <Field id={ids.priorities} label="Priorités (partnerId:priorité, une par ligne)" hint={PRIORITIES_HINT}>
          <Textarea {...fieldControlProps(ids.priorities, { hint: PRIORITIES_HINT })} name="priorities" rows={3} />
        </Field>
        <Field id={ids.exclusive} label="Courtier partenaire exclusif (UUID)" hint={EXCLUSIVE_HINT}>
          <Input {...fieldControlProps(ids.exclusive, { hint: EXCLUSIVE_HINT })} name="exclusivePartnerTenantId" />
        </Field>
        <Field id={ids.description} label="Description" hint={DESCRIPTION_HINT}>
          <Input {...fieldControlProps(ids.description, { hint: DESCRIPTION_HINT })} name="description" maxLength={500} />
        </Field>
        <Field id={ids.reason} label="Motif (audité)" required requiredLabel="obligatoire" hint={REASON_HINT}>
          <Input {...fieldControlProps(ids.reason, { required: true, hint: REASON_HINT })} name="reason" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Mise à jour..." disabled={rules.length === 0}>Mettre à jour</Button>
        </FormActions>
        {rules.length === 0 ? <Notice tone="info">Aucune règle à mettre à jour : créez-en une d'abord.</Notice> : null}
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
      <Field id={ids.reason} label="Motif (audité)" required requiredLabel="obligatoire" hint={REASON_HINT}>
        <Input {...fieldControlProps(ids.reason, { required: true, hint: REASON_HINT })} name="reason" />
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

const ASSIGNMENT_HINT = "Identifiant de l'assignation à transférer, affiché dans la liste des affectations de leads.";
const NEW_PARTNER_HINT = "Identifiant du courtier qui reprend le lead.";

export function ReassignLeadForm() {
  const [state, formAction] = useActionState(reassignLeadAction, initialState);
  const base = useId();
  const ids = { assignmentId: `${base}-assignment`, partner: `${base}-partner`, reason: `${base}-reason` };

  return (
    <Card
      title="Réassigner un lead"
      description="Transfère un lead déjà assigné vers un autre courtier partenaire. Une confirmation est demandée avant l'envoi."
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
        <Field id={ids.assignmentId} label="Assignation (UUID)" required hint={ASSIGNMENT_HINT}>
          <Input {...fieldControlProps(ids.assignmentId, { required: true, hint: ASSIGNMENT_HINT })} name="assignmentId" />
        </Field>
        <Field id={ids.partner} label="Nouveau courtier partenaire (UUID)" required hint={NEW_PARTNER_HINT}>
          <Input {...fieldControlProps(ids.partner, { required: true, hint: NEW_PARTNER_HINT })} name="partnerTenantId" />
        </Field>
        <Field id={ids.reason} label="Motif (audité)" required requiredLabel="obligatoire" hint={REASON_HINT}>
          <Input {...fieldControlProps(ids.reason, { required: true, hint: REASON_HINT })} name="reason" />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

// Lot 6 (spec 073 T402)
export function RoutingPrecheckForm({ countries, products }: { countries: RoutingFormOption[]; products: RoutingFormOption[] }) {
  const [state, formAction, pending] = useActionState(precheckRoutingAction, initialState);
  const base = useId();
  const ids = { partner: `${base}-partner`, country: `${base}-country`, product: `${base}-product`, consent: `${base}-consent` };
  // "Non éligible" is the answer of the simulation, not a failure of the tool: it is shown as a warning.
  const notice = state.status === "error" && state.message?.startsWith("Non éligible") ? { ...state, status: "warning" } : state;

  return (
    <Card title="Pré-contrôle de routage" description="Vérifie l'éligibilité d'un courtier partenaire pour un pays, un produit et un consentement. Chaque vérification est auditée.">
      <Form action={formAction} data-routing-form="precheck">
        <Notice tone="info">Simulation : aucun courtier notifié, aucun lead transmis.</Notice>
        <ActionNotice state={notice} />
        <Field id={ids.partner} label="Courtier partenaire (UUID)" required hint="Identifiant du courtier à tester.">
          <Input {...fieldControlProps(ids.partner, { required: true, hint: "Identifiant du courtier à tester." })} name="partnerTenantId" />
        </Field>
        <Field id={ids.country} label="Pays (UUID)" required>
          <IdentifierControl id={ids.country} name="countryId" options={countries} required />
        </Field>
        <Field id={ids.product} label="Produit (UUID)" required>
          <IdentifierControl id={ids.product} name="productId" options={products} required />
        </Field>
        <Field id={ids.consent} label="Identifiant de consentement (UUID)" hint="Facultatif.">
          <Input {...fieldControlProps(ids.consent, { hint: "Facultatif." })} name="consentRecordId" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Vérification...">Vérifier l'éligibilité</Button>
        </FormActions>
      </Form>
    </Card>
  );
}
// Lot 6 (end)
