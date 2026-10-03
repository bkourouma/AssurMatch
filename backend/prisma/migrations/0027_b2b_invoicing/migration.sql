-- Spec 060: manual B2B invoicing (issued invoices, manual payments, credit notes).
-- Online payment stays out of scope (decision D-8); nothing here collects money.

ALTER TABLE "LeadPack" ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;

CREATE TABLE IF NOT EXISTS "InvoiceNumberSequence" (
  "countryCode" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "lastValue" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceNumberSequence_pkey" PRIMARY KEY ("countryCode", "year", "kind")
);

CREATE TABLE IF NOT EXISTS "IssuedInvoice" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "draftId" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "periodFrom" TIMESTAMP(3) NOT NULL,
  "periodTo" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "customer" JSONB NOT NULL,
  "issuer" JSONB NOT NULL,
  "legalMentionsComplete" BOOLEAN NOT NULL,
  "lines" JSONB NOT NULL,
  "subtotalAmount" INTEGER NOT NULL,
  "vatRateBps" INTEGER NOT NULL,
  "vatAmount" INTEGER NOT NULL,
  "totalAmount" INTEGER NOT NULL,
  "dueDate" TEXT NOT NULL,
  "documentStorageKey" TEXT NOT NULL,
  "documentSha256" TEXT NOT NULL,
  "issuedById" TEXT,
  "issueReason" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'issued',
  "amountPaid" INTEGER NOT NULL DEFAULT 0,
  "creditNoteId" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IssuedInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IssuedInvoice_status_check" CHECK ("status" IN ('issued', 'partially_paid', 'paid', 'cancelled')),
  CONSTRAINT "IssuedInvoice_amountPaid_check" CHECK ("amountPaid" >= 0 AND "amountPaid" <= "totalAmount")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IssuedInvoice_number_key" ON "IssuedInvoice"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "IssuedInvoice_countryCode_year_sequence_key" ON "IssuedInvoice"("countryCode", "year", "sequence");
CREATE INDEX IF NOT EXISTS "IssuedInvoice_partnerId_issuedAt_idx" ON "IssuedInvoice"("partnerId", "issuedAt");
CREATE INDEX IF NOT EXISTS "IssuedInvoice_partnerId_periodFrom_idx" ON "IssuedInvoice"("partnerId", "periodFrom");
CREATE INDEX IF NOT EXISTS "IssuedInvoice_status_idx" ON "IssuedInvoice"("status");
-- At most one active (not cancelled) invoice per partner and period.
CREATE UNIQUE INDEX IF NOT EXISTS "IssuedInvoice_active_partner_period_key" ON "IssuedInvoice"("partnerId", "periodFrom") WHERE "status" <> 'cancelled';

CREATE TABLE IF NOT EXISTS "InvoicePayment" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "receivedAt" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "note" TEXT,
  "recordedById" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoicePayment_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "InvoicePayment_method_check" CHECK ("method" IN ('bank_transfer', 'mobile_money', 'cheque', 'other'))
);

CREATE INDEX IF NOT EXISTS "InvoicePayment_invoiceId_idx" ON "InvoicePayment"("invoiceId");
CREATE INDEX IF NOT EXISTS "InvoicePayment_partnerId_recordedAt_idx" ON "InvoicePayment"("partnerId", "recordedAt");

CREATE TABLE IF NOT EXISTS "CreditNote" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "subtotalAmount" INTEGER NOT NULL,
  "vatAmount" INTEGER NOT NULL,
  "totalAmount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "documentStorageKey" TEXT NOT NULL,
  "documentSha256" TEXT NOT NULL,
  "issuedById" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_number_key" ON "CreditNote"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_invoiceId_key" ON "CreditNote"("invoiceId");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditNote_countryCode_year_sequence_key" ON "CreditNote"("countryCode", "year", "sequence");
CREATE INDEX IF NOT EXISTS "CreditNote_partnerId_issuedAt_idx" ON "CreditNote"("partnerId", "issuedAt");

-- Immutability guards: an issued invoice keeps its number, lines, amounts, mentions and document
-- forever. Only the payment/cancellation state moves, and a cancelled invoice is frozen.
CREATE OR REPLACE FUNCTION "IssuedInvoice_immutable_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IssuedInvoice % is immutable: issue a credit note instead of deleting it', OLD."number";
  END IF;
  IF OLD."status" = 'cancelled' THEN
    RAISE EXCEPTION 'IssuedInvoice % is cancelled and cannot change', OLD."number";
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."number" IS DISTINCT FROM OLD."number"
    OR NEW."countryCode" IS DISTINCT FROM OLD."countryCode"
    OR NEW."year" IS DISTINCT FROM OLD."year"
    OR NEW."sequence" IS DISTINCT FROM OLD."sequence"
    OR NEW."draftId" IS DISTINCT FROM OLD."draftId"
    OR NEW."partnerId" IS DISTINCT FROM OLD."partnerId"
    OR NEW."plan" IS DISTINCT FROM OLD."plan"
    OR NEW."periodFrom" IS DISTINCT FROM OLD."periodFrom"
    OR NEW."periodTo" IS DISTINCT FROM OLD."periodTo"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."customer" IS DISTINCT FROM OLD."customer"
    OR NEW."issuer" IS DISTINCT FROM OLD."issuer"
    OR NEW."legalMentionsComplete" IS DISTINCT FROM OLD."legalMentionsComplete"
    OR NEW."lines" IS DISTINCT FROM OLD."lines"
    OR NEW."subtotalAmount" IS DISTINCT FROM OLD."subtotalAmount"
    OR NEW."vatRateBps" IS DISTINCT FROM OLD."vatRateBps"
    OR NEW."vatAmount" IS DISTINCT FROM OLD."vatAmount"
    OR NEW."totalAmount" IS DISTINCT FROM OLD."totalAmount"
    OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate"
    OR NEW."documentStorageKey" IS DISTINCT FROM OLD."documentStorageKey"
    OR NEW."documentSha256" IS DISTINCT FROM OLD."documentSha256"
    OR NEW."issuedById" IS DISTINCT FROM OLD."issuedById"
    OR NEW."issueReason" IS DISTINCT FROM OLD."issueReason"
    OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'IssuedInvoice % is immutable once issued', OLD."number";
  END IF;
  IF NEW."amountPaid" < OLD."amountPaid" THEN
    RAISE EXCEPTION 'IssuedInvoice % paid amount cannot decrease', OLD."number";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "IssuedInvoice_immutable" ON "IssuedInvoice";
CREATE TRIGGER "IssuedInvoice_immutable" BEFORE UPDATE OR DELETE ON "IssuedInvoice"
  FOR EACH ROW EXECUTE FUNCTION "IssuedInvoice_immutable_guard"();

CREATE OR REPLACE FUNCTION "Invoicing_append_only_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "InvoicePayment_append_only" ON "InvoicePayment";
CREATE TRIGGER "InvoicePayment_append_only" BEFORE UPDATE OR DELETE ON "InvoicePayment"
  FOR EACH ROW EXECUTE FUNCTION "Invoicing_append_only_guard"();

DROP TRIGGER IF EXISTS "CreditNote_append_only" ON "CreditNote";
CREATE TRIGGER "CreditNote_append_only" BEFORE UPDATE OR DELETE ON "CreditNote"
  FOR EACH ROW EXECUTE FUNCTION "Invoicing_append_only_guard"();
