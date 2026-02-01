import {
  type CakeExtension,
  type EditResult,
  type RuntimeState,
} from "../../core/runtime";
import type { CursorSourceMap } from "../../core/mapping/cursor-source-map";
import type { Block, Selection } from "../../core/types";
import type { DomRenderContext } from "../../dom/types";
import { mergeInlineForRender } from "../../dom/render";
import {
  parseListRange,
  serializeListRange,
  convertToPlainText,
  getLineInfo,
  getListPrefixLength,
  isListLine,
  parseListItem,
  countNumberedItemsBefore,
} from "./list-ast";

// Match list lines - capture exactly one space after marker, rest goes to content
const LIST_LINE_REGEX = /^(\s*)([-*+]|\d+\.)( )(.*)$/;

interface ListMatch {
  indent: string;
  marker: string;
  number: number | null;
  space: string;
  content: string;
  prefix: string;
}

function matchListLine(line: string): ListMatch | null {
  const match = line.match(LIST_LINE_REGEX);
  if (!match) {
    return null;
  }
  const indent = match[1];
  const marker = match[2];
  const space = match[3];
  const content = match[4] ?? "";
  const number = /^\d+\.$/.test(marker) ? Number.parseInt(marker, 10) : null;
  const prefix = `${indent}${marker}${space}`;

  return { indent, marker, number, space, content, prefix };
}

function getSourceLines(source: string): string[] {
  return source.split("\n");
}

/**
 * Find the range of lines that form a contiguous list block containing the given line.
 */
function findListBlock(
  source: string,
  lineIndex: number,
): {
  startOffset: number;
  endOffset: number;
  lineIndexInBlock: number;
} | null {
  const lines = source.split("\n");
  const currentLine = lines[lineIndex];

  if (!isListLine(currentLine)) {
    return null;
  }

  let startLineIndex = lineIndex;
  while (startLineIndex > 0) {
    const prevLine = lines[startLineIndex - 1];
    if (!isListLine(prevLine)) {
      break;
    }
    startLineIndex--;
  }

  let endLineIndex = lineIndex;
  while (endLineIndex < lines.length - 1) {
    const nextLine = lines[endLineIndex + 1];
    if (!isListLine(nextLine)) {
      break;
    }
    endLineIndex++;
  }

  let startOffset = 0;
  for (let i = 0; i < startLineIndex; i++) {
    startOffset += lines[i].length + 1;
  }

  let endOffset = startOffset;
  for (let i = startLineIndex; i <= endLineIndex; i++) {
    endOffset += lines[i].length;
    if (i < endLineIndex) {
      endOffset += 1;
    }
  }

  return {
    startOffset,
    endOffset,
    lineIndexInBlock: lineIndex - startLineIndex,
  };
}

/**
 * Apply an AST transformation to a list block and return the edit result.
 */
function applyListTransform(
  source: string,
  cursorLineIndex: number,
  transform: (
    range: ReturnType<typeof parseListRange>,
    lineIndex: number,
  ) => ReturnType<typeof parseListRange>,
  computeSelection: (
    originalSource: string,
    newSource: string,
    blockStart: number,
    originalSelection: Selection,
  ) => Selection,
  selection: Selection,
): EditResult | null {
  const block = findListBlock(source, cursorLineIndex);
  if (!block) {
    return null;
  }

  const range = parseListRange(source, block.startOffset, block.endOffset);
  const transformed = transform(range, block.lineIndexInBlock);
  const serialized = serializeListRange(transformed);

  const newSource =
    source.slice(0, block.startOffset) +
    serialized +
    source.slice(block.endOffset);

  const newSelection = computeSelection(
    source,
    newSource,
    block.startOffset,
    selection,
  );

  return { source: newSource, selection: newSelection };
}

/**
 * Get line indices for a selection range
 */
function getSelectionLineRange(
  source: string,
  selection: Selection,
  map: CursorSourceMap,
): { startLine: number; endLine: number } {
  const startCursor = Math.min(selection.start, selection.end);
  const endCursor = Math.max(selection.start, selection.end);
  const startSource = map.cursorToSource(startCursor, "backward");
  const endSource = map.cursorToSource(
    Math.max(startCursor, endCursor - 1),
    "forward",
  );
  const startInfo = getLineInfo(source, startSource);
  const endInfo = getLineInfo(source, endSource);
  return { startLine: startInfo.lineIndex, endLine: endInfo.lineIndex };
}

