const ADMIN_API_BASE_URL = process.env.NEXT_PUBLIC_ASSURMATCH_ADMIN_API_URL ?? process.env.NEXT_PUBLIC_ASSURMATCH_API_URL ?? "http://127.0.0.1:3000";

export async function readAdminHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${ADMIN_API_BASE_URL}/admin/system/health`, {
      headers: {
        "x-assurmatch-actor-id": process.env.ASSURMATCH_DEV_ADMIN_ACTOR_ID ?? "dev-admin",
        "x-assurmatch-roles": process.env.ASSURMATCH_DEV_ADMIN_ROLES ?? "super_admin",
        "x-assurmatch-mfa-verified": process.env.ASSURMATCH_DEV_ADMIN_MFA ?? "true"
      },
      cache: "no-store"
    });
    return { ok: response.ok, ...(response.ok ? {} : { error: `api_${response.status}` }) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "api_unavailable" };
  }
}
