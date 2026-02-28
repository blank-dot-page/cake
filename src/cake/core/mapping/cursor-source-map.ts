import { graphemeSegments } from "../../shared/segmenter";
import type { Affinity } from "../types";

export type CursorBoundary = {
  sourceBackward: number;
  sourceForward: number;
};

export type CursorSourceMap = {
  cursorLength: number;
  boundaries: CursorBoundary[];
  cursorToSource(cursorOffset: number, affinity: Affinity): number;
  sourceToCursor(
    sourceOffset: number,
    bias: Affinity,
  ): { cursorOffset: number; affinity: Affinity };
};

export function createCursorSourceMap(
  boundaries: CursorBoundary[],
  cursorLength: number,
): CursorSourceMap {
  return {
    cursorLength,
    boundaries,
    cursorToSource(cursorOffset, affinity) {
      const boundary = boundaries[cursorOffset];
      if (!boundary) {
        throw new Error(`Cursor offset out of bounds: ${cursorOffset}`);
      }
      return affinity === "backward"
        ? boundary.sourceBackward
        : boundary.sourceForward;
    },
    sourceToCursor(sourceOffset, bias) {
      if (sourceOffset <= 0) {
        return { cursorOffset: 0, affinity: bias };
      }

      const lastIndex = boundaries.length - 1;
      const lastBoundary = boundaries[lastIndex];
      if (sourceOffset >= lastBoundary.sourceForward) {
        if (lastBoundary.sourceBackward !== lastBoundary.sourceForward) {
          if (sourceOffset === lastBoundary.sourceBackward) {
            return { cursorOffset: lastIndex, affinity: "backward" };
          }
          if (sourceOffset === lastBoundary.sourceForward) {
            return { cursorOffset: lastIndex, affinity: "forward" };
          }
        }
        return { cursorOffset: lastIndex, affinity: bias };
      }

      let lo = 0;
      let hi = lastIndex;
      let candidate = lastIndex;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const boundary = boundaries[mid]!;
        if (sourceOffset <= boundary.sourceForward) {
          candidate = mid;
          hi = mid - 1;
        } else {
          lo = mid + 1;
        }
      }

      const boundary = boundaries[candidate]!;
      if (sourceOffset < boundary.sourceBackward) {
        if (bias === "forward") {
          return { cursorOffset: candidate, affinity: "forward" };
        }
        const prevIndex = Math.max(0, candidate - 1);
        return { cursorOffset: prevIndex, affinity: "backward" };
      }

      // If the source offset lands exactly on one side of a source-only span
      // (e.g. markdown markers that don't take cursor units), preserve which
      // side of the boundary it came from. This prevents caret drift when
      // marker characters become source-only after reparsing.
      if (boundary.sourceBackward !== boundary.sourceForward) {
        if (sourceOffset === boundary.sourceBackward) {
          return { cursorOffset: candidate, affinity: "backward" };
        }
        if (sourceOffset === boundary.sourceForward) {
          return { cursorOffset: candidate, affinity: "forward" };
        }
      }

      return { cursorOffset: candidate, affinity: bias };
    },
  };
}

export type CompositeCursorSourceSegment = {
  map: CursorSourceMap;
  cursorLength: number;
  sourceLength: number;
};

export function createCompositeCursorSourceMap(params: {
  segments: CompositeCursorSourceSegment[];
  cursorStarts: number[];
  sourceStarts: number[];
  cursorLength: number;
}): CursorSourceMap {
  const { segments, cursorStarts, sourceStarts, cursorLength } = params;

  if (segments.length === 0) {
    return createCursorSourceMap(
      [{ sourceBackward: 0, sourceForward: 0 }],
      cursorLength,
    );
  }

  let boundariesCache: CursorBoundary[] | null = null;

  const findSegmentIndexForCursor = (cursorOffset: number): number => {
    let lo = 0;
    let hi = cursorStarts.length - 1;
    let candidate = 0;

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const start = cursorStarts[mid]!;
      if (start <= cursorOffset) {
        candidate = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return candidate;
  };

  const toAbsoluteBoundary = (
    segmentIndex: number,
    localCursorOffset: number,
  ): CursorBoundary => {
    const segment = segments[segmentIndex];
    if (!segment) {
      throw new Error(`Segment index out of bounds: ${segmentIndex}`);
    }
    const localBoundary = segment.map.boundaries[localCursorOffset];
    if (!localBoundary) {
      throw new Error(
        `Local cursor offset out of bounds: ${localCursorOffset} for segment ${segmentIndex}`,
      );
    }
    const sourceBase = sourceStarts[segmentIndex] ?? 0;
    return {
      sourceBackward: sourceBase + localBoundary.sourceBackward,
      sourceForward: sourceBase + localBoundary.sourceForward,
    };
  };

  const boundaryAt = (cursorOffset: number): CursorBoundary => {
    if (cursorOffset < 0 || cursorOffset > cursorLength) {
      throw new Error(`Cursor offset out of bounds: ${cursorOffset}`);
    }

    const segmentIndex = findSegmentIndexForCursor(cursorOffset);
    const segment = segments[segmentIndex];
    if (!segment) {
      throw new Error(`Segment not found for cursor offset: ${cursorOffset}`);
    }

    const segmentStart = cursorStarts[segmentIndex] ?? 0;
    const local = cursorOffset - segmentStart;

    if (local <= segment.cursorLength) {
      return toAbsoluteBoundary(segmentIndex, local);
    }

    // This is the separator boundary between top-level blocks. It is represented
    // by the next block's local boundary 0.
    const nextIndex = segmentIndex + 1;
    return toAbsoluteBoundary(nextIndex, 0);
  };

  const composite = {
    cursorLength,
    boundaries: [] as CursorBoundary[],
    cursorToSource(cursorOffset: number, affinity: Affinity): number {
      const boundary = boundaryAt(cursorOffset);
      return affinity === "backward"
        ? boundary.sourceBackward
        : boundary.sourceForward;
    },
    sourceToCursor(sourceOffset: number, bias: Affinity) {
      if (sourceOffset <= 0) {
        return { cursorOffset: 0, affinity: bias };
      }

      const lastIndex = cursorLength;
      const lastBoundary = boundaryAt(lastIndex);
      if (sourceOffset >= lastBoundary.sourceForward) {
        if (lastBoundary.sourceBackward !== lastBoundary.sourceForward) {
          if (sourceOffset === lastBoundary.sourceBackward) {
            return { cursorOffset: lastIndex, affinity: "backward" as const };
          }
          if (sourceOffset === lastBoundary.sourceForward) {
            return { cursorOffset: lastIndex, affinity: "forward" as const };
          }
        }
        return { cursorOffset: lastIndex, affinity: bias };
      }

      let lo = 0;
      let hi = lastIndex;
      let candidate = lastIndex;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const boundary = boundaryAt(mid);
        if (sourceOffset <= boundary.sourceForward) {
          candidate = mid;
          hi = mid - 1;
        } else {
          lo = mid + 1;
        }
      }

      const boundary = boundaryAt(candidate);
      if (sourceOffset < boundary.sourceBackward) {
        if (bias === "forward") {
          return { cursorOffset: candidate, affinity: "forward" as const };
        }
        const prevIndex = Math.max(0, candidate - 1);
        return { cursorOffset: prevIndex, affinity: "backward" as const };
      }

      if (boundary.sourceBackward !== boundary.sourceForward) {
        if (sourceOffset === boundary.sourceBackward) {
          return { cursorOffset: candidate, affinity: "backward" as const };
        }
        if (sourceOffset === boundary.sourceForward) {
          return { cursorOffset: candidate, affinity: "forward" as const };
        }
      }

      return { cursorOffset: candidate, affinity: bias };
    },
  } satisfies CursorSourceMap;

  Object.defineProperty(composite, "boundaries", {
    enumerable: true,
    get(): CursorBoundary[] {
      if (!boundariesCache) {
        boundariesCache = [];
        for (let i = 0; i <= cursorLength; i += 1) {
          boundariesCache.push(boundaryAt(i));
        }
      }
      return boundariesCache;
    },
  });

  return composite;
}

