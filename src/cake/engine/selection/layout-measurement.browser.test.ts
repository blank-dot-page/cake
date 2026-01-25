import { describe, it, expect, afterEach } from "vitest";
import { measureLayoutModelFromDom } from "./selection-layout-dom";
import type { LineInfo } from "./selection-layout";

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
    const rect = range.getBoundingClientRect();

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
      expect(Math.abs(measured.endOffset - actual.endOffset)).toBeLessThanOrEqual(1);
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
});
