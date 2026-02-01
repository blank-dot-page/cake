import { describe, it, expect, afterEach } from "vitest";
import { createTestHarness, type TestHarness } from "../test/harness";

describe("wrapped line click stability (desktop)", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  it("does not collapse to end of previous visual row when clicking in the second row's line-height area", async () => {
    harness = createTestHarness({
      value:
        "hello world this is a long line that should wrap across multiple visual rows in a narrow container",
      css: `
        .cake {
          font-family: monospace;
          font-size: 16px;
          line-height: 2;
        }

        .cake-content {
          width: 160px;
          white-space: pre-wrap;
          word-break: break-word;
          outline: none;
          caret-color: transparent;
        }

        .cake-line {
          display: block;
          min-height: 1em;
        }
      `,
    });
    await harness.focus();

    const lineRect = harness.getLineRect(0);
    expect(lineRect.height).toBeGreaterThan(40);

    const rows = harness.getVisualRows(0);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const firstRow = rows[0]!;
    const secondRow = rows[1]!;

    const contentRect = harness.contentRoot.getBoundingClientRect();

    // Derive the "line-height leading gap" between the last glyph on row 1 and
    // the first glyph on row 2 (matches the symptom described by the user).
    const firstCharRect = harness.getCharRect(0);
    const firstRowTop = firstCharRect.top;
    let lastCharOnFirstRow = 0;
    for (let i = 1; i < harness.engine.getText().length; i += 1) {
      const rect = harness.getCharRect(i);
      if (rect.top > firstRowTop + 5) {
        break;
      }
      lastCharOnFirstRow = i;
    }
    const lastCharRect = harness.getCharRect(lastCharOnFirstRow);
    const firstCharSecondRowIndex = lastCharOnFirstRow + 1;
    const firstCharSecondRowRect = harness.getCharRect(firstCharSecondRowIndex);
    const gap = firstCharSecondRowRect.top - lastCharRect.bottom;
    expect(gap).toBeGreaterThan(0);

    // Click in the lower part of the gap (closer to row 2). This should map to row 2.
    const y = lastCharRect.bottom + gap * 0.9;

    const start = secondRow.startOffset;
    const endExclusive = secondRow.endOffset + 1;

    // Click far to the right so that if the wrong row is chosen, we snap to the
    // end of that (wrong) row.
    const xs = [
      contentRect.right - 2,
      contentRect.right - 6,
      contentRect.right - 10,
      contentRect.right - 14,
      contentRect.right - 18,
    ];

    // Repeated clicks in this gap must consistently choose the second visual row.
    for (const x of xs) {
      await harness.clickAtCoords(x, y);
      expect(harness.selection.start).toBeGreaterThanOrEqual(start);
      expect(harness.selection.start).toBeLessThanOrEqual(endExclusive);
      expect(harness.selection.start).toBeGreaterThan(firstRow.endOffset + 1);
    }
  });
});
