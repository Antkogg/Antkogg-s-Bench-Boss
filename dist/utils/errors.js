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
    return 'Something went wrong. Your data is safe—please try again in a moment.';
}
//# sourceMappingURL=errors.js.map