import { readActivationChecklist, readAdminCountries, readAdminProducts } from "../lib/admin-api";
import { readBackOfficeSession } from "../lib/backoffice-auth";
import { activationControlLabel, canApprovePublicActivation, correctionTarget, formatDate } from "../lib/catalog-messages";
import { ACTIVATION_ATTESTABLE_CONTROLS, type ActivationChecklistControl as ChecklistControl, type ActivationChecklistSection } from "../../../../packages/shared/contracts/activation-checklist.contracts";
import { AttestControlForm, RevokeAttestationForm } from "./attestation-forms";
import {
  Button,
  DataTable,
  Field,
  FilterBar,
  Notice,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  StatStrip,
  StatusBadge,
  checklistStatusTones,
  fieldControlProps
} from "../lib/ui/admin-ui";
import { readFailureDetail } from "../lib/auth-error-messages";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/**
 * Read-only screen. The filters are a GET form and every "Corriger" entry is a plain link to the
 * screen that owns the fix (catalogue, consent texts, quote forms, offers, partners).
 */

/** First failing control that has a screen to fix it, blocked sections first: the operator's next action. */
function nextCorrection(sections: ActivationChecklistSection[], fallbackCountryId: string | undefined) {
  const ordered = [...sections.filter((section) => section.status === "blocked"), ...sections.filter((section) => section.status === "warning")];
  for (const section of ordered) {
    for (const control of section.controls) {
      if (control.status === "passed") continue;
      const target = correctionTarget(control.key, { countryId: section.scope.countryId ?? fallbackCountryId, productId: section.scope.productId });
      if (target) return { href: target.href, label: activationControlLabel(control.key, control.label), section: section.title };
    }
  }
  return undefined;
}

/** Spec 070 PRD 35/36: a manual control is passed by a compliance attestation, never computed. */
function ManualControlAttestation({ control, canAttest }: { control: ChecklistControl; canAttest: boolean }) {
  const target = control.attestationTarget;
  const attestable = target ? (ACTIVATION_ATTESTABLE_CONTROLS[target.scopeType] as Record<string, { minNoteLength: number }>)[target.controlKey] : undefined;
  if (control.attestation) {
    return (
      <div data-attestation="present">
        <strong>Attestation de conformité</strong>
        {` : par ${control.attestation.attestedById.slice(0, 8)} le ${formatDate(control.attestation.attestedAt)} — ${control.attestation.note}`}
        {canAttest && target ? <RevokeAttestationForm target={target} controlLabel={activationControlLabel(control.key, control.label)} /> : null}
      </div>
    );
  }
  if (!target || !attestable) return null;
  return (
    <div data-attestation="missing">
      {canAttest ? (
        <AttestControlForm target={target} minNoteLength={attestable.minNoteLength} controlLabel={activationControlLabel(control.key, control.label)} />
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
  const next = checklist.status === "success" ? nextCorrection(checklist.data.sections as ActivationChecklistSection[], filteredCountryId) : undefined;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Plateforme" }, { label: "Activation" }]}
        title="Checklist technique d'activation"
        description="Vérification lecture seule des préconditions techniques pays, produit, consentement, formulaire, partenaire, licence, offre et flags avant exposition publique."
      />
      <StateMessage tone="warning">
        Cette surface ne modifie aucun flag, pays, produit, partenaire, licence, offre ou formulaire. Elle ne remplace pas le go/no-go conformité, juridique, support ou opérations.
      </StateMessage>

      <FilterBar
        action="/activation-checklist"
        label="Filtres checklist d'activation"
        submitLabel="Filtrer"
        resetLabel="Réinitialiser"
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
      {checklist.forbidden ? <StateMessage tone="danger">Accès checklist refusé pour ce rôle admin ou hors périmètre.</StateMessage> : null}
      {checklist.status === "error" ? (
        <StateMessage tone="danger" title="Checklist indisponible">
          {readFailureDetail(checklist.error)} Les filtres sont conservés : rechargez la page pour réessayer.
        </StateMessage>
      ) : null}

      {checklist.status === "success" ? (
        <>
          <StatStrip
            label="Synthèse checklist activation"
            items={[
              { label: "Prêts techniquement", value: checklist.data.summary.passed, tone: "success" },
              { label: "À surveiller", value: checklist.data.summary.warning, tone: checklist.data.summary.warning > 0 ? "warning" : "neutral" },
              { label: "Bloquants", value: checklist.data.summary.blocked, tone: checklist.data.summary.blocked > 0 ? "danger" : "neutral" }
            ]}
          />

          {checklist.data.summary.blocked > 0 ? (
            <Notice tone="danger" title="Activation bloquée">
              {checklist.data.summary.blocked} élément(s) bloquant(s) : le périmètre ne peut pas être ouvert tant qu&apos;ils ne sont pas corrigés.
              {next ? <> Prochaine action : <a href={next.href}>corriger « {next.label} »</a> ({next.section}).</> : " Ces contrôles se corrigent par une attestation de conformité ou hors de cette interface."}
              {checklist.data.summary.warning > 0 ? ` ${checklist.data.summary.warning} point(s) restent à surveiller.` : ""}
            </Notice>
          ) : checklist.data.summary.warning > 0 ? (
            <Notice tone="warning" title="Aucun blocage, points à surveiller">
              {checklist.data.summary.warning} élément(s) à surveiller avant le go/no-go.
              {next ? <> Prochaine action : <a href={next.href}>vérifier « {next.label} »</a> ({next.section}).</> : null}
            </Notice>
          ) : checklist.data.sections.length > 0 ? (
            <Notice tone="success" title="Préconditions techniques remplies">
              Tous les contrôles techniques sont passés. Le go/no-go conformité, juridique, support et opérations reste à faire.
            </Notice>
          ) : null}

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
                header: "Contrôles",
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
            emptyLabel="Aucune précondition d'activation disponible."
            emptyDescription={activeCount > 0 ? "Aucune section ne correspond au pays ou au produit filtré. Réinitialisez les filtres pour revoir tout le périmètre." : undefined}
            emptyAction={activeCount > 0 ? <Button href="/activation-checklist" variant="secondary" size="sm">Réinitialiser les filtres</Button> : undefined}
            aria-label="Préconditions techniques d'activation"
          />
        </>
      ) : null}
    </PageStack>
  );
}
