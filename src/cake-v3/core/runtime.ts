import type { Affinity, Block, Doc, Inline, Selection } from "./types";
import type { ReactElement } from "react";
import {
  CursorSourceBuilder,
  type CursorSourceMap,
} from "./mapping/cursor-source-map";
import { graphemeSegments } from "../shared/segmenter";
import type { DomRenderContext } from "../dom/types";
import type { OverlayExtensionContext } from "../../cake/extensions/types";

type BlockParseResult = { block: Block; nextPos: number };
type InlineParseResult = { inline: Inline; nextPos: number };

export type ParseBlockResult = BlockParseResult | null;
export type ParseInlineResult = InlineParseResult | null;

export type SerializeBlockResult = { source: string; map: CursorSourceMap };
export type SerializeInlineResult = { source: string; map: CursorSourceMap };

export type EditCommand =
  | { type: "insert"; text: string }
  | { type: "insert-line-break" }
  | { type: "delete-backward" }
  | { type: "delete-forward" }
  | { type: "indent" }
  | { type: "outdent" }
  | { type: "toggle-bullet-list" }
  | { type: "toggle-numbered-list" }
  | { type: "toggle-inline"; marker: string }
  | { type: "wrap-link"; url?: string; openPopover?: boolean };

export type EditResult = {
  source: string;
  selection: Selection;
};

export type KeyBinding = {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  command: EditCommand | ((state: RuntimeState) => EditCommand | null);
};

export type InlineWrapperAffinity = {
  kind: string;
  /**
   * Whether the wrapper should be considered "active" when the caret is at its
   * end boundary. For v1 parity, links are non-inclusive; emphasis is inclusive.
   */
  inclusive: boolean;
};

export type ExtensionContext = {
  parseInline: (source: string, start: number, end: number) => Inline[];
  serializeInline: (inline: Inline) => SerializeInlineResult;
  serializeBlock: (block: Block) => SerializeBlockResult;
};

export type CakeExtensionV3 = {
  name: string;
  inlineWrapperAffinity?: InlineWrapperAffinity[];
  /**
   * Declares which inline wrapper kind a `toggle-inline` marker corresponds to.
   * This keeps the core runtime syntax-agnostic while still allowing extension-
   * specific toggle behavior at wrapper boundaries.
   */
  toggleInline?: { kind: string; markers: string[] };
  parseBlock?: (
    source: string,
    start: number,
    context: ExtensionContext,
  ) => ParseBlockResult;
  parseInline?: (
    source: string,
    start: number,
    end: number,
    context: ExtensionContext,
  ) => ParseInlineResult;
  serializeBlock?: (
    block: Block,
    context: ExtensionContext,
  ) => SerializeBlockResult | null;
  serializeInline?: (
    inline: Inline,
    context: ExtensionContext,
  ) => SerializeInlineResult | null;
  normalizeBlock?: (block: Block) => Block | null;
  normalizeInline?: (inline: Inline) => Inline | null;
  onEdit?: (command: EditCommand, state: RuntimeState) => EditResult | null;
  onPasteText?: (text: string, state: RuntimeState) => EditCommand | null;
  keybindings?: KeyBinding[];
  renderInline?: (
    inline: Inline,
    context: DomRenderContext,
  ) => Node | Node[] | null;
  renderBlock?: (
    block: Block,
    context: DomRenderContext,
  ) => Node | Node[] | null;
  renderOverlay?: (context: OverlayExtensionContext) => ReactElement | null;
};

export type RuntimeState = {
  source: string;
  selection: Selection;
  map: CursorSourceMap;
  doc: Doc;
  runtime: Runtime;
};

export type Runtime = {
  extensions: CakeExtensionV3[];
  parse(source: string): Doc;
  serialize(doc: Doc): { source: string; map: CursorSourceMap };
  createState(source: string, selection?: Selection): RuntimeState;
  updateSelection(
    state: RuntimeState,
    selection: Selection,
    options?: { kind?: "dom" | "keyboard" | "programmatic" },
  ): RuntimeState;
  serializeSelection(state: RuntimeState, selection: Selection): string;
  applyEdit(command: EditCommand, state: RuntimeState): RuntimeState;
};

const defaultSelection: Selection = { start: 0, end: 0, affinity: "forward" };

