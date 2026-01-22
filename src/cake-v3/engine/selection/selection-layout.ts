import type { Block, Doc, Inline } from "../../core/types";
import { graphemeSegments } from "../../shared/segmenter";

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

export type LineInfo = {
  lineIndex: number;
  text: string;
  cursorLength: number;
  hasNewline: boolean;
  cursorToCodeUnit: number[];
  isAtomic: boolean;
};

export function buildLayoutModel(
  lines: LineInfo[],
  measurer: LayoutMeasurer,
): LayoutModel {
  const layouts: LineLayout[] = [];
  let top = measurer.container.top;
  let lineStartOffset = 0;

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
      lineStartOffset,
      lineLength: line.cursorLength,
      lineHasNewline: line.hasNewline,
      lineBox: measurement.lineBox,
      rows: measurement.rows,
    });
    top = measurement.lineBox.top + measurement.lineBox.height;
    lineStartOffset += line.cursorLength + (line.hasNewline ? 1 : 0);
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

type FlattenedLine = {
  text: string;
  isAtomic: boolean;
};

export function getDocLines(doc: Doc): LineInfo[] {
  const flattenedLines = flattenBlocksWithAtomicInfo(doc.blocks);
  return flattenedLines.map((line, index) => {
    const cursorToCodeUnit = buildCursorToCodeUnit(line.text);
    const cursorLength = Math.max(0, cursorToCodeUnit.length - 1);
    return {
      lineIndex: index,
      text: line.text,
      cursorLength,
      hasNewline: index < flattenedLines.length - 1,
      cursorToCodeUnit,
      isAtomic: line.isAtomic,
    };
  });
}

function flattenBlocksWithAtomicInfo(blocks: Block[]): FlattenedLine[] {
  const lines: FlattenedLine[] = [];
  blocks.forEach((block) => {
    lines.push(...flattenBlockWithAtomicInfo(block));
  });
  if (lines.length === 0) {
    lines.push({ text: "", isAtomic: false });
  }
  return lines;
}

function flattenBlockWithAtomicInfo(block: Block): FlattenedLine[] {
  if (block.type === "paragraph") {
    return [
      { text: block.content.map(flattenInline).join(""), isAtomic: false },
    ];
  }
  if (block.type === "block-wrapper") {
    return flattenBlocksWithAtomicInfo(block.blocks);
  }
  if (block.type === "block-atom") {
    // Atomic blocks are represented as empty lines for layout purposes
    return [{ text: "", isAtomic: true }];
  }
  return [];
}

export function getLineOffsets(lines: LineInfo[]): number[] {
  const offsets: number[] = [];
  let current = 0;
  lines.forEach((line) => {
    offsets.push(current);
    current += line.cursorLength;
    if (line.hasNewline) {
      current += 1;
    }
  });
  return offsets;
}

export function resolveOffsetToLine(
  lines: LineInfo[],
  offset: number,
): { lineIndex: number; offsetInLine: number } {
  if (lines.length === 0) {
    return { lineIndex: 0, offsetInLine: 0 };
  }
  const lineOffsets = getLineOffsets(lines);
  const totalLength =
    lineOffsets[lineOffsets.length - 1] + lines[lines.length - 1].cursorLength;
  const clamped = Math.max(0, Math.min(offset, totalLength));

  for (let index = 0; index < lines.length; index += 1) {
    const lineStart = lineOffsets[index];
    const lineEnd = lineStart + lines[index].cursorLength;
    if (clamped <= lineEnd || index === lines.length - 1) {
      return { lineIndex: index, offsetInLine: clamped - lineStart };
    }
  }

  const lastIndex = lines.length - 1;
  return {
    lineIndex: lastIndex,
    offsetInLine: lines[lastIndex].cursorLength,
  };
}

function flattenInline(inline: Inline): string {
  if (inline.type === "text") {
    return inline.text;
  }
  if (inline.type === "inline-wrapper") {
    return inline.children.map(flattenInline).join("");
  }
  if (inline.type === "inline-atom") {
    return " ";
  }
  return "";
}

function buildCursorToCodeUnit(text: string): number[] {
  const segments = graphemeSegments(text);
  const mapping: number[] = [0];
  for (const segment of segments) {
    mapping.push(segment.index + segment.segment.length);
  }
  if (mapping.length === 0) {
    mapping.push(0);
  }
  return mapping;
}
