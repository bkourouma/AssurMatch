-- Security hardening: TOTP replay protection. Last accepted time-step counter per user.
-- Additive only: one nullable column, nothing is altered, rewritten or dropped.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaLastTotpCounter" INTEGER;
