import { describe, expect, it } from "vitest";
import { createRuntimeV3 } from "./runtime";

const cases = [
  "",
  "hello",
  "Hello, world!",
  "**bold**",
  "[link](url)",
  "> quote",
  "multiple\nlines",
  "line one\nline two\nline three",
  "emoji \\u{1F600}",
  "family \\u{1F468}\\u{200D}\\u{1F469}\\u{200D}\\u{1F467}\\u{200D}\\u{1F466}",
  "flag \\u{1F1FA}\\u{1F1F3}",
  "skin tone \\u{1F44D}\\u{1F3FD}",
  "combining e\u0301",
  "arabic مرحبا",
  "japanese こんにちは",
  "punctuation !@#$%^&*()_+",
  "math 1+1=2",
  "tabs\tinside",
  "trailing newline\n",
  "\n",
];

describe("createRuntimeV3([])", () => {
  it("roundtrips literal text without syntax knowledge", () => {
    const runtime = createRuntimeV3([]);
    for (const value of cases) {
      const doc = runtime.parse(value);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(value);
    }
  });

  it("delete-backward with range selection deletes range and keeps text after", () => {
    const runtime = createRuntimeV3([]);
    // "hello world test"
    // Position 11 is after "world" (h e l l o   w o r l d)
    const state = runtime.createState("hello world test", {
      start: 0,
      end: 11,
      affinity: "forward",
    });
    const result = runtime.applyEdit({ type: "delete-backward" }, state);
    // Should delete "hello world" and leave " test"
    expect(result.source).toBe(" test");
    expect(result.selection.start).toBe(0);
    expect(result.selection.end).toBe(0);
  });

  it("delete-backward at start of empty line after newline deletes newline", () => {
    const runtime = createRuntimeV3([]);
    // "line one\n" - cursor at position 9 (start of empty second line)
    const state = runtime.createState("line one\n", {
      start: 9,
      end: 9,
      affinity: "forward",
    });

    const result = runtime.applyEdit({ type: "delete-backward" }, state);
    // Should delete the newline
    expect(result.source).toBe("line one");
    expect(result.selection.start).toBe(8);
    expect(result.selection.end).toBe(8);
  });

  it("delete-backward at start of empty line with bundled extensions", async () => {
    // Dynamic import bundled extensions
    const { bundledExtensions } = await import("../extensions");
    const runtime = createRuntimeV3(bundledExtensions);
    // "line one\n" - cursor at position 9 (start of empty second line)
    const state = runtime.createState("line one\n", {
      start: 9,
      end: 9,
      affinity: "forward",
    });

    const result = runtime.applyEdit({ type: "delete-backward" }, state);
    // Should delete the newline
    expect(result.source).toBe("line one");
    expect(result.selection.start).toBe(8);
    expect(result.selection.end).toBe(8);
  });

  it("delete-backward at list content start preserves link markdown syntax", async () => {
    const { bundledExtensions } = await import("../extensions");
    const runtime = createRuntimeV3(bundledExtensions);
    const value = "- [hello](http://localhost:3000/)\nother text";
    const base = runtime.createState(value);
    const cursor = base.map.sourceToCursor(3, "forward"); // after "- ["
    const state = {
      ...base,
      selection: {
        start: cursor.cursorOffset,
        end: cursor.cursorOffset,
        affinity: cursor.affinity,
      },
    };
    const result = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(result.source).toBe("[hello](http://localhost:3000/)\nother text");
  });

  it("delete-backward with range selection ending at list content start does not delete source-only '['", async () => {
    const { bundledExtensions } = await import("../extensions");
    const runtime = createRuntimeV3(bundledExtensions);
    const value = "- [hello](http://localhost:3000/)\nother text";
    const base = runtime.createState(value);
    const cursor = base.map.sourceToCursor(3, "forward"); // after "- ["
    const state = runtime.createState(value, {
      start: 0,
      end: cursor.cursorOffset,
      affinity: "forward",
    });
    const result = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(result.source).toBe("[hello](http://localhost:3000/)\nother text");
  });
});
