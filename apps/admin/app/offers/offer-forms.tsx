"use client";

import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";
import type { AdminOfferContent, OfferBlocker } from "../lib/admin-api";
import { createOfferAction, offerDecisionAction, updateOfferAction, type OfferActionState } from "../lib/offer-actions";
import {
  COMPLETENESS_CHECKLIST,
  OFFER_INDICATIVE_DISCLAIMERS,
  OFFER_TYPE_LABELS,
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
  Checkbox,
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
} from "../lib/ui/admin-ui";

/**
 * Spec 052 US2/US5: admin offer forms. Pattern A (`useActionState` + server actions of
 * `lib/offer-actions.ts`); every write asks for the audited reason ("Motif (audite)"). The
 * completeness checklist is computed live with the shared `offerCompleteness` (R3), the same
 * function the API applies at submission and validation. Sponsorship fields exist only here, never
 * in the broker portal (FR-013).
 */
const initialState: OfferActionState = { status: "idle" };

export interface SelectChoice {
  value: string;
  label: string;
}

type OfferFormContent = Partial<AdminOfferContent>;

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

export function OfferActionResult({ state }: { state: OfferActionState }) {
  if (state.status === "idle") return null;
  const blockers = state.blockers ?? [];
  return (
    <Notice tone={state.status === "success" ? "success" : "danger"}>
      {state.message ? <p>{state.message}</p> : null}
      {blockers.length > 0 ? <OfferBlockers blockers={blockers} /> : null}
    </Notice>
  );
}

