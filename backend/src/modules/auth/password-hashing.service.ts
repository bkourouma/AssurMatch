import argon2 from "argon2";

export const Argon2idParameters = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1
} as const;

const BOGUS_HASH = "$argon2id$v=19$m=65536,t=3,p=1$c3RhdGljLWJvZ3VzLXNhbHQ$TDeNzWWTPIvRlD4nbV/R6ta+D3unU/y0azG4sCojP6U";

export class PasswordHashingService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, Argon2idParameters);
  }

  verify(hash: string | null | undefined, password: string): Promise<boolean> {
    return argon2.verify(hash ?? BOGUS_HASH, password).catch(() => false);
  }

  verifyBogus(password: string): Promise<boolean> {
    return this.verify(BOGUS_HASH, password);
  }

  async selfTest(): Promise<{ ok: boolean; elapsedMs: number }> {
    const startedAt = Date.now();
    const hash = await this.hash("self-test-password-123");
    const ok = await this.verify(hash, "self-test-password-123");
    return { ok, elapsedMs: Date.now() - startedAt };
  }
}
