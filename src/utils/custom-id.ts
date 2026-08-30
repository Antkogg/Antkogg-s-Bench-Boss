import { z } from 'zod';
import { DISCORD_LIMITS } from '../config/constants.js';
import { AppError } from './errors.js';

const actionSchema = z.enum([
  'signup',
  'switch',
  'switch-confirm',
  'leave',
  'leave-confirm',
  'waitlist',
  'offer',
  'manage',
  'manage-action',
  'register-position',
  'profile-action',
  'availability',
  'weekly-availability',
  'weekly-availability-select',
  'week-action',
  'week-game-select',
  'modal-week-day',
  'lineup-action',
  'lineup-position-select',
  'lineup-player-select',
  'game-action',
  'modal-game-code',
  'game-status-select',
  'player-game',
  'availability-remind',
  'team-action',
  'rules-action',
  'modal-register',
  'modal-manage',
  'manage-hub',
]);

export type ComponentAction = z.infer<typeof actionSchema>;

export interface ParsedCustomId {
  action: ComponentAction;
  entityId: string;
  value?: string;
}

export function customId(action: ComponentAction, entityId: string, value?: string): string {
  const id = ['bb', action, entityId, value].filter(Boolean).join(':');
  if (id.length > DISCORD_LIMITS.customId)
    throw new Error('Generated Discord custom ID is too long.');
  return id;
}

export function parseCustomId(id: string): ParsedCustomId {
  const [namespace, rawAction, entityId, value] = id.split(':');
  const action = actionSchema.safeParse(rawAction);
  if (namespace !== 'bb' || !action.success || !entityId) {
    throw new AppError(
      'STALE_INTERACTION',
      'That control is no longer valid. Refresh and try again.',
    );
  }
  return value ? { action: action.data, entityId, value } : { action: action.data, entityId };
}
