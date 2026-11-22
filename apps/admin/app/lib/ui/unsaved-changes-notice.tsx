"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drop it inside a `<form>`: it tells the editor, in an aria-live line, that the form holds changes
 * that are not saved yet, and asks the browser to confirm before the tab is closed or the page is
 * left. The flag is cleared when the form is submitted or reset. It never blocks a submit and
 * changes no data; it only reads `input` / `change` events of its own form.
 */
export function UnsavedChangesNotice({ message = "Modifications non enregistrées." }: { message?: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return undefined;
    const markDirty = () => setDirty(true);
    const clear = () => setDirty(false);
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
    form.addEventListener("submit", clear);
    form.addEventListener("reset", clear);
    return () => {
      form.removeEventListener("input", markDirty);
      form.removeEventListener("change", markDirty);
      form.removeEventListener("submit", clear);
      form.removeEventListener("reset", clear);
    };
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <span ref={anchor} className="bo-description" role="status" aria-live="polite" data-unsaved-changes={dirty ? "true" : "false"}>
      {dirty ? message : ""}
    </span>
  );
}
