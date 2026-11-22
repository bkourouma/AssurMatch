"use client";

import { useActionState, useId, useState } from "react";
import {
  ActionNotice,
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
  Textarea,
  fieldControlProps
} from "../lib/ui/admin-ui";
import { UnsavedChangesNotice } from "../lib/ui/unsaved-changes-notice";
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
        <FormSection legend="Périmètre du formulaire" description="Une seule version publiée existe par pays, produit et langue.">
          <Field id={ids.countryId} label="Pays (UUID)" required hint="Identifiant du pays, repris de la liste des pays du catalogue.">
            <Input {...fieldControlProps(ids.countryId, { required: true, hint: "Identifiant du pays, repris de la liste des pays du catalogue." })} name="countryId" />
          </Field>
          <Field id={ids.productId} label="Produit (UUID)" required hint="Identifiant du produit, repris du catalogue.">
            <Input {...fieldControlProps(ids.productId, { required: true, hint: "Identifiant du produit, repris du catalogue." })} name="productId" />
          </Field>
          <Field id={ids.language} label="Langue" required hint="Code langue : fr ou en.">
            <Input {...fieldControlProps(ids.language, { required: true, hint: "Code langue : fr ou en." })} name="language" defaultValue="fr" />
          </Field>
          <Field id={ids.version} label="Version" required hint="Numéro ou nom propre à cette version du formulaire.">
            <Input {...fieldControlProps(ids.version, { required: true, hint: "Numéro ou nom propre à cette version du formulaire." })} name="version" />
          </Field>
        </FormSection>
        <FormSection legend="Contenu et consentement">
          <Field id={ids.consentTextId} label="Texte de consentement publié (UUID)" required hint="Le texte doit être publié, de finalité transmission de lead, et de même langue, pays et produit.">
            <Input {...fieldControlProps(ids.consentTextId, { required: true, hint: "Le texte doit être publié, de finalité transmission de lead, et de même langue, pays et produit." })} name="consentTextId" />
          </Field>
          <Field
            id={ids.fields}
            label="Champs (une ligne par champ: clé|libellé|type|obligatoire|sensibilité|options)"
            required
            hint="Types : text, email, phone, number, select, checkbox, date. Sensibilité : public, personal, sensitive. Options séparées par des virgules (pour select)."
          >
            <Textarea
              {...fieldControlProps(ids.fields, {
                required: true,
                hint: "Types : text, email, phone, number, select, checkbox, date. Sensibilité : public, personal, sensitive. Options séparées par des virgules (pour select)."
              })}
              name="fields"
              rows={4}
              placeholder="vehicle_use|Usage du véhicule|select|true|public|prive,professionnel"
            />
          </Field>
          <Field id={ids.dataMinimizationNotes} label="Note de minimisation des données" hint="Facultatif, 500 caractères au plus.">
            <Input {...fieldControlProps(ids.dataMinimizationNotes, { hint: "Facultatif, 500 caractères au plus." })} name="dataMinimizationNotes" maxLength={500} />
          </Field>
        </FormSection>
        <Field id={ids.reason} label="Motif (audité)" required hint="Le motif est conservé dans le journal d'audit.">
          <Input {...fieldControlProps(ids.reason, { required: true, hint: "Le motif est conservé dans le journal d'audit." })} name="reason" />
        </Field>
        <p className="bo-description">Un formulaire est toujours créé en brouillon: la publication est un acte distinct et audité.</p>
        <p className="bo-description">
          Les champs génériques (ville, préférence de contact, délai souhaite, budget, langue préférée, source) sont ajoutés d&apos;office
          par le serveur, libellés dans la langue du formulaire; nom, e-mail et téléphone restent les champs de contact du parcours. Ne
          saisissez ici que les champs propres au produit.
        </p>
        <FormActions>
          <UnsavedChangesNotice />
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer le brouillon</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

/** A version offered in a select: its id (the submitted value) and a readable label. */
export interface QuoteFormChoice {
  id: string;
  label: string;
}

export function PublishQuoteFormDefinitionForm({ forms }: { forms: QuoteFormChoice[] }) {
  const [state, formAction, pending] = useActionState(publishQuoteFormDefinitionAction, initialState);
  const base = useId();
  const ids = { formId: `${base}-form`, reason: `${base}-reason` };
  const [selectedId, setSelectedId] = useState("");
  const selected = forms.find((form) => form.id === selectedId);

  return (
    <Card title="Publier une version" description="Étape suivante d'un brouillon : le publier. Un formulaire publié est exposé aux visiteurs.">
      <Form action={formAction} data-quote-form="publish">
        <ActionNotice state={state} />
        <Field id={ids.formId} label="Formulaire" required hint={forms.length === 0 ? "Aucune version à publier : créez d'abord un brouillon." : "Brouillons et versions suspendues ou retirées, par pays, produit et langue."}>
          <Select
            {...fieldControlProps(ids.formId, { required: true, hint: forms.length === 0 ? "Aucune version à publier : créez d'abord un brouillon." : "Brouillons et versions suspendues ou retirées, par pays, produit et langue." })}
            name="formId"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            placeholder="Choisir une version"
            options={forms.map((form) => ({ value: form.id, label: form.label }))}
          />
        </Field>
        <p className="bo-description" role="status" aria-live="polite">
          {selected ? `Version à publier : ${selected.label}.` : ""}
        </p>
        <Field id={ids.reason} label="Motif (audité)" required hint="Le motif est conservé dans le journal d'audit.">
          <Input {...fieldControlProps(ids.reason, { required: true, hint: "Le motif est conservé dans le journal d'audit." })} name="reason" />
        </Field>
        <Notice tone="warning">
          Publier expose ce formulaire aux visiteurs et lie la version du texte de consentement. La version publiée précédente pour le même pays, produit et langue est retirée dans la même opération.
        </Notice>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Publication..." disabled={forms.length === 0}>Publier</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function RetireQuoteFormDefinitionForm({ forms }: { forms: QuoteFormChoice[] }) {
  const [state, formAction] = useActionState(retireQuoteFormDefinitionAction, initialState);
  const base = useId();
  const ids = { formId: `${base}-form`, reason: `${base}-reason` };
  const [selectedId, setSelectedId] = useState("");
  const selected = forms.find((form) => form.id === selectedId);

  return (
    <Card title="Retirer une version" description="Retirer coupe l'exposition publique du formulaire; l'historique des versions est conservé.">
      <ActionNotice state={state} />
      {forms.length === 0 ? (
        <p className="bo-description">Aucune version à retirer.</p>
      ) : (
        <FormActions>
          <ConfirmDialog
            triggerLabel="Retirer"
            triggerVariant="danger"
            title={selected ? `Retirer la version ${selected.label}` : "Retirer une version de formulaire"}
            description={
              selected
                ? `La version ${selected.label} n'est plus exposée au public : la demande de devis devient indisponible pour ce périmètre tant qu'aucune autre version n'est publiée. L'historique des versions est conservé.`
                : "Choisissez la version publiée à retirer : elle n'est plus exposée au public. L'historique des versions est conservé."
            }
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
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                placeholder="Choisir une version publiée"
                options={forms.map((form) => ({ value: form.id, label: form.label }))}
              />
            </Field>
            <Field id={ids.reason} label="Motif (audité)" required hint="Le motif est conservé dans le journal d'audit.">
              <Input {...fieldControlProps(ids.reason, { required: true, hint: "Le motif est conservé dans le journal d'audit." })} name="reason" />
            </Field>
          </ConfirmDialog>
        </FormActions>
      )}
    </Card>
  );
}
