import { describe, expect, it } from "vitest";
import { createRuntimeV3 } from "../core/runtime";
import type { Block, Doc, Inline, Selection } from "../core/types";
import { graphemeSegments } from "../shared/segmenter";
import {
  blockquoteExtension,
  boldExtension,
  italicExtension,
  linkExtension,
} from "./index";

const runtime = createRuntimeV3([
  blockquoteExtension,
  boldExtension,
  italicExtension,
  linkExtension,
]);

type Random = {
  next: () => number;
  int: (max: number) => number;
};

function createRandom(seed: number): Random {
  let value = seed >>> 0;
  return {
    next() {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 0xffffffff;
    },
    int(max: number) {
      return Math.floor(this.next() * max);
    },
  };
}

function randomWord(random: Random): string {
  const alphabet = "abcdefg";
  const length = 1 + random.int(3);
  let text = "";
  for (let i = 0; i < length; i += 1) {
    text += alphabet[random.int(alphabet.length)];
  }
  return text;
}

function wrapInline(kind: "bold" | "italic" | "link", text: string): string {
  if (kind === "bold") {
    return `**${text}**`;
  }
  if (kind === "italic") {
    // Use asterisk for italic to match v1 serialization behavior
    return `*${text}*`;
  }
  return `[${text}](u)`;
}

function buildSegment(random: Random, depth: number): string {
  const base = randomWord(random);
  if (depth <= 0 || random.next() < 0.4) {
    return base;
  }
  const nested = buildSegment(random, depth - 1);
  const options: Array<"bold" | "italic" | "link"> = ["bold", "italic", "link"];
  // Avoid adjacent italic markers (* from serialization)
  if (nested.startsWith("*") || nested.endsWith("*")) {
    const index = options.indexOf("italic");
    if (index >= 0) {
      options.splice(index, 1);
    }
  }
  const kind = options[random.int(options.length)];
  return wrapInline(kind, nested);
}

function joinSegments(segments: string[]): string {
  let result = "";
  for (const segment of segments) {
    if (!result) {
      result = segment;
      continue;
    }
    const lastChar = result[result.length - 1];
    const nextChar = segment[0];
    // Avoid adjacent italic markers (* from serialization)
    const needsSpacer = lastChar === "*" && nextChar === "*";
    const separator = needsSpacer ? " " : "";
    result += separator + segment;
  }
  return result;
}

function buildInline(random: Random, depth: number): string {
  const count = 1 + random.int(3);
  const segments = Array.from({ length: count }, () =>
    buildSegment(random, depth),
  );
  return joinSegments(segments);
}

function buildSource(random: Random): string {
  const base = buildInline(random, 3);
  if (random.next() < 0.25) {
    const second = buildInline(random, 2);
    return `> ${base}\n> ${second}`;
  }
  if (random.next() < 0.2) {
    return `> ${base}`;
  }
  return base;
}

function textFromInline(inline: Inline): string {
  if (inline.type === "text") {
    return inline.text;
  }
  if (inline.type === "inline-wrapper") {
    return inline.children.map(textFromInline).join("");
  }
  return "";
}

function textFromBlock(block: Block): string {
  if (block.type === "paragraph") {
    return block.content.map(textFromInline).join("");
  }
  if (block.type === "block-wrapper") {
    return block.blocks.map(textFromBlock).join("\n");
  }
  return "";
}

function visibleText(doc: Doc): string {
  return doc.blocks.map(textFromBlock).join("\n");
}

function moveSelection(
  selection: Selection,
  cursorLength: number,
  direction: "left" | "right",
): Selection {
  const caret =
    selection.start === selection.end
      ? selection.start
      : direction === "left"
        ? Math.min(selection.start, selection.end)
        : Math.max(selection.start, selection.end);

  if (direction === "left") {
    if (caret > 0) {
      return { start: caret - 1, end: caret - 1, affinity: "forward" };
    }
    return { start: caret, end: caret, affinity: "backward" };
  }

  if (caret < cursorLength) {
    return { start: caret + 1, end: caret + 1, affinity: "backward" };
  }

  return { start: caret, end: caret, affinity: "forward" };
}

function assertBoundariesMonotonic(source: string): void {
  const state = runtime.createState(source);
  let lastBackward = 0;
  let lastForward = 0;
  for (const boundary of state.map.boundaries) {
    expect(boundary.sourceBackward).toBeGreaterThanOrEqual(lastBackward);
    expect(boundary.sourceForward).toBeGreaterThanOrEqual(lastForward);
    expect(boundary.sourceBackward).toBeLessThanOrEqual(boundary.sourceForward);
    lastBackward = boundary.sourceBackward;
    lastForward = boundary.sourceForward;
  }
}

function assertCursorLengthMatchesText(source: string): void {
  const doc = runtime.parse(source);
  const text = visibleText(doc);
  const segments = graphemeSegments(text);
  const state = runtime.createState(source);
  expect(state.map.cursorLength).toBe(segments.length);
}

function assertArrowTraversal(source: string): void {
  const state = runtime.createState(source);
  let selection: Selection = { start: 0, end: 0, affinity: "forward" };
  const visited = new Set<number>();
  visited.add(selection.start);
  for (let i = 0; i < state.map.cursorLength + 4; i += 1) {
    selection = moveSelection(selection, state.map.cursorLength, "right");
    visited.add(selection.start);
    if (selection.start === state.map.cursorLength) {
      break;
    }
  }
  expect(visited.size).toBe(state.map.cursorLength + 1);
}

function assertBackspaceValid(source: string): void {
  const base = runtime.createState(source);
  for (let i = 0; i <= base.map.cursorLength; i += 1) {
    const selection: Selection = { start: i, end: i, affinity: "backward" };
    const state = { ...base, selection };
    const next = runtime.applyEdit({ type: "delete-backward" }, state);
    const doc = runtime.parse(next.source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(next.source);
  }
}

describe("nesting fuzz", () => {
  // Use asterisks for italic to match v1 serialization behavior
  const fixedCases = [
    "***a***",
    "***a***",
    "[***a***](u)",
    "**[*a*](u)**",
    "**a** *b*",
    "*a* **b**",
    "> ***a***",
    "> **a**\n> *b*",
  ];

  it("roundtrips edge cases", () => {
    for (const source of fixedCases) {
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    }
  });

  it("fuzzes nested wrapper combinations", () => {
    const random = createRandom(421337);
    const cases = new Set<string>(fixedCases);
    while (cases.size < 60) {
      cases.add(buildSource(random));
    }

    for (const source of cases) {
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
      assertBoundariesMonotonic(source);
      assertCursorLengthMatchesText(source);
      assertArrowTraversal(source);
      assertBackspaceValid(source);
    }
  });
});
