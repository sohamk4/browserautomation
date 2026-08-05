import pino from 'pino';

/**
 * Application-wide Pino logger. Pretty-prints in development, structured JSON
 * in production. Pino is used throughout per the architecture's logging policy.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
