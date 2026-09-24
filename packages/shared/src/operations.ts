export const OPERATION_TTL_MS = 15 * 60 * 1000;
export const OPERATION_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function newOperationId(now = Date.now()): string {
  return `${now}.${crypto.randomUUID()}`;
}

export function operationCreatedAt(operationId: string): number | null {
  const dot = operationId.indexOf(".");
  if (dot <= 0) return null;
  const createdAt = Number(operationId.slice(0, dot));
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0) return null;
  if (operationId.length - dot - 1 < 8) return null;
  return createdAt;
}

export function operationExpiresAt(operationId: string, now = Date.now()): number | null {
  const createdAt = operationCreatedAt(operationId);
  if (createdAt === null || createdAt > now + OPERATION_CLOCK_SKEW_MS) return null;
  return createdAt + OPERATION_TTL_MS;
}

export function isOperationExpired(operationId: string, now = Date.now()): boolean {
  const expiresAt = operationExpiresAt(operationId, now);
  return expiresAt === null || expiresAt <= now;
}

export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
  };
}
