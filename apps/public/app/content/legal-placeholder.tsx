export interface LegalPlaceholderProps {
  /** The missing legal identifier, e.g. "Numéro d'immatriculation (RCCM)". */
  label: string;
  /** Localised "information à compléter avant mise en ligne". */
  notice: string;
}

/**
 * Visible marker for a legal identifier the repository does not hold (company registration number,
 * registered address, publication director, hosting provider, data protection officer, supervisory
 * authority...). This is a deliberate, visible gap: it must never be silently left out or replaced by
 * an invented value. `app/content/legal/*` collects the missing labels per page; the page component
 * renders one of these per label, then a `Notice` that lists them again under "à compléter".
 */
export function LegalPlaceholder({ label, notice }: LegalPlaceholderProps) {
  return (
    <span className="am-legal-placeholder">
      {label} — <em>{notice}</em>
    </span>
  );
}
