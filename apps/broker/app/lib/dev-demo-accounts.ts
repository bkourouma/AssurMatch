export const brokerDemoAccounts = [
  { email: "starter.owner@broker.example", label: "Starter owner", helper: "Portail Starter, leads simples, CRM bloque" },
  { email: "pro.owner@broker.example", label: "Pro owner", helper: "CRM complet et dashboard Pro" },
  { email: "pro.manager@broker.example", label: "Pro manager", helper: "Vue manager et assignation CRM" },
  { email: "pro.agent@broker.example", label: "Pro agent", helper: "Vue agent sur les leads assignes" },
  { email: "pro.readonly@broker.example", label: "Pro read-only", helper: "Lecture seule broker" },
  { email: "enterprise.owner@broker.example", label: "Enterprise owner", helper: "Tenant Enterprise et donnees avancees" }
] as const;

export type BrokerDemoAccountEmail = (typeof brokerDemoAccounts)[number]["email"];

export function isBrokerDemoAccountEmail(value: string): value is BrokerDemoAccountEmail {
  return brokerDemoAccounts.some((account) => account.email === value);
}

export function isLocalBrokerDemoLoginEnabled(): boolean {
  return process.env.APP_ENV === "local" && process.env.NODE_ENV !== "production";
}
