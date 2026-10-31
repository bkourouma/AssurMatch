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
  ConfirmDialog,
  DataTable,
  Field,
  FilterBar,
  Form,
  FormActions,
  Grid,
  Input,
  PageHeader,
  PageStack,
  RadioGroup,
  Select,
  Stack,
  StateMessage,
  StatStrip,
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
  policy_saved: { tone: "info", text: "Durée de conservation enregistrée et auditée." },
  policy_removed: { tone: "info", text: "Surcharge retirée: le niveau suivant (pays, global puis défaut) s'applique de nouveau." },
  preview_created: { tone: "info", text: "Prévisualisation créée: aucune donnée n'a été modifiée. Vérifiez les comptes puis approuvez le lot avant son expiration." },
  erasure_created: { tone: "info", text: "Prévisualisation d'effacement créée: aucune donnée n'a été modifiée. Un lot vide signifie qu'aucune donnée ne correspond." },
  batch_executed: { tone: "success", text: "Lot approuvé et exécuté: les données sélectionnées ont été anonymisées. Les comptes finaux figurent dans le tableau." },
  invalid: { tone: "warning", text: "Saisie incomplète: vérifiez la catégorie, le lot et le motif." },
  invalid_days: { tone: "warning", text: "Durée invalide: saisissez un nombre entier de jours entre 30 et 3650." },
  invalid_reason: { tone: "warning", text: "Motif invalide: au moins 8 caractères et au plus 500." },
  reason_contact: { tone: "warning", text: "Le motif ne doit contenir ni adresse e-mail ni numéro de téléphone: il est conservé durablement comme preuve." },
  invalid_subject: { tone: "warning", text: "Identification invalide: choisissez référence publique ou e-mail et saisissez une valeur valide." },
  forbidden: { tone: "danger", text: "Action refusée: MFA vérifiée et rôle de conformité requis." },
  not_found: { tone: "warning", text: "Lot introuvable." },
  conflict: { tone: "warning", text: "Lot non approuvable: il a expiré, a déjà été exécuté ou a été refusé. Lancez une nouvelle prévisualisation." },
  disabled: {
    tone: "warning",
    text: "Approbation refusée: retention_purge_enabled est désactivé. Le lot a été marqué refusé; après activation par la procédure de conformité, une nouvelle prévisualisation sera nécessaire."
  },
  error: { tone: "danger", text: "Service de rétention temporairement indisponible." }
};

const CATEGORY_LABELS: Record<RetentionSubjectKey, string> = {
  quote_requests: "Demandes de devis et prospects",
  quote_documents: "Documents de devis",
  contact_messages: "Messages de contact",
  partner_applications: "Candidatures partenaires refusées",
  waitlist: "Liste d'attente",
  ai_traces: "Traces IA",
  webhook_payloads: "Contenus des webhooks partenaires",
  messaging_references: "Références de messagerie",
  prospects: "Prospects sans demande",
  satisfaction_feedback: "Avis de satisfaction",
  // Spec 062: provisional durations, pending legal validation (see PROVISIONAL_CATEGORIES).
  lead_message_threads: "Fils de messages courtier/visiteur",
  lead_document_requests: "Demandes de documents",
  data_requests: "Demandes de données personnelles"
};

/** Spec 062: categories whose default duration is provisional until the legal review is done. */
const PROVISIONAL_CATEGORIES = new Set<string>(["lead_message_threads", "lead_document_requests", "data_requests"]);
const PROVISIONAL_NOTE = "durée provisoire, en attente de validation juridique";

const ANCHOR_LABELS: Record<RetentionPolicyItemData["anchor"], string> = {
  last_activity: "Depuis la dernière activité du dossier (devis ou action courtier)",
  created_at: "Depuis la date de création",
  reviewed_at: "Depuis la date de revue de la candidature",
  country_public_since: "Depuis l'ouverture publique du pays",
  occurred_at: "Depuis la date de l'événement IA",
  submitted_at: "Depuis la date de soumission"
};

const SOURCE_LABELS: Record<RetentionPolicyItemData["source"], { tone: Tone; label: string }> = {
  default: { tone: "neutral", label: "Défaut" },
  global: { tone: "info", label: "Surcharge globale" },
  country: { tone: "warning", label: "Surcharge pays" }
};

