import { describe, test, expect, afterEach } from "vitest";
import { createTestHarness, type TestHarness } from "../../test/harness";
import { bundledExtensions } from "../index";

const mod =
  typeof navigator !== "undefined" &&
  typeof navigator.platform === "string" &&
  navigator.platform.toLowerCase().includes("mac")
    ? { meta: true }
    : { ctrl: true };

describe("bold toggle in heading", () => {
  let harness: TestHarness;

  afterEach(() => {
    harness?.destroy();
  });

  test("toggle bold off when selection includes trailing newline", async () => {
    harness = createTestHarness({
      value: "# **title**\n",
      extensions: bundledExtensions,
    });

    await harness.clickLeftOf(0, 0);
    for (let i = 0; i < 6; i += 1) {
      await harness.pressKey("ArrowRight", { shift: true });
    }

    await harness.pressKey("b", mod);

    expect(harness.engine.getValue()).toBe("# title\n");
  });
});
