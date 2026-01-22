import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { getDocLines } from "./selection-layout";
import {
  resolveDomPosition,
  cursorOffsetToDomOffset,
} from "./selection-layout-dom";
import type { Doc } from "../../core/types";

/**
 * This test demonstrates the cursor positioning problem when a line is rendered
 * with multiple text nodes but getDocLines only sees partial text content.
 *
 * The bug: If a line visually shows "AB" (two text nodes: "A" and "B") but the
 * Doc structure only contains "B", then cursor position 2 (end of "AB") will be
 * incorrectly positioned at position 1 (end of "B" in the Doc model).
 */
describe("split text cursor positioning", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.fontFamily = "monospace";
    container.style.fontSize = "16px";
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  test("cursor at end of line with two text nodes", () => {
    // Simulate a line rendered with two text nodes: "A" and "B"
    // This is what happens with list markers rendered separately from content
    const line = document.createElement("div");
    line.setAttribute("data-line-index", "0");

    const textNodeA = document.createTextNode("A");
    const textNodeB = document.createTextNode("B");
    line.appendChild(textNodeA);
    line.appendChild(textNodeB);

    container.appendChild(line);

    // The DOM has "AB" (2 characters)
    expect(line.textContent).toBe("AB");

    // Create a Doc that only knows about "B" (simulating the current list bug)
    const docWithPartialText: Doc = {
      type: "doc",
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "B" }],
        },
      ],
    };

    // Create a Doc that knows about "AB" (the correct behavior)
    const docWithFullText: Doc = {
      type: "doc",
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "AB" }],
        },
      ],
    };

    // Get line info from both docs
    const linesPartial = getDocLines(docWithPartialText);
    const linesFull = getDocLines(docWithFullText);

    // Partial doc thinks line is "B" (1 char)
    expect(linesPartial[0].text).toBe("B");
    expect(linesPartial[0].cursorLength).toBe(1);
    expect(linesPartial[0].cursorToCodeUnit).toEqual([0, 1]);

    // Full doc correctly knows line is "AB" (2 chars)
    expect(linesFull[0].text).toBe("AB");
    expect(linesFull[0].cursorLength).toBe(2);
    expect(linesFull[0].cursorToCodeUnit).toEqual([0, 1, 2]);

    // Now test cursor positioning at "end of line" (cursor position 2)
    const cursorPosition = 2;

    // With partial doc: cursor 2 gets clamped to cursorToCodeUnit.length - 1 = 1
    const codeUnitPartial = cursorOffsetToDomOffset(
      linesPartial[0].cursorToCodeUnit,
      cursorPosition,
    );
    expect(codeUnitPartial).toBe(1); // WRONG: should be 2

    // With full doc: cursor 2 maps to code unit 2
    const codeUnitFull = cursorOffsetToDomOffset(
      linesFull[0].cursorToCodeUnit,
      cursorPosition,
    );
    expect(codeUnitFull).toBe(2); // CORRECT

    // Now resolve DOM positions
    const posPartial = resolveDomPosition(line, codeUnitPartial);
    const posFull = resolveDomPosition(line, codeUnitFull);

    // Partial: code unit 1 lands in textNodeA at offset 1 (end of "A")
    // But we wanted end of "AB"!
    expect(posPartial.node).toBe(textNodeA);
    expect(posPartial.offset).toBe(1);

    // Full: code unit 2 lands in textNodeB at offset 1 (end of "B", which is end of "AB")
    expect(posFull.node).toBe(textNodeB);
    expect(posFull.offset).toBe(1);

    // Measure actual pixel positions to show the visual difference
    const rangePartial = document.createRange();
    rangePartial.setStart(posPartial.node, posPartial.offset);
    rangePartial.setEnd(posPartial.node, posPartial.offset);
    const rectPartial = rangePartial.getBoundingClientRect();

    const rangeFull = document.createRange();
    rangeFull.setStart(posFull.node, posFull.offset);
    rangeFull.setEnd(posFull.node, posFull.offset);
    const rectFull = rangeFull.getBoundingClientRect();

    // The partial position should be to the LEFT of the full position
    // (off by ~1 character width)
    expect(rectPartial.left).toBeLessThan(rectFull.left);

    // Log the difference for debugging
    console.log("Partial (wrong) caret x:", rectPartial.left);
    console.log("Full (correct) caret x:", rectFull.left);
    console.log("Difference:", rectFull.left - rectPartial.left);
  });

  test("cursor navigation through line with prefix", () => {
    // Simulate "- hello" rendered as two nodes: "- " and "hello"
    const line = document.createElement("div");
    line.setAttribute("data-line-index", "0");

    const prefixNode = document.createTextNode("- ");
    const contentNode = document.createTextNode("hello");
    line.appendChild(prefixNode);
    line.appendChild(contentNode);

    container.appendChild(line);

    expect(line.textContent).toBe("- hello");

    // Doc that only knows "hello" (current buggy behavior)
    const docBuggy: Doc = {
      type: "doc",
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hello" }],
        },
      ],
    };

    // Doc that knows "- hello" (correct behavior)
    const docCorrect: Doc = {
      type: "doc",
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "- hello" }],
        },
      ],
    };

    const linesBuggy = getDocLines(docBuggy);
    const linesCorrect = getDocLines(docCorrect);

    // Test cursor at position 7 (end of "- hello")
    const cursorAtEnd = 7;

    // Buggy: cursorToCodeUnit only has 6 entries [0,1,2,3,4,5], cursor 7 clamps to 5
    const codeUnitBuggy = cursorOffsetToDomOffset(
      linesBuggy[0].cursorToCodeUnit,
      cursorAtEnd,
    );
    // cursorToCodeUnit.length is 6, so max index is 5, cursor 7 clamps to 5
    expect(codeUnitBuggy).toBe(5);

    // Correct: cursorToCodeUnit has 8 entries [0,1,2,3,4,5,6,7], cursor 7 maps to 7
    const codeUnitCorrect = cursorOffsetToDomOffset(
      linesCorrect[0].cursorToCodeUnit,
      cursorAtEnd,
    );
    expect(codeUnitCorrect).toBe(7);

    // Resolve positions
    const posBuggy = resolveDomPosition(line, codeUnitBuggy);
    const posCorrect = resolveDomPosition(line, codeUnitCorrect);

    // Buggy: code unit 5 = "- " (2) + "hel" (3) = position 3 in contentNode
    // That's after "hel", not after "hello"
    expect(posBuggy.node).toBe(contentNode);
    expect(posBuggy.offset).toBe(3); // Wrong! Should be 5 (end of "hello")

    // Correct: code unit 7 = "- " (2) + "hello" (5) = position 5 in contentNode
    expect(posCorrect.node).toBe(contentNode);
    expect(posCorrect.offset).toBe(5); // Correct!

    // Visual verification
    const rangeBuggy = document.createRange();
    rangeBuggy.setStart(posBuggy.node, posBuggy.offset);
    rangeBuggy.setEnd(posBuggy.node, posBuggy.offset);

    const rangeCorrect = document.createRange();
    rangeCorrect.setStart(posCorrect.node, posCorrect.offset);
    rangeCorrect.setEnd(posCorrect.node, posCorrect.offset);

    const rectBuggy = rangeBuggy.getBoundingClientRect();
    const rectCorrect = rangeCorrect.getBoundingClientRect();

    // Buggy position is ~2 characters to the left of correct position
    expect(rectBuggy.left).toBeLessThan(rectCorrect.left);

    console.log("Buggy caret x:", rectBuggy.left);
    console.log("Correct caret x:", rectCorrect.left);
    console.log(
      "Offset (should be ~2 char widths):",
      rectCorrect.left - rectBuggy.left,
    );
  });
});
