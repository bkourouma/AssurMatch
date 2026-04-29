export interface AuthRateLimitKeyInput {
  ip?: string;
  email?: string;
  route: string;
}

export function authRateLimitKeys(input: AuthRateLimitKeyInput): string[] {
  const route = input.route.replace(/[^a-z0-9:_/-]/gi, "_");
  const keys = [`auth:${route}:ip:${input.ip ?? "unknown"}`];
  if (input.email) keys.push(`auth:${route}:email:${input.email.trim().toLowerCase()}`);
  return keys;
}
