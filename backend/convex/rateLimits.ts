import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  signup: { kind: "fixed window", rate: 200, period: HOUR },
  analyze: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 200 },
  checkout: { kind: "fixed window", rate: 10, period: HOUR },
});
