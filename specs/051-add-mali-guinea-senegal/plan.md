# Implementation Plan: Add Mali, Guinea and Senegal (waitlist tier)

Spec: [spec.md](./spec.md). Impacted surfaces: reference seeds, local demo seed, docs. No API/UI/schema change.

1. `countries.json`: ML and SN flags -> waitlist on; add GN (`fanaf`, GNF, `Africa/Conakry`).
2. `currencies.json`: add GNF.
3. `seed-reference.ts`: resolve regime by `regulatoryFamily` key instead of CIMA only.
4. `seed-broker-demo.ts`: add ML and GN in the SN waitlist tier.
5. Docs: README catalog description, runbook note, regime note.
6. Validate: typecheck, seed dry-run, country/waitlist unit tests, local runtime check of the public directory.
