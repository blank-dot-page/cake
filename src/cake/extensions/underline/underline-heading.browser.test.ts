import { describe, test, expect, afterEach } from "vitest";
import { createTestHarness, type TestHarness } from "../../test/harness";
import { bundledExtensions } from "../index";

const mod =
  typeof navigator !== "undefined" &&
  typeof navigator.platform === "string" &&
  navigator.platform.toLowerCase().includes("mac")
    ? { meta: true }
    : { ctrl: true };

describe("underline in heading", () => {
  let harness: TestHarness;

  afterEach(() => {
    harness?.destroy();
  });

  test("triple-click to select heading line then toggle underline", async () => {
    harness = createTestHarness({
      value: "# title",
      extensions: bundledExtensions,
    });

    await harness.tripleClick(0);

    await harness.pressKey("u", mod);

    // Should wrap the title text in underline, not the whole line including #
    expect(harness.engine.getValue()).toBe("# <u>title</u>");
  });

  test("triple-click heading with multiple words then toggle underline", async () => {
    harness = createTestHarness({
      value: "# hello world",
      extensions: bundledExtensions,
    });

    await harness.tripleClick(0);
    await harness.pressKey("u", mod);

    expect(harness.engine.getValue()).toBe("# <u>hello world</u>");
  });

  test("select heading text with keyboard then toggle underline", async () => {
    harness = createTestHarness({
      value: "# title",
      extensions: bundledExtensions,
    });

    await harness.clickLeftOf(0, 0);
    for (let i = 0; i < 5; i += 1) {
      await harness.pressKey("ArrowRight", { shift: true });
    }
    await harness.pressKey("u", mod);

    expect(harness.engine.getValue()).toBe("# <u>title</u>");
  });

  test("toggle underline on, then toggle off without changing selection", async () => {
    harness = createTestHarness({
      value: "# title",
      extensions: bundledExtensions,
    });

    // Triple-click to select the whole line
    await harness.tripleClick(0);

    await harness.pressKey("u", mod);

    expect(harness.engine.getValue()).toBe("# <u>title</u>");

    // Without changing selection, toggle underline OFF
    await harness.pressKey("u", mod);

    expect(harness.engine.getValue()).toBe("# title");
  });

  test("toggle underline on/off with empty line after heading via keyboard selection", async () => {
    harness = createTestHarness({
      value: "# title\n",
      extensions: bundledExtensions,
    });

    await harness.clickLeftOf(0, 0);
    for (let i = 0; i < 6; i += 1) {
      await harness.pressKey("ArrowRight", { shift: true });
    }

    // Toggle underline ON
    await harness.pressKey("u", mod);
    expect(harness.engine.getValue()).toBe("# <u>title</u>\n");

    // Without changing selection, toggle underline OFF
    await harness.pressKey("u", mod);
    expect(harness.engine.getValue()).toBe("# title\n");
  });

  test("backspace on empty line after underlined heading deletes only the empty line", async () => {
    harness = createTestHarness({
      value: "# <u>title</u>\n",
      extensions: bundledExtensions,
    });

    const lineRect = harness.getLineRect(1);
    await harness.clickAtCoords(
      lineRect.left + 2,
      lineRect.top + lineRect.height / 2,
    );

    // Press backspace
    await harness.pressBackspace();

    // Should delete the empty line, leaving caret at end of title
    expect(harness.engine.getValue()).toBe("# <u>title</u>");
    expect(harness.engine.getSelection()).toEqual({
      start: 5,
      end: 5,
      affinity: "forward",
    });
  });
});
