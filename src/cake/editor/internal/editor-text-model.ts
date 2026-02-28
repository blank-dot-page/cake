import type { Block, Doc, Inline, Selection } from "../../core/types";
import { graphemeSegments } from "../../shared/segmenter";

export type LineInfo = {
  lineIndex: number;
  lineStartOffset: number;
  text: string;
  cursorLength: number;
  hasNewline: boolean;
  cursorToCodeUnit: number[];
  isAtomic: boolean;
};

export type LineOffsetResolution = {
  lineIndex: number;
  offsetInLine: number;
};

export type StructuralLineInfo = LineInfo & {
  path: number[];
  parentPath: number[];
  indexInParent: number;
  block: Block;
};

function computeLineOffsets(lines: readonly LineInfo[]): number[] {
  return lines.map((line) => line.lineStartOffset);
}

function resolveOffsetInLines(params: {
  lines: readonly LineInfo[];
  offset: number;
}): LineOffsetResolution {
  const { lines } = params;
  if (lines.length === 0) {
    return { lineIndex: 0, offsetInLine: 0 };
  }

  const lastLineIndex = lines.length - 1;
  const lastLine = lines[lastLineIndex] ?? {
    lineStartOffset: 0,
    cursorLength: 0,
  };
  const totalLength = lastLine.lineStartOffset + (lastLine.cursorLength ?? 0);
  const clampedOffset = Math.max(0, Math.min(params.offset, totalLength));

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineStart = line.lineStartOffset;
    const lineEnd = lineStart + line.cursorLength;
    if (clampedOffset <= lineEnd || lineIndex === lastLineIndex) {
      return {
        lineIndex,
        offsetInLine: clampedOffset - lineStart,
      };
    }
  }

  return {
    lineIndex: lastLineIndex,
    offsetInLine: lines[lastLineIndex]?.cursorLength ?? 0,
  };
}

function cursorOffsetFromCodeUnit(
  line: {
    cursorLength: number;
    cursorToCodeUnit: number[];
  },
  codeUnitOffset: number,
): number {
  const maxCodeUnit =
    line.cursorToCodeUnit[line.cursorToCodeUnit.length - 1] ?? 0;
  const clamped = Math.max(0, Math.min(codeUnitOffset, maxCodeUnit));

  for (let i = 0; i < line.cursorToCodeUnit.length; i += 1) {
    if (line.cursorToCodeUnit[i] === clamped) {
      return i;
    }
    if (line.cursorToCodeUnit[i] > clamped) {
      return Math.max(0, i - 1);
    }
  }

  return line.cursorLength;
}

type FlattenedLine = {
  path: number[];
  parentPath: number[];
  indexInParent: number;
  block: Block;
  text: string;
  isAtomic: boolean;
};

function flattenDocToLines(doc: Doc): FlattenedLine[] {
  const lines: FlattenedLine[] = [];

  const appendBlock = (block: Block, path: number[]): void => {
    if (block.type === "paragraph") {
      lines.push({
        path,
        parentPath: path.slice(0, -1),
        indexInParent: path[path.length - 1] ?? 0,
        block,
        text: block.content.map(flattenInline).join(""),
        isAtomic: false,
      });
      return;
    }

    if (block.type === "block-wrapper") {
      block.blocks.forEach((child, index) =>
        appendBlock(child, [...path, index]),
      );
      return;
    }

    if (block.type === "block-atom") {
      // Atomic blocks occupy one cursor unit and are treated as empty layout lines.
      lines.push({
        path,
        parentPath: path.slice(0, -1),
        indexInParent: path[path.length - 1] ?? 0,
        block,
        text: "",
        isAtomic: true,
      });
    }
  };

  doc.blocks.forEach((block, index) => appendBlock(block, [index]));

  if (lines.length === 0) {
    const block: Block = { type: "paragraph", content: [] };
    lines.push({
      path: [0],
      parentPath: [],
      indexInParent: 0,
      block,
      text: "",
      isAtomic: false,
    });
  }

  return lines;
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
  const mapping: number[] = [0];
  for (const segment of graphemeSegments(text)) {
    mapping.push(segment.index + segment.segment.length);
  }
  if (mapping.length === 0) {
    mapping.push(0);
  }
  return mapping;
}

function buildLines(doc: Doc): StructuralLineInfo[] {
  const flattenedLines = flattenDocToLines(doc);
  let lineStartOffset = 0;
  return flattenedLines.map((line, lineIndex) => {
    const cursorToCodeUnit = buildCursorToCodeUnit(line.text);
    const cursorLength = Math.max(0, cursorToCodeUnit.length - 1);
    const hasNewline = lineIndex < flattenedLines.length - 1;
    const builtLine: StructuralLineInfo = {
      lineIndex,
      lineStartOffset,
      path: line.path,
      parentPath: line.parentPath,
      indexInParent: line.indexInParent,
      block: line.block,
      text: line.text,
      cursorLength,
      hasNewline,
      cursorToCodeUnit,
      isAtomic: line.isAtomic,
    };
    lineStartOffset += cursorLength + (hasNewline ? 1 : 0);
    return builtLine;
  });
}

export class EditorTextModel {
  private lines: StructuralLineInfo[] = [
    {
      lineIndex: 0,
      lineStartOffset: 0,
      path: [0],
      parentPath: [],
      indexInParent: 0,
      block: { type: "paragraph", content: [] },
      text: "",
      cursorLength: 0,
      hasNewline: false,
      cursorToCodeUnit: [0],
      isAtomic: false,
    },
  ];
  private lineOffsets: number[] = [0];
  private visibleText = "";
  private cursorLength = 0;

