import { createRef, useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { CakeEditor, type CakeEditorRef } from "./index";
import { createRuntimeForTests } from "../core/runtime";
import { bundledExtensions } from "../extensions";
import { blockquoteExtension } from "../extensions/blockquote/blockquote";
import { headingExtension } from "../extensions/heading/heading";
import { plainTextListExtension } from "../extensions/list/list";
import { combinedEmphasisExtension } from "../extensions/combined-emphasis/combined-emphasis";
import { boldExtension } from "../extensions/bold/bold";
import { italicExtension } from "../extensions/italic/italic";
import { strikethroughExtension } from "../extensions/strikethrough/strikethrough";
import { underlineExtension } from "../extensions/underline/underline";
import { scrollbarExtension } from "../extensions/scrollbar";
import { linkExtension } from "../extensions/link/link";

afterEach(async () => {
  await cleanup();
});

async function renderEditor({ value }: { value: string }) {
  const ref = createRef<CakeEditorRef>();
  await render(
    <CakeEditor
      ref={ref}
      value={value}
      onChange={() => undefined}
      placeholder=""
      extensions={bundledExtensions}
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
  const runtime = createRuntimeForTests(bundledExtensions);
  const state = runtime.createState(value);
  const serialized = runtime.serialize(state.doc);
  expect(serialized.source).toBe(value);
}

describe("cake formatting interactions", () => {
  it("Cmd+A then Cmd+B on *italics* does not surface markers; delete-all leaves empty doc", async () => {
    const ref = await renderEditor({ value: "*italics*" });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    ref.current?.focus();
    ref.current?.selectAll();
    expect(ref.current?.executeCommand({ type: "toggle-bold" })).toBe(true);

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
    const ref = await renderEditor({ value: "text" });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    ref.current?.focus();
    ref.current?.selectAll();
    expect(ref.current?.executeCommand({ type: "toggle-bold" })).toBe(true);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Simulate Cmd+V while the text is still selected.
    dispatchPaste("text");
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(ref.current?.getValue?.()).toBe("**text**");
    expect(getFirstLine().textContent ?? "").toBe("text");
    await assertBundledRoundtrip(ref.current?.getValue?.() ?? "");
  });

  it("pasting a link over bold selection produces a bold link (markers stay balanced)", async () => {
    const ref = await renderEditor({ value: "text" });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    ref.current?.focus();
    ref.current?.selectAll();
    expect(ref.current?.executeCommand({ type: "toggle-bold" })).toBe(true);
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
    const ref = await renderEditor({ value: "**a**b" });
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

  it("Cmd+B on a new line keeps active marks in controlled React usage", async () => {
    const isMac =
      typeof navigator !== "undefined" &&
      typeof navigator.platform === "string" &&
      navigator.platform.toLowerCase().includes("mac");
    const ref = createRef<CakeEditorRef>();

    function ControlledEditor() {
      const [value, setValue] = useState("");
      return (
        <CakeEditor
          ref={ref}
          value={value}
          onChange={setValue}
          placeholder=""
          extensions={bundledExtensions}
          style={{ height: 160, overflow: "auto" }}
        />
      );
    }

    await render(<ControlledEditor />);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    ref.current?.focus();
    await userEvent.keyboard("hello");
    await userEvent.keyboard("{Enter}");
    if (isMac) {
      await userEvent.keyboard("{Meta>}b{/Meta}");
    } else {
      await userEvent.keyboard("{Control>}b{/Control}");
    }
    await new Promise((r) => setTimeout(r, 120));

    expect(ref.current?.getActiveMarks()).toEqual(["bold"]);
  });

  it("Cmd+B on a new line keeps callback-driven active marks in sync", async () => {
    const isMac =
      typeof navigator !== "undefined" &&
      typeof navigator.platform === "string" &&
      navigator.platform.toLowerCase().includes("mac");
    const ref = createRef<CakeEditorRef>();
    let latestActiveMarks: string[] = [];

    function ControlledEditor() {
      const [value, setValue] = useState("");
      const [activeMarks, setActiveMarks] = useState<string[]>([]);
      const syncActiveMarks = () =>
        setActiveMarks(ref.current?.getActiveMarks?.() ?? []);

      useEffect(() => {
        latestActiveMarks = activeMarks;
      }, [activeMarks]);

      return (
        <CakeEditor
          ref={ref}
          value={value}
          onChange={(nextValue) => {
            setValue(nextValue);
            syncActiveMarks();
          }}
          onSelectionChange={() => {
            syncActiveMarks();
          }}
          placeholder=""
          extensions={bundledExtensions}
          style={{ height: 160, overflow: "auto" }}
        />
      );
    }

    await render(<ControlledEditor />);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    ref.current?.focus();
    await userEvent.keyboard("hello");
    await userEvent.keyboard("{Enter}");
    if (isMac) {
      await userEvent.keyboard("{Meta>}b{/Meta}");
    } else {
      await userEvent.keyboard("{Control>}b{/Control}");
    }
    await new Promise((r) => setTimeout(r, 120));

    expect(latestActiveMarks).toEqual(["bold"]);
  });

  it("Cmd+B on a new line keeps active marks in selection-controlled usage", async () => {
    const isMac =
      typeof navigator !== "undefined" &&
      typeof navigator.platform === "string" &&
      navigator.platform.toLowerCase().includes("mac");
    const ref = createRef<CakeEditorRef>();
    let latestActiveMarks: string[] = [];

    function ControlledEditor() {
      const [value, setValue] = useState("");
      const [selection, setSelection] = useState<
        | {
            start: number;
            end: number;
            affinity?: "backward" | "forward";
          }
        | null
      >(null);
      const [activeMarks, setActiveMarks] = useState<string[]>([]);
      const syncActiveMarks = () =>
        setActiveMarks(ref.current?.getActiveMarks?.() ?? []);

      useEffect(() => {
        latestActiveMarks = activeMarks;
      }, [activeMarks]);

      return (
        <CakeEditor
          ref={ref}
          value={value}
          selection={selection ?? undefined}
          onChange={(nextValue) => {
            setValue(nextValue);
            syncActiveMarks();
          }}
          onSelectionChange={(start, end, affinity) => {
            setSelection(affinity ? { start, end, affinity } : { start, end });
            syncActiveMarks();
          }}
          placeholder=""
          extensions={bundledExtensions}
          style={{ height: 160, overflow: "auto" }}
        />
      );
    }

    await render(<ControlledEditor />);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    ref.current?.focus();
    await userEvent.keyboard("hello");
    await userEvent.keyboard("{Enter}");
    if (isMac) {
      await userEvent.keyboard("{Meta>}b{/Meta}");
    } else {
      await userEvent.keyboard("{Control>}b{/Control}");
    }
    await new Promise((r) => setTimeout(r, 120));

    expect(latestActiveMarks).toEqual(["bold"]);
  });

  it("Cmd+B on new line keeps active marks with editor extension ordering", async () => {
    const isMac =
      typeof navigator !== "undefined" &&
      typeof navigator.platform === "string" &&
      navigator.platform.toLowerCase().includes("mac");
    const ref = createRef<CakeEditorRef>();
    let latestActiveMarks: string[] = [];
    const editorLikeExtensions = [
      blockquoteExtension,
      headingExtension,
      plainTextListExtension,
      combinedEmphasisExtension,
      boldExtension,
      italicExtension,
      strikethroughExtension,
      underlineExtension,
      scrollbarExtension,
      linkExtension({ onRequestLinkInput: async () => null }),
    ];

    function ControlledEditor() {
      const [value, setValue] = useState("");
      const [selection, setSelection] = useState<
        | {
            start: number;
            end: number;
            affinity?: "backward" | "forward";
          }
        | null
      >(null);
      const [activeMarks, setActiveMarks] = useState<string[]>([]);
      const syncActiveMarks = () =>
        setActiveMarks(ref.current?.getActiveMarks?.() ?? []);

      useEffect(() => {
        latestActiveMarks = activeMarks;
      }, [activeMarks]);

      return (
        <CakeEditor
          ref={ref}
          value={value}
          selection={selection ?? undefined}
          onChange={(nextValue) => {
            setValue(nextValue);
            syncActiveMarks();
          }}
          onSelectionChange={(start, end, affinity) => {
            setSelection(affinity ? { start, end, affinity } : { start, end });
            syncActiveMarks();
          }}
          placeholder=""
          extensions={editorLikeExtensions}
          style={{ height: 160, overflow: "auto" }}
        />
      );
    }

    await render(<ControlledEditor />);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    ref.current?.focus();
    await userEvent.keyboard("hello");
    await userEvent.keyboard("{Enter}");
    if (isMac) {
      await userEvent.keyboard("{Meta>}b{/Meta}");
    } else {
      await userEvent.keyboard("{Control>}b{/Control}");
    }
    await new Promise((r) => setTimeout(r, 120));

    expect(latestActiveMarks).toEqual(["bold"]);
  });
});