function handleInsertLineBreak(state: RuntimeState): EditResult | null {
  const { source, selection, map, runtime } = state;

  let workingSource = source;
  let cursorPos = selection.start;
  let cursorSourcePos = map.cursorToSource(cursorPos, "forward");

  if (selection.start !== selection.end) {
    const [from, to] =
      selection.start <= selection.end
        ? [selection.start, selection.end]
        : [selection.end, selection.start];
    const fromSource = map.cursorToSource(from, "backward");
    const toSource = map.cursorToSource(to, "forward");
    workingSource = source.slice(0, fromSource) + source.slice(toSource);
    cursorPos = from;
    cursorSourcePos = fromSource;
  }

  const lineInfo = getLineInfo(workingSource, cursorSourcePos);
  const listItem = parseListItem(lineInfo.line);

  if (!listItem) {
    return null;
  }

  const prefixLength = getListPrefixLength(lineInfo.line);
  if (prefixLength === null) {
    return null;
  }

  if (lineInfo.offsetInLine === 0) {
    const newSource =
      workingSource.slice(0, cursorSourcePos) +
      "\n" +
      workingSource.slice(cursorSourcePos);
    const next = runtime.createState(newSource);
    const nextCursor = next.map.sourceToCursor(cursorSourcePos + 1, "forward");
    return {
      source: newSource,
      selection: {
        start: nextCursor.cursorOffset,
        end: nextCursor.cursorOffset,
        affinity: "forward",
      },
    };
  }

  if (listItem.content.trim() === "") {
    const transformed = applyListTransform(
      workingSource,
      lineInfo.lineIndex,
      (range, idx) => convertToPlainText(range, idx),
      () => ({
        start: lineInfo.lineStart,
        end: lineInfo.lineStart,
        affinity: "forward",
      }),
      { start: cursorSourcePos, end: cursorSourcePos, affinity: "forward" },
    );
    if (!transformed) {
      return null;
    }
    const next = runtime.createState(transformed.source);
    const nextCursor = next.map.sourceToCursor(
      transformed.selection.start,
      "forward",
    );
    return {
      source: transformed.source,
      selection: {
        start: nextCursor.cursorOffset,
        end: nextCursor.cursorOffset,
        affinity: "forward",
      },
    };
  }

  const contentStart = lineInfo.lineStart + prefixLength;
  const contentBeforeCursor = workingSource.slice(
    contentStart,
    cursorSourcePos,
  );
  const contentAfterCursor = workingSource.slice(
    cursorSourcePos,
    lineInfo.lineEnd,
  );

  const block = findListBlock(workingSource, lineInfo.lineIndex);
  if (!block) {
    return null;
  }

  const range = parseListRange(
    workingSource,
    block.startOffset,
    block.endOffset,
  );

  const currentLine = range.lines[block.lineIndexInBlock];
  if (currentLine.type !== "list-item") {
    return null;
  }

  const newLines = [...range.lines];
  newLines[block.lineIndexInBlock] = {
    type: "list-item",
    item: { ...currentLine.item, content: contentBeforeCursor },
  };

  const newItem = {
    indent: currentLine.item.indent,
    markerType: currentLine.item.markerType,
    content: contentAfterCursor,
  };

  newLines.splice(block.lineIndexInBlock + 1, 0, {
    type: "list-item" as const,
    item: newItem,
  });

  const transformed = { ...range, lines: newLines };
  const serialized = serializeListRange(transformed);

  const newSource =
    workingSource.slice(0, block.startOffset) +
    serialized +
    workingSource.slice(block.endOffset);

  const newLines2 = newSource.split("\n");
  let newCursorPos = 0;
  for (let i = 0; i < lineInfo.lineIndex + 1; i++) {
    newCursorPos += newLines2[i].length + 1;
  }
  const newLinePrefixLength =
    getListPrefixLength(newLines2[lineInfo.lineIndex + 1]) ?? 0;
  newCursorPos += newLinePrefixLength;

  const next = runtime.createState(newSource);
  const nextCursor = next.map.sourceToCursor(newCursorPos, "forward");
  return {
    source: newSource,
    selection: {
      start: nextCursor.cursorOffset,
      end: nextCursor.cursorOffset,
      affinity: "forward",
    },
  };
}