const STATUS_LABELS: Record<string, { tone: Tone; label: string }> = {
  previewed: { tone: "info", label: "Prévisualisé" },
  executed: { tone: "success", label: "Exécuté" },
  refused: { tone: "danger", label: "Refusé" },
  expired: { tone: "disabled", label: "Expiré" },
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
    {
      key: "category",
      header: "Catégorie",
      render: (item) => (
        <>
          <strong>{CATEGORY_LABELS[item.category] ?? item.category}</strong>
          {PROVISIONAL_CATEGORIES.has(item.category) ? (
            <div data-retention-marker="provisional-duration">
              <Badge tone="warning">Provisoire</Badge> {PROVISIONAL_NOTE}
            </div>
          ) : null}
        </>
      )
    },
    { key: "duration", header: "Durée", render: (item) => `${item.retentionDays} jours`, numeric: true },
    { key: "source", header: "Source", render: (item) => <Badge tone={SOURCE_LABELS[item.source].tone}>{SOURCE_LABELS[item.source].label}</Badge> },
    { key: "anchor", header: "Point de départ", render: (item) => ANCHOR_LABELS[item.anchor] },
    {
      key: "levels",
      header: "Niveaux",
      render: (item) => `défaut ${item.defaultRetentionDays} / global ${item.globalRetentionDays ?? "-"} / pays ${item.countryRetentionDays ?? "-"}`
    },
    {
      key: "lastOverride",
      header: "Dernière surcharge",
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
      render: (batch) => (batch.kind === "erasure" ? `Effacement (${batch.erasureLookup === "email" ? "par e-mail" : "par référence"})` : "Rétention")
    },
    {
      key: "status",
      header: "Statut",
      render: (batch) => (
        <Stack>
          {statusBadge(batch.status)}
          {PARTIAL_STATUSES.has(batch.status) ? (
            <span>Exécution arrêtée: les comptes montrent ce qui a été fait; une nouvelle prévisualisation est nécessaire pour le reste.</span>
          ) : null}
        </Stack>
      )
    },
    { key: "scope", header: "Portée", render: (batch) => (batch.kind === "erasure" ? "Personne" : countryLabel(batch.countryId)) },
    {
      key: "counts",
      header: "Comptes par catégorie",
      render: (batch) =>
        batch.counts.length === 0 ? (
          "Aucune donnée"
        ) : (
          <ul className="bo-list">
            {batch.counts.map((count) => (
              <li key={count.subject}>
                {CATEGORY_LABELS[count.subject]}: {count.selected} sélectionnés
                {batch.status === "executed" || PARTIAL_STATUSES.has(batch.status)
                  ? `, ${count.anonymized} anonymisés, ${count.skipped} ignorés, ${count.failed} en échec`
                  : ""}
                {count.moreRemaining ? " (reste à traiter)" : ""}
              </li>
            ))}
          </ul>
        )
    },
    { key: "total", header: "Total", render: (batch) => batch.totalSelected, numeric: true },
    { key: "remaining", header: "Reste", render: (batch) => (batch.moreRemaining ? <Badge tone="warning">Nouveau lot nécessaire</Badge> : "Non") },
    { key: "createdAt", header: "Créé", render: (batch) => formatDate(batch.createdAt) },
    {
      key: "deadline",
      header: "Expiration / exécution",
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
            <ConfirmDialog
              triggerLabel="Approuver et anonymiser"
              triggerVariant="danger"
              title="Approuver et anonymiser ce lot"
              description={`${batch.totalSelected} élément(s) sélectionné(s) seront anonymisés définitivement. Cette action ne peut pas être annulée.`}
              confirmLabel="Approuver et anonymiser"
              cancelLabel="Annuler"
              tone="danger"
              formAction={approveBatch}
            >
              <input type="hidden" name="batchId" value={batch.id} />
              <Field id={reasonId} label="Motif" required>
                <Input {...fieldControlProps(reasonId, { required: true })} name="reason" minLength={8} maxLength={500} placeholder="Motif de l'approbation" />
              </Field>
            </ConfirmDialog>
          );
        }
        return batch.status === "previewed" ? "Expiré: nouvelle prévisualisation nécessaire" : "-";
      }
    }
  ];

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Conformité", href: "/compliance" }, { label: "Conservation des données" }]}
        title="Conservation et anonymisation"
        description="Durées de conservation, lots d'anonymisation et effacement sur demande. Chaque lot est prévisualisé puis approuvé manuellement avec un motif : aucune purge automatique."
        actions={
          <>
            <Button href="/compliance/data-requests" variant="secondary">Demandes de données des visiteurs</Button>
            <Button href="/compliance" variant="secondary">Retour conformité</Button>
          </>
        }
      />

      {policies.unauthenticated || batches.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {policies.forbidden || batches.forbidden ? (
        <StateMessage tone="danger">Accès refusé: MFA vérifiée et rôle de conformité requis pour la rétention.</StateMessage>
      ) : null}
      {policies.status === "error" || batches.status === "error" ? (
        <StateMessage tone="danger">Rétention indisponible: {policies.error ?? batches.error}</StateMessage>
      ) : null}
      {notice ? <StateMessage tone={notice.tone}>{notice.text}</StateMessage> : null}

      {loaded && !purgeEnabled ? (
        <div data-retention-marker="purge-disabled-notice">
          <StateMessage tone="warning" title="Purge désactivée (retention_purge_enabled)">
            Mode prévisualisation uniquement: les durées se règlent et les lots se prévisualisent, mais toute approbation est refusée et le lot est
            alors marqué refusé. Une fois le flag activé par la procédure de conformité, lancez une nouvelle prévisualisation avant d&apos;approuver.
          </StateMessage>
        </div>
      ) : null}

      {loaded ? (
        <>
          <StatStrip
            label="Synthèse rétention"
            items={[
              { label: "Purge", value: purgeEnabled ? "Active" : "Désactivée", tone: purgeEnabled ? "warning" : "disabled", helper: "retention_purge_enabled" },
              { label: "Lots à approuver", value: openBatches, tone: openBatches > 0 ? "info" : "neutral", helper: "Prévisualisés, non expirés" },
              { label: "Lots récents", value: batchItems.length, helper: "50 derniers lots" }
            ]}
          />

          <Card title="Durées de conservation" description="Priorité: surcharge pays, puis surcharge globale, puis défaut. Bornes: 30 à 3650 jours.">
            <Stack>
              <FilterBar
                action="/compliance/retention"
                label="Portée des durées de conservation"
                submitLabel="Afficher"
                resetLabel="Global"
                resetHref="/compliance/retention"
                activeCount={countryId ? 1 : 0}
                autoSubmit
              >
                <Field id="retention-scope" label="Portée">
                  <Select
                    {...fieldControlProps("retention-scope")}
                    name="countryId"
                    defaultValue={countryId ?? ""}
                    options={[{ value: "", label: "Global" }, ...countrySelectOptions]}
                  />
                </Field>
              </FilterBar>
              <p>
                Portée affichée: <strong>{countryId ? `pays ${countryLabel(countryId)}` : "global"}</strong>.
              </p>
              <DataTable
                columns={policyColumns}
                items={policies.data.items}
                getKey={(item) => item.category}
                emptyLabel="Aucune politique disponible."
                aria-label="Durées de conservation par catégorie"
              />
            </Stack>
          </Card>

          <Grid columns="two">
            <Card
              title="Prévisualiser un lot de rétention"
              description="Sélectionne les données arrivées à échéance (500 au plus par catégorie). Aucune donnée n'est modifiée à cette étape; le lot expire après 24 heures. Les webhooks et références de messagerie ne sont sélectionnés que par une prévisualisation globale."
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
                  legend="Catégories (aucune cochée = toutes)"
                  name="categories"
                  options={RETENTION_CATEGORY_KEYS.map((category) => ({ value: category, label: CATEGORY_LABELS[category] }))}
                />
                <Field id="retention-preview-reason" label="Motif" required>
                  <Input
                    {...fieldControlProps("retention-preview-reason", { required: true })}
                    name="reason"
                    minLength={8}
                    maxLength={500}
                    placeholder="Motif de la prévisualisation"
                  />
                </Field>
                <FormActions>
                  <Button type="submit" variant="secondary">Prévisualiser</Button>
                </FormActions>
              </Form>
            </Card>

            <Card
              title="Prévisualiser un effacement sur demande"
              description="Pour une demande d'effacement reçue par e-mail, téléphone ou courrier. Les durées de conservation ne s'appliquent pas. L'adresse e-mail sert uniquement à la recherche: elle n'est ni enregistrée sur le lot ni affichée sur cette page. Ne recopiez ni e-mail ni téléphone dans le motif."
            >
              <Form action={previewErasure}>
                <RadioGroup
                  legend="Identifier la personne par"
                  name="lookup"
                  defaultValue="public_reference"
                  options={[
                    { value: "public_reference", label: "Référence publique de la demande" },
                    { value: "email", label: "Adresse e-mail" }
                  ]}
                />
                <Field id="retention-erasure-identifier" label="Référence ou e-mail" required>
                  <Input {...fieldControlProps("retention-erasure-identifier", { required: true })} name="identifier" autoComplete="off" maxLength={254} />
                </Field>
                <Field id="retention-erasure-reason" label="Motif" required>
                  <Input
                    {...fieldControlProps("retention-erasure-reason", { required: true })}
                    name="reason"
                    minLength={8}
                    maxLength={500}
                    placeholder="Motif (sans e-mail ni téléphone)"
                  />
                </Field>
                <FormActions>
                  <Button type="submit" variant="secondary">Prévisualiser l&apos;effacement</Button>
                </FormActions>
              </Form>
            </Card>
          </Grid>

          <Card
            title="Lots d'anonymisation"
            description="Comptes et métadonnées uniquement: aucun identifiant de personne n'est affiché. Approuver un lot anonymise définitivement les données sélectionnées."
          >
            <DataTable
              columns={batchColumns}
              items={batchItems}
              getKey={(batch) => batch.id}
              emptyLabel="Aucun lot prévisualisé."
              emptyDescription="Prévisualisez un lot de rétention ou un effacement ci-dessus : il apparaîtra ici pour approbation."
              aria-label="Lots d'anonymisation"
            />
          </Card>
        </>
      ) : null}
    </PageStack>
  );
}
