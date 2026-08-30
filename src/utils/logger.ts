import pino from 'pino';

function redactSecretText(value: string | undefined): string | undefined {
  if (!value) return value;
  let redacted = value.replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1[REDACTED]@');
  for (const secret of [process.env.DISCORD_TOKEN, process.env.DATABASE_URL]) {
    if (secret) redacted = redacted.replaceAll(secret, '[REDACTED]');
  }
  return redacted;
}

function serializeError(error: Error) {
  const serialized = pino.stdSerializers.err(error);
  return {
    ...serialized,
    message: redactSecretText(serialized.message),
    stack: redactSecretText(serialized.stack),
  };
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { app: 'antkoggs-lg-assistant' },
  redact: {
    paths: [
      'token',
      '*.token',
      'discordToken',
      '*.discordToken',
      'authorization',
      '*.authorization',
      'req.headers.authorization',
      'DATABASE_URL',
      '*.DATABASE_URL',
      'databaseUrl',
      '*.databaseUrl',
    ],
    censor: '[REDACTED]',
  },
  serializers: { error: serializeError, err: serializeError },
});
