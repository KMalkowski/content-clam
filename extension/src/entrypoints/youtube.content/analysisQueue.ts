import type { VideoMetadata } from "@content-clam/shared";
import type { AnalysisOutcome } from "../../lib/messages";

export const RETRY_DELAY_MS = 60_000;
const CHUNK_SIZE = 12;

export interface AnalysisQueueOptions {
  analyze: (videos: VideoMetadata[]) => Promise<AnalysisOutcome[]>;
  onOutcome: (outcome: AnalysisOutcome) => void;
  now?: () => number;
}

export class AnalysisQueue {
  private outcomes = new Map<string, AnalysisOutcome>();
  private retryAfter = new Map<string, number>();
  private queued = new Set<string>();
  private generation = 0;
  private now: () => number;

  constructor(private options: AnalysisQueueOptions) {
    this.now = options.now ?? Date.now;
  }

  outcomeFor(videoId: string): AnalysisOutcome | undefined {
    return this.outcomes.get(videoId);
  }

  isWaiting(videoId: string): boolean {
    return this.queued.has(videoId) || (this.retryAfter.get(videoId) ?? 0) > this.now();
  }

  request(videos: VideoMetadata[]): void {
    const fresh = videos.filter((video) => !this.outcomes.has(video.videoId) && !this.isWaiting(video.videoId));
    const unique = [...new Map(fresh.map((video) => [video.videoId, video])).values()];
    if (!unique.length) return;
    for (const video of unique) this.queued.add(video.videoId);
    void this.send(unique, this.generation);
  }

  reset(): void {
    this.generation++;
    this.outcomes.clear();
    this.retryAfter.clear();
    this.queued.clear();
  }

  private async send(videos: VideoMetadata[], generation: number) {
    for (let i = 0; i < videos.length; i += CHUNK_SIZE) {
      const chunk = videos.slice(i, i + CHUNK_SIZE);
      let outcomes: AnalysisOutcome[];
      try {
        outcomes = await this.options.analyze(chunk);
      } catch {
        outcomes = chunk.map((video) => ({ videoId: video.videoId, decision: null, reasons: [] }));
      }
      if (generation !== this.generation) return;
      for (const video of chunk) this.queued.delete(video.videoId);
      for (const outcome of outcomes) this.receive(outcome);
    }
  }

  private receive(outcome: AnalysisOutcome) {
    if (outcome.decision) this.outcomes.set(outcome.videoId, outcome);
    else this.retryAfter.set(outcome.videoId, this.now() + RETRY_DELAY_MS);
    this.options.onOutcome(outcome);
  }
}
