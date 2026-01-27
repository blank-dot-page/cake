import { createRef, useState, useEffect } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CakeEditor, type CakeEditorRef } from "../index";

function renderEditor({
  value,
  selection,
}: {
  value: string;
  selection?: { start: number; end: number };
}) {
  const ref = createRef<CakeEditorRef>();
  render(
    <CakeEditor
      ref={ref}
      value={value}
      selection={selection}
      onChange={() => undefined}
      placeholder=""
      style={{ height: 160, overflow: "auto" }}
    />,
  );
  return ref;
}

describe("page load caret positioning (replicates editor.client.tsx runCaretInit)", () => {
  /**
   * This test replicates what happens on page load in the app:
   * 1. Editor mounts with content but no initial selection (defaults to 0,0)
   * 2. Content loads from server (value prop updates)
   * 3. runCaretInit calls applyUpdate({ selection: { start: endPos, end: endPos }, focus: true })
   *
   * The expected behavior is the caret should be at the end of the document.
   */
  it("applyUpdate positions caret at end after mount (page load scenario)", async () => {
    // Step 1: Mount editor with content, no initial selection
    const ref = renderEditor({ value: "Hello world" });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Initial selection should be at 0
    expect(ref.current?.getSelection()).toEqual({ start: 0, end: 0 });

    // Step 2: Simulate runCaretInit calling applyUpdate to position at end
    const contentLength = 11; // "Hello world".length
    ref.current?.applyUpdate({
      selection: { start: contentLength, end: contentLength },
      focus: true,
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Caret should now be at the end
    const selection = ref.current?.getSelection();
    expect(selection).toEqual({ start: 11, end: 11 });
  });

  /**
   * Test with value prop changing (simulates content loading from server)
   * This more closely replicates what happens in the app where:
   * 1. Editor mounts with empty content
   * 2. Server data arrives and value prop updates
   * 3. runCaretInit effect fires and calls applyUpdate
   *
   * NOTE: Using setTimeout to wait for React effects is a workaround.
   * The real app has the same issue - runCaretInit might fire before
   * the value sync effect completes.
   */
  it("caret at end after value prop changes (with delay - passes)", async () => {
    const ref = createRef<CakeEditorRef>();
    let triggerLoad: () => void = () => {};

    const TestComponent = () => {
      const [value, setValue] = useState("");
      triggerLoad = () => setValue("Hello world");
      return (
        <CakeEditor
          ref={ref}
          value={value}
          onChange={() => undefined}
          placeholder=""
          style={{ height: 160, overflow: "auto" }}
        />
      );
    };

    render(<TestComponent />);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Initially empty
    expect(ref.current?.getValue()).toBe("");

    // Load content (simulates server response)
    triggerLoad();
    // Wait for React to re-render and effect to run
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // Verify content was loaded
    expect(ref.current?.getValue()).toBe("Hello world");

    // Now call applyUpdate to position caret at end (like runCaretInit does)
    ref.current?.applyUpdate({
      selection: { start: 11, end: 11 },
      focus: true,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const selection = ref.current?.getSelection();
    expect(selection).toEqual({ start: 11, end: 11 });
  });

  /**
   * This test demonstrates the actual bug - when applyUpdate is called
   * immediately after value prop changes (as happens in runCaretInit),
   * the selection doesn't get applied.
   */
  it("FAILS: caret at end after value prop changes (immediate - race condition)", async () => {
    const ref = createRef<CakeEditorRef>();
    let triggerLoad: () => void = () => {};

    const TestComponent = () => {
      const [value, setValue] = useState("");
      triggerLoad = () => setValue("Hello world");
      return (
        <CakeEditor
          ref={ref}
          value={value}
          onChange={() => undefined}
          placeholder=""
          style={{ height: 160, overflow: "auto" }}
        />
      );
    };

    render(<TestComponent />);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Initially empty
    expect(ref.current?.getValue()).toBe("");

    // Load content (simulates server response)
    triggerLoad();
    // Only wait for microtask (like the app does with useEffect)
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Now call applyUpdate to position caret at end (like runCaretInit does)
    ref.current?.applyUpdate({
      selection: { start: 11, end: 11 },
      focus: true,
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    const selection = ref.current?.getSelection();
    // This should be {11, 11} but due to race condition it's {0, 0}
    expect(selection).toEqual({ start: 11, end: 11 });
  });

  /**
   * Test the exact flow from editor.client.tsx:
   * - selection state is null initially
   * - content is loaded
   * - runCaretInit computes cursorLength and calls applyEditorUpdate
   */
  it("replicates runCaretInit flow with selection state", async () => {
    const ref = createRef<CakeEditorRef>();
    let externalSelection: { start: number; end: number } | null = null;

    const TestComponent = () => {
      const [value] = useState("Hello world");
      const [selection, setSelection] = useState<{
        start: number;
        end: number;
      } | null>(null);

      // Track selection changes like the app does
      const handleSelectionChange = (start: number, end: number) => {
        const newSel = { start, end };
        setSelection(newSel);
        externalSelection = newSel;
      };

      return (
        <CakeEditor
          ref={ref}
          value={value}
          selection={selection ?? undefined}
          onSelectionChange={handleSelectionChange}
          onChange={() => undefined}
          placeholder=""
          style={{ height: 160, overflow: "auto" }}
        />
      );
    };

    render(<TestComponent />);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Initial state: selection is null in React, engine has {0,0}
    expect(ref.current?.getSelection()).toEqual({ start: 0, end: 0 });
    expect(externalSelection).toBe(null);

    // Simulate runCaretInit: call applyUpdate to position at end
    ref.current?.applyUpdate({
      selection: { start: 11, end: 11 },
      focus: true,
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Should be at end now
    const selection = ref.current?.getSelection();
    expect(selection).toEqual({ start: 11, end: 11 });
  });
});
