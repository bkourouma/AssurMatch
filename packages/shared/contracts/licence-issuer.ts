/**
 * Issuing authority stored on a draft licence whose broker application left it blank (spec 051).
 * It is an internal marker for compliance, never wording for a visitor: public screens go through
 * `publicIssuingAuthority` and hide the line when there is nothing real to show.
 */
export const UNKNOWN_ISSUING_AUTHORITY = "A completer (non declaree dans la candidature)";

/** The authority to show a visitor, or `undefined` when it is empty or the internal marker. */
export function publicIssuingAuthority(value: string | null | undefined): string | undefined {
  const authority = value?.trim();
  if (!authority || authority === UNKNOWN_ISSUING_AUTHORITY) return undefined;
  return authority;
}
