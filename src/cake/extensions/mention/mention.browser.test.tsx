import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { createTestHarness, type TestHarness } from "../../test/harness";
import { mentionExtension } from "./mention";

afterEach(async () => {
  await cleanup();
});

describe("mentionExtension", () => {
  it("opens a popover under the caret when typing '@'", async () => {
    let harness: TestHarness | null = null;
    try {
      harness = createTestHarness({
        value: "",
        extensions: [
          mentionExtension({
            getItems: async () => [
              { id: "1", label: "Alice" },
              { id: "2", label: "Bob" },
            ],
          }),
        ],
        renderOverlays: true,
      });
      // Wait for React to commit overlay effects
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      await harness.focus();
      await harness.typeText("@");

      const caret = harness.getCaretRect();
      expect(caret).not.toBeNull();

      const popover = page.getByTestId("cake-mention-popover");
      await expect.element(popover).toBeVisible();

      const popoverEl = popover.element() as HTMLElement;
      const top = parseFloat(popoverEl.style.top || "NaN");
      expect(Number.isFinite(top)).toBe(true);
      expect(top).toBeGreaterThanOrEqual(
        (caret?.top ?? 0) + (caret?.height ?? 0),
      );
    } finally {
      harness?.destroy();
    }
  });

  it("inserts an inline-atom mention and deletes it as a single unit", async () => {
    let harness: TestHarness | null = null;
    let lastQuery = "";
    try {
      harness = createTestHarness({
        value: "",
        extensions: [
          mentionExtension({
            getItems: async (query) => {
              lastQuery = query;
              return [
                { id: "1", label: "Alice" },
                { id: "2", label: "Bob" },
              ].filter((item) =>
                item.label.toLowerCase().includes(query.toLowerCase()),
              );
            },
          }),
        ],
        renderOverlays: true,
      });
      // Wait for React to commit overlay effects
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      await harness.focus();
      await harness.typeText("@a");
      await expect.poll(() => lastQuery).toBe("a");

      const aliceOption = page.getByRole("button", { name: "Alice" });
      await expect.element(aliceOption).toBeVisible();
      await userEvent.click(aliceOption);

      const mention = harness.container.querySelector<HTMLElement>(
        "[data-cake-mention]",
      );
      expect(mention).not.toBeNull();

      expect(harness.engine.getValue()).toBe("@[1](Alice)");

      await harness.typeText("!");
      expect(harness.engine.getValue()).toBe("@[1](Alice)!");

      await harness.pressBackspace();
      expect(harness.engine.getValue()).toBe("@[1](Alice)");

      await harness.pressBackspace();
      expect(harness.engine.getValue()).toBe("");
    } finally {
      harness?.destroy();
    }
  });

  it("reopens the popover on mention click and replaces the mention", async () => {
    let harness: TestHarness | null = null;
    try {
      harness = createTestHarness({
        value: "",
        extensions: [
          mentionExtension({
            getItems: async () => [
              { id: "1", label: "Alice" },
              { id: "2", label: "Bob" },
            ],
          }),
        ],
        renderOverlays: true,
      });
      // Wait for React to commit overlay effects
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      await harness.focus();
      await harness.typeText("@a");
      await userEvent.click(page.getByRole("button", { name: "Alice" }));
      expect(harness.engine.getValue()).toBe("@[1](Alice)");

      const mention = harness.container.querySelector<HTMLElement>(
        "[data-cake-mention]",
      );
      expect(mention).not.toBeNull();
      await userEvent.click(mention!);

      const popover = page.getByTestId("cake-mention-popover");
      await expect.element(popover).toBeVisible();

      await userEvent.click(page.getByRole("button", { name: "Bob" }));
      expect(harness.engine.getValue()).toBe("@[2](Bob)");
    } finally {
      harness?.destroy();
    }
  });

  it("uses ArrowUp/ArrowDown to move the active item and Enter to choose (without moving caret)", async () => {
    let harness: TestHarness | null = null;
    try {
      harness = createTestHarness({
        value: "",
        extensions: [
          mentionExtension({
            getItems: async () => [
              { id: "1", label: "Alice" },
              { id: "2", label: "Bob" },
              { id: "3", label: "Carmen" },
            ],
          }),
        ],
        renderOverlays: true,
      });
      // Wait for React to commit overlay effects
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      await harness.focus();
      await harness.typeText("@");

      const popover = page.getByTestId("cake-mention-popover");
      await expect.element(popover).toBeVisible();

      const selectionBefore = harness.engine.getSelection();

      // Move active to the 2nd item.
      await harness.pressKey("ArrowDown");

      const bobButton = page.getByRole("button", { name: "Bob" });
      await expect.element(bobButton).toHaveAttribute("data-active", "true");

      const selectionAfter = harness.engine.getSelection();
      expect(selectionAfter).toEqual(selectionBefore);

      // Choose active item.
      await harness.pressKey("Enter");
      expect(harness.engine.getValue()).toBe("@[2](Bob)");
    } finally {
      harness?.destroy();
    }
  });

  it("places the caret before/after a mention based on click position", async () => {
    let harness: TestHarness | null = null;
    try {
      harness = createTestHarness({
        value: "hello world",
        extensions: [
          mentionExtension({
            getItems: async () => [{ id: "1", label: "Alice" }],
          }),
        ],
        renderOverlays: true,
      });
      // Wait for React to commit overlay effects
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      await harness.focus();
      // Place caret between the space and 'w'
      await harness.clickLeftOf(6);
      await harness.typeText("@a");
      await userEvent.click(page.getByRole("button", { name: "Alice" }));
      expect(harness.engine.getValue()).toBe("hello @[1](Alice)world");

      const mention = harness.container.querySelector<HTMLElement>(
        "[data-cake-mention]",
      );
      expect(mention).not.toBeNull();

      const rect = mention!.getBoundingClientRect();

      // Click left side: caret should be before mention.
      await harness.clickAtCoords(rect.left + 2, rect.top + rect.height / 2);
      await expect.element(page.getByTestId("cake-mention-popover")).toBeVisible();
      await harness.pressKey("Escape");
      await harness.typeText("X");
      expect(harness.engine.getValue()).toBe("hello X@[1](Alice)world");

      // Click right side: caret should be after mention.
      const mention2 = harness.container.querySelector<HTMLElement>(
        "[data-cake-mention]",
      );
      expect(mention2).not.toBeNull();
      const rect2 = mention2!.getBoundingClientRect();
      await harness.clickAtCoords(rect2.right - 2, rect2.top + rect2.height / 2);
      await expect.element(page.getByTestId("cake-mention-popover")).toBeVisible();
      await harness.pressKey("Escape");
      await harness.typeText("Y");
      expect(harness.engine.getValue()).toBe("hello X@[1](Alice)Yworld");
    } finally {
      harness?.destroy();
    }
  });
});
