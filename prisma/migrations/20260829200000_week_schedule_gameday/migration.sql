-- Make the existing WeeklyGame records the single source of truth for the regular season.
-- Existing weeks, games, submissions, and selected-game availability are preserved.

CREATE TYPE "SeasonStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "ScheduleDay" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'OTHER');
CREATE TYPE "HomeAway" AS ENUM ('HOME', 'AWAY');
CREATE TYPE "WeeklyGameStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED', 'POSTPONED');
CREATE TYPE "GameAvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

ALTER TABLE "GuildConfig"
  ADD COLUMN "availabilityDeadlineDayOffset" INTEGER NOT NULL DEFAULT -1,
  ADD COLUMN "availabilityDeadlineLocalTime" TEXT NOT NULL DEFAULT '20:00',
  ADD COLUMN "availabilityOpeningNotices" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "serverCodeReminderMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "notifyConfirmedGameInfo" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "ManagementProfile" (
  "id" TEXT NOT NULL,
  "guildConfigId" TEXT NOT NULL,
  "discordUserId" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagementProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Season" (
  "id" TEXT NOT NULL,
  "guildConfigId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "status" "SeasonStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByDiscordId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SeasonWeek"
  ADD COLUMN "seasonId" TEXT,
  ADD COLUMN "weekNumber" INTEGER,
  ADD COLUMN "openedAt" TIMESTAMP(3),
  ADD COLUMN "lockedAt" TIMESTAMP(3);

ALTER TABLE "WeeklyGame" RENAME COLUMN "startsAt" TO "scheduledAtUtc";
ALTER TABLE "WeeklyGame" RENAME COLUMN "opponent" TO "opponentNameSnapshot";
ALTER TABLE "WeeklyGame"
  ADD COLUMN "opponentId" TEXT,
  ADD COLUMN "localEntryTimezone" TEXT,
  ADD COLUMN "homeAway" "HomeAway",
  ADD COLUMN "status" "WeeklyGameStatus" NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN "gameServer" TEXT,
  ADD COLUMN "gameCode" TEXT,
  ADD COLUMN "serverCodeUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "serverCodeUpdatedBy" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "createdByDiscordId" TEXT;

UPDATE "WeeklyGame" game
SET
  "localEntryTimezone" = config."timezone",
  "createdByDiscordId" = week."createdByDiscordId"
FROM "SeasonWeek" week
JOIN "GuildConfig" config ON config."id" = week."guildConfigId"
WHERE game."weekId" = week."id";

ALTER TABLE "WeeklyGame"
  ALTER COLUMN "localEntryTimezone" SET NOT NULL,
  ALTER COLUMN "createdByDiscordId" SET NOT NULL;

ALTER TABLE "WeeklyAvailabilitySelection"
  ADD COLUMN "status" "GameAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN "updatedByDiscordId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- An existing submission implied UNAVAILABLE for games that existed when it was saved.
-- Games created after that save stay absent, which correctly means NO RESPONSE.
INSERT INTO "WeeklyAvailabilitySelection" (
  "submissionId", "gameId", "status", "updatedByDiscordId", "createdAt", "updatedAt"
)
SELECT
  submission."id",
  game."id",
  'UNAVAILABLE'::"GameAvailabilityStatus",
  submission."editedByDiscordId",
  submission."submittedAt",
  submission."updatedAt"
FROM "WeeklyAvailabilitySubmission" submission
JOIN "WeeklyGame" game ON game."weekId" = submission."weekId"
WHERE game."createdAt" <= submission."updatedAt"
  AND NOT EXISTS (
    SELECT 1 FROM "WeeklyAvailabilitySelection" existing
    WHERE existing."submissionId" = submission."id" AND existing."gameId" = game."id"
  );

ALTER TABLE "WeeklyAvailabilityReminder" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DEADLINE';
DROP INDEX "WeeklyAvailabilityReminder_weekId_playerId_scheduledFor_key";
CREATE UNIQUE INDEX "WeeklyAvailabilityReminder_weekId_playerId_kind_scheduledFor_key"
  ON "WeeklyAvailabilityReminder"("weekId", "playerId", "kind", "scheduledFor");

