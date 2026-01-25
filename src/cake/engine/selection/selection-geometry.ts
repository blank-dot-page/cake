import type { Selection } from "../../core/types";
import type {
  LayoutModel,
  LayoutRect,
  LayoutRow,
  LineLayout,
} from "./selection-layout";

export type SelectionRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type SelectionCaretMeasurement = {
  lineRect: LayoutRect;
  caretRect: LayoutRect;
  lineLength: number;
  padding: { top: number; bottom: number };
};

export type OffsetToXMeasurer = (
  lineIndex: number,
  offsetInLine: number,
) => number | null;

function rectRight(rect: LayoutRect): number {
  return rect.left + rect.width;
}

function getRowSlot(
  line: LineLayout,
  rowIndex: number,
  row: LayoutRow,
): {
  top: number;
  height: number;
} {
  const rowCount = line.rows.length;
  if (rowCount <= 1) {
    return { top: line.lineBox.top, height: line.lineBox.height };
  }
  const lineHeight = line.lineBox.height;
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    return { top: row.rect.top, height: row.rect.height };
  }
  const rowHeight = lineHeight / rowCount;
  if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
    return { top: row.rect.top, height: row.rect.height };
  }
  return {
    top: line.lineBox.top + rowHeight * rowIndex,
    height: rowHeight,
  };
}

function rowOffsetToX(
  row: LayoutRow,
  offset: number,
  lineIndex: number,
  measurer?: OffsetToXMeasurer,
): number {
  const clamped = Math.max(row.startOffset, Math.min(offset, row.endOffset));

  if (measurer) {
    const measured = measurer(lineIndex, clamped);
    if (measured !== null) {
      return measured;
    }
  }

  const rowLength = row.endOffset - row.startOffset;
  if (rowLength <= 0) {
    return row.rect.left;
  }
  const charWidth = row.rect.width / rowLength;
  return row.rect.left + charWidth * (clamped - row.startOffset);
}

function findRowIndexForStart(rows: LayoutRow[], offset: number): number {
  for (let index = 0; index < rows.length; index += 1) {
    if (offset < rows[index].endOffset) {
      return index;
    }
  }
  return Math.max(0, rows.length - 1);
}

function findRowIndexForEnd(rows: LayoutRow[], offset: number): number {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (offset > rows[index].startOffset) {
      return index;
    }
  }
  return 0;
}

export function computeSelectionRects(
  layout: LayoutModel,
  selection: Selection,
  measurer?: OffsetToXMeasurer,
): SelectionRect[] {
  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  if (start === end) {
    return [];
  }

  const rects: SelectionRect[] = [];

  layout.lines.forEach((line) => {
    const lineEndOffset = line.lineStartOffset + line.lineLength;
    const selectionStartInLine = Math.max(
      0,
      Math.min(start - line.lineStartOffset, line.lineLength),
    );
    const selectionEndInLine = Math.max(
      0,
      Math.min(end - line.lineStartOffset, line.lineLength),
    );
    const includesNewline =
      start <= lineEndOffset && end > lineEndOffset && line.lineHasNewline;
    const selectionStartsBeforeLine = start < line.lineStartOffset;
    const hasCoverage =
      selectionStartInLine < selectionEndInLine || includesNewline;

    if (!hasCoverage) {
      return;
    }

    const lineBoxLeft = line.lineBox.left;
    const lineBoxRight = rectRight(line.lineBox);

    if (line.lineLength === 0) {
      const width = Math.max(1, line.lineBox.width);
      rects.push({
        top: line.lineBox.top,
        left: lineBoxLeft,
        width,
        height: line.lineBox.height,
      });
      return;
    }

    if (line.rows.length === 0) {
      return;
    }

    if (selectionStartInLine === selectionEndInLine && includesNewline) {
      const rowIndex = findRowIndexForStart(line.rows, selectionStartInLine);
      const row = line.rows[rowIndex] ?? line.rows[line.rows.length - 1];
      const slot = getRowSlot(line, rowIndex, row);
      const left = Math.max(
        rowOffsetToX(row, selectionStartInLine, line.lineIndex, measurer),
        lineBoxLeft,
      );
      const width = Math.max(1, lineBoxRight - left);
      rects.push({
        top: slot.top,
        left,
        width,
        height: slot.height,
      });
      return;
    }

    const endRowIndex = findRowIndexForEnd(line.rows, selectionEndInLine);

    line.rows.forEach((row, rowIndex) => {
      const rowSelectionStart = Math.max(selectionStartInLine, row.startOffset);
      const rowSelectionEnd = Math.min(selectionEndInLine, row.endOffset);
      if (rowSelectionStart >= rowSelectionEnd) {
        return;
      }
      const slot = getRowSlot(line, rowIndex, row);

      const selectionCoversRowStart = selectionStartInLine <= row.startOffset;
      const fillToLineStart =
        (includesNewline || selectionStartsBeforeLine) &&
        selectionCoversRowStart;
      let left = selectionCoversRowStart
        ? fillToLineStart
          ? lineBoxLeft
          : row.rect.left
        : rowOffsetToX(row, rowSelectionStart, line.lineIndex, measurer);
      left = Math.max(left, lineBoxLeft);

      const isLastRow = rowIndex === endRowIndex;
      const fillToLineEnd =
        includesNewline || (selectionStartsBeforeLine && !isLastRow);
      const fillToRowEnd = !isLastRow && rowSelectionEnd === row.endOffset;
      let right = fillToLineEnd
        ? lineBoxRight
        : fillToRowEnd
          ? lineBoxRight
          : isLastRow
            ? rowOffsetToX(row, rowSelectionEnd, line.lineIndex, measurer)
            : rectRight(row.rect);
      right = Math.max(right, left);

      const width = Math.max(1, right - left);

      rects.push({
        top: slot.top,
        left,
        width,
        height: slot.height,
      });
    });
  });

  return rects;
}

export function computeCaretRect(
  caret: SelectionCaretMeasurement,
): SelectionRect | null {
  const height = caret.lineRect.height;
  const contentHeight =
    caret.lineRect.height > 0
      ? Math.max(
          0,
          caret.lineRect.height - caret.padding.top - caret.padding.bottom,
        )
      : 0;
  const emptyLineTop =
    contentHeight > 0
      ? caret.lineRect.top + caret.padding.top + (contentHeight - height) / 2
      : caret.lineRect.top + (caret.lineRect.height - height) / 2;
  const top =
    caret.lineLength === 0
      ? emptyLineTop
      : caret.caretRect.height > 0
        ? caret.caretRect.top
        : caret.lineRect.top;
  const left =
    caret.lineLength === 0 ? caret.lineRect.left : caret.caretRect.left;
  return {
    top,
    left,
    width: 0,
    height,
  };
}
