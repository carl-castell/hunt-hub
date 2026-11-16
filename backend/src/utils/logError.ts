import { logger } from './logger';

/**
 * Logs an unexpected error as structured JSON (message, type and stack in
 * the `err` field). `context` says where it happened, e.g. "[requireManager]".
 */
export function logError(context: string, err: unknown): void {
  logger.error({ err }, context);
}
