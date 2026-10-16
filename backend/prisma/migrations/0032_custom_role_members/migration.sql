-- Spec 064: custom roles can be assigned to members (additive JSON column, existing rows keep an empty list).
-- A member holds at most one custom role of its own tenant; the application keeps that invariant.
ALTER TABLE "PartnerCustomRole" ADD COLUMN IF NOT EXISTS "memberIds" JSONB NOT NULL DEFAULT '[]';
