"use client";

import { useActionState, useId, useState } from "react";
import {
  createCrmConnectorAction,
  rotateCrmConnectorSecretAction,
  updateCrmConnectorStatusAction,
  type CrmActionState
} from "../lib/crm-connector-actions";
import { CatalogActionResult } from "../lib/ui/catalog-action-result";
import { Button, CheckboxGroup, Field, Form, FormActions, Input, Notice, Select, fieldControlProps } from "../lib/ui/admin-ui";

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
    <Field id={id} label="Motif (audité)" required>
      <Input {...fieldControlProps(id, { required: true })} name="reason" minLength={8} />
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
      <Field id={`${base}-partner`} label="Partenaire" required>
        <Select
          {...fieldControlProps(`${base}-partner`, { required: true })}
          name="partnerTenantId"
          defaultValue=""
          placeholder="Choisir un partenaire"
          options={partners.map((partner) => ({ value: partner.id, label: partner.label }))}
        />
      </Field>
      <Field id={`${base}-name`} label="Nom du connecteur" required>
        <Input {...fieldControlProps(`${base}-name`, { required: true })} name="name" maxLength={120} />
      </Field>
      <Field id={`${base}-url`} label="URL du CRM (HTTPS)" required>
        <Input {...fieldControlProps(`${base}-url`, { required: true })} name="url" type="url" placeholder="https://" />
      </Field>
      <CheckboxGroup legend="Événements transmis" name="eventTypes" options={EVENT_OPTIONS} columns={1} />
      <Field id={`${base}-header-name`} label="Nom de l'en-tête d'authentification (facultatif)">
        <Input {...fieldControlProps(`${base}-header-name`)} name="authHeaderName" maxLength={64} autoComplete="off" placeholder="X-Api-Key" />
      </Field>
      <Field id={`${base}-header-value`} label="Valeur de l'en-tête (jamais réaffichée)">
        <Input {...fieldControlProps(`${base}-header-value`)} name="authHeaderValue" type="password" autoComplete="off" maxLength={512} />
      </Field>
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Création...">
          Créer le connecteur
        </Button>
      </FormActions>
    </Form>
  );
}

export function CrmStatusForm({ connectorId, status }: { connectorId: string; status: string }) {
  const [state, formAction, pending] = useActionState(updateCrmConnectorStatusAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-crm-form="connector-status">
      <CatalogActionResult state={state} />
      <input type="hidden" name="id" value={connectorId} />
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        {status !== "active" ? (
          <Button type="submit" name="status" value="active" size="sm" variant="secondary" pending={pending} pendingLabel="Envoi...">
            Activer
          </Button>
        ) : null}
        {status === "active" ? (
          <Button type="submit" name="status" value="suspended" size="sm" variant="secondary" pending={pending} pendingLabel="Envoi...">
            Suspendre
          </Button>
        ) : null}
        {status !== "disabled" ? (
          <Button type="submit" name="status" value="disabled" size="sm" variant="secondary" pending={pending} pendingLabel="Envoi...">
            Désactiver
          </Button>
        ) : null}
      </FormActions>
    </Form>
  );
}

export function RotateSecretForm({ connectorId }: { connectorId: string }) {
  const [state, formAction, pending] = useActionState(rotateCrmConnectorSecretAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-crm-form="connector-rotate-secret">
      <CatalogActionResult state={state} />
      {state.secret ? <SecretReveal secret={state.secret} /> : null}
      <input type="hidden" name="id" value={connectorId} />
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Envoi...">
          Renouveler le secret
        </Button>
      </FormActions>
    </Form>
  );
}
