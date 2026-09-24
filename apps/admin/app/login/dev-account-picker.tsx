"use client";

import { useRef } from "react";
import { adminDemoAccounts } from "../lib/dev-demo-accounts";
import { devDemoLoginAction } from "../lib/dev-demo-login-actions";
import { Card, Field, Form, Select, fieldControlProps } from "../lib/ui/admin-ui";

interface DevAccountPickerProps {
  returnTo: string;
}

export function DevAccountPicker({ returnTo }: DevAccountPickerProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Card as="section" aria-label="Connexion locale demo" muted>
      <p className="bo-kicker">Mode local</p>
      <Form ref={formRef} action={devDemoLoginAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <Field
          id="dev-demo-account"
          label="Compte demo"
          hint="Disponible uniquement en local avec les donnees demo seed."
        >
          <Select
            {...fieldControlProps("dev-demo-account", { hint: "Disponible uniquement en local avec les donnees demo seed." })}
            name="demoEmail"
            defaultValue=""
            onChange={(event) => {
              if (event.currentTarget.value) formRef.current?.requestSubmit();
            }}
          >
            <option value="" disabled>Choisir un compte et entrer</option>
            {adminDemoAccounts.map((account) => (
              <option key={account.email} value={account.email}>
                {account.label} - {account.email}
              </option>
            ))}
          </Select>
        </Field>
      </Form>
    </Card>
  );
}
