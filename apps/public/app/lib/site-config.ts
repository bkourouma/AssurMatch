/**
 * Public site configuration. The broker portal is a separate application: its URL is built from an
 * environment variable and never hard-coded as a path of the public site.
 */
export const siteUrl = process.env.NEXT_PUBLIC_ASSURMATCH_PUBLIC_URL ?? "http://127.0.0.1:3601";

export const brokerUrl = process.env.NEXT_PUBLIC_ASSURMATCH_BROKER_URL ?? "http://localhost:3603";

/** Absolute sign-in URL of the partner application, used by the footer and the broker pages. */
export const brokerLoginUrl = `${brokerUrl}/login`;

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, siteUrl).toString();
}