function handleDeleteBackward(state: RuntimeState): EditResult | null {
  const { source, selection, map, runtime } = state;

  const resultAtSource = (
    nextSource: string,
    sourceOffset: number,
    bias: "backward" | "forward" = "forward",
  ): EditResult => {
    const next = runtime.createState(nextSource);
    const cursor = next.map.sourceToCursor(sourceOffset, bias);
    return {
      source: next.source,
      selection: {
        start: cursor.cursorOffset,
        end: cursor.cursorOffset,
        affinity: "forward",
      },
    };
  };

  const normalizeTransformed = (result: EditResult): EditResult => {
    const next = runtime.createState(result.source);
    const startCursor = next.map.sourceToCursor(
      result.selection.start,
      "forward",
    );
    const endCursor = next.map.sourceToCursor(result.selection.end, "backward");
    return {
      source: next.source,
      selection: {
        start: startCursor.cursorOffset,
        end: endCursor.cursorOffset,
        affinity: "forward",
      },
    };
  };

  if (selection.start !== selection.end) {
    // Cmd+Backspace creates a range selection to the start of the visual row.
    // If that selection covers the entire last list line, delete the line
    // including the preceding newline so we don't leave a trailing empty line.
    const startCursor = Math.min(selection.start, selection.end);
    const endCursor = Math.max(selection.start, selection.end);
    const startSource = map.cursorToSource(startCursor, "backward");
    const endSource = map.cursorToSource(endCursor, "forward");

    const startInfo = getLineInfo(source, startSource);
    if (!isListLine(startInfo.line)) {
      return null;
    }

    const endInfo = getLineInfo(source, Math.max(0, endSource - 1));
    const isSingleLineSelection = startInfo.lineIndex === endInfo.lineIndex;
    const isWholeLine =
      startInfo.offsetInLine === 0 && endSource === startInfo.lineEnd;
    const lines = source.split("\n");
    const isLastLine = startInfo.lineIndex === lines.length - 1;
    if (!isSingleLineSelection || !isWholeLine || !isLastLine) {
      return null;
    }

    const deleteStart =
      startInfo.lineStart > 0 && source[startInfo.lineStart - 1] === "\n"
        ? startInfo.lineStart - 1
        : startInfo.lineStart;
    const nextSource = source.slice(0, deleteStart) + source.slice(endSource);
    return resultAtSource(nextSource, deleteStart, "forward");
  }

  const cursorPos = selection.start;
  if (cursorPos === 0) {
    return null;
  }

  // At boundaries where source-only tokens exist (e.g. list marker + a link
  // label that starts with a source-only "["), mapping a cursor position back
  // to source with a fixed bias can land "inside" the list prefix.
  // Probe both sides so Backspace can reliably treat the caret as being at the
  // list content start when that's what the DOM position represents.
  const cursorSourcePosBackward = map.cursorToSource(cursorPos, "backward");
  const cursorSourcePosForward = map.cursorToSource(cursorPos, "forward");
  const lineInfoBackward = getLineInfo(source, cursorSourcePosBackward);
  const lineInfoForward = getLineInfo(source, cursorSourcePosForward);

  // Prefer the forward-mapped info when it indicates we're exactly at the
  // content start (i.e. after the list marker + space).
  const forwardPrefixLength = getListPrefixLength(lineInfoForward.line);
  const backwardPrefixLength = getListPrefixLength(lineInfoBackward.line);
  const lineInfo =
    forwardPrefixLength !== null &&
    lineInfoForward.offsetInLine === forwardPrefixLength
      ? lineInfoForward
      : lineInfoBackward;
  const prefixLength =
    lineInfo === lineInfoForward ? forwardPrefixLength : backwardPrefixLength;

  if (prefixLength === null) {
    // Not a list line - check if we're merging with a list
    if (lineInfo.offsetInLine === 0 && lineInfo.lineIndex > 0) {
      const lines = source.split("\n");
      const prevLine = lines[lineInfo.lineIndex - 1];
      // If previous line is a list and we're deleting into it, renumber
      if (isListLine(prevLine)) {
        // Just delete newline and renumber
        const newSource =
          source.slice(0, lineInfo.lineStart - 1) +
          source.slice(lineInfo.lineStart);
        // Find and renumber the list block
        const block = findListBlock(newSource, lineInfo.lineIndex - 1);
        if (block) {
          const range = parseListRange(
            newSource,
            block.startOffset,
            block.endOffset,
          );
          const serialized = serializeListRange(range);
          const finalSource =
            newSource.slice(0, block.startOffset) +
            serialized +
            newSource.slice(block.endOffset);
          return resultAtSource(finalSource, lineInfo.lineStart - 1, "forward");
        }
      }
    }
    return null;
  }

  if (lineInfo.offsetInLine === prefixLength) {
    const transformed = applyListTransform(
      source,
      lineInfo.lineIndex,
      (range, idx) => convertToPlainText(range, idx),
      () => ({
        start: lineInfo.lineStart,
        end: lineInfo.lineStart,
        affinity: "forward",
      }),
      selection,
    );
    return transformed ? normalizeTransformed(transformed) : null;
  }

  if (lineInfo.offsetInLine === 0 && lineInfo.lineIndex > 0) {
    const lines = source.split("\n");
    const prevLine = lines[lineInfo.lineIndex - 1];
    const currentItem = parseListItem(lineInfo.line);
    const prevItem = parseListItem(prevLine);

    // Handle merging with blank/non-list line - just delete newline and renumber
    if (currentItem && !prevItem) {
      const newSource =
        source.slice(0, lineInfo.lineStart - 1) +
        source.slice(lineInfo.lineStart);
      // Find the list block in the new source and renumber
      const newLineInfo = getLineInfo(newSource, lineInfo.lineStart - 1);
      // Check if there's a list block that contains our current line
      let listLineIndex = newLineInfo.lineIndex;
      const newLines = newSource.split("\n");
      // Find the start of the list block (scan backwards to find first list line)
      while (
        listLineIndex < newLines.length &&
        !isListLine(newLines[listLineIndex])
      ) {
        listLineIndex++;
      }
      if (listLineIndex < newLines.length) {
        const block = findListBlock(newSource, listLineIndex);
        if (block) {
          const range = parseListRange(
            newSource,
            block.startOffset,
            block.endOffset,
          );
          const serialized = serializeListRange(range);
          const finalSource =
            newSource.slice(0, block.startOffset) +
            serialized +
            newSource.slice(block.endOffset);
          return resultAtSource(finalSource, lineInfo.lineStart - 1, "forward");
        }
      }
      return resultAtSource(newSource, lineInfo.lineStart - 1, "forward");
    }

    if (currentItem && prevItem) {
      let prevLineStart = 0;
      for (let i = 0; i < lineInfo.lineIndex - 1; i++) {
        prevLineStart += lines[i].length + 1;
      }
      const prevPrefixLength = getListPrefixLength(prevLine) ?? 0;
      const newCursorPos =
        prevLineStart + prevPrefixLength + prevItem.content.length;

      const mergedContent =
        prevItem.content +
        (currentItem.content ? " " + currentItem.content : "");

      const newPrevLine = prevLine.slice(0, prevPrefixLength) + mergedContent;
      const newLines = [...lines];
      newLines[lineInfo.lineIndex - 1] = newPrevLine;
      newLines.splice(lineInfo.lineIndex, 1);

      const joined = newLines.join("\n");
      const block = findListBlock(joined, lineInfo.lineIndex - 1);
      if (block) {
        const range = parseListRange(
          joined,
          block.startOffset,
          block.endOffset,
        );
        const serialized = serializeListRange(range);
        const finalSource =
          joined.slice(0, block.startOffset) +
          serialized +
          joined.slice(block.endOffset);
        return resultAtSource(finalSource, newCursorPos, "forward");
      }

      return resultAtSource(joined, newCursorPos, "forward");
    }

    return null;
  }

  return null;
}

