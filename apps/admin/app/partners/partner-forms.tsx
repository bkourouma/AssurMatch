"use client";

import { useActionState, useId } from "react";
import { useRouter } from "next/navigation";
import type {
  AdminPartnerDetailData,
  AdminPartnerDocumentData,
  AdminPartnerLicenseData,
  AdminWriteBlocker
} from "../lib/admin-api";
import {
  authorizePartnerScopeAction,
  changePartnerStatusAction,
  createPartnerAction,
  createPartnerLicenseAction,
  invitePartnerUserAction,
  partnerLicenseAction,
  recordPartnerContractAction,
  renewPartnerLicenseAction,
  reviewPartnerDocumentAction,
  updatePartnerAction,
  withdrawPartnerScopeAction,
  type PartnerActionState
} from "../lib/partner-actions";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_OPTIONS,
  PARTNER_CAPACITY_LABELS,
  PARTNER_CAPACITY_OPTIONS,
  PARTNER_PLAN_LABELS,
  PARTNER_PLAN_OPTIONS,
  PARTNER_SENSITIVE_TRANSITIONS,
  PARTNER_TRANSITION_LABELS,
  PARTNER_USER_ROLE_LABELS,
  UPLOAD_CSRF_HEADER,
  inviteRoleOptions,
  ownerRoleForPlan,
  partnerBlockerHref,
  partnerStatusLabel
} from "../lib/partner-messages";
import {
  Button,
  Card,
  CheckboxGroup,
  Cluster,
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

/**
 * Spec 051 US7: partner page forms. Pattern A (`useActionState` + server actions of
 * `lib/partner-actions.ts`); every form asks for the audited reason ("Motif (audite)", 8
 * characters minimum). The session token never reaches this file: the document upload posts to
 * the admin route handler `/partners/:id/documents`, which forwards it server side.
 */
const initialState: PartnerActionState = { status: "idle" };

export interface SelectChoice {
  value: string;
  label: string;
}

interface PartnerRef {
  id: string;
  countryId: string | null;
}

export function PartnerBlockers({ blockers, partner }: { blockers: AdminWriteBlocker[]; partner?: PartnerRef | undefined }) {
  return (
    <ul className="bo-list" data-partner-blockers="true" aria-label="Conditions d'activation non remplies">
      {blockers.map((blocker) => {
        const href = partner ? partnerBlockerHref(blocker.control, partner) : undefined;
        return (
          <li key={`${blocker.section}:${blocker.control}`}>
            <strong>{blocker.label || blocker.control}</strong>
            {blocker.evidence ? <> : {blocker.evidence}</> : null}
            {href ? <> — <a href={href}>Corriger</a></> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function PartnerActionResult({ state, partner }: { state: PartnerActionState; partner?: PartnerRef | undefined }) {
  if (state.status === "idle") return null;
  const blockers = state.blockers ?? [];
  return (
    <Notice tone={state.status === "success" ? "success" : "danger"}>
      {state.message ? <p>{state.message}</p> : null}
      {blockers.length > 0 ? <PartnerBlockers blockers={blockers} partner={partner} /> : null}
      {state.token ? (
        <p>
          Jeton d&apos;activation à usage unique, à transmettre par un canal interne sécurisé : <code>{state.token}</code>
        </p>
      ) : null}
      {state.expiresAt ? <p>Expire le {new Date(state.expiresAt).toISOString().slice(0, 16).replace("T", " ")}</p> : null}
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

/* ------------------------------------------------------------------------------ identity */

const planChoices = PARTNER_PLAN_OPTIONS.map((plan) => ({ value: plan, label: PARTNER_PLAN_LABELS[plan] }));
const capacityChoices = PARTNER_CAPACITY_OPTIONS.map((capacity) => ({ value: capacity, label: PARTNER_CAPACITY_LABELS[capacity] ?? capacity }));

function IdentityFields({ partner, countries, base, creating }: {
  partner?: AdminPartnerDetailData;
  countries: SelectChoice[];
  base: string;
  creating: boolean;
}) {
  return (
    <>
      <FormSection legend="Identité">
        <Field id={`${base}-legal`} label="Raison sociale" required>
          <Input {...fieldControlProps(`${base}-legal`, { required: true })} name="legalName" minLength={2} defaultValue={partner?.legalName ?? ""} />
        </Field>
        <Field id={`${base}-trade`} label="Nom commercial">
          <Input {...fieldControlProps(`${base}-trade`)} name="tradeName" defaultValue={partner?.tradeName ?? ""} />
        </Field>
        <Field id={`${base}-country`} label="Pays principal" required={creating}>
          <Select {...fieldControlProps(`${base}-country`, { required: creating })} name="countryId" defaultValue={partner?.countryId ?? ""}>
            <option value="">{creating ? "Choisir un pays" : "Inchangé"}</option>
            {countries.map((country) => <option key={country.value} value={country.value}>{country.label}</option>)}
          </Select>
        </Field>
        <Field id={`${base}-city`} label="Ville">
          <Input {...fieldControlProps(`${base}-city`)} name="city" defaultValue={partner?.city ?? ""} />
        </Field>
        <Field id={`${base}-rccm`} label="Numéro RCCM" hint="Un doublon dans le même pays est refusé.">
          <Input {...fieldControlProps(`${base}-rccm`, { hint: "x" })} name="registrationNumber" defaultValue={partner?.registrationNumber ?? ""} />
        </Field>
      </FormSection>
      <FormSection legend="Contacts">
        <Field id={`${base}-email`} label="E-mail principal" required={creating}>
          <Input {...fieldControlProps(`${base}-email`, { required: creating })} name="primaryEmail" type="email" defaultValue={partner?.primaryEmail ?? ""} />
        </Field>
        <Field id={`${base}-whatsapp`} label="WhatsApp principal (E.164)" required={creating}>
          <Input {...fieldControlProps(`${base}-whatsapp`, { required: creating })} name="primaryWhatsApp" placeholder="+2250700000000" defaultValue={partner?.primaryWhatsApp ?? ""} />
        </Field>
        <Field id={`${base}-admin-name`} label="Contact administratif">
          <Input {...fieldControlProps(`${base}-admin-name`)} name="adminContactName" defaultValue={partner?.adminContactName ?? ""} />
        </Field>
        <Field id={`${base}-admin-email`} label="E-mail administratif">
          <Input {...fieldControlProps(`${base}-admin-email`)} name="adminContactEmail" type="email" defaultValue={partner?.adminContactEmail ?? ""} />
        </Field>
        <Field id={`${base}-admin-phone`} label="Téléphone administratif (E.164)">
          <Input {...fieldControlProps(`${base}-admin-phone`)} name="adminContactPhone" defaultValue={partner?.adminContactPhone ?? ""} />
        </Field>
        <Field id={`${base}-com-name`} label="Contact commercial">
          <Input {...fieldControlProps(`${base}-com-name`)} name="commercialContactName" defaultValue={partner?.commercialContactName ?? ""} />
        </Field>
        <Field id={`${base}-com-email`} label="E-mail commercial">
          <Input {...fieldControlProps(`${base}-com-email`)} name="commercialContactEmail" type="email" defaultValue={partner?.commercialContactEmail ?? ""} />
        </Field>
        <Field id={`${base}-com-phone`} label="Téléphone commercial (E.164)">
          <Input {...fieldControlProps(`${base}-com-phone`)} name="commercialContactPhone" defaultValue={partner?.commercialContactPhone ?? ""} />
        </Field>
      </FormSection>
      <FormSection legend="Exploitation">
        <Field id={`${base}-insurers`} label="Assureurs partenaires" hint="Un assureur par ligne ou séparés par des virgules (20 au maximum).">
          <Textarea {...fieldControlProps(`${base}-insurers`, { hint: "x" })} name="partnerInsurers" rows={2} defaultValue={partner?.partnerInsurers.join("\n") ?? ""} />
        </Field>
        <Field id={`${base}-plan`} label="Plan" required>
          <Select {...fieldControlProps(`${base}-plan`, { required: true })} name="plan" options={planChoices} defaultValue={partner?.plan ?? "starter"} />
        </Field>
        <Field id={`${base}-quota`} label="Quota mensuel de leads">
          <Input {...fieldControlProps(`${base}-quota`)} name="quotaMonthlyLeads" type="number" min={0} max={100000} defaultValue={partner?.quotaMonthlyLeads ?? 0} />
        </Field>
        <Field id={`${base}-capacity`} label="Capacité">
          <Select {...fieldControlProps(`${base}-capacity`)} name="capacityStatus" options={capacityChoices} defaultValue={partner?.capacityStatus ?? "available"} />
        </Field>
        <Field id={`${base}-sla`} label="Objectif SLA contractuel (minutes)" hint="Délai de première action, entre 5 et 10 080 minutes.">
          <Input {...fieldControlProps(`${base}-sla`, { hint: "x" })} name="slaTargetMinutes" type="number" min={5} max={10080} defaultValue={partner?.slaTargetMinutes ?? ""} />
        </Field>
      </FormSection>
    </>
  );
}

export function CreatePartnerForm({ countries }: { countries: SelectChoice[] }) {
  const [state, formAction, pending] = useActionState(createPartnerAction, initialState);
  const base = useId();
  return (
    <Card title="Créer un courtier" description="Un courtier est toujours créé en Prospect : aucune visibilité publique, aucun routage.">
      <Form action={formAction} data-partner-form="create">
        <PartnerActionResult state={state} />
        <IdentityFields countries={countries} base={base} creating />
        <ReasonField id={`${base}-reason`} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer le courtier</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function EditPartnerForm({ partner, countries }: { partner: AdminPartnerDetailData; countries: SelectChoice[] }) {
  const [state, formAction, pending] = useActionState(updatePartnerAction, initialState);
  const base = useId();
  return (
    <Card title="Fiche d'identité" description="Le statut ne se modifie pas ici : il a ses propres actions auditées.">
      <Form action={formAction} data-partner-form="update">
        <PartnerActionResult state={state} partner={partner} />
        <input type="hidden" name="partnerId" value={partner.id} />
        <input type="hidden" name="expectedUpdatedAt" value={partner.updatedAt} />
        <IdentityFields partner={partner} countries={countries} base={base} creating={false} />
        <ReasonField id={`${base}-reason`} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

/* -------------------------------------------------------------------------------- status */

/**
 * One form per allowed transition. Suspension and termination are confirmed in a dialog; every
 * transition except "send to compliance review" is reserved to compliance (R13).
 */
export function PartnerStatusTransitionForm({ partner, target }: { partner: PartnerRef; target: string }) {
  const [state, formAction, pending] = useActionState(changePartnerStatusAction, initialState);
  const base = useId();
  const label = PARTNER_TRANSITION_LABELS[target] ?? `Passer en ${partnerStatusLabel(target)}`;
  const fields = (
    <>
      <input type="hidden" name="partnerId" value={partner.id} />
      <input type="hidden" name="status" value={target} />
      <ReasonField id={`${base}-reason`} />
    </>
  );
  if (PARTNER_SENSITIVE_TRANSITIONS.has(target)) {
    return (
      <div data-partner-transition={target}>
        <PartnerActionResult state={state} partner={partner} />
        <ConfirmDialog
          triggerLabel={label}
          triggerVariant="danger"
          title={label}
          description={target === "retired"
            ? "La résiliation est définitive : les utilisateurs du courtier perdent leur accès et ses leads ne sont plus routés."
            : "Le courtier n'est plus routé ; ses utilisateurs passent en consultation seule jusqu'à la réactivation."}
          confirmLabel={label}
          cancelLabel="Annuler"
          tone="danger"
          formAction={formAction}
          dataAttributes={{ "data-partner-form": `status-${target}` }}
        >
          <PartnerActionResult state={state} partner={partner} />
          {fields}
        </ConfirmDialog>
      </div>
    );
  }
  return (
    <Form action={formAction} data-partner-form={`status-${target}`} data-partner-transition={target}>
      <PartnerActionResult state={state} partner={partner} />
      {fields}
      <FormActions>
        <Button type="submit" size="sm" pending={pending} pendingLabel="Changement...">{label}</Button>
      </FormActions>
    </Form>
  );
}

/* ------------------------------------------------------------------------------ licences */

function LicenseFields({ base, products, license, countries }: {
  base: string;
  products: SelectChoice[];
  license?: AdminPartnerLicenseData;
  countries?: SelectChoice[];
}) {
  return (
    <>
      <Field id={`${base}-number`} label="Numéro de licence" required>
        <Input {...fieldControlProps(`${base}-number`, { required: true })} name="licenseNumber" minLength={3} />
      </Field>
      <Field id={`${base}-authority`} label="Autorité de délivrance" required>
        <Input {...fieldControlProps(`${base}-authority`, { required: true })} name="issuingAuthority" minLength={2} defaultValue={license?.issuingAuthority ?? ""} />
      </Field>
      {countries ? (
        <Field id={`${base}-country`} label="Pays" required>
          <Select {...fieldControlProps(`${base}-country`, { required: true })} name="countryId" options={countries} placeholder="Choisir un pays" />
        </Field>
      ) : null}
      <CheckboxGroup
        legend="Produits couverts (aucun coché = tous les produits du pays)"
        name="productIds"
        options={products.map((product) => ({ value: product.value, label: product.label }))}
        defaultValues={license?.productIds ?? []}
      />
      <Field id={`${base}-effective`} label="Date d'effet" required>
        <Input {...fieldControlProps(`${base}-effective`, { required: true })} name="effectiveDate" type="date" />
      </Field>
      <Field id={`${base}-expiration`} label="Date d'expiration" required>
        <Input {...fieldControlProps(`${base}-expiration`, { required: true })} name="expirationDate" type="date" />
      </Field>
    </>
  );
}

export function CreateLicenseForm({ partnerId, countries, products }: { partnerId: string; countries: SelectChoice[]; products: SelectChoice[] }) {
  const [state, formAction, pending] = useActionState(createPartnerLicenseAction, initialState);
  const base = useId();
  return (
    <Card title="Enregistrer une licence" description="La licence est créée en brouillon ; seule la conformité la valide, preuve d'agrément acceptée à l'appui.">
      <Form action={formAction} data-partner-form="license-create">
        <PartnerActionResult state={state} />
        <input type="hidden" name="partnerId" value={partnerId} />
        <LicenseFields base={base} products={products} countries={countries} />
        <ReasonField id={`${base}-reason`} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer la licence</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function RenewLicenseForm({ partnerId, license, products }: { partnerId: string; license: AdminPartnerLicenseData; products: SelectChoice[] }) {
  const [state, formAction] = useActionState(renewPartnerLicenseAction, initialState);
  const base = useId();
  return (
    <div>
      <PartnerActionResult state={state} />
      <ConfirmDialog
        triggerLabel="Renouveler"
        title={`Renouveler la licence ${license.licenseNumber}`}
        description="Une nouvelle licence en brouillon référence l'ancienne ; l'ancienne est remplacée quand la conformité valide la nouvelle."
        confirmLabel="Enregistrer le renouvellement"
        cancelLabel="Annuler"
        formAction={formAction}
        dataAttributes={{ "data-partner-form": "license-renew" }}
      >
        <PartnerActionResult state={state} />
        <input type="hidden" name="partnerId" value={partnerId} />
        <input type="hidden" name="licenseId" value={license.id} />
        <LicenseFields base={base} products={products} license={license} />
        <ReasonField id={`${base}-reason`} />
      </ConfirmDialog>
    </div>
  );
}

const LICENSE_ACTION_LABELS = {
  validate: { label: "Valider", description: "Exige une preuve d'agrément acceptée et saine rattachée à la licence, et une date d'expiration future." },
  suspend: { label: "Suspendre", description: "Le courtier devient inéligible sur le périmètre de cette licence." },
  revoke: { label: "Révoquer", description: "La révocation est définitive pour cette licence." }
} as const;

/** Compliance only (rendered by the page for compliance_admin and super_admin). */
export function LicenseActionForm({ partnerId, licenseId, action }: { partnerId: string; licenseId: string; action: "validate" | "suspend" | "revoke" }) {
  const [state, formAction] = useActionState(partnerLicenseAction, initialState);
  const base = useId();
  const copy = LICENSE_ACTION_LABELS[action];
  return (
    <div data-compliance-only="license">
      <PartnerActionResult state={state} />
      <ConfirmDialog
        triggerLabel={copy.label}
        triggerVariant={action === "validate" ? "primary" : "danger"}
        title={`${copy.label} la licence`}
        description={copy.description}
        confirmLabel={copy.label}
        cancelLabel="Annuler"
        tone={action === "validate" ? "primary" : "danger"}
        formAction={formAction}
        dataAttributes={{ "data-partner-form": `license-${action}` }}
      >
        <PartnerActionResult state={state} />
        <input type="hidden" name="partnerId" value={partnerId} />
        <input type="hidden" name="licenseId" value={licenseId} />
        <input type="hidden" name="action" value={action} />
        <ReasonField id={`${base}-reason`} />
      </ConfirmDialog>
    </div>
  );
}

/* ----------------------------------------------------------------------------- documents */

async function postDocument(partnerId: string, formData: FormData): Promise<PartnerActionState> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 8) return { status: "error", message: "Motif obligatoire : au moins 8 caractères, conservé dans l'audit." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choisissez un fichier (PDF, JPEG ou PNG)." };
  if (file.size > DOCUMENT_MAX_BYTES) return { status: "error", message: "Fichier trop volumineux : 5 Mo au maximum." };
  try {
    // Same-origin admin route handler: it adds the session token server side.
    const response = await fetch(`/partners/${encodeURIComponent(partnerId)}/documents`, {
      method: "POST",
      body: formData,
      headers: { [UPLOAD_CSRF_HEADER]: "1" },
      credentials: "same-origin"
    });
    const payload = await response.json().catch(() => undefined) as { status?: string; message?: string } | undefined;
    if (response.ok) return { status: "success", message: payload?.message ?? "Document déposé." };
    if (response.status === 413) return { status: "error", message: "Fichier trop volumineux : 5 Mo au maximum." };
    return { status: "error", message: payload?.message ?? `Téléversement refusé (${response.status}).` };
  } catch {
    return { status: "error", message: "Téléversement interrompu : réessayez dans quelques instants." };
  }
}

export function UploadDocumentForm({ partnerId, licenses }: { partnerId: string; licenses: SelectChoice[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(async (_previous: PartnerActionState, formData: FormData) => {
    const result = await postDocument(partnerId, formData);
    if (result.status === "success") router.refresh();
    return result;
  }, initialState);
  const base = useId();
  const typeChoices = DOCUMENT_TYPE_OPTIONS.map((type) => ({ value: type, label: DOCUMENT_TYPE_LABELS[type] ?? type }));
  return (
    <Card title="Téléverser un document" description="PDF, JPEG ou PNG, 5 Mo au maximum. Chaque fichier est analysé ; un fichier infecté est mis en quarantaine.">
      <Form action={formAction} data-partner-form="document-upload" encType="multipart/form-data">
        <PartnerActionResult state={state} />
        <Field id={`${base}-file`} label="Fichier" required>
          <Input {...fieldControlProps(`${base}-file`, { required: true })} name="file" type="file" accept={DOCUMENT_ACCEPT} />
        </Field>
        <Field id={`${base}-type`} label="Type de document" required>
          <Select {...fieldControlProps(`${base}-type`, { required: true })} name="documentType" options={typeChoices} placeholder="Choisir un type" />
        </Field>
        <Field id={`${base}-license`} label="Licence rattachée" hint="Obligatoire pour une preuve d'agrément.">
          <Select {...fieldControlProps(`${base}-license`, { hint: "x" })} name="licenseId" defaultValue="">
            <option value="">Aucune</option>
            {licenses.map((license) => <option key={license.value} value={license.value}>{license.label}</option>)}
          </Select>
        </Field>
        <Field id={`${base}-expiration`} label="Date d'expiration du document">
          <Input {...fieldControlProps(`${base}-expiration`)} name="expirationDate" type="date" />
        </Field>
        <ReasonField id={`${base}-reason`} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Téléversement...">Téléverser</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

/** Compliance only; a quarantined or unscanned document is never offered for acceptance. */
export function ReviewDocumentForm({ partnerId, document }: { partnerId: string; document: AdminPartnerDocumentData }) {
  const [state, formAction] = useActionState(reviewPartnerDocumentAction, initialState);
  const base = useId();
  const canAccept = document.scanStatus === "clean" && !document.quarantined;
  return (
    <div data-compliance-only="document-review">
      <PartnerActionResult state={state} />
      <Cluster>
        {canAccept ? (
          <ConfirmDialog
            triggerLabel="Accepter"
            triggerVariant="primary"
            title="Accepter le document"
            description="Le document devient une preuve d'agrément recevable."
            confirmLabel="Accepter"
            cancelLabel="Annuler"
            formAction={formAction}
            dataAttributes={{ "data-partner-form": "document-accept" }}
          >
            <input type="hidden" name="partnerId" value={partnerId} />
            <input type="hidden" name="documentId" value={document.id} />
            <input type="hidden" name="decision" value="accepted" />
            <ReasonField id={`${base}-accept-reason`} />
          </ConfirmDialog>
        ) : null}
        <ConfirmDialog
          triggerLabel="Refuser"
          triggerVariant="danger"
          title="Refuser le document"
          description="Le document n'est plus pris en compte comme preuve d'agrément."
          confirmLabel="Refuser"
          cancelLabel="Annuler"
          tone="danger"
          formAction={formAction}
          dataAttributes={{ "data-partner-form": "document-reject" }}
        >
          <input type="hidden" name="partnerId" value={partnerId} />
          <input type="hidden" name="documentId" value={document.id} />
          <input type="hidden" name="decision" value="rejected" />
          <ReasonField id={`${base}-reject-reason`} />
        </ConfirmDialog>
      </Cluster>
    </div>
  );
}

/* ------------------------------------------------------------------------------ contract */

export function RecordContractForm({ partnerId, documents }: { partnerId: string; documents: SelectChoice[] }) {
  const [state, formAction, pending] = useActionState(recordPartnerContractAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-partner-form="contract-record">
      <PartnerActionResult state={state} />
      <input type="hidden" name="partnerId" value={partnerId} />
      <Field id={`${base}-version`} label="Version" required>
        <Input {...fieldControlProps(`${base}-version`, { required: true })} name="version" maxLength={32} placeholder="v1" />
      </Field>
      <Field id={`${base}-signed`} label="Date de signature" required>
        <Input {...fieldControlProps(`${base}-signed`, { required: true })} name="signedAt" type="date" />
      </Field>
      <Field id={`${base}-signatory`} label="Signataire pour le courtier" required>
        <Input {...fieldControlProps(`${base}-signatory`, { required: true })} name="signatoryName" minLength={2} />
      </Field>
      <Field id={`${base}-document`} label="Document du contrat signé" required hint="Document de type contrat de partenariat, analysé sain.">
        <Select {...fieldControlProps(`${base}-document`, { required: true, hint: "x" })} name="documentId" options={documents} placeholder="Choisir un document" />
      </Field>
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Enregistrement..." disabled={documents.length === 0}>Enregistrer le contrat</Button>
      </FormActions>
    </Form>
  );
}

/* ------------------------------------------------------------------------------ coverage */

export function AuthorizeScopeForm({ partnerId, scope, options }: { partnerId: string; scope: "country" | "product"; options: SelectChoice[] }) {
  const [state, formAction, pending] = useActionState(authorizePartnerScopeAction, initialState);
  const base = useId();
  const label = scope === "country" ? "Pays" : "Produit";
  return (
    <Form action={formAction} data-partner-form={`authorize-${scope}`}>
      <PartnerActionResult state={state} />
      <input type="hidden" name="partnerId" value={partnerId} />
      <input type="hidden" name="scope" value={scope} />
      <Field id={`${base}-scope`} label={label} required hint={scope === "country" ? "Une licence du courtier pour ce pays est exigée." : undefined}>
        <Select {...fieldControlProps(`${base}-scope`, { required: true, ...(scope === "country" ? { hint: "x" } : {}) })} name="scopeId" options={options} placeholder={`Choisir un ${label.toLowerCase()}`} />
      </Field>
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" size="sm" pending={pending} pendingLabel="Autorisation..." disabled={options.length === 0}>{`Autoriser ce ${label.toLowerCase()}`}</Button>
      </FormActions>
    </Form>
  );
}

export function WithdrawScopeForm({ partnerId, scope, scopeId, label }: { partnerId: string; scope: "country" | "product"; scopeId: string; label: string }) {
  const [state, formAction] = useActionState(withdrawPartnerScopeAction, initialState);
  const base = useId();
  return (
    <div>
      <PartnerActionResult state={state} />
      <ConfirmDialog
        triggerLabel="Retirer"
        title={`Retirer l'autorisation : ${label}`}
        description="Le courtier n'est plus routé sur ce périmètre. L'historique de l'autorisation est conservé."
        confirmLabel="Retirer"
        cancelLabel="Annuler"
        tone="danger"
        formAction={formAction}
        dataAttributes={{ "data-partner-form": `withdraw-${scope}` }}
      >
        <PartnerActionResult state={state} />
        <input type="hidden" name="partnerId" value={partnerId} />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="scopeId" value={scopeId} />
        <ReasonField id={`${base}-reason`} />
      </ConfirmDialog>
    </div>
  );
}

/* --------------------------------------------------------------------------------- users */

export function InviteUserForm({ partnerId, plan }: { partnerId: string; plan: string }) {
  const [state, formAction, pending] = useActionState(invitePartnerUserAction, initialState);
  const base = useId();
  const owner = ownerRoleForPlan(plan);
  const roles = inviteRoleOptions(plan).map((role) => ({ value: role, label: PARTNER_USER_ROLE_LABELS[role] ?? role }));
  return (
    <Form action={formAction} data-partner-form="user-invite">
      <PartnerActionResult state={state} />
      <input type="hidden" name="partnerId" value={partnerId} />
      <Field id={`${base}-email`} label="E-mail" required>
        <Input {...fieldControlProps(`${base}-email`, { required: true })} name="email" type="email" />
      </Field>
      <Field id={`${base}-name`} label="Nom affiché" required>
        <Input {...fieldControlProps(`${base}-name`, { required: true })} name="displayName" minLength={2} />
      </Field>
      <Field id={`${base}-role`} label="Rôle courtier" required hint={`Rôle propriétaire du plan : ${PARTNER_USER_ROLE_LABELS[owner] ?? owner}.`}>
        <Select {...fieldControlProps(`${base}-role`, { required: true, hint: "x" })} name="role" options={roles} defaultValue={owner} />
      </Field>
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Invitation...">Inviter et émettre l&apos;activation</Button>
      </FormActions>
    </Form>
  );
}
