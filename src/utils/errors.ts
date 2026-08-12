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
  return 'Something went wrong. Your data is safe—please try again in a moment.';
}
