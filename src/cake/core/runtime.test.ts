import { describe, expect, it } from "vitest";
import { createRuntime, type RuntimeState } from "./runtime";
import type { Doc } from "./types";

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

async function createBundledRuntime() {
  const { bundledExtensions } = await import("../extensions");
  return createRuntime(bundledExtensions);
}

describe("createRuntime([])", () => {
  it("roundtrips literal text without syntax knowledge", () => {
    const runtime = createRuntime([]);
    for (const value of cases) {
      const doc = runtime.parse(value);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(value);
    }
  });

  it("delete-backward with range selection deletes range and keeps text after", () => {
    const runtime = createRuntime([]);
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
    const runtime = createRuntime([]);
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
    const runtime = createRuntime(bundledExtensions);
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
    const runtime = createRuntime(bundledExtensions);
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
    const runtime = createRuntime(bundledExtensions);
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

  it("toggle-inline bold splits on '\\n' within a single paragraph text run", async () => {
    const { bundledExtensions } = await import("../extensions");
    const runtime = createRuntime(bundledExtensions);

    const doc: Doc = {
      type: "doc",
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hello\nworld" }],
        },
      ],
    };
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe("hello\nworld");

    const state: RuntimeState = {
      source: serialized.source,
      map: serialized.map,
      doc,
      runtime,
      selection: { start: 0, end: 11, affinity: "forward" },
    };

    const result = runtime.applyEdit(
      { type: "toggle-inline", marker: "**" },
      state,
    );
    expect(result.source).toBe("**hello**\n**world**");
  });
});

describe("inline toggle selection edge cases", () => {
  it("toggles underline on/off across a heading selection that includes newline", async () => {
    const runtime = await createBundledRuntime();
    const initial = "# title\n";
    const state = runtime.createState(initial, {
      start: 0,
      end: 6,
      affinity: "forward",
    });

    const underlined = runtime.applyEdit({ type: "toggle-underline" }, state);
    expect(underlined.source).toBe("# <u>title</u>\n");

    const restored = runtime.applyEdit(
      { type: "toggle-underline" },
      underlined,
    );
    expect(restored.source).toBe("# title\n");
  });

  it("toggles bold off across a heading selection that includes newline", async () => {
    const runtime = await createBundledRuntime();
    const state = runtime.createState("# **title**\n", {
      start: 0,
      end: 6,
      affinity: "forward",
    });

    const result = runtime.applyEdit({ type: "toggle-bold" }, state);
    expect(result.source).toBe("# title\n");
  });

  it("toggles underline for a selection that starts after the line start and ends at newline", async () => {
    const runtime = await createBundledRuntime();
    const state = runtime.createState("# title\n", {
      start: 1,
      end: 6,
      affinity: "forward",
    });

    const result = runtime.applyEdit({ type: "toggle-underline" }, state);
    expect(result.source).toBe("# t<u>itle</u>\n");
  });

  it("toggles underline across an inline newline inside a single paragraph", async () => {
    const runtime = await createBundledRuntime();
    const doc: Doc = {
      type: "doc",
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hello\nworld" }],
        },
      ],
    };
    const serialized = runtime.serialize(doc);

    const state: RuntimeState = {
      source: serialized.source,
      map: serialized.map,
      doc,
      runtime,
      selection: { start: 0, end: 11, affinity: "forward" },
    };

    const result = runtime.applyEdit(
      { type: "toggle-inline", marker: "<u>" },
      state,
    );
    expect(result.source).toBe("<u>hello</u>\n<u>world</u>");
  });

  it("toggles underline across multiple paragraphs while skipping empty lines", async () => {
    const runtime = await createBundledRuntime();
    const state = runtime.createState("one\n\ntwo", {
      start: 0,
      end: 8,
      affinity: "forward",
    });

    const underlined = runtime.applyEdit({ type: "toggle-underline" }, state);
    expect(underlined.source).toBe("<u>one</u>\n\n<u>two</u>");

    const restored = runtime.applyEdit(
      { type: "toggle-underline" },
      underlined,
    );
    expect(restored.source).toBe("one\n\ntwo");
  });

  it("toggles bold when selection ends at a block boundary", async () => {
    const runtime = await createBundledRuntime();
    const state = runtime.createState("para1\n", {
      start: 0,
      end: 6,
      affinity: "forward",
    });

    const bolded = runtime.applyEdit({ type: "toggle-bold" }, state);
    expect(bolded.source).toBe("**para1**\n");

    const restored = runtime.applyEdit({ type: "toggle-bold" }, bolded);
    expect(restored.source).toBe("para1\n");
  });

  it("toggles bold when selection starts at a block boundary", async () => {
    const runtime = await createBundledRuntime();
    const state = runtime.createState("para1\npara2", {
      start: 6,
      end: 11,
      affinity: "forward",
    });

    const bolded = runtime.applyEdit({ type: "toggle-bold" }, state);
    expect(bolded.source).toBe("para1\n**para2**");
  });

  it("adds underline to already bold text and removes it cleanly", async () => {
    const runtime = await createBundledRuntime();
    const state = runtime.createState("**hello**", {
      start: 0,
      end: 5,
      affinity: "forward",
    });

    const underlined = runtime.applyEdit({ type: "toggle-underline" }, state);
    expect(underlined.source).toBe("**<u>hello</u>**");

    const restored = runtime.applyEdit(
      { type: "toggle-underline" },
      underlined,
    );
    expect(restored.source).toBe("**hello**");
  });

  it("adds bold inside underline and removes it cleanly", async () => {
    const runtime = await createBundledRuntime();
    const state = runtime.createState("<u>hello</u>", {
      start: 0,
      end: 5,
      affinity: "forward",
    });

    const bolded = runtime.applyEdit({ type: "toggle-bold" }, state);
    expect(bolded.source).toBe("<u>**hello**</u>");

    const restored = runtime.applyEdit({ type: "toggle-bold" }, bolded);
    expect(restored.source).toBe("<u>hello</u>");
  });

  it("splits an existing bold run when toggling off within a subset", async () => {
    const runtime = await createBundledRuntime();
    const state = runtime.createState("**hello** world", {
      start: 3,
      end: 5,
      affinity: "forward",
    });

    const result = runtime.applyEdit({ type: "toggle-bold" }, state);
    expect(result.source).toBe("**hel**lo world");
  });

  it("inserts a placeholder when toggling bold with a collapsed selection", async () => {
    const runtime = await createBundledRuntime();
    const placeholder = "\u200B";
    const state = runtime.createState("hello", {
      start: 2,
      end: 2,
      affinity: "forward",
    });

    const result = runtime.applyEdit({ type: "toggle-bold" }, state);
    expect(result.source).toBe(`he**${placeholder}**llo`);
  });

  it("does nothing when the selection contains only a newline", async () => {
    const runtime = await createBundledRuntime();
    const doc: Doc = {
      type: "doc",
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "one\n" }],
        },
      ],
    };
    const serialized = runtime.serialize(doc);

    const state: RuntimeState = {
      source: serialized.source,
      map: serialized.map,
      doc,
      runtime,
      selection: { start: 3, end: 4, affinity: "forward" },
    };

    const result = runtime.applyEdit(
      { type: "toggle-inline", marker: "<u>" },
      state,
    );
    expect(result.source).toBe("one\n");
  });
});
