import type { PartnerLicense } from "./partner-licenses.module";

export interface LicenseExpirationState {
  status: "valid" | "expiring_soon" | "expired" | "blocked";
  daysUntilExpiration: number;
}

export class LicenseExpirationService {
  evaluate(license: PartnerLicense, now = new Date()): LicenseExpirationState {
    const expiration = new Date(license.expirationDate);
    const daysUntilExpiration = Math.ceil((expiration.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (license.status !== "valid") return { status: "blocked", daysUntilExpiration };
    if (daysUntilExpiration < 0) return { status: "expired", daysUntilExpiration };
    if (daysUntilExpiration <= 30) return { status: "expiring_soon", daysUntilExpiration };
    return { status: "valid", daysUntilExpiration };
  }
}