  constructor(doc?: Doc) {
    if (doc) {
      this.rebuild(doc);
    }
  }

  rebuild(doc: Doc): void {
    this.lines = buildLines(doc);
    this.lineOffsets = computeLineOffsets(this.lines);
    this.visibleText = this.lines.map((line) => line.text).join("\n");
    const lastLine = this.lines[this.lines.length - 1];
    const lastStart = this.lineOffsets[this.lineOffsets.length - 1] ?? 0;
    this.cursorLength = lastStart + (lastLine?.cursorLength ?? 0);
  }

  getLines(): LineInfo[] {
    return this.lines;
  }

  getStructuralLines(): readonly StructuralLineInfo[] {
    return this.lines;
  }

  getLineOffsets(): readonly number[] {
    return this.lineOffsets;
  }

  getVisibleText(): string {
    return this.visibleText;
  }

  getCursorLength(): number {
    return this.cursorLength;
  }

  resolveOffsetToLine(offset: number): LineOffsetResolution {
    return resolveOffsetInLines({
      lines: this.lines,
      offset,
    });
  }

  visibleOffsetToCursorOffset(visibleOffset: number): number | null {
    if (this.lines.length === 0) {
      return 0;
    }

    const clampedOffset = Math.max(0, visibleOffset);
    let codeUnitIndex = 0;

    for (let lineIndex = 0; lineIndex < this.lines.length; lineIndex += 1) {
      const line = this.lines[lineIndex];
      const lineStart = codeUnitIndex;
      const lineEnd = lineStart + line.text.length;

      if (clampedOffset <= lineEnd || lineIndex === this.lines.length - 1) {
        const offsetInLine = Math.max(
          0,
          Math.min(clampedOffset - lineStart, line.text.length),
        );
        const cursorOffsetInLine = cursorOffsetFromCodeUnit(line, offsetInLine);
        const lineStartOffset = this.lineOffsets[lineIndex] ?? 0;
        return lineStartOffset + cursorOffsetInLine;
      }

      codeUnitIndex = lineEnd + (line.hasNewline ? 1 : 0);
      if (line.hasNewline && clampedOffset === codeUnitIndex) {
        const lineStartOffset = this.lineOffsets[lineIndex] ?? 0;
        return lineStartOffset + line.cursorLength + 1;
      }
    }

    return null;
  }

  cursorOffsetToVisibleOffset(cursorOffset: number): number {
    if (this.lines.length === 0) {
      return 0;
    }

    const { lineIndex, offsetInLine } = this.resolveOffsetToLine(cursorOffset);
    let codeUnitIndex = 0;

    for (let index = 0; index < this.lines.length; index += 1) {
      const line = this.lines[index];
      if (index === lineIndex) {
        const clampedOffset = Math.max(0, Math.min(offsetInLine, line.cursorLength));
        return codeUnitIndex + (line.cursorToCodeUnit[clampedOffset] ?? 0);
      }
      codeUnitIndex += line.text.length + (line.hasNewline ? 1 : 0);
    }

    const lastLine = this.lines[this.lines.length - 1];
    const lastStart = this.lineOffsets[this.lineOffsets.length - 1] ?? 0;
    const lastOffset = Math.max(0, cursorOffset - lastStart);
    return (
      codeUnitIndex +
      (lastLine?.cursorToCodeUnit[lastOffset] ?? lastLine?.text.length ?? 0)
    );
  }

  getTextSelection(selection: Selection): { start: number; end: number } {
    return {
      start: this.cursorOffsetToVisibleOffset(selection.start),
      end: this.cursorOffsetToVisibleOffset(selection.end),
    };
  }

  getTextBeforeCursor(selection: Selection, maxChars: number): string {
    const text = this.visibleText;
    const cursor = Math.max(
      0,
      Math.min(this.cursorOffsetToVisibleOffset(selection.start), text.length),
    );
    const length = Math.max(0, maxChars);
    return text.slice(Math.max(0, cursor - length), cursor);
  }

  getTextAroundCursor(
    selection: Selection,
    before: number,
    after: number,
  ): { before: string; after: string } {
    const text = this.visibleText;
    const cursor = Math.max(
      0,
      Math.min(this.cursorOffsetToVisibleOffset(selection.start), text.length),
    );
    const beforeLength = Math.max(0, before);
    const afterLength = Math.max(0, after);

    return {
      before: text.slice(Math.max(0, cursor - beforeLength), cursor),
      after: text.slice(cursor, Math.min(text.length, cursor + afterLength)),
    };
  }

  getTextForCursorRange(start: number, end: number): string {
    const normalizedStart = Math.min(start, end);
    const normalizedEnd = Math.max(start, end);
    const visibleStart = this.cursorOffsetToVisibleOffset(normalizedStart);
    const visibleEnd = this.cursorOffsetToVisibleOffset(normalizedEnd);
    return this.visibleText.slice(visibleStart, visibleEnd);
  }

  getGraphemeAtCursor(cursorOffset: number): string | null {
    if (this.lines.length === 0) {
      return null;
    }
    const { lineIndex, offsetInLine } = this.resolveOffsetToLine(cursorOffset);
    const line = this.lines[lineIndex];
    if (!line || offsetInLine >= line.cursorLength) {
      return null;
    }
    const segments = graphemeSegments(line.text);
    return segments[offsetInLine]?.segment ?? null;
  }
}

const textModelByDoc = new WeakMap<Doc, EditorTextModel>();

export function getEditorTextModelForDoc(doc: Doc): EditorTextModel {
  const cached = textModelByDoc.get(doc);
  if (cached) {
    return cached;
  }
  const model = new EditorTextModel(doc);
  textModelByDoc.set(doc, model);
  return model;
}
