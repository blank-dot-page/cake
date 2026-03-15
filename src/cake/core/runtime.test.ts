import { describe, expect, it } from "vitest";
import {
  createRuntimeForTests,
  type RuntimeState,
} from "./runtime";
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
  return createRuntimeForTests(bundledExtensions);
}

function sourceOffsetForSelectionStart(state: RuntimeState): number {
  const affinity = state.selection.affinity ?? "forward";
  return state.map.cursorToSource(state.selection.start, affinity);
}

function spliceSource(
  source: string,
  start: number,
  end: number,
  replacement: string,
): string {
  return source.slice(0, start) + replacement + source.slice(end);
}

function sampledPositions(max: number, sampleCount = 24): number[] {
  if (max <= 0) {
    return [0];
  }
  const step = Math.max(1, Math.floor(max / sampleCount));
  const positions: number[] = [];
  for (let cursor = 0; cursor <= max; cursor += step) {
    positions.push(cursor);
  }
  if (positions[positions.length - 1] !== max) {
    positions.push(max);
  }
  return positions;
}

function buildLargeMixedSource(): string {
  const lines: string[] = [];
  for (let section = 1; section <= 8; section += 1) {
    lines.push(
      `## Section ${section} **bold-${section}** [ref-${section}](https://example.com/${section})`,
      `> quote-${section} with *italic-${section}* and [q-${section}](https://quotes.example/${section})`,
      `- list-${section} item with **strong-${section}** text`,
      `- list-${section} item with [list-link-${section}](https://lists.example/${section})`,
      `Paragraph ${section} typing-target replace-window-abcdefghij plain tail.`,
    );
  }
  return lines.join("\n");
}

const largeMixedSource = buildLargeMixedSource();

