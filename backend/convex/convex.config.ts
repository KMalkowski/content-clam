import { defineApp } from "convex/server";
import stripe from "@convex-dev/stripe/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp();
app.use(stripe);
app.use(rateLimiter);

export default app;
