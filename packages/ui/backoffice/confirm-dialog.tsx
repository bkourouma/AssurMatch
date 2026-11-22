"use client";

import { useId, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useFormStatus } from "react-dom";
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
  /** Label of the confirm button while the form action runs (the button is also disabled then). */
  confirmPendingLabel?: string | undefined;
}

/** Rendered inside the `<form>` so `useFormStatus` sees the submission: blocks a double submit. */
function ConfirmSubmit({ variant, label, pendingLabel }: { variant: "danger" | "primary"; label: string; pendingLabel?: string | undefined }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="bo-button"
      data-variant={variant}
      data-pending={pending ? "true" : undefined}
      type="submit"
      disabled={pending}
      aria-busy={pending ? true : undefined}
    >
      <span aria-live={pending && pendingLabel ? "polite" : undefined}>{pending && pendingLabel ? pendingLabel : label}</span>
    </button>
  );
}

const FIRST_FIELD = "input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled])";

/** Closes the modal when the press lands on the backdrop (outside the dialog box), never on its content. */
function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
  const dialog = event.currentTarget;
  // Keyboard-triggered clicks carry no pointer position (detail 0): ignore them.
  if (event.target !== dialog || event.detail === 0) return;
  const box = dialog.getBoundingClientRect();
  const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
  if (!inside) dialog.close();
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
  dataAttributes,
  confirmPendingLabel
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  function open() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    // Safe action first for a destructive confirmation; otherwise the first field, else the browser default.
    // The native modal restores the focus to the trigger when it closes.
    const target =
      tone === "danger"
        ? dialog.querySelector<HTMLElement>("[data-autofocus]")
        : (dialog.querySelector<HTMLElement>(FIRST_FIELD) ?? null);
    target?.focus();
  }

  return (
    <>
      <button
        className="bo-button"
        data-variant={triggerVariant}
        data-size="sm"
        type="button"
        aria-haspopup="dialog"
        onClick={open}
      >
        {triggerLabel}
      </button>
      <dialog
        className="bo-dialog"
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onClick={closeOnBackdrop}
      >
        <h2 className="bo-dialog__title" id={titleId}>
          {title}
        </h2>
        {description ? (
          <p className="bo-dialog__description" id={descriptionId}>
            {description}
          </p>
        ) : null}
        <form className="bo-form" action={formAction} {...dataAttributes}>
          {children}
          {confirmName ? <input type="hidden" name={confirmName} value={confirmValue ?? ""} /> : null}
          <div className="bo-dialog__actions">
            <button
              className="bo-button"
              data-variant="tertiary"
              data-autofocus={tone === "danger" ? "true" : undefined}
              type="button"
              onClick={() => dialogRef.current?.close()}
            >
              {cancelLabel}
            </button>
            <ConfirmSubmit variant={tone === "danger" ? "danger" : "primary"} label={confirmLabel} pendingLabel={confirmPendingLabel} />
          </div>
        </form>
      </dialog>
    </>
  );
}
