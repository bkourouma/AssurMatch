import type { Page } from "@playwright/test";
import { openAs as sharedOpenAs, type BackOfficeAccount } from "./backoffice";

/**
 * Same as the shared openAs, with a few more attempts: several runners share the Super Admin account and
 * the backend refuses a TOTP code of a 30 s step that was already used (mfaLastTotpCounter), so a login can
 * lose the race for a step. Each retry starts a new login, which waits for a fresh step.
 */
export async function openAs(page: Page, account: BackOfficeAccount, path: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await sharedOpenAs(page, account, path);
      return;
    } catch (error) {
      const onMfa = new URL(page.url()).pathname.startsWith("/mfa");
      if (attempt >= 4 || !onMfa) throw error;
    }
  }
}
