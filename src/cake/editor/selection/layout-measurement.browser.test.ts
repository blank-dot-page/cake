import { describe, it, expect, afterEach } from "vitest";
import { measureLayoutModelFromDom } from "./selection-layout-dom";
import type { LineInfo } from "./selection-layout";
import { getCaretRect } from "./selection-geometry-dom";

function buildCursorToCodeUnit(text: string): number[] {
  // For ASCII text, cursor positions map 1:1 with code units
  const mapping: number[] = [];
  for (let i = 0; i <= text.length; i++) {
    mapping.push(i);
  }
  return mapping;
}

function createLineInfo(text: string, lineIndex: number): LineInfo {
  const cursorToCodeUnit = buildCursorToCodeUnit(text);
  return {
    lineIndex,
    text,
    cursorLength: text.length,
    hasNewline: false,
    cursorToCodeUnit,
    isAtomic: false,
  };
}

function measureActualRowBoundaries(
  textNode: Text,
): { startOffset: number; endOffset: number; top: number }[] {
  const text = textNode.data;
  if (text.length === 0) return [];

  const rows: { startOffset: number; endOffset: number; top: number }[] = [];
  let currentRowTop: number | null = null;
  let currentRowStart = 0;

  for (let i = 0; i < text.length; i++) {
    const range = document.createRange();
    range.setStart(textNode, i);
    range.setEnd(textNode, i + 1);
    // Prefer `getClientRects()` because `getBoundingClientRect()` can span
    // multiple rows at wrap boundaries and WebKit can emit zero-width fragments.
    const rects = Array.from(range.getClientRects());
    let rect: DOMRect;
    if (rects.length > 0) {
      let best = rects[0]!;
      let bestArea = best.width * best.height;
      for (const r of rects) {
        const area = r.width * r.height;
        if (area > bestArea) {
          best = r;
          bestArea = area;
        }
      }
      // If the best rect is degenerate, fall back to bounding rect, and if that's
      // also degenerate, skip this character.
      if (bestArea > 0) {
        rect = best;
      } else {
        rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          continue;
        }
      }
    } else {
      rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        continue;
      }
    }

    if (currentRowTop === null) {
      currentRowTop = rect.top;
      currentRowStart = i;
    } else if (Math.abs(rect.top - currentRowTop) > 3) {
      // New row detected
      // endOffset is the boundary position (cursor position after last char)
      // which equals the next row's startOffset
      rows.push({
        startOffset: currentRowStart,
        endOffset: i,
        top: currentRowTop,
      });
      currentRowTop = rect.top;
      currentRowStart = i;
    }
  }

  // Push final row - endOffset is the text length (cursor position at end)
  if (currentRowTop !== null) {
    rows.push({
      startOffset: currentRowStart,
      endOffset: text.length,
      top: currentRowTop,
    });
  }

  return rows;
}

