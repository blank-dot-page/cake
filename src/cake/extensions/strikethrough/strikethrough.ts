import type {
  CakeExtension,
  ParseInlineResult,
  SerializeInlineResult,
} from "../../core/runtime";
import type { Inline } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";

const STRIKE_KIND = "strikethrough";

export const strikethroughExtension: CakeExtension = {
  name: "strikethrough",
  toggleInline: { kind: STRIKE_KIND, markers: ["~~"] },
  keybindings: [
    {
      key: "x",
      meta: true,
      shift: true,
      command: { type: "toggle-inline", marker: "~~" },
    },
    {
      key: "x",
      ctrl: true,
      shift: true,
      command: { type: "toggle-inline", marker: "~~" },
    },
  ],
  inlineWrapperAffinity: [{ kind: STRIKE_KIND, inclusive: true }],
  parseInline(source, start, end, context): ParseInlineResult {
    if (source.slice(start, start + 2) !== "~~") {
      return null;
    }

    const close = source.indexOf("~~", start + 2);
    if (close === -1 || close >= end) {
      return null;
    }

    if (close === start + 2 && close + 2 < end) {
      return null;
    }

    const children = context.parseInline(source, start + 2, close);
    return {
      inline: {
        type: "inline-wrapper",
        kind: STRIKE_KIND,
        children,
      },
      nextPos: close + 2,
    };
  },
  serializeInline(inline, context): SerializeInlineResult | null {
    if (inline.type !== "inline-wrapper" || inline.kind !== STRIKE_KIND) {
      return null;
    }

    const builder = new CursorSourceBuilder();
    builder.appendSourceOnly("~~");
    for (const child of inline.children) {
      const serialized = context.serializeInline(child);
      builder.appendSerialized(serialized);
    }
    builder.appendSourceOnly("~~");
    return builder.build();
  },
  normalizeInline(inline): Inline | null {
    if (inline.type !== "inline-wrapper" || inline.kind !== STRIKE_KIND) {
      return inline;
    }

    if (inline.children.length === 0) {
      return null;
    }

    return inline;
  },
  renderInline(inline, context) {
    if (inline.type !== "inline-wrapper" || inline.kind !== STRIKE_KIND) {
      return null;
    }

    const element = document.createElement("s");
    for (const child of inline.children) {
      for (const node of context.renderInline(child)) {
        element.append(node);
      }
    }
    return element;
  },
};
