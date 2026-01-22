import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CakeEditorV3 } from "../index";
import type { EditorRefHandle } from "../../editor";
import { defaultEditorSettings } from "../../editor";
import { toggleBold } from "../../codemirror/markdown-commands";
import { createRuntimeV3 } from "../core/runtime";

function renderEditor({ value }: { value: string }) {
  const ref = createRef<EditorRefHandle>();
  render(
    <CakeEditorV3
      ref={ref}
      initialValue={value}
      value={value}
      onChange={() => undefined}
      settings={defaultEditorSettings}
      placeholder=""
      pageId={null}
      canUploadImage={() => true}
      style={{ height: 160, overflow: "auto" }}
    />,
  );
  return ref;
}

function getContentRoot(): HTMLElement {
  const root = document.querySelector(".cake-content");
  if (!root || !(root instanceof HTMLElement)) {
    throw new Error("Missing .cake-content");
  }
  return root;
}

function getFirstLine(): HTMLElement {
  const line = document.querySelector('[data-line-index="0"]');
  if (!line || !(line instanceof HTMLElement)) {
    throw new Error("Missing first line");
  }
  return line;
}

function dispatchPaste(text: string) {
  const contentRoot = getContentRoot();
  const data = new DataTransfer();
  data.setData("text/plain", text);
  const event = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: data,
  });
  contentRoot.dispatchEvent(event);
}

async function assertBundledRoundtrip(value: string): Promise<void> {
  const { bundledExtensions } = await import("../extensions");
  const runtime = createRuntimeV3(bundledExtensions);
  const state = runtime.createState(value);
  const serialized = runtime.serialize(state.doc);
  expect(serialized.source).toBe(value);
}

describe("cake-v3 formatting interactions", () => {
  it("Cmd+A then Cmd+B on *italics* does not surface markers; delete-all leaves empty doc", async () => {
    const ref = renderEditor({ value: "*italics*" });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    ref.current?.focus();
    ref.current?.selectAll();
    expect(ref.current?.executeCommand(toggleBold)).toBe(true);

    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(getFirstLine().textContent ?? "").toBe("italics");
    expect(getFirstLine().textContent ?? "").not.toContain("*");

    ref.current?.selectAll();
    const contentRoot = getContentRoot();
    contentRoot.focus();
    const deleteEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteContentBackward",
    });
    contentRoot.dispatchEvent(deleteEvent);

    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(ref.current?.getValue?.()).toBe("");
  });

  it("copy/paste with selection preserves bold wrapper (no dangling markers)", async () => {
    const ref = renderEditor({ value: "text" });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    ref.current?.focus();
    ref.current?.selectAll();
    expect(ref.current?.executeCommand(toggleBold)).toBe(true);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Simulate Cmd+V while the text is still selected.
    dispatchPaste("text");
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(ref.current?.getValue?.()).toBe("**text**");
    expect(getFirstLine().textContent ?? "").toBe("text");
    await assertBundledRoundtrip(ref.current?.getValue?.() ?? "");
  });

  it("pasting a link over bold selection produces a bold link (markers stay balanced)", async () => {
    const ref = renderEditor({ value: "text" });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    ref.current?.focus();
    ref.current?.selectAll();
    expect(ref.current?.executeCommand(toggleBold)).toBe(true);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    ref.current?.selectAll();
    dispatchPaste("http://localhost:3000/");
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(ref.current?.getValue?.()).toBe(
      "**[text](http://localhost:3000/)**",
    );
    expect(getFirstLine().textContent ?? "").toBe("text");
    await assertBundledRoundtrip(ref.current?.getValue?.() ?? "");
  });

  it("pasting over mixed-format selection never leaks wrapper markers", async () => {
    const ref = renderEditor({ value: "**a**b" });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    ref.current?.focus();
    ref.current?.selectAll();
    dispatchPaste("x");

    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(getFirstLine().textContent ?? "").toBe("x");
    expect(getFirstLine().textContent ?? "").not.toContain("*");
    expect(ref.current?.getValue?.()).toBe("x");
    await assertBundledRoundtrip(ref.current?.getValue?.() ?? "");
  });
});
