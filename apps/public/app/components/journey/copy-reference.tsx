"use client";

import { useEffect, useState } from "react";
import { Icon } from "../ui/icons";

export interface CopyReferenceProps {
  /** Public reference of the quote request, copied verbatim. */
  value: string;
  label: string;
  copiedLabel: string;
}

/**
 * Copies the public reference to the clipboard.
 *
 * Labels come from the server page: `QuoteRequest` is not one of the namespaces the locale layout
 * ships to the browser. The button renders nothing until the clipboard API is known to be
 * available, so a browser without it never shows an affordance that would do nothing - the
 * reference itself is always readable next to it.
 */
export function CopyReference({ value, label, copiedLabel }: CopyReferenceProps) {
  const [supported, setSupported] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function");
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!supported) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    // The label doubles as the confirmation, so it is announced politely: without a live region a
    // screen-reader user gets no feedback at all that the reference reached the clipboard.
    <button className="am-j-copy" type="button" onClick={copy} data-copied={copied ? "true" : undefined}>
      <Icon name={copied ? "check" : "copy"} size={18} />
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
