-- Persist delivery state for optional confirmed-player server/code notifications.
-- This is additive and preserves all existing lineup assignments.
ALTER TABLE "GameLineupAssignment"
  ADD COLUMN "gameInfoNotifiedAt" TIMESTAMP(3);
