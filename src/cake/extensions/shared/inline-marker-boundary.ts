const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_]/u;

export function hasInlineMarkerBoundaryBefore(
  source: string,
  markerStart: number,
): boolean {
  if (markerStart <= 0) {
    return true;
  }

  return !WORD_CHARACTER_PATTERN.test(source[markerStart - 1] ?? "");
}
