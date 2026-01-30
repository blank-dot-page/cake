import { describe, it, expect, afterEach } from "vitest";
import { measureLayoutModelFromDom } from "./selection-layout-dom";
import type { LineInfo } from "./selection-layout";

function buildCursorToCodeUnit(text: string): number[] {
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

describe("Layout measurement performance", () => {
  let container: HTMLDivElement | null = null;
  let originalCreateRange: (() => Range) | null = null;

  afterEach(() => {
    if (originalCreateRange) {
      document.createRange = originalCreateRange;
      originalCreateRange = null;
    }
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
  });

  it("does not probe every character for long wrapped lines", () => {
    container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 1000px;
      font-family: "Courier New", monospace;
      font-size: 16px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    `;
    document.body.appendChild(container);

    const lineDiv = document.createElement("div");
    lineDiv.setAttribute("data-line-index", "0");
    const text = "d".repeat(24_000);
    lineDiv.textContent = text;
    container.appendChild(lineDiv);

    let createRangeCalls = 0;
    originalCreateRange = document.createRange.bind(document);
    document.createRange = () => {
      createRangeCalls += 1;
      return originalCreateRange!();
    };

    const layout = measureLayoutModelFromDom({
      lines: [createLineInfo(text, 0)],
      root: container,
      container,
    });

    expect(layout).not.toBeNull();
    expect(layout!.lines[0].rows.length).toBeGreaterThan(1);
    // Guard against accidental O(n) scans (which would be ~24k+ calls).
    expect(createRangeCalls).toBeLessThan(12_000);
  });
});
