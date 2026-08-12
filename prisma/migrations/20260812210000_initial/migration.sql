-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SignupPosition" AS ENUM ('LW', 'C', 'RW_F', 'LD', 'RD', 'G');

-- CreateEnum
CREATE TYPE "PositionGroup" AS ENUM ('FORWARD', 'DEFENSE', 'GOALIE');

-- CreateEnum
CREATE TYPE "ScoutingPosition" AS ENUM ('LW', 'C', 'RW', 'LD', 'RD', 'G');

-- CreateEnum
CREATE TYPE "SessionFormat" AS ENUM ('ONE_SIDE', 'PRIVATE_6V6');

-- CreateEnum
CREATE TYPE "SignupMode" AS ENUM ('OPEN_SIGNUP', 'AVAILABILITY');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'LOCKED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LineupTeam" AS ENUM ('TEAM_1', 'TEAM_2');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'DECLINED', 'PROMOTED', 'EXPIRED', 'LEFT');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PLAYED', 'NO_SHOW', 'EXCUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InternalPlayerStatus" AS ENUM ('UNSCOUTED', 'SCOUTED', 'WATCH', 'INTERESTED', 'SHORTLIST', 'PRIORITY', 'PASS');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SIGNUP_CONFIRMATION', 'POSITION_CHANGED', 'REMOVED', 'WAITLIST_JOINED', 'WAITLIST_PROMOTION', 'GAME_REMINDER', 'LINEUP_LOCKED', 'GAME_CANCELLED');

-- CreateTable
CREATE TABLE "GuildConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "managementRoleId" TEXT,
    "registeredRoleId" TEXT,
    "forwardRoleId" TEXT,
    "defenseRoleId" TEXT,
    "goalieRoleId" TEXT,
    "positionRoleIds" JSONB,
    "scoutingChannelId" TEXT,
    "managementChannelId" TEXT,
    "defaultFormat" "SessionFormat" NOT NULL DEFAULT 'ONE_SIDE',
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "reminderMinutes" INTEGER[] DEFAULT ARRAY[60, 15]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "discordDisplayName" TEXT NOT NULL,
    "discordAvatarUrl" TEXT,
    "lgUsername" TEXT NOT NULL,
    "lgUsernameNormalized" TEXT NOT NULL,
    "signupPosition" "SignupPosition" NOT NULL,
    "positionGroup" "PositionGroup" NOT NULL,
    "eaTag" TEXT NOT NULL,
    "eaTagNormalized" TEXT NOT NULL,
    "registered" BOOLEAN NOT NULL DEFAULT true,
    "internalStatus" "InternalPlayerStatus" NOT NULL DEFAULT 'UNSCOUTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutingSession" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "format" "SessionFormat" NOT NULL,
    "signupMode" "SignupMode" NOT NULL DEFAULT 'OPEN_SIGNUP',
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "signupsOpen" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "channelId" TEXT,
    "messageId" TEXT,
    "createdByDiscordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoutingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutingAssignment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "team" "LineupTeam" NOT NULL DEFAULT 'TEAM_1',
    "position" "ScoutingPosition" NOT NULL,
    "slotIndex" INTEGER NOT NULL DEFAULT 0,
    "eligibilityOverride" BOOLEAN NOT NULL DEFAULT false,
    "conflictOverride" BOOLEAN NOT NULL DEFAULT false,
    "assignedByDiscordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoutingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "positionGroup" "PositionGroup" NOT NULL,
    "preferredPosition" "ScoutingPosition",
    "queueOrder" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "offeredPosition" "ScoutingPosition",
    "offerToken" TEXT,
    "offerExpiresAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "evaluatorDiscordId" TEXT NOT NULL,
    "overall" INTEGER NOT NULL,
    "offense" INTEGER NOT NULL,
    "defense" INTEGER NOT NULL,
    "hockeyIq" INTEGER NOT NULL,
    "puckMovement" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "privateNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerNote" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "authorDiscordId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderDispatch" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "notificationType" "NotificationType" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "guildConfigId" TEXT NOT NULL,
    "actorDiscordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuildConfig_guildId_key" ON "GuildConfig"("guildId");

-- CreateIndex
CREATE INDEX "Player_guildConfigId_lgUsernameNormalized_idx" ON "Player"("guildConfigId", "lgUsernameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Player_guildConfigId_discordUserId_key" ON "Player"("guildConfigId", "discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_guildConfigId_eaTagNormalized_key" ON "Player"("guildConfigId", "eaTagNormalized");

-- CreateIndex
CREATE INDEX "ScoutingSession_guildConfigId_startsAt_idx" ON "ScoutingSession"("guildConfigId", "startsAt");

-- CreateIndex
CREATE INDEX "ScoutingSession_status_startsAt_idx" ON "ScoutingSession"("status", "startsAt");

-- CreateIndex
CREATE INDEX "ScoutingAssignment_playerId_createdAt_idx" ON "ScoutingAssignment"("playerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScoutingAssignment_sessionId_playerId_key" ON "ScoutingAssignment"("sessionId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoutingAssignment_sessionId_team_position_slotIndex_key" ON "ScoutingAssignment"("sessionId", "team", "position", "slotIndex");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_offerToken_key" ON "WaitlistEntry"("offerToken");

-- CreateIndex
CREATE INDEX "WaitlistEntry_sessionId_positionGroup_status_queueOrder_idx" ON "WaitlistEntry"("sessionId", "positionGroup", "status", "queueOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_sessionId_playerId_key" ON "WaitlistEntry"("sessionId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_sessionId_positionGroup_queueOrder_key" ON "WaitlistEntry"("sessionId", "positionGroup", "queueOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_sessionId_playerId_key" ON "Availability"("sessionId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_sessionId_playerId_key" ON "Attendance"("sessionId", "playerId");

-- CreateIndex
CREATE INDEX "Evaluation_playerId_createdAt_idx" ON "Evaluation"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerNote_playerId_createdAt_idx" ON "PlayerNote"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "ReminderDispatch_sentAt_failedAt_scheduledFor_idx" ON "ReminderDispatch"("sentAt", "failedAt", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderDispatch_sessionId_playerId_notificationType_schedu_key" ON "ReminderDispatch"("sessionId", "playerId", "notificationType", "scheduledFor");

-- CreateIndex
CREATE INDEX "AuditLog_guildConfigId_createdAt_idx" ON "AuditLog"("guildConfigId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutingSession" ADD CONSTRAINT "ScoutingSession_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutingAssignment" ADD CONSTRAINT "ScoutingAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScoutingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutingAssignment" ADD CONSTRAINT "ScoutingAssignment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScoutingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScoutingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScoutingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerNote" ADD CONSTRAINT "PlayerNote_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDispatch" ADD CONSTRAINT "ReminderDispatch_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScoutingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
