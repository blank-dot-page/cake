export function ensureHttpsProtocol(url: string): string {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return trimmedUrl;
  }
  if (trimmedUrl.startsWith("http")) {
    return trimmedUrl;
  }
  return `https://${trimmedUrl}`;
}

export function isUrl(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (
    trimmed.includes(" ") ||
    trimmed.includes("\n") ||
    trimmed.includes("\t")
  ) {
    return false;
  }
  const candidate = trimmed;
  const looksLikeUrl =
    candidate.includes("://") ||
    candidate.startsWith("www.") ||
    candidate.startsWith("localhost") ||
    candidate.includes(".");
  if (!looksLikeUrl) {
    return false;
  }
  try {
    const withProtocol = ensureHttpsProtocol(candidate);
    const url = new URL(withProtocol);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
