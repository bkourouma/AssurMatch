"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./admin-ui";

type ButtonProps = ComponentProps<typeof Button>;

/**
 * Submit button for a plain server-action form (no `useActionState`) that needs a variant, a size or
 * a disabled state: while the parent form submits it is disabled and shows `pendingLabel`, so a slow
 * action cannot be sent twice.
 */
export function PendingActionButton({
  children,
  pendingLabel,
  variant,
  size,
  disabled,
  title
}: {
  children: ReactNode;
  pendingLabel: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  disabled?: boolean;
  title?: string | undefined;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={disabled} title={title} pending={pending} pendingLabel={pendingLabel}>
      {children}
    </Button>
  );
}
