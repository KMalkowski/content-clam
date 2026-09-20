export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-1.13.0";

export interface JevNoulQuestion {
  type: "noul";
  instructions: string;
}

export interface JevRequest {
  model: string;
  state: unknown;
  questions: Record<string, JevNoulQuestion>;
}

export interface JevNoulAnswer {
  type: "noul";
  noul: number;
}

export interface JevResponse {
  model: string;
  answers: Record<string, JevNoulAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

export type JevCaller = (request: JevRequest) => Promise<JevResponse>;

export class JevError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "JevError";
  }
}

export function createFetchJevCaller(apiKey: string, fetchFn: typeof fetch = fetch): JevCaller {
  return async (request) => {
    const response = await fetchFn(JEV_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const retryable = response.status === 429 || response.status >= 500;
      const detail = response.status === 401 ? "API key rejected" : text.slice(0, 200) || response.statusText;
      throw new JevError(response.status, `TypeSafe ${response.status}: ${detail}`, retryable);
    }
    return (await response.json()) as JevResponse;
  };
}

export async function withBackoff<T>(
  work: () => Promise<T>,
  attempts = 3,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  let delay = 500;
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      const retryable = error instanceof JevError ? error.retryable : true;
      if (!retryable || attempt >= attempts) throw error;
      await sleep(delay);
      delay *= 2;
    }
  }
}
