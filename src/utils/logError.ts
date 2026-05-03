export function logError(prefix: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? (err.stack ?? '') : '';
  console.error(prefix, msg, stack);
}
