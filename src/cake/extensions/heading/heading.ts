import {
  defineExtension,
  type EditResult,
  type ParseBlockResult,
  type RuntimeState,
  type SerializeBlockResult,
} from "../../core/runtime";
import type { Block } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";
import { mergeInlineForRender } from "../../dom/render";

const HEADING_KIND = "heading";
const HEADING_PATTERN = /^(#{1,3}) /;

type HeadingData = { level: number };

/** Semantic command to toggle heading formatting */
type ToggleHeadingCommand = { type: "toggle-heading"; level?: number };

function findLineStartInSource(source: string, sourceOffset: number): number {
  let lineStart = sourceOffset;
  while (lineStart > 0 && source[lineStart - 1] !== "\n") {
    lineStart--;
  }
  return lineStart;
}

function handleDeleteBackward(state: RuntimeState): EditResult | null {
  const { source, selection, map } = state;

  // Only handle collapsed selection (cursor, not range)
  if (selection.start !== selection.end) {
    return null;
  }

  const cursorPos = selection.start;

  // Use forward affinity when mapping cursor->source so source-only prefixes
  // (like the heading marker "# ") still resolve to the post-marker position.
  //
  // This matters when the caret is at the start of a heading line (cursorPos=0)
  // but the selection affinity is "backward" (e.g. after Cmd+Backspace).
  const sourcePos = map.cursorToSource(cursorPos, "forward");

  // Find the start of the line in source
  const lineStart = findLineStartInSource(source, sourcePos);

  // Check if cursor is at the start of visible content on this line
  // The cursor should be at position 0 relative to the heading content
  // which means sourcePos should be right after the heading marker
  const lineContent = source.slice(lineStart);
  const match = lineContent.match(HEADING_PATTERN);

  if (!match) {
    return null;
  }

  const marker = match[0]; // e.g., "# " or "## " or "### "

  // Check if the cursor's source position is at the start of content (after the marker)
  const contentStart = lineStart + marker.length;
  if (sourcePos !== contentStart) {
    return null;
  }

  // Remove the heading marker from the source
  const newSource = source.slice(0, lineStart) + source.slice(contentStart);

  return {
    source: newSource,
    selection: {
      start: cursorPos,
      end: cursorPos,
      affinity: "forward",
    },
  };
}

function handleMultilineInsertInHeading(
  state: RuntimeState,
  text: string,
): EditResult | null {
  const { source, selection, map, runtime } = state;

  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalizedText.includes("\n")) {
    return null;
  }

  const cursorStart = Math.min(selection.start, selection.end);
  const cursorEnd = Math.max(selection.start, selection.end);

  const isCollapsed = cursorStart === cursorEnd;
  const from = isCollapsed
    ? map.cursorToSource(cursorStart, selection.affinity ?? "forward")
    : map.cursorToSource(cursorStart, "forward");
  const to = isCollapsed ? from : map.cursorToSource(cursorEnd, "backward");

  // Only handle inserts entirely within a single heading line.
  const lineStart = findLineStartInSource(source, from);
  let lineEnd = source.indexOf("\n", lineStart);
  if (lineEnd === -1) {
    lineEnd = source.length;
  }
  if (to > lineEnd) {
    return null;
  }

  const lineContent = source.slice(lineStart, lineEnd);
  const match = lineContent.match(HEADING_PATTERN);
  if (!match) {
    return null;
  }
  const marker = match[0];
  const contentStart = lineStart + marker.length;
  if (from < contentStart) {
    return null;
  }

  const nextSource = source.slice(0, from) + normalizedText + source.slice(to);

  // Compute the caret from source space so it stays stable even when the pasted
  // text contains inline markers that become source-only after parsing.
  const caretSource = from + normalizedText.length;
  const next = runtime.createState(nextSource);
  const caretCursor = next.map.sourceToCursor(caretSource, "forward");

  return {
    source: nextSource,
    selection: {
      start: caretCursor.cursorOffset,
      end: caretCursor.cursorOffset,
      affinity: caretCursor.affinity,
    },
  };
}

