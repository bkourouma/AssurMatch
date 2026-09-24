/**
 * Admin re-export of the shared back-office design system.
 *
 * Every page keeps importing `../lib/ui/admin-ui`, but the components now come from
 * `@assurmatch/ui/backoffice`. Only admin-specific mappings live here: the shared package holds no
 * surface vocabulary, so the status wording and the status colours of this back-office are decided
 * in this file and nowhere else.
 */

export * from "@assurmatch/ui/backoffice";

import type { Tone } from "@assurmatch/ui/backoffice";

/**
 * Status colours of the admin surface. The keys are the raw API statuses and the displayed text
 * stays the raw status: `StatusBadge` is used without a `labels` map so the operational vocabulary
 * of the back-office is unchanged.
 */
export const userStatusTones: Record<string, Tone> = {
  active: "success",
  suspended: "danger",
  locked: "danger",
  invited: "warning",
  deleted: "warning"
};

export const mfaStatusTones: Record<string, Tone> = {
  verified: "success",
  enrolled: "success",
  not_enrolled: "warning",
  pending: "warning"
};

export const quoteFormStatusTones: Record<string, Tone> = {
  published: "success",
  draft: "neutral",
  suspended: "warning",
  retired: "disabled"
};

export const offerStatusTones: Record<string, Tone> = {
  active: "success",
  suspended: "danger",
  draft: "warning",
  expired: "warning",
  pending: "warning"
};

export const ruleStatusTones: Record<string, Tone> = {
  active: "success",
  disabled: "disabled"
};

export const documentScanTones: Record<string, Tone> = {
  clean: "success",
  infected: "danger",
  failed: "warning",
  pending: "disabled"
};

export const integrationStatusTones: Record<string, Tone> = {
  active: "success",
  delivered: "success",
  pending: "warning",
  retryable: "warning",
  dead_letter: "danger",
  failed: "danger"
};

export const checklistStatusTones: Record<string, Tone> = {
  passed: "success",
  warning: "warning",
  blocked: "danger"
};