describe("Layout measurement with variable-width fonts", () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
  });

  it("measures row boundaries correctly for monospace font", () => {
    // Setup: monospace font, should work correctly
    container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 200px;
      font-family: "Courier New", monospace;
      font-size: 16px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    document.body.appendChild(container);

    const lineDiv = document.createElement("div");
    lineDiv.setAttribute("data-line-index", "0");
    const text = "d".repeat(50); // Long enough to wrap
    lineDiv.textContent = text;
    container.appendChild(lineDiv);

    const textNode = lineDiv.firstChild as Text;
    const actualRows = measureActualRowBoundaries(textNode);

    console.log("=== MONOSPACE FONT TEST ===");
    console.log("Text length:", text.length);
    console.log("Actual rows from DOM:", actualRows);

    const lines = [createLineInfo(text, 0)];
    const layout = measureLayoutModelFromDom({
      lines,
      root: container,
      container,
    });

    console.log(
      "Measured rows from layout model:",
      layout?.lines[0]?.rows.map((r) => ({
        startOffset: r.startOffset,
        endOffset: r.endOffset,
      })),
    );

    expect(layout).not.toBeNull();
    expect(layout!.lines[0].rows.length).toBe(actualRows.length);

    // Check each row's boundaries match
    for (let i = 0; i < actualRows.length; i++) {
      const actual = actualRows[i];
      const measured = layout!.lines[0].rows[i];
      console.log(
        `Row ${i}: actual [${actual.startOffset}-${actual.endOffset}], measured [${measured.startOffset}-${measured.endOffset}]`,
      );
      expect(measured.startOffset).toBe(actual.startOffset);
      // Allow endOffset to be off by 1 due to how we count
      expect(
        Math.abs(measured.endOffset - actual.endOffset),
      ).toBeLessThanOrEqual(1);
    }
  });

  it("measures row boundaries correctly for variable-width font", () => {
    // Setup: variable-width font - this is where the bug shows
    container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 200px;
      font-family: "Times New Roman", serif;
      font-size: 16px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    document.body.appendChild(container);

    const lineDiv = document.createElement("div");
    lineDiv.setAttribute("data-line-index", "0");
    // Use text with varying character widths
    const text = "iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii"; // 50 i's - narrow chars
    lineDiv.textContent = text;
    container.appendChild(lineDiv);

    const textNode = lineDiv.firstChild as Text;
    const actualRows = measureActualRowBoundaries(textNode);

    console.log("=== VARIABLE WIDTH FONT (narrow chars) TEST ===");
    console.log("Text length:", text.length);
    console.log("Actual rows from DOM:", actualRows);

    const lines = [createLineInfo(text, 0)];
    const layout = measureLayoutModelFromDom({
      lines,
      root: container,
      container,
    });

    console.log(
      "Measured rows from layout model:",
      layout?.lines[0]?.rows.map((r) => ({
        startOffset: r.startOffset,
        endOffset: r.endOffset,
      })),
    );

    expect(layout).not.toBeNull();

    // This is where we expect the bug to show:
    // The layout model estimates row length based on first char width,
    // but 'i' is narrow so more chars fit per row than estimated
    console.log(
      `Expected ${actualRows.length} rows, got ${layout!.lines[0].rows.length}`,
    );

    // For now, just document the discrepancy
    if (layout!.lines[0].rows.length !== actualRows.length) {
      console.log("BUG CONFIRMED: Row count mismatch with variable-width font");
    }

    // Check first row boundaries
    const actual0 = actualRows[0];
    const measured0 = layout!.lines[0].rows[0];
    console.log(
      `First row: actual [${actual0.startOffset}-${actual0.endOffset}], measured [${measured0.startOffset}-${measured0.endOffset}]`,
    );

    // This assertion will likely fail, demonstrating the bug
    expect(measured0.endOffset).toBe(actual0.endOffset);
  });

  it("measures row boundaries with mixed character widths", () => {
    container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 200px;
      font-family: "Times New Roman", serif;
      font-size: 16px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    document.body.appendChild(container);

    const lineDiv = document.createElement("div");
    lineDiv.setAttribute("data-line-index", "0");
    // Start with wide char, then narrow chars
    const text = "W" + "i".repeat(49);
    lineDiv.textContent = text;
    container.appendChild(lineDiv);

    const textNode = lineDiv.firstChild as Text;
    const actualRows = measureActualRowBoundaries(textNode);

    console.log("=== MIXED WIDTH CHARS TEST ===");
    console.log("Text:", text.substring(0, 20) + "...");
    console.log("Actual rows from DOM:", actualRows);

    const lines = [createLineInfo(text, 0)];
    const layout = measureLayoutModelFromDom({
      lines,
      root: container,
      container,
    });

    console.log(
      "Measured rows from layout model:",
      layout?.lines[0]?.rows.map((r) => ({
        startOffset: r.startOffset,
        endOffset: r.endOffset,
      })),
    );

    // The bug: first char 'W' is wide, so charWidth is large.
    // But the rest are 'i' (narrow), so the estimate will be way off.
    const actual0 = actualRows[0];
    const measured0 = layout!.lines[0].rows[0];

    console.log(
      `First row: actual endOffset=${actual0.endOffset}, measured endOffset=${measured0.endOffset}`,
    );
    console.log(
      `Difference: ${measured0.endOffset - actual0.endOffset} characters`,
    );

    // Document the expected failure
    expect(measured0.endOffset).toBe(actual0.endOffset);
  });

  it("row rect.top values match caret positions with line-height: 2", () => {
    // This tests whether row.rect.top aligns with where the caret would be
    // The bug: with line-height: 2, there's extra spacing and row.rect.top
    // might not match the caret's top position
    container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 300px;
      font-family: monospace;
      font-size: 16px;
      line-height: 2;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    document.body.appendChild(container);

    const lineDiv = document.createElement("div");
    lineDiv.setAttribute("data-line-index", "0");
    const text = "This is a fairly long line that will wrap into two rows";
    lineDiv.textContent = text;
    container.appendChild(lineDiv);

    const textNode = lineDiv.firstChild as Text;
    const actualRows = measureActualRowBoundaries(textNode);

    console.log("=== LINE-HEIGHT: 2 TEST ===");
    console.log("Text:", text);
    console.log("Actual rows from DOM:", actualRows);

    const lines = [createLineInfo(text, 0)];
    const layout = measureLayoutModelFromDom({
      lines,
      root: container,
      container,
    });

    console.log(
      "Measured rows:",
      layout?.lines[0]?.rows.map((r) => ({
        startOffset: r.startOffset,
        endOffset: r.endOffset,
        rectTop: r.rect.top,
      })),
    );

    expect(layout).not.toBeNull();
    expect(layout!.lines[0].rows.length).toBeGreaterThanOrEqual(2);

    // Now simulate what happens when we position caret at end of first row
    // and check if the caret Y matches row.rect.top.
    //
    // NOTE: At wrap boundaries, engines differ in what a *collapsed* DOM range
    // reports. Use our affinity-aware caret measurement instead of relying on
    // `Range.getBoundingClientRect()` semantics.
    const firstRowEndOffset = layout!.lines[0].rows[0].endOffset;
    const caret = getCaretRect({
      lineElement: lineDiv,
      lineInfo: lines[0]!,
      offsetInLine: firstRowEndOffset,
      affinity: "backward",
    });
    expect(caret).not.toBeNull();
    const caretRect = caret!.rect;

    console.log("Caret at end of first row:");
    console.log("  offset:", firstRowEndOffset);
    console.log("  caretRect.top:", caretRect.top);
    console.log("  row[0].rect.top:", layout!.lines[0].rows[0].rect.top);
    console.log("  row[1].rect.top:", layout!.lines[0].rows[1].rect.top);

    // The key question: does the caret Y match row[0].rect.top?
    // Or does it match row[1].rect.top? (which would cause the bug)
    const distanceToRow0 = Math.abs(
      caretRect.top - layout!.lines[0].rows[0].rect.top,
    );
    const distanceToRow1 = Math.abs(
      caretRect.top - layout!.lines[0].rows[1].rect.top,
    );

    console.log("Distance to row 0:", distanceToRow0);
    console.log("Distance to row 1:", distanceToRow1);
    console.log(
      "Closest row:",
      distanceToRow0 < distanceToRow1 ? "row 0 (correct)" : "row 1 (BUG!)",
    );

    // The caret should be closer to row 0
    expect(distanceToRow0).toBeLessThan(distanceToRow1);
  });

  it("row rect.top matches caret position at row BOUNDARY with line-height: 2", () => {
    // Test the exact boundary between rows - this is where the bug might occur
    // At offset 32 (end of row 0 / start of row 1), the caret could be on either row
    // depending on affinity and how the browser reports the position
    container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 300px;
      font-family: monospace;
      font-size: 16px;
      line-height: 2;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    document.body.appendChild(container);

    const lineDiv = document.createElement("div");
    lineDiv.setAttribute("data-line-index", "0");
    const text = "This is a fairly long line that will wrap into two rows";
    lineDiv.textContent = text;
    container.appendChild(lineDiv);

    const textNode = lineDiv.firstChild as Text;

    const lines = [createLineInfo(text, 0)];
    const layout = measureLayoutModelFromDom({
      lines,
      root: container,
      container,
    });

    expect(layout).not.toBeNull();
    expect(layout!.lines[0].rows.length).toBeGreaterThanOrEqual(2);

    const boundaryOffset = layout!.lines[0].rows[0].endOffset;
    console.log("=== ROW BOUNDARY TEST (line-height: 2) ===");
    console.log("Boundary offset:", boundaryOffset);

    const forwardCaret = getCaretRect({
      lineElement: lineDiv,
      lineInfo: lines[0]!,
      offsetInLine: boundaryOffset,
      affinity: "forward",
    });
    const backwardCaret = getCaretRect({
      lineElement: lineDiv,
      lineInfo: lines[0]!,
      offsetInLine: boundaryOffset,
      affinity: "backward",
    });
    expect(forwardCaret).not.toBeNull();
    expect(backwardCaret).not.toBeNull();
    const forwardRect = forwardCaret!.rect;
    const backwardRect = backwardCaret!.rect;

    console.log("Forward caret at boundary:");
    console.log("  rect.top:", forwardRect.top);
    console.log("Backward caret at boundary (right edge of prev char):");
    console.log("  rect.top:", backwardRect?.top);
    console.log("Row 0 rect.top:", layout!.lines[0].rows[0].rect.top);
    console.log("Row 1 rect.top:", layout!.lines[0].rows[1].rect.top);

    // Check which row the forward caret would match
    const forwardDistToRow0 = Math.abs(
      forwardRect.top - layout!.lines[0].rows[0].rect.top,
    );
    const forwardDistToRow1 = Math.abs(
      forwardRect.top - layout!.lines[0].rows[1].rect.top,
    );
    console.log("Forward caret distance to row 0:", forwardDistToRow0);
    console.log("Forward caret distance to row 1:", forwardDistToRow1);
    console.log(
      "Forward caret closest to:",
      forwardDistToRow0 < forwardDistToRow1 ? "row 0" : "row 1",
    );

    const backwardDistToRow0 = Math.abs(
      backwardRect.top - layout!.lines[0].rows[0].rect.top,
    );
    const backwardDistToRow1 = Math.abs(
      backwardRect.top - layout!.lines[0].rows[1].rect.top,
    );
    console.log("Backward caret distance to row 0:", backwardDistToRow0);
    console.log("Backward caret distance to row 1:", backwardDistToRow1);

    // At a wrap boundary, the same logical offset can represent either the end
    // of the previous visual row ("backward" affinity) or the start of the next
    // ("forward" affinity).
    expect(backwardDistToRow0).toBeLessThanOrEqual(backwardDistToRow1);
    expect(forwardDistToRow1).toBeLessThanOrEqual(forwardDistToRow0);
  });
});

