"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { visitPageKey } from "../../lib/visit-page-key";

const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";

/**
 * Spec 073 FR-008 (hypothesis H5): counts one page view per navigation, without UI.
 * No cookie, no local or session storage, nothing but a page key from a closed list is sent (never
 * the URL, a quote-request reference, a token or a query parameter). Skipped when the browser
 * sends "Do Not Track"; every failure is silent.
 */
export function VisitBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      if (typeof navigator === "undefined" || navigator.doNotTrack === "1") return;
      void fetch(`${PUBLIC_API_BASE_URL}/public-stats/visits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page: visitPageKey(pathname ?? "/") }),
        keepalive: true,
        credentials: "omit",
        referrerPolicy: "no-referrer"
      }).catch(() => undefined);
    } catch {
      // The counter is best effort and must never disturb the page.
    }
  }, [pathname]);

  return null;
}
