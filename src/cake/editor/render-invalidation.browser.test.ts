import { describe, expect, it } from "vitest";
import type { CakeExtension } from "./extension-types";
import { createTestHarness } from "../test/harness";

describe("render invalidation", () => {
  it("exposes cursor offsets to DOM inline renderers", () => {
    const cursorOffsets: number[] = [];
    const captureOffsets: CakeExtension = (editor) => {
      return editor.registerInlineRenderer((inline, context) => {
        if (inline.type === "text") {
          cursorOffsets.push(context.getCursorOffset());
        }
        return null;
      });
    };

    const harness = createTestHarness({
      value: "ab\nc",
      extensions: [captureOffsets],
    });

    expect(cursorOffsets).toEqual([0, 3]);

    harness.destroy();
  });

  it("force-renders managed text nodes back to canonical source", () => {
    const harness = createTestHarness("hello");
    const textNode = harness.getTextNode(0);

    textNode.textContent = "HELLO";
    expect(harness.getLine(0).textContent).toBe("HELLO");

    harness.engine.invalidateRender();

    expect(harness.getLine(0).textContent).toBe("hello");

    harness.destroy();
  });
});
