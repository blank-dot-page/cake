import { describe, test, expect } from "vitest";
import { createRuntimeForTests } from "../../core/runtime";
import { headingExtension } from "./heading";
import { boldExtension } from "../bold/bold";
import { italicExtension } from "../italic/italic";

describe("heading extension", () => {
  describe("parseBlock", () => {
    test("parses h1 heading", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const doc = runtime.parse("# Title");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "block-wrapper",
        kind: "heading",
        data: { level: 1 },
      });
    });

    test("parses h2 heading", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const doc = runtime.parse("## Subtitle");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "block-wrapper",
        kind: "heading",
        data: { level: 2 },
      });
    });

    test("parses h3 heading", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const doc = runtime.parse("### Section");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "block-wrapper",
        kind: "heading",
        data: { level: 3 },
      });
    });

    test("caps heading level at 3", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const doc = runtime.parse("#### Should be level 3");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("does not parse without space after hashes", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const doc = runtime.parse("#NoSpace");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("does not parse plain text", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const doc = runtime.parse("hello world");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("parses multiple headings", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const doc = runtime.parse("# First\n## Second\n### Third");
      expect(doc.blocks).toHaveLength(3);
      expect(doc.blocks[0]).toMatchObject({
        type: "block-wrapper",
        kind: "heading",
        data: { level: 1 },
      });
      expect(doc.blocks[1]).toMatchObject({
        type: "block-wrapper",
        kind: "heading",
        data: { level: 2 },
      });
      expect(doc.blocks[2]).toMatchObject({
        type: "block-wrapper",
        kind: "heading",
        data: { level: 3 },
      });
    });

    test("parses heading with bold content", () => {
      const runtime = createRuntimeForTests([headingExtension, boldExtension]);
      const doc = runtime.parse("# **Bold** Title");
      expect(doc.blocks).toHaveLength(1);
      const headingBlock = doc.blocks[0] as {
        type: string;
        kind: string;
        blocks: { content: unknown[] }[];
      };
      expect(headingBlock.type).toBe("block-wrapper");
      expect(headingBlock.kind).toBe("heading");
      const paragraph = headingBlock.blocks[0];
      expect(paragraph.content.length).toBeGreaterThan(0);
    });

    test("parses heading with italic content", () => {
      const runtime = createRuntimeForTests([
        headingExtension,
        italicExtension,
      ]);
      const doc = runtime.parse("# _Italic_ Title");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "block-wrapper",
        kind: "heading",
      });
    });
  });

  describe("serializeBlock", () => {
    test("serializes h1 heading", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const doc = runtime.parse("# Title");
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("# Title");
    });

    test("serializes h2 heading", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const doc = runtime.parse("## Subtitle");
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("## Subtitle");
    });

    test("serializes h3 heading", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const doc = runtime.parse("### Section");
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("### Section");
    });

    test("round-trips heading with inline content", () => {
      const runtime = createRuntimeForTests([headingExtension, boldExtension]);
      const source = "# **Bold** Title";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    test("round-trips multiple headings", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const source = "# First\n## Second\n### Third";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });

  describe("cursor mapping", () => {
    test("maps cursor correctly for heading", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const state = runtime.createState("# Title");
      expect(state.map.cursorLength).toBe(5);
    });

    test("maps cursor correctly for h2 heading", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const state = runtime.createState("## Subtitle");
      expect(state.map.cursorLength).toBe(8);
    });

    test("maps cursor correctly for h3 heading", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const state = runtime.createState("### Section");
      expect(state.map.cursorLength).toBe(7);
    });
  });

  describe("normalizeBlock", () => {
    test("normalizes headings produced by parsing", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const state = runtime.createState("# ");
      expect(state.doc.blocks[0]).toMatchObject({
        type: "block-wrapper",
        kind: "heading",
        blocks: [{ type: "paragraph" }],
      });
    });
  });

  describe("delete-backward (onEdit)", () => {
    test("converts heading to paragraph when backspacing at start of first line", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const state = runtime.createState("# Title", { start: 0, end: 0 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("Title");
      expect(nextState.selection).toEqual({
        start: 0,
        end: 0,
        affinity: "forward",
      });
    });

    test("converts h2 heading to paragraph when backspacing at start", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const state = runtime.createState("## Subtitle", { start: 0, end: 0 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("Subtitle");
      expect(nextState.selection).toEqual({
        start: 0,
        end: 0,
        affinity: "forward",
      });
    });

    test("converts h3 heading to paragraph when backspacing at start", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const state = runtime.createState("### Section", { start: 0, end: 0 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("Section");
      expect(nextState.selection).toEqual({
        start: 0,
        end: 0,
        affinity: "forward",
      });
    });

    test("does not convert heading when cursor is not at start", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const state = runtime.createState("# Title", { start: 2, end: 2 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      // Should perform normal delete (remove 'i' from Title)
      expect(nextState.source).toBe("# Ttle");
    });

    test("converts heading to paragraph on second line when backspacing at start", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      // For headings on any line, backspace at start should convert to paragraph
      // (removes the heading marker)
      const source = "First line\n# Heading";
      // Position 11 is after the newline, at the start of heading content
      const stateAtHeadingStart = runtime.createState(source, {
        start: 11,
        end: 11,
      });

      const nextState = runtime.applyEdit(
        { type: "delete-backward" },
        stateAtHeadingStart,
      );

      // Should convert heading to paragraph (remove # marker), not merge with previous line
      expect(nextState.source).toBe("First line\nHeading");
    });

    test("does not convert paragraph when backspacing at start", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const state = runtime.createState("Just text", { start: 0, end: 0 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      // Should not change anything (cursor at start of document)
      expect(nextState.source).toBe("Just text");
    });

    test("converts empty heading to empty paragraph", () => {
      const runtime = createRuntimeForTests([headingExtension]);
      const state = runtime.createState("# ", { start: 0, end: 0 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("");
    });
  });
});
