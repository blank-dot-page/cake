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
        return { cursorOffset: lastIndex, affinity: bias };
      }

      for (let i = 0; i < boundaries.length; i += 1) {
        const boundary = boundaries[i];
        if (sourceOffset > boundary.sourceForward) {
          continue;
        }

        if (sourceOffset < boundary.sourceBackward) {
          if (bias === "forward") {
            return { cursorOffset: i, affinity: "forward" };
          }
          const prevIndex = Math.max(0, i - 1);
          return { cursorOffset: prevIndex, affinity: "backward" };
        }

        return { cursorOffset: i, affinity: bias };
      }

      return { cursorOffset: lastIndex, affinity: bias };
    },
  };
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
