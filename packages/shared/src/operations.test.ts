import { describe, expect, it } from "vitest";
import {
  isOperationExpired,
  newOperationId,
  operationCreatedAt,
  operationExpiresAt,
  OPERATION_CLOCK_SKEW_MS,
  OPERATION_TTL_MS,
  serialQueue,
} from "./operations";

describe("operation ids", () => {
  it("carry their creation time", () => {
    const id = newOperationId(1_000);
    expect(operationCreatedAt(id)).toBe(1_000);
    expect(isOperationExpired(id, 1_000 + OPERATION_TTL_MS - 1)).toBe(false);
    expect(isOperationExpired(id, 1_000 + OPERATION_TTL_MS)).toBe(true);
  });

  it("treat malformed ids as expired", () => {
    expect(operationCreatedAt("abc")).toBeNull();
    expect(operationCreatedAt("-5.xxxxxxxxxx")).toBeNull();
    expect(operationCreatedAt("1000.x")).toBeNull();
    expect(isOperationExpired("not-an-id", 0)).toBe(true);
  });

  it("reject ids dated further ahead than the allowed clock skew", () => {
    const now = 1_000_000;
    expect(operationExpiresAt(newOperationId(now + OPERATION_CLOCK_SKEW_MS), now)).toBe(now + OPERATION_CLOCK_SKEW_MS + OPERATION_TTL_MS);
    expect(operationExpiresAt(newOperationId(now + OPERATION_CLOCK_SKEW_MS + 1), now)).toBeNull();
    expect(isOperationExpired(newOperationId(now + 365 * 24 * 60 * 60 * 1000), now)).toBe(true);
  });
});

describe("serialQueue", () => {
  it("runs updates one after another even when callers overlap", async () => {
    const run = serialQueue();
    let value = 0;
    const bump = () =>
      run(async () => {
        const seen = value;
        await new Promise((r) => setTimeout(r, 1));
        value = seen + 1;
      });
    await Promise.all([bump(), bump(), bump()]);
    expect(value).toBe(3);
  });

  it("keeps going after a failed update", async () => {
    const run = serialQueue();
    await expect(run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await run(async () => "ok")).toBe("ok");
  });
});
