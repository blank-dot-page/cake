import {
  type CakeExtension,
  type EditCommand,
  type ParseInlineResult,
  type SerializeInlineResult,
} from "../../core/runtime";
import type { Inline } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";

const STRIKE_KIND = "strikethrough";

/** Semantic command to toggle strikethrough formatting */
type ToggleStrikethroughCommand = { type: "toggle-strikethrough" };

export const strikethroughExtension: CakeExtension = (host) => {
  const disposers: Array<() => void> = [];

  disposers.push(
    host.registerToggleInline({ kind: STRIKE_KIND, markers: ["~~"] }),
  );
  disposers.push(
    host.registerKeybindings([
      {
        key: "x",
        meta: true,
        shift: true,
        command: { type: "toggle-strikethrough" },
      },
      {
        key: "x",
        ctrl: true,
        shift: true,
        command: { type: "toggle-strikethrough" },
      },
    ]),
  );
  disposers.push(
    host.registerInlineWrapperAffinity([
      { kind: STRIKE_KIND, inclusive: true },
    ]),
  );
  disposers.push(
    host.registerOnEdit((command) => {
      // Handle semantic command by delegating to toggle-inline
      if (command.type === "toggle-strikethrough") {
        return { type: "toggle-inline", marker: "~~" } as EditCommand;
      }
      return null;
    }),
  );
  disposers.push(
    host.registerParseInline(
      (source, start, end, context): ParseInlineResult => {
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
    ),
  );
  disposers.push(
    host.registerSerializeInline(
      (inline, context): SerializeInlineResult | null => {
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
    ),
  );
  disposers.push(
    host.registerNormalizeInline((inline): Inline | null => {
      if (inline.type !== "inline-wrapper" || inline.kind !== STRIKE_KIND) {
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
    }),
  );

  return () =>
    disposers
      .splice(0)
      .reverse()
      .forEach((d) => d());
};