describe("Layout model row bounds never overlap", () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
  });

  function assertNoRowOverlap(
    rows: Array<{ rect: { top: number; height: number } }>,
    testName: string,
  ) {
    for (let i = 0; i < rows.length - 1; i++) {
      const current = rows[i];
      const next = rows[i + 1];
      const currentBottom = current.rect.top + current.rect.height;
      const nextBottom = next.rect.top + next.rect.height;

      console.log(
        `${testName} - Row ${i}: top=${current.rect.top}, bottom=${currentBottom}`,
      );
      console.log(
        `${testName} - Row ${i + 1}: top=${next.rect.top}, bottom=${nextBottom}`,
      );

      // Row i's bottom should be <= Row i+1's top (no overlap)
      expect(currentBottom).toBeLessThanOrEqual(next.rect.top);
    }
  }

  it("rows do not overlap with line-height: 1", () => {
    container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 200px;
      font-family: monospace;
      font-size: 16px;
      line-height: 1;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    document.body.appendChild(container);

    const lineDiv = document.createElement("div");
    lineDiv.setAttribute("data-line-index", "0");
    const text = "d".repeat(100);
    lineDiv.textContent = text;
    container.appendChild(lineDiv);

    const lines = [createLineInfo(text, 0)];
    const layout = measureLayoutModelFromDom({
      lines,
      root: container,
      container,
    });

    expect(layout).not.toBeNull();
    expect(layout!.lines[0].rows.length).toBeGreaterThanOrEqual(2);

    assertNoRowOverlap(layout!.lines[0].rows, "line-height: 1");
  });

  it("rows do not overlap with line-height: 1.5", () => {
    container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 200px;
      font-family: monospace;
      font-size: 16px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    document.body.appendChild(container);

    const lineDiv = document.createElement("div");
    lineDiv.setAttribute("data-line-index", "0");
    const text = "d".repeat(100);
    lineDiv.textContent = text;
    container.appendChild(lineDiv);

    const lines = [createLineInfo(text, 0)];
    const layout = measureLayoutModelFromDom({
      lines,
      root: container,
      container,
    });

    expect(layout).not.toBeNull();
    expect(layout!.lines[0].rows.length).toBeGreaterThanOrEqual(2);

    assertNoRowOverlap(layout!.lines[0].rows, "line-height: 1.5");
  });

  it("rows do not overlap with line-height: 2", () => {
    container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 200px;
      font-family: monospace;
      font-size: 16px;
      line-height: 2;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    document.body.appendChild(container);

    const lineDiv = document.createElement("div");
    lineDiv.setAttribute("data-line-index", "0");
    const text = "d".repeat(100);
    lineDiv.textContent = text;
    container.appendChild(lineDiv);

    const lines = [createLineInfo(text, 0)];
    const layout = measureLayoutModelFromDom({
      lines,
      root: container,
      container,
    });

    expect(layout).not.toBeNull();
    expect(layout!.lines[0].rows.length).toBeGreaterThanOrEqual(2);

    assertNoRowOverlap(layout!.lines[0].rows, "line-height: 2");
  });

  it("rows do not overlap with padding on container", () => {
    container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 200px;
      padding: 20px;
      font-family: monospace;
      font-size: 16px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    document.body.appendChild(container);

    const lineDiv = document.createElement("div");
    lineDiv.setAttribute("data-line-index", "0");
    const text = "d".repeat(100);
    lineDiv.textContent = text;
    container.appendChild(lineDiv);

    const lines = [createLineInfo(text, 0)];
    const layout = measureLayoutModelFromDom({
      lines,
      root: container,
      container,
    });

    expect(layout).not.toBeNull();
    expect(layout!.lines[0].rows.length).toBeGreaterThanOrEqual(2);

    assertNoRowOverlap(layout!.lines[0].rows, "with padding");
  });

  it("rows do not overlap with variable-width font", () => {
    container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 200px;
      font-family: "Times New Roman", serif;
      font-size: 16px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    document.body.appendChild(container);

    const lineDiv = document.createElement("div");
    lineDiv.setAttribute("data-line-index", "0");
    const text = "The quick brown fox jumps over the lazy dog repeatedly";
    lineDiv.textContent = text;
    container.appendChild(lineDiv);

    const lines = [createLineInfo(text, 0)];
    const layout = measureLayoutModelFromDom({
      lines,
      root: container,
      container,
    });

    expect(layout).not.toBeNull();
    expect(layout!.lines[0].rows.length).toBeGreaterThanOrEqual(2);

    assertNoRowOverlap(layout!.lines[0].rows, "variable-width font");
  });
});
