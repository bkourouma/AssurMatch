"use client";

import { useActionState, useId, useState } from "react";
import {
  createPartnerApiKeyAction,
  createPartnerWebhookAllowlistAction,
  createPartnerWebhookEndpointAction,
  revokePartnerApiKeyAction,
  revokePartnerWebhookAllowlistAction,
  sendPartnerWebhookTestEventAction,
  updatePartnerWebhookEndpointStatusAction,
  type IntegrationActionState
} from "../lib/partner-integration-actions";
import { CatalogActionResult } from "../lib/ui/catalog-action-result";
import { Button, CheckboxGroup, ConfirmDialog, Field, Form, FormActions, FormSection, Input, Notice, Select, fieldControlProps } from "../lib/ui/admin-ui";
import { UnsavedChangesNotice } from "../lib/ui/unsaved-changes-notice";

const initialState: IntegrationActionState = { status: "idle" };

export interface PartnerOption {
  id: string;
  label: string;
}

const SCOPE_OPTIONS = [
  { value: "leads:read_assigned", label: "leads:read_assigned", hint: "Lire les leads attribués" },
  { value: "notifications:read", label: "notifications:read", hint: "Lire les notifications" },
  { value: "webhooks:manage", label: "webhooks:manage", hint: "Gérer ses webhooks" }
];

const EVENT_OPTIONS = [
  { value: "lead.assigned", label: "lead.assigned" },
  { value: "lead.status_changed", label: "lead.status_changed" },
  { value: "notification.failed", label: "notification.failed" }
];

function PartnerSelect({ id, partners }: { id: string; partners: PartnerOption[] }) {
  return (
    <Field id={id} label="Partenaire" required>
      <Select
        {...fieldControlProps(id, { required: true })}
        name="partnerTenantId"
        defaultValue=""
        placeholder="Choisir un partenaire"
        options={partners.map((partner) => ({ value: partner.id, label: partner.label }))}
      />
    </Field>
  );
}

function ReasonField({ id, defaultValue }: { id: string; defaultValue?: string }) {
  return (
    <Field id={id} label="Motif (audité)" required hint="8 caractères au moins. Le motif est conservé dans le journal d'audit.">
      <Input
        {...fieldControlProps(id, { required: true, hint: "8 caractères au moins. Le motif est conservé dans le journal d'audit." })}
        name="reason"
        minLength={8}
        {...(defaultValue ? { defaultValue } : {})}
      />
    </Field>
  );
}

/**
 * One-time secret display. The value lives only in the action state held by this component: it is
 * not written to the URL, storage, cookies or logs, and disappears on navigation or reload.
 */
