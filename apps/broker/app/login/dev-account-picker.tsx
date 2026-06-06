"use client";

import { useRef } from "react";
import { devDemoLoginAction } from "../lib/dev-demo-login-actions";
import { brokerDemoAccounts } from "../lib/dev-demo-accounts";

interface DevAccountPickerProps {
  returnTo: string;
}

export function DevAccountPicker({ returnTo }: DevAccountPickerProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section aria-label="Connexion locale demo" style={{ margin: "0 0 18px", padding: 14, border: "1px solid #c7d7df", background: "#f4faf8", borderRadius: 8 }}>
      <p style={{ margin: "0 0 8px", color: "#245f73", fontSize: 13, fontWeight: 700 }}>Mode local</p>
      <form ref={formRef} action={devDemoLoginAction} style={{ display: "grid", gap: 8 }}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <label style={{ display: "grid", gap: 6 }}>
          Compte demo
          <select
            name="demoEmail"
            defaultValue=""
            onChange={(event) => {
              if (event.currentTarget.value) formRef.current?.requestSubmit();
            }}
            style={{ minHeight: 38, border: "1px solid #9fb4bf", borderRadius: 6, padding: "0 10px", background: "#fff" }}
          >
            <option value="" disabled>Choisir un compte et entrer</option>
            {brokerDemoAccounts.map((account) => (
              <option key={account.email} value={account.email}>
                {account.label} - {account.email}
              </option>
            ))}
          </select>
        </label>
        <p style={{ margin: 0, color: "#516070", fontSize: 12 }}>Disponible uniquement en local avec les donnees demo seed.</p>
      </form>
    </section>
  );
}