function handleDeleteForward(state: RuntimeState): EditResult | null {
  const { source, selection, map, runtime } = state;

  if (selection.start !== selection.end) {
    return null;
  }

  const cursorPos = selection.start;
  if (cursorPos >= map.cursorLength) {
    return null;
  }

  const cursorSourcePos = map.cursorToSource(cursorPos, "forward");
  const lineInfo = getLineInfo(source, cursorSourcePos);

  // Check if we're at end of line (about to delete newline)
  if (cursorSourcePos === lineInfo.lineEnd && cursorSourcePos < source.length) {
    const lines = source.split("\n");
    const nextLineIndex = lineInfo.lineIndex + 1;
    if (nextLineIndex < lines.length) {
      const nextLine = lines[nextLineIndex];
      // If either line is a list, we need to renumber after delete
      if (isListLine(lineInfo.line) || isListLine(nextLine)) {
        const newSource =
          source.slice(0, cursorSourcePos) + source.slice(cursorSourcePos + 1);
        // Find list block and renumber
        const block = findListBlock(newSource, lineInfo.lineIndex);
        if (block) {
          const range = parseListRange(
            newSource,
            block.startOffset,
            block.endOffset,
          );
          const serialized = serializeListRange(range);
          const finalSource =
            newSource.slice(0, block.startOffset) +
            serialized +
            newSource.slice(block.endOffset);
          const next = runtime.createState(finalSource);
          const cursor = next.map.sourceToCursor(cursorSourcePos, "forward");
          return {
            source: next.source,
            selection: {
              start: cursor.cursorOffset,
              end: cursor.cursorOffset,
              affinity: "forward",
            },
          };
        }
      }
    }
  }

  return null;
}

