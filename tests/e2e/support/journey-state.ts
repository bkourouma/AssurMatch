import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BackOfficeAccount } from "./backoffice";
import { e2eEnv } from "./env";

// State handed from one journey step to the next (and from scenario-core to the specs that depend
// on it). Persisted in .local/e2e (git-ignored) so a step can be re-run alone against a kept stack
// (`npm run test:e2e:stack -- --keep`, then `npm run test:e2e -- --grep "SC-05"`).
// Throwaway values only: the stack is destroyed after the run.

export interface JourneyState {
  superAdmin?: BackOfficeAccount;
  complianceAdmin?: BackOfficeAccount;
  countryId?: string;
  productIds?: Record<string, string>;
  applicationReference?: string;
  partnerId?: string;
  partnerName?: string;
  brokerOwner?: BackOfficeAccount;
  offerId?: string;
  offerTitle?: string;
  secondPartnerId?: string;
  secondPartnerName?: string;
  secondBrokerOwner?: BackOfficeAccount;
  quoteReference?: string;
  visitorEmail?: string;
  trackingLink?: string;
  leadAssignmentId?: string;
}

export function loadJourneyState(): JourneyState {
  try {
    return JSON.parse(readFileSync(e2eEnv.journeyStateFile, "utf8")) as JourneyState;
  } catch {
    return {};
  }
}

export function saveJourneyState(patch: Partial<JourneyState>): JourneyState {
  const next = { ...loadJourneyState(), ...patch };
  mkdirSync(path.dirname(e2eEnv.journeyStateFile), { recursive: true });
  writeFileSync(e2eEnv.journeyStateFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function requireState<K extends keyof JourneyState>(state: JourneyState, key: K): NonNullable<JourneyState[K]> {
  const value = state[key];
  if (value === undefined || value === null) throw new Error(`journey state "${String(key)}" missing: run the previous scenario steps first`);
  return value as NonNullable<JourneyState[K]>;
}
