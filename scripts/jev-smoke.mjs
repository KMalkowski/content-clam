import { classify, createFetchJevCaller, decide, defaultSettings, enabledCategories, withBackoff } from "../packages/shared/src/index.ts";

const key = process.env.JEV_API_KEY;
if (!key) {
  console.error("Set JEV_API_KEY to run this smoke test.");
  process.exit(1);
}

const videos = [
  { videoId: "a", title: "You WON'T BELIEVE what this billionaire did next (SHOCKING)", channelName: "Viral Vault", isShort: false },
  { videoId: "b", title: "Building a 12-bit CPU from NAND gates, part 3: the ALU", channelName: "Ben Eater", isShort: false },
  { videoId: "c", title: "Reacting to my subscribers' worst code (no commentary)", channelName: "Reactz", isShort: false },
  { videoId: "d", title: "How I made $50,000 in one week with this app (link below)", channelName: "Hustle Bro", isShort: true },
];

const settings = defaultSettings();
const call = createFetchJevCaller(key);
for (const video of videos) {
  const started = Date.now();
  const result = await classify(video, enabledCategories(settings), settings.allowedTopics, (r) => withBackoff(() => call(r)));
  const decision = decide(
    result,
    enabledCategories(settings).map((c) => c.id),
  );
  console.log(`${Date.now() - started}ms  ${result.inputTokens} tokens  ${decision.dimmed ? "DIM " : "keep"}  ${video.title}`);
  console.log(
    "   ",
    Object.entries(result.categoryScores)
      .map(([k, v]) => `${k}=${v.toFixed(2)}`)
      .join("  "),
  );
}
