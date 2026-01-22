import { describe, expect, it } from "vitest";
import {
  createRuntime,
  type CakeExtension,
  type RuntimeState,
} from "./core/runtime";
import {
  blockquoteExtension,
  boldExtension,
  linkExtension,
} from "./extensions";
import type { Affinity, Selection } from "./core/types";
import { CursorSourceBuilder } from "./core/mapping/cursor-source-map";

const runtime = createRuntime([
  blockquoteExtension,
  boldExtension,
  linkExtension,
]);

function sourceWithSelection(state: RuntimeState): string {
  const { source, map, selection } = state;
  if (selection.start === selection.end) {
    const affinity = selection.affinity ?? "forward";
    const pos = map.cursorToSource(selection.start, affinity);
    return source.slice(0, pos) + "|" + source.slice(pos);
  }

  const start = map.cursorToSource(selection.start, "backward");
  const end = map.cursorToSource(selection.end, "forward");
  const [from, to] = start <= end ? [start, end] : [end, start];
  return (
    source.slice(0, from) +
    "[" +
    source.slice(from, to) +
    "]" +
    source.slice(to)
  );
}

function selectionFromSource(
  map: RuntimeState["map"],
  offset: number,
  bias: Affinity,
): Selection {
  const cursor = map.sourceToCursor(offset, bias);
  return {
    start: cursor.cursorOffset,
    end: cursor.cursorOffset,
    affinity: cursor.affinity,
  };
}

function moveSelection(
  selection: Selection,
  map: RuntimeState["map"],
  direction: "left" | "right",
  shift = false,
): Selection {
  const caretSelection: Selection =
    selection.start === selection.end
      ? selection
      : {
          start:
            direction === "left"
              ? Math.min(selection.start, selection.end)
              : Math.max(selection.start, selection.end),
          end:
            direction === "left"
              ? Math.min(selection.start, selection.end)
              : Math.max(selection.start, selection.end),
          affinity: direction === "left" ? "backward" : "forward",
        };

  function moveCaret(current: Selection): Selection {
    const caret = current.start;
    if (direction === "left") {
      if (caret > 0) {
        return { start: caret - 1, end: caret - 1, affinity: "forward" };
      }
      return current;
    }

    if (caret < map.cursorLength) {
      return { start: caret + 1, end: caret + 1, affinity: "backward" };
    }

    const boundary = map.boundaries[caret];
    if (
      boundary &&
      boundary.sourceBackward !== boundary.sourceForward &&
      current.affinity !== "forward"
    ) {
      return { start: caret, end: caret, affinity: "forward" };
    }

    return current;
  }

  if (!shift) {
    return moveCaret(caretSelection);
  }

  const anchor = selection.start;
  const head = selection.end;
  const nextHead = moveCaret({
    start: head,
    end: head,
    affinity: selection.affinity,
  }).start;
  return { start: anchor, end: nextHead };
}

function setSelection(state: RuntimeState, selection: Selection): RuntimeState {
  return { ...state, selection };
}

