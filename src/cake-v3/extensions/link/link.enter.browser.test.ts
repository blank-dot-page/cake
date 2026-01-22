import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createTestHarness, type TestHarness } from "../../test/harness";

describe("link extension editing", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
    document.body.innerHTML = "";
  });

  it("pressing Enter after link text inserts a new line after the full markdown link", async () => {
    harness = createTestHarness("[hello](http://localhost:3000/)\nother text");

    await harness.clickRightOf(4, 0);
    await harness.pressEnter();

    expect(harness.engine.getValue()).toBe(
      "[hello](http://localhost:3000/)\n\nother text",
    );
  });

  it("pressing Enter after link text in a list item does not split the markdown link syntax", async () => {
    harness = createTestHarness(
      "- [hello](http://localhost:3000/)\nother text",
    );

    const link = harness.container.querySelector("a.cake-link");
    expect(link).not.toBeNull();
    const rect = link!.getBoundingClientRect();
    await harness.clickAtCoords(rect.right + 2, rect.top + rect.height / 2);
    await harness.pressEnter();

    expect(harness.engine.getValue()).toBe(
      "- [hello](http://localhost:3000/)\n- \nother text",
    );
  });

  it("Cmd+Backspace at link content start does not delete the '[' marker", async () => {
    harness = createTestHarness("[hello](http://localhost:3000/)\nother text");

    // Vitest browser runs in Chromium with a non-mac `navigator.platform` by
    // default; force the mac shortcut path for Cmd+Backspace.
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });

    // Click at the start of link text ("hello").
    await harness.clickLeftOf(0, 0);
    expect(harness.selection).toEqual(
      expect.objectContaining({ start: 0, end: 0 }),
    );

    // Reported bug: Cmd+Backspace deletes the source-only "[" marker.
    await userEvent.keyboard("{Meta>}{Backspace}{/Meta}");

    // Expected: at document start, Cmd+Backspace should not corrupt link syntax.
    expect(harness.engine.getValue()).toBe(
      "[hello](http://localhost:3000/)\nother text",
    );
  });

  it("pressing Backspace at list content start does not corrupt markdown link syntax", async () => {
    harness = createTestHarness(
      "- [hello](http://localhost:3000/)\nother text",
    );

    // Click right of the list marker space (between "- " and "hello").
    // This is an ambiguous cursor boundary because "[" is source-only.
    await harness.clickRightOf(1, 0);

    // Use the real keyboard path (keydown + beforeinput + input), since the
    // reported bug happens via physical Backspace.
    await userEvent.keyboard("{Backspace}");

    // Expected behavior: removing list formatting should keep the link intact.
    expect(harness.engine.getValue()).toBe(
      "[hello](http://localhost:3000/)\nother text",
    );
  });

  it("Cmd+Backspace at list content start does not delete the '[' marker", async () => {
    harness = createTestHarness(
      "- [hello](http://localhost:3000/)\nother text",
    );

    // Vitest browser runs in Chromium with a non-mac `navigator.platform` by
    // default; force the mac shortcut path for Cmd+Backspace.
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });

    // Repro steps:
    // - Start at doc start
    // - ArrowRight twice: caret between "- " and the link text
    // - Cmd+Backspace: should remove list marker but keep link markdown intact
    await harness.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(harness.selection).toEqual(
      expect.objectContaining({ start: 2, end: 2 }),
    );

    await userEvent.keyboard("{Meta>}{Backspace}{/Meta}");

    expect(harness.engine.getValue()).toBe(
      "[hello](http://localhost:3000/)\nother text",
    );
  });
});
