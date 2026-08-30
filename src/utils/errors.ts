export type ErrorCode =
  | 'NOT_REGISTERED'
  | 'NOT_CONFIGURED'
  | 'NOT_FOUND'
  | 'NOT_ALLOWED'
  | 'INELIGIBLE_POSITION'
  | 'POSITION_TAKEN'
  | 'ALREADY_SIGNED_UP'
  | 'SCHEDULE_CONFLICT'
  | 'SIGNUPS_CLOSED'
  | 'SESSION_LOCKED'
  | 'SESSION_ENDED'
  | 'WAITLIST_EXISTS'
  | 'INVALID_INPUT'
  | 'INVALID_STATE'
  | 'STALE_INTERACTION';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    const msg = (error as { message: string }).message;
    if (msg.includes('Missing Access') || msg.includes('Unknown Channel')) {
      return 'The bot could not access your scouting channel. Run `/setup channels scouting:#channel-name` and check bot permissions.';
    }
    return msg;
  }
  return 'Something went wrong. Please run `/setup view` to verify server channels and permissions.';
}
