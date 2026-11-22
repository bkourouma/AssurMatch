"use client";

import { useActionState, useId, useState } from "react";
import {
  createCrmConnectorAction,
  rotateCrmConnectorSecretAction,
  updateCrmConnectorStatusAction,
  type CrmActionState
} from "../lib/crm-connector-actions";
import { CatalogActionResult } from "../lib/ui/catalog-action-result";
import { Button, CheckboxGroup, ConfirmDialog, Field, Form, FormActions, FormSection, Input, Notice, Select, fieldControlProps } from "../lib/ui/admin-ui";
import { UnsavedChangesNotice } from "../lib/ui/unsaved-changes-notice";

const initialState: CrmActionState = { status: "idle" };

export interface PartnerOption {
  id: string;
  label: string;
}

const EVENT_OPTIONS = [
  { value: "lead.assigned", label: "lead.assigned" },
  { value: "lead.status_changed", label: "lead.status_changed" }
];

function ReasonField({ id }: { id: string }) {
  return (
    <Field id={id} label="Motif (audité)" required hint="8 caractères au moins. Le motif est conservé dans le journal d'audit.">
      <Input {...fieldControlProps(id, { required: true, hint: "8 caractères au moins. Le motif est conservé dans le journal d'audit." })} name="reason" minLength={8} />
    </Field>
  );
}

/**
 * One-time secret display. The value lives only in the action state held by this component: it is
 * not written to the URL, storage, cookies or logs, and disappears on navigation or reload.
 */
export function SecretReveal({ secret }: { secret: NonNullable<CrmActionState["secret"]> }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret.value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }
  return (
    <Notice tone="warning" data-secret-reveal={secret.kind}>
      <p>
        <strong>Ce secret n&apos;est affiché qu&apos;une seule fois. Copiez-le maintenant.</strong>
      </p>
      <p>{secret.label} :</p>
      <p>
        <code data-secret-value="true">{secret.value}</code>
      </p>
      <Button type="button" size="sm" variant="secondary" onClick={copy}>
        Copier
      </Button>
      {copyState === "copied" ? <p role="status">Copie dans le presse-papiers.</p> : null}
      {copyState === "failed" ? <p role="status">Copie impossible : sélectionnez le secret et copiez-le manuellement.</p> : null}
      {secret.restrictions.length > 0 ? (
        <ul className="bo-list">
          {secret.restrictions.map((restriction) => (
            <li key={restriction}>{restriction}</li>
          ))}
        </ul>
      ) : null}
    </Notice>
  );
}

export function CreateCrmConnectorForm({ partners }: { partners: PartnerOption[] }) {
  const [state, formAction, pending] = useActionState(createCrmConnectorAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-crm-form="connector-create">
      <CatalogActionResult state={state} />
      {state.secret ? <SecretReveal secret={state.secret} /> : null}
      <FormSection legend="Destination" description="Le connecteur est créé désactivé : rien n'est envoyé tant qu'il n'est pas activé.">
        <Field id={`${base}-partner`} label="Partenaire" required>
          <Select
            {...fieldControlProps(`${base}-partner`, { required: true })}
            name="partnerTenantId"
            defaultValue=""
            placeholder="Choisir un partenaire"
            options={partners.map((partner) => ({ value: partner.id, label: partner.label }))}
          />
        </Field>
        <Field id={`${base}-name`} label="Nom du connecteur" required hint="Nom interne, affiché dans la liste.">
          <Input {...fieldControlProps(`${base}-name`, { required: true, hint: "Nom interne, affiché dans la liste." })} name="name" maxLength={120} />
        </Field>
        <Field id={`${base}-url`} label="URL du CRM (HTTPS)" required hint="L'adresse doit commencer par https://.">
          <Input {...fieldControlProps(`${base}-url`, { required: true, hint: "L'adresse doit commencer par https://." })} name="url" type="url" pattern="https://.*" placeholder="https://" />
        </Field>
      </FormSection>
      <CheckboxGroup legend="Événements transmis (au moins un)" name="eventTypes" options={EVENT_OPTIONS} columns={1} />
      <FormSection legend="Authentification du CRM (facultatif)" description="Le nom et la valeur de l'en-tête vont ensemble : renseignez les deux ou aucun.">
        <Field id={`${base}-header-name`} label="Nom de l'en-tête d'authentification (facultatif)">
          <Input {...fieldControlProps(`${base}-header-name`)} name="authHeaderName" maxLength={64} autoComplete="off" placeholder="X-Api-Key" />
        </Field>
        <Field id={`${base}-header-value`} label="Valeur de l'en-tête (jamais réaffichée)">
          <Input {...fieldControlProps(`${base}-header-value`)} name="authHeaderValue" type="password" autoComplete="off" maxLength={512} />
        </Field>
      </FormSection>
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <UnsavedChangesNotice />
        <Button type="submit" pending={pending} pendingLabel="Création...">
          Créer le connecteur
        </Button>
      </FormActions>
    </Form>
  );
}

