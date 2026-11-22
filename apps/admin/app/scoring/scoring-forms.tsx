"use client";

import { useActionState, useId, useState, type FormEvent } from "react";
import type { ScoringCriterionKey, ScoringWeightsData } from "../lib/admin-api";
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
  Stack,
  fieldControlProps
} from "../lib/ui/admin-ui";
import { createScoringRuleAction, suspendOfferAction, updateScoringRuleAction, validateOfferAction, type ScoringActionState } from "./actions";

const initialState: ScoringActionState = { status: "idle" };

export interface ScoringFormOption {
  value: string;
  label: string;
}

const REASON_HINT = "Obligatoire. Conservé dans le journal d'audit.";

/**
 * Order of the weight inputs. `actions.ts` carries "use server", so every value it exports reaches a
 * client component as a server reference, never as an array: the order is declared here instead.
 */
const criterionKeys: ScoringCriterionKey[] = [
  "guaranteeLevel",
  "price",
  "deductible",
  "processingSpeed",
  "paymentFlexibility",
  "informationQuality",
  "userPreferences"
];

const criterionLabels: Record<ScoringCriterionKey, string> = {
  guaranteeLevel: "Niveau de garantie",
  price: "Prix",
  deductible: "Franchise",
  processingSpeed: "Rapidité de traitement",
  paymentFlexibility: "Flexibilité de paiement",
  informationQuality: "Qualité des informations",
  userPreferences: "Préférences visiteur"
};

/** Seven weights with a running total: the rule is only accepted when they add up to 100. */
function WeightInputs({ idBase, defaults, required }: { idBase: string; defaults?: ScoringWeightsData; required: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(criterionKeys.map((key) => [key, defaults ? String(defaults[key]) : ""]))
  );
  const total = criterionKeys.reduce((sum, key) => sum + (Number.parseInt(values[key] ?? "", 10) || 0), 0);
  const touched = criterionKeys.some((key) => (values[key] ?? "") !== "");
  const description = required
    ? "Les sept poids doivent totaliser 100."
    : "Laissez les sept champs vides pour conserver les poids actuels. Si vous en modifiez un, renseignez les sept : un champ vide compte pour 0, et le total doit faire 100.";

  return (
    <FormSection legend="Poids (total 100)" description={description}>
      {criterionKeys.map((key) => {
        const id = `${idBase}-weight-${key}`;
        return (
          <Field key={key} id={id} label={criterionLabels[key]} required={required}>
            <Input
              {...fieldControlProps(id, { required })}
              name={`weight_${key}`}
              type="number"
              min={0}
              max={100}
              defaultValue={defaults ? defaults[key] : ""}
              onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
            />
          </Field>
        );
      })}
      {touched ? (
        <Notice tone={total === 100 ? "success" : "warning"} icon={false}>
          {total === 100
            ? "Total : 100 / 100."
            : total < 100
              ? `Total : ${total} / 100 : il manque ${100 - total} point(s).`
              : `Total : ${total} / 100 : retirez ${total - 100} point(s).`}
        </Notice>
      ) : null}
    </FormSection>
  );
}