export function createRuntimeV3(extensions: CakeExtensionV3[]): Runtime {
  const toggleMarkerToKind = new Map<string, string>();
  for (const extension of extensions) {
    const toggle = extension.toggleInline;
    if (!toggle) {
      continue;
    }
    for (const marker of toggle.markers) {
      toggleMarkerToKind.set(marker, toggle.kind);
    }
  }
  const inclusiveAtEndByKind = new Map<string, boolean>();
  for (const extension of extensions) {
    const specs = extension.inlineWrapperAffinity;
    if (!specs) {
      continue;
    }
    for (const spec of specs) {
      if (!inclusiveAtEndByKind.has(spec.kind)) {
        inclusiveAtEndByKind.set(spec.kind, spec.inclusive);
      }
    }
  }
  const isInclusiveAtEnd = (kind: string): boolean =>
    inclusiveAtEndByKind.get(kind) ?? true;

  const context: ExtensionContext = {
    parseInline: (source, start, end) => parseInlineRange(source, start, end),
    serializeInline: (inline) => serializeInline(inline),
    serializeBlock: (block) => serializeBlock(block),
  };

  function parseBlockAt(source: string, start: number): BlockParseResult {
    for (const extension of extensions) {
      if (!extension.parseBlock) {
        continue;
      }
      const result = extension.parseBlock(source, start, context);
      if (result) {
        return result;
      }
    }

    return parseLiteralBlock(source, start, context);
  }

  function parseInlineRange(
    source: string,
    start: number,
    end: number,
  ): Inline[] {
    const inlines: Inline[] = [];
    let pos = start;
    while (pos < end) {
      let matched = false;
      for (const extension of extensions) {
        if (!extension.parseInline) {
          continue;
        }
        const result = extension.parseInline(source, pos, end, context);
        if (result) {
          inlines.push(result.inline);
          pos = result.nextPos;
          matched = true;
          break;
        }
      }
      if (!matched) {
        const literal = parseLiteralInline(source, pos, end);
        inlines.push(literal.inline);
        pos = literal.nextPos;
      }
    }
    return inlines;
  }

  function parse(source: string): Doc {
    const blocks: Block[] = [];
    let pos = 0;
    while (pos < source.length) {
      const result = parseBlockAt(source, pos);
      blocks.push(result.block);
      pos = result.nextPos;
      if (source[pos] === "\n") {
        pos += 1;
      }
    }

    if (source.length === 0) {
      blocks.push({ type: "paragraph", content: [] });
    }
    if (source.endsWith("\n")) {
      blocks.push({ type: "paragraph", content: [] });
    }

    return { type: "doc", blocks };
  }

  function serialize(doc: Doc): { source: string; map: CursorSourceMap } {
    const builder = new CursorSourceBuilder();
    const blocks = doc.blocks;
    blocks.forEach((block, index) => {
      const serialized = serializeBlock(block);
      builder.appendSerialized(serialized);
      if (index < blocks.length - 1) {
        builder.appendText("\n");
      }
    });

    return builder.build();
  }

  function serializeBlock(block: Block): SerializeBlockResult {
    for (const extension of extensions) {
      if (!extension.serializeBlock) {
        continue;
      }
      const result = extension.serializeBlock(block, context);
      if (result) {
        return result;
      }
    }

    if (block.type === "paragraph") {
      return serializeParagraph(block, serializeInline);
    }

    if (block.type === "block-wrapper") {
      return serializeBlockWrapper(block, serializeBlock);
    }

    return { source: "", map: new CursorSourceBuilder().build().map };
  }

  function serializeInline(inline: Inline): SerializeInlineResult {
    for (const extension of extensions) {
      if (!extension.serializeInline) {
        continue;
      }
      const result = extension.serializeInline(inline, context);
      if (result) {
        return result;
      }
    }

    if (inline.type === "text") {
      const builder = new CursorSourceBuilder();
      builder.appendText(inline.text);
      return builder.build();
    }

    if (inline.type === "inline-wrapper") {
      return serializeInlineWrapper(inline, serializeInline);
    }

    return { source: "", map: new CursorSourceBuilder().build().map };
  }

  function normalize(doc: Doc): Doc {
    return {
      type: "doc",
      blocks: doc.blocks
        .map((block) => normalizeBlock(block))
        .filter((block): block is Block => block !== null),
    };
  }

  function normalizeBlock(block: Block): Block | null {
    let next = block;
    for (const extension of extensions) {
      if (extension.normalizeBlock) {
        const result = extension.normalizeBlock(next);
        if (result === null) {
          return null;
        }
        next = result;
      }
    }

    if (next.type === "paragraph") {
      return {
        ...next,
        content: next.content
          .map((inline) => normalizeInline(inline))
          .filter((inline): inline is Inline => inline !== null),
      };
    }

    if (next.type === "block-wrapper") {
      return {
        ...next,
        blocks: next.blocks
          .map((child) => normalizeBlock(child))
          .filter((child): child is Block => child !== null),
      };
    }

    return next;
  }

  function applyInlineNormalizers(inline: Inline): Inline | null {
    let next = inline;
    for (const extension of extensions) {
      if (!extension.normalizeInline) {
        continue;
      }
      const result = extension.normalizeInline(next);
      if (result === null) {
        return null;
      }
      next = result;
    }
    return next;
  }

  function normalizeInline(inline: Inline): Inline | null {
    const pre = applyInlineNormalizers(inline);
    if (!pre) {
      return null;
    }

    let next = pre;
    if (next.type === "inline-wrapper") {
      next = {
        ...next,
        children: next.children
          .map((child) => normalizeInline(child))
          .filter((child): child is Inline => child !== null),
      };
    }

    return applyInlineNormalizers(next);
  }

  function createState(
    source: string,
    selection: Selection = defaultSelection,
  ): RuntimeState {
    const doc = parse(source);
    const normalized = normalize(doc);
    const serialized = serialize(normalized);
    return {
      source: serialized.source,
      selection,
      map: serialized.map,
      doc: normalized,
      runtime: runtime,
    };
  }

  function createStateFromDoc(
    doc: Doc,
    selection: Selection = defaultSelection,
  ): RuntimeState {
    const normalized = normalize(doc);
    const serialized = serialize(normalized);
    return {
      source: serialized.source,
      selection,
      map: serialized.map,
      doc: normalized,
      runtime: runtime,
    };
  }

  function applyEdit(command: EditCommand, state: RuntimeState): RuntimeState {
    for (const extension of extensions) {
      if (!extension.onEdit) {
        continue;
      }
      const result = extension.onEdit(command, state);
      if (result) {
        return createState(result.source, result.selection);
      }
    }

    const selection = normalizeSelection(state.selection);
    if (
      command.type === "insert" ||
      command.type === "delete-backward" ||
      command.type === "delete-forward" ||
      command.type === "insert-line-break"
    ) {
      const structural = applyStructuralEdit(command, state.doc, selection);
      if (!structural) {
        return state;
      }

      // Structural edits operate directly on the current doc tree. To support
      // markdown-first behavior while typing, we reparse from the resulting
      // source and then remap the caret through source space so it stays stable
      // even when marker characters become source-only.
      const interim = createStateFromDoc(structural.doc);
      const interimAffinity = structural.nextAffinity ?? "forward";
      const caretSource = interim.map.cursorToSource(
        structural.nextCursor,
        interimAffinity,
      );
      const next = createState(interim.source);
      const caretCursor = next.map.sourceToCursor(caretSource, interimAffinity);

      return {
        ...next,
        selection: {
          start: caretCursor.cursorOffset,
          end: caretCursor.cursorOffset,
          affinity: caretCursor.affinity,
        },
      };
    }

    // Indent and outdent are handled by extensions
    // Runtime does nothing by default
    if (command.type === "indent" || command.type === "outdent") {
      return state;
    }

    // List toggle commands are handled by extensions
    if (
      command.type === "toggle-bullet-list" ||
      command.type === "toggle-numbered-list"
    ) {
      return state;
    }

    if (command.type === "toggle-inline") {
      return applyInlineToggle(state, command.marker);
    }

    return state;
  }

  type Mark = {
    kind: string;
    data?: Record<string, unknown>;
    key: string;
  };

  type Run = {
    text: string;
    marks: Mark[];
  };

  type FlatBlockLine = {
    path: number[];
    parentPath: number[];
    indexInParent: number;
    block: Block;
    text: string;
    cursorLength: number;
    hasNewline: boolean;
  };

  function applyStructuralEdit(
    command:
      | { type: "insert"; text: string }
      | { type: "insert-line-break" }
      | { type: "delete-backward" }
      | { type: "delete-forward" },
    doc: Doc,
    selection: Selection,
  ): { doc: Doc; nextCursor: number; nextAffinity?: Affinity } | null {
    const lines = flattenDocToLines(doc);
    if (lines.length === 0) {
      return null;
    }

    const docCursorLength = cursorLengthForLines(lines);

    const cursorStart = Math.max(
      0,
      Math.min(docCursorLength, Math.min(selection.start, selection.end)),
    );
    const cursorEnd = Math.max(
      0,
      Math.min(docCursorLength, Math.max(selection.start, selection.end)),
    );

    const affinity = selection.affinity ?? "forward";

    if (
      command.type === "delete-backward" &&
      cursorStart === 0 &&
      cursorEnd === 0
    ) {
      return {
        doc,
        nextCursor: 0,
        nextAffinity: affinity === "forward" ? "backward" : "backward",
      };
    }
    if (
      command.type === "delete-forward" &&
      cursorStart === docCursorLength &&
      cursorEnd === docCursorLength
    ) {
      return {
        doc,
        nextCursor: docCursorLength,
        nextAffinity: affinity === "backward" ? "forward" : "forward",
      };
    }

    const replaceText =
      command.type === "insert"
        ? command.text
        : command.type === "insert-line-break"
          ? "\n"
          : "";

    const range =
      command.type === "delete-backward" && cursorStart === cursorEnd
        ? cursorStart === 0
          ? { start: 0, end: 0 }
          : { start: cursorStart - 1, end: cursorStart }
        : command.type === "delete-forward" && cursorStart === cursorEnd
          ? cursorStart === docCursorLength
            ? { start: cursorStart, end: cursorStart }
            : { start: cursorStart, end: cursorStart + 1 }
          : { start: cursorStart, end: cursorEnd };

    const shouldReplacePlaceholder =
      command.type === "insert" &&
      replaceText.length > 0 &&
      range.start === range.end &&
      graphemeAtCursor(lines, range.start) === "\u200B";
    const effectiveRange = shouldReplacePlaceholder
      ? { start: range.start, end: Math.min(docCursorLength, range.start + 1) }
      : range;

    const startLoc = resolveCursorToLine(lines, effectiveRange.start);
    const endLoc = resolveCursorToLine(lines, effectiveRange.end);
    const startLine = lines[startLoc.lineIndex];
    const endLine = lines[endLoc.lineIndex];
    if (!startLine || !endLine) {
      return null;
    }

    if (
      !pathsEqual(startLine.parentPath, endLine.parentPath) ||
      startLine.indexInParent > endLine.indexInParent
    ) {
      return null;
    }

    const parentPath = startLine.parentPath;
    const parentBlocks = getBlocksAtPath(doc.blocks, parentPath);
    const startIndex = startLine.indexInParent;
    const endIndex = endLine.indexInParent;

    const startBlock = parentBlocks[startIndex];
    const endBlock = parentBlocks[endIndex];
    if (!startBlock || !endBlock) {
      return null;
    }

    // Atomic block handling (generic: works for any block-atom kind).
    //
    // These blocks have no editable text content, but the caret can land on
    // their line start/end boundaries. We still need to support basic editing
    // semantics around them (Enter to create a new paragraph after, Backspace
    // to delete/move across).
    if (cursorStart === cursorEnd) {
      // Enter at an atomic block inserts a new empty paragraph after it.
      if (
        command.type === "insert-line-break" &&
        startBlock.type === "block-atom"
      ) {
        const nextParentBlocks = [
          ...parentBlocks.slice(0, startIndex + 1),
          { type: "paragraph", content: [] } satisfies Block,
          ...parentBlocks.slice(startIndex + 1),
        ];
        const nextDoc: Doc = {
          ...doc,
          blocks: updateBlocksAtPath(
            doc.blocks,
            parentPath,
            () => nextParentBlocks,
          ),
        };
        const nextLines = flattenDocToLines(nextDoc);
        const lineStarts = getLineStartOffsets(nextLines);
        const nextLineIndex = Math.min(
          nextLines.length - 1,
          startLoc.lineIndex + 1,
        );
        return {
          doc: nextDoc,
          nextCursor: lineStarts[nextLineIndex] ?? 0,
          nextAffinity: "forward",
        };
      }

      // Backspace on an atomic block deletes the block.
      if (
        command.type === "delete-backward" &&
        startBlock.type === "block-atom"
      ) {
        const nextParentBlocks = parentBlocks.filter(
          (_, i) => i !== startIndex,
        );
        const ensured =
          nextParentBlocks.length > 0
            ? nextParentBlocks
            : ([{ type: "paragraph", content: [] }] satisfies Block[]);
        const nextDoc: Doc = {
          ...doc,
          blocks: updateBlocksAtPath(doc.blocks, parentPath, () => ensured),
        };
        const nextLines = flattenDocToLines(nextDoc);
        const lineStarts = getLineStartOffsets(nextLines);
        const nextLineIndex = Math.min(
          nextLines.length - 1,
          startLoc.lineIndex,
        );
        return {
          doc: nextDoc,
          nextCursor: lineStarts[nextLineIndex] ?? 0,
          nextAffinity: "forward",
        };
      }

      // Backspace at the start of a paragraph immediately after an atomic block
      // swaps the paragraph above the atomic block (so the paragraph "moves up"
      // and the atomic block "moves down").
      if (
        command.type === "delete-backward" &&
        startBlock.type === "paragraph" &&
        startLoc.offsetInLine === 0 &&
        startLoc.lineIndex > 0
      ) {
        const prevLine = lines[startLoc.lineIndex - 1];
        if (
          prevLine &&
          prevLine.block.type === "block-atom" &&
          pathsEqual(prevLine.parentPath, startLine.parentPath) &&
          prevLine.indexInParent === startLine.indexInParent - 1
        ) {
          const imageIndex = prevLine.indexInParent;
          const paragraphIndex = startLine.indexInParent;
          const nextParentBlocks = parentBlocks.slice();
          const temp = nextParentBlocks[imageIndex];
          nextParentBlocks[imageIndex] = nextParentBlocks[paragraphIndex];
          nextParentBlocks[paragraphIndex] = temp!;

          const nextDoc: Doc = {
            ...doc,
            blocks: updateBlocksAtPath(
              doc.blocks,
              parentPath,
              () => nextParentBlocks,
            ),
          };

          const nextLines = flattenDocToLines(nextDoc);
          const lineStarts = getLineStartOffsets(nextLines);
          const nextLineIndex = Math.max(0, startLoc.lineIndex - 1);
          return {
            doc: nextDoc,
            nextCursor: lineStarts[nextLineIndex] ?? 0,
            nextAffinity: "forward",
          };
        }
      }
    }

    if (startBlock.type !== "paragraph" || endBlock.type !== "paragraph") {
      return null;
    }

    const startRuns = paragraphToRuns(startBlock);
    const endRuns =
      endIndex === startIndex ? startRuns : paragraphToRuns(endBlock);
    const [beforeRuns] = splitRunsAt(startRuns, startLoc.offsetInLine);
    const [, afterRuns] = splitRunsAt(endRuns, endLoc.offsetInLine);

    const hasSelectedText = effectiveRange.start !== effectiveRange.end;
    const baseMarks = hasSelectedText
      ? commonMarksAcrossSelection(
          lines,
          effectiveRange.start,
          effectiveRange.end,
          doc,
        )
      : marksAtCursor(startRuns, startLoc.offsetInLine, affinity);

    const insertDoc = parse(replaceText);
    const insertLines = flattenDocToLines(insertDoc);
    const insertBlocks = insertDoc.blocks;
    const insertCursorLength = cursorLengthForLines(insertLines);

    const replacementBlocks = buildReplacementBlocks({
      baseMarks,
      beforeRuns,
      afterRuns,
      insertBlocks,
    });

    const nextParentBlocks = [
      ...parentBlocks.slice(0, startIndex),
      ...replacementBlocks,
      ...parentBlocks.slice(endIndex + 1),
    ];

    const nextDoc: Doc = {
      ...doc,
      blocks: updateBlocksAtPath(
        doc.blocks,
        parentPath,
        () => nextParentBlocks,
      ),
    };

    const nextDocCursorLength = cursorLengthForLines(
      flattenDocToLines(nextDoc),
    );
    const nextCursor = Math.max(
      0,
      Math.min(nextDocCursorLength, effectiveRange.start + insertCursorLength),
    );
    const nextLines = flattenDocToLines(nextDoc);
    const around = marksAroundCursor(nextDoc, nextCursor);
    const fallbackAffinity: Affinity =
      command.type === "delete-backward"
        ? "backward"
        : command.type === "delete-forward"
          ? "forward"
          : command.type === "insert"
            ? effectiveRange.start === effectiveRange.end
              ? affinity
              : "forward"
            : "forward";
    let nextAffinity =
      command.type === "insert"
        ? preferredTypingAffinityAtGap(
            around.left,
            around.right,
            fallbackAffinity,
          )
        : preferredAffinityAtGap(around.left, around.right, fallbackAffinity);

    // If the cursor is at the start of a non-first line (i.e., right after a
    // serialized newline), keep affinity "forward" so selection anchors in the
    // following line, not at the end of the previous one.
    const nextLoc = resolveCursorToLine(nextLines, nextCursor);
    const lineStarts = getLineStartOffsets(nextLines);
    if (
      nextLoc.lineIndex > 0 &&
      nextLoc.offsetInLine === 0 &&
      nextCursor === (lineStarts[nextLoc.lineIndex] ?? 0)
    ) {
      nextAffinity = "forward";
    }
    return {
      doc: nextDoc,
      nextCursor,
      nextAffinity,
    };
  }

  function cursorLengthForLines(
    lines: Array<{ cursorLength: number; hasNewline: boolean }>,
  ): number {
    let length = 0;
    for (const line of lines) {
      length += line.cursorLength;
      if (line.hasNewline) {
        length += 1;
      }
    }
    return length;
  }

  function flattenDocToLines(doc: Doc): FlatBlockLine[] {
    const entries: Array<{ path: number[]; block: Block }> = [];
    const visit = (blocks: Block[], prefix: number[]) => {
      blocks.forEach((block, index) => {
        const path = [...prefix, index];
        if (block.type === "block-wrapper") {
          visit(block.blocks, path);
          return;
        }
        entries.push({ path, block });
      });
    };
    visit(doc.blocks, []);
    if (entries.length === 0) {
      return [
        {
          path: [0],
          parentPath: [],
          indexInParent: 0,
          block: { type: "paragraph", content: [] },
          text: "",
          cursorLength: 0,
          hasNewline: false,
        },
      ];
    }
    return entries.map((entry, i) => {
      const parentPath = entry.path.slice(0, -1);
      const indexInParent = entry.path[entry.path.length - 1] ?? 0;
      const text = blockVisibleText(entry.block);
      return {
        path: entry.path,
        parentPath,
        indexInParent,
        block: entry.block,
        text,
        cursorLength: graphemeSegments(text).length,
        hasNewline: i < entries.length - 1,
      };
    });
  }

  function resolveCursorToLine(
    lines: FlatBlockLine[],
    cursorOffset: number,
  ): { lineIndex: number; offsetInLine: number } {
    const total = cursorLengthForLines(lines);
    const clamped = Math.max(0, Math.min(cursorOffset, total));
    let start = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const end = start + line.cursorLength;
      if (clamped <= end || i === lines.length - 1) {
        return {
          lineIndex: i,
          offsetInLine: Math.max(
            0,
            Math.min(clamped - start, line.cursorLength),
          ),
        };
      }
      start = end + (line.hasNewline ? 1 : 0);
      if (line.hasNewline && clamped === start) {
        return {
          lineIndex: Math.min(lines.length - 1, i + 1),
          offsetInLine: 0,
        };
      }
    }
    return {
      lineIndex: lines.length - 1,
      offsetInLine: lines[lines.length - 1]?.cursorLength ?? 0,
    };
  }

  function getLineStartOffsets(lines: FlatBlockLine[]): number[] {
    const offsets: number[] = [];
    let current = 0;
    for (const line of lines) {
      offsets.push(current);
      current += line.cursorLength + (line.hasNewline ? 1 : 0);
    }
    return offsets;
  }

  function graphemeAtCursor(
    lines: FlatBlockLine[],
    cursorOffset: number,
  ): string | null {
    const loc = resolveCursorToLine(lines, cursorOffset);
    const line = lines[loc.lineIndex];
    if (!line) {
      return null;
    }
    if (loc.offsetInLine >= line.cursorLength) {
      return null;
    }
    const segments = Array.from(graphemeSegments(line.text));
    return segments[loc.offsetInLine]?.segment ?? null;
  }

  function blockVisibleText(block: Block): string {
    if (block.type === "paragraph") {
      return block.content.map(inlineVisibleText).join("");
    }
    if (block.type === "block-atom") {
      return "";
    }
    if (block.type === "block-wrapper") {
      return block.blocks.map(blockVisibleText).join("\n");
    }
    return "";
  }

  function inlineVisibleText(inline: Inline): string {
    if (inline.type === "text") {
      return inline.text;
    }
    if (inline.type === "inline-wrapper") {
      return inline.children.map(inlineVisibleText).join("");
    }
    if (inline.type === "inline-atom") {
      return " ";
    }
    return "";
  }

  function stableStringify(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(",")}]`;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts = keys.map(
      (key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`,
    );
    return `{${parts.join(",")}}`;
  }

  function markKey(kind: string, data?: Record<string, unknown>): string {
    const suffix = data ? stableStringify(data) : "";
    return `${kind}:${suffix}`;
  }

  function paragraphToRuns(paragraph: { content: Inline[] }): Run[] {
    const runs: Run[] = [];
    const stack: Mark[] = [];

    const pushText = (text: string) => {
      if (!text) {
        return;
      }
      const marks = stack.slice();
      const last = runs[runs.length - 1];
      if (last && marksEqual(last.marks, marks)) {
        last.text += text;
        return;
      }
      runs.push({ text, marks });
    };

    const walk = (inline: Inline) => {
      if (inline.type === "text") {
        pushText(inline.text);
        return;
      }
      if (inline.type === "inline-atom") {
        pushText(" ");
        return;
      }
      if (inline.type === "inline-wrapper") {
        const data = inline.data as Record<string, unknown> | undefined;
        const mark: Mark = {
          kind: inline.kind,
          data,
          key: markKey(inline.kind, data),
        };
        stack.push(mark);
        for (const child of inline.children) {
          walk(child);
        }
        stack.pop();
      }
    };

    for (const inline of paragraph.content) {
      walk(inline);
    }

    return runs;
  }

  function marksEqual(a: Mark[], b: Mark[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (a[i]?.key !== b[i]?.key) {
        return false;
      }
    }
    return true;
  }

  function sliceRuns(
    runs: Run[],
    startCursor: number,
    endCursor: number,
  ): { before: Run[]; selected: Run[]; after: Run[] } {
    const [left, rest] = splitRunsAt(runs, startCursor);
    const [selected, right] = splitRunsAt(
      rest,
      Math.max(0, endCursor - startCursor),
    );
    return { before: left, selected, after: right };
  }

  function splitRunsAt(runs: Run[], cursorOffset: number): [Run[], Run[]] {
    const left: Run[] = [];
    const right: Run[] = [];
    let remaining = Math.max(0, cursorOffset);
    for (let i = 0; i < runs.length; i += 1) {
      const run = runs[i];
      const segs = Array.from(graphemeSegments(run.text));
      const runLen = segs.length;
      if (remaining === 0) {
        right.push(run, ...runs.slice(i + 1));
        return [left, right];
      }
      if (remaining >= runLen) {
        left.push(run);
        remaining -= runLen;
        continue;
      }
      const leftText = segs
        .slice(0, remaining)
        .map((s) => s.segment)
        .join("");
      const rightText = segs
        .slice(remaining)
        .map((s) => s.segment)
        .join("");
      if (leftText) {
        left.push({ ...run, text: leftText });
      }
      if (rightText) {
        right.push({ ...run, text: rightText });
      }
      right.push(...runs.slice(i + 1));
      return [left, right];
    }
    return [left, right];
  }

  function commonMarksPrefix(runs: Run[]): Mark[] {
    if (runs.length === 0) {
      return [];
    }
    let prefix = runs[0]?.marks ?? [];
    for (let i = 1; i < runs.length; i += 1) {
      const marks = runs[i]?.marks ?? [];
      const max = Math.min(prefix.length, marks.length);
      let j = 0;
      for (; j < max; j += 1) {
        if (prefix[j]?.key !== marks[j]?.key) {
          break;
        }
      }
      prefix = prefix.slice(0, j);
      if (prefix.length === 0) {
        return [];
      }
    }
    return prefix;
  }

  function marksAtCursor(
    runs: Run[],
    cursorOffset: number,
    affinity: Affinity,
  ): Mark[] {
    const left =
      cursorOffset > 0 ? marksAtGraphemeIndex(runs, cursorOffset - 1) : null;
    const right = marksAtGraphemeIndex(runs, cursorOffset);
    if (affinity === "backward") {
      return left ?? [];
    }
    return right ?? [];
  }

  function marksAtGraphemeIndex(runs: Run[], index: number): Mark[] | null {
    if (index < 0) {
      return null;
    }
    let remaining = index;
    for (const run of runs) {
      const segs = Array.from(graphemeSegments(run.text));
      if (remaining < segs.length) {
        return run.marks;
      }
      remaining -= segs.length;
    }
    return null;
  }

  function marksAroundCursor(
    doc: Doc,
    cursorOffset: number,
  ): { left: Mark[]; right: Mark[] } {
    const lines = flattenDocToLines(doc);
    const loc = resolveCursorToLine(lines, cursorOffset);
    const line = lines[loc.lineIndex];
    if (!line) {
      return { left: [], right: [] };
    }
    const block = getBlockAtPath(doc.blocks, line.path);
    if (!block || block.type !== "paragraph") {
      return { left: [], right: [] };
    }
    const runs = paragraphToRuns(block);
    const left =
      loc.offsetInLine > 0
        ? marksAtGraphemeIndex(runs, loc.offsetInLine - 1)
        : null;
    const right = marksAtGraphemeIndex(runs, loc.offsetInLine);
    return { left: left ?? [], right: right ?? [] };
  }

  function preferredAffinityAtGap(
    left: Mark[],
    right: Mark[],
    fallback: Affinity,
  ): Affinity {
    if (isMarksPrefix(left, right) && right.length > left.length) {
      return "forward";
    }
    if (isMarksPrefix(right, left) && left.length > right.length) {
      return "backward";
    }
    return fallback;
  }

  function preferredTypingAffinityAtGap(
    left: Mark[],
    right: Mark[],
    fallback: Affinity,
  ): Affinity {
    // For typing, treat non-inclusive wrappers (e.g. links) as "exited" at the
    // end boundary so new characters don't extend them (v1 parity).
    if (isMarksPrefix(right, left) && left.length > right.length) {
      const extras = left.slice(right.length);
      if (extras.some((mark) => !isInclusiveAtEnd(mark.kind))) {
        return "forward";
      }
    }
    return preferredAffinityAtGap(left, right, fallback);
  }

  function isMarksPrefix(prefix: Mark[], full: Mark[]): boolean {
    if (prefix.length > full.length) {
      return false;
    }
    for (let i = 0; i < prefix.length; i += 1) {
      if (prefix[i]?.key !== full[i]?.key) {
        return false;
      }
    }
    return true;
  }

  function normalizeRuns(runs: Run[]): Run[] {
    const next: Run[] = [];
    for (const run of runs) {
      if (!run.text) {
        continue;
      }
      const prev = next[next.length - 1];
      if (prev && marksEqual(prev.marks, run.marks)) {
        prev.text += run.text;
        continue;
      }
      next.push(run);
    }
    return next;
  }

  function runsToInlines(runs: Run[]): Inline[] {
    const root: Inline[] = [];
    const wrapperStack: Array<{ mark: Mark; children: Inline[] }> = [];

    const currentChildren = () =>
      wrapperStack.length === 0
        ? root
        : (wrapperStack[wrapperStack.length - 1]?.children ?? root);

    const closeTo = (depth: number) => {
      while (wrapperStack.length > depth) {
        wrapperStack.pop();
      }
    };

    const openFrom = (marks: Mark[], start: number) => {
      for (let i = start; i < marks.length; i += 1) {
        const mark = marks[i];
        if (!mark) {
          continue;
        }
        const wrapper: Inline = {
          type: "inline-wrapper",
          kind: mark.kind,
          data: mark.data,
          children: [],
        };
        currentChildren().push(wrapper);
        wrapperStack.push({
          mark,
          children: (wrapper as { children: Inline[] }).children,
        });
      }
    };

    let openMarks: Mark[] = [];

    for (const run of runs) {
      const marks = run.marks;
      const max = Math.min(openMarks.length, marks.length);
      let common = 0;
      for (; common < max; common += 1) {
        if (openMarks[common]?.key !== marks[common]?.key) {
          break;
        }
      }

      closeTo(common);
      openMarks = openMarks.slice(0, common);
      openFrom(marks, common);
      openMarks = marks;

      if (run.text) {
        currentChildren().push({ type: "text", text: run.text });
      }
    }

    closeTo(0);
    return root;
  }

  function buildReplacementBlocks(params: {
    baseMarks: Mark[];
    beforeRuns: Run[];
    afterRuns: Run[];
    insertBlocks: Block[];
  }): Block[] {
    const { baseMarks, beforeRuns, afterRuns, insertBlocks } = params;
    const firstParagraphIndex = insertBlocks.findIndex(
      (b) => b.type === "paragraph",
    );
    const lastParagraphIndex = (() => {
      for (let i = insertBlocks.length - 1; i >= 0; i -= 1) {
        if (insertBlocks[i]?.type === "paragraph") {
          return i;
        }
      }
      return -1;
    })();

    if (firstParagraphIndex === -1 || lastParagraphIndex === -1) {
      const mergedRuns = normalizeRuns([...beforeRuns, ...afterRuns]);
      return [
        { type: "paragraph", content: runsToInlines(mergedRuns) },
        ...insertBlocks,
      ];
    }

    const blocks: Block[] = [];
    insertBlocks.forEach((block, index) => {
      if (block.type !== "paragraph") {
        blocks.push(block);
        return;
      }
      const insertRuns = paragraphToRuns(block).map((run) => ({
        ...run,
        marks: [...baseMarks, ...run.marks],
      }));

      if (index === firstParagraphIndex && index === lastParagraphIndex) {
        const mergedRuns = normalizeRuns([
          ...beforeRuns,
          ...insertRuns,
          ...afterRuns,
        ]);
        blocks.push({ ...block, content: runsToInlines(mergedRuns) });
        return;
      }
      if (index === firstParagraphIndex) {
        const mergedRuns = normalizeRuns([...beforeRuns, ...insertRuns]);
        blocks.push({ ...block, content: runsToInlines(mergedRuns) });
        return;
      }
      if (index === lastParagraphIndex) {
        const mergedRuns = normalizeRuns([...insertRuns, ...afterRuns]);
        blocks.push({ ...block, content: runsToInlines(mergedRuns) });
        return;
      }
      blocks.push({
        ...block,
        content: runsToInlines(normalizeRuns(insertRuns)),
      });
    });

    return blocks;
  }

  function commonMarksAcrossSelection(
    lines: FlatBlockLine[],
    startCursor: number,
    endCursor: number,
    doc: Doc,
  ): Mark[] {
    if (startCursor === endCursor) {
      return [];
    }
    const startLoc = resolveCursorToLine(lines, startCursor);
    const endLoc = resolveCursorToLine(lines, endCursor);
    const slices: Run[] = [];
    for (
      let lineIndex = startLoc.lineIndex;
      lineIndex <= endLoc.lineIndex;
      lineIndex += 1
    ) {
      const line = lines[lineIndex];
      if (!line) {
        continue;
      }
      const block = getBlockAtPath(doc.blocks, line.path);
      if (!block || block.type !== "paragraph") {
        continue;
      }
      const runs = paragraphToRuns(block);
      const startInLine =
        lineIndex === startLoc.lineIndex ? startLoc.offsetInLine : 0;
      const endInLine =
        lineIndex === endLoc.lineIndex
          ? endLoc.offsetInLine
          : line.cursorLength;
      slices.push(...sliceRuns(runs, startInLine, endInLine).selected);
    }

    return commonMarksPrefix(slices);
  }

  function getBlockAtPath(blocks: Block[], path: number[]): Block | null {
    let current: Block | null = null;
    let currentBlocks = blocks;
    for (let depth = 0; depth < path.length; depth += 1) {
      const index = path[depth] ?? 0;
      current = currentBlocks[index] ?? null;
      if (!current) {
        return null;
      }
      if (current.type === "block-wrapper") {
        currentBlocks = current.blocks;
      } else if (depth < path.length - 1) {
        return null;
      }
    }
    return current;
  }

  function getBlocksAtPath(blocks: Block[], path: number[]): Block[] {
    let current = blocks;
    for (const index of path) {
      const block = current[index];
      if (!block || block.type !== "block-wrapper") {
        return current;
      }
      current = block.blocks;
    }
    return current;
  }

  function updateBlocksAtPath(
    blocks: Block[],
    path: number[],
    updater: (blocks: Block[]) => Block[],
  ): Block[] {
    if (path.length === 0) {
      return updater(blocks);
    }
    const [head, ...rest] = path;
    const target = blocks[head];
    if (!target || target.type !== "block-wrapper") {
      return blocks;
    }
    const nextChildBlocks = updateBlocksAtPath(target.blocks, rest, updater);
    return blocks.map((block, index) =>
      index === head ? { ...target, blocks: nextChildBlocks } : block,
    );
  }

  function pathsEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  function applyInlineToggle(
    state: RuntimeState,
    marker: string,
  ): RuntimeState {
    const selection = normalizeSelection(state.selection);
    const source = state.source;
    const map = state.map;

    if (selection.start === selection.end) {
      const caret = selection.start;
      const markerLen = marker.length;

      // When the caret is at the end boundary of an inline wrapper, toggling the
      // wrapper should "exit" it (so the next character types outside). This is
      // best expressed in cursor space by flipping affinity to "forward" when we
      // are leaving a wrapper of the requested kind.
      const markerKind = toggleMarkerToKind.get(marker) ?? null;
      if (markerKind) {
        const around = marksAroundCursor(state.doc, caret);
        if (
          isMarksPrefix(around.right, around.left) &&
          around.left.length > around.right.length
        ) {
          const exiting = around.left.slice(around.right.length);
          if (exiting.some((mark) => mark.kind === markerKind)) {
            return {
              ...state,
              selection: {
                start: caret,
                end: caret,
                affinity: "forward",
              },
            };
          }
        }
      }

      // Otherwise, insert an empty marker pair with a zero-width placeholder
      // selected so the next typed character replaces it.
      //
      // If the caret is already positioned before an existing placeholder (e.g.
      // Cmd+B then Cmd+I), wrap the existing placeholder rather than inserting
      // a second one so typing produces combined emphasis (***text***).
      const placeholder = "\u200B";
      const insertAtForward = map.cursorToSource(caret, "forward");
      const insertAtBackward = map.cursorToSource(caret, "backward");
      const placeholderPos = (() => {
        const candidates = [insertAtForward, insertAtBackward];
        for (const candidate of candidates) {
          if (source[candidate] === placeholder) {
            return candidate;
          }
          if (candidate > 0 && source[candidate - 1] === placeholder) {
            return candidate - 1;
          }
        }
        return null;
      })();
      const insertAt =
        placeholderPos ??
        map.cursorToSource(caret, selection.affinity ?? "forward");

      const nextSource =
        placeholderPos !== null
          ? source.slice(0, insertAt) +
            marker +
            placeholder +
            marker +
            source.slice(insertAt + placeholder.length)
          : source.slice(0, insertAt) +
            marker +
            placeholder +
            marker +
            source.slice(insertAt);
      const next = createState(nextSource);

      const placeholderStart = insertAt + markerLen;
      const startCursor = next.map.sourceToCursor(placeholderStart, "forward");

      return {
        ...next,
        selection: {
          start: startCursor.cursorOffset,
          end: startCursor.cursorOffset,
          affinity: "forward",
        },
      };
    }

    const cursorStart = Math.min(selection.start, selection.end);
    const cursorEnd = Math.max(selection.start, selection.end);
    const from = map.cursorToSource(cursorStart, "forward");
    const to = map.cursorToSource(cursorEnd, "backward");

    const selectedText = source.slice(from, to);

    const markerLen = marker.length;
    const isSelectionWrappedByAdjacentMarkers =
      markerLen > 0 &&
      from >= markerLen &&
      source.slice(from - markerLen, from) === marker &&
      source.slice(to, to + markerLen) === marker;
    const isWrapped =
      isSelectionWrappedByAdjacentMarkers ||
      (selectedText.startsWith(marker) &&
        selectedText.endsWith(marker) &&
        selectedText.length >= markerLen * 2);

    let newSource: string;

    if (isWrapped) {
      // Unwrap
      if (isSelectionWrappedByAdjacentMarkers) {
        newSource =
          source.slice(0, from - markerLen) +
          selectedText +
          source.slice(to + markerLen);
      } else {
        const unwrapped = selectedText.slice(markerLen, -markerLen);
        newSource = source.slice(0, from) + unwrapped + source.slice(to);
      }
    } else {
      // Wrap
      const wrapped = marker + selectedText + marker;
      newSource = source.slice(0, from) + wrapped + source.slice(to);
    }

    const next = createState(newSource);

    return {
      ...next,
      selection: {
        start: cursorStart,
        end: cursorEnd,
        affinity: selection.affinity ?? "forward",
      },
    };
  }

  function updateSelection(
    state: RuntimeState,
    selection: Selection,
    options?: { kind?: "dom" | "keyboard" | "programmatic" },
  ): RuntimeState {
    const normalized = normalizeSelection(selection);
    const cursorLength = state.map.cursorLength;
    const start = Math.max(0, Math.min(cursorLength, normalized.start));
    const end = Math.max(0, Math.min(cursorLength, normalized.end));
    const kind = options?.kind ?? "programmatic";
    let affinity: Affinity = normalized.affinity ?? "forward";

    if (start === end) {
      const around = marksAroundCursor(state.doc, start);

      if (kind === "keyboard") {
        affinity = preferredTypingAffinityAtGap(
          around.left,
          around.right,
          affinity,
        );
      } else if (kind === "dom") {
        // Keep DOM-provided affinity unless it would keep the caret inside a
        // non-inclusive wrapper at its end boundary (v1 parity for links).
        if (affinity === "backward") {
          if (
            isMarksPrefix(around.right, around.left) &&
            around.left.length > around.right.length
          ) {
            const extras = around.left.slice(around.right.length);
            if (extras.some((mark) => !isInclusiveAtEnd(mark.kind))) {
              affinity = "forward";
            }
          }
        }
      }
    }

    return {
      ...state,
      selection: { start, end, affinity },
    };
  }

  function serializeSelection(
    state: RuntimeState,
    selection: Selection,
  ): string {
    const normalized = normalizeSelection(selection);
    const lines = flattenDocToLines(state.doc);
    const docCursorLength = cursorLengthForLines(lines);
    const cursorStart = Math.max(
      0,
      Math.min(docCursorLength, Math.min(normalized.start, normalized.end)),
    );
    const cursorEnd = Math.max(
      0,
      Math.min(docCursorLength, Math.max(normalized.start, normalized.end)),
    );

    if (cursorStart === cursorEnd) {
      return "";
    }

    const startLoc = resolveCursorToLine(lines, cursorStart);
    const endLoc = resolveCursorToLine(lines, cursorEnd);

    const blocks: Block[] = [];
    for (
      let lineIndex = startLoc.lineIndex;
      lineIndex <= endLoc.lineIndex;
      lineIndex += 1
    ) {
      const line = lines[lineIndex];
      if (!line) {
        continue;
      }
      const block = getBlockAtPath(state.doc.blocks, line.path);
      if (!block || block.type !== "paragraph") {
        continue;
      }

      const runs = paragraphToRuns(block);
      const startInLine =
        lineIndex === startLoc.lineIndex ? startLoc.offsetInLine : 0;
      const endInLine =
        lineIndex === endLoc.lineIndex
          ? endLoc.offsetInLine
          : line.cursorLength;

      const selectedRuns = sliceRuns(runs, startInLine, endInLine).selected;
      const content = runsToInlines(normalizeRuns(selectedRuns));
      blocks.push({ type: "paragraph", content });
    }

    const sliceDoc: Doc = {
      type: "doc",
      blocks: blocks.length > 0 ? blocks : [{ type: "paragraph", content: [] }],
    };

    return serialize(normalize(sliceDoc)).source;
  }

  const runtime: Runtime = {
    extensions,
    parse,
    serialize,
    createState,
    updateSelection,
    serializeSelection,
    applyEdit,
  };

  return runtime;
}

