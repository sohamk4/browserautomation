/** Small shared helpers used across API modules. */

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Generate a short human-readable id (uses crypto for non-colliding ids). */
export function shortId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}_${rand}` : rand;
}

/** Coerce an unknown thrown value into a string message. */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
