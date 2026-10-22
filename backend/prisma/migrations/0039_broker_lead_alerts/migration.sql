-- Lot 3 (spec 069): broker lead expiry alert and weekly summary notification types.
-- Additive only: no existing row is rewritten.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'broker_lead_expiring';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'broker_weekly_summary';
