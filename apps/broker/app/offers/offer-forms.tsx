"use client";

import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";
import type { OfferBlocker, OfferContent } from "../lib/offer-api";
import {
  createBrokerOfferAction,
  renewBrokerOfferAction,
  submitBrokerOfferAction,
  updateBrokerOfferAction,
  withdrawBrokerOfferAction,
  type BrokerOfferActionState
} from "../lib/offer-actions";
import {
  COMPLETENESS_CHECKLIST,
  OFFER_INDICATIVE_DISCLAIMERS,
  OFFER_WITHDRAW_TARGET_LABELS,
  PAYMENT_FLEXIBILITY_LABELS,
  isoToDateInput,
  offerBlockerLabel,
  offerCompleteness,
  offerContentFromForm,
  type OfferCompleteness
} from "../lib/offer-messages";
import {
  Badge,
  Button,
  Card,
  Cluster,
  ConfirmDialog,
  Field,
  Form,
  FormActions,
  FormSection,
  Input,
  Notice,
  Select,
  Stack,
  Textarea,
  fieldControlProps
} from "../lib/ui/broker-ui";

/**
 * Spec 052 US1/US3: broker offer forms ("Mes offres"). Pattern A (`useActionState` + server actions
 * of `lib/offer-actions.ts`). The completeness checklist is computed live with the shared
 * `offerCompleteness` (R3), the same function the API applies at submission. There is no
 * sponsorship field here: sponsorship is an admin decision (FR-013).
 */
const initialState: BrokerOfferActionState = { status: "idle" };

type OfferFormContent = Partial<OfferContent>;

export function OfferBlockers({ blockers }: { blockers: OfferBlocker[] }) {
  return (
    <ul className="bo-list" data-offer-blockers="true" aria-label="Contrôles bloquants">
      {blockers.map((blocker) => (
        <li key={`${blocker.code}:${blocker.field ?? ""}`}>
          <strong>{offerBlockerLabel(blocker)}</strong>
        </li>
      ))}
    </ul>
  );
}

export function OfferActionResult({ state }: { state: BrokerOfferActionState }) {
  if (state.status === "idle") return null;
  const blockers = state.blockers ?? [];
  return (
    <Notice tone={state.status === "success" ? "success" : "danger"}>
      {state.message ? <p>{state.message}</p> : null}
      {blockers.length > 0 ? <OfferBlockers blockers={blockers} /> : null}
    </Notice>
  );
}

function ReasonField({ id, required }: { id: string; required: boolean }) {
  return (
    <Field id={id} label={required ? "Motif (audite)" : "Commentaire (facultatif, audite)"} required={required} hint={required ? "Au moins 8 caractères, conservé dans le journal d'audit." : undefined}>
      <Input {...fieldControlProps(id, { required, ...(required ? { hint: "x" } : {}) })} name="reason" {...(required ? { minLength: 8 } : {})} maxLength={500} />
    </Field>
  );
}

/* ------------------------------------------------------------------------------ completeness */

