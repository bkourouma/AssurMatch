import type { ReactNode } from "react";

/**
 * Hero title for a page whose wording comes from editorial content rather than the message catalogue
 * (a guide, a legal page): the last word carries the brand gradient accent, the wording itself is
 * never altered. A one-word title is accented as a whole.
 */
export function accentTitle(title: string): ReactNode {
  const trimmed = title.trim();
  const cut = trimmed.lastIndexOf(" ");
  if (cut === -1) return <span className="am-hero__accent">{trimmed}</span>;
  return (
    <>
      {trimmed.slice(0, cut + 1)}
      <span className="am-hero__accent">{trimmed.slice(cut + 1)}</span>
    </>
  );
}
