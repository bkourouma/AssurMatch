"use client";

import { useRef } from "react";
import { devDemoLoginAction } from "../lib/dev-demo-login-actions";
import { brokerDemoAccounts } from "../lib/dev-demo-accounts";
import { Card, Field, Select } from "../lib/ui/broker-ui";

interface DevAccountPickerProps {
  returnTo: string;
}

export function DevAccountPicker({ returnTo }: DevAccountPickerProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Card title="Mode local" description="Disponible uniquement en local avec les donnees demo seed." muted aria-label="Connexion locale demo">
      <form ref={formRef} action={devDemoLoginAction}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <Field id="demo-account" label="Compte demo">
          <Select
            id="demo-account"
            name="demoEmail"
            defaultValue=""
            placeholder="Choisir un compte et entrer"
            options={brokerDemoAccounts.map((account) => ({ value: account.email, label: `${account.label} - ${account.email}` }))}
            onChange={(event) => {
              if (event.currentTarget.value) formRef.current?.requestSubmit();
            }}
          />
        </Field>
      </form>
    </Card>
  );
}
