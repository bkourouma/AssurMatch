"use client";

import { useActionState, useId } from "react";
import {
  createInsurerAction,
  retireInsurerAction,
  updateInsurerAction,
  type InsurerActionState
} from "../lib/lot4-offers-actions";
import { INSURER_EDIT_STATUS_OPTIONS, INSURER_STATUS_HINT, INSURER_STATUS_LABELS } from "../lib/offer-messages";
import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  Form,
  FormActions,
  FormSection,
  Input,
  Notice,
  Select,
  fieldControlProps
} from "../lib/ui/admin-ui";

/**
 * Spec 070: forms of the insurer referential. Pattern A (`useActionState` + server actions of
 * `lib/lot4-offers-actions.ts`); every write asks for the audited reason. The code and the country
 * are chosen at creation and never change.
 */
const initialState: InsurerActionState = { status: "idle" };

export interface InsurerSelectChoice {
  value: string;
  label: string;
}

function ActionResult({ state }: { state: InsurerActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return <Notice tone={state.status === "success" ? "success" : "danger"}><p>{state.message}</p></Notice>;
}

function ReasonField({ id }: { id: string }) {
  return (
    <Field id={id} label="Motif (audité)" required hint="Au moins 8 caractères, conservé dans le journal d'audit.">
      <Input {...fieldControlProps(id, { required: true, hint: "x" })} name="reason" minLength={8} />
    </Field>
  );
}

export function CreateInsurerForm({ countries }: { countries: InsurerSelectChoice[] }) {
  const [state, formAction, pending] = useActionState(createInsurerAction, initialState);
  const base = useId();
  return (
    <Card title="Nouvel assureur" description="L'assureur est créé actif. Le couple pays + code est unique et ne pourra plus changer.">
      <Form action={formAction} data-insurer-form="create">
        <ActionResult state={state} />
        <FormSection legend="Identité">
          <Field id={`${base}-country`} label="Pays" required>
            <Select {...fieldControlProps(`${base}-country`, { required: true })} name="countryId" options={countries} placeholder="Choisir un pays" defaultValue="" />
          </Field>
          <Field id={`${base}-name`} label="Nom de l'assureur" required>
            <Input {...fieldControlProps(`${base}-name`, { required: true })} name="name" maxLength={120} />
          </Field>
          <Field id={`${base}-code`} label="Code" required hint="Minuscules, chiffres et tirets (par exemple « saham-ci »). Définitif.">
            <Input {...fieldControlProps(`${base}-code`, { required: true, hint: "x" })} name="code" minLength={2} maxLength={40} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
          </Field>
          <Field id={`${base}-approval`} label="Numéro d'agrément" hint="Facultatif.">
            <Input {...fieldControlProps(`${base}-approval`, { hint: "x" })} name="approvalNumber" maxLength={60} />
          </Field>
        </FormSection>
        <ReasonField id={`${base}-reason`} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer l&apos;assureur</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export interface EditableInsurer {
  id: string;
  name: string;
  code: string;
  approvalNumber?: string | undefined;
  status: string;
  concurrencyToken: string;
}

export function EditInsurerForm({ insurer }: { insurer: EditableInsurer }) {
  const [state, formAction, pending] = useActionState(updateInsurerAction, initialState);
  const base = useId();
  const retired = insurer.status === "retired";
  return (
    <Card title="Modifier l'assureur" description={INSURER_STATUS_HINT}>
      <Form action={formAction} data-insurer-form="update">
        <ActionResult state={state} />
        <input type="hidden" name="insurerId" value={insurer.id} />
        <input type="hidden" name="expectedUpdatedAt" value={insurer.concurrencyToken} />
        <FormSection legend="Identité">
          <Field id={`${base}-code`} label="Code" hint="Définitif : le code ne peut pas être modifié.">
            <Input {...fieldControlProps(`${base}-code`, { hint: "x" })} value={insurer.code} readOnly />
          </Field>
          <Field id={`${base}-name`} label="Nom de l'assureur" required>
            <Input {...fieldControlProps(`${base}-name`, { required: true })} name="name" maxLength={120} defaultValue={insurer.name} disabled={retired} />
          </Field>
          <Field id={`${base}-approval`} label="Numéro d'agrément" hint="Vider le champ pour l'effacer.">
            <Input {...fieldControlProps(`${base}-approval`, { hint: "x" })} name="approvalNumber" maxLength={60} defaultValue={insurer.approvalNumber ?? ""} disabled={retired} />
          </Field>
          <Field id={`${base}-status`} label="Statut" hint={retired ? "Un assureur retiré ne peut plus être modifié." : "Actif ou suspendu. Le retrait est une action distincte, plus bas."}>
            <Select {...fieldControlProps(`${base}-status`, { hint: "x" })} name="status" defaultValue={retired ? "active" : insurer.status} disabled={retired}>
              {INSURER_EDIT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{INSURER_STATUS_LABELS[option]}</option>)}
            </Select>
          </Field>
        </FormSection>
        {retired ? null : (
          <>
            <ReasonField id={`${base}-reason`} />
            <FormActions>
              <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer</Button>
            </FormActions>
          </>
        )}
      </Form>
    </Card>
  );
}

export function RetireInsurerForm({ insurerId }: { insurerId: string }) {
  const [state, formAction] = useActionState(retireInsurerAction, initialState);
  const base = useId();
  return (
    <Card title="Retirer l'assureur" description="Un assureur retiré n'apparaît plus dans les choix d'offre. Les offres existantes gardent son nom. L'action est auditée avec son motif.">
      <ActionResult state={state} />
      <ConfirmDialog
        triggerLabel="Retirer l'assureur"
        triggerVariant="danger"
        title="Retirer l'assureur"
        description="L'assureur ne pourra plus être choisi pour une nouvelle offre."
        confirmLabel="Retirer l'assureur"
        cancelLabel="Annuler"
        tone="danger"
        formAction={formAction}
        dataAttributes={{ "data-insurer-form": "retire" }}
      >
        <ActionResult state={state} />
        <input type="hidden" name="insurerId" value={insurerId} />
        <ReasonField id={`${base}-reason`} />
      </ConfirmDialog>
    </Card>
  );
}
