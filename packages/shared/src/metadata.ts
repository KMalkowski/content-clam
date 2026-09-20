export interface VideoMetadata {
  videoId: string;
  title: string;
  channelName?: string;
  channelHandle?: string;
  description?: string;
  durationText?: string;
  viewsText?: string;
  publishedText?: string;
  badges?: string[];
  isShort: boolean;
}

export function channelKeyOf(meta: VideoMetadata): string | undefined {
  return meta.channelHandle ?? meta.channelName;
}

export function metadataFingerprint(meta: VideoMetadata): string {
  return hash([
    meta.videoId,
    meta.title,
    meta.channelName ?? "",
    meta.channelHandle ?? "",
    meta.description ?? "",
    meta.durationText ?? "",
    (meta.badges ?? []).join(","),
    meta.isShort ? "1" : "0",
  ].join("\u0000"));
}

export function hash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}
