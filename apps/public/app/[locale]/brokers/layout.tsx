import type { ReactNode } from "react";
import "../../styles/brokers.css";

/**
 * Thin layout scoped to `/brokers/**` (SITE-408 to SITE-411): its only job is to load the
 * page-specific stylesheet once for the whole route group, since Next.js App Router lets any
 * layout import a stylesheet, not only the root one. It renders no markup of its own.
 */
export default function BrokersLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
