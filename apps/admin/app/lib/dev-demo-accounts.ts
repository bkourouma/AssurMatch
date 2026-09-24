export const adminDemoAccounts = [
  { email: "super.admin@assurmatch.local", label: "Super Admin", helper: "Acces complet plateforme locale" },
  { email: "country.admin@assurmatch.local", label: "Admin Pays", helper: "Gestion pays et operations locales" },
  { email: "compliance.admin@assurmatch.local", label: "Compliance", helper: "Audit, alertes et conformite" },
  { email: "support.admin@assurmatch.local", label: "Support", helper: "Support operationnel et lecture admin" },
  { email: "finance.admin@assurmatch.local", label: "Finance", helper: "Fondations billing non activantes" },
  { email: "content.admin@assurmatch.local", label: "Content", helper: "Contenus et catalogue local" },
  { email: "ai.admin@assurmatch.local", label: "AI Admin", helper: "Fondations IA desactivees" }
] as const;

export type AdminDemoAccountEmail = (typeof adminDemoAccounts)[number]["email"];

export function isAdminDemoAccountEmail(value: string): value is AdminDemoAccountEmail {
  return adminDemoAccounts.some((account) => account.email === value);
}

export function isLocalAdminDemoLoginEnabled(): boolean {
  return process.env.APP_ENV === "local" && process.env.NODE_ENV !== "production";
}
