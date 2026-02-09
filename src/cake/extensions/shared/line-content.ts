import type { Runtime } from "../../core/runtime";
import type { Block, Doc } from "../../core/types";
import { parseListItem } from "../list/list-ast";

function serializeBlockContent(block: Block, runtime: Runtime): string {
  if (block.type === "paragraph") {
    const doc: Doc = { type: "doc", blocks: [block] };
    return runtime.serialize(doc).source;
  }

  if (block.type === "block-wrapper") {
    return block.blocks
      .map((child) => serializeBlockContent(child, runtime))
      .join("\n");
  }

  return "";
}

/**
 * Extract editable block content from a single source line.
 *
 * This strips structural wrappers (headings, blockquotes, etc.) and list
 * markers so command toggles can convert between block types without leaking
 * source-only marker syntax into the next block.
 */
export function getLineBlockContent(lineSource: string, runtime: Runtime): string {
  if (lineSource === "") {
    return "";
  }

  const doc = runtime.parse(lineSource);
  const firstBlock = doc.blocks[0];
  if (!firstBlock) {
    return "";
  }

  const wrapperFreeContent = serializeBlockContent(firstBlock, runtime);
  const listItem = parseListItem(wrapperFreeContent);
  if (listItem) {
    return listItem.content;
  }

  return wrapperFreeContent;
}
