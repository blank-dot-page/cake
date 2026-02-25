import { createRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { CakeEditor, type CakeEditorRef } from "./index";
import { bundledExtensions } from "../extensions";

function createLongDocument(wordCount: number): string {
  return Array.from({ length: wordCount }, (_, index) => `word${index}`).join(
    " ",
  );
}

function percentile(values: number[], ratio: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.max(0, Math.floor(sorted.length * ratio) - 1);
  return sorted[index] ?? 0;
}

describe("react typing performance", () => {
  it("keeps long-doc controlled typing latency under regression budget", async () => {
    const ref = createRef<CakeEditorRef>();

    function ControlledEditor() {
      const [value, setValue] = useState(`**${createLongDocument(5000)}**`);
      const [selection, setSelection] = useState<
        | {
            start: number;
            end: number;
            affinity?: "backward" | "forward";
          }
        | undefined
      >(undefined);
      const [, setActiveMarks] = useState<string[]>([]);

      const syncActiveMarks = () => {
        setActiveMarks(ref.current?.getActiveMarks?.() ?? []);
      };

      return (
        <CakeEditor
          ref={ref}
          value={value}
          selection={selection}
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

    const baseValue = `**${createLongDocument(5000)}**`;
    ref.current?.applyUpdate({
      value: baseValue,
      selection: {
        start: baseValue.length - 2,
        end: baseValue.length - 2,
        affinity: "forward",
      },
      focus: true,
    });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    const warmupIterations = 5;
    const measuredIterations = 50;
    const samples: number[] = [];

    for (let i = 0; i < warmupIterations + measuredIterations; i += 1) {
      const start = performance.now();
      ref.current?.insertText("a");
      const elapsed = performance.now() - start;
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      if (i >= warmupIterations) {
        samples.push(elapsed);
      }
    }

    const p95 = percentile(samples, 0.95);

    expect(samples.length).toBe(measuredIterations);
    expect(p95).toBeLessThanOrEqual(24);

    await cleanup();
  });
});
