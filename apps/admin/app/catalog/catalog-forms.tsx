"use client";

import { useActionState, useId, useState } from "react";
import type { AdminCountryData, AdminProductData, AdminRegulatoryRegimeData } from "../lib/admin-api";
import type { AdminProductCategoryData } from "../lib/lot4-catalog-api";
import {
  changeCountryStatusAction,
  changeProductStatusAction,
  createCountryAction,
  createCountryLinkAction,
  createProductAction,
  createRegimeAction,
  retireCountryLinkAction,
  retireRegimeAction,
  toggleCatalogFlagAction,
  updateCountryAction,
  updateProductAction,
  updateRegimeAction,
  type CatalogActionState
} from "../lib/catalog-actions";
import { allowedCountryStatusTransitions } from "../../../../packages/shared/contracts/country-status-transitions";
import {
  CATEGORY_STATUS_OPTIONS,
  COUNTRY_STATUS_OPTIONS,
  DISCLAIMER_MAX_LENGTH,
  DOCUMENT_KIND_LABELS,
  LANGUAGE_OPTIONS,
  LEGAL_TEXT_MAX_LENGTH,
  PRODUCT_STATUS_OPTIONS,
  REGULATORY_FAMILY_OPTIONS
} from "../lib/catalog-messages";
import { createProductCategoryAction, updateProductCategoryAction } from "../lib/lot4-catalog-actions";
import { quoteDocumentKinds } from "../../../../packages/shared/contracts/quote-document.contracts";
import { CatalogActionResult } from "../lib/ui/catalog-action-result";
import {
  Button,
  Card,
  Checkbox,
  CheckboxGroup,
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
 * Spec 050 (R14): catalogue forms. Pattern A (`useActionState`); flag changes are one submit
 * button per flag, never a `Switch`, so they work without JavaScript. Every form asks for the
 * audited reason ("Motif (audite)", 8 characters minimum).
 */
const initialState: CatalogActionState = { status: "idle" };

export interface SelectChoice {
  value: string;
  label: string;
}

function ReasonField({ id }: { id: string }) {
  return (
    <Field id={id} label="Motif (audité)" required hint="Au moins 8 caractères, conservé dans le journal d'audit.">
      <Input {...fieldControlProps(id, { required: true, hint: "x" })} name="reason" minLength={8} />
    </Field>
  );
}

const languageChoices = LANGUAGE_OPTIONS.map((language) => ({ value: language, label: language === "fr" ? "Français (fr)" : "Anglais (en)" }));
const familyChoices = REGULATORY_FAMILY_OPTIONS.map((family) => ({ value: family, label: family }));

function CountryFields({ country, regimes, ids }: {
  country?: AdminCountryData;
  regimes: SelectChoice[];
  ids: Record<string, string>;
}) {
  return (
    <>
      <Field id={ids.name ?? "name"} label="Nom" required>
        <Input {...fieldControlProps(ids.name ?? "name", { required: true })} name="name" defaultValue={country?.name ?? ""} />
      </Field>
      <Field id={ids.currency ?? "currency"} label="Devise (ISO 4217)" required>
        <Input {...fieldControlProps(ids.currency ?? "currency", { required: true })} name="currency" maxLength={3} defaultValue={country?.currency ?? "XOF"} />
      </Field>
      <CheckboxGroup legend="Langues" name="languages" options={languageChoices} defaultValues={country?.languages ?? ["fr"]} />
      <Field id={ids.timezone ?? "timezone"} label="Fuseau horaire" required>
        <Input {...fieldControlProps(ids.timezone ?? "timezone", { required: true })} name="timezone" defaultValue={country?.timezone ?? "Africa/Abidjan"} />
      </Field>
      <Field id={ids.family ?? "family"} label="Famille réglementaire" required>
        <Select {...fieldControlProps(ids.family ?? "family", { required: true })} name="regulatoryFamily" options={familyChoices} defaultValue={country?.regulatoryFamily ?? "cima"} />
      </Field>
      <Field id={ids.regime ?? "regime"} label="Régime réglementaire">
        <Select {...fieldControlProps(ids.regime ?? "regime")} name="regulatoryRegimeId" defaultValue={country?.regulatoryRegimeId ?? ""}>
          <option value="">Non renseigné</option>
          {regimes.map((regime) => <option key={regime.value} value={regime.value}>{regime.label}</option>)}
        </Select>
      </Field>
      <Field id={ids.dial ?? "dial"} label="Indicatif téléphonique" hint="Par exemple +225. Vide : normalisation générique.">
        <Input {...fieldControlProps(ids.dial ?? "dial", { hint: "x" })} name="phoneDialCode" pattern="\+\d{1,4}" defaultValue={country?.phoneDialCode ?? ""} />
      </Field>
      <Field id={ids.lengths ?? "lengths"} label="Longueurs du numéro national" hint="Chiffres sans indicatif, séparés par des virgules, par exemple 10 ou 8,9.">
        <Input {...fieldControlProps(ids.lengths ?? "lengths", { hint: "x" })} name="phoneNationalLengths" defaultValue={country?.phoneNationalLengths.join(",") ?? ""} />
      </Field>
    </>
  );
}

function useCountryIds() {
  const base = useId();
  return {
    iso: `${base}-iso`,
    name: `${base}-name`,
    currency: `${base}-currency`,
    timezone: `${base}-timezone`,
    family: `${base}-family`,
    regime: `${base}-regime`,
    dial: `${base}-dial`,
    lengths: `${base}-lengths`,
    reason: `${base}-reason`
  };
}

export function CreateCountryForm({ regimes }: { regimes: SelectChoice[] }) {
  const [state, formAction, pending] = useActionState(createCountryAction, initialState);
  const ids = useCountryIds();
  return (
    <Card title="Créer un pays" description="Un pays est toujours créé en brouillon, tous ses flags fermés.">
      <Form action={formAction} data-catalog-form="country-create">
        <CatalogActionResult state={state} />
        <Field id={ids.iso} label="Code ISO (2 lettres)" required>
          <Input {...fieldControlProps(ids.iso, { required: true })} name="isoCode" maxLength={2} pattern="[A-Za-z]{2}" />
        </Field>
        <CountryFields regimes={regimes} ids={ids} />
        <ReasonField id={ids.reason} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer le pays</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function EditCountryForm({ country, regimes }: { country: AdminCountryData; regimes: SelectChoice[] }) {
  const [state, formAction, pending] = useActionState(updateCountryAction, initialState);
  const ids = useCountryIds();
  return (
    <Card title="Fiche pays" description="Le code ISO, le statut et les flags ne se modifient pas ici : ils ont leurs propres actions auditées.">
      <Form action={formAction} data-catalog-form="country-update">
        <CatalogActionResult state={state} scope={{ countryId: country.id }} />
        <input type="hidden" name="countryId" value={country.id} />
        <input type="hidden" name="expectedUpdatedAt" value={country.updatedAt} />
        <CountryFields country={country} regimes={regimes} ids={ids} />
        <ReasonField id={ids.reason} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function CountryStatusForm({ countryId, currentStatus, canApprovePublic }: {
  countryId: string;
  currentStatus: string;
  canApprovePublic: boolean;
}) {
  const [state, formAction, pending] = useActionState(changeCountryStatusAction, initialState);
  const base = useId();
  // Spec 059 follow-up: only the transitions the API accepts (shared graph), e.g. never draft -> pilot.
  const allowed = new Set<string>(allowedCountryStatusTransitions(currentStatus));
  const options = COUNTRY_STATUS_OPTIONS
    .filter((status) => status !== currentStatus && allowed.has(status))
    .filter((status) => status !== "public" || canApprovePublic)
    .map((status) => ({ value: status, label: status }));
  return (
    <Card title="Statut du pays">
      <Form action={formAction} data-catalog-form="country-status">
        <CatalogActionResult state={state} scope={{ countryId }} />
        <input type="hidden" name="countryId" value={countryId} />
        <Field id={`${base}-status`} label="Nouveau statut" required>
          <Select {...fieldControlProps(`${base}-status`, { required: true })} name="status" options={options} />
        </Field>
        <ReasonField id={`${base}-reason`} />
        {canApprovePublic ? (
          <Notice tone="warning">Le statut « public » est refusé tant que la checklist d'activation du pays a un contrôle bloquant.</Notice>
        ) : (
          <p className="bo-description">L'ouverture au public est réservée à la conformité (compliance_admin, super_admin).</p>
        )}
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Changement..." disabled={options.length === 0}>Changer le statut</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

/** Spec 059: product status change (the API accepted it, no screen offered it). */
export function ProductStatusForm({ productId, currentStatus, canApprovePublic }: {
  productId: string;
  currentStatus: string;
  canApprovePublic: boolean;
}) {
  const [state, formAction, pending] = useActionState(changeProductStatusAction, initialState);
  const base = useId();
  const options = PRODUCT_STATUS_OPTIONS
    .filter((status) => status !== currentStatus)
    .filter((status) => status !== "public" || canApprovePublic)
    .map((status) => ({ value: status, label: status }));
  return (
    <Card title="Statut du produit">
      <Form action={formAction} data-catalog-form="product-status">
        <CatalogActionResult state={state} scope={{ productId }} />
        <input type="hidden" name="productId" value={productId} />
        <Field id={`${base}-status`} label="Nouveau statut" required>
          <Select {...fieldControlProps(`${base}-status`, { required: true })} name="status" options={options} />
        </Field>
        <ReasonField id={`${base}-reason`} />
        {canApprovePublic ? (
          <Notice tone="warning">Le statut « public » exige le flag global « Exposition publique du produit » et au moins un pays lié. Le produit est global : une suspension le coupe dans tous les pays.</Notice>
        ) : (
          <p className="bo-description">L&apos;ouverture au public est réservée à la conformité (compliance_admin, super_admin).</p>
        )}
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Changement..." disabled={options.length === 0}>Changer le statut</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

/**
 * One flag, one form, one submit button. `value` is the target value, written explicitly, so the
 * button always does what its label says.
 */
export function FlagToggleForm({ target, countryId, productId, flagKey, label, currentValue }: {
  target: "country" | "product" | "link";
  countryId?: string;
  productId?: string;
  flagKey: string;
  label: string;
  currentValue: boolean;
}) {
  const [state, formAction, pending] = useActionState(toggleCatalogFlagAction, initialState);
  const base = useId();
  const nextValue = !currentValue;
  return (
    <Form action={formAction} data-catalog-flag-form={flagKey}>
      <CatalogActionResult state={state} scope={{ countryId, productId }} />
      <input type="hidden" name="target" value={target} />
      {countryId ? <input type="hidden" name="countryId" value={countryId} /> : null}
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}
      <input type="hidden" name="key" value={flagKey} />
      <input type="hidden" name="value" value={String(nextValue)} />
      <Field id={`${base}-reason`} label="Motif (audité)" required>
        <Input {...fieldControlProps(`${base}-reason`, { required: true })} name="reason" minLength={8} />
      </Field>
      <FormActions>
        <Button type="submit" size="sm" variant={nextValue ? "primary" : "secondary"} pending={pending} pendingLabel="Envoi...">
          {nextValue ? `Activer : ${label}` : `Désactiver : ${label}`}
        </Button>
      </FormActions>
    </Form>
  );
}

export function CreateCountryLinkForm({ countryId, products }: { countryId: string; products: SelectChoice[] }) {
  const [state, formAction, pending] = useActionState(createCountryLinkAction, initialState);
  const base = useId();
  return (
    <Card title="Lier un produit" description="La liaison est créée en statut interne, tous ses flags fermés et la revue manuelle active.">
      <Form action={formAction} data-catalog-form="link-create">
        <CatalogActionResult state={state} scope={{ countryId }} />
        <input type="hidden" name="countryId" value={countryId} />
        <Field id={`${base}-product`} label="Produit" required>
          <Select {...fieldControlProps(`${base}-product`, { required: true })} name="productId" options={products} placeholder="Choisir un produit" />
        </Field>
        <ReasonField id={`${base}-reason`} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Liaison..." disabled={products.length === 0}>Lier le produit</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function RetireCountryLinkForm({ countryId, productId, productName }: { countryId: string; productId: string; productName: string }) {
  const [state, formAction] = useActionState(retireCountryLinkAction, initialState);
  const base = useId();
  return (
    <div>
      <CatalogActionResult state={state} scope={{ countryId, productId }} />
      <ConfirmDialog
        triggerLabel="Retirer la liaison"
        title={`Retirer ${productName} de ce pays`}
        description="Le produit n'est plus proposé dans ce pays. L'historique de la liaison est conservé."
        confirmLabel="Retirer"
        cancelLabel="Annuler"
        tone="danger"
        formAction={formAction}
        dataAttributes={{ "data-catalog-form": "link-retire" }}
      >
        <CatalogActionResult state={state} scope={{ countryId, productId }} />
        <input type="hidden" name="countryId" value={countryId} />
        <input type="hidden" name="productId" value={productId} />
        <Field id={`${base}-reason`} label="Motif (audité)" required>
          <Input {...fieldControlProps(`${base}-reason`, { required: true })} name="reason" minLength={8} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

const sensitivityChoices = [
  { value: "standard", label: "standard" },
  { value: "sensitive", label: "sensitive" },
  { value: "highly_sensitive", label: "highly_sensitive" }
];

const documentKindChoices = quoteDocumentKinds.map((kind) => ({ value: kind, label: DOCUMENT_KIND_LABELS[kind] ?? kind }));

/** Textarea with a live character counter against the contract limit (the API stays the authority). */
function CountedTextarea({ id, name, label, maxLength, defaultValue }: { id: string; name: string; label: string; maxLength: number; defaultValue: string }) {
  const [length, setLength] = useState(defaultValue.length);
  return (
    <Field id={id} label={label} hint={`${length} / ${maxLength} caractères`}>
      <Textarea
        {...fieldControlProps(id, { hint: "x" })}
        name={name}
        rows={4}
        maxLength={maxLength}
        defaultValue={defaultValue}
        onChange={(event) => setLength(event.currentTarget.value.length)}
      />
    </Field>
  );
}

function ProductFields({ product, base, categories }: { product?: AdminProductData; base: string; categories: SelectChoice[] }) {
  return (
    <>
      <Field id={`${base}-name`} label="Nom" required>
        <Input {...fieldControlProps(`${base}-name`, { required: true })} name="name" defaultValue={product?.name ?? ""} />
      </Field>
      <Field id={`${base}-description`} label="Description">
        <Textarea {...fieldControlProps(`${base}-description`)} name="description" rows={2} defaultValue={product?.description ?? ""} />
      </Field>
      <Field id={`${base}-sensitivity`} label="Sensibilité" required>
        <Select {...fieldControlProps(`${base}-sensitivity`, { required: true })} name="sensitivity" options={sensitivityChoices} defaultValue={product?.sensitivity ?? "standard"} />
      </Field>
      <Field id={`${base}-category`} label="Catégorie" hint="Seules les catégories actives sont proposées. Une catégorie déjà rattachée se remplace, elle ne se retire pas.">
        <Select {...fieldControlProps(`${base}-category`, { hint: "x" })} name="categoryId" defaultValue={product?.categoryId ?? ""}>
          <option value="">Aucune</option>
          {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
        </Select>
      </Field>
      <Checkbox id={`${base}-documents`} name="requiresDocuments" label="Documents requis" defaultChecked={product?.requiresDocuments ?? false} />
      <CheckboxGroup
        legend="Types de documents demandés au visiteur"
        name="requiredDocumentKinds"
        options={documentKindChoices}
        defaultValues={product?.requiredDocumentKinds ?? []}
      />
      <fieldset className="bo-fieldset" data-product-legal-notice="true">
        <legend>Textes légaux affichés au visiteur</legend>
        <CountedTextarea id={`${base}-legal-fr`} name="legalText_fr" label="Texte légal (français)" maxLength={LEGAL_TEXT_MAX_LENGTH} defaultValue={product?.legalNotice?.fr?.legalText ?? ""} />
        <CountedTextarea id={`${base}-disclaimer-fr`} name="disclaimer_fr" label="Avertissement (français)" maxLength={DISCLAIMER_MAX_LENGTH} defaultValue={product?.legalNotice?.fr?.disclaimer ?? ""} />
        <CountedTextarea id={`${base}-legal-en`} name="legalText_en" label="Texte légal (anglais)" maxLength={LEGAL_TEXT_MAX_LENGTH} defaultValue={product?.legalNotice?.en?.legalText ?? ""} />
        <CountedTextarea id={`${base}-disclaimer-en`} name="disclaimer_en" label="Avertissement (anglais)" maxLength={DISCLAIMER_MAX_LENGTH} defaultValue={product?.legalNotice?.en?.disclaimer ?? ""} />
      </fieldset>
      <Checkbox
        id={`${base}-review`}
        name="requiresManualReview"
        label="Revue manuelle requise"
        hint="Pour un produit sensible, seule la conformité peut lever la revue manuelle."
        defaultChecked={product?.requiresManualReview ?? true}
      />
    </>
  );
}

export function CreateProductForm({ categories = [] }: { categories?: SelectChoice[] }) {
  const [state, formAction, pending] = useActionState(createProductAction, initialState);
  const base = useId();
  return (
    <Card title="Créer un produit" description="Un produit est toujours créé en brouillon, tous ses flags fermés.">
      <Form action={formAction} data-catalog-form="product-create">
        <CatalogActionResult state={state} />
        <Field id={`${base}-key`} label="Clé technique" required hint="Minuscules, par exemple auto ou voyage. Non modifiable ensuite.">
          <Input {...fieldControlProps(`${base}-key`, { required: true, hint: "x" })} name="key" pattern="[a-z0-9_\-]+" />
        </Field>
        <ProductFields base={base} categories={categories} />
        <ReasonField id={`${base}-reason`} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer le produit</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function EditProductForm({ product, categories = [] }: { product: AdminProductData; categories?: SelectChoice[] }) {
  const [state, formAction, pending] = useActionState(updateProductAction, initialState);
  const base = useId();
  return (
    <Card title="Fiche produit" description="La clé et les flags ne se modifient pas ici : les flags ont leurs propres actions auditées.">
      <Form action={formAction} data-catalog-form="product-update">
        <CatalogActionResult state={state} scope={{ productId: product.id }} />
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="expectedUpdatedAt" value={product.updatedAt} />
        <ProductFields product={product} base={base} categories={categories} />
        <ReasonField id={`${base}-reason`} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

const regimeStatusChoices = [
  { value: "draft", label: "draft" },
  { value: "active", label: "active" },
  { value: "suspended", label: "suspended" }
];

function RegimeFields({ regime, base }: { regime?: AdminRegulatoryRegimeData; base: string }) {
  return (
    <>
      <Field id={`${base}-name`} label="Nom" required>
        <Input {...fieldControlProps(`${base}-name`, { required: true })} name="name" defaultValue={regime?.name ?? ""} />
      </Field>
      <Field id={`${base}-description`} label="Description">
        <Textarea {...fieldControlProps(`${base}-description`)} name="description" rows={2} defaultValue={regime?.description ?? ""} />
      </Field>
      <Field id={`${base}-years`} label="Durée de conservation spécifique (années)">
        <Input {...fieldControlProps(`${base}-years`)} name="retentionOverrideYears" type="number" min={1} max={30} defaultValue={regime?.retentionOverrideYears ?? ""} />
      </Field>
      <Field id={`${base}-status`} label="Statut" required>
        <Select {...fieldControlProps(`${base}-status`, { required: true })} name="status" options={regimeStatusChoices} defaultValue={regime?.status === "retired" ? "draft" : regime?.status ?? "draft"} />
      </Field>
      <Checkbox
        id={`${base}-review`}
        name="requiresManualActivationReview"
        label="Revue manuelle avant activation"
        defaultChecked={regime?.requiresManualActivationReview ?? false}
      />
    </>
  );
}

export function CreateRegimeForm() {
  const [state, formAction, pending] = useActionState(createRegimeAction, initialState);
  const base = useId();
  return (
    <Card title="Créer un régime">
      <Form action={formAction} data-catalog-form="regime-create">
        <CatalogActionResult state={state} />
        <Field id={`${base}-key`} label="Clé" required hint="Unique, non modifiable ensuite (par exemple cima_ci).">
          <Input {...fieldControlProps(`${base}-key`, { required: true, hint: "x" })} name="key" />
        </Field>
        <RegimeFields base={base} />
        <ReasonField id={`${base}-reason`} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer le régime</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function EditRegimeForm({ regime }: { regime: AdminRegulatoryRegimeData }) {
  const [state, formAction, pending] = useActionState(updateRegimeAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-catalog-form="regime-update">
      <CatalogActionResult state={state} />
      <input type="hidden" name="regimeId" value={regime.id} />
      <input type="hidden" name="expectedUpdatedAt" value={regime.updatedAt} />
      <RegimeFields regime={regime} base={base} />
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer</Button>
      </FormActions>
    </Form>
  );
}

export function RetireRegimeForm({ regime }: { regime: AdminRegulatoryRegimeData }) {
  const [state, formAction] = useActionState(retireRegimeAction, initialState);
  const base = useId();
  return (
    <div>
      <CatalogActionResult state={state} />
      <ConfirmDialog
        triggerLabel="Retirer le régime"
        title={`Retirer le régime ${regime.key}`}
        description="Le retrait est refusé tant qu'un pays référence ce régime."
        confirmLabel="Retirer"
        cancelLabel="Annuler"
        tone="danger"
        formAction={formAction}
        dataAttributes={{ "data-catalog-form": "regime-retire" }}
      >
        <CatalogActionResult state={state} />
        <input type="hidden" name="regimeId" value={regime.id} />
        <Field id={`${base}-reason`} label="Motif (audité)" required>
          <Input {...fieldControlProps(`${base}-reason`, { required: true })} name="reason" minLength={8} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

/* --- Spec 070 PROD-001: product categories --- */

function CategoryFields({ category, base }: { category?: AdminProductCategoryData; base: string }) {
  return (
    <>
      <Field id={`${base}-name`} label="Nom (français)" required>
        <Input {...fieldControlProps(`${base}-name`, { required: true })} name="name" maxLength={120} defaultValue={category?.name ?? ""} />
      </Field>
      <Field id={`${base}-name-en`} label="Nom (anglais)">
        <Input {...fieldControlProps(`${base}-name-en`)} name="nameEn" maxLength={120} defaultValue={category?.nameEn ?? ""} />
      </Field>
      <Field id={`${base}-description`} label="Description">
        <Textarea {...fieldControlProps(`${base}-description`)} name="description" rows={2} maxLength={1000} defaultValue={category?.description ?? ""} />
      </Field>
      <Field id={`${base}-sort`} label="Ordre d'affichage" hint="Entier de 0 à 10000, les plus petits d'abord.">
        <Input {...fieldControlProps(`${base}-sort`, { hint: "x" })} name="sortOrder" type="number" min={0} max={10000} defaultValue={category?.sortOrder ?? 0} />
      </Field>
    </>
  );
}

export function CreateCategoryForm() {
  const [state, formAction, pending] = useActionState(createProductCategoryAction, initialState);
  const base = useId();
  return (
    <Card title="Créer une catégorie" description="Une catégorie est créée en brouillon : activez-la ensuite pour pouvoir la choisir sur un produit.">
      <Form action={formAction} data-catalog-form="category-create">
        <CatalogActionResult state={state} />
        <Field id={`${base}-key`} label="Clé technique" required hint="Minuscules et tirets, par exemple auto-moto. Non modifiable ensuite.">
          <Input {...fieldControlProps(`${base}-key`, { required: true, hint: "x" })} name="key" pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={2} maxLength={64} />
        </Field>
        <CategoryFields base={base} />
        <ReasonField id={`${base}-reason`} />
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Création...">Créer la catégorie</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function EditCategoryForm({ category }: { category: AdminProductCategoryData }) {
  const [state, formAction, pending] = useActionState(updateProductCategoryAction, initialState);
  const base = useId();
  return (
    <Form action={formAction} data-catalog-form="category-update">
      <CatalogActionResult state={state} />
      <input type="hidden" name="categoryId" value={category.id} />
      <input type="hidden" name="expectedUpdatedAt" value={category.updatedAt} />
      <CategoryFields category={category} base={base} />
      <Field id={`${base}-status`} label="Statut" required hint={category.productCount > 0 ? `Retrait refusé tant que ${category.productCount} produit(s) y sont rattachés.` : "Brouillon, active ou retirée."}>
        <Select {...fieldControlProps(`${base}-status`, { required: true, hint: "x" })} name="status" options={[...CATEGORY_STATUS_OPTIONS]} defaultValue={category.status} />
      </Field>
      <ReasonField id={`${base}-reason`} />
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Enregistrement...">Enregistrer</Button>
      </FormActions>
    </Form>
  );
}
