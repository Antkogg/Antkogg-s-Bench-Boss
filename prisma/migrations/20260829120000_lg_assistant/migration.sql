-- Normalize historical schema drift without deleting scouting data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'SignupPosition' AND e.enumlabel = 'RW_F'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'SignupPosition' AND e.enumlabel = 'RW'
  ) THEN
    ALTER TYPE "SignupPosition" RENAME VALUE 'RW_F' TO 'RW';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Player' AND column_name = 'signupPosition'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Player' AND column_name = 'signupPositions'
  ) THEN
    ALTER TABLE "Player" ADD COLUMN "signupPositions" "SignupPosition"[];
    UPDATE "Player" SET "signupPositions" = ARRAY["signupPosition"]::"SignupPosition"[];
    ALTER TABLE "Player" ALTER COLUMN "signupPositions" SET NOT NULL;
    ALTER TABLE "Player" DROP COLUMN "signupPosition";
  END IF;
END $$;

CREATE TYPE "TeamStatus" AS ENUM ('SCOUT', 'TC', 'ROSTER', 'MANAGEMENT', 'ALUMNI_INACTIVE');
CREATE TYPE "TcStatus" AS ENUM ('UNRANKED', 'DEVELOPING', 'WATCH', 'CALL_UP_READY', 'ROSTER_PRIORITY');
CREATE TYPE "WeeklyAvailabilityStatus" AS ENUM ('DRAFT', 'OPEN', 'LOCKED', 'CLOSED');
CREATE TYPE "TcReminderPolicy" AS ENUM ('REQUIRED', 'ENCOURAGED', 'DISABLED');
CREATE TYPE "RuleDocumentKind" AS ENUM ('CONSTITUTION', 'PLAYOFF', 'BUILD_RULES', 'DISCONNECT', 'OTHER');

ALTER TABLE "GuildConfig"
  ADD COLUMN "ownerRoleId" TEXT,
  ADD COLUMN "gmRoleId" TEXT,
  ADD COLUMN "agmRoleId" TEXT,
  ADD COLUMN "rosterRoleId" TEXT,
  ADD COLUMN "tcRoleId" TEXT,
  ADD COLUMN "scoutRoleId" TEXT,
  ADD COLUMN "scoutingAnnouncementsChannelId" TEXT,
  ADD COLUMN "teamAvailabilityChannelId" TEXT,
  ADD COLUMN "teamAnnouncementsChannelId" TEXT,
  ADD COLUMN "rulesChannelId" TEXT,
  ADD COLUMN "teamName" TEXT NOT NULL DEFAULT 'Boston University',
  ADD COLUMN "seasonLabel" TEXT NOT NULL DEFAULT 'S55',
  ADD COLUMN "availabilityReminderMinutes" INTEGER[] NOT NULL DEFAULT ARRAY[1440, 360]::INTEGER[],
  ADD COLUMN "tcReminderPolicy" "TcReminderPolicy" NOT NULL DEFAULT 'ENCOURAGED';

UPDATE "GuildConfig" SET "scoutRoleId" = "registeredRoleId" WHERE "scoutRoleId" IS NULL;

