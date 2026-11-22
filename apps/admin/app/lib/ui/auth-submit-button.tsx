"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./admin-ui";

/**
 * Full-width submit button of the sign-in form (a plain server-action form, no `useActionState`):
 * while the form submits it is disabled and shows `pendingLabel`, so a slow login cannot be sent twice.
 */
export function AuthSubmitButton({ children, pendingLabel }: { children: ReactNode; pendingLabel: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth pending={pending} pendingLabel={pendingLabel}>
      {children}
    </Button>
  );
}