export function CreateScoringRuleForm({
  defaults,
  countries,
  products
}: {
  defaults: ScoringWeightsData;
  countries: ScoringFormOption[];
  products: ScoringFormOption[];
}) {
  const [state, formAction, pending] = useActionState(createScoringRuleAction, initialState);
  const base = useId();
  const ids = { countryId: `${base}-country`, productId: `${base}-product`, description: `${base}-description`, reason: `${base}-reason` };

  return (
    <Card title="Créer une règle de scoring" description="Une règle s'applique à un pays et à un produit, ou à tous si le champ est laissé vide. Les champs marqués * sont obligatoires.">
      <Form action={formAction} data-scoring-form="create">
        <ActionNotice state={state} />
        <Field id={ids.countryId} label="Pays (UUID, vide = tous)" hint={countries.length > 0 ? undefined : "Identifiant (UUID) du pays ; laissez vide pour tous les pays."}>
          {countries.length > 0 ? (
            <Select {...fieldControlProps(ids.countryId)} name="countryId" defaultValue="">
              <option value="">Tous les pays</option>
              {countries.map((country) => <option key={country.value} value={country.value}>{country.label}</option>)}
            </Select>
          ) : (
            <Input {...fieldControlProps(ids.countryId, { hint: "Identifiant (UUID) du pays ; laissez vide pour tous les pays." })} name="countryId" />
          )}
        </Field>
        <Field id={ids.productId} label="Produit (UUID, vide = tous)" hint={products.length > 0 ? undefined : "Identifiant (UUID) du produit ; laissez vide pour tous les produits."}>
          {products.length > 0 ? (
            <Select {...fieldControlProps(ids.productId)} name="productId" defaultValue="">
              <option value="">Tous les produits</option>
              {products.map((product) => <option key={product.value} value={product.value}>{product.label}</option>)}
            </Select>
          ) : (
            <Input {...fieldControlProps(ids.productId, { hint: "Identifiant (UUID) du produit ; laissez vide pour tous les produits." })} name="productId" />
          )}
        </Field>
        <WeightInputs idBase={base} defaults={defaults} required />
        <Field id={ids.description} label="Description" hint="Facultatif, 500 caractères au plus.">
          <Input {...fieldControlProps(ids.description, { hint: "Facultatif, 500 caractères au plus." })} name="description" maxLength={500} />
        </Field>
        <Field id={ids.reason} label="Motif (audité)" required requiredLabel="obligatoire" hint={REASON_HINT}>
          <Input {...fieldControlProps(ids.reason, { required: true, hint: REASON_HINT })} name="reason" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer la règle</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

const RULE_HINT = "Pays / produit - version. Les règles désactivées sont indiquées.";
const STATUS_HINT = "Choisir « Désactivée » demande une confirmation.";

export function UpdateScoringRuleForm({ rules }: { rules: Array<{ id: string; label: string }> }) {
  const [state, formAction, pending] = useActionState(updateScoringRuleAction, initialState);
  const base = useId();
  const ids = { ruleId: `${base}-rule`, status: `${base}-status`, description: `${base}-description`, reason: `${base}-reason` };

  // Disabling a rule is the sensitive change of this form: the confirmation names the rule.
  function confirmDisable(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    if (data.get("status") !== "disabled") return;
    const label = rules.find((rule) => rule.id === data.get("ruleId"))?.label ?? "cette règle";
    if (!window.confirm(`Désactiver la règle de scoring « ${label} » ? Le changement est audité avec le motif saisi.`)) event.preventDefault();
  }

  return (
    <Card title="Mettre à jour une règle" description="Seuls les champs renseignés sont modifiés ; « (inchangé) » conserve la valeur actuelle. Chaque modification crée une nouvelle version.">
      <Form action={formAction} onSubmit={confirmDisable} data-scoring-form="update">
        <ActionNotice state={state} />
        <Field id={ids.ruleId} label="Règle" required hint={RULE_HINT}>
          <Select {...fieldControlProps(ids.ruleId, { required: true, hint: RULE_HINT })} name="ruleId" options={rules.map((rule) => ({ value: rule.id, label: rule.label }))} />
        </Field>
        <Field id={ids.status} label="Statut" hint={STATUS_HINT}>
          <Select {...fieldControlProps(ids.status, { hint: STATUS_HINT })} name="status" defaultValue="">
            <option value="">(inchangé)</option>
            <option value="active">Active</option>
            <option value="disabled">Désactivée</option>
          </Select>
        </Field>
        <WeightInputs idBase={base} required={false} />
        <Field id={ids.description} label="Description" hint="Facultatif, 500 caractères au plus.">
          <Input {...fieldControlProps(ids.description, { hint: "Facultatif, 500 caractères au plus." })} name="description" maxLength={500} />
        </Field>
        <Field id={ids.reason} label="Motif (audité)" required requiredLabel="obligatoire" hint={REASON_HINT}>
          <Input {...fieldControlProps(ids.reason, { required: true, hint: REASON_HINT })} name="reason" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Mise à jour..." disabled={rules.length === 0}>Mettre à jour</Button>
        </FormActions>
        {rules.length === 0 ? <Notice tone="info">Aucune règle à mettre à jour : créez-en une d'abord.</Notice> : null}
      </Form>
    </Card>
  );
}

export function OfferDecisionForm({ offerId, offerName }: { offerId: string; offerName: string }) {
  const [validateState, validateAction, validating] = useActionState(validateOfferAction, initialState);
  const [suspendState, suspendAction] = useActionState(suspendOfferAction, initialState);
  const base = useId();
  const ids = {
    decision: `${base}-decision`,
    decisionReason: `${base}-decision-reason`,
    suspendReason: `${base}-suspend-reason`
  };

  return (
    <Stack>
      <Form action={validateAction} data-scoring-form="validate-offer">
        <ActionNotice state={validateState} />
        <input type="hidden" name="offerId" value={offerId} />
        <Field id={ids.decision} label={`Décision ${offerName}`}>
          <Select
            {...fieldControlProps(ids.decision)}
            name="validationStatus"
            defaultValue="validated"
            aria-label={`Décision ${offerName}`}
            options={[
              { value: "validated", label: "Valider (publiable)" },
              { value: "rejected", label: "Rejeter" }
            ]}
          />
        </Field>
        <Field id={ids.decisionReason} label="Motif (audité)" required requiredLabel="obligatoire">
          <Input {...fieldControlProps(ids.decisionReason, { required: true })} name="reason" placeholder="Motif obligatoire, audité" />
        </Field>
        <FormActions>
          <Button type="submit" size="sm" pending={validating} pendingLabel="Enregistrement...">Appliquer la décision</Button>
        </FormActions>
      </Form>
      <ActionNotice state={suspendState} />
      <FormActions>
        <ConfirmDialog
          triggerLabel="Suspendre (retrait public)"
          triggerVariant="danger"
          title={`Suspendre ${offerName}`}
          description="L'offre est retirée immédiatement du comparateur public. La suspension est auditée avec son motif."
          confirmLabel="Suspendre"
          cancelLabel="Annuler"
          tone="danger"
          formAction={suspendAction}
          dataAttributes={{ "data-scoring-form": "suspend-offer" }}
        >
          <ActionNotice state={suspendState} />
          <input type="hidden" name="offerId" value={offerId} />
          <Field id={ids.suspendReason} label="Motif de suspension (audité)" required requiredLabel="obligatoire" hint={REASON_HINT}>
            <Input {...fieldControlProps(ids.suspendReason, { required: true, hint: REASON_HINT })} name="reason" placeholder="Motif de suspension (audité)" />
          </Field>
        </ConfirmDialog>
      </FormActions>
    </Stack>
  );
}
