import {
  getLineOffsets,
  resolveOffsetToLine,
  type LineInfo,
} from "./selection-layout";

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

export function getVisibleText(lines: LineInfo[]): string {
  if (lines.length === 0) {
    return "";
  }
  return lines.map((line) => line.text).join("\n");
}

export function visibleOffsetToCursorOffset(
  lines: LineInfo[],
  visibleOffset: number,
): number | null {
  if (lines.length === 0) {
    return 0;
  }
  const clampedOffset = Math.max(0, visibleOffset);
  const lineOffsets = getLineOffsets(lines);
  let codeUnitIndex = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineStart = codeUnitIndex;
    const lineEnd = lineStart + line.text.length;
    if (clampedOffset <= lineEnd || index === lines.length - 1) {
      const offsetInLine = Math.max(
        0,
        Math.min(clampedOffset - lineStart, line.text.length),
      );
      const cursorOffsetInLine = cursorOffsetFromCodeUnit(line, offsetInLine);
      const lineStartOffset = lineOffsets[index] ?? 0;
      return lineStartOffset + cursorOffsetInLine;
    }
    codeUnitIndex = lineEnd + (line.hasNewline ? 1 : 0);
    if (line.hasNewline && clampedOffset === codeUnitIndex) {
      const lineStartOffset = lineOffsets[index] ?? 0;
      return lineStartOffset + line.cursorLength + 1;
    }
  }
  return null;
}

export function cursorOffsetToVisibleOffset(
  lines: LineInfo[],
  cursorOffset: number,
): number {
  if (lines.length === 0) {
    return 0;
  }
  const lineOffsets = getLineOffsets(lines);
  const { lineIndex, offsetInLine } = resolveOffsetToLine(lines, cursorOffset);
  let codeUnitIndex = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (index === lineIndex) {
      const offset = Math.max(0, Math.min(offsetInLine, line.cursorLength));
      return codeUnitIndex + (line.cursorToCodeUnit[offset] ?? 0);
    }
    codeUnitIndex += line.text.length + (line.hasNewline ? 1 : 0);
  }
  const lastLine = lines[lines.length - 1];
  const lastStart = lineOffsets[lineOffsets.length - 1] ?? 0;
  const lastOffset = Math.max(0, cursorOffset - lastStart);
  return (
    codeUnitIndex +
    (lastLine.cursorToCodeUnit[lastOffset] ?? lastLine.text.length)
  );
}