describe("createRuntimeForTests([])", () => {
  it("roundtrips literal text without syntax knowledge", () => {
    const runtime = createRuntimeForTests([]);
    for (const value of cases) {
      const doc = runtime.parse(value);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(value);
    }
  });

  it("delete-backward with range selection deletes range and keeps text after", () => {
    const runtime = createRuntimeForTests([]);
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
    const runtime = createRuntimeForTests([]);
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
    const runtime = createRuntimeForTests(bundledExtensions);
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
    const runtime = createRuntimeForTests(bundledExtensions);
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

  it("delete-backward within a list prefix still removes the marker for linked content", async () => {
    const { bundledExtensions } = await import("../extensions");
    const runtime = createRuntimeForTests(bundledExtensions);
    const value = "- [hello](http://localhost:3000/)\nother text";
    const base = runtime.createState(value);
    const cursor = base.map.sourceToCursor(1, "forward"); // inside "- "
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
    const runtime = createRuntimeForTests(bundledExtensions);
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
    const runtime = createRuntimeForTests(bundledExtensions);

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

  it("keeps source + cursor mapping stable across common collapsed typing/edit commands", async () => {
    const runtime = await createBundledRuntime();
    let state = runtime.createState("alpha\nbeta");
    const end = state.map.sourceToCursor(state.source.length, "forward");
    state = {
      ...state,
      selection: {
        start: end.cursorOffset,
        end: end.cursorOffset,
        affinity: end.affinity,
      },
    };

    state = runtime.applyEdit(
      { type: "insert", text: "x" },
      state,
    );
    expect(state.source).toBe("alpha\nbetax");
    expect(state.selection.start).toBe(state.selection.end);
    expect(sourceOffsetForSelectionStart(state)).toBe(state.source.length);

    state = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(state.source).toBe("alpha\nbeta");
    expect(state.selection.start).toBe(state.selection.end);
    expect(sourceOffsetForSelectionStart(state)).toBe(state.source.length);

    state = runtime.applyEdit({ type: "insert-line-break" }, state);
    expect(state.source).toBe("alpha\nbeta\n");
    expect(state.selection.start).toBe(state.selection.end);
    expect(sourceOffsetForSelectionStart(state)).toBe(state.source.length);

    state = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(state.source).toBe("alpha\nbeta");
    expect(state.selection.start).toBe(state.selection.end);
    expect(sourceOffsetForSelectionStart(state)).toBe(state.source.length);
  });

  it("keeps replacement edits correct for a range insertion", async () => {
    const runtime = await createBundledRuntime();
    const state = runtime.createState("alpha\nbeta\ngamma");
    const start = state.map.sourceToCursor(1, "forward");
    const end = state.map.sourceToCursor(3, "forward");

    const next = runtime.applyEdit(
      { type: "insert", text: "z" },
      {
        ...state,
        selection: {
          start: start.cursorOffset,
          end: end.cursorOffset,
          affinity: "forward",
        },
      },
    );

    expect(next.source).toBe("azha\nbeta\ngamma");
    expect(next.selection.start).toBe(next.selection.end);
    expect(sourceOffsetForSelectionStart(next)).toBe(2);
  });

  it("still reparses when markdown marker characters are inserted", async () => {
    const runtime = await createBundledRuntime();
    let state = runtime.createState("", {
      start: 0,
      end: 0,
      affinity: "forward",
    });
    state = runtime.applyEdit({ type: "insert", text: "*" }, state);
    state = runtime.applyEdit({ type: "insert", text: "a" }, state);
    state = runtime.applyEdit({ type: "insert", text: "*" }, state);

    expect(state.source).toBe("*a*");
    expect(state.map.cursorLength).toBe(1);
    expect(state.selection.start).toBe(state.selection.end);
    expect(state.selection.start).toBe(1);

    state = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(state.source).toBe("");
    expect(state.selection.start).toBe(0);
    expect(state.selection.end).toBe(0);
  });

  it("keeps createState(source) equivalent to createStateFromDoc(parse(source))", async () => {
    const runtime = await createBundledRuntime();
    const initial = runtime.createState(largeMixedSource);
    const start = initial.map.sourceToCursor(40, "forward");
    const end = initial.map.sourceToCursor(120, "backward");
    const selection = {
      start: start.cursorOffset,
      end: end.cursorOffset,
      affinity: "forward" as const,
    };

    const fromSource = runtime.createState(largeMixedSource, selection);
    const fromDoc = runtime.createStateFromDoc(
      runtime.parse(largeMixedSource),
      selection,
    );

    expect(fromDoc.source).toBe(fromSource.source);
    expect(fromDoc.selection).toEqual(fromSource.selection);
    expect(runtime.serialize(fromDoc.doc).source).toBe(
      runtime.serialize(fromSource.doc).source,
    );
    expect(fromDoc.map.cursorLength).toBe(fromSource.map.cursorLength);

    for (const cursor of sampledPositions(fromSource.map.cursorLength)) {
      expect(fromDoc.map.cursorToSource(cursor, "forward")).toBe(
        fromSource.map.cursorToSource(cursor, "forward"),
      );
      expect(fromDoc.map.cursorToSource(cursor, "backward")).toBe(
        fromSource.map.cursorToSource(cursor, "backward"),
      );
    }

    for (const offset of sampledPositions(fromSource.source.length)) {
      expect(fromDoc.map.sourceToCursor(offset, "forward")).toEqual(
        fromSource.map.sourceToCursor(offset, "forward"),
      );
      expect(fromDoc.map.sourceToCursor(offset, "backward")).toEqual(
        fromSource.map.sourceToCursor(offset, "backward"),
      );
    }
  });

  it("keeps repeated inserts stable on a large mixed-format document", async () => {
    const runtime = await createBundledRuntime();
    let state = runtime.createState(largeMixedSource);
    const anchorText = "typing-target";
    const anchorIndex = state.source.indexOf(anchorText);
    expect(anchorIndex).toBeGreaterThan(-1);

    const anchorCursor = state.map.sourceToCursor(
      anchorIndex + anchorText.length,
      "forward",
    );
    state = {
      ...state,
      selection: {
        start: anchorCursor.cursorOffset,
        end: anchorCursor.cursorOffset,
        affinity: anchorCursor.affinity,
      },
    };

    let expectedSource = state.source;
    const inserts = Array.from({ length: 48 }, (_, index) =>
      String(index % 10),
    );
    for (const text of inserts) {
      const beforeOffset = sourceOffsetForSelectionStart(state);
      expectedSource = spliceSource(
        expectedSource,
        beforeOffset,
        beforeOffset,
        text,
      );
      state = runtime.applyEdit({ type: "insert", text }, state);

      expect(state.source).toBe(expectedSource);
      expect(state.selection.start).toBe(state.selection.end);
      expect(sourceOffsetForSelectionStart(state)).toBe(
        beforeOffset + text.length,
      );
    }

    expect(runtime.serialize(state.doc).source).toBe(state.source);
  });

  it("keeps delete and range-replace edits correct on the large mixed-format document", async () => {
    const runtime = await createBundledRuntime();
    let state = runtime.createState(largeMixedSource);
    let expectedSource = state.source;

    const windowText = "replace-window-abcdefghij";
    const windowIndex = expectedSource.indexOf(windowText);
    expect(windowIndex).toBeGreaterThan(-1);
    const cursorAt = windowIndex + "replace-window-abc".length;
    const anchorCursor = state.map.sourceToCursor(cursorAt, "forward");
    state = {
      ...state,
      selection: {
        start: anchorCursor.cursorOffset,
        end: anchorCursor.cursorOffset,
        affinity: anchorCursor.affinity,
      },
    };

    const backwardFrom = sourceOffsetForSelectionStart(state);
    state = runtime.applyEdit({ type: "delete-backward" }, state);
    expectedSource = spliceSource(
      expectedSource,
      backwardFrom - 1,
      backwardFrom,
      "",
    );
    expect(state.source).toBe(expectedSource);
    expect(state.selection.start).toBe(state.selection.end);
    expect(sourceOffsetForSelectionStart(state)).toBe(backwardFrom - 1);

    const forwardFrom = sourceOffsetForSelectionStart(state);
    state = runtime.applyEdit({ type: "delete-forward" }, state);
    expectedSource = spliceSource(
      expectedSource,
      forwardFrom,
      forwardFrom + 1,
      "",
    );
    expect(state.source).toBe(expectedSource);
    expect(state.selection.start).toBe(state.selection.end);
    expect(sourceOffsetForSelectionStart(state)).toBe(forwardFrom);

    const replaceStart = expectedSource.indexOf("replace-window-") + 15;
    const replaceEnd = replaceStart + 4;
    const replaceStartCursor = state.map.sourceToCursor(replaceStart, "forward");
    const replaceEndCursor = state.map.sourceToCursor(replaceEnd, "backward");
    state = {
      ...state,
      selection: {
        start: replaceStartCursor.cursorOffset,
        end: replaceEndCursor.cursorOffset,
        affinity: "forward",
      },
    };
    state = runtime.applyEdit({ type: "insert", text: "WXYZ" }, state);
    expectedSource = spliceSource(
      expectedSource,
      replaceStart,
      replaceEnd,
      "WXYZ",
    );
    expect(state.source).toBe(expectedSource);
    expect(state.selection.start).toBe(state.selection.end);
    expect(sourceOffsetForSelectionStart(state)).toBe(replaceStart + 4);
    expect(runtime.serialize(state.doc).source).toBe(state.source);
  });

  it("updates selection without changing source or serialized doc semantics", async () => {
    const runtime = await createBundledRuntime();
    const state = runtime.createState(largeMixedSource);
    const beforeSerialized = runtime.serialize(state.doc).source;

    const sourceStart = state.source.indexOf("bold-4");
    const sourceEnd = sourceStart + "bold-4 [ref-4]".length;
    const start = state.map.sourceToCursor(sourceStart, "forward");
    const end = state.map.sourceToCursor(sourceEnd, "backward");

    const next = runtime.updateSelection(
      state,
      {
        start: start.cursorOffset,
        end: end.cursorOffset,
        affinity: "forward",
      },
      { kind: "programmatic" },
    );

    expect(next.source).toBe(state.source);
    expect(runtime.serialize(next.doc).source).toBe(beforeSerialized);
    expect(next.selection).toEqual({
      start: start.cursorOffset,
      end: end.cursorOffset,
      affinity: "forward",
    });
    expect(next.map.cursorLength).toBe(state.map.cursorLength);

    for (const cursor of sampledPositions(state.map.cursorLength)) {
      expect(next.map.cursorToSource(cursor, "forward")).toBe(
        state.map.cursorToSource(cursor, "forward"),
      );
      expect(next.map.cursorToSource(cursor, "backward")).toBe(
        state.map.cursorToSource(cursor, "backward"),
      );
    }
  });

  it("keeps unicode/grapheme edit paths correct for emoji, ZWJ, and combining marks", async () => {
    const runtime = await createBundledRuntime();
    let expectedSource = "start 😀 middle 👨‍👩‍👧‍👦 cafe\u0301 done";
    let state = runtime.createState(expectedSource);

    const setCollapsedSelectionAtSource = (
      sourceOffset: number,
      affinity: "forward" | "backward" = "forward",
    ) => {
      const cursor = state.map.sourceToCursor(sourceOffset, affinity);
      state = {
        ...state,
        selection: {
          start: cursor.cursorOffset,
          end: cursor.cursorOffset,
          affinity: cursor.affinity,
        },
      };
    };

    const emoji = "😀";
    const emojiStart = expectedSource.indexOf(emoji);
    const emojiEnd = emojiStart + emoji.length;
    setCollapsedSelectionAtSource(emojiEnd, "forward");
    state = runtime.applyEdit({ type: "delete-backward" }, state);
    expectedSource = spliceSource(expectedSource, emojiStart, emojiEnd, "");
    expect(state.source).toBe(expectedSource);
    expect(sourceOffsetForSelectionStart(state)).toBe(emojiStart);

    const family = "👨‍👩‍👧‍👦";
    const familyStart = expectedSource.indexOf(family);
    const familyEnd = familyStart + family.length;
    setCollapsedSelectionAtSource(familyStart, "forward");
    state = runtime.applyEdit({ type: "delete-forward" }, state);
    expectedSource = spliceSource(expectedSource, familyStart, familyEnd, "");
    expect(state.source).toBe(expectedSource);
    expect(sourceOffsetForSelectionStart(state)).toBe(familyStart);

    const combining = "e\u0301";
    const combiningStart = expectedSource.indexOf(combining);
    const combiningEnd = combiningStart + combining.length;
    const combiningStartCursor = state.map.sourceToCursor(
      combiningStart,
      "forward",
    );
    const combiningEndCursor = state.map.sourceToCursor(combiningEnd, "backward");
    state = {
      ...state,
      selection: {
        start: combiningStartCursor.cursorOffset,
        end: combiningEndCursor.cursorOffset,
        affinity: "forward",
      },
    };
    state = runtime.applyEdit({ type: "insert", text: "E" }, state);
    expectedSource = spliceSource(expectedSource, combiningStart, combiningEnd, "E");
    expect(state.source).toBe(expectedSource);
    expect(sourceOffsetForSelectionStart(state)).toBe(combiningStart + 1);

    const thumbs = "👍🏽";
    const insertAt = expectedSource.indexOf(" done");
    setCollapsedSelectionAtSource(insertAt, "forward");
    state = runtime.applyEdit({ type: "insert", text: thumbs }, state);
    expectedSource = spliceSource(expectedSource, insertAt, insertAt, thumbs);
    expect(state.source).toBe(expectedSource);
    expect(sourceOffsetForSelectionStart(state)).toBe(insertAt + thumbs.length);

    state = runtime.applyEdit({ type: "delete-backward" }, state);
    expectedSource = spliceSource(
      expectedSource,
      insertAt,
      insertAt + thumbs.length,
      "",
    );
    expect(state.source).toBe(expectedSource);
    expect(sourceOffsetForSelectionStart(state)).toBe(insertAt);
    expect(runtime.serialize(state.doc).source).toBe(state.source);
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

  it("toggles mixed bold selection to all-bold, then removes bold from all", async () => {
    const runtime = await createBundledRuntime();
    const state = runtime.createState("**bold** plain", {
      start: 0,
      end: 10,
      affinity: "forward",
    });

    const bolded = runtime.applyEdit({ type: "toggle-bold" }, state);
    expect(bolded.source).toBe("**bold plain**");

    const unbolded = runtime.applyEdit({ type: "toggle-bold" }, bolded);
    expect(unbolded.source).toBe("bold plain");
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

  it("toggle-bold off at combined bold+italic boundary keeps source parseable for subsequent typing", async () => {
    const runtime = await createBundledRuntime();
    const state = runtime.createState("**bold*italics***", {
      start: 11,
      end: 11,
      affinity: "forward",
    });

    const toggled = runtime.applyEdit({ type: "toggle-bold" }, state);
    expect(toggled.source).toBe("**bold*italics***");

    const typed = runtime.applyEdit({ type: "insert", text: "plain" }, toggled);
    expect(typed.source).toBe("**bold*italics***plain");
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
