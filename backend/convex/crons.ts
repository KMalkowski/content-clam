import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("sweep expired billing receipts", { minutes: 10 }, internal.billing.sweepExpiredReceipts, {});
export default crons;
