import { describe, expect, it } from "vitest";
import { createRuntimeForTests, type CakeExtension } from "./runtime";
import type { ParseInlineResult, SerializeInlineResult } from "./runtime";
import { CursorSourceBuilder } from "./mapping/cursor-source-map";

describe("runtime structural edits preserve inline-atoms", () => {
  const atomExtension: CakeExtension = (editor) => {
    editor.registerParseInline(
      (source, start): ParseInlineResult => {
        if (source.slice(start, start + 2) !== "@@") {
          return null;
        }
        return {
          inline: { type: "inline-atom", kind: "atom" },
          nextPos: start + 2,
        };
      },
    );
    editor.registerSerializeInline(
      (inline): SerializeInlineResult | null => {
        if (inline.type !== "inline-atom" || inline.kind !== "atom") {
          return null;
        }
        const builder = new CursorSourceBuilder();
        builder.appendCursorAtom("@@", 1);
        return builder.build();
      },
    );
  };

  it("keeps inline-atom when inserting text adjacent to it", () => {
    const runtime = createRuntimeForTests([atomExtension]);
    const base = runtime.createState("a@@b");

    // Cursor after the atom (a [@@] | b).
    const cursorAfterAtom = 2;
    const next = runtime.applyEdit(
      { type: "insert", text: "x" },
      { ...base, selection: { start: cursorAfterAtom, end: cursorAfterAtom } },
    );

    expect(next.source).toBe("a@@xb");
  });
});

