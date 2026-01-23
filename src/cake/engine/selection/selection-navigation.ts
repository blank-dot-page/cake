import type { Selection } from "../../core/types";
import type { LayoutModel, LayoutRow, LineInfo } from "./selection-layout";
import { resolveOffsetToLine } from "./selection-layout";

type Affinity = "forward" | "backward";

export type VerticalNavigationResult = {
  selection: Selection;
  goalX: number;
};

function rectRight(rect: { left: number; width: number }): number {
  return rect.left + rect.width;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function resolveSelectionAffinity(selection: Selection): Affinity {
  if (selection.start === selection.end) {
    return selection.affinity ?? "backward";
  }
  return selection.affinity ?? "forward";
}

function resolveSelectionAnchorAndFocus(selection: Selection): {
  anchor: number;
  focus: number;
} {
  if (selection.start === selection.end) {
    return { anchor: selection.start, focus: selection.start };
  }
  const affinity = resolveSelectionAffinity(selection);
  if (affinity === "backward") {
    return { anchor: selection.end, focus: selection.start };
  }
  return { anchor: selection.start, focus: selection.end };
}

function findRowIndexForOffset(
  rows: { startOffset: number; endOffset: number }[],
  offsetInLine: number,
  affinity: Affinity,
): number {
  if (rows.length === 0) {
    return 0;
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (offsetInLine === row.startOffset) {
      if (affinity === "backward" && index > 0) {
        return index - 1;
      }
      return index;
    }
    if (offsetInLine === row.endOffset) {
      if (affinity === "forward" && index + 1 < rows.length) {
        return index + 1;
      }
      return index;
    }
    if (offsetInLine > row.startOffset && offsetInLine < row.endOffset) {
      return index;
    }
  }

  return rows.length - 1;
}

function asSingleRow(line: {
  lineLength: number;
  lineBox: { top: number; left: number; width: number; height: number };
}): LayoutRow {
  return {
    startOffset: 0,
    endOffset: line.lineLength,
    rect: line.lineBox,
  };
}

function rowOffsetToX(params: {
  row: LayoutRow;
  offsetInLine: number;
}): number {
  const { row, offsetInLine } = params;
  const rowRight = rectRight(row.rect);
  const clampedOffset = clampNumber(
    offsetInLine,
    row.startOffset,
    row.endOffset,
  );
  if (row.endOffset <= row.startOffset || row.rect.width <= 0) {
    return row.rect.left;
  }
  if (clampedOffset === row.endOffset) {
    return rowRight;
  }
  const rowLength = row.endOffset - row.startOffset;
  const fraction = (clampedOffset - row.startOffset) / rowLength;
  return row.rect.left + row.rect.width * fraction;
}

function rowXToOffset(params: { row: LayoutRow; x: number }): {
  offsetInLine: number;
  affinity: Affinity;
} {
  const { row, x } = params;
  const rowRight = rectRight(row.rect);
  if (x <= row.rect.left) {
    return { offsetInLine: row.startOffset, affinity: "forward" };
  }
  if (x >= rowRight) {
    return { offsetInLine: row.endOffset, affinity: "backward" };
  }
  const rowLength = row.endOffset - row.startOffset;
  if (rowLength <= 0 || row.rect.width <= 0) {
    return { offsetInLine: row.startOffset, affinity: "forward" };
  }
  const fraction = (x - row.rect.left) / row.rect.width;
  const raw = row.startOffset + fraction * rowLength;
  const rounded = Math.round(raw);
  const offsetInLine = clampNumber(rounded, row.startOffset, row.endOffset);
  return { offsetInLine, affinity: "forward" };
}

function resolveTargetLineIndex(params: {
  lines: LineInfo[];
  fromLineIndex: number;
  direction: "up" | "down";
}): number | null {
  const delta = params.direction === "down" ? 1 : -1;
  let index = params.fromLineIndex + delta;
  while (index >= 0 && index < params.lines.length) {
    if (!params.lines[index]?.isAtomic) {
      return index;
    }
    index += delta;
  }
  return null;
}

export function moveSelectionVertically(params: {
  lines: LineInfo[];
  layout: LayoutModel;
  selection: Selection;
  direction: "up" | "down";
  goalX: number | null;
  focusRowIndex?: number;
  hitTestCursorAt?: (
    x: number,
    y: number,
  ) => { cursorOffset: number; affinity: Affinity; caretTop?: number } | null;
}): VerticalNavigationResult | null {
  const { lines, layout, direction } = params;
  if (layout.lines.length === 0 || lines.length === 0) {
    return null;
  }

  const affinity = resolveSelectionAffinity(params.selection);
  const { anchor, focus } = resolveSelectionAnchorAndFocus(params.selection);
  const focusResolved = resolveOffsetToLine(lines, focus);
  const focusLineLayout = layout.lines[focusResolved.lineIndex];
  if (!focusLineLayout) {
    return null;
  }

  const focusRows =
    focusLineLayout.rows.length > 0
      ? focusLineLayout.rows
      : [asSingleRow(focusLineLayout)];

  let focusRowIndex =
    params.focusRowIndex ??
    findRowIndexForOffset(focusRows, focusResolved.offsetInLine, affinity);
  focusRowIndex = clampNumber(
    focusRowIndex,
    0,
    Math.max(0, focusRows.length - 1),
  );

  const focusRow = focusRows[focusRowIndex] ?? focusRows[focusRows.length - 1];
  if (!focusRow) {
    return null;
  }

  const goalX =
    params.goalX ??
    rowOffsetToX({ row: focusRow, offsetInLine: focusResolved.offsetInLine });

  let targetLineIndex = focusResolved.lineIndex;
  let targetRowIndex = focusRowIndex;

  if (direction === "up") {
    if (focusRowIndex > 0) {
      targetRowIndex = focusRowIndex - 1;
    } else {
      const nextLineIndex = resolveTargetLineIndex({
        lines,
        fromLineIndex: focusResolved.lineIndex,
        direction: "up",
      });
      if (nextLineIndex === null) {
        return null;
      }
      targetLineIndex = nextLineIndex;
      targetRowIndex = Number.POSITIVE_INFINITY;
    }
  } else {
    if (focusRowIndex + 1 < focusRows.length) {
      targetRowIndex = focusRowIndex + 1;
    } else {
      const nextLineIndex = resolveTargetLineIndex({
        lines,
        fromLineIndex: focusResolved.lineIndex,
        direction: "down",
      });
      if (nextLineIndex === null) {
        return null;
      }
      targetLineIndex = nextLineIndex;
      targetRowIndex = 0;
    }
  }

  const targetLineLayout = layout.lines[targetLineIndex];
  if (!targetLineLayout) {
    return null;
  }
  const targetRows =
    targetLineLayout.rows.length > 0
      ? targetLineLayout.rows
      : [asSingleRow(targetLineLayout)];
  const resolvedTargetRowIndex =
    targetRowIndex === Number.POSITIVE_INFINITY
      ? Math.max(0, targetRows.length - 1)
      : clampNumber(targetRowIndex, 0, Math.max(0, targetRows.length - 1));

  const targetRow =
    targetRows[resolvedTargetRowIndex] ?? targetRows[targetRows.length - 1];
  if (!targetRow) {
    return null;
  }

  const targetLineStart = targetLineLayout.lineStartOffset;
  const targetLineEnd = targetLineStart + targetLineLayout.lineLength;

  if (params.hitTestCursorAt) {
    const midY = targetRow.rect.top + targetRow.rect.height / 2;
    const rowLeft = targetRow.rect.left;
    const rowRight = rectRight(targetRow.rect);
    const hitX =
      rowRight - rowLeft > 1
        ? clampNumber(goalX, rowLeft + 0.5, rowRight - 0.5)
        : goalX;
    let hit = params.hitTestCursorAt(hitX, midY);
    // If we're in trailing whitespace, some caret APIs will return the end of
    // the whole line (last visual row). Nudge left until we get a hit that
    // actually lands on the requested visual row.
    if (hit && hit.cursorOffset === focus) {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const nudgedX = hitX - (attempt + 1) * 1;
        if (nudgedX <= rowLeft + 0.5) {
          break;
        }
        const next = params.hitTestCursorAt(nudgedX, midY);
        const matchesRow =
          next?.caretTop === undefined ||
          Math.abs(next.caretTop - targetRow.rect.top) <= 2;
        if (next && next.cursorOffset !== focus && matchesRow) {
          hit = next;
          break;
        }
      }
    }
    const matchesRow =
      hit?.caretTop === undefined ||
      Math.abs(hit.caretTop - targetRow.rect.top) <= 2;
    if (
      hit &&
      matchesRow &&
      hit.cursorOffset >= targetLineStart &&
      hit.cursorOffset <= targetLineEnd
    ) {
      const normalizedAffinity: Affinity =
        targetLineLayout.lineLength === 0 ? "forward" : hit.affinity;
      const nextSelection: Selection =
        anchor === focus
          ? {
              start: hit.cursorOffset,
              end: hit.cursorOffset,
              affinity: normalizedAffinity,
            }
          : { start: anchor, end: hit.cursorOffset, affinity: normalizedAffinity };
      return { selection: nextSelection, goalX };
    }
  }

  const rowHit = rowXToOffset({ row: targetRow, x: goalX });
  const nextPos = targetLineStart + rowHit.offsetInLine;
  const normalizedAffinity: Affinity =
    targetLineLayout.lineLength === 0 ? "forward" : rowHit.affinity;
  const nextSelection: Selection =
    anchor === focus
      ? { start: nextPos, end: nextPos, affinity: normalizedAffinity }
      : {
          start: anchor,
          end: nextPos,
          affinity: normalizedAffinity,
        };

  return { selection: nextSelection, goalX };
}
