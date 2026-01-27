import { createRef, useState } from "react";
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
