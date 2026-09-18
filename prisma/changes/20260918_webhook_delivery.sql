-- Additive deployment step; run against the intended database before deploying.
CREATE TABLE "webhook_events" (
    "id" TEXT PRIMARY KEY,
    "resource" TEXT NOT NULL,
    "occurred_at" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "webhook_events_resource_occurred_at_idx" ON "webhook_events"("resource", "occurred_at");
CREATE TABLE "webhook_effects" (
    "key" TEXT PRIMARY KEY,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
