import {
  readRetentionBatches,
  readRetentionPolicies,
  RETENTION_CATEGORY_KEYS,
  type RetentionBatchData,
  type RetentionPolicyItemData,
  type RetentionSubjectKey
} from "../../lib/admin-api";
import { approveBatch, previewErasure, previewRetention, removePolicyOverride, savePolicyOverride } from "../../lib/retention-actions";
import {
  Badge,
  Button,
  Card,
  CheckboxGroup,
  DataTable,
  Field,
  FilterBar,
  Form,
  FormActions,
  Grid,
  Input,
  KpiCard,
  PageHeader,
  PageStack,
  RadioGroup,
  Select,
  Stack,
  StateMessage,
  fieldControlProps,
  type DataTableColumn,
  type NoticeTone,
  type Tone
} from "../../lib/ui/admin-ui";

/**
 * Spec 046 (FR-012, D2, D3): retention policies, previews and approvals. The API returns
 * metadata and counts only; this page renders no personal data and never echoes an erasure e-mail.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RETENTION_NOTICES: Record<string, { tone: NoticeTone; text: string }> = {
  policy_saved: { tone: "info", text: "Duree de conservation enregistree et auditee." },
  policy_removed: { tone: "info", text: "Surcharge retiree: le niveau suivant (pays, global puis defaut) s'applique de nouveau." },
  preview_created: { tone: "info", text: "Previsualisation creee: aucune donnee n'a ete modifiee. Verifiez les comptes puis approuvez le lot avant son expiration." },
  erasure_created: { tone: "info", text: "Previsualisation d'effacement creee: aucune donnee n'a ete modifiee. Un lot vide signifie qu'aucune donnee ne correspond." },
  batch_executed: { tone: "success", text: "Lot approuve et execute: les donnees selectionnees ont ete anonymisees. Les comptes finaux figurent dans le tableau." },
  invalid: { tone: "warning", text: "Saisie incomplete: verifiez la categorie, le lot et le motif." },
  invalid_days: { tone: "warning", text: "Duree invalide: saisissez un nombre entier de jours entre 30 et 3650." },
  invalid_reason: { tone: "warning", text: "Motif invalide: au moins 8 caracteres et au plus 500." },
  reason_contact: { tone: "warning", text: "Le motif ne doit contenir ni adresse e-mail ni numero de telephone: il est conserve durablement comme preuve." },
  invalid_subject: { tone: "warning", text: "Identification invalide: choisissez reference publique ou e-mail et saisissez une valeur valide." },
  forbidden: { tone: "danger", text: "Action refusee: MFA verifiee et role de conformite requis." },
  not_found: { tone: "warning", text: "Lot introuvable." },
  conflict: { tone: "warning", text: "Lot non approuvable: il a expire, a deja ete execute ou a ete refuse. Lancez une nouvelle previsualisation." },
  disabled: {
    tone: "warning",
    text: "Approbation refusee: retention_purge_enabled est desactive. Le lot a ete marque refuse; apres activation par la procedure de conformite, une nouvelle previsualisation sera necessaire."
  },
  error: { tone: "danger", text: "Service de retention temporairement indisponible." }
};

const CATEGORY_LABELS: Record<RetentionSubjectKey, string> = {
  quote_requests: "Demandes de devis et prospects",
  quote_documents: "Documents de devis",
  contact_messages: "Messages de contact",
  partner_applications: "Candidatures partenaires refusees",
  waitlist: "Liste d'attente",
  ai_traces: "Traces IA",
  webhook_payloads: "Contenus des webhooks partenaires",
  messaging_references: "References de messagerie",
  prospects: "Prospects sans demande"
};

const ANCHOR_LABELS: Record<RetentionPolicyItemData["anchor"], string> = {
  last_activity: "Depuis la derniere activite du dossier (devis ou action courtier)",
  created_at: "Depuis la date de creation",
  reviewed_at: "Depuis la date de revue de la candidature",
  country_public_since: "Depuis l'ouverture publique du pays",
  occurred_at: "Depuis la date de l'evenement IA"
};

const SOURCE_LABELS: Record<RetentionPolicyItemData["source"], { tone: Tone; label: string }> = {
  default: { tone: "neutral", label: "Defaut" },
  global: { tone: "info", label: "Surcharge globale" },
  country: { tone: "warning", label: "Surcharge pays" }
};

const STATUS_LABELS: Record<string, { tone: Tone; label: string }> = {
  previewed: { tone: "info", label: "Previsualise" },
  executed: { tone: "success", label: "Execute" },
  refused: { tone: "danger", label: "Refuse" },
  expired: { tone: "disabled", label: "Expire" },
  interrupted: { tone: "warning", label: "Interrompu" }
};

/** Statuses of an approval stopped mid-execution: the counts show what was done, the rest needs a new preview. */
const PARTIAL_STATUSES = new Set(["interrupted"]);

