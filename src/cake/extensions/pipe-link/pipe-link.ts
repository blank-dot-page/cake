import {
  defineExtension,
  type ParseInlineResult,
  type SerializeInlineResult,
} from "../../core/runtime";
import type { Inline } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";

const PIPE_LINK_KIND = "pipe-link";

export const pipeLinkExtension = defineExtension({
  name: "pipe-link",
  parseInline(source, start, end): ParseInlineResult {
    if (source[start] !== "|") {
      return null;
    }

    const labelClose = source.indexOf("|", start + 1);
    if (labelClose === -1 || labelClose >= end) {
      return null;
    }

    const urlClose = source.indexOf("|", labelClose + 1);
    if (urlClose === -1 || urlClose >= end) {
      return null;
    }

    const label = source.slice(start + 1, labelClose);
    const url = source.slice(labelClose + 1, urlClose);

    if (!label || !url) {
      return null;
    }

    return {
      inline: {
        type: "inline-wrapper",
        kind: PIPE_LINK_KIND,
        children: [{ type: "text", text: label }],
        data: { url },
      },
      nextPos: urlClose + 1,
    };
  },
  serializeInline(inline, context): SerializeInlineResult | null {
    if (inline.type !== "inline-wrapper" || inline.kind !== PIPE_LINK_KIND) {
      return null;
    }

    const builder = new CursorSourceBuilder();
    builder.appendSourceOnly("|");
    for (const child of inline.children) {
      const serialized = context.serializeInline(child);
      builder.appendSerialized(serialized);
    }
    builder.appendSourceOnly("|");
    const url = typeof inline.data?.url === "string" ? inline.data.url : "";
    builder.appendSourceOnly(url);
    builder.appendSourceOnly("|");
    return builder.build();
  },
  normalizeInline(inline): Inline | null {
    if (inline.type !== "inline-wrapper" || inline.kind !== PIPE_LINK_KIND) {
      return inline;
    }

    if (inline.children.length === 0) {
      return null;
    }

    return inline;
  },
  renderInline(inline, context) {
    if (inline.type !== "inline-wrapper" || inline.kind !== PIPE_LINK_KIND) {
      return null;
    }

    const element = document.createElement("a");
    const url = typeof inline.data?.url === "string" ? inline.data.url : "";
    element.setAttribute("href", url);
    element.className = "cake-link cake-pipe-link";
    for (const child of inline.children) {
      for (const node of context.renderInline(child)) {
        element.append(node);
      }
    }
    return element;
  },
});
