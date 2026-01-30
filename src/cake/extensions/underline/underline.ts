import {
  type CakeExtension,
  type EditCommand,
  type ParseInlineResult,
  type SerializeInlineResult,
} from "../../core/runtime";
import type { Inline } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";

const UNDERLINE_KIND = "underline";

/** Semantic command to toggle underline formatting */
type ToggleUnderlineCommand = { type: "toggle-underline" };

export const underlineExtension: CakeExtension = (host) => {
  const disposers: Array<() => void> = [];

  disposers.push(
    host.registerToggleInline({
      kind: UNDERLINE_KIND,
      markers: [{ open: "<u>", close: "</u>" }],
    }),
  );
  disposers.push(
    host.registerKeybindings([
      {
        key: "u",
        meta: true,
        shift: false,
        command: { type: "toggle-underline" },
      },
      {
        key: "u",
        ctrl: true,
        shift: false,
        command: { type: "toggle-underline" },
      },
    ]),
  );
  disposers.push(
    host.registerInlineWrapperAffinity([{ kind: UNDERLINE_KIND, inclusive: true }]),
  );
  disposers.push(
    host.registerOnEdit((command) => {
      if (command.type === "toggle-underline") {
        return { type: "toggle-inline", marker: "<u>" } as EditCommand;
      }
      return null;
    }),
  );
  disposers.push(
    host.registerParseInline((source, start, end, context): ParseInlineResult => {
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
    }),
  );
  disposers.push(
    host.registerSerializeInline((inline, context): SerializeInlineResult | null => {
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
    }),
  );
  disposers.push(
    host.registerNormalizeInline((inline): Inline | null => {
      if (inline.type !== "inline-wrapper" || inline.kind !== UNDERLINE_KIND) {
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
    }),
  );

  return () => disposers.splice(0).reverse().forEach((d) => d());
};
