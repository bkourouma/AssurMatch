import type { ReactNode } from "react";
import "../../styles/pages/journey.css";

/**
 * Thin layout scoped to `/countries/**`: its only job is to load the journey stylesheet once for the
 * whole route group, since Next.js App Router lets any layout import a stylesheet, not only the root
 * one. It renders no markup of its own.
 *
 * The three journey pages that live outside this group (`/offers/[offerId]`, `/compare`,
 * `/quote-requests/[publicReference]`) import the same file from their own module.
 */
export default function CountriesJourneyLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
