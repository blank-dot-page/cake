import { createRef, useState } from "react";
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

function ControlledEditor({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
    affinity?: "forward" | "backward";
  }>({ start: 0, end: 0 });
  return (
    <CakeEditor
      value={value}
      onChange={setValue}
      selection={selection}
      onSelectionChange={(start, end, affinity) =>
        setSelection({ start, end, affinity })
      }
      placeholder=""
      style={{ height: 300, overflow: "auto" }}
    />
  );
}

describe("cake link popover", () => {
  it("positions popover correctly on first click with controlled editor", async () => {
    // This test uses a controlled editor (value + onChange) which causes
    // React re-renders and DOM node replacement when the editor state changes.
    // The popover should still position correctly on first click.
    render(<ControlledEditor initialValue="hello [world](https://example.com)" />);

    const link = page.getByRole("link", { name: "world" });
    await expect.element(link).toBeVisible();

    // Single click - should position correctly the first time
    await userEvent.click(link);

    const popover = page.getByRole("button", { name: "Edit link" }).element()
      .parentElement?.parentElement;
    expect(popover).not.toBeNull();

    // Get the NEW link element (may have been replaced during re-render)
    const newLink = page.getByRole("link", { name: "world" });
    const linkRect = newLink.element().getBoundingClientRect();
    const popoverRect = popover!.getBoundingClientRect();

    // Popover should NOT be at top:6, left:0 (the bug symptom when anchor is detached)
    expect(popoverRect.top).toBeGreaterThan(20);

    // Popover should be positioned below the link
    expect(popoverRect.top).toBeGreaterThan(linkRect.bottom - 1);
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

  it("hides popover when editor is scrolled", async () => {
    // Create content tall enough to scroll
    const longContent = Array(20)
      .fill("line")
      .map((l, i) => `${l} ${i}`)
      .join("\n");
    const markdown = `[link](https://example.com)\n\n${longContent}`;

    const { ref } = renderEditor(markdown);

    const link = page.getByRole("link", { name: "link" });
    await expect.element(link).toBeVisible();

    await userEvent.click(link);

    const editButton = page.getByRole("button", { name: "Edit link" });
    await expect.element(editButton).toBeVisible();

    // Scroll the editor container
    const container = ref.current?.element;
    expect(container).not.toBeNull();
    container!.scrollTop = 50;
    container!.dispatchEvent(new Event("scroll"));

    // Popover should be hidden after scroll
    await expect.element(editButton).not.toBeInTheDocument();
  });
});