function shouldExitHeadingOnLineBreak(state: RuntimeState): boolean {
  const { source, selection, map } = state;

  if (selection.start !== selection.end) {
    return false;
  }

  const cursorPos = selection.start;
  const sourcePos = map.cursorToSource(cursorPos, "forward");

  const lineStart = findLineStartInSource(source, sourcePos);
  let lineEnd = source.indexOf("\n", lineStart);
  if (lineEnd === -1) {
    lineEnd = source.length;
  }

  const lineContent = source.slice(lineStart, lineEnd);
  const match = lineContent.match(HEADING_PATTERN);
  if (!match) {
    return false;
  }

  const marker = match[0];
  const contentStart = lineStart + marker.length;
  return sourcePos >= contentStart && sourcePos <= lineEnd;
}

function handleToggleHeading(
  state: RuntimeState,
  targetLevel: number,
): EditResult | null {
  const { source, selection, map, runtime } = state;

  // Get the cursor's source position
  const cursorPos = Math.min(selection.start, selection.end);
  const sourcePos = map.cursorToSource(
    cursorPos,
    selection.affinity ?? "forward",
  );

  // Find line boundaries in source
  const lineStart = findLineStartInSource(source, sourcePos);
  let lineEnd = source.indexOf("\n", lineStart);
  if (lineEnd === -1) {
    lineEnd = source.length;
  }

  const lineContent = source.slice(lineStart, lineEnd);
  const headingMatch = lineContent.match(HEADING_PATTERN);

  let newSource: string;
  let newCursorOffset: number;

  if (headingMatch) {
    // Line is already a heading
    const currentLevel = headingMatch[1].length;
    const existingMarker = headingMatch[0]; // e.g., "# " or "## "

    if (currentLevel === targetLevel) {
      // Same level - remove the heading
      newSource =
        source.slice(0, lineStart) +
        lineContent.slice(existingMarker.length) +
        source.slice(lineEnd);

      // Adjust cursor position - move back by marker length
      const cursorLineOffset = sourcePos - lineStart;
      if (cursorLineOffset >= existingMarker.length) {
        newCursorOffset = sourcePos - existingMarker.length;
      } else {
        newCursorOffset = lineStart;
      }
    } else {
      // Different level - change the heading level
      const newMarker = "#".repeat(targetLevel) + " ";
      newSource =
        source.slice(0, lineStart) +
        newMarker +
        lineContent.slice(existingMarker.length) +
        source.slice(lineEnd);

      // Adjust cursor position for marker length difference
      const markerDiff = newMarker.length - existingMarker.length;
      const cursorLineOffset = sourcePos - lineStart;
      if (cursorLineOffset >= existingMarker.length) {
        newCursorOffset = sourcePos + markerDiff;
      } else {
        newCursorOffset = lineStart + newMarker.length;
      }
    }
  } else {
    // Line is not a heading - add the heading marker
    const newMarker = "#".repeat(targetLevel) + " ";
    newSource =
      source.slice(0, lineStart) + newMarker + lineContent + source.slice(lineEnd);

    // Cursor moves forward by marker length
    newCursorOffset = sourcePos + newMarker.length;
  }

  // Create new state and map cursor through it
  const next = runtime.createState(newSource);
  const caretCursor = next.map.sourceToCursor(newCursorOffset, "forward");

  return {
    source: newSource,
    selection: {
      start: caretCursor.cursorOffset,
      end: caretCursor.cursorOffset,
      affinity: "forward",
    },
  };
}

