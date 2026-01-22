/**
 * List AST - a structured representation of list content that can be
 * transformed and serialized back to text with correct numbering.
 */

type MarkerType = "bullet" | "numbered";

interface ListItem {
  indent: number; // indent level (0 = top level)
  markerType: MarkerType;
  content: string; // the text content after the marker
}

interface PlainLine {
  type: "plain";
  content: string;
}

interface ListItemLine {
  type: "list-item";
  item: ListItem;
}

type ListLine = PlainLine | ListItemLine;

interface ListRange {
  lines: ListLine[];
  startOffset: number; // source offset where this range starts
  endOffset: number; // source offset where this range ends
}

// Match list lines - capture exactly one space after marker, rest goes to content
const LIST_LINE_REGEX = /^(\s*)([-*+]|\d+\.)( )(.*)$/;
const INDENT_SIZE = 2;

function parseMarkerType(marker: string): MarkerType {
  return /^\d+\.$/.test(marker) ? "numbered" : "bullet";
}

function parseLine(line: string): ListLine {
  const match = line.match(LIST_LINE_REGEX);
  if (!match) {
    return { type: "plain", content: line };
  }

  const indent = Math.floor(match[1].length / INDENT_SIZE);
  const markerType = parseMarkerType(match[2]);
  const content = match[4] ?? "";

  return {
    type: "list-item",
    item: { indent, markerType, content },
  };
}

export function parseListRange(
  source: string,
  startOffset: number,
  endOffset: number,
): ListRange {
  const text = source.slice(startOffset, endOffset);
  const rawLines = text.split("\n");
  const lines = rawLines.map(parseLine);

  return { lines, startOffset, endOffset };
}

export function serializeListRange(
  range: ListRange,
  startNumber: number = 1,
): string {
  // Track current number at each indent level
  const numbersByIndent: Map<number, number> = new Map();
  numbersByIndent.set(0, startNumber);

  return range.lines
    .map((line) => {
      if (line.type === "plain") {
        // Only blank lines reset numbering
        if (line.content.trim() === "") {
          numbersByIndent.clear();
        }
        return line.content;
      }

      const { item } = line;
      const indentStr = " ".repeat(item.indent * INDENT_SIZE);

      if (item.markerType === "bullet") {
        // Bullet doesn't affect numbering
        return `${indentStr}- ${item.content}`;
      }

      // Numbered: get current number at this indent level
      const currentNum = numbersByIndent.get(item.indent) ?? 1;
      numbersByIndent.set(item.indent, currentNum + 1);

      // Reset numbering for deeper indent levels
      for (const [indent] of numbersByIndent) {
        if (indent > item.indent) {
          numbersByIndent.delete(indent);
        }
      }

      return `${indentStr}${currentNum}. ${item.content}`;
    })
    .join("\n");
}

// AST Operations

export function insertItemAfter(
  range: ListRange,
  lineIndex: number,
  item: ListItem,
): ListRange {
  const newLines = [...range.lines];
  newLines.splice(lineIndex + 1, 0, { type: "list-item", item });
  return { ...range, lines: newLines };
}

export function removeItem(range: ListRange, lineIndex: number): ListRange {
  const newLines = [...range.lines];
  newLines.splice(lineIndex, 1);
  return { ...range, lines: newLines };
}

export function convertToPlainText(
  range: ListRange,
  lineIndex: number,
): ListRange {
  const line = range.lines[lineIndex];
  if (line.type !== "list-item") {
    return range;
  }

  const newLines = [...range.lines];
  newLines[lineIndex] = { type: "plain", content: line.item.content };
  return { ...range, lines: newLines };
}

export function indentItem(range: ListRange, lineIndex: number): ListRange {
  const line = range.lines[lineIndex];
  if (line.type !== "list-item") {
    return range;
  }

  const newLines = [...range.lines];
  newLines[lineIndex] = {
    type: "list-item",
    item: { ...line.item, indent: line.item.indent + 1 },
  };
  return { ...range, lines: newLines };
}

export function outdentItem(range: ListRange, lineIndex: number): ListRange {
  const line = range.lines[lineIndex];
  if (line.type !== "list-item") {
    return range;
  }

  if (line.item.indent === 0) {
    // Top-level item: convert to plain text
    return convertToPlainText(range, lineIndex);
  }

  const newLines = [...range.lines];
  newLines[lineIndex] = {
    type: "list-item",
    item: { ...line.item, indent: line.item.indent - 1 },
  };
  return { ...range, lines: newLines };
}