export function CompletenessChecklist({ completeness }: { completeness: OfferCompleteness }) {
  const missing = new Set<string>(completeness.missing);
  return (
    <div data-offer-completeness="true" aria-live="polite">
      <Cluster>
        <Badge tone={completeness.complete ? "success" : "warning"}>{`Complétude ${completeness.score} %`}</Badge>
        <Badge tone={completeness.complete ? "success" : "warning"}>
          {completeness.complete ? "Minimum atteint : soumission possible" : "Minimum non atteint"}
        </Badge>
      </Cluster>
      <ul className="bo-list" aria-label="Complétude minimale">
        {COMPLETENESS_CHECKLIST.map((item) => (
          <li key={item.field}>
            {missing.has(item.field) ? "À compléter" : "OK"} : {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- guarantees list */

interface GuaranteeRowState {
  rowId: number;
  key: string;
  label: string;
  included: boolean;
  detail: string;
}

function GuaranteesEditor({ base, initial, onChange }: { base: string; initial: OfferFormContent["guarantees"]; onChange: () => void }) {
  const counter = useRef(0);
  const nextId = () => {
    counter.current += 1;
    return counter.current;
  };
  // A new offer starts with one empty row so the field is visible: an empty list read as "no
  // guarantee field". Empty rows are dropped when the form is read (`offerContentFromForm`).
  const [rows, setRows] = useState<GuaranteeRowState[]>(() => {
    const saved = (initial ?? []).map((guarantee) => ({
      rowId: nextId(),
      key: guarantee.key,
      label: guarantee.label,
      included: guarantee.included,
      detail: guarantee.detail ?? ""
    }));
    return saved.length > 0 ? saved : [{ rowId: nextId(), key: "", label: "", included: true, detail: "" }];
  });
  useEffect(() => {
    onChange();
  }, [rows, onChange]);
  return (
    <FormSection legend="Garanties (liste détaillée)" description="Au moins une garantie est exigée pour soumettre l'offre. Une ligne par garantie (50 au maximum) ; la clé est déduite du libellé si elle est vide.">
      {rows.length === 0 ? <p>Aucune garantie : ajoutez-en au moins une avant de soumettre.</p> : null}
      {rows.map((row, index) => (
        <div key={row.rowId} data-offer-guarantee-row="true">
          <Cluster>
            <Field id={`${base}-g-label-${row.rowId}`} label={`Garantie ${index + 1} : libellé`}>
              <Input {...fieldControlProps(`${base}-g-label-${row.rowId}`)} name="guaranteeLabel" maxLength={120} defaultValue={row.label} />
            </Field>
            <Field id={`${base}-g-key-${row.rowId}`} label="Clé">
              <Input {...fieldControlProps(`${base}-g-key-${row.rowId}`)} name="guaranteeKey" maxLength={64} defaultValue={row.key} />
            </Field>
            <Field id={`${base}-g-included-${row.rowId}`} label="Incluse">
              <Select {...fieldControlProps(`${base}-g-included-${row.rowId}`)} name="guaranteeIncluded" defaultValue={row.included ? "true" : "false"}>
                <option value="true">Incluse</option>
                <option value="false">Non incluse (option)</option>
              </Select>
            </Field>
            <Field id={`${base}-g-detail-${row.rowId}`} label="Détail">
              <Input {...fieldControlProps(`${base}-g-detail-${row.rowId}`)} name="guaranteeDetail" maxLength={300} defaultValue={row.detail} />
            </Field>
            <Button type="button" size="sm" variant="tertiary" onClick={() => setRows((current) => current.filter((item) => item.rowId !== row.rowId))}>
              Retirer
            </Button>
          </Cluster>
        </div>
      ))}
      <FormActions align="start">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={rows.length >= 50}
          onClick={() => setRows((current) => [...current, { rowId: nextId(), key: "", label: "", included: true, detail: "" }])}
        >
          Ajouter une garantie
        </Button>
      </FormActions>
    </FormSection>
  );
}

/* ------------------------------------------------------------------------- content fields */

function OfferContentFields({ base, content, onChange }: { base: string; content: OfferFormContent | undefined; onChange: () => void }) {
  const disclaimers = content?.publicDisclaimers?.length ? content.publicDisclaimers : [...OFFER_INDICATIVE_DISCLAIMERS];
  return (
    <>
      <FormSection legend="Présentation">
        <Field id={`${base}-name`} label="Nom commercial" required>
          <Input {...fieldControlProps(`${base}-name`, { required: true })} name="name" maxLength={160} defaultValue={content?.name ?? ""} />
        </Field>
        <Field id={`${base}-insurer`} label="Assureur porteur">
          <Input {...fieldControlProps(`${base}-insurer`)} name="insurerName" maxLength={120} defaultValue={content?.insurerName ?? ""} />
        </Field>
        <Field id={`${base}-description`} label="Description">
          <Textarea {...fieldControlProps(`${base}-description`)} name="shortDescription" rows={3} maxLength={1000} defaultValue={content?.shortDescription ?? ""} />
        </Field>
        <Field id={`${base}-summary`} label="Résumé des garanties" hint="Texte libre. La liste des garanties se saisit dans la section « Garanties » plus bas.">
          <Textarea {...fieldControlProps(`${base}-summary`, { hint: "x" })} name="guaranteeSummary" rows={2} maxLength={1000} defaultValue={content?.guaranteeSummary ?? ""} />
        </Field>
        <Field id={`${base}-level`} label="Niveau de garantie (1 à 5)">
          <Select {...fieldControlProps(`${base}-level`)} name="guaranteeLevel" defaultValue={content?.guaranteeLevel !== undefined ? String(content.guaranteeLevel) : ""}>
            <option value="">Non renseigné</option>
            {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}</option>)}
          </Select>
        </Field>
      </FormSection>
      <GuaranteesEditor base={base} initial={content?.guarantees} onChange={onChange} />
      <FormSection legend="Conditions">
        <Field id={`${base}-exclusions`} label="Exclusions">
          <Textarea {...fieldControlProps(`${base}-exclusions`)} name="exclusionsSummary" rows={2} maxLength={1000} defaultValue={content?.exclusionsSummary ?? ""} />
        </Field>
        <Field id={`${base}-deductible`} label="Franchise">
          <Input {...fieldControlProps(`${base}-deductible`)} name="deductibleAmount" type="number" min={0} step="any" defaultValue={content?.deductibleAmount ?? ""} />
        </Field>
        <Field id={`${base}-ceiling`} label="Plafond">
          <Input {...fieldControlProps(`${base}-ceiling`)} name="coverageCeiling" type="number" min={0} step="any" defaultValue={content?.coverageCeiling ?? ""} />
        </Field>
        <Field id={`${base}-documents`} label="Documents requis" hint="Un document par ligne (30 au maximum).">
          <Textarea {...fieldControlProps(`${base}-documents`, { hint: "x" })} name="requiredDocuments" rows={3} defaultValue={(content?.requiredDocuments ?? []).join("\n")} />
        </Field>
        <Field id={`${base}-delay`} label="Délai moyen de traitement (jours)">
          <Input {...fieldControlProps(`${base}-delay`)} name="processingDelayDays" type="number" min={0} max={365} defaultValue={content?.processingDelayDays ?? ""} />
        </Field>
      </FormSection>
      <FormSection legend="Prix indicatif" description="Prix à confirmer par le courtier partenaire : aucune offre ne vaut devis ferme ni contrat.">
        <Field id={`${base}-price-min`} label="Prime minimale">
          <Input {...fieldControlProps(`${base}-price-min`)} name="indicativePriceMin" type="number" min={0} step="any" defaultValue={content?.indicativePriceMin ?? ""} />
        </Field>
        <Field id={`${base}-price-max`} label="Prime maximale">
          <Input {...fieldControlProps(`${base}-price-max`)} name="indicativePriceMax" type="number" min={0} step="any" defaultValue={content?.indicativePriceMax ?? ""} />
        </Field>
        <Field id={`${base}-currency`} label="Devise">
          <Input {...fieldControlProps(`${base}-currency`)} name="currency" minLength={3} maxLength={3} defaultValue={content?.currency ?? "XOF"} />
        </Field>
        <Field id={`${base}-unit`} label="Unité de prix">
          <Input {...fieldControlProps(`${base}-unit`)} name="pricingUnit" maxLength={40} placeholder="an" defaultValue={content?.pricingUnit ?? ""} />
        </Field>
        <Field id={`${base}-flexibility`} label="Fractionnement du paiement">
          <Select {...fieldControlProps(`${base}-flexibility`)} name="paymentFlexibility" defaultValue={content?.paymentFlexibility ?? ""}>
            <option value="">Non renseigné</option>
            {Object.entries(PAYMENT_FLEXIBILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
      </FormSection>
      <FormSection legend="Validité et source">
        <Field id={`${base}-from`} label="Début de validité" required>
          <Input {...fieldControlProps(`${base}-from`, { required: true })} name="validFrom" type="date" defaultValue={isoToDateInput(content?.validFrom)} />
        </Field>
        <Field id={`${base}-until`} label="Fin de validité" required hint="Postérieure au début et future pour être validée.">
          <Input {...fieldControlProps(`${base}-until`, { required: true, hint: "x" })} name="validUntil" type="date" defaultValue={isoToDateInput(content?.validUntil)} />
        </Field>
        <Field id={`${base}-source`} label="Source de l'information">
          <Input {...fieldControlProps(`${base}-source`)} name="sourceOfInformation" maxLength={200} defaultValue={content?.sourceOfInformation ?? ""} />
        </Field>
        <Field id={`${base}-disclaimers`} label="Mentions indicatives" hint="Une mention par ligne. « offre indicative » est obligatoire.">
          <Textarea {...fieldControlProps(`${base}-disclaimers`, { hint: "x" })} name="publicDisclaimers" rows={2} defaultValue={disclaimers.join("\n")} />
        </Field>
      </FormSection>
    </>
  );
}

/** Live completeness: recomputed from the form on every input (and when a guarantee row changes). */
function useLiveCompleteness(content: OfferFormContent | undefined) {
  const formRef = useRef<HTMLFormElement>(null);
  const [completeness, setCompleteness] = useState<OfferCompleteness>(() => offerCompleteness(content ?? {}));
  const recompute = useCallback(() => {
    if (!formRef.current) return;
    setCompleteness(offerCompleteness(offerContentFromForm(new FormData(formRef.current))));
  }, []);
  return { formRef, completeness, recompute };
}

/* ---------------------------------------------------------------------------------- create */

export interface ScopeChoice {
  value: string;
  label: string;
}

export function CreateBrokerOfferForm({ scopes }: { scopes: ScopeChoice[] }) {
  const [state, formAction, pending] = useActionState(createBrokerOfferAction, initialState);
  const base = useId();
  const { formRef, completeness, recompute } = useLiveCompleteness(undefined);
  return (
    <Card title="Nouvelle offre" description="L'offre est créée en brouillon (version 1). Elle n'est visible du public qu'après validation par AssurMatch.">
      <Form action={formAction} ref={formRef} onInput={recompute} onChange={recompute} data-offer-form="create">
        <OfferActionResult state={state} />
        <FormSection
          legend="Périmètre"
          description="La liste reprend les pays et produits couverts à la fois par une licence valide et par des autorisations actives de votre cabinet, y compris les pays pas encore ouverts au public."
        >
          <Field id={`${base}-scope`} label="Pays — Produit" required>
            <Select {...fieldControlProps(`${base}-scope`, { required: true })} name="scope" options={scopes} placeholder="Choisir un pays et un produit couverts" defaultValue="" />
          </Field>
          {scopes.length === 0 ? <Notice tone="warning">Aucune couverture licenciée : contactez AssurMatch pour compléter votre dossier.</Notice> : null}
        </FormSection>
        <CompletenessChecklist completeness={completeness} />
        <OfferContentFields base={base} content={undefined} onChange={recompute} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création..." disabled={scopes.length === 0}>Créer le brouillon</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

/* ------------------------------------------------------------------------------------ edit */

export function EditBrokerOfferForm({ offerId, concurrencyToken, content, hasPending, pendingSubmitted }: {
  offerId: string;
  concurrencyToken: string;
  content: OfferFormContent | undefined;
  hasPending: boolean;
  pendingSubmitted: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateBrokerOfferAction, initialState);
  const base = useId();
  const { formRef, completeness, recompute } = useLiveCompleteness(content);
  return (
    <Card
      title={hasPending ? "Modifier la version en cours" : "Modifier l'offre (nouvelle version)"}
      description={hasPending
        ? (pendingSubmitted
          ? "Cette version est en attente de validation : la modifier la renvoie en brouillon, et une nouvelle soumission sera nécessaire."
          : "Une seule version en cours à la fois : vos modifications s'appliquent à ce brouillon.")
        : "Une nouvelle version est créée en brouillon ; la version publiée reste en ligne jusqu'à la validation de la nouvelle."}
    >
      <Form action={formAction} ref={formRef} onInput={recompute} onChange={recompute} data-offer-form="update">
        <OfferActionResult state={state} />
        <input type="hidden" name="offerId" value={offerId} />
        <input type="hidden" name="expectedUpdatedAt" value={concurrencyToken} />
        <CompletenessChecklist completeness={completeness} />
        <OfferContentFields base={base} content={content} onChange={recompute} />
        <ReasonField id={`${base}-reason`} required={false} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer le brouillon</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

/* --------------------------------------------------------------------------------- actions */

export function SubmitBrokerOfferForm({ offerId, complete }: { offerId: string; complete: boolean }) {
  const [state, formAction, pending] = useActionState(submitBrokerOfferAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-offer-form="submit">
      <OfferActionResult state={state} />
      <input type="hidden" name="offerId" value={offerId} />
      <ReasonField id={`${base}-reason`} required={false} />
      {!complete ? <Notice tone="warning">Complétude minimale non atteinte : la soumission sera refusée avec la liste des champs manquants.</Notice> : null}
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Soumission...">Soumettre à validation</Button>
      </FormActions>
    </Form>
  );
}

export function WithdrawBrokerOfferForm({ offerId, target }: { offerId: string; target: "pending" | "offer" }) {
  const [state, formAction] = useActionState(withdrawBrokerOfferAction, initialState);
  const base = useId();
  const label = OFFER_WITHDRAW_TARGET_LABELS[target];
  return (
    <div data-offer-withdraw={target}>
      <Stack>
        <OfferActionResult state={state} />
        <ConfirmDialog
          triggerLabel={label}
          triggerVariant="danger"
          title={label}
          description={target === "offer"
            ? "L'offre disparaît du comparateur public. Son historique est conservé ; une nouvelle publication passera par une nouvelle validation."
            : "La version en cours est abandonnée. La version publiée, s'il y en a une, reste en ligne."}
          confirmLabel={label}
          cancelLabel="Annuler"
          tone="danger"
          formAction={formAction}
          dataAttributes={{ "data-offer-form": `withdraw-${target}` }}
        >
          <OfferActionResult state={state} />
          <input type="hidden" name="offerId" value={offerId} />
          <input type="hidden" name="target" value={target} />
          <ReasonField id={`${base}-reason`} required />
        </ConfirmDialog>
      </Stack>
    </div>
  );
}

export function RenewBrokerOfferForm({ offerId }: { offerId: string }) {
  const [state, formAction, pending] = useActionState(renewBrokerOfferAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-offer-form="renew">
      <OfferActionResult state={state} />
      <input type="hidden" name="offerId" value={offerId} />
      <Field id={`${base}-from`} label="Nouveau début de validité" required>
        <Input {...fieldControlProps(`${base}-from`, { required: true })} name="validFrom" type="date" />
      </Field>
      <Field id={`${base}-until`} label="Nouvelle fin de validité" required>
        <Input {...fieldControlProps(`${base}-until`, { required: true })} name="validUntil" type="date" />
      </Field>
      <ReasonField id={`${base}-reason`} required={false} />
      <FormActions>
        <Button type="submit" variant="secondary" pending={pending} pendingLabel="Renouvellement...">Renouveler l&apos;offre</Button>
      </FormActions>
    </Form>
  );
}
