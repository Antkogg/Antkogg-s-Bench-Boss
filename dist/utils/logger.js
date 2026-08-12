import pino from 'pino';
export const logger = pino({
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    base: { app: 'bench-boss' },
    redact: {
        paths: ['token', '*.token', 'authorization', '*.authorization', 'DATABASE_URL'],
        censor: '[REDACTED]',
    },
    serializers: { error: pino.stdSerializers.err, err: pino.stdSerializers.err },
});
//# sourceMappingURL=logger.js.map