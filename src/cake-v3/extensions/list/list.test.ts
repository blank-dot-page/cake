import { describe, test, expect } from "vitest";
import { createRuntimeV3 } from "../../core/runtime";
import { listExtension } from "./list";
import { boldExtension } from "../bold/bold";

describe("list extension", () => {
  describe("cursor mapping debug", () => {
    test("cursor position 7 maps to source position 7 for '- hello'", () => {
      const runtime = createRuntimeV3([listExtension]);
      const state = runtime.createState("- hello");

      // Log the mapping for debugging
      console.log("Source:", JSON.stringify(state.source));
      console.log("");

      console.log("Cursor -> Source:");
      for (let cursor = 0; cursor <= 7; cursor++) {
        const source = state.map.cursorToSource(cursor, "forward");
        console.log(`  cursor ${cursor} -> source ${source}`);
      }
      console.log("");

      console.log("Source -> Cursor:");
      for (let src = 0; src <= 7; src++) {
        const result = state.map.sourceToCursor(src, "forward");
        console.log(`  source ${src} -> cursor ${result.cursorOffset}`);
      }

      // The critical assertion: cursor 7 should map to source 7
      expect(state.map.cursorToSource(7, "forward")).toBe(7);
    });
  });

  describe("parseBlock", () => {
    // Lists are now just paragraphs - the extension only adds styling and edit behavior
    test("parses unordered list as paragraph", () => {
      const runtime = createRuntimeV3([listExtension]);
      const doc = runtime.parse("- item");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("parses unordered list with asterisk as paragraph", () => {
      const runtime = createRuntimeV3([listExtension]);
      const doc = runtime.parse("* item");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("parses unordered list with plus as paragraph", () => {
      const runtime = createRuntimeV3([listExtension]);
      const doc = runtime.parse("+ item");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("parses ordered list as paragraph", () => {
      const runtime = createRuntimeV3([listExtension]);
      const doc = runtime.parse("1. first");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("parses ordered list with larger number as paragraph", () => {
      const runtime = createRuntimeV3([listExtension]);
      const doc = runtime.parse("10. tenth");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("parses indented list as paragraph", () => {
      const runtime = createRuntimeV3([listExtension]);
      const doc = runtime.parse("  - indented");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("does not parse without space after marker", () => {
      const runtime = createRuntimeV3([listExtension]);
      const doc = runtime.parse("-item");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("does not parse plain text", () => {
      const runtime = createRuntimeV3([listExtension]);
      const doc = runtime.parse("hello world");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("parses multiple list items as paragraphs", () => {
      const runtime = createRuntimeV3([listExtension]);
      const doc = runtime.parse("- first\n- second\n- third");
      expect(doc.blocks).toHaveLength(3);
      doc.blocks.forEach((block) => {
        expect(block.type).toBe("paragraph");
      });
    });

    test("parses list with bold content as paragraph", () => {
      const runtime = createRuntimeV3([listExtension, boldExtension]);
      const doc = runtime.parse("- **bold** item");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0].type).toBe("paragraph");
    });
  });

  describe("serializeBlock", () => {
    test("serializes unordered list", () => {
      const runtime = createRuntimeV3([listExtension]);
      const doc = runtime.parse("- item");
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("- item");
    });

    test("serializes ordered list", () => {
      const runtime = createRuntimeV3([listExtension]);
      const doc = runtime.parse("1. first");
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("1. first");
    });

    test("serializes indented list", () => {
      const runtime = createRuntimeV3([listExtension]);
      const doc = runtime.parse("  - indented");
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("  - indented");
    });

    test("round-trips list", () => {
      const runtime = createRuntimeV3([listExtension, boldExtension]);
      const source = "- **bold** item";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    test("round-trips multiple list items", () => {
      const runtime = createRuntimeV3([listExtension]);
      const source = "- first\n- second\n- third";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });

  describe("cursor mapping", () => {
    // List prefixes should be in cursor model (navigable/selectable)
    test("includes list prefix in cursor length for bullet list", () => {
      const runtime = createRuntimeV3([listExtension]);
      const state = runtime.createState("- item");
      // "- item" = 6 characters, all navigable
      expect(state.map.cursorLength).toBe(6);
    });

    test("includes list prefix in cursor length for indented list", () => {
      const runtime = createRuntimeV3([listExtension]);
      const state = runtime.createState("  - item");
      // "  - item" = 8 characters, all navigable
      expect(state.map.cursorLength).toBe(8);
    });

    test("includes list prefix in cursor length for ordered list", () => {
      const runtime = createRuntimeV3([listExtension]);
      const state = runtime.createState("1. item");
      // "1. item" = 7 characters, all navigable
      expect(state.map.cursorLength).toBe(7);
    });

    test("includes list prefix in cursor length for multi-digit ordered list", () => {
      const runtime = createRuntimeV3([listExtension]);
      const state = runtime.createState("10. item");
      // "10. item" = 8 characters, all navigable
      expect(state.map.cursorLength).toBe(8);
    });
  });

  describe("insert-line-break (onEdit)", () => {
    test("continues list prefix on line break", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "- item" with cursor at end (position 6)
      const state = runtime.createState("- item", { start: 6, end: 6 });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("- item\n- ");
    });

    test("continues numbered list prefix on line break", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "1. item" with cursor at end (position 7)
      const state = runtime.createState("1. item", { start: 7, end: 7 });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("1. item\n2. ");
    });

    test("exits a list when inserting a line break on an empty item", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "- " with cursor at end (position 2)
      const state = runtime.createState("- ", { start: 2, end: 2 });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("");
    });

    test("restarts numbered lists after exiting on an empty item", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "1. one\n2. \n3. three" with cursor at end of empty item (position 10)
      const source = "1. one\n2. \n3. three";
      const state = runtime.createState(source, { start: 10, end: 10 });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("1. one\n\n1. three");
    });

    test("splits numbered list items and renumbers following items", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "1. one\n2. two\n3. three" with cursor at end of first item content
      const source = "1. one\n2. two\n3. three";
      // Position 6 is at end of "1. one"
      const state = runtime.createState(source, { start: 6, end: 6 });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("1. one\n2. \n3. two\n4. three");
    });

    test("inserts a blank line before list items when breaking at line start", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "Intro\n- item" with cursor at start of list item (position 6)
      const source = "Intro\n- item";
      const state = runtime.createState(source, { start: 6, end: 6 });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("Intro\n\n- item");
    });

    test("inserts line break after deleting selection", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "- one two" with selection from position 2 to 6 (selecting "one ")
      const state = runtime.createState("- one two", { start: 2, end: 6 });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("- \n- two");
    });

    test("does not handle line break for plain text (falls through)", () => {
      const runtime = createRuntimeV3([listExtension]);
      const state = runtime.createState("Hello", { start: 5, end: 5 });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      // List extension returns null for non-list lines, runtime handles it
      expect(nextState.source).toBe("Hello\n");
    });
  });

  describe("delete-backward (onEdit)", () => {
    test("removes list prefix when backspacing at content start", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "- item" with cursor at position 2 (after "- ")
      const state = runtime.createState("- item", { start: 2, end: 2 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("item");
      expect(nextState.selection.start).toBe(0);
    });

    test("removes numbered list prefix when backspacing at content start", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "1. item" with cursor at position 3 (after "1. ")
      const state = runtime.createState("1. item", { start: 3, end: 3 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("item");
      expect(nextState.selection.start).toBe(0);
    });

    test("removes indented list prefix when backspacing at content start", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "  - item" with cursor at position 4 (after "  - ")
      const state = runtime.createState("  - item", { start: 4, end: 4 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("item");
      expect(nextState.selection.start).toBe(0);
    });

    test("joins numbered list items on backspace at line start", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "1. one\n2. two\n3. three" with cursor at start of second item (position 7)
      const source = "1. one\n2. two\n3. three";
      const state = runtime.createState(source, { start: 7, end: 7 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("1. one two\n2. three");
    });

    test("renumbers numbered lists when merging across a blank line", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "1. one\n\n1. two\n2. three" with cursor at start of blank line (position 8)
      const source = "1. one\n\n1. two\n2. three";
      const state = runtime.createState(source, { start: 8, end: 8 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("1. one\n2. two\n3. three");
    });

    test("performs normal backspace when cursor is in middle of content", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "- item" with cursor at position 4 (after "- it")
      const state = runtime.createState("- item", { start: 4, end: 4 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("- iem");
    });

    test("performs normal backspace when cursor is in list prefix", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "- item" with cursor at position 1 (after "-")
      const state = runtime.createState("- item", { start: 1, end: 1 });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      // Should delete the "-", leaving " item" which is now plain text
      expect(nextState.source).toBe(" item");
    });
  });

  describe("delete-forward (onEdit)", () => {
    test("renumbers numbered lists when deleting a blank line forward", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "1. one\n\n1. two\n2. three" with cursor at end of first item (position 6)
      const source = "1. one\n\n1. two\n2. three";
      const state = runtime.createState(source, { start: 6, end: 6 });

      const nextState = runtime.applyEdit({ type: "delete-forward" }, state);

      expect(nextState.source).toBe("1. one\n2. two\n3. three");
    });
  });

  describe("indent/outdent (onEdit)", () => {
    test("indents list item", () => {
      const runtime = createRuntimeV3([listExtension]);
      const state = runtime.createState("- item", { start: 2, end: 2 });

      const nextState = runtime.applyEdit({ type: "indent" }, state);

      expect(nextState.source).toBe("  - item");
    });

    test("outdents indented list item", () => {
      const runtime = createRuntimeV3([listExtension]);
      const state = runtime.createState("  - item", { start: 4, end: 4 });

      const nextState = runtime.applyEdit({ type: "outdent" }, state);

      expect(nextState.source).toBe("- item");
    });

    test("indents and outdents list items across a selection", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "- one\n- two" with selection across both lines
      const source = "- one\n- two";
      const state = runtime.createState(source, { start: 0, end: 11 });

      const indented = runtime.applyEdit({ type: "indent" }, state);
      expect(indented.source).toBe("  - one\n  - two");

      const outdented = runtime.applyEdit({ type: "outdent" }, indented);
      expect(outdented.source).toBe("- one\n- two");
    });

    test("renumbers numbered lists when indenting list items", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "1. A\n2. B\n3. C" with cursor on second item
      const source = "1. A\n2. B\n3. C";
      // Position is in the middle of "2. B"
      const state = runtime.createState(source, { start: 8, end: 8 });

      const nextState = runtime.applyEdit({ type: "indent" }, state);

      expect(nextState.source).toBe("1. A\n  1. B\n2. C");
    });

    test("renumbers numbered lists when outdenting list items", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "1. A\n  1. X\n  2. Y\n2. B" with cursor on second nested item
      const source = "1. A\n  1. X\n  2. Y\n2. B";
      // Position is in "  2. Y"
      const state = runtime.createState(source, { start: 17, end: 17 });

      const nextState = runtime.applyEdit({ type: "outdent" }, state);

      expect(nextState.source).toBe("1. A\n  1. X\n2. Y\n3. B");
    });

    test("does not handle indent for non-list lines (falls through)", () => {
      const runtime = createRuntimeV3([listExtension]);
      // Plain text - list extension returns null, runtime does nothing
      const state = runtime.createState("hello world", { start: 5, end: 5 });

      const nextState = runtime.applyEdit({ type: "indent" }, state);

      // Runtime does not handle indent by default, source unchanged
      expect(nextState.source).toBe("hello world");
    });
  });

  describe("toggle-bullet-list (onEdit)", () => {
    test("toggles a paragraph to a bullet list", () => {
      const runtime = createRuntimeV3([listExtension]);
      const state = runtime.createState("Hello world", { start: 0, end: 0 });

      const nextState = runtime.applyEdit(
        { type: "toggle-bullet-list" },
        state,
      );

      expect(nextState.source).toBe("- Hello world");
    });

    test("toggles bullet list OFF when toggling on existing bullet", () => {
      const runtime = createRuntimeV3([listExtension]);
      const state = runtime.createState("- Hello world", { start: 0, end: 13 });

      const nextState = runtime.applyEdit(
        { type: "toggle-bullet-list" },
        state,
      );

      expect(nextState.source).toBe("Hello world");
    });

    test("toggles bullet list across multiple lines", () => {
      const runtime = createRuntimeV3([listExtension]);
      const source = "Line one\nLine two";
      const state = runtime.createState(source, { start: 0, end: 17 });

      const nextState = runtime.applyEdit(
        { type: "toggle-bullet-list" },
        state,
      );

      expect(nextState.source).toBe("- Line one\n- Line two");
    });

    test("converts numbered list to bullet list", () => {
      const runtime = createRuntimeV3([listExtension]);
      const source = "1. Item one\n2. Item two";
      const state = runtime.createState(source, { start: 0, end: 23 });

      const nextState = runtime.applyEdit(
        { type: "toggle-bullet-list" },
        state,
      );

      expect(nextState.source).toBe("- Item one\n- Item two");
    });
  });

  describe("toggle-numbered-list (onEdit)", () => {
    test("toggles a paragraph to a numbered list", () => {
      const runtime = createRuntimeV3([listExtension]);
      const state = runtime.createState("Hello world", { start: 0, end: 0 });

      const nextState = runtime.applyEdit(
        { type: "toggle-numbered-list" },
        state,
      );

      expect(nextState.source).toBe("1. Hello world");
    });

    test("toggles numbered list OFF when toggling on existing numbered", () => {
      const runtime = createRuntimeV3([listExtension]);
      const state = runtime.createState("1. Hello world", {
        start: 0,
        end: 14,
      });

      const nextState = runtime.applyEdit(
        { type: "toggle-numbered-list" },
        state,
      );

      expect(nextState.source).toBe("Hello world");
    });

    test("toggles numbered list across multiple lines with renumbering", () => {
      const runtime = createRuntimeV3([listExtension]);
      const source = "Line one\nLine two\nLine three";
      const state = runtime.createState(source, { start: 0, end: 28 });

      const nextState = runtime.applyEdit(
        { type: "toggle-numbered-list" },
        state,
      );

      expect(nextState.source).toBe("1. Line one\n2. Line two\n3. Line three");
    });

    test("converts bullet list to numbered list", () => {
      const runtime = createRuntimeV3([listExtension]);
      const source = "- Item one\n- Item two";
      const state = runtime.createState(source, { start: 0, end: 21 });

      const nextState = runtime.applyEdit(
        { type: "toggle-numbered-list" },
        state,
      );

      expect(nextState.source).toBe("1. Item one\n2. Item two");
    });
  });

  describe("marker switching", () => {
    test("switches bullet list markers when typing alternate markers", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "- item" with cursor at position 0
      const dashState = runtime.createState("- item", { start: 0, end: 0 });

      // Type "*" at the start
      const starState = runtime.applyEdit(
        { type: "insert", text: "*" },
        dashState,
      );

      expect(starState.source).toBe("* item");

      // Type "-" at the start to switch back
      const revertState = runtime.applyEdit(
        { type: "insert", text: "-" },
        runtime.createState("* item", { start: 0, end: 0 }),
      );

      expect(revertState.source).toBe("- item");
    });
  });

  describe("restarts numbered lists when splitting with enter then backspace", () => {
    test("splits then backspaces to create gap and renumber", () => {
      const runtime = createRuntimeV3([listExtension]);
      // "1. one\n2. two\n3. three" with cursor at end of first item
      const source = "1. one\n2. two\n3. three";
      const state = runtime.createState(source, { start: 6, end: 6 });

      // First, insert line break (splits the list)
      const split = runtime.applyEdit({ type: "insert-line-break" }, state);

      // Then backspace to exit the empty item
      const exited = runtime.applyEdit({ type: "delete-backward" }, split);

      expect(exited.source).toBe("1. one\n\n1. two\n2. three");
    });
  });
});