function handleIndent(state: RuntimeState): EditResult | null {
  const { source, selection, map } = state;
  const { startLine, endLine } = getSelectionLineRange(source, selection, map);
  const lines = getSourceLines(source);

  // Check if any line in selection is a list line
  let hasListLine = false;
  for (let i = startLine; i <= endLine; i++) {
    if (isListLine(lines[i])) {
      hasListLine = true;
      break;
    }
  }

  if (!hasListLine) {
    return null;
  }

  // Indent all lines in selection
  const newLines = [...lines];

  for (let i = startLine; i <= endLine; i++) {
    if (isListLine(lines[i])) {
      newLines[i] = "  " + lines[i];
    }
  }

  let newSource = newLines.join("\n");

  // Renumber using AST
  const block = findListBlock(newSource, startLine);
  if (block) {
    const range = parseListRange(newSource, block.startOffset, block.endOffset);
    const serialized = serializeListRange(range);
    newSource =
      newSource.slice(0, block.startOffset) +
      serialized +
      newSource.slice(block.endOffset);
  }

  const linesInSelection = endLine - startLine + 1;
  const newStart = selection.start + 2;
  const newEnd = selection.end + linesInSelection * 2;

  return {
    source: newSource,
    selection: { start: newStart, end: newEnd, affinity: "forward" },
  };
}

