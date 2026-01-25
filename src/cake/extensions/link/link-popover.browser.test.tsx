import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CakeEditor, type CakeEditorRef } from "../../index";

function renderEditor(markdown: string) {
  const ref = createRef<CakeEditorRef>();
  render(
    <CakeEditor
      ref={ref}
      value={markdown}
      onChange={() => undefined}
      placeholder=""
      style={{ height: 300, overflow: "auto" }}
    />,
  );
  return { ref };
}

describe("cake link popover", () => {
  it("positions popover correctly on first click after mount", async () => {
    // This test verifies the popover is positioned correctly on the very first
    // click, without needing a second click. This catches lifecycle issues where
    // toOverlayRect might return stale/zero values on first render.
    renderEditor("hello [world](https://example.com)");

    const link = page.getByRole("link", { name: "world" });
    await expect.element(link).toBeVisible();

    // Single click - should position correctly the first time
    await userEvent.click(link);

    const popover = page.getByRole("button", { name: "Edit link" }).element()
      .parentElement?.parentElement;
    expect(popover).not.toBeNull();

    const linkRect = link.element().getBoundingClientRect();
    const popoverRect = popover!.getBoundingClientRect();

    // Popover should NOT be at 0,0 (the bug symptom)
    expect(popoverRect.top).not.toBe(0);
    expect(popoverRect.left).not.toBe(0);

    // Popover should be positioned below the link
    expect(popoverRect.top).toBeGreaterThan(linkRect.bottom);
  });

  it("shows popover on link click", async () => {
    renderEditor("hello [world](https://example.com)");

    const link = page.getByRole("link", { name: "world" });
    await expect.element(link).toBeVisible();

    await userEvent.click(link);

    const editButton = page.getByRole("button", { name: "Edit link" });
    await expect.element(editButton).toBeVisible();
  });

  it("positions popover below the clicked link", async () => {
    renderEditor("hello [world](https://example.com)");

    const link = page.getByRole("link", { name: "world" });
    await expect.element(link).toBeVisible();

    await userEvent.click(link);

    const popover = page.getByRole("button", { name: "Edit link" }).element()
      .parentElement?.parentElement;
    expect(popover).not.toBeNull();

    const linkRect = link.element().getBoundingClientRect();
    const popoverRect = popover!.getBoundingClientRect();

    // Popover should be positioned below the link (with small gap)
    expect(popoverRect.top).toBeGreaterThan(linkRect.bottom);
    expect(popoverRect.top).toBeLessThan(linkRect.bottom + 20);

    // Popover left edge should be near the link's left edge
    expect(Math.abs(popoverRect.left - linkRect.left)).toBeLessThan(10);
  });
});