export class CursorSourceBuilder {
  private sourceParts: string[] = [];
  private boundaries: CursorBoundary[] = [
    { sourceBackward: 0, sourceForward: 0 },
  ];
  private cursorLength = 0;
  private sourceLengthValue = 0;

  appendSourceOnly(text: string): void {
    if (!text) {
      return;
    }

    this.sourceParts.push(text);
    this.sourceLengthValue += text.length;
    const last = this.boundaries[this.boundaries.length - 1];
    last.sourceForward += text.length;
  }

  appendText(text: string): void {
    if (!text) {
      return;
    }

    // Fast path: check if entire text is ASCII
    let isAllAscii = true;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) >= 0x80) {
        isAllAscii = false;
        break;
      }
    }

    if (isAllAscii) {
      // ASCII fast path: each character is one grapheme
      for (let i = 0; i < text.length; i++) {
        const char = text[i]!;
        this.sourceParts.push(char);
        this.sourceLengthValue += 1;
        const sourceLength = this.sourceLengthValue;
        this.cursorLength += 1;
        this.boundaries.push({
          sourceBackward: sourceLength,
          sourceForward: sourceLength,
        });
      }
    } else {
      // Non-ASCII: use grapheme segmenter for proper Unicode handling
      for (const segment of graphemeSegments(text)) {
        this.sourceParts.push(segment.segment);
        this.sourceLengthValue += segment.segment.length;
        const sourceLength = this.sourceLengthValue;
        this.cursorLength += 1;
        this.boundaries.push({
          sourceBackward: sourceLength,
          sourceForward: sourceLength,
        });
      }
    }
  }

  appendCursorAtom(sourceText: string, cursorUnits = 1): void {
    if (cursorUnits < 1) {
      return;
    }

    this.sourceParts.push(sourceText);
    this.sourceLengthValue += sourceText.length;
    const sourceLength = this.sourceLengthValue;
    for (let i = 0; i < cursorUnits; i += 1) {
      this.cursorLength += 1;
      this.boundaries.push({
        sourceBackward: sourceLength,
        sourceForward: sourceLength,
      });
    }
  }

  appendSerialized(serialized: { source: string; map: CursorSourceMap }): void {
    if (!serialized.source && serialized.map.cursorLength === 0) {
      return;
    }

    const base = this.sourceLengthValue;
    const firstBoundary = serialized.map.boundaries[0];
    if (firstBoundary) {
      const last = this.boundaries[this.boundaries.length - 1];
      last.sourceBackward += firstBoundary.sourceBackward;
      last.sourceForward += firstBoundary.sourceForward;
    }
    if (serialized.source) {
      this.sourceParts.push(serialized.source);
      this.sourceLengthValue += serialized.source.length;
    }

    for (let i = 1; i < serialized.map.boundaries.length; i += 1) {
      const boundary = serialized.map.boundaries[i];
      this.cursorLength += 1;
      this.boundaries.push({
        sourceBackward: base + boundary.sourceBackward,
        sourceForward: base + boundary.sourceForward,
      });
    }
  }

  build(): { source: string; map: CursorSourceMap } {
    const source = this.sourceParts.join("");
    return {
      source,
      map: createCursorSourceMap(this.boundaries, this.cursorLength),
    };
  }
}
