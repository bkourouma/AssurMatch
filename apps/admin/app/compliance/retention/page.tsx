import {
  readRetentionBatches,
  readRetentionPolicies,
  RETENTION_CATEGORY_KEYS,
  type RetentionBatchData,
  type RetentionPolicyItemData,
  type RetentionSubjectKey
} from "../../lib/admin-api";
import { approveBatch, previewErasure, previewRetention, removePolicyOverride, savePolicyOverride } from "../../lib/retention-actions";
import { Badge, Card, DataTable, KpiCard, PageHeader, StateMessage, type Tone } from "../../lib/ui/admin-ui";

/**
 * Spec 046 (FR-012, D2, D3): retention policies, previews and approvals. The API returns
 * metadata and counts only; this page renders no personal data and never echoes an erasure e-mail.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RETENTION_NOTICES: Record<string, { tone: Tone; text: string }> = {
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
  const countrySelectOptions = countryOptions.map((country) => (
    <option key={country.id} value={country.id}>{`${country.isoCode} - ${country.name}`}</option>
  ));
  const purgeEnabled = policies.status === "success" ? policies.data.purgeEnabled : batches.data.purgeEnabled;
  const loaded = policies.status === "success" || batches.status === "success";
  const batchItems = batches.status === "success" ? batches.data.items : [];
  const openBatches = batchItems.filter((batch) => isApprovable(batch, now)).length;

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Conformite"
        title="Conservation et anonymisation"
        description="Durees de conservation par categorie, previsualisation des lots d'anonymisation et effacement sur demande. Chaque lot est d'abord previsualise, puis approuve manuellement avec un motif: aucune purge automatique."
        actions={<a className="button button--secondary" href="/compliance">Retour conformite</a>}
      />

      {policies.unauthenticated || batches.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {policies.forbidden || batches.forbidden ? <StateMessage tone="danger">Acces refuse: MFA verifiee et role de conformite requis pour la retention.</StateMessage> : null}
      {policies.status === "error" || batches.status === "error" ? <StateMessage tone="danger">Retention indisponible: {policies.error ?? batches.error}</StateMessage> : null}
      {notice ? <StateMessage tone={notice.tone}>{notice.text}</StateMessage> : null}

      {loaded && !purgeEnabled ? (
        <div data-retention-marker="purge-disabled-notice">
          <StateMessage tone="warning" title="Purge desactivee (retention_purge_enabled)">
            Mode previsualisation uniquement: les durees se reglent et les lots se previsualisent, mais toute approbation est refusee et le lot est
            alors marque refuse. Une fois le flag active par la procedure de conformite, lancez une nouvelle previsualisation avant d'approuver.
          </StateMessage>
        </div>
      ) : null}

      {loaded ? (
        <>
          <section className="admin-grid admin-grid--kpi" aria-label="Synthese retention">
            <KpiCard label="Purge" value={purgeEnabled ? "Active" : "Desactivee"} tone={purgeEnabled ? "warning" : "disabled"} helper="retention_purge_enabled" />
            <KpiCard label="Lots a approuver" value={openBatches} tone={openBatches > 0 ? "info" : "neutral"} helper="Previsualises, non expires" />
            <KpiCard label="Lots recents" value={batchItems.length} helper="50 derniers lots" />
          </section>

          <Card>
            <h2 className="section-title">Durees de conservation</h2>
            <form method="get" className="admin-grid">
              <label>Portee
                <select name="countryId" defaultValue={countryId ?? ""}>
                  <option value="">Global</option>
                  {countrySelectOptions}
                </select>
              </label>
              <button type="submit" className="button button--secondary">Afficher</button>
            </form>
            <p className="page-description">
              Portee affichee: <strong>{countryId ? `pays ${countryLabel(countryId)}` : "global"}</strong>. Priorite: surcharge pays, puis surcharge globale, puis
              defaut. Bornes: 30 a 3650 jours.
            </p>
            <DataTable
              columns={[
                { header: "Categorie", render: (item) => <strong>{CATEGORY_LABELS[item.category]}</strong> },
                { header: "Duree", render: (item) => `${item.retentionDays} jours` },
                { header: "Source", render: (item) => <Badge tone={SOURCE_LABELS[item.source].tone}>{SOURCE_LABELS[item.source].label}</Badge> },
                { header: "Point de depart", render: (item) => ANCHOR_LABELS[item.anchor] },
                {
                  header: "Niveaux",
                  render: (item) => `defaut ${item.defaultRetentionDays} / global ${item.globalRetentionDays ?? "-"} / pays ${item.countryRetentionDays ?? "-"}`
                },
                { header: "Derniere surcharge", render: (item) => (item.overrideUpdatedAt ? `${formatDate(item.overrideUpdatedAt)} - ${item.overrideReason ?? ""}` : "-") },
                {
                  header: countryId ? "Surcharge pays" : "Surcharge globale",
                  render: (item) => {
                    const current = countryId ? item.countryRetentionDays : item.globalRetentionDays;
                    return (
                      <form action={savePolicyOverride} className="admin-grid">
                        <input type="hidden" name="category" value={item.category} />
                        {countryId ? <input type="hidden" name="countryId" value={countryId} /> : null}
                        <label>Jours<input name="retentionDays" type="number" min={30} max={3650} step={1} defaultValue={current ?? item.retentionDays} required /></label>
                        <label>Motif<input name="reason" minLength={8} maxLength={500} placeholder="Motif de la modification" required /></label>
                        <button type="submit" className="button button--secondary">Enregistrer</button>
                        {current !== null ? <button type="submit" formAction={removePolicyOverride} className="button button--secondary">Retirer la surcharge</button> : null}
                      </form>
                    );
                  }
                }
              ]}
              items={policies.data.items}
              getKey={(item) => item.category}
              emptyLabel="Aucune politique disponible."
            />
          </Card>

          <section className="admin-grid admin-grid--two">
            <Card>
              <h2 className="section-title">Previsualiser un lot de retention</h2>
              <p className="page-description">
                Selectionne les donnees arrivees a echeance (500 au plus par categorie). Aucune donnee n'est modifiee a cette etape; le lot expire apres 24 heures.
                Les webhooks et references de messagerie ne sont selectionnes que par une previsualisation globale.
              </p>
              <form action={previewRetention} className="admin-grid">
                <label>Pays (optionnel)
                  <select name="countryId" defaultValue="">
                    <option value="">Tous les pays</option>
                    {countrySelectOptions}
                  </select>
                </label>
                <fieldset className="admin-grid">
                  <legend>Categories (aucune cochee = toutes)</legend>
                  {RETENTION_CATEGORY_KEYS.map((category) => (
                    <label key={category}>
                      <input type="checkbox" name="categories" value={category} /> {CATEGORY_LABELS[category]}
                    </label>
                  ))}
                </fieldset>
                <label>Motif<input name="reason" minLength={8} maxLength={500} placeholder="Motif de la previsualisation" required /></label>
                <button type="submit" className="button button--secondary">Previsualiser</button>
              </form>
            </Card>

            <Card>
              <h2 className="section-title">Previsualiser un effacement sur demande</h2>
              <p className="page-description">
                Pour une demande d'effacement recue par e-mail, telephone ou courrier. Les durees de conservation ne s'appliquent pas. L'adresse e-mail sert
                uniquement a la recherche: elle n'est ni enregistree sur le lot ni affichee sur cette page. Ne recopiez ni e-mail ni telephone dans le motif.
              </p>
              <form action={previewErasure} className="admin-grid">
                <fieldset className="admin-grid">
                  <legend>Identifier la personne par</legend>
                  <label><input type="radio" name="lookup" value="public_reference" defaultChecked /> Reference publique de la demande</label>
                  <label><input type="radio" name="lookup" value="email" /> Adresse e-mail</label>
                </fieldset>
                <label>Reference ou e-mail<input name="identifier" autoComplete="off" maxLength={254} required /></label>
                <label>Motif<input name="reason" minLength={8} maxLength={500} placeholder="Motif (sans e-mail ni telephone)" required /></label>
                <button type="submit" className="button button--secondary">Previsualiser l&apos;effacement</button>
              </form>
            </Card>
          </section>

          <Card>
            <h2 className="section-title">Lots d&apos;anonymisation</h2>
            <p className="page-description">Comptes et metadonnees uniquement: aucun identifiant de personne n&apos;est affiche. Approuver un lot anonymise definitivement les donnees selectionnees.</p>
            <DataTable
              columns={[
                { header: "Type", render: (batch) => (batch.kind === "erasure" ? `Effacement (${batch.erasureLookup === "email" ? "par e-mail" : "par reference"})` : "Retention") },
                {
                  header: "Statut",
                  render: (batch) => (
                    <>
                      {statusBadge(batch.status)}
                      {PARTIAL_STATUSES.has(batch.status) ? <p className="page-description">Execution arretee: les comptes montrent ce qui a ete fait; une nouvelle previsualisation est necessaire pour le reste.</p> : null}
                    </>
                  )
                },
                { header: "Portee", render: (batch) => (batch.kind === "erasure" ? "Personne" : countryLabel(batch.countryId)) },
                {
                  header: "Comptes par categorie",
                  render: (batch) =>
                    batch.counts.length === 0 ? (
                      "Aucune donnee"
                    ) : (
                      <ul className="simple-list">
                        {batch.counts.map((count) => (
                          <li key={count.subject}>
                            {CATEGORY_LABELS[count.subject]}: {count.selected} selectionnes
                            {batch.status === "executed" || PARTIAL_STATUSES.has(batch.status) ? `, ${count.anonymized} anonymises, ${count.skipped} ignores, ${count.failed} en echec` : ""}
                            {count.moreRemaining ? " (reste a traiter)" : ""}
                          </li>
                        ))}
                      </ul>
                    )
                },
                { header: "Total", render: (batch) => batch.totalSelected },
                { header: "Reste", render: (batch) => (batch.moreRemaining ? <Badge tone="warning">Nouveau lot necessaire</Badge> : "Non") },
                { header: "Cree", render: (batch) => formatDate(batch.createdAt) },
                { header: "Expiration / execution", render: (batch) => (batch.status === "previewed" ? formatDate(batch.previewExpiresAt) : formatDate(batch.executedAt ?? batch.approvedAt)) },
                { header: "Motif", render: (batch) => batch.approvalReason ?? batch.reason },
                {
                  header: "Approbation",
                  render: (batch) =>
                    isApprovable(batch, now) ? (
                      <form action={approveBatch} className="admin-grid">
                        <input type="hidden" name="batchId" value={batch.id} />
                        <label>Motif<input name="reason" minLength={8} maxLength={500} placeholder="Motif de l'approbation" required /></label>
                        <button type="submit" className="button button--secondary">Approuver et anonymiser</button>
                      </form>
                    ) : batch.status === "previewed" ? (
                      "Expire: nouvelle previsualisation necessaire"
                    ) : (
                      "-"
                    )
                }
              ]}
              items={batchItems}
              getKey={(batch) => batch.id}
              emptyLabel="Aucun lot previsualise."
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