function handleOutdent(state: RuntimeState): EditResult | null {
  const { source, selection, map } = state;
  const { startLine, endLine } = getSelectionLineRange(source, selection, map);
  const lines = getSourceLines(source);

  // Check if any line in selection is a list line
  let hasListLine = false;
  for (let i = startLine; i <= endLine; i++) {
    if (isListLine(lines[i])) {
      hasListLine = true;
      break;
    }
  }

  if (!hasListLine) {
    return null;
  }

  // Outdent all lines in selection
  const newLines = [...lines];
  let removedChars = 0;

  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i];
    const listItem = parseListItem(line);

    if (listItem) {
      if (listItem.indent > 0) {
        // Has indent - remove 2 spaces
        newLines[i] = line.slice(2);
        removedChars += 2;
      } else {
        // Top level - remove prefix entirely
        const prefixLen = getListPrefixLength(line) ?? 0;
        newLines[i] = listItem.content;
        removedChars += prefixLen;
      }
    }
  }

  let newSource = newLines.join("\n");

  // Track which block we renumber first
  let firstBlockEnd = -1;

  // Renumber using AST - find any remaining list block
  const firstListLine = newLines.findIndex((l, i) =>
    i >= startLine && i <= endLine ? false : isListLine(l),
  );
  if (firstListLine >= 0) {
    const block = findListBlock(newSource, firstListLine);
    if (block) {
      firstBlockEnd = block.endOffset;
      const range = parseListRange(
        newSource,
        block.startOffset,
        block.endOffset,
      );
      const serialized = serializeListRange(range);
      newSource =
        newSource.slice(0, block.startOffset) +
        serialized +
        newSource.slice(block.endOffset);
    }
  }

  // Also renumber any SEPARATE list block that follows (not part of the first block)
  // This only applies when there's a non-list line (like plain text) between blocks
  for (let i = endLine + 1; i < newLines.length; i++) {
    if (isListLine(newLines[i])) {
      const block = findListBlock(newSource, i);
      // Only renumber if this is a different block (starts after the first block ended)
      if (block && block.startOffset >= firstBlockEnd) {
        const range = parseListRange(
          newSource,
          block.startOffset,
          block.endOffset,
        );
        // Count numbered items before this block to get correct starting number
        const startNum = countNumberedItemsBefore(newSource, i) + 1;
        const serialized = serializeListRange(range, startNum);
        newSource =
          newSource.slice(0, block.startOffset) +
          serialized +
          newSource.slice(block.endOffset);
      }
      break;
    }
  }

  const lineInfo = getLineInfo(source, selection.start);
  const listItem = parseListItem(lines[startLine]);
  const wasTopLevel = listItem && listItem.indent === 0;

  const newStart = wasTopLevel
    ? lineInfo.lineStart
    : Math.max(lineInfo.lineStart, selection.start - 2);
  const newEnd = wasTopLevel
    ? lineInfo.lineStart
    : Math.max(newStart, selection.end - removedChars);

  return {
    source: newSource,
    selection: { start: newStart, end: newEnd, affinity: "forward" },
  };
}

function handleToggleList(
  state: RuntimeState,
  isBullet: boolean,
): EditResult | null {
  const { source, selection, map } = state;
  const { startLine, endLine } = getSelectionLineRange(source, selection, map);
  const lines = getSourceLines(source);

  const bulletPattern = /^(\s*)([-*+])( )/;
  const numberedPattern = /^(\s*)(\d+)\.( )/;
  const targetPattern = isBullet ? bulletPattern : numberedPattern;

  // Check if all lines are already in target format
  let allInTarget = true;
  let hasNonEmpty = false;
  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    hasNonEmpty = true;
    if (!targetPattern.test(line)) {
      allInTarget = false;
      break;
    }
  }

  if (!hasNonEmpty) {
    return null;
  }

  const newLines = [...lines];
  let listNumber = 1;

  if (allInTarget) {
    // Toggle off - remove list markers
    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i];
      if (line.trim() === "") continue;
      const listItem = parseListItem(line);
      if (listItem) {
        newLines[i] = listItem.content;
      }
    }
  } else {
    // Toggle on or convert
    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i];
      if (line.trim() === "") continue;

      const listItem = parseListItem(line);
      const indentMatch = line.match(/^(\s*)/);
      const baseIndent = indentMatch ? indentMatch[1] : "";
      const indentLevel = Math.floor(baseIndent.length / 2);

      let content: string;

      if (listItem) {
        content = listItem.content;
      } else {
        content = line.slice(baseIndent.length);
      }

      let newPrefix: string;
      if (isBullet) {
        newPrefix = "  ".repeat(indentLevel) + "- ";
      } else {
        newPrefix = "  ".repeat(indentLevel) + `${listNumber}. `;
        listNumber++;
      }

      newLines[i] = newPrefix + content;
    }
  }

  let newSource = newLines.join("\n");

  // Renumber using AST if needed
  if (!allInTarget && !isBullet) {
    const block = findListBlock(newSource, startLine);
    if (block) {
      const range = parseListRange(
        newSource,
        block.startOffset,
        block.endOffset,
      );
      const serialized = serializeListRange(range);
      newSource =
        newSource.slice(0, block.startOffset) +
        serialized +
        newSource.slice(block.endOffset);
    }
  }

  // Calculate new selection to preserve the selected range
  let newStartOffset = 0;
  for (let i = 0; i < startLine; i++) {
    newStartOffset += newLines[i].length + 1;
  }

  let newEndOffset = newStartOffset;
  for (let i = startLine; i <= endLine; i++) {
    newEndOffset += newLines[i].length;
    if (i < endLine) {
      newEndOffset += 1;
    }
  }

  return {
    source: newSource,
    selection: {
      start: newStartOffset,
      end: newEndOffset,
      affinity: "forward",
    },
  };
}

