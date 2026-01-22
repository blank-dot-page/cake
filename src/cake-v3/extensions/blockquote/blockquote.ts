import type {
  CakeExtensionV3,
  ParseBlockResult,
  SerializeBlockResult,
} from "../../core/runtime";
import type { Block } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";

const BLOCKQUOTE_KIND = "blockquote";
const PREFIX = "> ";

export const blockquoteExtension: CakeExtensionV3 = {
  name: "blockquote",
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
    for (const node of context.renderBlocks(block.blocks)) {
      element.append(node);
    }
    return element;
  },
};
