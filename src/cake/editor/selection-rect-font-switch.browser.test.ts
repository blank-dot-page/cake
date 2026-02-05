import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createTestHarness } from "../test/harness";

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function dispatchSelectionChange() {
  document.dispatchEvent(new Event("selectionchange"));
}

function setDomSelection(node: Text, start: number, end: number) {
  const selection = window.getSelection();
  if (!selection) {
    throw new Error("Missing selection");
  }
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  selection.removeAllRanges();
  selection.addRange(range);
  dispatchSelectionChange();
}

describe("selection overlay reflows on font changes (browser)", () => {
  it("updates selection rect when an ancestor toggles font-family", async () => {
    const css = `
      .font-sans .cake-content {
        font-family: sans-serif;
        font-size: 16px;
        line-height: 1;
      }

      .font-mono .cake-content {
        font-family: monospace;
        font-size: 28px;
        line-height: 1;
      }
    `;

    // Simulate the demo: font class is applied on a wrapper above the scroller.
    const wrapper = document.createElement("div");
    wrapper.className = "font-sans";
    document.body.appendChild(wrapper);

    const h = createTestHarness({
      value: "iiiiiiiiiiiiiiiiiiii",
      css,
      mount: wrapper,
    });

    await userEvent.click(h.contentRoot);
    await nextFrame();

    const textNode = h.getTextNode(0);
    setDomSelection(textNode, 0, textNode.data.length);
    await nextFrame();
    await nextFrame();

    const beforeRects = h.getSelectionRects();
    expect(beforeRects.length).toBeGreaterThan(0);
    const beforeHeight = beforeRects[0]!.height;

    wrapper.classList.remove("font-sans");
    wrapper.classList.add("font-mono");
    await nextFrame();
    await nextFrame();
    await nextFrame();

    const afterRects = h.getSelectionRects();
    expect(afterRects.length).toBeGreaterThan(0);
    const afterHeight = afterRects[0]!.height;

    expect(Math.abs(afterHeight - beforeHeight)).toBeGreaterThan(3);

    h.destroy();
    wrapper.remove();
    window.getSelection()?.removeAllRanges();
  });
});
