import { describe, expect, it } from "vitest";
import type { Selection } from "../../core/types";
import type { LayoutModel, LineInfo } from "./selection-layout";
import { moveSelectionVertically } from "./selection-navigation";

function asciiLineInfo(params: {
  lineIndex: number;
  length: number;
  lineStartOffset?: number;
  hasNewline?: boolean;
  isAtomic?: boolean;
}): LineInfo {
  const text = "x".repeat(params.length);
  return {
    lineIndex: params.lineIndex,
    lineStartOffset: params.lineStartOffset ?? 0,
    text,
    cursorLength: params.length,
    hasNewline: params.hasNewline ?? false,
    cursorToCodeUnit: Array.from({ length: params.length + 1 }, (_, i) => i),
    isAtomic: params.isAtomic ?? false,
  };
}

function collapsed(offset: number): Selection {
  return { start: offset, end: offset, affinity: "forward" };
}

function resolveOffsetToLine(lines: LineInfo[], offset: number) {
  if (lines.length === 0) {
    return { lineIndex: 0, offsetInLine: 0 };
  }
  const lastLine = lines[lines.length - 1]!;
  const totalLength = lastLine.lineStartOffset + lastLine.cursorLength;
  const clampedOffset = Math.max(0, Math.min(offset, totalLength));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const lineStart = line.lineStartOffset;
    const lineEnd = lineStart + line.cursorLength;
    if (clampedOffset <= lineEnd || index === lines.length - 1) {
      return { lineIndex: index, offsetInLine: clampedOffset - lineStart };
    }
  }

  return {
    lineIndex: lines.length - 1,
    offsetInLine: lastLine.cursorLength,
  };
}

describe("selection-navigation: moveSelectionVertically", () => {
  it("moves within wrapped rows using goalX (end of last row -> previous row)", () => {
    const lines: LineInfo[] = [
      asciiLineInfo({ lineIndex: 0, lineStartOffset: 0, length: 20 }),
    ];
    const layout: LayoutModel = {
      container: { top: 0, left: 0, width: 200, height: 20 },
      lines: [
        {
          lineIndex: 0,
          lineStartOffset: 0,
          lineLength: 20,
          lineHasNewline: false,
          lineBox: { top: 0, left: 0, width: 200, height: 20 },
          rows: [
            {
              startOffset: 0,
              endOffset: 10,
              rect: { top: 0, left: 0, width: 100, height: 10 },
            },
            {
              startOffset: 10,
              endOffset: 20,
              rect: { top: 10, left: 0, width: 60, height: 10 },
            },
          ],
        },
      ],
    };

    const result = moveSelectionVertically({
      lines,
      layout,
      selection: collapsed(20),
      resolveOffsetToLine: (offset) => resolveOffsetToLine(lines, offset),
      direction: "up",
      goalX: null,
    });

    expect(result).not.toBeNull();
    expect(result!.goalX).toBeCloseTo(60, 4);
    expect(result!.selection).toEqual({
      start: 6,
      end: 6,
      affinity: "forward",
    });
  });

  it("clamps to row end with backward affinity when goalX is past target row right edge", () => {
    const lines: LineInfo[] = [
      asciiLineInfo({ lineIndex: 0, lineStartOffset: 0, length: 20 }),
    ];
    const layout: LayoutModel = {
      container: { top: 0, left: 0, width: 200, height: 20 },
      lines: [
        {
          lineIndex: 0,
          lineStartOffset: 0,
          lineLength: 20,
          lineHasNewline: false,
          lineBox: { top: 0, left: 0, width: 200, height: 20 },
          rows: [
            {
              startOffset: 0,
              endOffset: 10,
              rect: { top: 0, left: 0, width: 80, height: 10 },
            },
            {
              startOffset: 10,
              endOffset: 20,
              rect: { top: 10, left: 0, width: 120, height: 10 },
            },
          ],
        },
      ],
    };

    const result = moveSelectionVertically({
      lines,
      layout,
      selection: collapsed(20),
      resolveOffsetToLine: (offset) => resolveOffsetToLine(lines, offset),
      direction: "up",
      goalX: null,
    });

    expect(result).not.toBeNull();
    expect(result!.goalX).toBeCloseTo(120, 4);
    expect(result!.selection).toEqual({
      start: 10,
      end: 10,
      affinity: "backward",
    });
  });

  it("skips atomic lines when moving across logical lines", () => {
    const lines: LineInfo[] = [
      asciiLineInfo({
        lineIndex: 0,
        lineStartOffset: 0,
        length: 5,
        hasNewline: true,
        isAtomic: false,
      }),
      asciiLineInfo({
        lineIndex: 1,
        lineStartOffset: 6,
        length: 0,
        hasNewline: true,
        isAtomic: true,
      }),
      asciiLineInfo({
        lineIndex: 2,
        lineStartOffset: 7,
        length: 4,
        hasNewline: false,
        isAtomic: false,
      }),
    ];
    const layout: LayoutModel = {
      container: { top: 0, left: 0, width: 200, height: 30 },
      lines: [
        {
          lineIndex: 0,
          lineStartOffset: 0,
          lineLength: 5,
          lineHasNewline: true,
          lineBox: { top: 0, left: 0, width: 200, height: 10 },
          rows: [
            {
              startOffset: 0,
              endOffset: 5,
              rect: { top: 0, left: 0, width: 100, height: 10 },
            },
          ],
        },
        {
          lineIndex: 1,
          lineStartOffset: 6,
          lineLength: 0,
          lineHasNewline: true,
          lineBox: { top: 10, left: 0, width: 200, height: 10 },
          rows: [
            {
              startOffset: 0,
              endOffset: 0,
              rect: { top: 10, left: 0, width: 100, height: 10 },
            },
          ],
        },
        {
          lineIndex: 2,
          lineStartOffset: 7,
          lineLength: 4,
          lineHasNewline: false,
          lineBox: { top: 20, left: 0, width: 200, height: 10 },
          rows: [
            {
              startOffset: 0,
              endOffset: 4,
              rect: { top: 20, left: 0, width: 80, height: 10 },
            },
          ],
        },
      ],
    };

    const result = moveSelectionVertically({
      lines,
      layout,
      selection: collapsed(4),
      resolveOffsetToLine: (offset) => resolveOffsetToLine(lines, offset),
      direction: "down",
      goalX: null,
    });

    expect(result).not.toBeNull();
    expect(result!.selection.start).toBeGreaterThanOrEqual(7);
    expect(result!.selection.start).toBeLessThanOrEqual(11);
  });
});
