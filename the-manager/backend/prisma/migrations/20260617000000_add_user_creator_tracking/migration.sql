-- Add createdById column to users table (nullable for backfill)
ALTER TABLE "users" ADD COLUMN "createdById" TEXT;

-- Create index on createdById for query performance
CREATE INDEX "users_createdById_idx" ON "users"("createdById");

-- Backfill: Each existing user becomes their own creator
UPDATE "users" SET "createdById" = "id" WHERE "createdById" IS NULL;

