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
import { Button, CheckboxGroup, Field, Form, FormActions, Input, Notice, Select, fieldControlProps } from "../lib/ui/admin-ui";

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
    <Field id={id} label="Motif (audité)" required>
      <Input {...fieldControlProps(id, { required: true })} name="reason" minLength={8} {...(defaultValue ? { defaultValue } : {})} />
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
      <PartnerSelect id={`${base}-partner`} partners={partners} />
      <Field id={`${base}-name`} label="Nom de la clé" required>
        <Input {...fieldControlProps(`${base}-name`, { required: true })} name="name" maxLength={120} />
      </Field>
      <CheckboxGroup legend="Scopes" name="scopes" options={SCOPE_OPTIONS} columns={1} />
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Création...">
          Créer la clé API
        </Button>
      </FormActions>
    </Form>
  );
}

export function RevokeApiKeyForm({ keyId }: { keyId: string }) {
  const [state, formAction, pending] = useActionState(revokePartnerApiKeyAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-integration-form="api-key-revoke">
      <CatalogActionResult state={state} />
      <input type="hidden" name="id" value={keyId} />
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Envoi...">
          Révoquer
        </Button>
      </FormActions>
    </Form>
  );
}

export function CreateWebhookEndpointForm({ partners }: { partners: PartnerOption[] }) {
  const [state, formAction, pending] = useActionState(createPartnerWebhookEndpointAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-integration-form="webhook-endpoint-create">
      <CatalogActionResult state={state} />
      {state.secret ? <SecretReveal secret={state.secret} /> : null}
      <PartnerSelect id={`${base}-partner`} partners={partners} />
      <Field id={`${base}-url`} label="URL (HTTPS)" required>
        <Input {...fieldControlProps(`${base}-url`, { required: true })} name="url" type="url" placeholder="https://" />
      </Field>
      <Field id={`${base}-description`} label="Description (facultatif)">
        <Input {...fieldControlProps(`${base}-description`)} name="description" maxLength={240} />
      </Field>
      <CheckboxGroup legend="Événements autorisés" name="eventTypes" options={EVENT_OPTIONS} columns={1} />
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Création...">
          Créer l&apos;endpoint
        </Button>
      </FormActions>
    </Form>
  );
}

export function EndpointStatusForm({ endpointId, status }: { endpointId: string; status: string }) {
  const [state, formAction, pending] = useActionState(updatePartnerWebhookEndpointStatusAction, initialState);
  const base = useId();
  const nextStatus = status === "active" ? "suspended" : "active";
  return (
    <Form action={formAction} data-integration-form="webhook-endpoint-status">
      <CatalogActionResult state={state} />
      <input type="hidden" name="id" value={endpointId} />
      <input type="hidden" name="status" value={nextStatus} />
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Envoi...">
          {nextStatus === "active" ? "Activer" : "Suspendre"}
        </Button>
      </FormActions>
    </Form>
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
      <Field id={`${base}-origin`} label="Origine (HTTPS)" required>
        <Input {...fieldControlProps(`${base}-origin`, { required: true })} name="origin" type="url" placeholder="https://" />
      </Field>
      <Field id={`${base}-path`} label="Chemin (facultatif)">
        <Input {...fieldControlProps(`${base}-path`)} name="path" maxLength={240} placeholder="/webhooks" />
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

export function RevokeAllowlistForm({ entryId }: { entryId: string }) {
  const [state, formAction, pending] = useActionState(revokePartnerWebhookAllowlistAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-integration-form="webhook-allowlist-revoke">
      <CatalogActionResult state={state} />
      <input type="hidden" name="id" value={entryId} />
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Envoi...">
          Révoquer
        </Button>
      </FormActions>
    </Form>
  );
}
