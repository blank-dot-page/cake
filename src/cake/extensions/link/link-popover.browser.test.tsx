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
