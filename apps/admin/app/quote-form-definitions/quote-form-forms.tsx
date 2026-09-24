"use client";

import { useActionState, useId } from "react";
import {
  ActionNotice,
  Button,
  Card,
  Field,
  Form,
  FormActions,
  Input,
  Notice,
  Select,
  Textarea,
  fieldControlProps
} from "../lib/ui/admin-ui";
import {
  createQuoteFormDefinitionAction,
  publishQuoteFormDefinitionAction,
  retireQuoteFormDefinitionAction,
  type QuoteFormActionState
} from "./actions";

const initialState: QuoteFormActionState = { status: "idle" };

export function CreateQuoteFormDefinitionForm() {
  const [state, formAction, pending] = useActionState(createQuoteFormDefinitionAction, initialState);
  const base = useId();
  const ids = {
    countryId: `${base}-country`,
    productId: `${base}-product`,
    language: `${base}-language`,
    version: `${base}-version`,
    consentTextId: `${base}-consent`,
    fields: `${base}-fields`,
    dataMinimizationNotes: `${base}-minimization`,
    reason: `${base}-reason`
  };

  return (
    <Card title="Creer un brouillon">
      <Form action={formAction} data-quote-form="create">
        <ActionNotice state={state} />
        <Field id={ids.countryId} label="Pays (UUID)" required>
          <Input {...fieldControlProps(ids.countryId, { required: true })} name="countryId" />
        </Field>
        <Field id={ids.productId} label="Produit (UUID)" required>
          <Input {...fieldControlProps(ids.productId, { required: true })} name="productId" />
        </Field>
        <Field id={ids.language} label="Langue" required>
          <Input {...fieldControlProps(ids.language, { required: true })} name="language" defaultValue="fr" />
        </Field>
        <Field id={ids.version} label="Version" required>
          <Input {...fieldControlProps(ids.version, { required: true })} name="version" />
        </Field>
        <Field id={ids.consentTextId} label="Texte de consentement publie (UUID)" required>
          <Input {...fieldControlProps(ids.consentTextId, { required: true })} name="consentTextId" />
        </Field>
        <Field id={ids.fields} label="Champs (une ligne par champ: cle|libelle|type|obligatoire|sensibilite|options)" required>
          <Textarea
            {...fieldControlProps(ids.fields, { required: true })}
            name="fields"
            rows={4}
            placeholder="vehicle_use|Usage du vehicule|select|true|public|prive,professionnel"
          />
        </Field>
        <Field id={ids.dataMinimizationNotes} label="Note de minimisation des donnees">
          <Input {...fieldControlProps(ids.dataMinimizationNotes)} name="dataMinimizationNotes" maxLength={500} />
        </Field>
        <Field id={ids.reason} label="Motif (audite)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
        <p className="bo-description">Un formulaire est toujours cree en brouillon: la publication est un acte distinct et audite.</p>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Creation...">Creer le brouillon</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function PublishQuoteFormDefinitionForm({ formIds }: { formIds: string[] }) {
  const [state, formAction, pending] = useActionState(publishQuoteFormDefinitionAction, initialState);
  const base = useId();
  const ids = { formId: `${base}-form`, reason: `${base}-reason` };

  return (
    <Card title="Publier une version">
      <Form action={formAction} data-quote-form="publish">
        <ActionNotice state={state} />
        <Field id={ids.formId} label="Formulaire" required>
          <Select
            {...fieldControlProps(ids.formId, { required: true })}
            name="formId"
            options={formIds.map((id) => ({ value: id, label: id }))}
          />
        </Field>
        <Field id={ids.reason} label="Motif (audite)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
        <Notice tone="warning">
          Publier expose ce formulaire aux visiteurs et lie la version du texte de consentement. La version publiee precedente pour le meme pays, produit et langue est retiree dans la meme operation.
        </Notice>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Publication..." disabled={formIds.length === 0}>Publier</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function RetireQuoteFormDefinitionForm({ formIds }: { formIds: string[] }) {
  const [state, formAction, pending] = useActionState(retireQuoteFormDefinitionAction, initialState);
  const base = useId();
  const ids = { formId: `${base}-form`, reason: `${base}-reason` };

  return (
    <Card title="Retirer une version">
      <Form action={formAction} data-quote-form="retire">
        <ActionNotice state={state} />
        <Field id={ids.formId} label="Formulaire" required>
          <Select
            {...fieldControlProps(ids.formId, { required: true })}
            name="formId"
            options={formIds.map((id) => ({ value: id, label: id }))}
          />
        </Field>
        <Field id={ids.reason} label="Motif (audite)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
        <p className="bo-description">Retirer coupe l'exposition publique du formulaire; l'historique des versions est conserve.</p>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Retrait..." disabled={formIds.length === 0}>Retirer</Button>
        </FormActions>
      </Form>
    </Card>
  );
}