CREATE TABLE "StandardGameSlot" (
  "id" TEXT NOT NULL,
  "guildConfigId" TEXT NOT NULL,
  "day" "ScheduleDay" NOT NULL,
  "slotNumber" INTEGER NOT NULL,
  "localTime" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StandardGameSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Opponent" (
  "id" TEXT NOT NULL,
  "guildConfigId" TEXT NOT NULL,
  "seasonId" TEXT,
  "name" TEXT NOT NULL,
  "abbreviation" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lgTeamId" TEXT,
  "teamUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Opponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameLineupAssignment" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "position" "ScoutingPosition" NOT NULL,
  "availabilityOverride" BOOLEAN NOT NULL DEFAULT false,
  "assignedByDiscordId" TEXT NOT NULL,
  "confirmed" BOOLEAN NOT NULL DEFAULT false,
  "confirmedAt" TIMESTAMP(3),
  "confirmationNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameLineupAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameManagementReminder" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "messageId" TEXT,
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameManagementReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagementProfile_guildConfigId_discordUserId_key" ON "ManagementProfile"("guildConfigId", "discordUserId");
CREATE INDEX "ManagementProfile_discordUserId_idx" ON "ManagementProfile"("discordUserId");
CREATE UNIQUE INDEX "Season_guildConfigId_number_key" ON "Season"("guildConfigId", "number");
CREATE INDEX "Season_guildConfigId_status_idx" ON "Season"("guildConfigId", "status");
CREATE UNIQUE INDEX "SeasonWeek_seasonId_weekNumber_key" ON "SeasonWeek"("seasonId", "weekNumber");
DROP INDEX "WeeklyGame_weekId_startsAt_idx";
CREATE INDEX "WeeklyGame_weekId_scheduledAtUtc_idx" ON "WeeklyGame"("weekId", "scheduledAtUtc");
CREATE INDEX "WeeklyGame_status_scheduledAtUtc_idx" ON "WeeklyGame"("status", "scheduledAtUtc");
CREATE UNIQUE INDEX "StandardGameSlot_guildConfigId_day_slotNumber_key" ON "StandardGameSlot"("guildConfigId", "day", "slotNumber");
CREATE INDEX "StandardGameSlot_guildConfigId_active_day_idx" ON "StandardGameSlot"("guildConfigId", "active", "day");
CREATE UNIQUE INDEX "Opponent_guildConfigId_seasonId_name_key" ON "Opponent"("guildConfigId", "seasonId", "name");
CREATE INDEX "Opponent_guildConfigId_active_name_idx" ON "Opponent"("guildConfigId", "active", "name");
CREATE UNIQUE INDEX "GameLineupAssignment_gameId_playerId_key" ON "GameLineupAssignment"("gameId", "playerId");
CREATE UNIQUE INDEX "GameLineupAssignment_gameId_position_key" ON "GameLineupAssignment"("gameId", "position");
CREATE INDEX "GameLineupAssignment_playerId_confirmed_createdAt_idx" ON "GameLineupAssignment"("playerId", "confirmed", "createdAt");
CREATE UNIQUE INDEX "GameManagementReminder_gameId_scheduledFor_key" ON "GameManagementReminder"("gameId", "scheduledFor");
CREATE INDEX "GameManagementReminder_sentAt_failedAt_scheduledFor_idx" ON "GameManagementReminder"("sentAt", "failedAt", "scheduledFor");

ALTER TABLE "ManagementProfile" ADD CONSTRAINT "ManagementProfile_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Season" ADD CONSTRAINT "Season_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeasonWeek" ADD CONSTRAINT "SeasonWeek_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeeklyGame" ADD CONSTRAINT "WeeklyGame_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "Opponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StandardGameSlot" ADD CONSTRAINT "StandardGameSlot_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opponent" ADD CONSTRAINT "Opponent_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opponent" ADD CONSTRAINT "Opponent_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GameLineupAssignment" ADD CONSTRAINT "GameLineupAssignment_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "WeeklyGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameLineupAssignment" ADD CONSTRAINT "GameLineupAssignment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameManagementReminder" ADD CONSTRAINT "GameManagementReminder_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "WeeklyGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