ALTER TABLE "Player"
  ADD COLUMN "teamStatus" "TeamStatus" NOT NULL DEFAULT 'SCOUT',
  ADD COLUMN "tcStatus" "TcStatus" NOT NULL DEFAULT 'UNRANKED',
  ADD COLUMN "lastRelevantActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "SeasonWeek" (
  "id" TEXT NOT NULL,
  "guildConfigId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "startsOn" TIMESTAMP(3),
  "deadline" TIMESTAMP(3) NOT NULL,
  "status" "WeeklyAvailabilityStatus" NOT NULL DEFAULT 'DRAFT',
  "channelId" TEXT,
  "messageId" TEXT,
  "createdByDiscordId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeasonWeek_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyGame" (
  "id" TEXT NOT NULL,
  "weekId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "opponent" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyAvailabilitySubmission" (
  "id" TEXT NOT NULL,
  "weekId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "editedByDiscordId" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyAvailabilitySubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyAvailabilitySelection" (
  "submissionId" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyAvailabilitySelection_pkey" PRIMARY KEY ("submissionId", "gameId")
);

CREATE TABLE "WeeklyAvailabilityReminder" (
  "id" TEXT NOT NULL,
  "weekId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeeklyAvailabilityReminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerActivity" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "relatedType" TEXT,
  "relatedId" TEXT,
  "details" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RuleDocument" (
  "id" TEXT NOT NULL,
  "guildConfigId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "kind" "RuleDocumentKind" NOT NULL,
  "sourceUrl" TEXT,
  "seasonVersion" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RuleDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RuleDocumentVersion" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "versionLabel" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "contentHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByDiscordId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuleDocumentVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RuleSection" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "sectionKey" TEXT,
  "title" TEXT,
  "content" TEXT NOT NULL,
  "searchText" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "RuleSection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeasonWeek_guildConfigId_label_key" ON "SeasonWeek"("guildConfigId", "label");
CREATE INDEX "SeasonWeek_guildConfigId_status_deadline_idx" ON "SeasonWeek"("guildConfigId", "status", "deadline");
CREATE INDEX "WeeklyGame_weekId_startsAt_idx" ON "WeeklyGame"("weekId", "startsAt");
CREATE UNIQUE INDEX "WeeklyAvailabilitySubmission_weekId_playerId_key" ON "WeeklyAvailabilitySubmission"("weekId", "playerId");
CREATE INDEX "WeeklyAvailabilitySubmission_playerId_submittedAt_idx" ON "WeeklyAvailabilitySubmission"("playerId", "submittedAt");
CREATE INDEX "WeeklyAvailabilitySelection_gameId_idx" ON "WeeklyAvailabilitySelection"("gameId");
CREATE UNIQUE INDEX "WeeklyAvailabilityReminder_weekId_playerId_scheduledFor_key" ON "WeeklyAvailabilityReminder"("weekId", "playerId", "scheduledFor");
CREATE INDEX "WeeklyAvailabilityReminder_sentAt_failedAt_scheduledFor_idx" ON "WeeklyAvailabilityReminder"("sentAt", "failedAt", "scheduledFor");
CREATE INDEX "PlayerActivity_playerId_occurredAt_idx" ON "PlayerActivity"("playerId", "occurredAt");
CREATE INDEX "PlayerActivity_kind_occurredAt_idx" ON "PlayerActivity"("kind", "occurredAt");
CREATE UNIQUE INDEX "RuleDocument_guildConfigId_key_key" ON "RuleDocument"("guildConfigId", "key");
CREATE INDEX "RuleDocument_guildConfigId_active_kind_idx" ON "RuleDocument"("guildConfigId", "active", "kind");
CREATE UNIQUE INDEX "RuleDocumentVersion_documentId_versionLabel_key" ON "RuleDocumentVersion"("documentId", "versionLabel");
CREATE INDEX "RuleDocumentVersion_documentId_active_createdAt_idx" ON "RuleDocumentVersion"("documentId", "active", "createdAt");
CREATE INDEX "RuleSection_versionId_sortOrder_idx" ON "RuleSection"("versionId", "sortOrder");

ALTER TABLE "SeasonWeek" ADD CONSTRAINT "SeasonWeek_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyGame" ADD CONSTRAINT "WeeklyGame_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "SeasonWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyAvailabilitySubmission" ADD CONSTRAINT "WeeklyAvailabilitySubmission_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "SeasonWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyAvailabilitySubmission" ADD CONSTRAINT "WeeklyAvailabilitySubmission_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyAvailabilitySelection" ADD CONSTRAINT "WeeklyAvailabilitySelection_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "WeeklyAvailabilitySubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyAvailabilitySelection" ADD CONSTRAINT "WeeklyAvailabilitySelection_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "WeeklyGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyAvailabilityReminder" ADD CONSTRAINT "WeeklyAvailabilityReminder_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "SeasonWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyAvailabilityReminder" ADD CONSTRAINT "WeeklyAvailabilityReminder_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerActivity" ADD CONSTRAINT "PlayerActivity_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RuleDocument" ADD CONSTRAINT "RuleDocument_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RuleDocumentVersion" ADD CONSTRAINT "RuleDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RuleDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RuleSection" ADD CONSTRAINT "RuleSection_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "RuleDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
