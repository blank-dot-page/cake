import { describe, test, expect } from "vitest";
import {
  parseListRange,
  serializeListRange,
  insertItemAfter,
  removeItem,
  convertToPlainText,
  indentItem,
  outdentItem,
  mergeItems,
  updateItemContent,
} from "./list-ast";

describe("list AST", () => {
  describe("parseListRange and serializeListRange", () => {
    test("parses bullet list", () => {
      const source = "- one\n- two\n- three";
      const range = parseListRange(source, 0, source.length);

      expect(range.lines).toHaveLength(3);
      expect(range.lines[0]).toEqual({
        type: "list-item",
        item: { indent: 0, markerType: "bullet", content: "one" },
      });
    });

    test("parses numbered list", () => {
      const source = "1. one\n2. two\n3. three";
      const range = parseListRange(source, 0, source.length);

      expect(range.lines).toHaveLength(3);
      expect(range.lines[0]).toEqual({
        type: "list-item",
        item: { indent: 0, markerType: "numbered", content: "one" },
      });
    });

    test("parses nested list", () => {
      const source = "1. one\n  1. nested\n2. two";
      const range = parseListRange(source, 0, source.length);

      expect(range.lines[1]).toEqual({
        type: "list-item",
        item: { indent: 1, markerType: "numbered", content: "nested" },
      });
    });

    test("serializes bullet list", () => {
      const source = "- one\n- two\n- three";
      const range = parseListRange(source, 0, source.length);
      expect(serializeListRange(range)).toBe("- one\n- two\n- three");
    });

    test("serializes numbered list with correct numbers", () => {
      const source = "1. one\n5. two\n99. three";
      const range = parseListRange(source, 0, source.length);
      // Numbers are normalized to sequential
      expect(serializeListRange(range)).toBe("1. one\n2. two\n3. three");
    });

    test("serializes nested numbered list with correct numbers", () => {
      const source = "1. one\n  1. nested a\n  2. nested b\n2. two";
      const range = parseListRange(source, 0, source.length);
      expect(serializeListRange(range)).toBe(
        "1. one\n  1. nested a\n  2. nested b\n2. two",
      );
    });
  });

  describe("insertItemAfter", () => {
    test("inserts item after specified index", () => {
      const source = "1. one\n2. two";
      const range = parseListRange(source, 0, source.length);
      const result = insertItemAfter(range, 0, {
        indent: 0,
        markerType: "numbered",
        content: "inserted",
      });
      expect(serializeListRange(result)).toBe("1. one\n2. inserted\n3. two");
    });
  });

  describe("removeItem", () => {
    test("removes item and renumbers", () => {
      const source = "1. one\n2. two\n3. three";
      const range = parseListRange(source, 0, source.length);
      const result = removeItem(range, 1);
      expect(serializeListRange(result)).toBe("1. one\n2. three");
    });
  });

  describe("convertToPlainText", () => {
    test("converts list item to plain text", () => {
      const source = "1. one\n2. two\n3. three";
      const range = parseListRange(source, 0, source.length);
      const result = convertToPlainText(range, 1);
      expect(serializeListRange(result)).toBe("1. one\ntwo\n2. three");
    });
  });

  describe("indentItem", () => {
    test("indents item and renumbers both levels", () => {
      const source = "1. one\n2. two\n3. three";
      const range = parseListRange(source, 0, source.length);
      const result = indentItem(range, 1);
      expect(serializeListRange(result)).toBe("1. one\n  1. two\n2. three");
    });
  });

  describe("outdentItem", () => {
    test("outdents nested item", () => {
      const source = "1. one\n  1. nested\n2. two";
      const range = parseListRange(source, 0, source.length);
      const result = outdentItem(range, 1);
      expect(serializeListRange(result)).toBe("1. one\n2. nested\n3. two");
    });

    test("outdent top-level item converts to plain text", () => {
      const source = "1. one\n2. two\n3. three";
      const range = parseListRange(source, 0, source.length);
      const result = outdentItem(range, 1);
      expect(serializeListRange(result)).toBe("1. one\ntwo\n2. three");
    });
  });

  describe("mergeItems", () => {
    test("merges two items", () => {
      const source = "1. hello\n2. world";
      const range = parseListRange(source, 0, source.length);
      const result = mergeItems(range, 0, 1);
      expect(serializeListRange(result)).toBe("1. hello world");
    });
  });

  describe("updateItemContent", () => {
    test("updates content", () => {
      const source = "1. old\n2. two";
      const range = parseListRange(source, 0, source.length);
      const result = updateItemContent(range, 0, "new");
      expect(serializeListRange(result)).toBe("1. new\n2. two");
    });
  });

  describe("complex scenarios", () => {
    test("indent then outdent returns to original", () => {
      const source = "1. one\n2. two\n3. three";
      const range = parseListRange(source, 0, source.length);
      const indented = indentItem(range, 1);
      const result = outdentItem(indented, 1);
      expect(serializeListRange(result)).toBe("1. one\n2. two\n3. three");
    });

    test("multiple operations compose correctly", () => {
      const source = "1. a\n2. b\n3. c";
      let range = parseListRange(source, 0, source.length);

      // Indent b
      range = indentItem(range, 1);
      expect(serializeListRange(range)).toBe("1. a\n  1. b\n2. c");

      // Insert d after c
      range = insertItemAfter(range, 2, {
        indent: 0,
        markerType: "numbered",
        content: "d",
      });
      expect(serializeListRange(range)).toBe("1. a\n  1. b\n2. c\n3. d");

      // Remove a - b stays indented (now orphaned)
      range = removeItem(range, 0);
      expect(serializeListRange(range)).toBe("  1. b\n1. c\n2. d");

      // Outdent b to fix the orphan
      range = outdentItem(range, 0);
      expect(serializeListRange(range)).toBe("1. b\n2. c\n3. d");
    });
  });
});