export const headingExtension = defineExtension<ToggleHeadingCommand>({
  name: "heading",
  onEdit(command, state) {
    // Handle semantic toggle-heading command
    if (command.type === "toggle-heading") {
      const level = command.level ?? 1;
      return handleToggleHeading(state, level);
    }

    if (command.type === "delete-backward") {
      return handleDeleteBackward(state);
    }

    if (command.type === "insert-line-break") {
      if (shouldExitHeadingOnLineBreak(state)) {
        return { type: "exit-block-wrapper" };
      }
      return null;
    }

    if (command.type === "insert") {
      const multiline = handleMultilineInsertInHeading(state, command.text);
      if (multiline) {
        return multiline;
      }
    }

    // Autoformat: typing a space after 1-3 leading hashes at the start of a
    // paragraph line converts it into a heading (v1 parity).
    //
    // This is implemented in the extension (not core) by taking over the insert
    // and returning a new source string, which the runtime re-parses to produce
    // a heading block-wrapper.
    if (command.type !== "insert" || command.text !== " ") {
      return null;
    }

    const { source, selection, map } = state;
    if (selection.start !== selection.end) {
      return null;
    }

    const cursorPos = selection.start;
    const sourcePos = map.cursorToSource(
      cursorPos,
      selection.affinity ?? "forward",
    );
    const lineStart = findLineStartInSource(source, sourcePos);
    const prefix = source.slice(lineStart, sourcePos);
    if (!prefix || prefix.length > 3) {
      return null;
    }
    if (!/^[#]+$/.test(prefix)) {
      return null;
    }

    // Only convert when we're immediately after the leading hashes.
    if (sourcePos !== lineStart + prefix.length) {
      return null;
    }

    const nextSource =
      source.slice(0, sourcePos) + " " + source.slice(sourcePos);
    const lineStartCursor = cursorPos - prefix.length;

    return {
      source: nextSource,
      selection: {
        start: lineStartCursor,
        end: lineStartCursor,
        affinity: "forward",
      },
    };
  },
  parseBlock(source, start, context): ParseBlockResult {
    let lineEnd = source.indexOf("\n", start);
    if (lineEnd === -1) {
      lineEnd = source.length;
    }

    let pos = start;
    let level = 0;
    while (pos < lineEnd && source[pos] === "#" && level < 3) {
      level += 1;
      pos += 1;
    }

    if (level === 0 || pos >= lineEnd || source[pos] !== " ") {
      return null;
    }

    const contentStart = pos + 1;
    const content = context.parseInline(source, contentStart, lineEnd);
    const paragraph: Block = { type: "paragraph", content };

    return {
      block: {
        type: "block-wrapper",
        kind: HEADING_KIND,
        blocks: [paragraph],
        data: { level } satisfies HeadingData,
      },
      nextPos: lineEnd,
    };
  },
  serializeBlock(block, context): SerializeBlockResult | null {
    if (block.type !== "block-wrapper" || block.kind !== HEADING_KIND) {
      return null;
    }

    const level = typeof block.data?.level === "number" ? block.data.level : 1;
    const normalizedLevel = Math.max(1, Math.min(3, level));
    const marker = `${"#".repeat(normalizedLevel)} `;
    const builder = new CursorSourceBuilder();
    builder.appendSourceOnly(marker);
    const paragraph = block.blocks[0];
    if (paragraph) {
      builder.appendSerialized(context.serializeBlock(paragraph));
    }
    return builder.build();
  },
  normalizeBlock(block): Block | null {
    if (block.type !== "block-wrapper" || block.kind !== HEADING_KIND) {
      return block;
    }

    if (block.blocks.length === 0) {
      return {
        ...block,
        blocks: [{ type: "paragraph", content: [] }],
      };
    }

    return block;
  },
  renderBlock(block, context) {
    if (block.type !== "block-wrapper" || block.kind !== HEADING_KIND) {
      return null;
    }

    const level = typeof block.data?.level === "number" ? block.data.level : 1;
    const normalizedLevel = Math.max(1, Math.min(3, level));
    const lineElement = document.createElement("div");
    lineElement.setAttribute("data-line-index", String(context.getLineIndex()));
    lineElement.classList.add(
      "cake-line",
      "is-heading",
      `is-heading-${normalizedLevel}`,
    );
    context.incrementLineIndex();

    const paragraph = block.blocks[0];
    if (paragraph?.type === "paragraph" && paragraph.content.length > 0) {
      lineElement.removeAttribute("aria-placeholder");
      const mergedContent = mergeInlineForRender(paragraph.content);
      for (const inline of mergedContent) {
        for (const node of context.renderInline(inline)) {
          lineElement.append(node);
        }
      }
    } else {
      lineElement.setAttribute(
        "aria-placeholder",
        `Heading ${normalizedLevel}`,
      );
      const node = document.createTextNode("");
      context.createTextRun(node);
      lineElement.append(node);
    }
    return lineElement;
  },
});
