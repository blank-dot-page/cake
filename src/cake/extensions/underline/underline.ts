import {
  defineExtension,
  type EditCommand,
  type ParseInlineResult,
  type SerializeInlineResult,
} from "../../core/runtime";
import type { Inline } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";

const UNDERLINE_KIND = "underline";

/** Semantic command to toggle underline formatting */
type ToggleUnderlineCommand = { type: "toggle-underline" };

export const underlineExtension = defineExtension<ToggleUnderlineCommand>({
  name: "underline",
  toggleInline: { kind: UNDERLINE_KIND, markers: [{ open: "<u>", close: "</u>" }] },
  keybindings: [
    { key: "u", meta: true, shift: false, command: { type: "toggle-underline" } },
    { key: "u", ctrl: true, shift: false, command: { type: "toggle-underline" } },
  ],
  inlineWrapperAffinity: [{ kind: UNDERLINE_KIND, inclusive: true }],
  onEdit(command) {
    if (command.type === "toggle-underline") {
      return { type: "toggle-inline", marker: "<u>" } as EditCommand;
    }
    return null;
  },
  parseInline(source, start, end, context): ParseInlineResult {
    if (source.slice(start, start + 3) !== "<u>") {
      return null;
    }

    const close = source.indexOf("</u>", start + 3);
    if (close === -1 || close >= end) {
      return null;
    }

    const children = context.parseInline(source, start + 3, close);
    return {
      inline: {
        type: "inline-wrapper",
        kind: UNDERLINE_KIND,
        children,
      },
      nextPos: close + 4,
    };
  },
  serializeInline(inline, context): SerializeInlineResult | null {
    if (inline.type !== "inline-wrapper" || inline.kind !== UNDERLINE_KIND) {
      return null;
    }

    const builder = new CursorSourceBuilder();
    builder.appendSourceOnly("<u>");
    for (const child of inline.children) {
      const serialized = context.serializeInline(child);
      builder.appendSerialized(serialized);
    }
    builder.appendSourceOnly("</u>");
    return builder.build();
  },
  normalizeInline(inline): Inline | null {
    if (inline.type !== "inline-wrapper" || inline.kind !== UNDERLINE_KIND) {
      return inline;
    }

    if (inline.children.length === 0) {
      return null;
    }

    return inline;
  },
  renderInline(inline, context) {
    if (inline.type !== "inline-wrapper" || inline.kind !== UNDERLINE_KIND) {
      return null;
    }

    const element = document.createElement("u");
    element.className = "cake-underline";
    for (const child of inline.children) {
      for (const node of context.renderInline(child)) {
        element.append(node);
      }
    }
    return element;
  },
});