export function updateItemContent(
  range: ListRange,
  lineIndex: number,
  content: string,
): ListRange {
  const line = range.lines[lineIndex];
  if (line.type !== "list-item") {
    return range;
  }

  const newLines = [...range.lines];
  newLines[lineIndex] = {
    type: "list-item",
    item: { ...line.item, content },
  };
  return { ...range, lines: newLines };
}

export function mergeItems(
  range: ListRange,
  targetLineIndex: number,
  sourceLineIndex: number,
): ListRange {
  const targetLine = range.lines[targetLineIndex];
  const sourceLine = range.lines[sourceLineIndex];

  if (targetLine.type !== "list-item" || sourceLine.type !== "list-item") {
    return range;
  }

  const mergedContent =
    targetLine.item.content +
    (sourceLine.item.content ? " " + sourceLine.item.content : "");

  let result = updateItemContent(range, targetLineIndex, mergedContent);
  result = removeItem(result, sourceLineIndex);
  return result;
}

// Helper to find list range boundaries from a cursor position
export function findListRangeBoundaries(
  source: string,
  cursorOffset: number,
): { startOffset: number; endOffset: number; lineIndex: number } | null {
  const lines = source.split("\n");
  let offset = 0;
  let cursorLineIndex = 0;

  // Find which line the cursor is on
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = offset + lines[i].length;
    if (cursorOffset >= offset && cursorOffset <= lineEnd) {
      cursorLineIndex = i;
      break;
    }
    offset = lineEnd + 1;
  }

  // Check if current line is a list item
  const currentLine = lines[cursorLineIndex];
  if (!LIST_LINE_REGEX.test(currentLine)) {
    return null;
  }

  // Expand backwards to find start of list
  let startLineIndex = cursorLineIndex;
  while (startLineIndex > 0) {
    const prevLine = lines[startLineIndex - 1];
    if (prevLine.trim() === "" || !LIST_LINE_REGEX.test(prevLine)) {
      break;
    }
    startLineIndex--;
  }

  // Expand forwards to find end of list
  let endLineIndex = cursorLineIndex;
  while (endLineIndex < lines.length - 1) {
    const nextLine = lines[endLineIndex + 1];
    if (nextLine.trim() === "" || !LIST_LINE_REGEX.test(nextLine)) {
      break;
    }
    endLineIndex++;
  }

  // Calculate offsets
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
    lineIndex: cursorLineIndex - startLineIndex,
  };
}

// Get line info at a specific offset
export function getLineInfo(
  source: string,
  offset: number,
): {
  lineIndex: number;
  lineStart: number;
  lineEnd: number;
  line: string;
  offsetInLine: number;
} {
  const lines = source.split("\n");
  let pos = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineStart = pos;
    const lineEnd = pos + lines[i].length;
    if (offset >= lineStart && offset <= lineEnd) {
      return {
        lineIndex: i,
        lineStart,
        lineEnd,
        line: lines[i],
        offsetInLine: offset - lineStart,
      };
    }
    pos = lineEnd + 1;
  }

  const lastLine = lines[lines.length - 1] ?? "";
  const lastLineStart = source.length - lastLine.length;
  return {
    lineIndex: lines.length - 1,
    lineStart: lastLineStart,
    lineEnd: source.length,
    line: lastLine,
    offsetInLine: offset - lastLineStart,
  };
}

// Get the prefix length for a list line (indent + marker + space)
export function getListPrefixLength(line: string): number | null {
  const match = line.match(LIST_LINE_REGEX);
  if (!match) {
    return null;
  }
  return match[1].length + match[2].length + match[3].length;
}

// Check if a line is a list item
export function isListLine(line: string): boolean {
  return LIST_LINE_REGEX.test(line);
}

// Parse a single line and return the list item if it is one
export function parseListItem(line: string): ListItem | null {
  const parsed = parseLine(line);
  if (parsed.type !== "list-item") {
    return null;
  }
  return parsed.item;
}

// Count numbered items at top level (indent 0) before a given line index
export function countNumberedItemsBefore(
  source: string,
  beforeLineIndex: number,
): number {
  const lines = source.split("\n");
  let count = 0;
  for (let i = 0; i < beforeLineIndex && i < lines.length; i++) {
    const item = parseListItem(lines[i]);
    if (item && item.markerType === "numbered" && item.indent === 0) {
      count++;
    }
  }
  return count;
}