const STATUS_ACTIONS: Record<string, { verb: string; tone: "primary" | "danger"; consequence: string }> = {
  active: {
    verb: "Activer",
    tone: "primary",
    consequence: "Les événements choisis seront transmis à ce CRM dès que l'envoi est ouvert pour la plateforme (flag crm_connector_enabled)."
  },
  suspended: {
    verb: "Suspendre",
    tone: "danger",
    consequence: "Les envois vers ce CRM sont mis en pause. Le connecteur peut être réactivé ensuite."
  },
  disabled: {
    verb: "Désactiver",
    tone: "danger",
    consequence: "Plus aucun envoi vers ce CRM. Le connecteur reste dans la liste et peut être réactivé."
  }
};

/**
 * Status transitions of one connector. Each allowed transition is a confirmation dialog that names
 * the connector and asks for the audited reason; the submitted fields (`id`, `status`, `reason`) are
 * unchanged.
 */
export function CrmStatusForm({ connectorId, status, connectorName }: { connectorId: string; status: string; connectorName: string }) {
  const [state, formAction] = useActionState(updateCrmConnectorStatusAction, initialState);
  const base = useId();
  const targets = ["active", "suspended", "disabled"].filter((target) => (target === "suspended" ? status === "active" : target !== status));
  return (
    <>
      {targets.map((target) => {
        const action = STATUS_ACTIONS[target]!;
        return (
          <ConfirmDialog
            key={target}
            triggerLabel={action.verb}
            triggerVariant={action.tone === "danger" ? "secondary" : "primary"}
            title={`${action.verb} le connecteur « ${connectorName} »`}
            description={action.consequence}
            confirmLabel={action.verb}
            cancelLabel="Annuler"
            tone={action.tone}
            formAction={formAction}
            confirmName="status"
            confirmValue={target}
            dataAttributes={{ "data-crm-form": "connector-status" }}
          >
            <CatalogActionResult state={state} />
            <input type="hidden" name="id" value={connectorId} />
            <ReasonField id={`${base}-${target}-reason`} />
          </ConfirmDialog>
        );
      })}
    </>
  );
}

export function RotateSecretForm({ connectorId, connectorName }: { connectorId: string; connectorName: string }) {
  const [state, formAction] = useActionState(rotateCrmConnectorSecretAction, initialState);
  const base = useId();
  return (
    <>
      <ConfirmDialog
        triggerLabel="Renouveler le secret"
        triggerVariant="secondary"
        title={`Renouveler le secret de signature du connecteur « ${connectorName} »`}
        description="Un nouveau secret de signature est généré et affiché une seule fois : mettez ensuite le CRM à jour avec ce nouveau secret. Le motif est audité."
        confirmLabel="Renouveler le secret"
        cancelLabel="Annuler"
        tone="danger"
        formAction={formAction}
        dataAttributes={{ "data-crm-form": "connector-rotate-secret" }}
      >
        <CatalogActionResult state={state} />
        {state.secret ? <p>Le nouveau secret s&apos;affiche dans la ligne du connecteur : fermez cette fenêtre (« Annuler ») pour le copier.</p> : null}
        <input type="hidden" name="id" value={connectorId} />
        <ReasonField id={`${base}-reason`} />
      </ConfirmDialog>
      {state.secret ? <SecretReveal secret={state.secret} /> : null}
    </>
  );
}
