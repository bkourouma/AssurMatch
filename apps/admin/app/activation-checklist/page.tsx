import { readActivationChecklist, readAdminCountries, readAdminProducts } from "../lib/admin-api";
import { readBackOfficeSession } from "../lib/backoffice-auth";
import { activationControlLabel, canApprovePublicActivation, correctionTarget, formatDate } from "../lib/catalog-messages";
import { ACTIVATION_ATTESTABLE_CONTROLS, type ActivationChecklistControl as ChecklistControl, type ActivationChecklistSection } from "../../../../packages/shared/contracts/activation-checklist.contracts";
import { AttestControlForm, RevokeAttestationForm } from "./attestation-forms";
import {
  Card,
  DataTable,
  Field,
  FilterBar,
  Grid,
  KpiCard,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  StatusBadge,
  checklistStatusTones,
  fieldControlProps
} from "../lib/ui/admin-ui";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/**
 * Read-only screen. The filters are a GET form and every "Corriger" entry is a plain link to the
 * screen that owns the fix (catalogue, consent texts, quote forms, offers, partners).
 */

/** Spec 070 PRD 35/36: a manual control is passed by a compliance attestation, never computed. */
function ManualControlAttestation({ control, canAttest }: { control: ChecklistControl; canAttest: boolean }) {
  const target = control.attestationTarget;
  const attestable = target ? (ACTIVATION_ATTESTABLE_CONTROLS[target.scopeType] as Record<string, { minNoteLength: number }>)[target.controlKey] : undefined;
  if (control.attestation) {
    return (
      <div data-attestation="present">
        <strong>Attestation de conformité</strong>
        {` : par ${control.attestation.attestedById.slice(0, 8)} le ${formatDate(control.attestation.attestedAt)} — ${control.attestation.note}`}
        {canAttest && target ? <RevokeAttestationForm target={target} /> : null}
      </div>
    );
  }
  if (!target || !attestable) return null;
  return (
    <div data-attestation="missing">
      {canAttest ? (
        <AttestControlForm target={target} minNoteLength={attestable.minNoteLength} />
      ) : (
        <span className="bo-description">Attestation manuelle requise, réservée à la conformité (compliance_admin, super_admin).</span>
      )}
    </div>
  );
}

export default async function ActivationChecklistPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const session = await readBackOfficeSession();
  const canAttest = session.status === "authenticated" && canApprovePublicActivation(session.profile.roles);
  const countryFilter = firstParam(params.country).toUpperCase();
  const productFilter = firstParam(params.product);
  const [checklist, countries, products] = await Promise.all([
    readActivationChecklist({ ...(countryFilter ? { country: countryFilter } : {}), ...(productFilter ? { product: productFilter } : {}) }),
    readAdminCountries(),
    readAdminProducts()
  ]);
  const filteredCountryId = countryFilter ? countries.data.find((country) => country.isoCode === countryFilter)?.id : undefined;
  const activeCount = (countryFilter ? 1 : 0) + (productFilter ? 1 : 0);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Plateforme" }, { label: "Activation" }]}
        kicker="Activation controlee"
        title="Checklist technique d'activation"
        description="Verification lecture seule des preconditions techniques pays, produit, consentement, formulaire, partenaire, licence, offre et flags avant exposition publique."
      />

      <FilterBar
        action="/activation-checklist"
        label="Filtres checklist d'activation"
        submitLabel="Filtrer"
        resetLabel="Reinitialiser"
        resetHref="/activation-checklist"
        activeCount={activeCount}
        autoSubmit
      >
        <Field id="checklist-country" label="Pays">
          <Select {...fieldControlProps("checklist-country")} name="country" defaultValue={countryFilter}>
            <option value="">Tous</option>
            {countries.data.map((country) => <option key={country.id} value={country.isoCode}>{`${country.isoCode} - ${country.name}`}</option>)}
          </Select>
        </Field>
        <Field id="checklist-product" label="Produit">
          <Select {...fieldControlProps("checklist-product")} name="product" defaultValue={productFilter}>
            <option value="">Tous</option>
            {products.data.map((product) => <option key={product.id} value={product.key}>{`${product.key} - ${product.name}`}</option>)}
          </Select>
        </Field>
      </FilterBar>

      {checklist.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {checklist.forbidden ? <StateMessage tone="danger">Acces checklist refuse pour ce role admin ou hors perimetre.</StateMessage> : null}
      {checklist.status === "error" ? <StateMessage tone="danger">Checklist indisponible: {checklist.error}</StateMessage> : null}

      {checklist.status === "success" ? (
        <>
          <Grid columns="kpi" as="section" aria-label="Synthese checklist activation">
            <KpiCard label="Prets techniquement" value={checklist.data.summary.passed} tone="success" />
            <KpiCard label="A surveiller" value={checklist.data.summary.warning} tone="warning" />
            <KpiCard label="Bloquants" value={checklist.data.summary.blocked} tone="danger" />
          </Grid>

          <Card>
            <DataTable
              columns={[
                { key: "section", header: "Section", render: (section) => <strong>{section.title}</strong> },
                { key: "status", header: "Statut", render: (section) => <StatusBadge status={section.status} tones={checklistStatusTones} /> },
                {
                  key: "scope",
                  header: "Scope",
                  render: (section) => [
                    section.scope.countryCode,
                    section.scope.productKey,
                    section.scope.partnerId
                  ].filter(Boolean).join(" / ") || "global"
                },
                {
                  key: "controls",
                  header: "Controles",
                  render: (section) => (
                    <ul className="bo-list">
                      {section.controls.map((control) => {
                        const target = control.status === "passed"
                          ? undefined
                          : correctionTarget(control.key, {
                            countryId: section.scope.countryId ?? filteredCountryId,
                            productId: section.scope.productId
                          });
                        return (
                          <li key={control.key}>
                            <StatusBadge status={control.status} tones={checklistStatusTones} /> {activationControlLabel(control.key, control.label)}: {control.evidence}
                            {target ? <> — <a href={target.href}>Corriger</a></> : null}
                            {target?.note ? <> ({target.note})</> : null}
                            {control.manual ? <ManualControlAttestation control={control} canAttest={canAttest} /> : null}
                          </li>
                        );
                      })}
                    </ul>
                  )
                }
              ]}
              items={checklist.data.sections as ActivationChecklistSection[]}
              getKey={(section) => section.key}
              emptyLabel="Aucune precondition d'activation disponible."
              aria-label="Preconditions techniques d'activation"
            />
          </Card>

          <StateMessage tone="warning">
            Cette surface ne modifie aucun flag, pays, produit, partenaire, licence, offre ou formulaire. Elle ne remplace pas le go/no-go conformite, juridique, support ou operations.
          </StateMessage>
        </>
      ) : null}
    </PageStack>
  );
}
