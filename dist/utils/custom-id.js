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
    'modal-register',
    'modal-manage',
]);
export function customId(action, entityId, value) {
    const id = ['bb', action, entityId, value].filter(Boolean).join(':');
    if (id.length > DISCORD_LIMITS.customId)
        throw new Error('Generated Discord custom ID is too long.');
    return id;
}
export function parseCustomId(id) {
    const [namespace, rawAction, entityId, value] = id.split(':');
    const action = actionSchema.safeParse(rawAction);
    if (namespace !== 'bb' || !action.success || !entityId) {
        throw new AppError('STALE_INTERACTION', 'That control is no longer valid. Refresh and try again.');
    }
    return value ? { action: action.data, entityId, value } : { action: action.data, entityId };
}
//# sourceMappingURL=custom-id.js.map