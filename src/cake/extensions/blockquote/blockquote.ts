import {
  defineExtension,
  type EditResult,
  type ParseBlockResult,
  type RuntimeState,
  type SerializeBlockResult,
} from "../../core/runtime";
import type { Block } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";

const BLOCKQUOTE_KIND = "blockquote";
const PREFIX = "> ";
const BLOCKQUOTE_PATTERN = /^> /;

/** Semantic command to toggle blockquote formatting */
type ToggleBlockquoteCommand = { type: "toggle-blockquote" };

function findLineStartInSource(source: string, sourceOffset: number): number {
  let lineStart = sourceOffset;
  while (lineStart > 0 && source[lineStart - 1] !== "\n") {
    lineStart--;
  }
  return lineStart;
}

function handleToggleBlockquote(state: RuntimeState): EditResult | null {
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
  const blockquoteMatch = lineContent.match(BLOCKQUOTE_PATTERN);

  let newSource: string;
  let newCursorOffset: number;

  if (blockquoteMatch) {
    // Line is already a blockquote - remove the prefix
    newSource =
      source.slice(0, lineStart) +
      lineContent.slice(PREFIX.length) +
      source.slice(lineEnd);

    // Adjust cursor position - move back by prefix length
    const cursorLineOffset = sourcePos - lineStart;
    if (cursorLineOffset >= PREFIX.length) {
      newCursorOffset = sourcePos - PREFIX.length;
    } else {
      newCursorOffset = lineStart;
    }
  } else {
    // Line is not a blockquote - add the prefix
    newSource =
      source.slice(0, lineStart) + PREFIX + lineContent + source.slice(lineEnd);

    // Cursor moves forward by prefix length
    newCursorOffset = sourcePos + PREFIX.length;
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

export const blockquoteExtension = defineExtension<ToggleBlockquoteCommand>({
  name: "blockquote",
  onEdit(command, state) {
    if (command.type === "toggle-blockquote") {
      return handleToggleBlockquote(state);
    }
    return null;
  },
  parseBlock(source, start, context): ParseBlockResult {
    if (source.slice(start, start + PREFIX.length) !== PREFIX) {
      return null;
    }

    const blocks: Block[] = [];
    let pos = start;

    while (pos < source.length) {
      if (source.slice(pos, pos + PREFIX.length) !== PREFIX) {
        break;
      }

      let lineEnd = source.indexOf("\n", pos);
      if (lineEnd === -1) {
        lineEnd = source.length;
      }

      const contentStart = pos + PREFIX.length;
      const content = context.parseInline(source, contentStart, lineEnd);
      const paragraph = {
        type: "paragraph" as const,
        content,
      };

      blocks.push(paragraph);

      if (lineEnd >= source.length) {
        pos = lineEnd;
        break;
      }

      const nextLineStart = lineEnd + 1;
      if (
        source.slice(nextLineStart, nextLineStart + PREFIX.length) === PREFIX
      ) {
        pos = nextLineStart;
        continue;
      }

      pos = lineEnd;
      break;
    }

    return {
      block: {
        type: "block-wrapper",
        kind: BLOCKQUOTE_KIND,
        blocks,
      },
      nextPos: pos,
    };
  },
  serializeBlock(block, context): SerializeBlockResult | null {
    if (block.type !== "block-wrapper" || block.kind !== BLOCKQUOTE_KIND) {
      return null;
    }

    const builder = new CursorSourceBuilder();
    block.blocks.forEach((child, index) => {
      builder.appendSourceOnly(PREFIX);
      const serialized = context.serializeBlock(child);
      builder.appendSerialized(serialized);
      if (index < block.blocks.length - 1) {
        builder.appendText("\n");
      }
    });

    return builder.build();
  },
  renderBlock(block, context) {
    if (block.type !== "block-wrapper" || block.kind !== BLOCKQUOTE_KIND) {
      return null;
    }

    const element = document.createElement("blockquote");
    element.setAttribute("data-block-wrapper", BLOCKQUOTE_KIND);
    for (const node of context.renderBlocks(block.blocks)) {
      element.append(node);
    }
    return element;
  },
});
