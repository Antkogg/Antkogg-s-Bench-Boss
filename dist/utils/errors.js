export class AppError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'AppError';
    }
}
export function publicErrorMessage(error) {
    if (error instanceof AppError)
        return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
        const msg = error.message;
        if (msg.includes('Missing Access') || msg.includes('Unknown Channel')) {
            return 'The bot could not access your scouting channel. Run `/setup channels scouting:#channel-name` and check bot permissions.';
        }
        return msg;
    }
    return 'Something went wrong. Please run `/setup view` to verify server channels and permissions.';
}
//# sourceMappingURL=errors.js.map