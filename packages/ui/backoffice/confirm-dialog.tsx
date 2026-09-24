"use client";

import { useId, useRef } from "react";
import type { ReactNode } from "react";
import type { ButtonVariant } from "./button";

export interface ConfirmDialogProps {
  triggerLabel: string;
  triggerVariant?: ButtonVariant | undefined;
  title: string;
  description?: string | undefined;
  confirmLabel: string;
  cancelLabel: string;
  /** Extra form fields (a reason, a date...) submitted along with the confirmation. */
  children?: ReactNode;
  /** Server action of the surface; the shared package never owns the side effect itself. */
  formAction?: ((formData: FormData) => void | Promise<void>) | undefined;
  confirmName?: string | undefined;
  confirmValue?: string | undefined;
  tone?: "danger" | "primary" | undefined;
  /** `data-*` attributes the surface needs on the inner form for its own static tests. */
  dataAttributes?: Record<string, string> | undefined;
}

/**
 * Native `<dialog>` modal for a sensitive action (suspend, reset, delete). Without JavaScript the
 * trigger does nothing, so a surface must keep a non-modal path for anything that is mandatory.
 */
export function ConfirmDialog({
  triggerLabel,
  triggerVariant = "secondary",
  title,
  description,
  confirmLabel,
  cancelLabel,
  children,
  formAction,
  confirmName,
  confirmValue,
  tone = "primary",
  dataAttributes
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        className="bo-button"
        data-variant={triggerVariant}
        data-size="sm"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        {triggerLabel}
      </button>
      <dialog className="bo-dialog" ref={dialogRef} aria-labelledby={titleId}>
        <h2 className="bo-dialog__title" id={titleId}>
          {title}
        </h2>
        {description ? <p className="bo-dialog__description">{description}</p> : null}
        <form className="bo-form" action={formAction} {...dataAttributes}>
          {children}
          {confirmName ? <input type="hidden" name={confirmName} value={confirmValue ?? ""} /> : null}
          <div className="bo-dialog__actions">
            <button className="bo-button" data-variant="tertiary" type="button" onClick={() => dialogRef.current?.close()}>
              {cancelLabel}
            </button>
            <button className="bo-button" data-variant={tone === "danger" ? "danger" : "primary"} type="submit">
              {confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
