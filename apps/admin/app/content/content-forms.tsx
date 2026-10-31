"use client";

import { useActionState, useId, useState } from "react";
import type { ContentKind } from "../../../../packages/shared/contracts/content-cms.contracts";
import {
  CONTENT_KIND_LABELS,
  CONTENT_LEGAL_SLUG_LABELS,
  CONTENT_LOCALE_LABELS,
  FOUR_EYES_HELP,
  LEGAL_APPROVAL_HELP,
  PLAIN_TEXT_HELP
} from "../lib/content-messages";
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
import { contentWorkflowAction, createContentEntryAction, updateContentEntryAction, type ContentActionState } from "./actions";
import { SECTIONS_HELP, sectionsExample, type FormValues } from "./content-payload";

const initialState: ContentActionState = { status: "idle" };

const kindOptions = (Object.keys(CONTENT_KIND_LABELS) as ContentKind[]).map((kind) => ({ value: kind, label: CONTENT_KIND_LABELS[kind] }));
const localeOptions = Object.entries(CONTENT_LOCALE_LABELS).map(([value, label]) => ({ value, label }));
const legalSlugOptions = Object.entries(CONTENT_LEGAL_SLUG_LABELS).map(([value, label]) => ({ value, label }));

const sectionsHelp = SECTIONS_HELP;

function TextField({ base, name, label, values, required, maxLength }: {
  base: string;
  name: string;
  label: string;
  values: FormValues;
  required?: boolean;
  maxLength?: number;
}) {
  const id = `${base}-${name}`;
  return (
    <Field id={id} label={label} required={required}>
      <Input {...fieldControlProps(id, { required: required ?? false })} name={name} defaultValue={values[name] ?? ""} maxLength={maxLength} />
    </Field>
  );
}

function AreaField({ base, name, label, values, required, rows = 4, hint }: {
  base: string;
  name: string;
  label: string;
  values: FormValues;
  required?: boolean;
  rows?: number;
  hint?: string;
}) {
  const id = `${base}-${name}`;
  return (
    <Field id={id} label={label} required={required}>
      <Textarea {...fieldControlProps(id, { required: required ?? false })} name={name} rows={rows} defaultValue={values[name] ?? ""} placeholder={hint} />
    </Field>
  );
}

/** Plain text fields of one content kind (no rich editor, spec 072 FR-005). */
function KindFields({ kind, base, values }: { kind: ContentKind; base: string; values: FormValues }) {
  if (kind === "faq") {
    return (
      <>
        <TextField base={base} name="faq_question" label="Question" values={values} required maxLength={300} />
        <AreaField base={base} name="faq_answer" label="Réponse" values={values} required rows={6} />
        <TextField base={base} name="faq_theme" label="Thème (facultatif)" values={values} maxLength={80} />
        <TextField base={base} name="faq_productKey" label="Clé produit (facultatif)" values={values} maxLength={40} />
      </>
    );
  }
  if (kind === "guide") {
    return (
      <>
        <TextField base={base} name="guide_title" label="Titre" values={values} required maxLength={200} />
        <AreaField base={base} name="guide_description" label="Description" values={values} required rows={3} />
        <TextField base={base} name="guide_productKey" label="Clé produit (facultatif)" values={values} maxLength={40} />
        <AreaField base={base} name="guide_sections" label="Sections" values={values} required rows={8} hint={sectionsExample("introduction", "Introduction")} />
        <p className="bo-description">{sectionsHelp}</p>
        <AreaField base={base} name="guide_keyPoints" label="Points clés (un par ligne, 1 à 8)" values={values} required rows={4} />
        <AreaField base={base} name="guide_mistakes" label="Erreurs à éviter (une par ligne, 1 à 8)" values={values} required rows={4} />
        <TextField base={base} name="guide_compareCta" label="Texte d'invitation à comparer (facultatif)" values={values} maxLength={300} />
      </>
    );
  }
  if (kind === "glossary") {
    return (
      <>
        <TextField base={base} name="glossary_term" label="Terme" values={values} required maxLength={120} />
        <AreaField base={base} name="glossary_definition" label="Définition" values={values} required rows={6} />
        <AreaField base={base} name="glossary_seeAlso" label="Termes liés (un par ligne, facultatif)" values={values} rows={3} />
      </>
    );
  }
  return (
    <>
      <TextField base={base} name="legal_title" label="Titre (facultatif)" values={values} maxLength={200} />
      <AreaField base={base} name="legal_description" label="Description (facultatif)" values={values} rows={2} />
      <AreaField base={base} name="legal_summary" label="Résumé (une ligne par point, facultatif)" values={values} rows={3} />
      <AreaField base={base} name="legal_sections" label="Sections" values={values} required rows={8} hint={sectionsExample("droits", "Vos droits")} />
      <p className="bo-description">{sectionsHelp}</p>
      <AreaField base={base} name="legal_placeholders" label="Éléments « à compléter » (un par ligne, facultatif)" values={values} rows={3} />
    </>
  );
}

function EditorialHelp({ kind }: { kind: ContentKind }) {
  return (
    <Notice tone="info">
      <p>{PLAIN_TEXT_HELP}</p>
      <p>{FOUR_EYES_HELP}</p>
      {kind === "legal_override" ? <p>{LEGAL_APPROVAL_HELP}</p> : null}
    </Notice>
  );
}

