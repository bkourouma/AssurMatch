"use client";

import { createContext, useActionState, useContext } from "react";
import type { ReactNode } from "react";
import { Button, Form } from "../lib/ui/admin-ui";
import type { ButtonVariant } from "../lib/ui/admin-ui";

const PendingContext = createContext(false);

/**
 * `<Form>` whose server action is called by a server component: the action is wrapped so the form
 * knows when it is running and its `PendingSubmit` shows a sending state (and cannot be clicked
 * twice). The submitted fields and the action itself are unchanged; a redirect thrown by the action
 * still navigates as before.
 */
export function PendingForm({
  action,
  columns,
  children
}: {
  action: (formData: FormData) => void | Promise<void>;
  columns?: 1 | 2 | undefined;
  children: ReactNode;
}) {
  const [, formAction, pending] = useActionState(async (_previous: null, formData: FormData): Promise<null> => {
    await action(formData);
    return null;
  }, null);
  return (
    <PendingContext.Provider value={pending}>
      <Form action={formAction} columns={columns}>
        {children}
      </Form>
    </PendingContext.Provider>
  );
}

/** Submit button of a `PendingForm`: label swapped while the action runs. */
export function PendingSubmit({
  children,
  pendingLabel,
  variant,
  size
}: {
  children: ReactNode;
  pendingLabel: string;
  variant?: ButtonVariant | undefined;
  size?: "sm" | "md" | undefined;
}) {
  const pending = useContext(PendingContext);
  return (
    <Button type="submit" variant={variant} size={size} pending={pending} pendingLabel={pendingLabel}>
      {children}
    </Button>
  );
}
