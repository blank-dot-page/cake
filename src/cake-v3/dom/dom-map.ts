import { graphemeSegments } from "../shared/segmenter";
import type { Affinity } from "../core/types";

export type TextRun = {
  node: Text;
  cursorStart: number;
  cursorEnd: number;
  boundaryOffsets: number[];
};

export type DomPoint = { node: Text; offset: number };

export type DomMap = {
  runs: TextRun[];
  domAtCursor(cursorOffset: number, affinity: Affinity): DomPoint | null;
  cursorAtDom(
    node: Text,
    offset: number,
  ): { cursorOffset: number; affinity: Affinity } | null;
};

export function createTextRun(node: Text, cursorStart: number): TextRun {
  const segments = graphemeSegments(node.data);
  const boundaryOffsets = [0];
  for (const segment of segments) {
    boundaryOffsets.push(segment.index + segment.segment.length);
  }
  const cursorEnd = cursorStart + segments.length;
  return { node, cursorStart, cursorEnd, boundaryOffsets };
}

function boundaryIndexForOffset(
  boundaryOffsets: number[],
  offset: number,
): number {
  if (offset <= 0) {
    return 0;
  }

  for (let i = 1; i < boundaryOffsets.length; i += 1) {
    const boundary = boundaryOffsets[i];
    if (offset < boundary) {
      return i - 1;
    }
    if (offset === boundary) {
      return i;
    }
  }

  return boundaryOffsets.length - 1;
}

export function createDomMap(runs: TextRun[]): DomMap {
  const runForNode = new Map<Text, TextRun>();
  const runIndexForNode = new Map<Text, number>();
  runs.forEach((run, index) => {
    runIndexForNode.set(run.node, index);
  });
  for (const run of runs) {
    runForNode.set(run.node, run);
  }

  function domAtCursor(
    cursorOffset: number,
    affinity: Affinity,
  ): DomPoint | null {
    if (runs.length === 0) {
      return null;
    }

    for (let i = 0; i < runs.length; i += 1) {
      const run = runs[i];
      const previous = i > 0 ? runs[i - 1] : null;
      const next = i + 1 < runs.length ? runs[i + 1] : null;

      if (cursorOffset < run.cursorStart) {
        if (!previous) {
          return { node: run.node, offset: run.boundaryOffsets[0] };
        }
        const previousOffset =
          previous.boundaryOffsets[previous.boundaryOffsets.length - 1];
        return affinity === "backward"
          ? { node: previous.node, offset: previousOffset }
          : { node: run.node, offset: run.boundaryOffsets[0] };
      }

      if (
        cursorOffset === run.cursorStart &&
        previous &&
        affinity === "backward"
      ) {
        return {
          node: previous.node,
          offset: previous.boundaryOffsets[previous.boundaryOffsets.length - 1],
        };
      }

      if (cursorOffset <= run.cursorEnd) {
        if (
          cursorOffset === run.cursorEnd &&
          affinity === "forward" &&
          next &&
          next.cursorStart === cursorOffset
        ) {
          return { node: next.node, offset: next.boundaryOffsets[0] };
        }
        const index = Math.max(0, cursorOffset - run.cursorStart);
        const boundedIndex = Math.min(index, run.boundaryOffsets.length - 1);
        return { node: run.node, offset: run.boundaryOffsets[boundedIndex] };
      }
    }

    const last = runs[runs.length - 1];
    return {
      node: last.node,
      offset: last.boundaryOffsets[last.boundaryOffsets.length - 1],
    };
  }

  function cursorAtDom(
    node: Text,
    offset: number,
  ): { cursorOffset: number; affinity: Affinity } | null {
    const run = runForNode.get(node);
    if (!run) {
      return null;
    }
    const runIndex = runIndexForNode.get(node);

    const index = boundaryIndexForOffset(run.boundaryOffsets, offset);
    const cursorOffset = run.cursorStart + index;
    const atStart = offset === 0;
    const atEnd =
      offset === run.boundaryOffsets[run.boundaryOffsets.length - 1];
    const isNonEmptyRun = run.boundaryOffsets.length > 1;

    // Determine affinity based on position in text run and adjacent runs.
    // Only use "backward" affinity at the end of a run if there's a next run,
    // matching v1 behavior where backward affinity keeps the caret in the
    // current formatting context (e.g., inside a link).
    const hasNextRun = runIndex !== undefined && runIndex + 1 < runs.length;
    const hasPrevRun = runIndex !== undefined && runIndex > 0;

    let affinity: Affinity = "forward";
    if (atEnd && isNonEmptyRun && hasNextRun) {
      // At end of a run with a next run: use backward affinity to stay
      // in the current run's context (e.g., inside bold/link)
      affinity = "backward";
    } else if (atStart && hasPrevRun) {
      // At start of a run with a previous run: use forward affinity
      // to stay in the current run's context
      affinity = "forward";
    }
    return { cursorOffset, affinity };
  }

  return { runs, domAtCursor, cursorAtDom };
}