function statusBadge(status: string) {
  const known = STATUS_LABELS[status];
  return <Badge tone={known?.tone ?? "neutral"}>{known?.label ?? status}</Badge>;
}

function formatDate(value: string | null): string {
  return value ? value.slice(0, 16).replace("T", " ") : "-";
}

function isApprovable(batch: RetentionBatchData, now: number): boolean {
  return batch.status === "previewed" && Date.parse(batch.previewExpiresAt) > now;
}

function currentTime(): number {
  return Date.now();
}

export default async function DataRetentionPage({ searchParams }: { searchParams: Promise<{ retention?: string; countryId?: string }> }) {
  const params = await searchParams;
  const notice = params.retention ? RETENTION_NOTICES[params.retention] : undefined;
  const countryId = params.countryId && UUID.test(params.countryId) ? params.countryId : undefined;
  const [policies, batches] = await Promise.all([readRetentionPolicies(countryId), readRetentionBatches()]);
  const now = currentTime();

  const countryOptions = policies.data.countries ?? [];
  const countries = new Map(countryOptions.map((country) => [country.id, country.isoCode]));
  const countryLabel = (id: string | null) => (id ? countries.get(id) ?? id.slice(0, 8) : "Global");
  const countrySelectOptions = countryOptions.map((country) => ({ value: country.id, label: `${country.isoCode} - ${country.name}` }));
  const purgeEnabled = policies.status === "success" ? policies.data.purgeEnabled : batches.data.purgeEnabled;
  const loaded = policies.status === "success" || batches.status === "success";
  const batchItems = batches.status === "success" ? batches.data.items : [];
  const openBatches = batchItems.filter((batch) => isApprovable(batch, now)).length;

  const policyColumns: Array<DataTableColumn<RetentionPolicyItemData>> = [
    { key: "category", header: "Categorie", render: (item) => <strong>{CATEGORY_LABELS[item.category]}</strong> },
    { key: "duration", header: "Duree", render: (item) => `${item.retentionDays} jours`, numeric: true },
    { key: "source", header: "Source", render: (item) => <Badge tone={SOURCE_LABELS[item.source].tone}>{SOURCE_LABELS[item.source].label}</Badge> },
    { key: "anchor", header: "Point de depart", render: (item) => ANCHOR_LABELS[item.anchor] },
    {
      key: "levels",
      header: "Niveaux",
      render: (item) => `defaut ${item.defaultRetentionDays} / global ${item.globalRetentionDays ?? "-"} / pays ${item.countryRetentionDays ?? "-"}`
    },
    {
      key: "lastOverride",
      header: "Derniere surcharge",
      render: (item) =>
        item.overrideUpdatedAt ? <span className="bo-break">{`${formatDate(item.overrideUpdatedAt)} - ${item.overrideReason ?? ""}`}</span> : "-"
    },
    {
      key: "override",
      header: countryId ? "Surcharge pays" : "Surcharge globale",
      render: (item) => {
        const current = countryId ? item.countryRetentionDays : item.globalRetentionDays;
        const daysId = `retention-days-${item.category}`;
        const reasonId = `retention-reason-${item.category}`;
        return (
          <Form action={savePolicyOverride}>
            <input type="hidden" name="category" value={item.category} />
            {countryId ? <input type="hidden" name="countryId" value={countryId} /> : null}
            <Field id={daysId} label="Jours" required>
              <Input
                {...fieldControlProps(daysId, { required: true })}
                name="retentionDays"
                type="number"
                min={30}
                max={3650}
                step={1}
                defaultValue={current ?? item.retentionDays}
              />
            </Field>
            <Field id={reasonId} label="Motif" required>
              <Input {...fieldControlProps(reasonId, { required: true })} name="reason" minLength={8} maxLength={500} placeholder="Motif de la modification" />
            </Field>
            <FormActions align="start">
              <Button type="submit" variant="secondary" size="sm">Enregistrer</Button>
              {current !== null ? (
                <Button type="submit" formAction={removePolicyOverride} variant="tertiary" size="sm">Retirer la surcharge</Button>
              ) : null}
            </FormActions>
          </Form>
        );
      }
    }
  ];

  const batchColumns: Array<DataTableColumn<RetentionBatchData>> = [
    {
      key: "kind",
      header: "Type",
      render: (batch) => (batch.kind === "erasure" ? `Effacement (${batch.erasureLookup === "email" ? "par e-mail" : "par reference"})` : "Retention")
    },
    {
      key: "status",
      header: "Statut",
      render: (batch) => (
        <Stack>
          {statusBadge(batch.status)}
          {PARTIAL_STATUSES.has(batch.status) ? (
            <span>Execution arretee: les comptes montrent ce qui a ete fait; une nouvelle previsualisation est necessaire pour le reste.</span>
          ) : null}
        </Stack>
      )
    },
    { key: "scope", header: "Portee", render: (batch) => (batch.kind === "erasure" ? "Personne" : countryLabel(batch.countryId)) },
    {
      key: "counts",
      header: "Comptes par categorie",
      render: (batch) =>
        batch.counts.length === 0 ? (
          "Aucune donnee"
        ) : (
          <ul className="bo-list">
            {batch.counts.map((count) => (
              <li key={count.subject}>
                {CATEGORY_LABELS[count.subject]}: {count.selected} selectionnes
                {batch.status === "executed" || PARTIAL_STATUSES.has(batch.status)
                  ? `, ${count.anonymized} anonymises, ${count.skipped} ignores, ${count.failed} en echec`
                  : ""}
                {count.moreRemaining ? " (reste a traiter)" : ""}
              </li>
            ))}
          </ul>
        )
    },
    { key: "total", header: "Total", render: (batch) => batch.totalSelected, numeric: true },
    { key: "remaining", header: "Reste", render: (batch) => (batch.moreRemaining ? <Badge tone="warning">Nouveau lot necessaire</Badge> : "Non") },
    { key: "createdAt", header: "Cree", render: (batch) => formatDate(batch.createdAt) },
    {
      key: "deadline",
      header: "Expiration / execution",
      render: (batch) => (batch.status === "previewed" ? formatDate(batch.previewExpiresAt) : formatDate(batch.executedAt ?? batch.approvedAt))
    },
    { key: "reason", header: "Motif", render: (batch) => <span className="bo-break">{batch.approvalReason ?? batch.reason}</span> },
    {
      key: "approval",
      header: "Approbation",
      render: (batch) => {
        if (isApprovable(batch, now)) {
          const reasonId = `retention-approve-${batch.id}`;
          return (
            <Form action={approveBatch}>
              <input type="hidden" name="batchId" value={batch.id} />
              <Field id={reasonId} label="Motif" required>
                <Input {...fieldControlProps(reasonId, { required: true })} name="reason" minLength={8} maxLength={500} placeholder="Motif de l'approbation" />
              </Field>
              <FormActions align="start">
                <Button type="submit" variant="danger" size="sm">Approuver et anonymiser</Button>
              </FormActions>
            </Form>
          );
        }
        return batch.status === "previewed" ? "Expire: nouvelle previsualisation necessaire" : "-";
      }
    }
  ];

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Conformite", href: "/compliance" }, { label: "Conservation des donnees" }]}
        kicker="Conformite"
        title="Conservation et anonymisation"
        description="Durees de conservation par categorie, previsualisation des lots d'anonymisation et effacement sur demande. Chaque lot est d'abord previsualise, puis approuve manuellement avec un motif: aucune purge automatique."
        actions={<Button href="/compliance" variant="secondary">Retour conformite</Button>}
      />

      {policies.unauthenticated || batches.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {policies.forbidden || batches.forbidden ? (
        <StateMessage tone="danger">Acces refuse: MFA verifiee et role de conformite requis pour la retention.</StateMessage>
      ) : null}
      {policies.status === "error" || batches.status === "error" ? (
        <StateMessage tone="danger">Retention indisponible: {policies.error ?? batches.error}</StateMessage>
      ) : null}
      {notice ? <StateMessage tone={notice.tone}>{notice.text}</StateMessage> : null}

      {loaded && !purgeEnabled ? (
        <div data-retention-marker="purge-disabled-notice">
          <StateMessage tone="warning" title="Purge desactivee (retention_purge_enabled)">
            Mode previsualisation uniquement: les durees se reglent et les lots se previsualisent, mais toute approbation est refusee et le lot est
            alors marque refuse. Une fois le flag active par la procedure de conformite, lancez une nouvelle previsualisation avant d&apos;approuver.
          </StateMessage>
        </div>
      ) : null}

      {loaded ? (
        <>
          <Grid columns="kpi" as="section" aria-label="Synthese retention">
            <KpiCard label="Purge" value={purgeEnabled ? "Active" : "Desactivee"} tone={purgeEnabled ? "warning" : "disabled"} helper="retention_purge_enabled" />
            <KpiCard label="Lots a approuver" value={openBatches} tone={openBatches > 0 ? "info" : "neutral"} helper="Previsualises, non expires" />
            <KpiCard label="Lots recents" value={batchItems.length} helper="50 derniers lots" />
          </Grid>

          <Card title="Durees de conservation" description="Priorite: surcharge pays, puis surcharge globale, puis defaut. Bornes: 30 a 3650 jours.">
            <Stack>
              <FilterBar
                action="/compliance/retention"
                label="Portee des durees de conservation"
                submitLabel="Afficher"
                resetLabel="Global"
                resetHref="/compliance/retention"
                activeCount={countryId ? 1 : 0}
                autoSubmit
              >
                <Field id="retention-scope" label="Portee">
                  <Select
                    {...fieldControlProps("retention-scope")}
                    name="countryId"
                    defaultValue={countryId ?? ""}
                    options={[{ value: "", label: "Global" }, ...countrySelectOptions]}
                  />
                </Field>
              </FilterBar>
              <p>
                Portee affichee: <strong>{countryId ? `pays ${countryLabel(countryId)}` : "global"}</strong>.
              </p>
              <DataTable
                columns={policyColumns}
                items={policies.data.items}
                getKey={(item) => item.category}
                emptyLabel="Aucune politique disponible."
                aria-label="Durees de conservation par categorie"
              />
            </Stack>
          </Card>

          <Grid columns="two">
            <Card
              title="Previsualiser un lot de retention"
              description="Selectionne les donnees arrivees a echeance (500 au plus par categorie). Aucune donnee n'est modifiee a cette etape; le lot expire apres 24 heures. Les webhooks et references de messagerie ne sont selectionnes que par une previsualisation globale."
            >
              <Form action={previewRetention}>
                <Field id="retention-preview-country" label="Pays (optionnel)">
                  <Select
                    {...fieldControlProps("retention-preview-country")}
                    name="countryId"
                    defaultValue=""
                    options={[{ value: "", label: "Tous les pays" }, ...countrySelectOptions]}
                  />
                </Field>
                <CheckboxGroup
                  legend="Categories (aucune cochee = toutes)"
                  name="categories"
                  options={RETENTION_CATEGORY_KEYS.map((category) => ({ value: category, label: CATEGORY_LABELS[category] }))}
                />
                <Field id="retention-preview-reason" label="Motif" required>
                  <Input
                    {...fieldControlProps("retention-preview-reason", { required: true })}
                    name="reason"
                    minLength={8}
                    maxLength={500}
                    placeholder="Motif de la previsualisation"
                  />
                </Field>
                <FormActions>
                  <Button type="submit" variant="secondary">Previsualiser</Button>
                </FormActions>
              </Form>
            </Card>

            <Card
              title="Previsualiser un effacement sur demande"
              description="Pour une demande d'effacement recue par e-mail, telephone ou courrier. Les durees de conservation ne s'appliquent pas. L'adresse e-mail sert uniquement a la recherche: elle n'est ni enregistree sur le lot ni affichee sur cette page. Ne recopiez ni e-mail ni telephone dans le motif."
            >
              <Form action={previewErasure}>
                <RadioGroup
                  legend="Identifier la personne par"
                  name="lookup"
                  defaultValue="public_reference"
                  options={[
                    { value: "public_reference", label: "Reference publique de la demande" },
                    { value: "email", label: "Adresse e-mail" }
                  ]}
                />
                <Field id="retention-erasure-identifier" label="Reference ou e-mail" required>
                  <Input {...fieldControlProps("retention-erasure-identifier", { required: true })} name="identifier" autoComplete="off" maxLength={254} />
                </Field>
                <Field id="retention-erasure-reason" label="Motif" required>
                  <Input
                    {...fieldControlProps("retention-erasure-reason", { required: true })}
                    name="reason"
                    minLength={8}
                    maxLength={500}
                    placeholder="Motif (sans e-mail ni telephone)"
                  />
                </Field>
                <FormActions>
                  <Button type="submit" variant="secondary">Previsualiser l&apos;effacement</Button>
                </FormActions>
              </Form>
            </Card>
          </Grid>

          <Card
            title="Lots d'anonymisation"
            description="Comptes et metadonnees uniquement: aucun identifiant de personne n'est affiche. Approuver un lot anonymise definitivement les donnees selectionnees."
          >
            <DataTable
              columns={batchColumns}
              items={batchItems}
              getKey={(batch) => batch.id}
              emptyLabel="Aucun lot previsualise."
              aria-label="Lots d'anonymisation"
            />
          </Card>
        </>
      ) : null}
    </PageStack>
  );
}
