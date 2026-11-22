"use client";

import { useActionState, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { OfferBlocker, OfferContent } from "../lib/offer-api";
import type { InsurerChoice } from "../lib/lot4-offers-api";
import {
  createBrokerOfferAction,
  renewBrokerOfferAction,
  submitBrokerOfferAction,
  updateBrokerOfferAction,
  withdrawBrokerOfferAction,
  type BrokerOfferActionState
} from "../lib/offer-actions";
import {
  BROKER_OFFER_TYPE_DESCRIPTIONS,
  BROKER_OFFER_TYPE_OPTIONS,
  COMPLETENESS_CHECKLIST,
  OFFER_BLOCKER_LABELS,
  OFFER_FIELD_HINTS,
  OFFER_INDICATIVE_DISCLAIMERS,
  OFFER_TYPE_LABELS,
  PRIVATE_OFFER_BADGE,
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
  const anchor = useRef<HTMLDivElement>(null);
  // The result sits above a long form: bring it into view after each answer so the outcome is never off screen.
  useEffect(() => {
    if (state.status !== "idle") anchor.current?.scrollIntoView({ block: "nearest" });
  }, [state]);
  if (state.status === "idle") return null;
  const blockers = state.blockers ?? [];
  return (
    <div ref={anchor}>
      <Notice tone={state.status === "success" ? "success" : "danger"}>
        {state.message ? <p>{state.message}</p> : null}
        {blockers.length > 0 ? <OfferBlockers blockers={blockers} /> : null}
      </Notice>
    </div>
  );
}

/** Blocker `field` names that share one control in the form. */
const BLOCKER_FIELD_ALIASES: Record<string, string> = { insurerId: "insurerName", indicativePrice: "indicativePriceMin", validity: "validFrom" };

/**
 * Per-field error messages taken from the `{ code, field }` blockers of a refusal, so each message
 * sits under the control it concerns (the full list stays in the notice above the form).
 */
export function blockerFieldErrors(state: BrokerOfferActionState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (state.status !== "error") return errors;
  for (const blocker of state.blockers ?? []) {
    if (!blocker.field) continue;
    const key = BLOCKER_FIELD_ALIASES[blocker.field] ?? blocker.field;
    errors[key] ??= OFFER_BLOCKER_LABELS[blocker.code] ?? blocker.code;
  }
  return errors;
}

function ReasonField({ id, required }: { id: string; required: boolean }) {
  return (
    <Field id={id} label={required ? "Motif (audité)" : "Commentaire (facultatif, audité)"} required={required} hint={required ? "Au moins 8 caractères, conservé dans le journal d'audit." : undefined}>
      <Input {...fieldControlProps(id, { required, ...(required ? { hint: "x" } : {}) })} name="reason" {...(required ? { minLength: 8 } : {})} maxLength={500} />
    </Field>
  );
}

/* ------------------------------------------------------------------------------ completeness */

export function CompletenessChecklist({ completeness }: { completeness: OfferCompleteness }) {
  const missing = new Set<string>(completeness.missing);
  const remaining = COMPLETENESS_CHECKLIST.filter((item) => missing.has(item.field)).length;
  return (
    <div data-offer-completeness="true" aria-live="polite">
      <Cluster>
        <Badge tone={completeness.complete ? "success" : "warning"}>{`Complétude ${completeness.score} %`}</Badge>
        <Badge tone={completeness.complete ? "success" : "warning"}>
          {completeness.complete ? "Minimum atteint : soumission possible" : "Minimum non atteint"}
        </Badge>
      </Cluster>
      {remaining > 0 ? (
        <p className="bo-description">{`${remaining} élément${remaining > 1 ? "s" : ""} à compléter avant de pouvoir soumettre l'offre.`}</p>
      ) : null}
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

function GuaranteesEditor({ base, initial, onChange, error }: { base: string; initial: OfferFormContent["guarantees"]; onChange: () => void; error?: string | undefined }) {
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
      {error ? <p className="bo-field__error" role="alert">{`Garanties : ${error.toLowerCase()}. Ajoutez au moins une garantie avec un libellé.`}</p> : null}
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
            <Button type="button" size="sm" variant="tertiary" aria-label={`Retirer la garantie ${index + 1}`} onClick={() => setRows((current) => current.filter((item) => item.rowId !== row.rowId))}>
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

/**
 * Spec 070: « Assureur porteur du risque ». The select lists the ACTIVE insurers of the offer
 * country (`GET /broker/insurers?countryId=`; the API refuses another one with
 * OFFER_INSURER_INVALID); the free text stays as a fallback (« Autre assureur »). A chosen insurer
 * sends `insurerId` plus its name, so the live completeness still counts the insurer.
 */
function InsurerFields({ base, content, insurers, countryId, onChange, error }: {
  base: string;
  content: OfferFormContent | undefined;
  insurers: InsurerChoice[];
  countryId: string;
  onChange: () => void;
  error?: string | undefined;
}) {
  const [selectedId, setSelectedId] = useState(content?.insurerId ?? "");
  const options = insurers.filter((insurer) => insurer.countryId === countryId);
  const orphan = content?.insurerId && !options.some((insurer) => insurer.id === content.insurerId)
    ? { id: content.insurerId, name: `${content.insurerName ?? "Assureur lié"} (non actif ou hors pays)`, code: "", countryId }
    : undefined;
  const choices = orphan ? [...options, orphan] : options;
  const chosen = choices.find((insurer) => insurer.id === selectedId);
  const effectiveId = chosen ? chosen.id : "";
  useEffect(() => {
    onChange();
  }, [effectiveId, onChange]);
  return (
    <>
      <Field
        id={`${base}-insurer-id`}
        label="Assureur porteur du risque"
        hint={countryId ? "Assureurs actifs du pays de l'offre. Choisissez « Autre assureur » pour saisir un nom libre." : "Choisissez d'abord le pays pour lister les assureurs."}
        error={error}
      >
        <Select
          {...fieldControlProps(`${base}-insurer-id`, { hint: "x", error })}
          name="insurerId"
          value={effectiveId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">Autre assureur (saisie libre)</option>
          {choices.map((insurer) => <option key={insurer.id} value={insurer.id}>{insurer.name}</option>)}
        </Select>
      </Field>
      {chosen ? (
        <input type="hidden" name="insurerName" value={chosen.name} />
      ) : (
        <Field id={`${base}-insurer`} label="Nom de l'assureur (saisie libre)">
          <Input {...fieldControlProps(`${base}-insurer`)} name="insurerName" maxLength={120} defaultValue={content?.insurerId ? "" : content?.insurerName ?? ""} />
        </Field>
      )}
    </>
  );
}

function OfferContentFields({ base, content, onChange, insurerFields, errors }: { base: string; content: OfferFormContent | undefined; onChange: () => void; insurerFields: ReactNode; errors: Record<string, string> }) {
  const disclaimers = content?.publicDisclaimers?.length ? content.publicDisclaimers : [...OFFER_INDICATIVE_DISCLAIMERS];
  return (
    <>
      <FormSection legend="Présentation">
        <Field id={`${base}-name`} label="Nom commercial" required hint={OFFER_FIELD_HINTS.name} error={errors.name}>
          <Input {...fieldControlProps(`${base}-name`, { required: true, hint: "x", error: errors.name })} name="name" maxLength={160} defaultValue={content?.name ?? ""} />
        </Field>
        {insurerFields}
        <Field id={`${base}-description`} label="Description" hint={OFFER_FIELD_HINTS.description} error={errors.shortDescription}>
          <Textarea {...fieldControlProps(`${base}-description`, { hint: "x", error: errors.shortDescription })} name="shortDescription" rows={3} maxLength={1000} defaultValue={content?.shortDescription ?? ""} />
        </Field>
        <Field id={`${base}-summary`} label="Résumé des garanties" hint="Texte libre. La liste des garanties se saisit dans la section « Garanties » plus bas." error={errors.guaranteeSummary}>
          <Textarea {...fieldControlProps(`${base}-summary`, { hint: "x", error: errors.guaranteeSummary })} name="guaranteeSummary" rows={2} maxLength={1000} defaultValue={content?.guaranteeSummary ?? ""} />
        </Field>
        <Field id={`${base}-level`} label="Niveau de garantie (1 à 5)" hint={OFFER_FIELD_HINTS.level} error={errors.guaranteeLevel}>
          <Select {...fieldControlProps(`${base}-level`, { hint: "x", error: errors.guaranteeLevel })} name="guaranteeLevel" defaultValue={content?.guaranteeLevel !== undefined ? String(content.guaranteeLevel) : ""}>
            <option value="">Non renseigné</option>
            {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}</option>)}
          </Select>
        </Field>
      </FormSection>
      <GuaranteesEditor base={base} initial={content?.guarantees} onChange={onChange} error={errors.guarantees} />
      <FormSection legend="Conditions">
        <Field id={`${base}-exclusions`} label="Exclusions" hint={OFFER_FIELD_HINTS.exclusions} error={errors.exclusionsSummary}>
          <Textarea {...fieldControlProps(`${base}-exclusions`, { hint: "x", error: errors.exclusionsSummary })} name="exclusionsSummary" rows={2} maxLength={1000} defaultValue={content?.exclusionsSummary ?? ""} />
        </Field>
        <Field id={`${base}-deductible`} label="Franchise" hint={OFFER_FIELD_HINTS.deductible} error={errors.deductibleAmount}>
          <Input {...fieldControlProps(`${base}-deductible`, { hint: "x", error: errors.deductibleAmount })} name="deductibleAmount" type="number" inputMode="decimal" min={0} step="any" defaultValue={content?.deductibleAmount ?? ""} />
        </Field>
        <Field id={`${base}-ceiling`} label="Plafond" hint={OFFER_FIELD_HINTS.ceiling} error={errors.coverageCeiling}>
          <Input {...fieldControlProps(`${base}-ceiling`, { hint: "x", error: errors.coverageCeiling })} name="coverageCeiling" type="number" inputMode="decimal" min={0} step="any" defaultValue={content?.coverageCeiling ?? ""} />
        </Field>
        <Field id={`${base}-documents`} label="Documents requis" hint="Un document par ligne (30 au maximum)." error={errors.requiredDocuments}>
          <Textarea {...fieldControlProps(`${base}-documents`, { hint: "x", error: errors.requiredDocuments })} name="requiredDocuments" rows={3} defaultValue={(content?.requiredDocuments ?? []).join("\n")} />
        </Field>
        <Field id={`${base}-delay`} label="Délai moyen de traitement (jours)" hint={OFFER_FIELD_HINTS.delay} error={errors.processingDelayDays}>
          <Input {...fieldControlProps(`${base}-delay`, { hint: "x", error: errors.processingDelayDays })} name="processingDelayDays" type="number" inputMode="numeric" min={0} max={365} defaultValue={content?.processingDelayDays ?? ""} />
        </Field>
      </FormSection>
      <FormSection legend="Prix indicatif" description="Prix à confirmer par le courtier partenaire : aucune offre ne vaut devis ferme ni contrat.">
        <Field id={`${base}-price-min`} label="Prime minimale" hint={OFFER_FIELD_HINTS.priceMin} error={errors.indicativePriceMin}>
          <Input {...fieldControlProps(`${base}-price-min`, { hint: "x", error: errors.indicativePriceMin })} name="indicativePriceMin" type="number" inputMode="decimal" min={0} step="any" defaultValue={content?.indicativePriceMin ?? ""} />
        </Field>
        <Field id={`${base}-price-max`} label="Prime maximale" hint={OFFER_FIELD_HINTS.priceMax} error={errors.indicativePriceMax}>
          <Input {...fieldControlProps(`${base}-price-max`, { hint: "x", error: errors.indicativePriceMax })} name="indicativePriceMax" type="number" inputMode="decimal" min={0} step="any" defaultValue={content?.indicativePriceMax ?? ""} />
        </Field>
        <Field id={`${base}-currency`} label="Devise" hint={OFFER_FIELD_HINTS.currency} error={errors.currency}>
          <Input {...fieldControlProps(`${base}-currency`, { hint: "x", error: errors.currency })} name="currency" minLength={3} maxLength={3} autoCapitalize="characters" defaultValue={content?.currency ?? "XOF"} />
        </Field>
        <Field id={`${base}-unit`} label="Unité de prix" hint={OFFER_FIELD_HINTS.unit} error={errors.pricingUnit}>
          <Input {...fieldControlProps(`${base}-unit`, { hint: "x", error: errors.pricingUnit })} name="pricingUnit" maxLength={40} placeholder="an" defaultValue={content?.pricingUnit ?? ""} />
        </Field>
        <Field id={`${base}-flexibility`} label="Fractionnement du paiement" hint={OFFER_FIELD_HINTS.flexibility} error={errors.paymentFlexibility}>
          <Select {...fieldControlProps(`${base}-flexibility`, { hint: "x", error: errors.paymentFlexibility })} name="paymentFlexibility" defaultValue={content?.paymentFlexibility ?? ""}>
            <option value="">Non renseigné</option>
            {Object.entries(PAYMENT_FLEXIBILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
      </FormSection>
      <FormSection legend="Validité et source">
        <Field id={`${base}-from`} label="Début de validité" required hint={OFFER_FIELD_HINTS.from} error={errors.validFrom}>
          <Input {...fieldControlProps(`${base}-from`, { required: true, hint: "x", error: errors.validFrom })} name="validFrom" type="date" defaultValue={isoToDateInput(content?.validFrom)} />
        </Field>
        <Field id={`${base}-until`} label="Fin de validité" required hint="Postérieure au début et future pour être validée." error={errors.validUntil}>
          <Input {...fieldControlProps(`${base}-until`, { required: true, hint: "x", error: errors.validUntil })} name="validUntil" type="date" defaultValue={isoToDateInput(content?.validUntil)} />
        </Field>
        <Field id={`${base}-source`} label="Source de l'information" hint={OFFER_FIELD_HINTS.source} error={errors.sourceOfInformation}>
          <Input {...fieldControlProps(`${base}-source`, { hint: "x", error: errors.sourceOfInformation })} name="sourceOfInformation" maxLength={200} defaultValue={content?.sourceOfInformation ?? ""} />
        </Field>
        <Field id={`${base}-disclaimers`} label="Mentions indicatives" hint="Une mention par ligne. « offre indicative » est obligatoire." error={errors.publicDisclaimers}>
          <Textarea {...fieldControlProps(`${base}-disclaimers`, { hint: "x", error: errors.publicDisclaimers })} name="publicDisclaimers" rows={2} defaultValue={disclaimers.join("\n")} />
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

export function CreateBrokerOfferForm({ scopes, insurers }: { scopes: ScopeChoice[]; insurers: InsurerChoice[] }) {
  const [state, formAction, pending] = useActionState(createBrokerOfferAction, initialState);
  const base = useId();
  const [offerType, setOfferType] = useState<string>("indicative");
  const [scope, setScope] = useState("");
  const errors = blockerFieldErrors(state);
  const { formRef, completeness, recompute } = useLiveCompleteness(undefined);
  return (
    <Card title="Contenu de l'offre" description="Créée en brouillon (version 1) ; vous la soumettez à validation quand la complétude minimale est atteinte.">
      <Form action={formAction} ref={formRef} onInput={recompute} onChange={recompute} data-offer-form="create">
        <OfferActionResult state={state} />
        <FormSection
          legend="Périmètre"
          description="La liste reprend les pays et produits couverts à la fois par une licence valide et par des autorisations actives de votre cabinet, y compris les pays pas encore ouverts au public."
        >
          <Field id={`${base}-scope`} label="Pays — Produit" required>
            <Select {...fieldControlProps(`${base}-scope`, { required: true })} name="scope" options={scopes} placeholder="Choisir un pays et un produit couverts" defaultValue="" onChange={(event) => setScope(event.target.value)} />
          </Field>
          <Field id={`${base}-type`} label="Type d'offre" hint="Le type est définitif : il ne pourra plus être modifié après la création.">
            <Select {...fieldControlProps(`${base}-type`, { hint: "x" })} name="offerType" value={offerType} onChange={(event) => setOfferType(event.target.value)}>
              {BROKER_OFFER_TYPE_OPTIONS.map((value) => <option key={value} value={value}>{OFFER_TYPE_LABELS[value]}</option>)}
            </Select>
          </Field>
          <p data-offer-type-description={offerType}>{BROKER_OFFER_TYPE_DESCRIPTIONS[offerType]}</p>
          {offerType === "private" ? <Badge tone="warning">{PRIVATE_OFFER_BADGE}</Badge> : null}
          {scopes.length === 0 ? <Notice tone="warning">Aucune couverture licenciée : contactez AssurMatch pour compléter votre dossier.</Notice> : null}
        </FormSection>
        <CompletenessChecklist completeness={completeness} />
        <OfferContentFields
          base={base}
          content={undefined}
          onChange={recompute}
          errors={errors}
          insurerFields={<InsurerFields base={base} content={undefined} insurers={insurers} countryId={scope.split(":")[0] ?? ""} onChange={recompute} error={errors.insurerName} />}
        />
        <p className="bo-description" data-offer-draft-note="create">
          {scopes.length === 0
            ? "Création impossible : aucune couverture licenciée n'est disponible pour votre cabinet."
            : "Le brouillon n'est ni soumis ni visible du public. Vous le soumettez à validation depuis la page de l'offre, une fois la complétude minimale atteinte."}
        </p>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création..." disabled={scopes.length === 0}>Créer le brouillon</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

/* ------------------------------------------------------------------------------------ edit */

export function EditBrokerOfferForm({ offerId, offerType, countryId, insurers, concurrencyToken, content, hasPending, pendingSubmitted }: {
  offerId: string;
  offerType: string;
  countryId: string;
  insurers: InsurerChoice[];
  concurrencyToken: string;
  content: OfferFormContent | undefined;
  hasPending: boolean;
  pendingSubmitted: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateBrokerOfferAction, initialState);
  const base = useId();
  const errors = blockerFieldErrors(state);
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
        {offerType === "indicative" || offerType === "private" ? <input type="hidden" name="offerType" value={offerType} /> : null}
        <Field id={`${base}-type-readonly`} label="Type d'offre" hint="Le type est définitif : il ne peut pas être modifié après la création.">
          <Input {...fieldControlProps(`${base}-type-readonly`, { hint: "x" })} value={OFFER_TYPE_LABELS[offerType] ?? OFFER_TYPE_LABELS.indicative ?? ""} readOnly />
        </Field>
        {offerType === "private" ? <Badge tone="warning">{PRIVATE_OFFER_BADGE}</Badge> : null}
        <CompletenessChecklist completeness={completeness} />
        <OfferContentFields
          base={base}
          content={content}
          onChange={recompute}
          errors={errors}
          insurerFields={<InsurerFields base={base} content={content} insurers={insurers} countryId={countryId} onChange={recompute} error={errors.insurerName} />}
        />
        <ReasonField id={`${base}-reason`} required={false} />
        <p className="bo-description" data-offer-draft-note="update">
          {hasPending
            ? "L'enregistrement met à jour la version en cours ; elle n'est publiée qu'après soumission puis validation par AssurMatch."
            : "L'enregistrement crée une nouvelle version en brouillon ; la version publiée reste en ligne jusqu'à la validation de la nouvelle."}
        </p>
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
      <p className="bo-description">Soumettre envoie la version en cours à AssurMatch pour validation. Tant qu&apos;elle n&apos;est pas validée, la version publiée (s&apos;il y en a une) reste en ligne.</p>
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
      <Field id={`${base}-until`} label="Nouvelle fin de validité" required hint="Future et postérieure au nouveau début.">
        <Input {...fieldControlProps(`${base}-until`, { required: true, hint: "x" })} name="validUntil" type="date" />
      </Field>
      <ReasonField id={`${base}-reason`} required={false} />
      <FormActions>
        <Button type="submit" variant="secondary" pending={pending} pendingLabel="Renouvellement...">Renouveler l&apos;offre</Button>
      </FormActions>
    </Form>
  );
}
