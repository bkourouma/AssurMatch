"use client";

import { useActionState, useId } from "react";
import type { BrokerAccountView } from "../lib/self-service-api";
import {
  cancelRequestAction,
  requestCoverageExtensionAction,
  requestIdentityChangeAction,
  updateCompanyProfileAction,
  type SelfServiceActionState
} from "../lib/self-service-actions";
import { Button, Card, ConfirmDialog, Field, Form, FormActions, FormSection, Input, Notice, Select, Textarea, fieldControlProps } from "../lib/ui/broker-ui";

/**
 * Spec 053 US1/US4: company profile forms. Contacts and commercial presentation are edited
 * directly (FR-002); identity fields and coverage extensions become requests decided by AssurMatch
 * (FR-003, FR-013). The API re-checks role, partner and suspension on every call.
 */
const initialState: SelfServiceActionState = { status: "idle" };

export function SelfServiceResult({ state }: { state: SelfServiceActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return <Notice tone={state.status === "success" ? "success" : "danger"}>{state.message}</Notice>;
}

function TextField({ base, name, label, defaultValue, type = "text", hint }: { base: string; name: string; label: string; defaultValue?: string | null; type?: string; hint?: string }) {
  const id = `${base}-${name}`;
  return (
    <Field id={id} label={label} hint={hint}>
      <Input {...fieldControlProps(id, hint ? { hint } : {})} name={name} type={type} defaultValue={defaultValue ?? ""} maxLength={160} />
    </Field>
  );
}

export function CompanyProfileForm({ account }: { account: BrokerAccountView }) {
  const [state, formAction, pending] = useActionState(updateCompanyProfileAction, initialState);
  const base = useId();
  return (
    <Card title="Contacts et présentation" description="Modifiables directement par le propriétaire et les managers. Chaque modification est tracée.">
      <SelfServiceResult state={state} />
      <Form action={formAction} columns={2} data-company-form="profile">
        <input type="hidden" name="expectedUpdatedAt" value={account.updatedAt} />
        <FormSection legend="Contact principal">
          <TextField base={base} name="primaryEmail" label="E-mail principal" type="email" defaultValue={account.primaryEmail} />
          <TextField base={base} name="primaryWhatsApp" label="WhatsApp principal" defaultValue={account.primaryWhatsApp} hint="Format international, par exemple +2250102030405." />
          <TextField base={base} name="city" label="Ville" defaultValue={account.city} />
        </FormSection>
        <FormSection legend="Contact administratif">
          <TextField base={base} name="adminContactName" label="Nom" defaultValue={account.adminContactName} />
          <TextField base={base} name="adminContactEmail" label="E-mail" type="email" defaultValue={account.adminContactEmail} />
          <TextField base={base} name="adminContactPhone" label="Téléphone" defaultValue={account.adminContactPhone} />
        </FormSection>
        <FormSection legend="Contact commercial">
          <TextField base={base} name="commercialContactName" label="Nom" defaultValue={account.commercialContactName} />
          <TextField base={base} name="commercialContactEmail" label="E-mail" type="email" defaultValue={account.commercialContactEmail} />
          <TextField base={base} name="commercialContactPhone" label="Téléphone" defaultValue={account.commercialContactPhone} />
        </FormSection>
        <FormSection legend="Assureurs partenaires">
          <Field id={`${base}-insurers`} label="Assureurs partenaires" hint="Un nom par ligne ou séparés par des virgules (20 au plus).">
            <Textarea {...fieldControlProps(`${base}-insurers`, { hint: "x" })} name="partnerInsurers" rows={3} defaultValue={account.partnerInsurers.join("\n")} />
          </Field>
          <TextField base={base} name="reason" label="Commentaire (facultatif, audité)" />
        </FormSection>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function IdentityChangeRequestForm({ countries }: { countries: Array<{ value: string; label: string }> }) {
  const [state, formAction, pending] = useActionState(requestIdentityChangeAction, initialState);
  const base = useId();
  return (
    <Card title="Demander une modification d'identité" description="Raison sociale, nom commercial, RCCM et pays sont vérifiés par AssurMatch avant toute modification. Ne renseignez que les champs à changer.">
      <SelfServiceResult state={state} />
      <Form action={formAction} columns={2} data-company-form="identity-request">
        <TextField base={base} name="legalName" label="Nouvelle raison sociale" />
        <TextField base={base} name="tradeName" label="Nouveau nom commercial" />
        <TextField base={base} name="registrationNumber" label="Nouveau RCCM" />
        <Field id={`${base}-country`} label="Nouveau pays principal">
          <Select {...fieldControlProps(`${base}-country`)} name="countryId" defaultValue="" options={[{ value: "", label: "Inchangé" }, ...countries]} />
        </Field>
        <Field id={`${base}-justification`} label="Justification" required hint="Au moins 10 caractères ; joignez les références du justificatif (extrait RCCM, statuts).">
          <Textarea {...fieldControlProps(`${base}-justification`, { required: true, hint: "x" })} name="justification" rows={3} minLength={10} maxLength={1000} />
        </Field>
        <FormActions>
          <Button type="submit" variant="secondary" pending={pending} pendingLabel="Envoi...">Envoyer la demande</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function CoverageExtensionForm({ options }: { options: Array<{ value: string; label: string }> }) {
  const [state, formAction, pending] = useActionState(requestCoverageExtensionAction, initialState);
  const base = useId();
  return (
    <Card title="Demander une extension de couverture" description="Un pays ou un produit par demande. AssurMatch l'examine ; une extension pays exige une licence valide pour ce pays.">
      <SelfServiceResult state={state} />
      {options.length === 0 ? <Notice tone="info">Aucun pays ni produit supplémentaire disponible.</Notice> : (
        <Form action={formAction} data-company-form="coverage-request">
          <Field id={`${base}-scope`} label="Pays ou produit" required>
            <Select {...fieldControlProps(`${base}-scope`, { required: true })} name="scope" defaultValue="" placeholder="Choisir" options={options} />
          </Field>
          <Field id={`${base}-justification`} label="Justification" required hint="Au moins 10 caractères : agence, licence, clientèle visée.">
            <Textarea {...fieldControlProps(`${base}-justification`, { required: true, hint: "x" })} name="justification" rows={3} minLength={10} maxLength={1000} />
          </Field>
          <FormActions>
            <Button type="submit" variant="secondary" pending={pending} pendingLabel="Envoi...">Envoyer la demande</Button>
          </FormActions>
        </Form>
      )}
    </Card>
  );
}

export function CancelRequestForm({ requestId }: { requestId: string }) {
  const [state, formAction] = useActionState(cancelRequestAction, initialState);
  const base = useId();
  return (
    <div>
      <SelfServiceResult state={state} />
      <ConfirmDialog
        triggerLabel="Annuler"
        title="Annuler la demande"
        description="La demande ne sera plus examinée. Vous pourrez en déposer une nouvelle."
        confirmLabel="Annuler la demande"
        cancelLabel="Fermer"
        tone="danger"
        formAction={formAction}
        dataAttributes={{ "data-company-form": "cancel-request" }}
      >
        <input type="hidden" name="requestId" value={requestId} />
        <Field id={`${base}-reason`} label="Commentaire (facultatif)">
          <Input {...fieldControlProps(`${base}-reason`)} name="reason" maxLength={500} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
