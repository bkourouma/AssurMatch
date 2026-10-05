"use client";

import { useActionState, useId, useState } from "react";
import type { CatalogActionState } from "../lib/catalog-actions";
import { CONSENT_CHANNEL_OPTIONS, CONSENT_PURPOSE_OPTIONS, LANGUAGE_OPTIONS } from "../lib/catalog-messages";
import { createConsentTextAction, publishConsentTextAction, retireConsentTextAction } from "../lib/consent-actions";
import { CatalogActionResult } from "../lib/ui/catalog-action-result";
import {
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

/**
 * Spec 050 US3: consent text forms. The content is typed (or prefilled from a reference template);
 * the hash is never asked for: the server computes it from the content.
 */
const initialState: CatalogActionState = { status: "idle" };

export interface ConsentTemplateChoice {
  templateKey: string;
  purpose: string;
  language: string;
  bodyTemplate: string;
  notes?: string | undefined;
}

export interface ConsentChoice {
  value: string;
  label: string;
}

export function CreateConsentTextForm({ templates, countries, products }: {
  templates: ConsentTemplateChoice[];
  countries: ConsentChoice[];
  products: ConsentChoice[];
}) {
  const [state, formAction, pending] = useActionState(createConsentTextAction, initialState);
  const base = useId();
  const [templateKey, setTemplateKey] = useState("");
  const [purpose, setPurpose] = useState<string>("lead_transmission");
  const [language, setLanguage] = useState<string>("fr");
  const [content, setContent] = useState("");
  const template = templates.find((candidate) => candidate.templateKey === templateKey);

  function applyTemplate(key: string) {
    setTemplateKey(key);
    const chosen = templates.find((candidate) => candidate.templateKey === key);
    if (!chosen) return;
    setPurpose(chosen.purpose);
    setLanguage(chosen.language);
    setContent(chosen.bodyTemplate);
  }

  return (
    <Card title="Créer un texte de consentement" description="Le texte est créé en brouillon. Sa publication est un acte distinct, réservé à la conformité.">
      <Form action={formAction} data-consent-form="create">
        <CatalogActionResult state={state} />
        <Field id={`${base}-template`} label="Partir d'un modèle" hint="Préremplit la finalité, la langue et le contenu ; tout reste modifiable.">
          <Select {...fieldControlProps(`${base}-template`, { hint: "modele" })} value={templateKey} onChange={(event) => applyTemplate(event.target.value)}>
            <option value="">Aucun modèle</option>
            {templates.map((candidate) => (
              <option key={candidate.templateKey} value={candidate.templateKey}>{`${candidate.templateKey} (${candidate.purpose}, ${candidate.language})`}</option>
            ))}
          </Select>
        </Field>
        {template?.notes ? <p className="bo-description">{template.notes}</p> : null}
        <Field id={`${base}-purpose`} label="Finalité" required>
          <Select {...fieldControlProps(`${base}-purpose`, { required: true })} name="purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)}>
            {CONSENT_PURPOSE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        </Field>
        <Field id={`${base}-country`} label="Pays" required>
          {countries.length > 0 ? (
            <Select {...fieldControlProps(`${base}-country`, { required: true })} name="countryId" options={countries} placeholder="Choisir un pays" />
          ) : (
            <Input {...fieldControlProps(`${base}-country`, { required: true })} name="countryId" placeholder="Identifiant du pays (UUID)" />
          )}
        </Field>
        <Field id={`${base}-product`} label="Produit" hint="Vide : le texte vaut pour tous les produits du pays.">
          <Select {...fieldControlProps(`${base}-product`, { hint: "produit" })} name="productId">
            <option value="">Tous les produits</option>
            {products.map((product) => <option key={product.value} value={product.value}>{product.label}</option>)}
          </Select>
        </Field>
        <Field id={`${base}-channel`} label="Canal" required>
          <Select {...fieldControlProps(`${base}-channel`, { required: true })} name="channel" defaultValue="public_web">
            {CONSENT_CHANNEL_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        </Field>
        <Field id={`${base}-recipient`} label="Catégorie de destinataire" required>
          <Input {...fieldControlProps(`${base}-recipient`, { required: true })} name="recipientCategory" defaultValue="courtier_partenaire_agree" />
        </Field>
        <Field id={`${base}-language`} label="Langue" required>
          <Select {...fieldControlProps(`${base}-language`, { required: true })} name="language" value={language} onChange={(event) => setLanguage(event.target.value)}>
            {LANGUAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        </Field>
        <Field id={`${base}-version`} label="Version" required hint="Unique par finalité, pays, produit et langue (par exemple 2026-10-v1).">
          <Input {...fieldControlProps(`${base}-version`, { required: true, hint: "version" })} name="version" />
        </Field>
        <Field
          id={`${base}-content`}
          label="Contenu"
          required
          hint="Variables possibles : {{brokerName}}, {{countryName}}, {{productName}}, {{contactFields}}. Une transmission de lead doit nommer {{brokerName}} et rappeler le rôle technique d'AssurMatch."
        >
          <Textarea
            {...fieldControlProps(`${base}-content`, { required: true, hint: "contenu" })}
            name="content"
            rows={8}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
        </Field>
        <Field id={`${base}-reason`} label="Motif (audite)" required>
          <Input {...fieldControlProps(`${base}-reason`, { required: true })} name="reason" minLength={8} />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer le brouillon</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function PublishConsentTextForm({ consentTextId, version }: { consentTextId: string; version: string }) {
  const [state, formAction] = useActionState(publishConsentTextAction, initialState);
  const base = useId();
  return (
    <Card title="Publier ce texte">
      <CatalogActionResult state={state} />
      <Notice tone="warning">
        Publier rend ce texte immuable et utilisable par les formulaires de devis de même pays, produit et langue. La publication est refusée si le
        contenu manque, si l&apos;empreinte est incohérente, si une formulation interdite est présente ou, pour une transmission de lead, si le
        destinataire ou le rôle technique d&apos;AssurMatch manque.
      </Notice>
      <ConfirmDialog
        triggerLabel="Publier"
        triggerVariant="primary"
        title={`Publier la version ${version}`}
        description="Le texte publié ne pourra plus être modifié : une correction passera par une nouvelle version."
        confirmLabel="Publier"
        cancelLabel="Annuler"
        formAction={formAction}
        dataAttributes={{ "data-consent-form": "publish" }}
      >
        {/* The dialog stays open after submit: the refusal and its blockers are shown inside it too. */}
        <CatalogActionResult state={state} />
        <input type="hidden" name="consentTextId" value={consentTextId} />
        <Field id={`${base}-reason`} label="Motif (audite)" required>
          <Input {...fieldControlProps(`${base}-reason`, { required: true })} name="reason" minLength={8} />
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

export function RetireConsentTextForm({ consentTextId }: { consentTextId: string }) {
  const [state, formAction, pending] = useActionState(retireConsentTextAction, initialState);
  const base = useId();
  return (
    <Card title="Retirer ce texte">
      <Form action={formAction} data-consent-form="retire">
        <CatalogActionResult state={state} />
        <input type="hidden" name="consentTextId" value={consentTextId} />
        <Field id={`${base}-reason`} label="Motif (audite)" required>
          <Input {...fieldControlProps(`${base}-reason`, { required: true })} name="reason" minLength={8} />
        </Field>
        <p className="bo-description">Un texte retiré ne peut plus être publié ni lié à un nouveau formulaire ; les preuves déjà recueillies restent valables.</p>
        <FormActions>
          <Button type="submit" variant="danger" pending={pending} pendingLabel="Retrait...">Retirer</Button>
        </FormActions>
      </Form>
    </Card>
  );
}
