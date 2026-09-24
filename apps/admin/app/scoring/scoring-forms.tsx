"use client";

import { useActionState, useId } from "react";
import type { ScoringCriterionKey, ScoringWeightsData } from "../lib/admin-api";
import {
  ActionNotice,
  Button,
  Card,
  Field,
  Form,
  FormActions,
  FormSection,
  Input,
  Select,
  Stack,
  fieldControlProps
} from "../lib/ui/admin-ui";
import { createScoringRuleAction, suspendOfferAction, updateScoringRuleAction, validateOfferAction, type ScoringActionState } from "./actions";

const initialState: ScoringActionState = { status: "idle" };

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
  processingSpeed: "Rapidite de traitement",
  paymentFlexibility: "Flexibilite de paiement",
  informationQuality: "Qualite des informations",
  userPreferences: "Preferences visiteur"
};

function WeightInputs({ idBase, defaults, required }: { idBase: string; defaults?: ScoringWeightsData; required: boolean }) {
  return (
    <FormSection legend="Poids (total 100)">
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
            />
          </Field>
        );
      })}
    </FormSection>
  );
}

export function CreateScoringRuleForm({ defaults }: { defaults: ScoringWeightsData }) {
  const [state, formAction, pending] = useActionState(createScoringRuleAction, initialState);
  const base = useId();
  const ids = { countryId: `${base}-country`, productId: `${base}-product`, description: `${base}-description`, reason: `${base}-reason` };

  return (
    <Card title="Creer une regle de scoring">
      <Form action={formAction} data-scoring-form="create">
        <ActionNotice state={state} />
        <Field id={ids.countryId} label="Pays (UUID, vide = tous)">
          <Input {...fieldControlProps(ids.countryId)} name="countryId" />
        </Field>
        <Field id={ids.productId} label="Produit (UUID, vide = tous)">
          <Input {...fieldControlProps(ids.productId)} name="productId" />
        </Field>
        <WeightInputs idBase={base} defaults={defaults} required />
        <Field id={ids.description} label="Description">
          <Input {...fieldControlProps(ids.description)} name="description" maxLength={500} />
        </Field>
        <Field id={ids.reason} label="Motif (audite)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Creation...">Creer la regle</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function UpdateScoringRuleForm({ ruleIds }: { ruleIds: string[] }) {
  const [state, formAction, pending] = useActionState(updateScoringRuleAction, initialState);
  const base = useId();
  const ids = { ruleId: `${base}-rule`, status: `${base}-status`, description: `${base}-description`, reason: `${base}-reason` };

  return (
    <Card title="Mettre a jour une regle">
      <Form action={formAction} data-scoring-form="update">
        <ActionNotice state={state} />
        <Field id={ids.ruleId} label="Regle" required>
          <Select {...fieldControlProps(ids.ruleId, { required: true })} name="ruleId" options={ruleIds.map((id) => ({ value: id, label: id }))} />
        </Field>
        <Field id={ids.status} label="Statut">
          <Select {...fieldControlProps(ids.status)} name="status" defaultValue="">
            <option value="">(inchange)</option>
            <option value="active">active</option>
            <option value="disabled">desactivee</option>
          </Select>
        </Field>
        <WeightInputs idBase={base} required={false} />
        <Field id={ids.description} label="Description">
          <Input {...fieldControlProps(ids.description)} name="description" maxLength={500} />
        </Field>
        <Field id={ids.reason} label="Motif (audite)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Mise a jour..." disabled={ruleIds.length === 0}>Mettre a jour</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function OfferDecisionForm({ offerId, offerName }: { offerId: string; offerName: string }) {
  const [validateState, validateAction, validating] = useActionState(validateOfferAction, initialState);
  const [suspendState, suspendAction, suspending] = useActionState(suspendOfferAction, initialState);
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
        <Field id={ids.decision} label={`Decision ${offerName}`}>
          <Select
            {...fieldControlProps(ids.decision)}
            name="validationStatus"
            defaultValue="validated"
            aria-label={`Decision ${offerName}`}
            options={[
              { value: "validated", label: "Valider (publiable)" },
              { value: "rejected", label: "Rejeter" }
            ]}
          />
        </Field>
        <Field id={ids.decisionReason} label="Motif (audite)" required>
          <Input {...fieldControlProps(ids.decisionReason, { required: true })} name="reason" placeholder="Motif (audite)" />
        </Field>
        <FormActions>
          <Button type="submit" size="sm" pending={validating} pendingLabel="...">Appliquer la decision</Button>
        </FormActions>
      </Form>
      <Form action={suspendAction} data-scoring-form="suspend-offer">
        <ActionNotice state={suspendState} />
        <input type="hidden" name="offerId" value={offerId} />
        <Field id={ids.suspendReason} label="Motif de suspension (audite)" required>
          <Input {...fieldControlProps(ids.suspendReason, { required: true })} name="reason" placeholder="Motif de suspension (audite)" />
        </Field>
        <FormActions>
          <Button type="submit" variant="danger" size="sm" pending={suspending} pendingLabel="...">Suspendre (retrait public)</Button>
        </FormActions>
      </Form>
    </Stack>
  );
}
