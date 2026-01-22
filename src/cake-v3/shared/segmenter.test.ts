import { describe, expect, it } from "vitest";
import {
  graphemeClusterLengthAfter,
  graphemeClusterLengthBefore,
  graphemeSegments,
  wordSegments,
} from "./segmenter";

function graphemeBoundarySet(text: string): Set<number> {
  const boundaries = new Set<number>();
  for (const segment of graphemeSegments(text)) {
    boundaries.add(segment.index);
    boundaries.add(segment.index + segment.segment.length);
  }
  boundaries.add(text.length);
  return boundaries;
}

function expectSegmentsCoverText(
  text: string,
  segments: { segment: string; index: number }[],
) {
  let cursor = 0;
  for (const segment of segments) {
    expect(segment.index).toBe(cursor);
    cursor += segment.segment.length;
  }
  expect(cursor).toBe(text.length);
}

describe("segmenter grapheme clusters", () => {
  it("treats combining marks as a single grapheme", () => {
    const text = "e\u0301";
    const segments = graphemeSegments(text);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.segment).toBe(text);
    expect(graphemeClusterLengthBefore(text, text.length)).toBe(text.length);
    expect(graphemeClusterLengthAfter(text, 0)).toBe(text.length);
  });

  it("keeps emoji sequences intact", () => {
    const emoji = "👩🏽‍💻";
    const flag = "🇺🇸";

    const emojiSegments = graphemeSegments(emoji);
    const flagSegments = graphemeSegments(flag);

    expect(emojiSegments).toHaveLength(1);
    expect(flagSegments).toHaveLength(1);
    expect(emojiSegments[0]?.segment).toBe(emoji);
    expect(flagSegments[0]?.segment).toBe(flag);
  });

  it("segments Japanese text into grapheme units", () => {
    const text = "こんにちは";
    const segments = graphemeSegments(text);

    expect(segments).toHaveLength(text.length);
    expectSegmentsCoverText(text, segments);
  });

  it("segments Arabic text into grapheme units", () => {
    const text = "مرحبا";
    const segments = graphemeSegments(text);

    expect(segments).toHaveLength(text.length);
    expectSegmentsCoverText(text, segments);
  });
});

describe("segmenter word boundaries", () => {
  it("produces deterministic, contiguous word segments in English", () => {
    const text = "Hello, world!";
    const segments = wordSegments(text, "en");

    expectSegmentsCoverText(text, segments);
  });

  it("does not split grapheme clusters in Japanese", () => {
    const text = "こんにちは世界";
    const segments = wordSegments(text, "ja");
    const boundaries = graphemeBoundarySet(text);

    expectSegmentsCoverText(text, segments);
    for (const segment of segments) {
      const start = segment.index;
      const end = segment.index + segment.segment.length;
      expect(boundaries.has(start)).toBe(true);
      expect(boundaries.has(end)).toBe(true);
    }
  });

  it("does not split grapheme clusters in Arabic", () => {
    const text = "مرحبا بالعالم";
    const segments = wordSegments(text, "ar");
    const boundaries = graphemeBoundarySet(text);

    expectSegmentsCoverText(text, segments);
    for (const segment of segments) {
      const start = segment.index;
      const end = segment.index + segment.segment.length;
      expect(boundaries.has(start)).toBe(true);
      expect(boundaries.has(end)).toBe(true);
    }
  });
});
