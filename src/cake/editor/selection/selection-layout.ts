import type { LineInfo } from "../internal/editor-text-model";

export type LayoutRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type LayoutRow = {
  startOffset: number;
  endOffset: number;
  rect: LayoutRect;
  /** The actual glyph bounds within this row (before line-height clamping). */
  glyphBand?: { top: number; bottom: number };
};

export type LineLayout = {
  lineIndex: number;
  lineStartOffset: number;
  lineLength: number;
  lineHasNewline: boolean;
  lineBox: LayoutRect;
  rows: LayoutRow[];
};

export type LayoutModel = {
  container: LayoutRect;
  lines: LineLayout[];
};

export type LineMeasurementInput = {
  lineIndex: number;
  lineText: string;
  lineLength: number;
  lineHasNewline: boolean;
  top: number;
};

export type LineMeasurement = {
  lineBox: LayoutRect;
  rows: LayoutRow[];
};

export type LayoutMeasurer = {
  container: LayoutRect;
  measureLine: (input: LineMeasurementInput) => LineMeasurement;
};

export type { LineInfo };

export function buildLayoutModel(
  lines: LineInfo[],
  measurer: LayoutMeasurer,
): LayoutModel {
  const layouts: LineLayout[] = [];
  let top = measurer.container.top;

  lines.forEach((line) => {
    const measurement = measurer.measureLine({
      lineIndex: line.lineIndex,
      lineText: line.text,
      lineLength: line.cursorLength,
      lineHasNewline: line.hasNewline,
      top,
    });

    layouts.push({
      lineIndex: line.lineIndex,
      lineStartOffset: line.lineStartOffset,
      lineLength: line.cursorLength,
      lineHasNewline: line.hasNewline,
      lineBox: measurement.lineBox,
      rows: measurement.rows,
    });

    top = measurement.lineBox.top + measurement.lineBox.height;
  });

  const height = Math.max(
    measurer.container.height,
    top - measurer.container.top,
  );

  return {
    container: {
      ...measurer.container,
      height,
    },
    lines: layouts,
  };
}