function SecretReveal({ secret }: { secret: NonNullable<IntegrationActionState["secret"]> }) {
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

export function CreateApiKeyForm({ partners }: { partners: PartnerOption[] }) {
  const [state, formAction, pending] = useActionState(createPartnerApiKeyAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-integration-form="api-key-create">
      <CatalogActionResult state={state} />
      {state.secret ? <SecretReveal secret={state.secret} /> : null}
      <FormSection legend="Clé" description="La clé complète n'est montrée qu'à la création : copiez-la alors.">
        <PartnerSelect id={`${base}-partner`} partners={partners} />
        <Field id={`${base}-name`} label="Nom de la clé" required hint="Nom interne pour reconnaître la clé dans la liste.">
          <Input {...fieldControlProps(`${base}-name`, { required: true, hint: "Nom interne pour reconnaître la clé dans la liste." })} name="name" maxLength={120} />
        </Field>
      </FormSection>
      <CheckboxGroup legend="Scopes" name="scopes" options={SCOPE_OPTIONS} columns={1} />
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <UnsavedChangesNotice />
        <Button type="submit" pending={pending} pendingLabel="Création...">
          Créer la clé API
        </Button>
      </FormActions>
    </Form>
  );
}

export function RevokeApiKeyForm({ keyId, keyLabel }: { keyId: string; keyLabel: string }) {
  const [state, formAction] = useActionState(revokePartnerApiKeyAction, initialState);
  const base = useId();
  return (
    <ConfirmDialog
      triggerLabel="Révoquer"
      triggerVariant="danger"
      title={`Révoquer la clé API ${keyLabel}`}
      description="La clé ne pourra plus appeler la Partner API. La révocation ne peut pas être annulée depuis cet écran : créez une nouvelle clé si le partenaire en a encore besoin. Le motif est audité."
      confirmLabel="Révoquer"
      cancelLabel="Annuler"
      tone="danger"
      formAction={formAction}
      dataAttributes={{ "data-integration-form": "api-key-revoke" }}
    >
      <CatalogActionResult state={state} />
      <input type="hidden" name="id" value={keyId} />
      <ReasonField id={`${base}-reason`} />
    </ConfirmDialog>
  );
}

export function CreateWebhookEndpointForm({ partners }: { partners: PartnerOption[] }) {
  const [state, formAction, pending] = useActionState(createPartnerWebhookEndpointAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-integration-form="webhook-endpoint-create">
      <CatalogActionResult state={state} />
      {state.secret ? <SecretReveal secret={state.secret} /> : null}
      <FormSection legend="Destination" description="L'endpoint est créé désactivé. L'origine de l'URL doit figurer dans l'allow-list du partenaire (carte « Ajouter une origine autorisée »).">
        <PartnerSelect id={`${base}-partner`} partners={partners} />
        <Field id={`${base}-url`} label="URL (HTTPS)" required hint="L'adresse doit commencer par https://.">
          <Input {...fieldControlProps(`${base}-url`, { required: true, hint: "L'adresse doit commencer par https://." })} name="url" type="url" placeholder="https://" />
        </Field>
        <Field id={`${base}-description`} label="Description (facultatif)">
          <Input {...fieldControlProps(`${base}-description`)} name="description" maxLength={240} />
        </Field>
      </FormSection>
      <CheckboxGroup legend="Événements autorisés" name="eventTypes" options={EVENT_OPTIONS} columns={1} />
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <UnsavedChangesNotice />
        <Button type="submit" pending={pending} pendingLabel="Création...">
          Créer l&apos;endpoint
        </Button>
      </FormActions>
    </Form>
  );
}

export function EndpointStatusForm({ endpointId, status, endpointLabel }: { endpointId: string; status: string; endpointLabel: string }) {
  const [state, formAction] = useActionState(updatePartnerWebhookEndpointStatusAction, initialState);
  const base = useId();
  const nextStatus = status === "active" ? "suspended" : "active";
  const activating = nextStatus === "active";
  return (
    <ConfirmDialog
      triggerLabel={activating ? "Activer" : "Suspendre"}
      triggerVariant={activating ? "secondary" : "danger"}
      title={`${activating ? "Activer" : "Suspendre"} l'endpoint ${endpointLabel}`}
      description={
        activating
          ? "Les événements autorisés pourront être envoyés à cette URL dès que les envois webhook sont ouverts (flag partner_webhooks_enabled). Le motif est audité."
          : "Les envois vers cette URL sont mis en pause. L'endpoint peut être réactivé ensuite. Le motif est audité."
      }
      confirmLabel={activating ? "Activer" : "Suspendre"}
      cancelLabel="Annuler"
      tone={activating ? "primary" : "danger"}
      formAction={formAction}
      dataAttributes={{ "data-integration-form": "webhook-endpoint-status" }}
    >
      <CatalogActionResult state={state} />
      <input type="hidden" name="id" value={endpointId} />
      <input type="hidden" name="status" value={nextStatus} />
      <ReasonField id={`${base}-reason`} />
    </ConfirmDialog>
  );
}

export function TestEventForm({ endpointId }: { endpointId: string }) {
  const [state, formAction, pending] = useActionState(sendPartnerWebhookTestEventAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-integration-form="webhook-endpoint-test">
      <CatalogActionResult state={state} />
      <input type="hidden" name="id" value={endpointId} />
      <ReasonField id={`${base}-reason`} defaultValue="Test de connectivite" />
      <FormActions>
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Envoi...">
          Envoyer un événement de test
        </Button>
      </FormActions>
    </Form>
  );
}

export function CreateAllowlistForm({ partners }: { partners: PartnerOption[] }) {
  const [state, formAction, pending] = useActionState(createPartnerWebhookAllowlistAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-integration-form="webhook-allowlist-create">
      <CatalogActionResult state={state} />
      <PartnerSelect id={`${base}-partner`} partners={partners} />
      <Field id={`${base}-origin`} label="Origine (HTTPS)" required hint="Schéma et domaine, par exemple https://crm.exemple.com.">
        <Input {...fieldControlProps(`${base}-origin`, { required: true, hint: "Schéma et domaine, par exemple https://crm.exemple.com." })} name="origin" type="url" placeholder="https://" />
      </Field>
      <Field id={`${base}-path`} label="Chemin (facultatif)" hint="Laissez vide pour autoriser tous les chemins de cette origine.">
        <Input {...fieldControlProps(`${base}-path`, { hint: "Laissez vide pour autoriser tous les chemins de cette origine." })} name="path" maxLength={240} placeholder="/webhooks" />
      </Field>
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Ajout...">
          Ajouter l&apos;origine
        </Button>
      </FormActions>
    </Form>
  );
}

export function RevokeAllowlistForm({ entryId, entryLabel }: { entryId: string; entryLabel: string }) {
  const [state, formAction] = useActionState(revokePartnerWebhookAllowlistAction, initialState);
  const base = useId();
  return (
    <ConfirmDialog
      triggerLabel="Révoquer"
      triggerVariant="danger"
      title={`Révoquer l'origine autorisée ${entryLabel}`}
      description="Les endpoints du partenaire sur cette origine ne seront plus autorisés. Le motif est audité."
      confirmLabel="Révoquer"
      cancelLabel="Annuler"
      tone="danger"
      formAction={formAction}
      dataAttributes={{ "data-integration-form": "webhook-allowlist-revoke" }}
    >
      <CatalogActionResult state={state} />
      <input type="hidden" name="id" value={entryId} />
      <ReasonField id={`${base}-reason`} />
    </ConfirmDialog>
  );
}
