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

    // Approximate the "visual row slot" by splitting the total line box height.
    // This includes line-height leading that is NOT covered by glyph rects.
    const rowCount = rows.length;
    const slotHeight = lineRect.height / rowCount;
    const slotTop = lineRect.top + slotHeight * 1; // second row
    const slotBottom = slotTop + slotHeight;

    const start = secondRow.startOffset;
    const endExclusive = secondRow.endOffset + 1;

    // Probe several offsets within the second row.
    const probeOffsets: number[] = [];
    for (let offset = start + 2; offset < endExclusive - 2; offset += 3) {
      probeOffsets.push(offset);
      if (probeOffsets.length >= 6) {
        break;
      }
    }
    expect(probeOffsets.length).toBeGreaterThan(0);

    for (const offset of probeOffsets) {
      const charRect = harness.getCharRect(offset);
      const x = charRect.left + charRect.width / 2;

      // 1) Click on the character itself (should obviously land on row 2).
      const yOnChar = charRect.top + charRect.height / 2;
      await harness.clickAtCoords(x, yOnChar);
      expect(harness.selection.start).toBeGreaterThanOrEqual(start);
      expect(harness.selection.start).toBeLessThanOrEqual(endExclusive);

      // 2) Click again at the same X but near the *top* of the row slot.
      // With large line-height, this can be in the leading area between visual rows.
      // This should still target row 2 (not snap back to row 1 end).
      const yInRowSlot = slotTop + 1;
      await harness.clickAtCoords(x, yInRowSlot);

      // Regression guard: selection must not jump back to end of row 1.
      expect(harness.selection.start).toBeGreaterThan(firstRow.endOffset + 1);
      expect(harness.selection.start).toBeGreaterThanOrEqual(start);
      expect(harness.selection.start).toBeLessThanOrEqual(endExclusive);
    }
  });
});
