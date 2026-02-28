import { describe, expect, it } from "vitest";
import type { Doc, Selection } from "../../core/types";
import { getEditorTextModelForDoc } from "./editor-text-model";

function collapsedSelection(
  start: number,
  affinity: Selection["affinity"] = "forward",
): Selection {
  return { start, end: start, affinity };
}

describe("EditorTextModel", () => {
  it("maps grapheme clusters without breaking cursor-visible offsets", () => {
    const text = "A👨‍👩‍👧‍👦B";
    const doc: Doc = {
      type: "doc",
      blocks: [{ type: "paragraph", content: [{ type: "text", text }] }],
    };

    const model = getEditorTextModelForDoc(doc);

    expect(model.getCursorLength()).toBe(3);
    expect(model.cursorOffsetToVisibleOffset(0)).toBe(0);
    expect(model.cursorOffsetToVisibleOffset(1)).toBe(1);
    expect(model.cursorOffsetToVisibleOffset(2)).toBe("A👨‍👩‍👧‍👦".length);
    expect(model.visibleOffsetToCursorOffset("A👨‍👩‍👧‍👦".length)).toBe(2);
    expect(model.getTextBeforeCursor(collapsedSelection(2), 100)).toBe(
      "A👨‍👩‍👧‍👦",
    );
  });

  it("preserves wrappers, inline atoms, newlines, and affinity for text windows", () => {
    const doc: Doc = {
      type: "doc",
      blocks: [
        {
          type: "block-wrapper",
          kind: "heading",
          blocks: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Hi" },
                { type: "inline-atom", kind: "mention", data: { id: "1" } },
                {
                  type: "inline-wrapper",
                  kind: "bold",
                  children: [{ type: "text", text: "there" }],
                },
              ],
            },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "Next" }] },
      ],
    };

    const model = getEditorTextModelForDoc(doc);
    const startOfSecondLine = model.getLineOffsets()[1] ?? 0;

    expect(model.getVisibleText()).toBe("Hi there\nNext");
    expect(model.getTextBeforeCursor(collapsedSelection(startOfSecondLine), 20)).toBe(
      "Hi there\n",
    );
    expect(
      model.getTextBeforeCursor(
        collapsedSelection(startOfSecondLine, "backward"),
        20,
      ),
    ).toBe("Hi there\n");
    expect(model.getTextAroundCursor(collapsedSelection(startOfSecondLine), 20, 4)).toEqual(
      {
        before: "Hi there\n",
        after: "Next",
      },
    );
  });

  it("keeps block atoms as structural empty lines with newline parity", () => {
    const doc: Doc = {
      type: "doc",
      blocks: [
        { type: "paragraph", content: [{ type: "text", text: "A" }] },
        { type: "block-atom", kind: "image", data: { src: "x.png" } },
        { type: "paragraph", content: [{ type: "text", text: "B" }] },
      ],
    };

    const model = getEditorTextModelForDoc(doc);
    const lines = model.getLines();

    expect(lines).toHaveLength(3);
    expect(lines[1]?.isAtomic).toBe(true);
    expect(model.getVisibleText()).toBe("A\n\nB");
    expect(model.getTextForCursorRange(0, model.getCursorLength())).toBe(
      "A\n\nB",
    );
    expect(model.visibleOffsetToCursorOffset(2)).toBe(2);
    expect(model.visibleOffsetToCursorOffset(3)).toBe(3);
  });

  it("preserves selection affinity for collapsed multiline text windows", () => {
    const doc: Doc = {
      type: "doc",
      blocks: [
        { type: "paragraph", content: [{ type: "text", text: "Alpha" }] },
        { type: "paragraph", content: [{ type: "text", text: "Beta" }] },
      ],
    };

    const model = getEditorTextModelForDoc(doc);
    const boundary = 6;
    const forwardSelection: Selection = {
      start: boundary,
      end: boundary,
      affinity: "forward",
    };
    const backwardSelection: Selection = {
      start: boundary,
      end: boundary,
      affinity: "backward",
    };

    expect(model.getTextBeforeCursor(forwardSelection, 20)).toBe("Alpha\n");
    expect(model.getTextBeforeCursor(backwardSelection, 20)).toBe("Alpha\n");
    expect(model.getTextAroundCursor(forwardSelection, 20, 20)).toEqual({
      before: "Alpha\n",
      after: "Beta",
    });
    expect(model.getTextAroundCursor(backwardSelection, 20, 20)).toEqual({
      before: "Alpha\n",
      after: "Beta",
    });
  });

  it("keeps forward/backward affinity parity for model-backed collapsed queries at grapheme and newline boundaries", () => {
    const doc: Doc = {
      type: "doc",
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "A👨‍👩‍👧‍👦B" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "X" },
            { type: "inline-atom", kind: "mention", data: { id: "1" } },
            {
              type: "inline-wrapper",
              kind: "bold",
              children: [{ type: "text", text: "Y" }],
            },
          ],
        },
      ],
    };

    const model = getEditorTextModelForDoc(doc);
    const probeOffsets = [0, 1, 2, 3, 4, 5, 6, 7];

    for (const offset of probeOffsets) {
      const forward = collapsedSelection(offset, "forward");
      const backward = collapsedSelection(offset, "backward");

      expect(model.getTextSelection(forward)).toEqual(
        model.getTextSelection(backward),
      );
      expect(model.getTextBeforeCursor(forward, 100)).toBe(
        model.getTextBeforeCursor(backward, 100),
      );
      expect(model.getTextAroundCursor(forward, 100, 100)).toEqual(
        model.getTextAroundCursor(backward, 100, 100),
      );
    }

    expect(model.getTextAroundCursor(collapsedSelection(2, "forward"), 100, 100)).toEqual(
      {
        before: "A👨‍👩‍👧‍👦",
        after: "B\nX Y",
      },
    );
    expect(model.getTextAroundCursor(collapsedSelection(4, "backward"), 100, 100)).toEqual(
      {
        before: "A👨‍👩‍👧‍👦B\n",
        after: "X Y",
      },
    );
  });

  it("keeps forward/backward affinity parity for model-backed range selection mapping", () => {
    const doc: Doc = {
      type: "doc",
      blocks: [
        { type: "paragraph", content: [{ type: "text", text: "Alpha" }] },
        { type: "paragraph", content: [{ type: "text", text: "Beta" }] },
      ],
    };

    const model = getEditorTextModelForDoc(doc);
    const forward: Selection = { start: 2, end: 7, affinity: "forward" };
    const backward: Selection = { start: 2, end: 7, affinity: "backward" };

    expect(model.getTextSelection(forward)).toEqual({ start: 2, end: 7 });
    expect(model.getTextSelection(backward)).toEqual({ start: 2, end: 7 });
    expect(model.getTextBeforeCursor(forward, 100)).toBe("Al");
    expect(model.getTextBeforeCursor(backward, 100)).toBe("Al");
    expect(model.getTextAroundCursor(forward, 100, 100)).toEqual({
      before: "Al",
      after: "pha\nBeta",
    });
    expect(model.getTextAroundCursor(backward, 100, 100)).toEqual({
      before: "Al",
      after: "pha\nBeta",
    });
  });
});