function handleInsertListMarkerWithSelection(
  state: RuntimeState,
  marker: string,
): EditResult | null {
  const { source, selection, map } = state;

  // Only handle when there's a selection
  if (selection.start === selection.end) {
    return null;
  }

  // Only handle list markers
  if (marker !== "-" && marker !== "*" && marker !== "+") {
    return null;
  }

  const { startLine, endLine } = getSelectionLineRange(source, selection, map);
  const lines = getSourceLines(source);

  // Only convert to list if selection covers full lines
  // Calculate line boundaries
  let startLineOffset = 0;
  for (let i = 0; i < startLine; i++) {
    startLineOffset += lines[i].length + 1;
  }
  let endLineOffset = startLineOffset;
  for (let i = startLine; i <= endLine; i++) {
    endLineOffset += lines[i].length + (i < endLine ? 1 : 0);
  }

  const selStart = Math.min(selection.start, selection.end);
  const selEnd = Math.max(selection.start, selection.end);
  const selStartSource = map.cursorToSource(selStart, "backward");
  const selEndSource = map.cursorToSource(selEnd, "forward");

  // Check if selection starts at line start and ends at line end
  const startsAtLineStart = selStartSource === startLineOffset;
  const endsAtLineEnd = selEndSource === endLineOffset;

  // For partial selections, don't convert to list - let default behavior handle it
  if (!startsAtLineStart || !endsAtLineEnd) {
    return null;
  }

  // Convert selected lines to bullet list
  const newLines = [...lines];

  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;

    const listItem = parseListItem(line);
    const indentMatch = line.match(/^(\s*)/);
    const baseIndent = indentMatch ? indentMatch[1] : "";
    const indentLevel = Math.floor(baseIndent.length / 2);

    let content: string;
    if (listItem) {
      content = listItem.content;
    } else {
      content = line.slice(baseIndent.length);
    }

    const newPrefix = "  ".repeat(indentLevel) + `${marker} `;
    newLines[i] = newPrefix + content;
  }

  const newSource = newLines.join("\n");

  // Place cursor at start of first modified line's content
  let cursorPos = 0;
  for (let i = 0; i < startLine; i++) {
    cursorPos += newLines[i].length + 1;
  }
  const firstNewLine = newLines[startLine];
  const newPrefixLen = getListPrefixLength(firstNewLine) ?? 0;
  cursorPos += newPrefixLen;

  return {
    source: newSource,
    selection: { start: cursorPos, end: cursorPos, affinity: "forward" },
  };
}

function handleMarkerSwitch(
  state: RuntimeState,
  insertedChar: string,
): EditResult | ListCommand | null {
  const { source, selection, map } = state;

  // If there's a selection, try to convert lines to list
  if (selection.start !== selection.end) {
    // For multi-line selections, use toggle-bullet-list behavior (like Cmd+Shift+8)
    // which doesn't require exact line boundary alignment
    const { startLine, endLine } = getSelectionLineRange(
      source,
      selection,
      map,
    );
    if (
      startLine !== endLine &&
      (insertedChar === "-" || insertedChar === "*" || insertedChar === "+")
    ) {
      return { type: "toggle-bullet-list" };
    }
    return handleInsertListMarkerWithSelection(state, insertedChar);
  }

  if (insertedChar !== "-" && insertedChar !== "*" && insertedChar !== "+") {
    return null;
  }

  const cursorPos = selection.start;
  const cursorSourcePos = map.cursorToSource(
    cursorPos,
    selection.affinity ?? "forward",
  );
  const lineInfo = getLineInfo(source, cursorSourcePos);
  const listMatch = matchListLine(lineInfo.line);

  if (!listMatch || listMatch.number !== null) {
    return null;
  }

  // Check if cursor is at or before the marker position
  const markerPos = listMatch.indent.length;
  if (lineInfo.offsetInLine > markerPos) {
    return null;
  }

  // Only switch if typing a different marker
  if (listMatch.marker === insertedChar) {
    return null;
  }

  // Replace the marker
  const newLine =
    listMatch.indent + insertedChar + listMatch.space + listMatch.content;
  const newSource =
    source.slice(0, lineInfo.lineStart) +
    newLine +
    source.slice(lineInfo.lineStart + lineInfo.line.length);

  return {
    source: newSource,
    selection: {
      start: cursorPos + 1,
      end: cursorPos + 1,
      affinity: "forward",
    },
  };
}