function ReasonField({ id }: { id: string }) {
  return (
    <Field id={id} label="Motif (audite)" required hint="Au moins 8 caractères, conservé dans le journal d'audit.">
      <Input {...fieldControlProps(id, { required: true, hint: "x" })} name="reason" minLength={8} />
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
  const [rows, setRows] = useState<GuaranteeRowState[]>(() =>
    (initial ?? []).map((guarantee) => ({
      rowId: nextId(),
      key: guarantee.key,
      label: guarantee.label,
      included: guarantee.included,
      detail: guarantee.detail ?? ""
    }))
  );
  useEffect(() => {
    onChange();
  }, [rows, onChange]);
  return (
    <FormSection legend="Garanties" description="Une ligne par garantie (50 au maximum). La clé est déduite du libellé si elle est vide.">
      {rows.length === 0 ? <p>Aucune garantie : ajoutez-en au moins une avant de soumettre.</p> : null}
      {rows.map((row, index) => (
        <div key={row.rowId} data-offer-guarantee-row="true">
          <Cluster>
            <Field id={`${base}-g-label-${row.rowId}`} label={`Garantie ${index + 1} : libellé`} required>
              <Input {...fieldControlProps(`${base}-g-label-${row.rowId}`, { required: true })} name="guaranteeLabel" maxLength={120} defaultValue={row.label} />
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
        <Field id={`${base}-summary`} label="Résumé des garanties">
          <Textarea {...fieldControlProps(`${base}-summary`)} name="guaranteeSummary" rows={2} maxLength={1000} defaultValue={content?.guaranteeSummary ?? ""} />
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

function SponsorshipFields({ base, content }: { base: string; content: OfferFormContent | undefined }) {
  return (
    <FormSection
      legend="Sponsorisation (admin uniquement)"
      description="Crée une version à valider. L'étiquette « sponsorisé » reste toujours visible au public, si sponsored_offers_enabled est actif."
    >
      <input type="hidden" name="sponsorshipFields" value="1" />
      <Checkbox id={`${base}-sponsored`} name="isSponsored" label="Offre sponsorisée" defaultChecked={content?.isSponsored ?? false} />
      <Field id={`${base}-sponsor-label`} label="Étiquette de sponsorisation">
        <Input {...fieldControlProps(`${base}-sponsor-label`)} name="sponsorLabel" maxLength={60} placeholder="Sponsorisé" defaultValue={content?.sponsorLabel ?? ""} />
      </Field>
      <Field id={`${base}-priority`} label="Priorité d'affichage (0 à 1000)">
        <Input {...fieldControlProps(`${base}-priority`)} name="displayPriority" type="number" min={0} max={1000} defaultValue={content?.displayPriority ?? 0} />
      </Field>
    </FormSection>
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

export function CreateOfferForm({ partners, scopes }: { partners: SelectChoice[]; scopes: { countries: SelectChoice[]; products: SelectChoice[] } }) {
  const [state, formAction, pending] = useActionState(createOfferAction, initialState);
  const base = useId();
  const { formRef, completeness, recompute } = useLiveCompleteness(undefined);
  return (
    <Card title="Nouvelle offre pour un courtier" description="L'offre est créée en brouillon (version 1). Elle n'est publique qu'après validation par la conformité.">
      <Form action={formAction} ref={formRef} onInput={recompute} onChange={recompute} data-offer-form="create">
        <OfferActionResult state={state} />
        <FormSection legend="Périmètre" description="Le courtier doit couvrir ce pays et ce produit (licence valide et autorisations actives).">
          <Field id={`${base}-partner`} label="Courtier" required>
            <Select {...fieldControlProps(`${base}-partner`, { required: true })} name="partnerTenantId" options={partners} placeholder="Choisir un courtier" defaultValue="" />
          </Field>
          <Field id={`${base}-country`} label="Pays" required>
            <Select {...fieldControlProps(`${base}-country`, { required: true })} name="countryId" options={scopes.countries} placeholder="Choisir un pays" defaultValue="" />
          </Field>
          <Field id={`${base}-product`} label="Produit" required>
            <Select {...fieldControlProps(`${base}-product`, { required: true })} name="productId" options={scopes.products} placeholder="Choisir un produit" defaultValue="" />
          </Field>
          <Field id={`${base}-type`} label="Type d'offre">
            <Select {...fieldControlProps(`${base}-type`)} name="offerType" defaultValue="indicative">
              {Object.entries(OFFER_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
        </FormSection>
        <CompletenessChecklist completeness={completeness} />
        <OfferContentFields base={base} content={undefined} onChange={recompute} />
        <SponsorshipFields base={base} content={undefined} />
        <ReasonField id={`${base}-reason`} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer le brouillon</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

/* ------------------------------------------------------------------------------------ edit */

export interface EditableOffer {
  id: string;
  countryId: string;
  productId: string;
  partnerTenantId?: string | undefined;
  concurrencyToken: string;
}

export function EditOfferForm({ offer, content, hasPending, partners }: {
  offer: EditableOffer;
  content: OfferFormContent | undefined;
  hasPending: boolean;
  partners: SelectChoice[];
}) {
  const [state, formAction, pending] = useActionState(updateOfferAction, initialState);
  const base = useId();
  const { formRef, completeness, recompute } = useLiveCompleteness(content);
  return (
    <Card
      title={hasPending ? "Modifier la version en cours" : "Modifier l'offre (nouvelle version)"}
      description={hasPending
        ? "Modifier une version soumise la renvoie en brouillon : une nouvelle soumission est requise."
        : "Une nouvelle version est créée en brouillon ; la version publiée reste en ligne jusqu'à la validation de la nouvelle."}
    >
      <Form action={formAction} ref={formRef} onInput={recompute} onChange={recompute} data-offer-form="update">
        <OfferActionResult state={state} />
        <input type="hidden" name="offerId" value={offer.id} />
        <input type="hidden" name="countryId" value={offer.countryId} />
        <input type="hidden" name="productId" value={offer.productId} />
        <input type="hidden" name="expectedUpdatedAt" value={offer.concurrencyToken} />
        {offer.partnerTenantId ? (
          <input type="hidden" name="partnerTenantId" value={offer.partnerTenantId} />
        ) : (
          <Field id={`${base}-partner`} label="Courtier" required hint="Aucun courtier rattaché : une offre sans courtier ne peut pas être validée.">
            <Select {...fieldControlProps(`${base}-partner`, { required: true, hint: "x" })} name="partnerTenantId" options={partners} placeholder="Choisir un courtier" defaultValue="" />
          </Field>
        )}
        <CompletenessChecklist completeness={completeness} />
        <OfferContentFields base={base} content={content} onChange={recompute} />
        <SponsorshipFields base={base} content={content} />
        <ReasonField id={`${base}-reason`} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer la version</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

/* ------------------------------------------------------------------------------- decisions */

const DECISION_COPY = {
  submit: {
    label: "Soumettre à la conformité",
    description: "La complétude minimale est vérifiée. La version publiée, s'il y en a une, reste en ligne pendant la revue.",
    tone: "primary" as const
  },
  validate: {
    label: "Valider et publier",
    description: "Contrôles : complétude, mention « offre indicative », dates, éligibilité du courtier (licence, autorisations, statut). La version validée remplace la version publiée.",
    tone: "primary" as const
  },
  reject: {
    label: "Refuser",
    description: "La version repasse en brouillon avec le motif, visible du courtier. Rien ne change au public.",
    tone: "danger" as const
  },
  suspend: {
    label: "Suspendre",
    description: "L'offre disparaît du comparateur en moins d'une minute ; le courtier voit le motif. Lever la suspension revient à une nouvelle validation.",
    tone: "danger" as const
  }
};

export function OfferDecisionForm({ offerId, action }: { offerId: string; action: "submit" | "validate" | "reject" | "suspend" }) {
  const [state, formAction] = useActionState(offerDecisionAction, initialState);
  const base = useId();
  const copy = DECISION_COPY[action];
  return (
    <div data-offer-decision={action} {...(action === "submit" ? {} : { "data-compliance-only": "offer" })}>
      <Stack>
        <OfferActionResult state={state} />
        <ConfirmDialog
          triggerLabel={copy.label}
          triggerVariant={copy.tone === "danger" ? "danger" : "primary"}
          title={copy.label}
          description={copy.description}
          confirmLabel={copy.label}
          cancelLabel="Annuler"
          tone={copy.tone}
          formAction={formAction}
          dataAttributes={{ "data-offer-form": action }}
        >
          <OfferActionResult state={state} />
          <input type="hidden" name="offerId" value={offerId} />
          <input type="hidden" name="action" value={action} />
          <ReasonField id={`${base}-reason`} />
        </ConfirmDialog>
      </Stack>
    </div>
  );
}
