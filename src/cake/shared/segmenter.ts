export type GraphemeSegment = {
  segment: string;
  index: number;
  input: string;
};

export type WordSegment = GraphemeSegment & {
  isWordLike: boolean;
};

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

export function graphemeSegments(text: string): GraphemeSegment[] {
  return Array.from(graphemeSegmenter.segment(text));
}

export function wordSegments(text: string, locale = "en"): WordSegment[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
  return Array.from(segmenter.segment(text)).map((segment) => ({
    ...segment,
    isWordLike: segment.isWordLike ?? false,
  }));
}

export function graphemeClusterLengthBefore(
  text: string,
  offset: number,
): number {
  if (offset <= 0) {
    return 0;
  }

  let lastStart = 0;
  let lastEnd = 0;

  for (const segment of graphemeSegmenter.segment(text)) {
    const start = segment.index;
    const end = start + segment.segment.length;

    if (end >= offset) {
      return offset - start;
    }

    lastStart = start;
    lastEnd = end;
  }

  return lastEnd - lastStart;
}

export function graphemeClusterLengthAfter(
  text: string,
  offset: number,
): number {
  if (offset >= text.length) {
    return 0;
  }

  for (const segment of graphemeSegmenter.segment(text)) {
    const start = segment.index;
    const end = start + segment.segment.length;

    if (start >= offset) {
      return end - start;
    }

    if (start < offset && end > offset) {
      return end - offset;
    }
  }

  return 0;
}
