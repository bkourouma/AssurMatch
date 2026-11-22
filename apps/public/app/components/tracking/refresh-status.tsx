"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Icon } from "../ui/icons";
import "../../styles/pages/messaging.css";

export interface RefreshStatusLabels {
  refresh: string;
  refreshing: string;
  /** Contains the `{time}` placeholder, replaced in the browser with the local time of the refresh. */
  refreshed: string;
}

/**
 * Re-reads the tracking page from the server without a full reload (the status comes from a no-store
 * request, so the new answer is live). The result is announced politely, because a screen-reader user
 * would otherwise get no sign that anything happened when the status did not change.
 *
 * Labels come from the server page: `QuoteRequest` is not one of the client namespaces.
 */
export function RefreshStatus({ labels, locale }: { labels: RefreshStatusLabels; locale: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const requested = useRef(false);

  // Announce only once the transition has settled, never at the moment the refresh is requested.
  useEffect(() => {
    if (!pending && requested.current) {
      requested.current = false;
      const time = new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
      setMessage(labels.refreshed.replace("{time}", time));
    }
  }, [pending, locale, labels.refreshed]);

  function refresh() {
    // The button is not `disabled` while refreshing (that would drop the keyboard focus): block the double click here.
    if (pending || requested.current) return;
    requested.current = true;
    setMessage("");
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="am-j-refresh">
      <Button variant="secondary" onClick={refresh} icon={<Icon name={pending ? "loader" : "refresh"} size={18} />}>
        {pending ? labels.refreshing : labels.refresh}
      </Button>
      <p className="am-j-fineprint" role="status" aria-live="polite">
        {pending ? "" : message}
      </p>
    </div>
  );
}
