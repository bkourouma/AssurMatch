import { readActivationChecklist, readAdminCountries, readAdminProducts } from "../lib/admin-api";
import { correctionTarget } from "../lib/catalog-messages";
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
export default async function ActivationChecklistPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
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
                            <StatusBadge status={control.status} tones={checklistStatusTones} /> {control.label}: {control.evidence}
                            {target ? <> — <a href={target.href}>Corriger</a></> : null}
                            {target?.note ? <> ({target.note})</> : null}
                          </li>
                        );
                      })}
                    </ul>
                  )
                }
              ]}
              items={checklist.data.sections}
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
