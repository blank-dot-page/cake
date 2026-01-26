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

type GraphemeCacheEntry = {
  data: string;
  boundaryOffsets: number[];
};

const graphemeCache = new WeakMap<Text, GraphemeCacheEntry>();

export function createTextRun(node: Text, cursorStart: number): TextRun {
  const data = node.data;
  const cached = graphemeCache.get(node);
  if (cached && cached.data === data) {
    const segmentCount = Math.max(0, cached.boundaryOffsets.length - 1);
    return {
      node,
      cursorStart,
      cursorEnd: cursorStart + segmentCount,
      boundaryOffsets: cached.boundaryOffsets,
    };
  }

  const segments = graphemeSegments(data);
  const boundaryOffsets = [0];
  for (const segment of segments) {
    boundaryOffsets.push(segment.index + segment.segment.length);
  }
  const cursorEnd = cursorStart + segments.length;
  graphemeCache.set(node, { data, boundaryOffsets });
  return { node, cursorStart, cursorEnd, boundaryOffsets };
}

function boundaryIndexForOffset(
  boundaryOffsets: number[],
  offset: number,
): number {
  if (offset <= 0) {
    return 0;
  }

  const lastIndex = boundaryOffsets.length - 1;
  if (lastIndex <= 0) {
    return 0;
  }
  const lastBoundary = boundaryOffsets[lastIndex]!;
  if (offset >= lastBoundary) {
    return lastIndex;
  }

  // Find first boundary >= offset (lower_bound).
  let low = 1;
  let high = lastIndex;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const boundary = boundaryOffsets[mid]!;
    if (boundary < offset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const boundary = boundaryOffsets[low]!;
  return boundary === offset ? low : low - 1;
}

function firstRunStartingAfterCursor(
  runs: TextRun[],
  cursorOffset: number,
): number {
  let low = 0;
  let high = runs.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (runs[mid]!.cursorStart <= cursorOffset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
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

    const nextIndex = firstRunStartingAfterCursor(runs, cursorOffset);
    const runIndex = nextIndex - 1;

    if (runIndex < 0) {
      const first = runs[0]!;
      return { node: first.node, offset: first.boundaryOffsets[0]! };
    }

    const run = runs[runIndex]!;
    const previous = runIndex > 0 ? runs[runIndex - 1]! : null;
    const next = nextIndex < runs.length ? runs[nextIndex]! : null;

    if (cursorOffset === run.cursorStart && previous && affinity === "backward") {
      return {
        node: previous.node,
        offset: previous.boundaryOffsets[previous.boundaryOffsets.length - 1]!,
      };
    }

    // Cursor lies within this run
    if (cursorOffset <= run.cursorEnd) {
      if (
        cursorOffset === run.cursorEnd &&
        affinity === "forward" &&
        next &&
        next.cursorStart === cursorOffset
      ) {
        return { node: next.node, offset: next.boundaryOffsets[0]! };
      }

      const index = Math.max(0, cursorOffset - run.cursorStart);
      const boundedIndex = Math.min(index, run.boundaryOffsets.length - 1);
      return { node: run.node, offset: run.boundaryOffsets[boundedIndex]! };
    }

    // Cursor lies in a gap between runs (e.g., block boundary/newline)
    if (next) {
      const runEndOffset = run.boundaryOffsets[run.boundaryOffsets.length - 1]!;
      return affinity === "backward"
        ? { node: run.node, offset: runEndOffset }
        : { node: next.node, offset: next.boundaryOffsets[0]! };
    }

    // Cursor lies after final run
    const last = run;
    return {
      node: last.node,
      offset: last.boundaryOffsets[last.boundaryOffsets.length - 1]!,
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
