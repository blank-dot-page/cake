import type {
  CakeExtension,
  ParseInlineResult,
  SerializeInlineResult,
} from "../../core/runtime";
import type { Inline } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";

const BOLD_KIND = "bold";

export const boldExtension: CakeExtension = {
  name: "bold",
  toggleInline: { kind: BOLD_KIND, markers: ["**"] },
  keybindings: [
    { key: "b", meta: true, command: { type: "toggle-inline", marker: "**" } },
    { key: "b", ctrl: true, command: { type: "toggle-inline", marker: "**" } },
  ],
  inlineWrapperAffinity: [{ kind: BOLD_KIND, inclusive: true }],
  parseInline(source, start, end, context): ParseInlineResult {
    // Combined emphasis: ***text*** (bold + italic). Parse as nested wrappers so
    // serialization remains stable and matches v1 output.
    if (source.slice(start, start + 3) === "***") {
      const close = source.indexOf("***", start + 3);
      if (close !== -1 && close < end) {
        const children = context.parseInline(source, start + 3, close);
        return {
          inline: {
            type: "inline-wrapper",
            kind: BOLD_KIND,
            children: [
              {
                type: "inline-wrapper",
                kind: "italic",
                children,
              },
            ],
          },
          nextPos: close + 3,
        };
      }
    }

    if (source.slice(start, start + 2) !== "**") {
      return null;
    }

    let close = source.indexOf("**", start + 2);
    if (close === -1 || close >= end) {
      return null;
    }
    if (
      source.slice(close, close + 3) === "***" &&
      close + 1 < end &&
      countSingleAsterisks(source, start + 2, close) % 2 === 1
    ) {
      close += 1;
    }

    const children = context.parseInline(source, start + 2, close);
    return {
      inline: {
        type: "inline-wrapper",
        kind: BOLD_KIND,
        children,
      },
      nextPos: close + 2,
    };
  },
  serializeInline(inline, context): SerializeInlineResult | null {
    if (inline.type !== "inline-wrapper" || inline.kind !== BOLD_KIND) {
      return null;
    }

    const builder = new CursorSourceBuilder();
    builder.appendSourceOnly("**");
    for (const child of inline.children) {
      const serialized = context.serializeInline(child);
      builder.appendSerialized(serialized);
    }
    builder.appendSourceOnly("**");
    return builder.build();
  },
  normalizeInline(inline): Inline | null {
    if (inline.type !== "inline-wrapper" || inline.kind !== BOLD_KIND) {
      return inline;
    }

    if (inline.children.length === 0) {
      return null;
    }

    return inline;
  },
  renderInline(inline, context) {
    if (inline.type !== "inline-wrapper" || inline.kind !== BOLD_KIND) {
      return null;
    }

    const element = document.createElement("strong");
    for (const child of inline.children) {
      for (const node of context.renderInline(child)) {
        element.append(node);
      }
    }
    return element;
  },
};

function countSingleAsterisks(source: string, start: number, end: number) {
  let count = 0;
  for (let i = start; i < end; i += 1) {
    if (source[i] !== "*") {
      continue;
    }
    const prev = i > start ? source[i - 1] : "";
    const next = i + 1 < end ? source[i + 1] : "";
    if (prev === "*" || next === "*") {
      continue;
    }
    count += 1;
  }
  return count;
}
