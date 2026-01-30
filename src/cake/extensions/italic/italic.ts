import {
  type CakeExtension,
  type EditCommand,
  type ParseInlineResult,
  type SerializeInlineResult,
} from "../../core/runtime";
import type { Inline } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";

const ITALIC_KIND = "italic";

/** Semantic command to toggle italic formatting */
type ToggleItalicCommand = { type: "toggle-italic" };

export const italicExtension: CakeExtension = (host) => {
  const disposers: Array<() => void> = [];

  disposers.push(
    host.registerToggleInline({ kind: ITALIC_KIND, markers: ["*", "_"] }),
  );
  disposers.push(
    host.registerKeybindings([
      { key: "i", meta: true, command: { type: "toggle-italic" } },
      { key: "i", ctrl: true, command: { type: "toggle-italic" } },
    ]),
  );
  disposers.push(
    host.registerInlineWrapperAffinity([{ kind: ITALIC_KIND, inclusive: true }]),
  );
  disposers.push(
    host.registerOnEdit((command) => {
      // Handle semantic command by delegating to toggle-inline
      if (command.type === "toggle-italic") {
        return { type: "toggle-inline", marker: "*" } as EditCommand;
      }
      return null;
    }),
  );
  disposers.push(
    host.registerParseInline((source, start, end, context): ParseInlineResult => {
      const char = source[start];
      // Support both * and _ for italic (like v1)
      // Note: ** is handled by bold extension which should be registered first
      if (char !== "_" && char !== "*") {
        return null;
      }
      // Don't match ** (that's bold)
      if (char === "*" && source[start + 1] === "*") {
        return null;
      }
      // Avoid parsing a trailing "*hello*" when the opener is part of an
      // unbalanced bold delimiter run (e.g. "**hello*"). In those cases, Cake
      // should render the text literally rather than applying partial formatting.
      if (char === "*" && start > 0 && source[start - 1] === "*") {
        return null;
      }

      const close = source.indexOf(char, start + 1);
      if (close === -1 || close >= end) {
        return null;
      }
      // Don't match empty delimiters like ** that could be start of bold
      if (close === start + 1 && close + 1 < end) {
        return null;
      }

      const children = context.parseInline(source, start + 1, close);
      return {
        inline: {
          type: "inline-wrapper",
          kind: ITALIC_KIND,
          children,
        },
        nextPos: close + 1,
      };
    }),
  );
  disposers.push(
    host.registerSerializeInline((inline, context): SerializeInlineResult | null => {
      if (inline.type !== "inline-wrapper" || inline.kind !== ITALIC_KIND) {
        return null;
      }

      const builder = new CursorSourceBuilder();
      // Use asterisk for serialization to match v1 behavior
      // This prevents issues when typing **bold** where intermediate state
      // *world* would get serialized as _world_ causing marker conversion
      builder.appendSourceOnly("*");
      for (const child of inline.children) {
        const serialized = context.serializeInline(child);
        builder.appendSerialized(serialized);
      }
      builder.appendSourceOnly("*");
      return builder.build();
    }),
  );
  disposers.push(
    host.registerNormalizeInline((inline): Inline | null => {
      if (inline.type !== "inline-wrapper" || inline.kind !== ITALIC_KIND) {
        return inline;
      }

      if (inline.children.length === 0) {
        return null;
      }

      return inline;
    }),
  );
  disposers.push(
    host.registerInlineRenderer((inline, context) => {
      if (inline.type !== "inline-wrapper" || inline.kind !== ITALIC_KIND) {
        return null;
      }

      const element = document.createElement("em");
      for (const child of inline.children) {
        for (const node of context.renderInline(child)) {
          element.append(node);
        }
      }
      return element;
    }),
  );

  return () => disposers.splice(0).reverse().forEach((d) => d());
};