function getParagraphText(block: Block): string | null {
  if (block.type !== "paragraph") {
    return null;
  }
  let text = "";
  for (const inline of block.content) {
    if (inline.type === "text") {
      text += inline.text;
    } else if (inline.type === "inline-wrapper") {
      for (const child of inline.children) {
        if (child.type === "text") {
          text += child.text;
        }
      }
    } else if (inline.type === "inline-atom") {
      text += " ";
    }
  }
  return text;
}

/** Command to toggle bullet list formatting */
export type ToggleBulletListCommand = { type: "toggle-bullet-list" };

/** Command to toggle numbered list formatting */
export type ToggleNumberedListCommand = { type: "toggle-numbered-list" };

/** All list extension commands */
export type ListCommand = ToggleBulletListCommand | ToggleNumberedListCommand;

export const plainTextListExtension: CakeExtension = (editor) => {
  const disposers: Array<() => void> = [];

  disposers.push(
    editor.registerKeybindings([
      {
        key: "8",
        meta: true,
        shift: true,
        command: { type: "toggle-bullet-list" },
      },
      {
        key: "8",
        ctrl: true,
        shift: true,
        command: { type: "toggle-bullet-list" },
      },
      {
        key: "7",
        meta: true,
        shift: true,
        command: { type: "toggle-numbered-list" },
      },
      {
        key: "7",
        ctrl: true,
        shift: true,
        command: { type: "toggle-numbered-list" },
      },
    ]),
  );

  disposers.push(
    editor.registerOnEdit((command, state) => {
      if (command.type === "insert-line-break") {
        return handleInsertLineBreak(state);
      }
      if (command.type === "delete-backward") {
        return handleDeleteBackward(state);
      }
      if (command.type === "delete-forward") {
        return handleDeleteForward(state);
      }
      if (command.type === "indent") {
        return handleIndent(state);
      }
      if (command.type === "outdent") {
        return handleOutdent(state);
      }
      if (command.type === "toggle-bullet-list") {
        return handleToggleList(state, true);
      }
      if (command.type === "toggle-numbered-list") {
        return handleToggleList(state, false);
      }
      if (command.type === "insert" && command.text.length === 1) {
        return handleMarkerSwitch(state, command.text);
      }
      return null;
    }),
  );

  disposers.push(
    editor.registerBlockRenderer(
      (block: Block, context: DomRenderContext): Node | null => {
        if (block.type !== "paragraph") {
          return null;
        }

        const text = getParagraphText(block);
        if (!text) {
          return null;
        }

        const listMatch = matchListLine(text);
        if (!listMatch) {
          return null;
        }

        const element = document.createElement("div");
        element.setAttribute("data-line-index", String(context.getLineIndex()));
        element.classList.add("cake-line", "is-list");
        context.incrementLineIndex();

        const indentLevel = Math.floor(listMatch.indent.length / 2);
        if (indentLevel > 0) {
          element.style.setProperty(
            "--cake-list-indent",
            `${indentLevel * 2}ch`,
          );
        }

        const markerPrefix = `${listMatch.marker}${listMatch.space}`;
        element.style.setProperty(
          "--cake-list-marker",
          `${markerPrefix.length}ch`,
        );

        if (block.content.length === 0) {
          const textNode = document.createTextNode("");
          context.createTextRun(textNode);
          element.append(textNode);
          element.append(document.createElement("br"));
        } else {
          const mergedContent = mergeInlineForRender(block.content);
          for (const inline of mergedContent) {
            for (const node of context.renderInline(inline)) {
              element.append(node);
            }
          }
        }

        return element;
      },
    ),
  );

  return () =>
    disposers
      .splice(0)
      .reverse()
      .forEach((d) => d());
};
