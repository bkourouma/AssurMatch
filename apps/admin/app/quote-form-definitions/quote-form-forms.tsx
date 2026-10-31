"use client";

import { useActionState, useId } from "react";
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
    <Card title="Créer un brouillon">
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
        <Field id={ids.consentTextId} label="Texte de consentement publié (UUID)" required>
          <Input {...fieldControlProps(ids.consentTextId, { required: true })} name="consentTextId" />
        </Field>
        <Field id={ids.fields} label="Champs (une ligne par champ: clé|libellé|type|obligatoire|sensibilité|options)" required>
          <Textarea
            {...fieldControlProps(ids.fields, { required: true })}
            name="fields"
            rows={4}
            placeholder="vehicle_use|Usage du véhicule|select|true|public|prive,professionnel"
          />
        </Field>
        <Field id={ids.dataMinimizationNotes} label="Note de minimisation des données">
          <Input {...fieldControlProps(ids.dataMinimizationNotes)} name="dataMinimizationNotes" maxLength={500} />
        </Field>
        <Field id={ids.reason} label="Motif (audité)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
        <p className="bo-description">Un formulaire est toujours créé en brouillon: la publication est un acte distinct et audité.</p>
        <p className="bo-description">
          Les champs génériques (ville, préférence de contact, délai souhaite, budget, langue préférée, source) sont ajoutés d&apos;office
          par le serveur, libellés dans la langue du formulaire; nom, e-mail et téléphone restent les champs de contact du parcours. Ne
          saisissez ici que les champs propres au produit.
        </p>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer le brouillon</Button>
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
        <Field id={ids.reason} label="Motif (audité)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
        <Notice tone="warning">
          Publier expose ce formulaire aux visiteurs et lie la version du texte de consentement. La version publiée précédente pour le même pays, produit et langue est retirée dans la même opération.
        </Notice>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Publication..." disabled={formIds.length === 0}>Publier</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function RetireQuoteFormDefinitionForm({ formIds }: { formIds: string[] }) {
  const [state, formAction] = useActionState(retireQuoteFormDefinitionAction, initialState);
  const base = useId();
  const ids = { formId: `${base}-form`, reason: `${base}-reason` };

  return (
    <Card title="Retirer une version" description="Retirer coupe l'exposition publique du formulaire; l'historique des versions est conservé.">
      <ActionNotice state={state} />
      {formIds.length === 0 ? (
        <p className="bo-description">Aucune version à retirer.</p>
      ) : (
        <FormActions>
          <ConfirmDialog
            triggerLabel="Retirer"
            triggerVariant="danger"
            title="Retirer une version de formulaire"
            description="Le formulaire choisi n'est plus exposé au public. L'historique des versions est conservé."
            confirmLabel="Retirer"
            cancelLabel="Annuler"
            tone="danger"
            formAction={formAction}
            dataAttributes={{ "data-quote-form": "retire" }}
          >
            <ActionNotice state={state} />
            <Field id={ids.formId} label="Formulaire" required>
              <Select
                {...fieldControlProps(ids.formId, { required: true })}
                name="formId"
                options={formIds.map((id) => ({ value: id, label: id }))}
              />
            </Field>
            <Field id={ids.reason} label="Motif (audité)" required>
              <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
            </Field>
          </ConfirmDialog>
        </FormActions>
      )}
    </Card>
  );
}
