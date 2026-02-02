import { describe, expect, it } from "vitest";
import { CursorSourceBuilder } from "./cursor-source-map";

function assertMonotonic(values: number[]): void {
  for (let i = 1; i < values.length; i += 1) {
    expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  }
}

describe("CursorSourceMap", () => {
  it("tracks source-only gaps and cursor boundaries", () => {
    const builder = new CursorSourceBuilder();
    builder.appendSourceOnly("**");
    builder.appendText("ab");
    builder.appendSourceOnly("**");
    const { source, map } = builder.build();

    expect(source).toBe("**ab**");
    expect(map.cursorLength).toBe(2);
    expect(map.boundaries.length).toBe(map.cursorLength + 1);

    const backwardValues = map.boundaries.map(
      (boundary) => boundary.sourceBackward,
    );
    const forwardValues = map.boundaries.map(
      (boundary) => boundary.sourceForward,
    );

    assertMonotonic(backwardValues);
    assertMonotonic(forwardValues);

    map.boundaries.forEach((boundary) => {
      expect(boundary.sourceBackward).toBeGreaterThanOrEqual(0);
      expect(boundary.sourceBackward).toBeLessThanOrEqual(
        boundary.sourceForward,
      );
      expect(boundary.sourceForward).toBeLessThanOrEqual(source.length);
    });

    expect(map.cursorToSource(2, "backward")).toBe(4);
    expect(map.cursorToSource(2, "forward")).toBe(6);

    const mapped = map.sourceToCursor(5, "backward");
    expect(mapped.cursorOffset).toBe(2);
    expect(mapped.affinity).toBe("backward");
  });

  it("preserves boundary side when mapping a source offset that lands on a source-only span edge", () => {
    const builder = new CursorSourceBuilder();
    builder.appendSourceOnly("**");
    builder.appendText("a");
    builder.appendSourceOnly("**");
    const { map } = builder.build();

    // Cursor after "a" has a source-only close span:
    // - sourceBackward points before the close markers
    // - sourceForward points after the close markers
    expect(map.boundaries[1]).toEqual({ sourceBackward: 3, sourceForward: 5 });

    // Snap to the correct boundary side, regardless of bias.
    expect(map.sourceToCursor(3, "forward")).toEqual({
      cursorOffset: 1,
      affinity: "backward",
    });
    expect(map.sourceToCursor(3, "backward")).toEqual({
      cursorOffset: 1,
      affinity: "backward",
    });
    expect(map.sourceToCursor(5, "forward")).toEqual({
      cursorOffset: 1,
      affinity: "forward",
    });
    expect(map.sourceToCursor(5, "backward")).toEqual({
      cursorOffset: 1,
      affinity: "forward",
    });
  });
});
