export interface LimitedText {
  content: string;
  truncated: boolean;
  bytes: number;
}

export function clampMaxBytes(value: unknown, defaultBytes: number, hardCapBytes: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return defaultBytes;
  }

  return Math.min(Math.floor(value), hardCapBytes);
}

export function limitUtf8(text: string, maxBytes: number): LimitedText {
  const bytes = utf8ByteLength(text);
  if (bytes <= maxBytes) {
    return { content: text, truncated: false, bytes };
  }

  let end = Math.min(text.length, maxBytes);
  while (utf8ByteLength(text.slice(0, end)) > maxBytes && end > 0) {
    end -= 1;
  }

  const content = text.slice(0, end);
  return { content, truncated: true, bytes: utf8ByteLength(content) };
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
