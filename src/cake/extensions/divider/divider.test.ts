import { describe, expect, test } from "vitest";
import { createRuntimeForTests } from "../../core/runtime";
import { dividerExtension } from "./divider";

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
        end: 0,
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
        end: 0,
        affinity: "forward",
      });

      expect(html).toContain("<hr");
    });
  });

  describe("cursor mapping", () => {
    test("divider block-atom has no cursor positions", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("---");

      expect(state.map.cursorLength).toBe(0);
    });

    test("text then divider only exposes text and newline cursor positions", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("text\n---");

      expect(state.map.cursorLength).toBe(5);
    });

    test("divider then text only exposes newline and text cursor positions", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("---\ntext");

      expect(state.map.cursorLength).toBe(5);
    });

    test("text around divider has the expected total cursor positions", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("a\n---\nb");

      expect(state.map.cursorLength).toBe(4);
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
    test("typing a third dash autoformats a divider", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("--", { start: 2, end: 2 });

      const nextState = runtime.applyEdit({ type: "insert", text: "-" }, state);

      expect(nextState.source).toBe("---\n");
      expect(nextState.selection).toEqual({
        start: 1,
        end: 1,
        affinity: "forward",
      });
    });

    test("autoformat places the cursor on the next line", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("hello\n--", { start: 7, end: 7 });

      const nextState = runtime.applyEdit({ type: "insert", text: "-" }, state);

      expect(nextState.source).toBe("hello\n---");
      expect(nextState.selection).toEqual({
        start: 6,
        end: 6,
        affinity: "forward",
      });
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

    test("autoformat works in the middle of a document", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("hello\n--\nworld", {
        start: 7,
        end: 7,
      });

      const nextState = runtime.applyEdit({ type: "insert", text: "-" }, state);

      expect(nextState.source).toBe("hello\n---\nworld");
      expect(nextState.selection).toEqual({
        start: 6,
        end: 6,
        affinity: "forward",
      });
    });

    test("autoformat works in an otherwise empty document", () => {
      const runtime = createRuntimeForTests([dividerExtension]);
      const state = runtime.createState("--", { start: 2, end: 2 });

      const nextState = runtime.applyEdit({ type: "insert", text: "-" }, state);

      expect(nextState.source).toBe("---\n");
    });
  });

  describe("block-atom runtime behavior", () => {
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
        start: 1,
        end: 1,
        affinity: "forward",
      });
    });
  });
});