export function CreateContentEntryForm() {
  const [state, formAction, pending] = useActionState(createContentEntryAction, initialState);
  const base = useId();
  const [kind, setKind] = useState<ContentKind>("faq");
  const ids = { kind: `${base}-kind`, locale: `${base}-locale`, entryKey: `${base}-key`, legalSlug: `${base}-legal`, country: `${base}-country` };

  return (
    <Card title="Nouveau contenu">
      <Form action={formAction} data-content-form="create">
        <ActionNotice state={state} />
        <EditorialHelp kind={kind} />
        <Field id={ids.kind} label="Type de contenu" required>
          <Select
            {...fieldControlProps(ids.kind, { required: true })}
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as ContentKind)}
            options={kindOptions}
          />
        </Field>
        <Field id={ids.locale} label="Langue" required>
          <Select {...fieldControlProps(ids.locale, { required: true })} name="locale" defaultValue="fr" options={localeOptions} />
        </Field>
        {kind === "legal_override" ? (
          <>
            <Field id={ids.legalSlug} label="Page légale" required>
              <Select {...fieldControlProps(ids.legalSlug, { required: true })} name="legalSlug" defaultValue="legal-notice" options={legalSlugOptions} />
            </Field>
            <Field id={ids.country} label="Pays (code ISO, ex. SN)" required>
              <Input {...fieldControlProps(ids.country, { required: true })} name="countryCode" maxLength={2} placeholder="SN" />
            </Field>
          </>
        ) : (
          <Field id={ids.entryKey} label="Clé technique (facultative, dérivée du titre si vide)">
            <Input {...fieldControlProps(ids.entryKey)} name="entryKey" maxLength={80} placeholder="comment-choisir-une-assurance-auto" />
          </Field>
        )}
        <KindFields key={kind} kind={kind} base={base} values={{}} />
        <p className="bo-description">Le contenu est toujours créé en brouillon : la soumission puis l&apos;approbation sont des actes distincts et audités.</p>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer le brouillon</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function EditContentEntryForm({ id, kind, values }: { id: string; kind: ContentKind; values: FormValues }) {
  const [state, formAction, pending] = useActionState(updateContentEntryAction, initialState);
  const base = useId();

  return (
    <Card title="Modifier le brouillon">
      <Form action={formAction} data-content-form="edit">
        <ActionNotice state={state} />
        <EditorialHelp kind={kind} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="kind" value={kind} />
        <KindFields kind={kind} base={base} values={values} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer le brouillon</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

const workflowCopy = {
  submit: { title: "Soumettre à validation", button: "Soumettre", pending: "Soumission...", variant: "primary" as const, note: "none" as const },
  withdraw: { title: "Retirer la soumission", button: "Retirer", pending: "Retrait...", variant: "secondary" as const, note: "none" as const },
  approve: { title: "Approuver et publier", button: "Approuver", pending: "Approbation...", variant: "primary" as const, note: "optional" as const },
  reject: { title: "Rejeter", button: "Rejeter", pending: "Rejet...", variant: "danger" as const, note: "required" as const },
  archive: { title: "Archiver", button: "Archiver", pending: "Archivage...", variant: "danger" as const, note: "required" as const },
  revise: { title: "Réviser (nouvelle version)", button: "Créer une nouvelle version", pending: "Création...", variant: "secondary" as const, note: "none" as const }
};

const workflowHelp: Record<keyof typeof workflowCopy, string> = {
  submit: "Le contenu est contrôlé (texte brut, formulations réglementées) puis attend un second acteur.",
  withdraw: "Le contenu redevient un brouillon modifiable.",
  approve: "Publié le contenu sur le site public. La version publiée précédente de la même clé est archivée dans la même opération.",
  reject: "Le contenu redevient un brouillon ; le motif est conservé dans la traçabilité.",
  archive: "Le contenu n'est plus affiché sur le site public, qui retombe sur son texte d'origine.",
  revise: "Crée un brouillon de version suivante ; la version publiée reste en ligne jusqu'à l'approbation de la nouvelle."
};

export function ContentWorkflowForm({ id, intent }: { id: string; intent: keyof typeof workflowCopy }) {
  const [state, formAction, pending] = useActionState(contentWorkflowAction, initialState);
  const base = useId();
  const copy = workflowCopy[intent];
  const noteId = `${base}-note`;

  return (
    <Card title={copy.title}>
      <Form action={formAction} data-content-workflow={intent}>
        <ActionNotice state={state} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="intent" value={intent} />
        {copy.note !== "none" ? (
          <Field id={noteId} label={copy.note === "required" ? "Motif (obligatoire, audité)" : "Note (facultative, auditée)"} required={copy.note === "required"}>
            <Textarea {...fieldControlProps(noteId, { required: copy.note === "required" })} name="note" rows={2} maxLength={1000} />
          </Field>
        ) : null}
        <p className="bo-description">{workflowHelp[intent]}</p>
        {intent === "approve" ? <p className="bo-description">{FOUR_EYES_HELP}</p> : null}
        <FormActions>
          <Button type="submit" variant={copy.variant} pending={pending} pendingLabel={copy.pending}>{copy.button}</Button>
        </FormActions>
      </Form>
    </Card>
  );
}