describe("runtime with bold/link/blockquote", () => {
  it("roundtrips nested blockquote content", () => {
    const source = "> **a** [b](u)";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });

  it("roundtrips multi-line blockquotes", () => {
    const source = "> hello\n> **a** [b](u)";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });

  it("preserves affinity at ambiguous boundaries", () => {
    const source = "**bold**";
    const state = runtime.createState(source);
    const endCursor = selectionFromSource(state.map, source.length, "forward");
    const backwardSource = state.map.cursorToSource(
      endCursor.start,
      "backward",
    );
    const forwardSource = state.map.cursorToSource(endCursor.start, "forward");
    expect(backwardSource).toBe(source.length - 2);
    expect(forwardSource).toBe(source.length);
  });

  it("moves across bold boundaries", () => {
    const source = "**bold**";
    const base = runtime.createState(source);
    const selection = selectionFromSource(base.map, source.length, "forward");
    let state = setSelection(base, selection);

    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left"),
    );
    expect(sourceWithSelection(state)).toBe("**bol|d**");
  });

  it("backspaces across bold boundaries", () => {
    const source = "**bold**";
    const base = runtime.createState(source);
    const selection = selectionFromSource(base.map, source.length, "forward");
    const state = setSelection(base, selection);
    const next = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(sourceWithSelection(next)).toBe("**bol|**");
  });

  it("backspaces inside bold without deleting syntax", () => {
    const source = "**bold**";
    const base = runtime.createState(source);
    const selection = selectionFromSource(
      base.map,
      source.length - 2,
      "backward",
    );
    const state = setSelection(base, selection);
    const next = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(sourceWithSelection(next)).toBe("**bol|**");
  });

  it("escapes bold at the end via affinity", () => {
    const source = "**bold**";
    const base = runtime.createState(source);
    const selection = selectionFromSource(
      base.map,
      source.length - 2,
      "backward",
    );
    let state = setSelection(base, selection);
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "right"),
    );
    expect(sourceWithSelection(state)).toBe("**bold**|");
  });

  it("collapses bold when empty", () => {
    const source = "**a**";
    const base = runtime.createState(source);
    const selection = selectionFromSource(
      base.map,
      source.length - 2,
      "backward",
    );
    const state = setSelection(base, selection);
    const next = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(sourceWithSelection(next)).toBe("|");
  });

  it("selects last bold character", () => {
    const source = "**bold**";
    const base = runtime.createState(source);
    const selection = selectionFromSource(base.map, source.length, "forward");
    let state = setSelection(base, selection);
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left", true),
    );
    expect(sourceWithSelection(state)).toBe("**bol[d]**");
  });

  it("moves across link boundaries", () => {
    const source = "[word](url)";
    const base = runtime.createState(source);
    const selection = selectionFromSource(base.map, source.length, "forward");
    let state = setSelection(base, selection);

    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left"),
    );
    expect(sourceWithSelection(state)).toBe("[wor|d](url)");
  });

  it("backspaces across link boundaries", () => {
    const source = "[word](url)";
    const base = runtime.createState(source);
    const selection = selectionFromSource(base.map, source.length, "forward");
    const state = setSelection(base, selection);
    const next = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(sourceWithSelection(next)).toBe("[wor|](url)");
  });

  it("backspaces inside link label without deleting syntax", () => {
    const source = "[word](url)";
    const base = runtime.createState(source);
    const selection = selectionFromSource(
      base.map,
      source.indexOf("]("),
      "backward",
    );
    const state = setSelection(base, selection);
    const next = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(sourceWithSelection(next)).toBe("[wor|](url)");
  });

  it("escapes link at the end via affinity", () => {
    const source = "[word](url)";
    const base = runtime.createState(source);
    const selection = selectionFromSource(
      base.map,
      source.indexOf("]("),
      "backward",
    );
    let state = setSelection(base, selection);
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "right"),
    );
    expect(sourceWithSelection(state)).toBe("[word](url)|");
  });

  it("collapses link when empty", () => {
    const source = "[a](u)";
    const base = runtime.createState(source);
    const selection = selectionFromSource(
      base.map,
      source.indexOf("]("),
      "backward",
    );
    const state = setSelection(base, selection);
    const next = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(sourceWithSelection(next)).toBe("|");
  });

  it("selects last link character", () => {
    const source = "[word](url)";
    const base = runtime.createState(source);
    const selection = selectionFromSource(base.map, source.length, "forward");
    let state = setSelection(base, selection);
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left", true),
    );
    expect(sourceWithSelection(state)).toBe("[wor[d]](url)");
  });

  it("traverses adjacent bold and link", () => {
    const source = "**a**[b](u)";
    const base = runtime.createState(source);
    const selection = selectionFromSource(base.map, source.length, "forward");
    let state = setSelection(base, selection);
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left"),
    );
    expect(sourceWithSelection(state)).toBe("**a**[|b](u)");
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left"),
    );
    expect(sourceWithSelection(state)).toBe("**|a**[b](u)");
  });

  it("traverses nested link label bold", () => {
    const source = "[**ab**](u)";
    const base = runtime.createState(source);
    const selection = selectionFromSource(base.map, source.length, "forward");
    let state = setSelection(base, selection);
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left"),
    );
    expect(sourceWithSelection(state)).toBe("[**a|b**](u)");
    const next = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(sourceWithSelection(next)).toBe("[**|b**](u)");
  });

  it("traverses blockquote inline content", () => {
    const source = "> **a** [b](u)";
    const base = runtime.createState(source);
    const selection = selectionFromSource(base.map, source.length, "forward");
    let state = setSelection(base, selection);
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left"),
    );
    expect(sourceWithSelection(state)).toBe("> **a** [|b](u)");
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left"),
    );
    expect(sourceWithSelection(state)).toBe("> **a**| [b](u)");
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left"),
    );
    expect(sourceWithSelection(state)).toBe("> **|a** [b](u)");
  });

  it("crosses multi-line blockquote boundaries", () => {
    const source = "> a\n> b";
    const base = runtime.createState(source);
    const selection = selectionFromSource(
      base.map,
      source.indexOf("b"),
      "forward",
    );
    let state = setSelection(base, selection);
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left"),
    );
    expect(sourceWithSelection(state)).toBe("> a|\n> b");
  });

  it("keeps blockquote prefixes non-placeable", () => {
    const source = "> a\n> b";
    const base = runtime.createState(source);
    const selection = selectionFromSource(
      base.map,
      source.indexOf("a") + 1,
      "forward",
    );
    let state = setSelection(base, selection);
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left"),
    );
    expect(sourceWithSelection(state)).toBe("> |a\n> b");
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left"),
    );
    expect(sourceWithSelection(state)).toBe("> |a\n> b");
  });

  it("handles newline cursor rules", () => {
    const source = "a\nb";
    const base = runtime.createState(source);
    const selection = selectionFromSource(
      base.map,
      source.indexOf("b"),
      "forward",
    );
    let state = setSelection(base, selection);
    expect(sourceWithSelection(state)).toBe("a\n|b");
    const next = runtime.applyEdit({ type: "delete-backward" }, state);
    expect(next.source).toBe("ab");
    state = setSelection(
      state,
      moveSelection(state.selection, state.map, "left"),
    );
    expect(sourceWithSelection(state)).toBe("a|\nb");
  });

  it("allows extensions to override deletes for atoms", () => {
    const atomExtension: CakeExtension = {
      name: "atom",
      parseInline(source, start) {
        if (source.slice(start, start + 2) !== "@@") {
          return null;
        }
        return {
          inline: { type: "inline-atom", kind: "atom" },
          nextPos: start + 2,
        };
      },
      serializeInline(inline) {
        if (inline.type !== "inline-atom" || inline.kind !== "atom") {
          return null;
        }
        const builder = new CursorSourceBuilder();
        builder.appendCursorAtom("@@", 1);
        return builder.build();
      },
      onEdit(command, state) {
        if (command.type !== "delete-backward") {
          return null;
        }
        if (state.selection.start !== state.selection.end) {
          return null;
        }
        if (state.selection.start !== 1) {
          return null;
        }
        const block = state.doc.blocks[0];
        if (!block || block.type !== "paragraph") {
          return null;
        }
        const inline = block.content[0];
        if (
          !inline ||
          inline.type !== "inline-atom" ||
          inline.kind !== "atom"
        ) {
          return null;
        }
        return { source: "", selection: { start: 0, end: 0 } };
      },
    };

    const atomRuntime = createRuntime([atomExtension]);
    const base = atomRuntime.createState("@@");
    const selection = { start: 1, end: 1, affinity: "backward" as const };
    const state = { ...base, selection };
    const next = atomRuntime.applyEdit({ type: "delete-backward" }, state);
    expect(next.source).toBe("");
  });
});