function parseLiteralBlock(
  source: string,
  start: number,
  context: ExtensionContext,
): BlockParseResult {
  let end = source.indexOf("\n", start);
  if (end === -1) {
    end = source.length;
  }

  const content = context.parseInline(source, start, end);
  return { block: { type: "paragraph", content }, nextPos: end };
}

function parseLiteralInline(
  source: string,
  start: number,
  end: number,
): InlineParseResult {
  const segment = graphemeSegments(source.slice(start, end))[0];
  const text = segment ? segment.segment : (source[start] ?? "");
  return { inline: { type: "text", text }, nextPos: start + text.length };
}

function serializeParagraph(
  block: Block & { type: "paragraph" },
  serializeInline: (inline: Inline) => SerializeInlineResult,
): SerializeBlockResult {
  const builder = new CursorSourceBuilder();
  for (const inline of block.content) {
    const serialized = serializeInline(inline);
    builder.appendSerialized(serialized);
  }
  return builder.build();
}

function serializeInlineWrapper(
  inline: Inline & { type: "inline-wrapper" },
  serializeInline: (inline: Inline) => SerializeInlineResult,
): SerializeInlineResult {
  const builder = new CursorSourceBuilder();
  for (const child of inline.children) {
    const serialized = serializeInline(child);
    builder.appendSerialized(serialized);
  }
  return builder.build();
}

function serializeBlockWrapper(
  block: Block & { type: "block-wrapper" },
  serializeBlock: (block: Block) => SerializeBlockResult,
): SerializeBlockResult {
  const builder = new CursorSourceBuilder();
  block.blocks.forEach((child, index) => {
    const serialized = serializeBlock(child);
    builder.appendSerialized(serialized);
    if (index < block.blocks.length - 1) {
      builder.appendText("\n");
    }
  });
  return builder.build();
}

function normalizeSelection(selection: Selection): Selection {
  if (selection.start <= selection.end) {
    return selection;
  }
  const isRange = selection.start !== selection.end;
  return {
    ...selection,
    start: selection.end,
    end: selection.start,
    affinity: isRange ? "backward" : selection.affinity,
  };
}
