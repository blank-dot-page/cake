import { describe, expect, test } from "vitest";
import { createRuntimeForTests } from "../../core/runtime";
import { dividerExtension } from "./divider";

function sourceOffsetForSelectionStart(state: {
  selection: { start: number; affinity?: "backward" | "forward" };
  map: {
    cursorToSource(
      cursorOffset: number,
      affinity: "backward" | "forward",
    ): number;
  };
}): number {
  return state.map.cursorToSource(
    state.selection.start,
    state.selection.affinity ?? "forward",
  );
}

describe("divider extension", () => {
  describe("parseBlock", () => {
    test("parses three dashes as a divider", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const doc = runtime.parse("---");

      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "block-atom",
        kind: "divider",
      });
    });

    test("parses four dashes as a divider", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const doc = runtime.parse("----");

      expect(doc.blocks[0]).toMatchObject({
        type: "block-atom",
        kind: "divider",
      });
    });

    test("parses five dashes as a divider", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const doc = runtime.parse("-----");

      expect(doc.blocks[0]).toMatchObject({
        type: "block-atom",
        kind: "divider",
      });
    });

    test("does not parse two dashes as a divider", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const doc = runtime.parse("--");

      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("does not parse one dash as a divider", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const doc = runtime.parse("-");

      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("does not parse plain text as a divider", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const doc = runtime.parse("text");

      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("does not parse mixed content on the same line", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const doc = runtime.parse("text ---");

      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("parses divider with surrounding spaces", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const doc = runtime.parse("  ---  ");

      expect(doc.blocks[0]).toMatchObject({
        type: "block-atom",
        kind: "divider",
      });
    });

    test("parses dividers between paragraphs", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const doc = runtime.parse("hello\n---\nworld");

      expect(doc.blocks).toHaveLength(3);
      expect(doc.blocks[0]).toMatchObject({ type: "paragraph" });
      expect(doc.blocks[1]).toMatchObject({
        type: "block-atom",
        kind: "divider",
      });
      expect(doc.blocks[2]).toMatchObject({ type: "paragraph" });
    });

    test("parses consecutive dividers", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const doc = runtime.parse("---\n---");

      expect(doc.blocks).toHaveLength(2);
      expect(doc.blocks[0]).toMatchObject({
        type: "block-atom",
        kind: "divider",
      });
      expect(doc.blocks[1]).toMatchObject({
        type: "block-atom",
        kind: "divider",
      });
    });
  });

  describe("serializeBlock", () => {
    test("round-trips a divider", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const doc = runtime.parse("---");
      const serialized = runtime.serialize(doc);

      expect(serialized.source).toBe("---");
    });

    test("round-trips a divider between paragraphs", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const source = "hello\n---\nworld";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);

      expect(serialized.source).toBe(source);
    });

    test("round-trips consecutive dividers", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const source = "---\n---";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);

      expect(serialized.source).toBe(source);
    });
  });

  describe("selection serialization", () => {
    test("serializes a selected divider line to markdown", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("text\n---\nmore");

      const serialized = runtime.serializeSelection(state, {
        start: 5,
        end: 6,
        affinity: "forward",
      });

      expect(serialized).toBe("---");
    });

    test("serializes mixed content with a divider to markdown", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("text\n---\nmore");

      const serialized = runtime.serializeSelection(state, {
        start: 0,
        end: 100,
        affinity: "forward",
      });

      expect(serialized).toBe("text\n---\nmore");
    });

    test("serializes a standalone divider selection to markdown", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("---");

      const serialized = runtime.serializeSelection(state, {
        start: 0,
        end: 1,
        affinity: "forward",
      });

      expect(serialized).toBe("---");
    });

    test("serializes a selected divider line to html", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("text\n---\nmore");

      const html = runtime.serializeSelectionToHtml(state, {
        start: 5,
        end: 6,
        affinity: "forward",
      });

      expect(html).toContain("<hr");
    });

    test("serializes mixed content with a divider to html", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("text\n---\nmore");

      const html = runtime.serializeSelectionToHtml(state, {
        start: 0,
        end: 100,
        affinity: "forward",
      });

      expect(html).toContain("<hr");
    });

    test("serializes a standalone divider selection to html", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("---");

      const html = runtime.serializeSelectionToHtml(state, {
        start: 0,
        end: 1,
        affinity: "forward",
      });

      expect(html).toContain("<hr");
    });
  });

  describe("cursor mapping", () => {
    test("divider block-atom occupies one cursor position", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("---");

      expect(state.map.cursorLength).toBe(1);
    });

    test("text then divider exposes the text, divider, and newline cursor positions", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("text\n---");

      expect(state.map.cursorLength).toBe(6);
    });

    test("divider then text exposes the divider, newline, and text cursor positions", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("---\ntext");

      expect(state.map.cursorLength).toBe(6);
    });

    test("text around divider has the expected total cursor positions", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("a\n---\nb");

      expect(state.map.cursorLength).toBe(5);
    });
  });

  describe("normalizeBlock", () => {
    test("normalizes dividers produced by parsing", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("---");

      expect(state.doc.blocks[0]).toMatchObject({
        type: "block-atom",
        kind: "divider",
      });
    });
  });

  describe("onEdit", () => {
    function applyDividerShortcut(source: string, sourceOffset: number) {
      const runtime = createRuntimeForTests([dividerExtension]);
      const initialCursor = runtime
        .createState(source)
        .map.sourceToCursor(sourceOffset, "forward");
      const state = runtime.createState(source, {
        start: initialCursor.cursorOffset,
        end: initialCursor.cursorOffset,
        affinity: initialCursor.affinity,
      });

      const nextState = runtime.applyEdit({ type: "insert", text: "-" }, state);

      return { runtime, nextState };
    }

    test("typing a third dash autoformats a divider", () => {
      const { nextState } = applyDividerShortcut("--", 2);

      expect(nextState.source).toBe("---\n");
      expect(nextState.selection).toEqual({
        start: 2,
        end: 2,
        affinity: "forward",
      });
    });

    test("typing the third dash in an empty document creates a trailing line and places the caret there", () => {
      const { runtime, nextState } = applyDividerShortcut("--", 2);

      expect(nextState.source).toBe("---\n");
      const followingLineStart = "---\n".length;
      const expectedCaret = nextState.map.sourceToCursor(
        followingLineStart,
        "forward",
      );
      expect(nextState.selection).toEqual({
        start: expectedCaret.cursorOffset,
        end: expectedCaret.cursorOffset,
        affinity: expectedCaret.affinity,
      });

      const afterTyping = runtime.applyEdit(
        { type: "insert", text: "more" },
        nextState,
      );
      expect(afterTyping.source).toBe("---\nmore");
    });

    test("typing multiple characters after divider autoformat preserves their order", () => {
      const { runtime, nextState } = applyDividerShortcut("--", 2);

      let state = nextState;
      for (const char of "hello") {
        state = runtime.applyEdit({ type: "insert", text: char }, state);
      }

      expect(state.source).toBe("---\nhello");
    });

    test("typing a second dash does not autoformat", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("-", { start: 1, end: 1 });

      const nextState = runtime.applyEdit({ type: "insert", text: "-" }, state);

      expect(nextState.source).toBe("--");
    });

    test("typing after non-leading characters does not autoformat", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("a--", { start: 3, end: 3 });

      const nextState = runtime.applyEdit({ type: "insert", text: "-" }, state);

      expect(nextState.source).toBe("a---");
    });

    test("typing the third dash in the middle of a document moves the caret to the existing next line", () => {
      const { runtime, nextState } = applyDividerShortcut("hello\n--\nworld", 8);

      expect(nextState.source).toBe("hello\n---\nworld");
      const followingLineStart = "hello\n---\n".length;
      const expectedCaret = nextState.map.sourceToCursor(
        followingLineStart,
        "forward",
      );
      expect(nextState.selection).toEqual({
        start: expectedCaret.cursorOffset,
        end: expectedCaret.cursorOffset,
        affinity: expectedCaret.affinity,
      });

      const afterTyping = runtime.applyEdit(
        { type: "insert", text: "next " },
        nextState,
      );
      expect(afterTyping.source).toBe("hello\n---\nnext world");
    });

    test("typing the third dash at the end of a document creates a new trailing line and places the caret there", () => {
      const { runtime, nextState } = applyDividerShortcut("hello\n--", 8);

      expect(nextState.source).toBe("hello\n---\n");
      const followingLineStart = "hello\n---\n".length;
      const expectedCaret = nextState.map.sourceToCursor(
        followingLineStart,
        "forward",
      );
      expect(nextState.selection).toEqual({
        start: expectedCaret.cursorOffset,
        end: expectedCaret.cursorOffset,
        affinity: expectedCaret.affinity,
      });

      const afterTyping = runtime.applyEdit(
        { type: "insert", text: "tail" },
        nextState,
      );
      expect(afterTyping.source).toBe("hello\n---\ntail");
    });

    test("typing text, pressing enter, and completing a divider creates a paragraph, divider, and trailing paragraph", () => {
      const { nextState } = applyDividerShortcut("hello world\n--", 14);

      expect(nextState.source).toBe("hello world\n---\n");
      expect(nextState.doc.blocks).toHaveLength(3);
      expect(nextState.doc.blocks[0]).toMatchObject({
        type: "paragraph",
        content: [{ type: "text", text: "hello world" }],
      });
      expect(nextState.doc.blocks[1]).toMatchObject({
        type: "block-atom",
        kind: "divider",
      });
      expect(nextState.doc.blocks[2]).toMatchObject({
        type: "paragraph",
        content: [],
      });
      expect(sourceOffsetForSelectionStart(nextState)).toBe(
        nextState.source.length,
      );
    });
  });

  describe("block-atom runtime behavior", () => {
    test("delete-forward at the end of text above a divider deletes the divider", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("hello\n---\nworld", {
        start: 5,
        end: 5,
      });

      const nextState = runtime.applyEdit({ type: "delete-forward" }, state);

      expect(nextState.source).toBe("hello\nworld");
      expect(nextState.doc.blocks).toHaveLength(2);
      expect(nextState.doc.blocks[0]).toMatchObject({
        type: "paragraph",
        content: [{ type: "text", text: "hello" }],
      });
      expect(nextState.doc.blocks[1]).toMatchObject({
        type: "paragraph",
        content: [{ type: "text", text: "world" }],
      });
      expect(sourceOffsetForSelectionStart(nextState)).toBe(5);
    });

    test("delete-forward on a divider deletes it", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("---\ntext", {
        start: 0,
        end: 0,
      });

      const nextState = runtime.applyEdit({ type: "delete-forward" }, state);

      expect(nextState.source).toBe("text");
      expect(nextState.selection).toEqual({
        start: 0,
        end: 0,
        affinity: "forward",
      });
    });

    test("backspace at the start of text after a divider merges the text into a paragraph", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("alpha\n---\nomega", {
        start: 8,
        end: 8,
      });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("alpha\n---omega");
      expect(nextState.doc.blocks).toHaveLength(2);
      expect(nextState.doc.blocks[0]).toMatchObject({
        type: "paragraph",
        content: [{ type: "text", text: "alpha" }],
      });
      expect(nextState.doc.blocks[1]).toMatchObject({
        type: "paragraph",
        content: [{ type: "text", text: "---omega" }],
      });
      expect(sourceOffsetForSelectionStart(nextState)).toBe("alpha\n---".length);
    });

    test("backspace on the empty paragraph after a divider moves the caret before the divider", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const caret = runtime.createState("hello\n---\n").map.sourceToCursor(
        "hello\n---\n".length,
        "forward",
      );
      const state = runtime.createState("hello\n---\n", {
        start: caret.cursorOffset,
        end: caret.cursorOffset,
        affinity: caret.affinity,
      });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("hello\n---");
      expect(sourceOffsetForSelectionStart(nextState)).toBe("hello".length);
    });

    test("backspace on the empty paragraph after a leading divider deletes the divider", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const caret = runtime.createState("---\n").map.sourceToCursor(
        "---\n".length,
        "forward",
      );
      const state = runtime.createState("---\n", {
        start: caret.cursorOffset,
        end: caret.cursorOffset,
        affinity: caret.affinity,
      });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("");
      expect(nextState.selection).toEqual({
        start: 0,
        end: 0,
        affinity: "forward",
      });
    });

    test("backspace on a divider deletes it", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("---\ntext", {
        start: 1,
        end: 1,
      });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("text");
      expect(nextState.selection).toEqual({
        start: 0,
        end: 0,
        affinity: "forward",
      });
    });

    test("enter on a divider inserts a paragraph after it", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("---", {
        start: 0,
        end: 0,
      });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("---\n");
      expect(nextState.selection).toEqual({
        start: 2,
        end: 2,
        affinity: "forward",
      });
    });

    test("enter on a selected trailing divider keeps the divider and inserts a paragraph after it", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("text\n---", {
        start: 5,
        end: 6,
        affinity: "forward",
      });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("text\n---\n");
      expect(nextState.selection).toEqual({
        start: nextState.selection.start,
        end: nextState.selection.start,
        affinity: "forward",
      });
      expect(sourceOffsetForSelectionStart(nextState)).toBe("text\n---\n".length);
    });

    test("enter on a selected leading divider keeps the divider and inserts a paragraph after it", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("---", {
        start: 0,
        end: 1,
        affinity: "forward",
      });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("---\n");
      expect(nextState.selection).toEqual({
        start: nextState.selection.start,
        end: nextState.selection.start,
        affinity: "forward",
      });
      expect(sourceOffsetForSelectionStart(nextState)).toBe("---\n".length);
    });

    test("enter on a selected middle divider keeps the divider and inserts a paragraph after it", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("above\n---\nbelow", {
        start: 6,
        end: 8,
        affinity: "forward",
      });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("above\n---\n\nbelow");
      expect(nextState.selection).toEqual({
        start: nextState.selection.start,
        end: nextState.selection.start,
        affinity: "forward",
      });
      expect(sourceOffsetForSelectionStart(nextState)).toBe("above\n---\n".length);
    });
  });
});
