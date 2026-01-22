import { wordSegments } from "./segmenter";

type WordSegment = {
  segment: string;
  index: number;
  isWordLike: boolean;
};

function getWordSegments(text: string): WordSegment[] {
  return wordSegments(text).map((seg) => ({
    segment: seg.segment,
    index: seg.index,
    isWordLike: seg.isWordLike ?? false,
  }));
}

function isWhitespaceOnly(segment: string): boolean {
  return /^\s+$/.test(segment);
}

function isPunctuationOnly(segment: string): boolean {
  return /^[\p{P}\p{S}]+$/u.test(segment);
}

function isNavigableWord(segment: WordSegment): boolean {
  if (segment.isWordLike) {
    return true;
  }
  if (isWhitespaceOnly(segment.segment)) {
    return false;
  }
  if (isPunctuationOnly(segment.segment)) {
    return false;
  }
  return true;
}

/**
 * Find word boundaries at a given offset.
 * Returns the start and end offsets of the word (or non-word segment) at the position.
 */
export function getWordBoundariesAt(
  text: string,
  offset: number,
): { start: number; end: number } {
  if (text.length === 0) {
    return { start: 0, end: 0 };
  }

  const clampedOffset = Math.max(0, Math.min(offset, text.length));
  const segments = getWordSegments(text);

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const segEnd = seg.index + seg.segment.length;

    if (clampedOffset >= seg.index && clampedOffset < segEnd) {
      return { start: seg.index, end: segEnd };
    }

    if (clampedOffset === segEnd && i === segments.length - 1) {
      return { start: seg.index, end: segEnd };
    }
  }

  if (segments.length > 0) {
    const lastSeg = segments[segments.length - 1];
    return {
      start: lastSeg.index,
      end: lastSeg.index + lastSeg.segment.length,
    };
  }

  return { start: 0, end: 0 };
}

/**
 * Get word boundaries for double-click selection.
 * Handles edge cases like clicking at newlines or end of text.
 */
export function getWordBoundaries(
  text: string,
  offset: number,
): { start: number; end: number } {
  const maxLength = text.length;
  if (maxLength === 0) {
    return { start: 0, end: 0 };
  }

  const clampedOffset = Math.max(0, Math.min(offset, maxLength));

  let adjustedOffset = clampedOffset;
  if (adjustedOffset >= maxLength) {
    adjustedOffset = maxLength - 1;
  }
  const char = text[adjustedOffset] ?? "";
  if (char === "\n" && adjustedOffset > 0) {
    adjustedOffset = adjustedOffset - 1;
  }

  return getWordBoundariesAt(text, adjustedOffset);
}

export function prevWordBreak(text: string, offset: number): number {
  if (offset <= 0 || text.length === 0) {
    return 0;
  }
  const clampedOffset = Math.min(offset, text.length);
  const segments = getWordSegments(text);

  let targetIndex = -1;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    const segmentEnd = segment.index + segment.segment.length;
    if (segmentEnd <= clampedOffset) {
      if (isNavigableWord(segment)) {
        targetIndex = i;
        break;
      }
      targetIndex = i - 1;
      break;
    }
    if (segment.index < clampedOffset && isNavigableWord(segment)) {
      targetIndex = i;
      break;
    }
  }

  for (let i = targetIndex; i >= 0; i -= 1) {
    const segment = segments[i];
    if (!isNavigableWord(segment)) {
      continue;
    }
    let start = segment.index;
    for (let j = i - 1; j >= 0; j -= 1) {
      const previous = segments[j];
      if (!isNavigableWord(previous)) {
        break;
      }
      const previousEnd = previous.index + previous.segment.length;
      if (previousEnd !== start) {
        break;
      }
      start = previous.index;
    }
    return start;
  }

  return 0;
}

export function nextWordBreak(text: string, offset: number): number {
  if (offset >= text.length || text.length === 0) {
    return text.length;
  }
  const clampedOffset = Math.max(0, offset);
  const segments = getWordSegments(text);

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const segmentEnd = segment.index + segment.segment.length;

    if (segment.index <= clampedOffset && clampedOffset < segmentEnd) {
      if (isNavigableWord(segment)) {
        let end = segmentEnd;
        for (let j = i + 1; j < segments.length; j += 1) {
          const next = segments[j];
          if (!isNavigableWord(next)) {
            break;
          }
          if (next.index !== end) {
            break;
          }
          end = next.index + next.segment.length;
        }
        return end;
      }
      for (let j = i + 1; j < segments.length; j += 1) {
        if (isNavigableWord(segments[j])) {
          let end = segments[j].index + segments[j].segment.length;
          for (let k = j + 1; k < segments.length; k += 1) {
            const next = segments[k];
            if (!isNavigableWord(next)) {
              break;
            }
            if (next.index !== end) {
              break;
            }
            end = next.index + next.segment.length;
          }
          return end;
        }
      }
      return text.length;
    }

    if (segment.index > clampedOffset && isNavigableWord(segment)) {
      let end = segmentEnd;
      for (let j = i + 1; j < segments.length; j += 1) {
        const next = segments[j];
        if (!isNavigableWord(next)) {
          break;
        }
        if (next.index !== end) {
          break;
        }
        end = next.index + next.segment.length;
      }
      return end;
    }
  }

  return text.length;
}
