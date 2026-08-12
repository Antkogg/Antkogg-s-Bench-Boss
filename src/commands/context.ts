import type { Client } from 'discord.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { AttendanceService } from '../services/attendance.service.js';
import type { AvailabilityService } from '../services/availability.service.js';
import type { BoardService } from '../services/board.service.js';
import type { ConfigService } from '../services/config.service.js';
import type { EvaluationService } from '../services/evaluation.service.js';
import type { NotificationService } from '../services/notification.service.js';
import type { PlayerService } from '../services/player.service.js';
import type { RoleService } from '../services/role.service.js';
import type { ScoutingPostService } from '../services/scouting-post.service.js';
import type { ScoutingService } from '../services/scouting.service.js';

export interface BotContext {
  client: Client;
  prisma: PrismaClient;
  config: ConfigService;
  players: PlayerService;
  roles: RoleService;
  scouting: ScoutingService;
  posts: ScoutingPostService;
  notifications: NotificationService;
  attendance: AttendanceService;
  evaluations: EvaluationService;
  availability: AvailabilityService;
  board: BoardService;
}
