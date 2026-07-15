/*
  Warnings:

  - A unique constraint covering the columns `[inviteCode]` on the table `League` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[leagueId,ownerId]` on the table `Team` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `creatorId` to the `League` table. At the time this migration
    was actually applied, "League" was empty (test data was deleted beforehand), so the
    backfill below was a no-op. It is kept as a generic defensive step — NOT NULL cannot be
    added directly to a non-empty column without a default — so this migration stays correct
    if it is ever re-applied against a database that already has League rows.

*/

-- AlterTable: add the new League columns. creatorId starts NULLABLE on purpose,
-- because the table already has rows and a NOT NULL column cannot be added
-- without a default. isPrivate and inviteCode are safe as-is (isPrivate has a
-- default, inviteCode is nullable).
ALTER TABLE "League"
  ADD COLUMN "creatorId" TEXT,
  ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "inviteCode" TEXT;

-- Backfill: for every existing League without a creatorId, use the ownerId of
-- its oldest Team (the first team ever created in that league) as a stand-in
-- creator. This is a generic per-row backfill (no hardcoded ids) so it stays
-- correct even if more leagues/teams are added before this migration runs.
UPDATE "League" AS l
SET "creatorId" = (
  SELECT t."ownerId"
  FROM "Team" AS t
  WHERE t."leagueId" = l."id"
  ORDER BY t."createdAt" ASC
  LIMIT 1
)
WHERE l."creatorId" IS NULL;

-- Safety guard: if any League still has no creatorId at this point (i.e. a
-- league with zero teams), the NOT NULL step below would fail with a generic
-- Postgres error. Fail loudly and explain why instead, so this migration
-- never applies partially.
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM "League" WHERE "creatorId" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Cannot backfill League.creatorId: % league(s) have no Team to derive a creator from. Resolve manually before re-running this migration.', orphan_count;
  END IF;
END $$;

-- AlterTable: now that every row has a creatorId, enforce NOT NULL.
ALTER TABLE "League" ALTER COLUMN "creatorId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "League_inviteCode_key" ON "League"("inviteCode");

-- CreateIndex
CREATE INDEX "League_creatorId_idx" ON "League"("creatorId");

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex: one Team per (League, owner) — this constraint *is* league
-- membership, no separate LeagueMembership table. Verified today: zero
-- duplicate (leagueId, ownerId) pairs exist, so this is safe to add as-is.
CREATE UNIQUE INDEX "Team_leagueId_ownerId_key" ON "Team"("leagueId", "ownerId");
