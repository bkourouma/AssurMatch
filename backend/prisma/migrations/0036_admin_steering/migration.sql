-- Spec 073 (lot 6): admin steering. Additive only: one new table, nothing is rewritten or dropped.

-- CreateTable: page-view counter per UTC day and page key (hypothesis H5). No IP address, user agent,
-- referrer, visitor identifier or cookie: only the day, the page key and the count.
CREATE TABLE IF NOT EXISTS "VisitCounter" (
    "day" DATE NOT NULL,
    "page" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VisitCounter_pkey" PRIMARY KEY ("day","page")
);
