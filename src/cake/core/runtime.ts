import type {
  Affinity,
  Block,
  Doc,
  Inline,
  ParagraphBlock,
  Selection,
} from "./types";
import type { CakeExtension } from "../editor/extension-types";

export type { CakeExtension, CakeUIComponent } from "../editor/extension-types";
import {
  CursorSourceBuilder,
  createCompositeCursorSourceMap,
  type CursorSourceMap,
} from "./mapping/cursor-source-map";
import { graphemeSegments } from "../shared/segmenter";
import type { DomRenderContext } from "../dom/types";
import {
  getEditorTextModelForDoc,
  type StructuralLineInfo,
} from "../editor/internal/editor-text-model";

type BlockParseResult = { block: Block; nextPos: number };
type InlineParseResult = { inline: Inline; nextPos: number };

export type ParseBlockResult = BlockParseResult | null;
export type ParseInlineResult = InlineParseResult | null;

export type SerializeBlockResult = { source: string; map: CursorSourceMap };
export type SerializeInlineResult = { source: string; map: CursorSourceMap };

/** Insert command */
export type InsertCommand = { type: "insert"; text: string };

/** Commands that can be applied directly by the engine */
export type ApplyEditCommand =
  | InsertCommand
  | { type: "insert-line-break" }
  | { type: "insert-hard-line-break" }
  | { type: "delete-backward" }
  | { type: "delete-forward" };

/** Structural edit commands that modify document structure */
export type StructuralEditCommand =
  | ApplyEditCommand
  | { type: "exit-block-wrapper" };

export type StructuralReparsePolicy = (
  command: StructuralEditCommand,
) => boolean;

/** Core edit commands handled by the runtime */
export type CoreEditCommand =
  | StructuralEditCommand
  | { type: "indent" }
  | { type: "outdent" }
  | { type: "toggle-inline"; marker: string };

/** Base type for extension-defined commands */
export type ExtensionCommand = {
  type: string;
  [key: string]: any;
};

/**
 * Edit commands can be core commands or extension-defined commands.
 * Extensions handle their own commands in onEdit before the core processes them.
 */
export type EditCommand = CoreEditCommand | ExtensionCommand;

/** Type guard to check if a command is a structural edit */
export function isStructuralEdit(
  command: EditCommand,
): command is StructuralEditCommand {
  return (
    command.type === "insert" ||
    command.type === "delete-backward" ||
    command.type === "delete-forward" ||
    command.type === "insert-line-break" ||
    command.type === "insert-hard-line-break" ||
    command.type === "exit-block-wrapper"
  );
}

/** Type guard to check if a command can be applied directly by the engine */
export function isApplyEditCommand(
  command: EditCommand,
): command is ApplyEditCommand {
  return (
    command.type === "insert" ||
    command.type === "insert-line-break" ||
    command.type === "insert-hard-line-break" ||
    command.type === "delete-backward" ||
    command.type === "delete-forward"
  );
}

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

export type DomInlineRenderer = (
  inline: Inline,
  context: DomRenderContext,
) => Node | Node[] | null;

export type DomBlockRenderer = (
  block: Block,
  context: DomRenderContext,
) => Node | Node[] | null;

export type ToggleInlineSpec = {
  kind: string;
  markers: Array<string | { open: string; close: string }>;
};

export type InlineHtmlMark = {
  kind: string;
  data?: Record<string, unknown>;
};

export type InlineHtmlSerializer = (
  mark: InlineHtmlMark,
  content: string,
  context: { escapeHtml: (text: string) => string },
) => string | null;

export type SerializeBlockToHtml = (
  block: Block,
  context: {
    escapeHtml: (text: string) => string;
    serializeBlock: (block: Block) => SerializeBlockResult;
  },
) => string | null;

export type SelectionHtmlGroup = {
  key: string;
  open: string;
  close: string;
};

export type SerializeSelectionLineToHtmlContext = {
  state: RuntimeState;
  line: StructuralLineInfo;
  block: ParagraphBlock;
  wrapperBlock: Block | null;
  lineText: string;
  startInLine: number;
  endInLine: number;
  lineCursorLength: number;
  selectedHtml: string;
};

export type SerializeSelectionLineToHtmlResult = {
  html: string;
  group?: SelectionHtmlGroup;
};

export type SerializeSelectionLineToHtml = (
  context: SerializeSelectionLineToHtmlContext,
) => SerializeSelectionLineToHtmlResult | null;

export type RuntimeState = {
  source: string;
  selection: Selection;
  map: CursorSourceMap;
  doc: Doc;
  runtime: Runtime;
};

export type Runtime = {
  dom: {
    inlineRenderers: DomInlineRenderer[];
    blockRenderers: DomBlockRenderer[];
  };
  parse(source: string): Doc;
  serialize(doc: Doc): { source: string; map: CursorSourceMap };
  createState(source: string, selection?: Selection): RuntimeState;
  createStateFromDoc(
    doc: Doc,
    selection?: Selection,
    options?: { previousState?: RuntimeState; mode?: "incremental" | "full" },
  ): RuntimeState;
  updateSelection(
    state: RuntimeState,
    selection: Selection,
    options?: { kind?: "dom" | "keyboard" | "programmatic" },
  ): RuntimeState;
  serializeSelection(state: RuntimeState, selection: Selection): string;
  serializeSelectionToHtml(state: RuntimeState, selection: Selection): string;
  applyEdit(command: EditCommand, state: RuntimeState): RuntimeState;
};

const defaultSelection: Selection = { start: 0, end: 0, affinity: "forward" };
const WORD_CHARACTER_PATTERN = /[\p{L}\p{N}_]/u;

function removeFromArray<T>(arr: T[], value: T) {
  const index = arr.indexOf(value);
  if (index === -1) {
    return;
  }
  arr.splice(index, 1);
}

export function createRuntimeForTests(extensions: CakeExtension[]): Runtime {
  const toggleMarkerToSpec = new Map<
    string,
    { kind: string; open: string; close: string }
  >();
  const inclusiveAtEndByKind = new Map<string, boolean>();
  const parseBlockFns: Array<
    (
      source: string,
      start: number,
      context: ExtensionContext,
    ) => ParseBlockResult
  > = [];
  const parseInlineFns: Array<
    (
      source: string,
      start: number,
      end: number,
      context: ExtensionContext,
    ) => ParseInlineResult
  > = [];
  const serializeBlockFns: Array<
    (block: Block, context: ExtensionContext) => SerializeBlockResult | null
  > = [];
  const serializeInlineFns: Array<
    (inline: Inline, context: ExtensionContext) => SerializeInlineResult | null
  > = [];
  const normalizeBlockFns: Array<(block: Block) => Block | null> = [];
  const normalizeInlineFns: Array<(inline: Inline) => Inline | null> = [];
  const onEditFns: Array<
    (
      command: EditCommand,
      state: RuntimeState,
    ) => EditResult | EditCommand | null
  > = [];
  const structuralReparsePolicies: StructuralReparsePolicy[] = [];
  const domInlineRenderers: DomInlineRenderer[] = [];
  const domBlockRenderers: DomBlockRenderer[] = [];
  const inlineHtmlSerializers: InlineHtmlSerializer[] = [];
  const serializeBlockToHtmlFns: SerializeBlockToHtml[] = [];
  const serializeSelectionLineToHtmlFns: SerializeSelectionLineToHtml[] = [];

  const editor = {
    registerInlineWrapperAffinity: (specs: InlineWrapperAffinity[]) => {
      for (const spec of specs) {
        if (!inclusiveAtEndByKind.has(spec.kind)) {
          inclusiveAtEndByKind.set(spec.kind, spec.inclusive);
        }
      }
      return () => {
        for (const spec of specs) {
          const current = inclusiveAtEndByKind.get(spec.kind);
          if (current === spec.inclusive) {
            inclusiveAtEndByKind.delete(spec.kind);
          }
        }
      };
    },
    registerToggleInline: (toggle: ToggleInlineSpec) => {
      const added: Array<{ open: string; kind: string; close: string }> = [];
      for (const marker of toggle.markers) {
        const spec =
          typeof marker === "string"
            ? { kind: toggle.kind, open: marker, close: marker }
            : { kind: toggle.kind, open: marker.open, close: marker.close };
        toggleMarkerToSpec.set(spec.open, spec);
        added.push(spec);
      }
      return () => {
        for (const spec of added) {
          const current = toggleMarkerToSpec.get(spec.open);
          if (
            current &&
            current.kind === spec.kind &&
            current.close === spec.close
          ) {
            toggleMarkerToSpec.delete(spec.open);
          }
        }
      };
    },
    registerParseBlock: (
      fn: (
        source: string,
        start: number,
        context: ExtensionContext,
      ) => ParseBlockResult,
    ) => {
      parseBlockFns.push(fn);
      return () => removeFromArray(parseBlockFns, fn);
    },
    registerParseInline: (
      fn: (
        source: string,
        start: number,
        end: number,
        context: ExtensionContext,
      ) => ParseInlineResult,
    ) => {
      parseInlineFns.push(fn);
      return () => removeFromArray(parseInlineFns, fn);
    },
    registerSerializeBlock: (
      fn: (
        block: Block,
        context: ExtensionContext,
      ) => SerializeBlockResult | null,
    ) => {
      serializeBlockFns.push(fn);
      return () => removeFromArray(serializeBlockFns, fn);
    },
    registerSerializeInline: (
      fn: (
        inline: Inline,
        context: ExtensionContext,
      ) => SerializeInlineResult | null,
    ) => {
      serializeInlineFns.push(fn);
      return () => removeFromArray(serializeInlineFns, fn);
    },
    registerNormalizeBlock: (fn: (block: Block) => Block | null) => {
      normalizeBlockFns.push(fn);
      return () => removeFromArray(normalizeBlockFns, fn);
    },
    registerNormalizeInline: (fn: (inline: Inline) => Inline | null) => {
      normalizeInlineFns.push(fn);
      return () => removeFromArray(normalizeInlineFns, fn);
    },
    registerOnEdit: (
      fn: (
        command: EditCommand,
        state: RuntimeState,
      ) => EditResult | EditCommand | null,
    ) => {
      onEditFns.push(fn);
      return () => removeFromArray(onEditFns, fn);
    },
    registerStructuralReparsePolicy: (fn: StructuralReparsePolicy) => {
      structuralReparsePolicies.push(fn);
      return () => removeFromArray(structuralReparsePolicies, fn);
    },
    registerOnPasteText: () => {
      return () => {};
    },
    registerNormalizePasteText: () => {
      return () => {};
    },
    registerActiveMarksResolver: () => {
      return () => {};
    },
    registerKeybindings: () => {
      return () => {};
    },
    registerInlineRenderer: (fn: DomInlineRenderer) => {
      domInlineRenderers.push(fn);
      return () => removeFromArray(domInlineRenderers, fn);
    },
    registerBlockRenderer: (fn: DomBlockRenderer) => {
      domBlockRenderers.push(fn);
      return () => removeFromArray(domBlockRenderers, fn);
    },
    registerInlineHtmlSerializer: (fn: InlineHtmlSerializer) => {
      inlineHtmlSerializers.push(fn);
      return () => removeFromArray(inlineHtmlSerializers, fn);
    },
    registerSerializeBlockToHtml: (fn: SerializeBlockToHtml) => {
      serializeBlockToHtmlFns.push(fn);
      return () => removeFromArray(serializeBlockToHtmlFns, fn);
    },
    registerSerializeSelectionLineToHtml: (fn: SerializeSelectionLineToHtml) => {
      serializeSelectionLineToHtmlFns.push(fn);
      return () => removeFromArray(serializeSelectionLineToHtmlFns, fn);
    },
    registerUI: () => {
      return () => {};
    },
  };

  for (const extension of extensions) {
    extension(editor as unknown as import("../editor/cake-editor").CakeEditor);
  }

  const runtime = createRuntimeFromRegistry({
    toggleMarkerToSpec,
    inclusiveAtEndByKind,
    parseBlockFns,
    parseInlineFns,
    serializeBlockFns,
    serializeInlineFns,
    normalizeBlockFns,
    normalizeInlineFns,
    onEditFns,
    structuralReparsePolicies,
    domInlineRenderers,
    domBlockRenderers,
    inlineHtmlSerializers,
    serializeBlockToHtmlFns,
    serializeSelectionLineToHtmlFns,
  });

  return runtime;
}

export function createRuntimeFromRegistry(registry: {
  toggleMarkerToSpec: Map<
    string,
    { kind: string; open: string; close: string }
  >;
  inclusiveAtEndByKind: Map<string, boolean>;
  parseBlockFns: Array<
    (
      source: string,
      start: number,
      context: ExtensionContext,
    ) => ParseBlockResult
  >;
  parseInlineFns: Array<
    (
      source: string,
      start: number,
      end: number,
      context: ExtensionContext,
    ) => ParseInlineResult
  >;
  serializeBlockFns: Array<
    (block: Block, context: ExtensionContext) => SerializeBlockResult | null
  >;
  serializeInlineFns: Array<
    (inline: Inline, context: ExtensionContext) => SerializeInlineResult | null
  >;
  normalizeBlockFns: Array<(block: Block) => Block | null>;
  normalizeInlineFns: Array<(inline: Inline) => Inline | null>;
  onEditFns: Array<
    (
      command: EditCommand,
      state: RuntimeState,
    ) => EditResult | EditCommand | null
  >;
  structuralReparsePolicies: StructuralReparsePolicy[];
  domInlineRenderers: DomInlineRenderer[];
  domBlockRenderers: DomBlockRenderer[];
  inlineHtmlSerializers: InlineHtmlSerializer[];
  serializeBlockToHtmlFns: SerializeBlockToHtml[];
  serializeSelectionLineToHtmlFns: SerializeSelectionLineToHtml[];
}): Runtime {
  const {
    toggleMarkerToSpec,
    inclusiveAtEndByKind,
    parseBlockFns,
    parseInlineFns,
    serializeBlockFns,
    serializeInlineFns,
    normalizeBlockFns,
    normalizeInlineFns,
    onEditFns,
    structuralReparsePolicies,
    domInlineRenderers,
    domBlockRenderers,
    inlineHtmlSerializers,
    serializeBlockToHtmlFns,
    serializeSelectionLineToHtmlFns,
  } = registry;
  const isInclusiveAtEnd = (kind: string): boolean =>
    inclusiveAtEndByKind.get(kind) ?? true;

  type SerializedDocResult = { source: string; map: CursorSourceMap };
  type TopLevelBlockSegment = {
    block: Block;
    source: string;
    map: CursorSourceMap;
    sourceLength: number;
    cursorLength: number;
  };
  type SegmentedDocState = {
    doc: Doc;
    segments: TopLevelBlockSegment[];
    cursorStarts: number[];
    sourceStarts: number[];
    totalCursorLength: number;
    totalSourceLength: number;
    source: string;
    map: CursorSourceMap;
  };

  const removedBlockSentinel = Symbol("removed-block");
  const removedInlineSentinel = Symbol("removed-inline");
  type NormalizedBlockCacheValue = Block | typeof removedBlockSentinel;
  type NormalizedInlineCacheValue = Inline | typeof removedInlineSentinel;

  const normalizedDocCache = new WeakMap<Doc, Doc>();
  const normalizedBlockCache = new WeakMap<Block, NormalizedBlockCacheValue>();
  const normalizedInlineCache = new WeakMap<
    Inline,
    NormalizedInlineCacheValue
  >();
  const serializedDocCache = new WeakMap<Doc, SerializedDocResult>();
  const serializedBlockCache = new WeakMap<Block, SerializeBlockResult>();
  const serializedInlineCache = new WeakMap<Inline, SerializeInlineResult>();
  const segmentedDocCache = new WeakMap<Doc, SegmentedDocState>();

  const emptyCursorMap = new CursorSourceBuilder().build().map;
  const emptySerialized: SerializeBlockResult = {
    source: "",
    map: emptyCursorMap,
  };

  const extensionContext: ExtensionContext = {
    parseInline: (source, start, end) => parseInlineRange(source, start, end),
    serializeInline: (inline) => serializeInline(inline),
    serializeBlock: (block) => serializeBlock(block),
  };

  function parseBlockAt(source: string, start: number): BlockParseResult {
    for (const parseBlock of parseBlockFns) {
      const result = parseBlock(source, start, extensionContext);
      if (result) {
        return result;
      }
    }

    return parseLiteralBlock(source, start, extensionContext);
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
      for (const parseInline of parseInlineFns) {
        const result = parseInline(source, pos, end, extensionContext);
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
    const cached = serializedDocCache.get(doc);
    if (cached) {
      return cached;
    }

    const builder = new CursorSourceBuilder();
    const blocks = doc.blocks;
    blocks.forEach((block, index) => {
      const serialized = serializeBlock(block);
      builder.appendSerialized(serialized);
      if (index < blocks.length - 1) {
        builder.appendText("\n");
      }
    });

    const serialized = builder.build();
    serializedDocCache.set(doc, serialized);
    return serialized;
  }

  function serializeBlock(block: Block): SerializeBlockResult {
    const cached = serializedBlockCache.get(block);
    if (cached) {
      return cached;
    }

    for (const serializeBlockFn of serializeBlockFns) {
      const result = serializeBlockFn(block, extensionContext);
      if (result) {
        serializedBlockCache.set(block, result);
        return result;
      }
    }

    if (block.type === "paragraph") {
      const result = serializeParagraph(block, (inline) => serializeInline(inline));
      serializedBlockCache.set(block, result);
      return result;
    }

    if (block.type === "block-wrapper") {
      const result = serializeBlockWrapper(block, (child) => serializeBlock(child));
      serializedBlockCache.set(block, result);
      return result;
    }

    serializedBlockCache.set(block, emptySerialized);
    return emptySerialized;
  }

  function serializeInline(inline: Inline): SerializeInlineResult {
    const cached = serializedInlineCache.get(inline);
    if (cached) {
      return cached;
    }

    for (const serializeInlineFn of serializeInlineFns) {
      const result = serializeInlineFn(inline, extensionContext);
      if (result) {
        serializedInlineCache.set(inline, result);
        return result;
      }
    }

    if (inline.type === "text") {
      const builder = new CursorSourceBuilder();
      builder.appendText(inline.text);
      const result = builder.build();
      serializedInlineCache.set(inline, result);
      return result;
    }

    if (inline.type === "inline-wrapper") {
      const result = serializeInlineWrapper(inline, (child) =>
        serializeInline(child),
      );
      serializedInlineCache.set(inline, result);
      return result;
    }

    serializedInlineCache.set(inline, emptySerialized);
    return emptySerialized;
  }

  function normalize(doc: Doc): Doc {
    const cached = normalizedDocCache.get(doc);
    if (cached) {
      return cached;
    }

    let changed = false;
    const blocks: Block[] = [];

    for (const block of doc.blocks) {
      const normalized = normalizeBlock(block);
      if (normalized === null) {
        changed = true;
        continue;
      }
      if (normalized !== block) {
        changed = true;
      }
      blocks.push(normalized);
    }

    const normalized = changed
      ? ({
          type: "doc",
          blocks,
        } satisfies Doc)
      : doc;

    normalizedDocCache.set(doc, normalized);
    if (normalized !== doc) {
      normalizedDocCache.set(normalized, normalized);
    }

    return normalized;
  }

  function normalizeBlock(block: Block): Block | null {
    const cached = normalizedBlockCache.get(block);
    if (cached !== undefined) {
      return cached === removedBlockSentinel ? null : cached;
    }

    let next = block;
    for (const normalizeBlockFn of normalizeBlockFns) {
      const result = normalizeBlockFn(next);
      if (result === null) {
        normalizedBlockCache.set(block, removedBlockSentinel);
        return null;
      }
      next = result;
    }

    if (next.type === "paragraph") {
      let changed = next !== block;
      const content: Inline[] = [];
      for (const inline of next.content) {
        const normalizedInline = normalizeInline(inline);
        if (normalizedInline === null) {
          changed = true;
          continue;
        }
        if (normalizedInline !== inline) {
          changed = true;
        }
        content.push(normalizedInline);
      }
      const mergedContent = mergeAdjacentInlines(content);
      if (mergedContent !== content) {
        changed = true;
      }
      if (!changed) {
        normalizedBlockCache.set(block, next);
        return next;
      }
      const normalized: Block = {
        ...next,
        content: mergedContent,
      };
      normalizedBlockCache.set(block, normalized);
      return normalized;
    }

    if (next.type === "block-wrapper") {
      let changed = next !== block;
      const blocks: Block[] = [];
      for (const child of next.blocks) {
        const normalizedChild = normalizeBlock(child);
        if (normalizedChild === null) {
          changed = true;
          continue;
        }
        if (normalizedChild !== child) {
          changed = true;
        }
        blocks.push(normalizedChild);
      }
      if (!changed) {
        normalizedBlockCache.set(block, next);
        return next;
      }
      const normalized: Block = {
        ...next,
        blocks,
      };
      normalizedBlockCache.set(block, normalized);
      return normalized;
    }

    normalizedBlockCache.set(block, next);
    return next;
  }

  function applyInlineNormalizers(inline: Inline): Inline | null {
    let next = inline;
    for (const normalizeInlineFn of normalizeInlineFns) {
      const result = normalizeInlineFn(next);
      if (result === null) {
        return null;
      }
      next = result;
    }
    return next;
  }

  function normalizeInline(inline: Inline): Inline | null {
    const cached = normalizedInlineCache.get(inline);
    if (cached !== undefined) {
      return cached === removedInlineSentinel ? null : cached;
    }

    const pre = applyInlineNormalizers(inline);
    if (!pre) {
      normalizedInlineCache.set(inline, removedInlineSentinel);
      return null;
    }

    let next = pre;
    if (next.type === "inline-wrapper") {
      const children = mergeAdjacentInlines(
        next.children
          .map((child) => normalizeInline(child))
          .filter((child): child is Inline => child !== null),
      );
      next = {
        ...next,
        children,
      };
    }

    const normalized = applyInlineNormalizers(next);
    normalizedInlineCache.set(inline, normalized ?? removedInlineSentinel);
    return normalized;
  }

  function mergeAdjacentInlines(inlines: Inline[]): Inline[] {
    if (inlines.length < 2) {
      return inlines;
    }

    const merged: Inline[] = [];
    let changed = false;

    for (const inline of inlines) {
      const previous = merged[merged.length - 1];
      if (previous?.type === "text" && inline.type === "text") {
        merged[merged.length - 1] = {
          ...previous,
          text: previous.text + inline.text,
        };
        changed = true;
        continue;
      }
      if (
        previous?.type === "inline-wrapper" &&
        inline.type === "inline-wrapper" &&
        previous.kind === inline.kind &&
        stableStringify(previous.data) === stableStringify(inline.data)
      ) {
        merged[merged.length - 1] = {
          ...previous,
          children: mergeAdjacentInlines([
            ...previous.children,
            ...inline.children,
          ]),
        };
        changed = true;
        continue;
      }
      merged.push(inline);
    }

    return changed ? merged : inlines;
  }

  function createTopLevelBlockSegment(block: Block): TopLevelBlockSegment {
    const serialized = serializeBlock(block);
    return {
      block,
      source: serialized.source,
      map: serialized.map,
      sourceLength: serialized.source.length,
      cursorLength: serialized.map.cursorLength,
    };
  }

  function hasSharedTopLevelBlockIdentity(
    previousDoc: Doc,
    nextDoc: Doc,
  ): boolean {
    if (previousDoc === nextDoc) {
      return true;
    }
    if (previousDoc.blocks.length === 0 || nextDoc.blocks.length === 0) {
      return false;
    }

    const previousBlocks = new Set(previousDoc.blocks);
    return nextDoc.blocks.some((block) => previousBlocks.has(block));
  }

  function buildTopLevelSegments(
    doc: Doc,
    previous?: SegmentedDocState,
  ): TopLevelBlockSegment[] {
    const previousByBlock = new Map<Block, TopLevelBlockSegment>();
    if (previous) {
      for (const segment of previous.segments) {
        previousByBlock.set(segment.block, segment);
      }
    }

    return doc.blocks.map((block) => {
      const reused = previousByBlock.get(block);
      return reused ?? createTopLevelBlockSegment(block);
    });
  }

  function buildPrefixIndexes(segments: TopLevelBlockSegment[]): {
    cursorStarts: number[];
    sourceStarts: number[];
    totalCursorLength: number;
    totalSourceLength: number;
  } {
    const cursorStarts: number[] = [];
    const sourceStarts: number[] = [];
    let cursorOffset = 0;
    let sourceOffset = 0;

    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      cursorStarts.push(cursorOffset);
      sourceStarts.push(sourceOffset);
      cursorOffset += segment?.cursorLength ?? 0;
      sourceOffset += segment?.sourceLength ?? 0;
      if (i < segments.length - 1) {
        cursorOffset += 1;
        sourceOffset += 1;
      }
    }

    return {
      cursorStarts,
      sourceStarts,
      totalCursorLength: cursorOffset,
      totalSourceLength: sourceOffset,
    };
  }

  function serializeSegmentRange(
    segments: TopLevelBlockSegment[],
    startIndex: number,
    endIndex: number,
  ): string {
    if (startIndex >= endIndex) {
      return "";
    }
    let source = "";
    for (let i = startIndex; i < endIndex; i += 1) {
      const segment = segments[i];
      if (!segment) {
        continue;
      }
      source += segment.source;
      if (i < segments.length - 1) {
        source += "\n";
      }
    }
    return source;
  }

  function sourceOffsetForBlockStart(
    state: SegmentedDocState,
    blockIndex: number,
  ): number {
    if (blockIndex <= 0) {
      return 0;
    }
    if (blockIndex >= state.segments.length) {
      return state.source.length;
    }
    return state.sourceStarts[blockIndex] ?? state.source.length;
  }

  function buildSegmentedSource(
    segments: TopLevelBlockSegment[],
    previous?: SegmentedDocState,
  ): string {
    if (!previous) {
      return serializeSegmentRange(segments, 0, segments.length);
    }

    const previousSegments = previous.segments;
    let prefix = 0;
    const maxPrefix = Math.min(previousSegments.length, segments.length);
    while (
      prefix < maxPrefix &&
      previousSegments[prefix]?.block === segments[prefix]?.block
    ) {
      prefix += 1;
    }

    let suffix = 0;
    const maxSuffix = Math.min(
      previousSegments.length - prefix,
      segments.length - prefix,
    );
    while (
      suffix < maxSuffix &&
      previousSegments[previousSegments.length - 1 - suffix]?.block ===
        segments[segments.length - 1 - suffix]?.block
    ) {
      suffix += 1;
    }

    if (prefix === previousSegments.length && prefix === segments.length) {
      return previous.source;
    }

    const oldStart = sourceOffsetForBlockStart(previous, prefix);
    const oldEnd = sourceOffsetForBlockStart(
      previous,
      previousSegments.length - suffix,
    );
    const middle = serializeSegmentRange(
      segments,
      prefix,
      segments.length - suffix,
    );

    return (
      previous.source.slice(0, oldStart) +
      middle +
      previous.source.slice(oldEnd)
    );
  }

  function buildSegmentedDocState(
    doc: Doc,
    previous?: SegmentedDocState,
  ): SegmentedDocState {
    const cached = segmentedDocCache.get(doc);
    if (cached) {
      return cached;
    }

    const segments = buildTopLevelSegments(doc, previous);
    const {
      cursorStarts,
      sourceStarts,
      totalCursorLength,
      totalSourceLength,
    } = buildPrefixIndexes(segments);
    const source = buildSegmentedSource(segments, previous);
    const map = createCompositeCursorSourceMap({
      segments: segments.map((segment) => ({
        map: segment.map,
        cursorLength: segment.cursorLength,
        sourceLength: segment.sourceLength,
      })),
      cursorStarts,
      sourceStarts,
      cursorLength: totalCursorLength,
    });

    const segmented: SegmentedDocState = {
      doc,
      segments,
      cursorStarts,
      sourceStarts,
      totalCursorLength,
      totalSourceLength,
      source,
      map,
    };
    segmentedDocCache.set(doc, segmented);
    return segmented;
  }

  type StateDerivationMode = "incremental" | "full";

  function buildStateFromDoc(
    doc: Doc,
    selection: Selection,
    options?: { previousState?: RuntimeState; mode?: StateDerivationMode },
  ): RuntimeState {
    const normalized = normalize(doc);
    const mode = options?.mode ?? "incremental";
    const previousSegmented =
      mode === "incremental" && options?.previousState
        ? segmentedDocCache.get(options.previousState.doc)
        : undefined;
    const reusablePrevious =
      previousSegmented &&
      hasSharedTopLevelBlockIdentity(previousSegmented.doc, normalized)
        ? previousSegmented
        : undefined;
    const segmented = buildSegmentedDocState(normalized, reusablePrevious);
    const cursorLength = segmented.map.cursorLength;
    const clampedSelection = {
      ...selection,
      start: Math.max(0, Math.min(cursorLength, selection.start)),
      end: Math.max(0, Math.min(cursorLength, selection.end)),
    };

    return {
      source: segmented.source,
      selection: normalizeSelection(clampedSelection),
      map: segmented.map,
      doc: normalized,
      runtime: runtime,
    };
  }

  function createState(
    source: string,
    selection: Selection = defaultSelection,
  ): RuntimeState {
    const doc = parse(source);
    return buildStateFromDoc(doc, selection, { mode: "full" });
  }

  function createStateFromDoc(
    doc: Doc,
    selection: Selection = defaultSelection,
    options?: { previousState?: RuntimeState; mode?: StateDerivationMode },
  ): RuntimeState {
    return buildStateFromDoc(doc, selection, options);
  }

  function isIncrementalDerivationCandidate(
    command: StructuralEditCommand,
    selection: Selection,
  ): boolean {
    if (selection.start !== selection.end) {
      return false;
    }

    if (command.type === "insert") {
      return command.text.length > 0 && !command.text.includes("\n");
    }

    return (
      command.type === "delete-backward" ||
      command.type === "delete-forward" ||
      command.type === "insert-line-break" ||
      command.type === "insert-hard-line-break"
    );
  }

  function shouldReparseAfterStructuralEdit(
    command: StructuralEditCommand,
  ): boolean {
    if (structuralReparsePolicies.length === 0) {
      return true;
    }
    return structuralReparsePolicies.some((policy) => policy(command));
  }

  function applyEdit(command: EditCommand, state: RuntimeState): RuntimeState {
    // Extensions can either:
    // - fully handle the edit by returning {source, selection}, or
    // - delegate by returning another EditCommand, which will be applied by the
    //   runtime after re-running extension middleware.
    //
    // This keeps editing logic composable while still allowing escape hatches.
    // If an extension delegates in a loop, this will loop as well.
    while (true) {
      let delegated = false;
      for (const onEdit of onEditFns) {
        const result = onEdit(command, state);
        if (!result) {
          continue;
        }
        if ("source" in result) {
          return createState(result.source, result.selection);
        }
        command = result;
        delegated = true;
        break;
      }
      if (!delegated) {
        break;
      }
    }

    const selection = normalizeSelection(state.selection);
    if (isStructuralEdit(command)) {
      const structural = applyStructuralEdit(command, state.doc, selection);
      if (!structural) {
        // Structural edits can refuse to operate across certain doc-tree
        // boundaries (e.g. headings are represented as block-wrappers, so a
        // backspace at the start of the following paragraph crosses parents).
        //
        // When that happens, fall back to deleting in source space so
        // Backspace/Delete still behave reasonably, then reparse.
        if (
          command.type === "delete-backward" ||
          command.type === "delete-forward"
        ) {
          const cursorLength = state.map.cursorLength;
          const cursorStart = Math.max(
            0,
            Math.min(cursorLength, Math.min(selection.start, selection.end)),
          );
          const cursorEnd = Math.max(
            0,
            Math.min(cursorLength, Math.max(selection.start, selection.end)),
          );

          if (cursorStart === cursorEnd) {
            if (command.type === "delete-backward" && cursorStart === 0) {
              return state;
            }
            if (
              command.type === "delete-forward" &&
              cursorStart === cursorLength
            ) {
              return state;
            }
          }

          const range =
            cursorStart === cursorEnd
              ? command.type === "delete-backward"
                ? { start: cursorStart - 1, end: cursorStart }
                : { start: cursorStart, end: cursorStart + 1 }
              : { start: cursorStart, end: cursorEnd };

          const fullDocDelete = range.start === 0 && range.end === cursorLength;
          const from = fullDocDelete
            ? 0
            : state.map.cursorToSource(range.start, "backward");
          const to = fullDocDelete
            ? state.source.length
            : state.map.cursorToSource(range.end, "forward");
          const fromClamped = Math.max(0, Math.min(from, state.source.length));
          const toClamped = Math.max(
            fromClamped,
            Math.min(to, state.source.length),
          );

          const nextSource =
            state.source.slice(0, fromClamped) + state.source.slice(toClamped);
          const next = createState(nextSource);
          const caretCursor = next.map.sourceToCursor(fromClamped, "forward");
          return {
            ...next,
            selection: {
              start: caretCursor.cursorOffset,
              end: caretCursor.cursorOffset,
              affinity: caretCursor.affinity,
            },
          };
        }

        // Fallback for insert commands when structural edit fails
        // (e.g., when selection spans across heading boundaries)
        if (command.type === "insert" || command.type === "insert-line-break") {
          const cursorLength = state.map.cursorLength;
          const cursorStart = Math.max(
            0,
            Math.min(cursorLength, Math.min(selection.start, selection.end)),
          );
          const cursorEnd = Math.max(
            0,
            Math.min(cursorLength, Math.max(selection.start, selection.end)),
          );

          const range = { start: cursorStart, end: cursorEnd };
          const fullDocReplace =
            range.start === 0 && range.end === cursorLength;
          const from = fullDocReplace
            ? 0
            : state.map.cursorToSource(range.start, "backward");
          const to = fullDocReplace
            ? state.source.length
            : state.map.cursorToSource(range.end, "forward");
          const fromClamped = Math.max(0, Math.min(from, state.source.length));
          const toClamped = Math.max(
            fromClamped,
            Math.min(to, state.source.length),
          );

          const insertText = command.type === "insert" ? command.text : "\n";
          const nextSource =
            state.source.slice(0, fromClamped) +
            insertText +
            state.source.slice(toClamped);
          const next = createState(nextSource);
          const caretSource = fromClamped + insertText.length;
          const caretCursor = next.map.sourceToCursor(caretSource, "forward");
          return {
            ...next,
            selection: {
              start: caretCursor.cursorOffset,
              end: caretCursor.cursorOffset,
              affinity: caretCursor.affinity,
            },
          };
        }

        return state;
      }

      // Structural edits operate on the doc tree first. Common collapsed
      // typing/edit flows stay on the incremental segmented path when policy
      // allows; everything else takes the explicit full fallback path through
      // source + parse.
      const shouldReparse = shouldReparseAfterStructuralEdit(command);
      const useIncrementalSegmentedDerivation =
        !shouldReparse && isIncrementalDerivationCandidate(command, selection);
      const pendingMarksAfterCollapsedDelete =
        (command.type === "delete-backward" ||
          command.type === "delete-forward") &&
        selection.start === selection.end
          ? marksDeletedByCollapsedSelection(state.doc, selection, command.type)
              .filter((mark) => isInclusiveAtEnd(mark.kind))
          : [];
      const interim = createStateFromDoc(structural.doc, defaultSelection, {
        mode: useIncrementalSegmentedDerivation ? "incremental" : "full",
        previousState: useIncrementalSegmentedDerivation ? state : undefined,
      });
      const interimAffinity = structural.nextAffinity ?? "forward";
      const interimCursor = Math.max(
        0,
        Math.min(interim.map.cursorLength, structural.nextCursor),
      );
      const caretSource = interim.map.cursorToSource(
        interimCursor,
        interimAffinity,
      );

      if (useIncrementalSegmentedDerivation) {
        const caretCursor = interim.map.sourceToCursor(
          caretSource,
          interimAffinity,
        );
        const nextState = {
          ...interim,
          selection: {
            start: caretCursor.cursorOffset,
            end: caretCursor.cursorOffset,
            affinity: caretCursor.affinity,
          },
        };
        if (pendingMarksAfterCollapsedDelete.length === 0) {
          const pendingPlaceholderMarks = getPendingPlaceholderMarksAtCursor(
            nextState,
            nextState.selection.start,
          );
          if (pendingPlaceholderMarks) {
            const withoutPending = removePendingPlaceholderAtCursor(
              nextState,
              nextState.selection.start,
            );
            if (withoutPending) {
              return withoutPending;
            }
          }
        }
        if (pendingMarksAfterCollapsedDelete.length > 0) {
          const around = marksAroundCursor(
            nextState.doc,
            nextState.selection.start,
          );
          const inclusiveAround = {
            left: around.left.filter((mark) => isInclusiveAtEnd(mark.kind)),
            right: around.right.filter((mark) => isInclusiveAtEnd(mark.kind)),
          };
          const preservesActiveMarks =
            isMarksPrefix(
              pendingMarksAfterCollapsedDelete,
              inclusiveAround.left,
            ) ||
            isMarksPrefix(
              pendingMarksAfterCollapsedDelete,
              inclusiveAround.right,
            );
          if (!preservesActiveMarks) {
            const pending = createPendingPlaceholderStateAtCursor(
              nextState,
              nextState.selection.start,
              pendingMarksAfterCollapsedDelete,
            );
            if (pending) {
              return pending;
            }
          }
        }
        return nextState;
      }

      const next = createState(interim.source);
      const caretCursor = next.map.sourceToCursor(caretSource, interimAffinity);
      const nextState = {
        ...next,
        selection: {
          start: caretCursor.cursorOffset,
          end: caretCursor.cursorOffset,
          affinity: caretCursor.affinity,
        },
      };
      if (pendingMarksAfterCollapsedDelete.length === 0) {
        const pendingPlaceholderMarks = getPendingPlaceholderMarksAtCursor(
          nextState,
          nextState.selection.start,
        );
        if (pendingPlaceholderMarks) {
          const withoutPending = removePendingPlaceholderAtCursor(
            nextState,
            nextState.selection.start,
          );
          if (withoutPending) {
            return withoutPending;
          }
        }
      }
      if (pendingMarksAfterCollapsedDelete.length > 0) {
        const around = marksAroundCursor(nextState.doc, nextState.selection.start);
        const inclusiveAround = {
          left: around.left.filter((mark) => isInclusiveAtEnd(mark.kind)),
          right: around.right.filter((mark) => isInclusiveAtEnd(mark.kind)),
        };
        const preservesActiveMarks =
          isMarksPrefix(pendingMarksAfterCollapsedDelete, inclusiveAround.left) ||
          isMarksPrefix(
            pendingMarksAfterCollapsedDelete,
            inclusiveAround.right,
          );
        if (!preservesActiveMarks) {
          const pending = createPendingPlaceholderStateAtCursor(
            nextState,
            nextState.selection.start,
            pendingMarksAfterCollapsedDelete,
          );
          if (pending) {
            return pending;
          }
        }
      }
      return nextState;
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

  type Run =
    | {
        type: "text";
        text: string;
        marks: Mark[];
      }
    | {
        type: "atom";
        atom: { kind: string; data?: Record<string, unknown> };
        marks: Mark[];
      };

  type FlatBlockLine = StructuralLineInfo;

  function applyStructuralEdit(
    command: StructuralEditCommand,
    doc: Doc,
    selection: Selection,
  ): { doc: Doc; nextCursor: number; nextAffinity?: Affinity } | null {
    const textModel = getEditorTextModelForDoc(doc);
    const lines = textModel.getStructuralLines();
    if (lines.length === 0) {
      return null;
    }

    const docCursorLength = textModel.getCursorLength();

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

    if (
      command.type === "delete-backward" &&
      cursorStart === cursorEnd
    ) {
      const caretLoc = textModel.resolveOffsetToLine(cursorStart);
      const caretLine = lines[caretLoc.lineIndex];
      if (
        caretLine &&
        caretLine.block.type === "paragraph" &&
        caretLine.cursorLength === 0 &&
        caretLoc.offsetInLine === 0 &&
        caretLoc.lineIndex > 0
      ) {
        const previousLine = lines[caretLoc.lineIndex - 1];
        if (previousLine?.block.type === "block-atom") {
          return {
            doc,
            nextCursor: cursorStart,
            nextAffinity: "forward",
          };
        }
      }
    }

    const replaceText =
      command.type === "insert"
        ? command.text
        : command.type === "insert-line-break" ||
            command.type === "insert-hard-line-break"
          ? "\n"
          : command.type === "exit-block-wrapper"
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
      textModel.getGraphemeAtCursor(range.start) === "\u200B";
    if (command.type === "insert" && shouldReplacePlaceholder) {
      const leadingWhitespace = replaceText.match(/^\s+/)?.[0] ?? "";
      const around = marksAroundCursor(doc, range.start);
      if (leadingWhitespace.length > 0) {
        if (
          isMarksPrefix(around.left, around.right) &&
          around.right.length > around.left.length
        ) {
          const whitespaceInsert = insertTextBeforePendingPlaceholderInDoc(
            doc,
            range.start,
            leadingWhitespace,
            around.left,
          );
          if (whitespaceInsert) {
            const trailingText = replaceText.slice(leadingWhitespace.length);
            if (trailingText.length === 0) {
              return whitespaceInsert;
            }
            return applyStructuralEdit(
              { type: "insert", text: trailingText },
              whitespaceInsert.doc,
              {
                start: whitespaceInsert.nextCursor,
                end: whitespaceInsert.nextCursor,
                affinity: whitespaceInsert.nextAffinity,
              },
            );
          }
        }
      }
    }
    const effectiveRange = shouldReplacePlaceholder
      ? { start: range.start, end: Math.min(docCursorLength, range.start + 1) }
      : range;

    const startLoc = textModel.resolveOffsetToLine(effectiveRange.start);
    const endLoc = textModel.resolveOffsetToLine(effectiveRange.end);
    const startLine = lines[startLoc.lineIndex];
    const endLine = lines[endLoc.lineIndex];
    if (!startLine || !endLine) {
      return null;
    }

    if (
      command.type === "delete-backward" &&
      cursorStart === cursorEnd &&
      endLoc.offsetInLine === 0 &&
      endLoc.lineIndex > 0
    ) {
      const prevLine = lines[endLoc.lineIndex - 1];
      if (prevLine && !pathsEqual(prevLine.parentPath, endLine.parentPath)) {
        const prevBlock = getBlockAtPath(doc.blocks, prevLine.path);
        const currentBlock = getBlockAtPath(doc.blocks, endLine.path);
        if (
          prevBlock &&
          prevBlock.type === "paragraph" &&
          currentBlock &&
          currentBlock.type === "paragraph"
        ) {
          const prevRuns = paragraphToRuns(prevBlock);
          const currentRuns = paragraphToRuns(currentBlock);
          const mergedRuns = normalizeRuns([...prevRuns, ...currentRuns]);
          const nextPrevBlock: Block = {
            ...prevBlock,
            content: runsToInlines(mergedRuns),
          };

          let nextBlocks = updateBlocksAtPath(
            doc.blocks,
            prevLine.parentPath,
            (blocks) =>
              blocks.map((block, index) =>
                index === prevLine.indexInParent ? nextPrevBlock : block,
              ),
          );
          nextBlocks = updateBlocksAtPath(
            nextBlocks,
            endLine.parentPath,
            (blocks) =>
              blocks.filter((_, index) => index !== endLine.indexInParent),
          );

          const nextDoc: Doc = { ...doc, blocks: nextBlocks };
          const nextModel = getEditorTextModelForDoc(nextDoc);
          const nextLines = nextModel.getStructuralLines();
          const lineStarts = nextModel.getLineOffsets();
          const mergedLineIndex = nextLines.findIndex((line) =>
            pathsEqual(line.path, prevLine.path),
          );
          const mergedLine = nextLines[mergedLineIndex];
          const nextCursor =
            mergedLineIndex >= 0
              ? (lineStarts[mergedLineIndex] ?? 0) +
                (mergedLine?.cursorLength ?? 0)
              : 0;

          return {
            doc: nextDoc,
            nextCursor,
            nextAffinity: "forward",
          };
        }
      }
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

    const insertParagraphAfterAtomicBlock = () => {
      const nextParentBlocks = [
        ...parentBlocks.slice(0, startIndex + 1),
        { type: "paragraph", content: [] } satisfies Block,
        ...parentBlocks.slice(startIndex + 1),
      ];
      const nextDoc: Doc = {
        ...doc,
        blocks: updateBlocksAtPath(doc.blocks, parentPath, () => nextParentBlocks),
      };
      const nextModel = getEditorTextModelForDoc(nextDoc);
      const nextLines = nextModel.getStructuralLines();
      const lineStarts = nextModel.getLineOffsets();
      const nextLineIndex = Math.min(nextLines.length - 1, startLoc.lineIndex + 1);
      return {
        doc: nextDoc,
        nextCursor: lineStarts[nextLineIndex] ?? 0,
        nextAffinity: "forward" as const,
      };
    };

    const getNearestWrapperAtPath = (
      rootBlocks: Block[],
      leafPath: number[],
    ): { block: Block & { type: "block-wrapper" }; path: number[] } | null => {
      for (let depth = leafPath.length - 1; depth >= 1; depth -= 1) {
        const prefix = leafPath.slice(0, depth);
        const block = getBlockAtPath(rootBlocks, prefix);
        if (block && block.type === "block-wrapper") {
          return { block, path: prefix };
        }
      }
      return null;
    };

    // Atomic block handling (generic: works for any block-atom kind).
    //
    // These blocks have no editable text content, but the caret can land on
    // their line start/end boundaries. We still need to support basic editing
    // semantics around them (Enter to create a new paragraph after, Backspace
    // / Delete to delete/move across).
    const collapsedOnSingleLine =
      cursorStart === cursorEnd &&
      startLoc.lineIndex === endLoc.lineIndex &&
      pathsEqual(startLine.path, endLine.path);
    const selectsEntireAtomicLine =
      startBlock.type === "block-atom" &&
      effectiveRange.start === startLine.lineStartOffset &&
      effectiveRange.end ===
        startLine.lineStartOffset +
          startLine.cursorLength +
          (startLine.hasNewline ? 1 : 0);

    if (command.type === "insert-line-break" && selectsEntireAtomicLine) {
      return insertParagraphAfterAtomicBlock();
    }

    if (collapsedOnSingleLine) {
      // Enter at an atomic block inserts a new empty paragraph after it.
      if (command.type === "insert-line-break" && startBlock.type === "block-atom") {
        return insertParagraphAfterAtomicBlock();
      }

      // Backspace/Delete on an atomic block deletes the block.
      if (
        (command.type === "delete-backward" ||
          command.type === "delete-forward") &&
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
        const nextModel = getEditorTextModelForDoc(nextDoc);
        const nextLines = nextModel.getStructuralLines();
        const lineStarts = nextModel.getLineOffsets();
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

    }

    // Delete at the end of a paragraph above an atomic block should delete the
    // block in front of the caret, not the serialized newline before it.
    if (
      command.type === "delete-forward" &&
      cursorStart === cursorEnd &&
      startBlock.type === "paragraph" &&
      endBlock.type === "block-atom" &&
      startLoc.lineIndex !== endLoc.lineIndex &&
      startLoc.offsetInLine === startLine.cursorLength &&
      endLoc.offsetInLine === 0
    ) {
      const nextParentBlocks = parentBlocks.filter((_, i) => i !== endIndex);
      const ensured =
        nextParentBlocks.length > 0
          ? nextParentBlocks
          : ([{ type: "paragraph", content: [] }] satisfies Block[]);
      const nextDoc: Doc = {
        ...doc,
        blocks: updateBlocksAtPath(doc.blocks, parentPath, () => ensured),
      };
      const nextModel = getEditorTextModelForDoc(nextDoc);
      const nextLines = nextModel.getStructuralLines();
      const lineStarts = nextModel.getLineOffsets();
      const nextLineIndex = nextLines.findIndex((line) =>
        pathsEqual(line.path, startLine.path),
      );
      const nextLine = nextLineIndex >= 0 ? nextLines[nextLineIndex] : null;
      const nextCursor =
        nextLineIndex >= 0
          ? (lineStarts[nextLineIndex] ?? 0) +
            Math.min(startLoc.offsetInLine, nextLine?.cursorLength ?? 0)
          : Math.max(0, Math.min(nextModel.getCursorLength(), cursorStart));
      return {
        doc: nextDoc,
        nextCursor,
        nextAffinity: "forward",
      };
    }

    if (startBlock.type !== "paragraph" || endBlock.type !== "paragraph") {
      return null;
    }

    const startRuns = paragraphToRuns(startBlock);
    const endRuns =
      endIndex === startIndex ? startRuns : paragraphToRuns(endBlock);
    const [beforeRuns] = splitRunsAt(startRuns, startLoc.offsetInLine);
    const [, afterRuns] = splitRunsAt(endRuns, endLoc.offsetInLine);

    // Generic "exit block-wrapper" behavior:
    // Split the nearest enclosing wrapper's single paragraph into:
    // - wrapper paragraph: content before the caret
    // - new paragraph after the wrapper: content after the caret
    //
    // This is useful for wrapper kinds that conceptually should not span
    // multiple lines (e.g. headings), while keeping the core syntax-agnostic.
    if (
      command.type === "exit-block-wrapper" &&
      effectiveRange.start === effectiveRange.end &&
      startLoc.lineIndex === endLoc.lineIndex
    ) {
      const wrapperInfo = getNearestWrapperAtPath(doc.blocks, startLine.path);
      if (
        wrapperInfo &&
        wrapperInfo.block.blocks.length === 1 &&
        wrapperInfo.block.blocks[0]?.type === "paragraph"
      ) {
        const wrapperParentPath = wrapperInfo.path.slice(0, -1);
        const wrapperIndexInParent =
          wrapperInfo.path[wrapperInfo.path.length - 1] ?? 0;
        const wrapperParentBlocks = getBlocksAtPath(
          doc.blocks,
          wrapperParentPath,
        );

        const nextWrapper: Block = {
          ...wrapperInfo.block,
          blocks: [
            {
              type: "paragraph",
              content: runsToInlines(normalizeRuns(beforeRuns)),
            },
          ],
        };
        const nextParagraph: Block = {
          type: "paragraph",
          content: runsToInlines(normalizeRuns(afterRuns)),
        };

        const nextParentBlocks = [
          ...wrapperParentBlocks.slice(0, wrapperIndexInParent),
          nextWrapper,
          nextParagraph,
          ...wrapperParentBlocks.slice(wrapperIndexInParent + 1),
        ];

        const nextDoc: Doc = {
          ...doc,
          blocks: updateBlocksAtPath(
            doc.blocks,
            wrapperParentPath,
            () => nextParentBlocks,
          ),
        };

        const nextModel = getEditorTextModelForDoc(nextDoc);
        const nextLines = nextModel.getStructuralLines();
        const lineStarts = nextModel.getLineOffsets();
        const insertedPath = [...wrapperParentPath, wrapperIndexInParent + 1];
        const insertedLineIndex = nextLines.findIndex((line) =>
          pathsEqual(line.path, insertedPath),
        );
        const nextCursor =
          insertedLineIndex >= 0 ? (lineStarts[insertedLineIndex] ?? 0) : 0;
        return {
          doc: nextDoc,
          nextCursor,
          nextAffinity: "forward",
        };
      }
    }

    const hasSelectedText = effectiveRange.start !== effectiveRange.end;
    const baseMarks = hasSelectedText
      ? commonMarksAcrossSelection(
          textModel,
          lines,
          effectiveRange.start,
          effectiveRange.end,
        )
      : marksAtCursor(startRuns, startLoc.offsetInLine, affinity);

    const insertDoc = parse(replaceText);
    const insertModel = getEditorTextModelForDoc(insertDoc);
    const insertBlocks = insertDoc.blocks;
    const insertCursorLength = insertModel.getCursorLength();

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

    const nextModel = getEditorTextModelForDoc(nextDoc);
    const nextDocCursorLength = nextModel.getCursorLength();
    const hasParagraphInsert = insertBlocks.some((block) => block.type === "paragraph");
    const replacementCursorLength = hasParagraphInsert
      ? insertCursorLength
      : getEditorTextModelForDoc({
          type: "doc",
          blocks: replacementBlocks,
        }).getCursorLength() -
        getRunsCursorLength(beforeRuns) -
        getRunsCursorLength(afterRuns);
    const nextCursor = Math.max(
      0,
      Math.min(
        nextDocCursorLength,
        effectiveRange.start + replacementCursorLength,
      ),
    );
    const nextLines = nextModel.getStructuralLines();
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
    const nextLoc = nextModel.resolveOffsetToLine(nextCursor);
    const lineStarts = nextModel.getLineOffsets();
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
      if (last && last.type === "text" && marksEqual(last.marks, marks)) {
        last.text += text;
        return;
      }
      runs.push({ type: "text", text, marks });
    };

    const pushAtom = (atom: {
      kind: string;
      data?: Record<string, unknown>;
    }) => {
      const marks = stack.slice();
      runs.push({ type: "atom", atom, marks });
    };

    const walk = (inline: Inline) => {
      if (inline.type === "text") {
        pushText(inline.text);
        return;
      }
      if (inline.type === "inline-atom") {
        pushAtom({
          kind: inline.kind,
          data: inline.data as Record<string, unknown> | undefined,
        });
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

  function removeMarkByKind(marks: Mark[], kind: string): Mark[] {
    let removed = false;
    return marks.filter((mark) => {
      if (!removed && mark.kind === kind) {
        removed = true;
        return false;
      }
      return true;
    });
  }

  function mergeMarksPreservingOrder(...groups: Mark[][]): Mark[] {
    const next: Mark[] = [];
    for (const group of groups) {
      for (const mark of group) {
        if (next.some((existing) => existing.key === mark.key)) {
          continue;
        }
        next.push(mark);
      }
    }
    return next;
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
      const runLen =
        run.type === "text" ? Array.from(graphemeSegments(run.text)).length : 1;
      if (remaining === 0) {
        right.push(run, ...runs.slice(i + 1));
        return [left, right];
      }
      if (remaining >= runLen) {
        left.push(run);
        remaining -= runLen;
        continue;
      }
      if (run.type !== "text") {
        // Atom runs cannot be split; the only valid split positions are 0/1.
        right.push(run, ...runs.slice(i + 1));
        return [left, right];
      }
      const segs = Array.from(graphemeSegments(run.text));
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

  function getRunsCursorLength(runs: Run[]): number {
    return runs.reduce(
      (total, run) =>
        total +
        (run.type === "text" ? Array.from(graphemeSegments(run.text)).length : 1),
      0,
    );
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
      const runLen =
        run.type === "text" ? Array.from(graphemeSegments(run.text)).length : 1;
      if (remaining < runLen) {
        return run.marks;
      }
      remaining -= runLen;
    }
    return null;
  }

  function marksAroundCursor(
    doc: Doc,
    cursorOffset: number,
  ): { left: Mark[]; right: Mark[] } {
    const textModel = getEditorTextModelForDoc(doc);
    const lines = textModel.getStructuralLines();
    const loc = textModel.resolveOffsetToLine(cursorOffset);
    const line = lines[loc.lineIndex];
    if (!line) {
      return { left: [], right: [] };
    }
    const block = line.block;
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

  function marksDeletedByCollapsedSelection(
    doc: Doc,
    selection: Selection,
    command: "delete-backward" | "delete-forward",
  ): Mark[] {
    const cursorOffset = Math.max(0, Math.min(selection.start, selection.end));
    const around = marksAroundCursor(doc, cursorOffset);
    return command === "delete-backward" ? around.left : around.right;
  }

  function createPendingPlaceholderStateAtCursor(
    state: RuntimeState,
    cursorOffset: number,
    marks: Mark[],
  ): RuntimeState | null {
    const textModel = getEditorTextModelForDoc(state.doc);
    const lines = textModel.getStructuralLines();
    const loc = textModel.resolveOffsetToLine(cursorOffset);
    const line = lines[loc.lineIndex];
    if (!line) {
      return null;
    }

    const block = getBlockAtPath(state.doc.blocks, line.path);
    if (!block || block.type !== "paragraph") {
      return null;
    }

    const placeholder = "\u200B";
    const runs = paragraphToRuns(block);
    const { before, after } = sliceRuns(runs, loc.offsetInLine, loc.offsetInLine);
    const mergedRuns = normalizeRuns([
      ...before,
      { type: "text", text: placeholder, marks },
      ...after,
    ]);
    const nextBlock: Block = {
      ...block,
      content: runsToInlines(mergedRuns),
    };

    const parentPath = line.path.slice(0, -1);
    const indexInParent = line.path[line.path.length - 1] ?? 0;
    const nextDoc: Doc = {
      ...state.doc,
      blocks: updateBlocksAtPath(state.doc.blocks, parentPath, (blocks) =>
        blocks.map((child, index) =>
          index === indexInParent ? nextBlock : child,
        ),
      ),
    };
    const next = createStateFromDoc(nextDoc);

    const sourceHint = state.map.cursorToSource(cursorOffset, "backward");
    const searchStart = Math.max(0, sourceHint - 4);
    const placeholderStart =
      next.source.indexOf(placeholder, searchStart) ?? -1;
    const resolvedPlaceholderStart =
      placeholderStart !== -1 ? placeholderStart : next.source.indexOf(placeholder);
    if (resolvedPlaceholderStart === -1) {
      return null;
    }

    const startCursor = next.map.sourceToCursor(
      resolvedPlaceholderStart,
      "forward",
    );
    return {
      ...next,
      selection: {
        start: startCursor.cursorOffset,
        end: startCursor.cursorOffset,
        affinity: "forward",
      },
    };
  }

  function rewritePendingPlaceholderAtCursor(
    state: RuntimeState,
    cursorOffset: number,
    marks: Mark[] | null,
  ): RuntimeState | null {
    const textModel = getEditorTextModelForDoc(state.doc);
    const lines = textModel.getStructuralLines();
    const loc = textModel.resolveOffsetToLine(cursorOffset);
    const line = lines[loc.lineIndex];
    if (!line) {
      return null;
    }

    const block = getBlockAtPath(state.doc.blocks, line.path);
    if (!block || block.type !== "paragraph") {
      return null;
    }

    const placeholder = "\u200B";
    const runs = paragraphToRuns(block);
    const { before, after } = sliceRuns(runs, loc.offsetInLine, loc.offsetInLine);
    const replacement: Run[] = [];

    const firstAfter = after[0];
    if (firstAfter?.type === "text" && firstAfter.text.startsWith(placeholder)) {
      if (marks && marks.length > 0) {
        replacement.push({ type: "text", text: placeholder, marks });
      }
      if (firstAfter.text.length > placeholder.length) {
        replacement.push({
          ...firstAfter,
          text: firstAfter.text.slice(placeholder.length),
        });
      }
      replacement.push(...after.slice(1));
    } else {
      const lastBefore = before[before.length - 1];
      if (
        lastBefore?.type !== "text" ||
        !lastBefore.text.endsWith(placeholder)
      ) {
        return null;
      }

      const prefix = lastBefore.text.slice(0, -placeholder.length);
      if (prefix) {
        replacement.push({ ...lastBefore, text: prefix });
      }
      if (marks && marks.length > 0) {
        replacement.push({ type: "text", text: placeholder, marks });
      }
      replacement.push(...after);
      before.pop();
    }

    const mergedRuns = normalizeRuns([...before, ...replacement]);
    const nextBlock: Block = {
      ...block,
      content: runsToInlines(mergedRuns),
    };

    const parentPath = line.path.slice(0, -1);
    const indexInParent = line.path[line.path.length - 1] ?? 0;
    const nextDoc: Doc = {
      ...state.doc,
      blocks: updateBlocksAtPath(state.doc.blocks, parentPath, (blocks) =>
        blocks.map((child, index) =>
          index === indexInParent ? nextBlock : child,
        ),
      ),
    };
    const next = createStateFromDoc(nextDoc);

    return {
      ...next,
      selection: {
        start: cursorOffset,
        end: cursorOffset,
        affinity: marks && marks.length > 0 ? "forward" : "backward",
      },
    };
  }

  function updatePendingPlaceholderMarksAtCursor(
    state: RuntimeState,
    cursorOffset: number,
    marks: Mark[],
  ): RuntimeState | null {
    return rewritePendingPlaceholderAtCursor(state, cursorOffset, marks);
  }

  function removePendingPlaceholderAtCursor(
    state: RuntimeState,
    cursorOffset: number,
  ): RuntimeState | null {
    return rewritePendingPlaceholderAtCursor(state, cursorOffset, null);
  }

  function getPendingPlaceholderMarksAtCursor(
    state: RuntimeState,
    cursorOffset: number,
  ): Mark[] | null {
    const textModel = getEditorTextModelForDoc(state.doc);
    const lines = textModel.getStructuralLines();
    const loc = textModel.resolveOffsetToLine(cursorOffset);
    const line = lines[loc.lineIndex];
    if (!line) {
      return null;
    }

    const block = getBlockAtPath(state.doc.blocks, line.path);
    if (!block || block.type !== "paragraph") {
      return null;
    }

    const placeholder = "\u200B";
    const runs = paragraphToRuns(block);
    const { before, after } = sliceRuns(runs, loc.offsetInLine, loc.offsetInLine);
    const firstAfter = after[0];
    if (firstAfter?.type === "text" && firstAfter.text.startsWith(placeholder)) {
      return firstAfter.marks;
    }
    const lastBefore = before[before.length - 1];
    if (
      lastBefore?.type === "text" &&
      lastBefore.text.endsWith(placeholder)
    ) {
      return lastBefore.marks;
    }
    return null;
  }

  function insertTextBeforePendingPlaceholderInDoc(
    doc: Doc,
    cursorOffset: number,
    text: string,
    marks: Mark[],
  ): { doc: Doc; nextCursor: number; nextAffinity: Affinity } | null {
    const textModel = getEditorTextModelForDoc(doc);
    const lines = textModel.getStructuralLines();
    const loc = textModel.resolveOffsetToLine(cursorOffset);
    const line = lines[loc.lineIndex];
    if (!line) {
      return null;
    }

    const block = getBlockAtPath(doc.blocks, line.path);
    if (!block || block.type !== "paragraph") {
      return null;
    }

    const placeholder = "\u200B";
    const runs = paragraphToRuns(block);
    const { before, after } = sliceRuns(runs, loc.offsetInLine, loc.offsetInLine);
    const firstAfter = after[0];
    if (
      firstAfter?.type !== "text" ||
      !firstAfter.text.startsWith(placeholder)
    ) {
      return null;
    }

    const mergedRuns = normalizeRuns([
      ...before,
      ...(text.length > 0 ? [{ type: "text", text, marks } satisfies Run] : []),
      firstAfter,
      ...after.slice(1),
    ]);
    const nextBlock: Block = {
      ...block,
      content: runsToInlines(mergedRuns),
    };

    const parentPath = line.path.slice(0, -1);
    const indexInParent = line.path[line.path.length - 1] ?? 0;
    const nextDoc: Doc = {
      ...doc,
      blocks: updateBlocksAtPath(doc.blocks, parentPath, (blocks) =>
        blocks.map((child, index) =>
          index === indexInParent ? nextBlock : child,
        ),
      ),
    };

    return {
      doc: nextDoc,
      nextCursor: cursorOffset + Array.from(graphemeSegments(text)).length,
      nextAffinity: "forward",
    };
  }

  function hasInlineMarkerBoundaryBefore(
    source: string,
    markerStart: number,
  ): boolean {
    if (markerStart <= 0) {
      return true;
    }

    return !WORD_CHARACTER_PATTERN.test(source[markerStart - 1] ?? "");
  }

  function pickSafeCollapsedToggleMarkerSpec(params: {
    defaultSpec: { kind: string; open: string; close: string };
    source: string;
    insertAt: number;
    affinity: Affinity;
  }): { kind: string; open: string; close: string } {
    const { defaultSpec, source, insertAt, affinity } = params;
    const candidates = Array.from(toggleMarkerToSpec.values()).filter(
      (spec, index, all) =>
        spec.kind === defaultSpec.kind &&
        all.findIndex(
          (candidate) =>
            candidate.kind === spec.kind &&
            candidate.open === spec.open &&
            candidate.close === spec.close,
        ) === index,
    );
    if (candidates.length <= 1) {
      return defaultSpec;
    }

    const previousChar = source[insertAt - 1] ?? "";
    const nextChar = source[insertAt] ?? "";
    let bestSpec = defaultSpec;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const spec of candidates) {
      if (
        spec.open === "_" &&
        !hasInlineMarkerBoundaryBefore(source, insertAt)
      ) {
        continue;
      }

      let score = 0;
      if (previousChar && spec.open[0] === previousChar) {
        score += affinity === "forward" ? 8 : 3;
      }
      if (
        nextChar &&
        spec.close[spec.close.length - 1] === nextChar
      ) {
        score += affinity === "backward" ? 8 : 3;
      }
      if (
        spec.open === defaultSpec.open &&
        spec.close === defaultSpec.close
      ) {
        score -= 0.5;
      }

      if (score < bestScore) {
        bestSpec = spec;
        bestScore = score;
      }
    }

    return bestSpec;
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
      const prev = next[next.length - 1];
      if (run.type === "text") {
        if (!run.text) {
          continue;
        }
        if (prev && prev.type === "text" && marksEqual(prev.marks, run.marks)) {
          prev.text += run.text;
          continue;
        }
        next.push(run);
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

      if (run.type === "text") {
        if (run.text) {
          currentChildren().push({ type: "text", text: run.text });
        }
        continue;
      }
      currentChildren().push({
        type: "inline-atom",
        kind: run.atom.kind,
        data: run.atom.data,
      });
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
      if (mergedRuns.length === 0) {
        return [...insertBlocks];
      }
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
    textModel: {
      resolveOffsetToLine: (offset: number) => {
        lineIndex: number;
        offsetInLine: number;
      };
    },
    lines: readonly FlatBlockLine[],
    startCursor: number,
    endCursor: number,
  ): Mark[] {
    if (startCursor === endCursor) {
      return [];
    }
    const startLoc = textModel.resolveOffsetToLine(startCursor);
    const endLoc = textModel.resolveOffsetToLine(endCursor);
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
      const block = line.block;
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

    const markerSpec = toggleMarkerToSpec.get(marker);
    if (!markerSpec) {
      return state;
    }

    const {
      kind: markerKind,
      open: openMarker,
      close: closeMarker,
    } = markerSpec;
    const openLen = openMarker.length;
    const closeLen = closeMarker.length;
    const placeholder = "\u200B";
    const markerMark: Mark = {
      kind: markerKind,
      data: undefined,
      key: markKey(markerKind, undefined),
    };

    if (selection.start === selection.end) {
      const caret = selection.start;
      const pendingPlaceholderMarks = getPendingPlaceholderMarksAtCursor(
        state,
        caret,
      );
      if (pendingPlaceholderMarks) {
        const hasMarker = pendingPlaceholderMarks.some(
          (mark) => mark.kind === markerKind,
        );
        const around = marksAroundCursor(state.doc, caret);
        const nextMarks = hasMarker
          ? removeMarkByKind(pendingPlaceholderMarks, markerKind)
          : mergeMarksPreservingOrder(
              around.left,
              pendingPlaceholderMarks,
              [markerMark],
            );
        const next =
          nextMarks.length > 0
            ? updatePendingPlaceholderMarksAtCursor(state, caret, nextMarks)
            : removePendingPlaceholderAtCursor(state, caret);
        if (next) {
          return {
            ...next,
            selection: {
              start: caret,
              end: caret,
              affinity: "forward",
            },
          };
        }
      }

      // When the caret is at the end boundary of an inline wrapper, toggling the
      // wrapper should "exit" it (so the next character types outside). This is
      // best expressed in cursor space by flipping affinity to "forward" when we
      // are leaving a wrapper of the requested kind.
      const around = marksAroundCursor(state.doc, caret);
      if (
        isMarksPrefix(around.right, around.left) &&
        around.left.length > around.right.length &&
        (selection.affinity ?? "forward") === "backward"
      ) {
        const exiting = around.left.slice(around.right.length);
        if (exiting.some((mark) => mark.kind === markerKind)) {
          const remainingMarks = removeMarkByKind(around.left, markerKind);
          if (!marksEqual(remainingMarks, around.right)) {
            const next = createPendingPlaceholderStateAtCursor(
              state,
              caret,
              remainingMarks,
            );
            if (next) {
              return next;
            }
          }
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

      // When the caret is at the start boundary of an inline wrapper containing
      // only a placeholder, toggling should remove that wrapper. This handles
      // the case of toggling off a mark that was just toggled on but not typed into.
      if (
        isMarksPrefix(around.left, around.right) &&
        around.right.length > around.left.length
      ) {
        const entering = around.right.slice(around.left.length);
        if (entering.some((mark) => mark.kind === markerKind)) {
          const remainingMarks = removeMarkByKind(around.right, markerKind);
          const next =
            remainingMarks.length > 0
              ? updatePendingPlaceholderMarksAtCursor(
                  state,
                  caret,
                  remainingMarks,
                )
              : removePendingPlaceholderAtCursor(state, caret);
          if (next) {
            return {
              ...next,
              selection: {
                start: caret,
                end: caret,
                affinity: "backward",
              },
            };
          }

          const insertAtBackward = map.cursorToSource(caret, "backward");
          const insertAtForward = map.cursorToSource(caret, "forward");
          const after = source.slice(insertAtBackward);

          // Simple case: pattern is exactly openMarker + placeholder + closeMarker
          if (after.startsWith(openMarker + placeholder + closeMarker)) {
            const nextSource =
              source.slice(0, insertAtBackward) +
              source.slice(insertAtBackward + openLen + 1 + closeLen);
            const next = createState(nextSource);
            const startCursor = next.map.sourceToCursor(
              insertAtBackward,
              "backward",
            );
            return {
              ...next,
              selection: {
                start: startCursor.cursorOffset,
                end: startCursor.cursorOffset,
                affinity: "backward",
              },
            };
          }

          // Complex case: nested wrappers containing only placeholder
          // e.g., ***​*** where we want to remove ** (bold) but keep * (italic)
          // The opening markers are from insertAtBackward to insertAtForward
          // Check if structure is: openMarkers + placeholder + closeMarkers
          const openMarkers = source.slice(insertAtBackward, insertAtForward);
          // Find the placeholder position
          const placeholderIdx = source.indexOf(placeholder, insertAtForward);
          if (placeholderIdx === insertAtForward) {
            // Placeholder immediately follows the opening markers
            // Check if closing markers mirror the opening
            const closeStart = placeholderIdx + 1;
            const closeMarkers = source.slice(
              closeStart,
              closeStart + openMarkers.length,
            );
            if (closeMarkers === openMarkers) {
              // We have a symmetric nested structure like ***​***
              // Remove our marker from both open and close sequences
              if (openMarkers.includes(openMarker)) {
                // Find where our marker appears in the sequence
                // For *** removing **, we get *
                const newOpenMarkers = openMarkers.replace(openMarker, "");
                const newCloseMarkers = closeMarkers.replace(closeMarker, "");
                const nextSource =
                  source.slice(0, insertAtBackward) +
                  newOpenMarkers +
                  placeholder +
                  newCloseMarkers +
                  source.slice(closeStart + closeMarkers.length);
                const next = createState(nextSource);
                const startCursor = next.map.sourceToCursor(
                  insertAtBackward,
                  "backward",
                );
                return {
                  ...next,
                  selection: {
                    start: startCursor.cursorOffset,
                    end: startCursor.cursorOffset,
                    affinity: "backward",
                  },
                };
              }
            }
          }
        }
      }

      if (
        isMarksPrefix(around.right, around.left) &&
        around.left.length > around.right.length &&
        (selection.affinity ?? "forward") === "backward" &&
        !around.left.some((mark) => mark.kind === markerKind)
      ) {
        const next = createPendingPlaceholderStateAtCursor(state, caret, [
          ...around.left,
          markerMark,
        ]);
        if (next) {
          return next;
        }
      }

      // Otherwise, insert an empty marker pair with a zero-width placeholder
      // selected so the next typed character replaces it.
      //
      // If the caret is already positioned before an existing placeholder (e.g.
      // Cmd+B then Cmd+I), wrap the existing placeholder rather than inserting
      // a second one so typing produces combined emphasis (***text***).
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
      // When at a boundary between cursor positions (insertAtBackward !== insertAtForward),
      // only prefer insertAtBackward if the caret is intentionally anchored inside the
      // left formatting context. If the caret affinity is forward, the user explicitly
      // exited that wrapper and new markers belong on the forward side of the gap.
      // Still guard against inserting a longer marker into a shorter boundary run,
      // which would create ambiguous source (e.g., *italic**​***).
      const betweenLen = insertAtForward - insertAtBackward;
      const preferBackward =
        insertAtBackward !== insertAtForward &&
        (selection.affinity ?? "forward") === "backward" &&
        openLen <= betweenLen;
      const insertAt =
        placeholderPos ?? (preferBackward ? insertAtBackward : insertAtForward);
      const insertMarkerSpec =
        placeholderPos === null
          ? pickSafeCollapsedToggleMarkerSpec({
              defaultSpec: markerSpec,
              source,
              insertAt,
              affinity: selection.affinity ?? "forward",
            })
          : markerSpec;
      const insertOpenMarker = insertMarkerSpec.open;
      const insertCloseMarker = insertMarkerSpec.close;
      const insertOpenLen = insertOpenMarker.length;
      const baseMarks =
        (selection.affinity ?? "forward") === "backward"
          ? around.left
          : around.right;
      const nextMarks = [
        ...baseMarks.filter((mark) => mark.kind !== markerKind),
        markerMark,
      ];

      if (placeholderPos !== null) {
        const next = updatePendingPlaceholderMarksAtCursor(
          state,
          caret,
          nextMarks,
        );
        if (next) {
          return next;
        }
      }

      const docInserted = createPendingPlaceholderStateAtCursor(
        state,
        caret,
        nextMarks,
      );
      if (docInserted) {
        return docInserted;
      }

      const nextSource =
        placeholderPos !== null
          ? source.slice(0, insertAt) +
            insertOpenMarker +
            placeholder +
            insertCloseMarker +
            source.slice(insertAt + placeholder.length)
          : source.slice(0, insertAt) +
            insertOpenMarker +
            placeholder +
            insertCloseMarker +
            source.slice(insertAt);
      const next = createState(nextSource);

      const placeholderStart = insertAt + insertOpenLen;
      const startCursor = next.map.sourceToCursor(placeholderStart, "forward");

      return createStateFromDoc(next.doc, {
        start: startCursor.cursorOffset,
        end: startCursor.cursorOffset,
        affinity: "forward",
      });
    }

    const cursorStart = Math.min(selection.start, selection.end);
    const cursorEnd = Math.max(selection.start, selection.end);
    const selectionModel = getEditorTextModelForDoc(state.doc);
    const linesForSelection = selectionModel.getStructuralLines();
    const startLoc = selectionModel.resolveOffsetToLine(cursorStart);
    const endLoc = selectionModel.resolveOffsetToLine(cursorEnd);
    const splitRunsOnNewlines = (runs: Run[]): Run[] => {
      const split: Run[] = [];
      for (const run of runs) {
        if (run.type !== "text") {
          split.push(run);
          continue;
        }
        if (!run.text.includes("\n")) {
          split.push(run);
          continue;
        }
        const parts = run.text.split("\n");
        for (let i = 0; i < parts.length; i += 1) {
          const part = parts[i] ?? "";
          if (part) {
            split.push({ ...run, text: part });
          }
          if (i < parts.length - 1) {
            split.push({ ...run, text: "\n" });
          }
        }
      }
      return split;
    };
    const selectedRunsForDecision: Run[] = [];

    for (
      let lineIndex = startLoc.lineIndex;
      lineIndex <= endLoc.lineIndex;
      lineIndex += 1
    ) {
      const line = linesForSelection[lineIndex];
      if (!line) {
        continue;
      }

      const startInLine =
        lineIndex === startLoc.lineIndex ? startLoc.offsetInLine : 0;
      const endInLine =
        lineIndex === endLoc.lineIndex
          ? endLoc.offsetInLine
          : line.cursorLength;
      if (startInLine === endInLine) {
        continue;
      }

      const block = line.block;
      if (!block || block.type !== "paragraph") {
        continue;
      }

      const runs = paragraphToRuns(block);
      const selected = sliceRuns(runs, startInLine, endInLine).selected;
      selectedRunsForDecision.push(...splitRunsOnNewlines(selected));
    }

    const visibleRunsForDecision = selectedRunsForDecision.filter((run) => {
      if (run.type !== "text" || run.text === "\n") {
        return false;
      }
      return run.text.replaceAll(placeholder, "").length > 0;
    });
    const hasTargetMark = visibleRunsForDecision.some((run) =>
      run.marks.some((mark) => mark.kind === markerKind),
    );
    const canUnwrap =
      hasTargetMark &&
      visibleRunsForDecision.every((run) =>
        run.marks.some((mark) => mark.kind === markerKind),
      );
    const removeMark = (marks: Mark[]): Mark[] => {
      if (!marks.some((mark) => mark.kind === markerKind)) {
        return marks;
      }
      return marks.filter((mark) => mark.kind !== markerKind);
    };

    let nextDoc = state.doc;
    let didChange = false;

    for (
      let lineIndex = startLoc.lineIndex;
      lineIndex <= endLoc.lineIndex;
      lineIndex += 1
    ) {
      const line = linesForSelection[lineIndex];
      if (!line) {
        continue;
      }

      const startInLine =
        lineIndex === startLoc.lineIndex ? startLoc.offsetInLine : 0;
      const endInLine =
        lineIndex === endLoc.lineIndex
          ? endLoc.offsetInLine
          : line.cursorLength;
      if (startInLine === endInLine) {
        continue;
      }

      const block = getBlockAtPath(nextDoc.blocks, line.path);
      if (!block || block.type !== "paragraph") {
        continue;
      }

      const runs = paragraphToRuns(block);
      const { before, selected, after } = sliceRuns(
        runs,
        startInLine,
        endInLine,
      );
      if (selected.length === 0) {
        continue;
      }

      const updatedSelected = splitRunsOnNewlines(selected).map((run) => {
        const isNewline = run.type === "text" && run.text === "\n";
        const hasMarkerKind = run.marks.some(
          (mark) => mark.kind === markerKind,
        );
        const nextMarks = canUnwrap
          ? removeMark(run.marks)
          : isNewline
            ? run.marks
            : hasMarkerKind
              ? run.marks
              : [...run.marks, markerMark];
        if (!marksEqual(run.marks, nextMarks)) {
          didChange = true;
        }
        if (run.type === "text") {
          const nextText =
            canUnwrap && run.text.includes(placeholder)
              ? run.text.replaceAll(placeholder, "")
              : run.text;
          if (nextText !== run.text) {
            didChange = true;
          }
          return { ...run, text: nextText, marks: nextMarks };
        }
        return { ...run, marks: nextMarks };
      });

      const mergedRuns = normalizeRuns([
        ...before,
        ...updatedSelected,
        ...after,
      ]);
      const nextBlock: Block = {
        ...block,
        content: runsToInlines(mergedRuns),
      };

      const parentPath = line.path.slice(0, -1);
      const indexInParent = line.path[line.path.length - 1] ?? 0;
      nextDoc = {
        ...nextDoc,
        blocks: updateBlocksAtPath(nextDoc.blocks, parentPath, (blocks) =>
          blocks.map((child, index) =>
            index === indexInParent ? nextBlock : child,
          ),
        ),
      };
    }

    if (!didChange) {
      return state;
    }

    const next = createStateFromDoc(nextDoc);

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
    const textModel = getEditorTextModelForDoc(state.doc);
    const lines = textModel.getStructuralLines();
    const docCursorLength = textModel.getCursorLength();
    const cursorStart = Math.max(
      0,
      Math.min(docCursorLength, Math.min(normalized.start, normalized.end)),
    );
    const cursorEnd = Math.max(
      0,
      Math.min(docCursorLength, Math.max(normalized.start, normalized.end)),
    );

    const isStandaloneAtomicSelection = lines.some((line) => {
      const block = line.block;
      const lineStart = line.lineStartOffset;
      const lineEnd =
        lineStart + line.cursorLength + (line.hasNewline ? 1 : 0);
      return (
        block.type === "block-atom" &&
        cursorStart === cursorEnd &&
        cursorStart === lineStart &&
        cursorEnd === lineEnd
      );
    });

    if (cursorStart === cursorEnd && !isStandaloneAtomicSelection) {
      return "";
    }

    const startLoc = textModel.resolveOffsetToLine(cursorStart);
    const endLoc = textModel.resolveOffsetToLine(cursorEnd);

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
      const block = line.block;
      const lineStart = line.lineStartOffset;
      const lineEnd =
        lineStart + line.cursorLength + (line.hasNewline ? 1 : 0);
      const selectsStandaloneAtomicLine =
        block.type === "block-atom" &&
        cursorStart === cursorEnd &&
        cursorStart === lineStart &&
        cursorEnd === lineEnd;
      const lineSelected =
        selectsStandaloneAtomicLine ||
        (cursorStart < lineEnd && cursorEnd > lineStart);
      if (!lineSelected) {
        continue;
      }
      if (block.type === "block-atom") {
        blocks.push(block);
        continue;
      }
      if (block.type !== "paragraph") {
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
      const paragraph: ParagraphBlock = { type: "paragraph", content };

      // Check if this line is inside a block-wrapper (e.g., heading)
      if (line.path.length > 1) {
        const wrapperPath = line.path.slice(0, -1);
        const wrapper = getBlockAtPath(state.doc.blocks, wrapperPath);
        if (wrapper && wrapper.type === "block-wrapper") {
          blocks.push({
            type: "block-wrapper",
            kind: wrapper.kind,
            data: wrapper.data,
            blocks: [paragraph],
          });
          continue;
        }
      }

      blocks.push(paragraph);
    }

    const sliceDoc: Doc = {
      type: "doc",
      blocks: blocks.length > 0 ? blocks : [{ type: "paragraph", content: [] }],
    };

    return serialize(normalize(sliceDoc)).source;
  }

  function escapeHtml(text: string): string {
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function runsToHtml(runs: Run[]): string {
    let html = "";
    for (const run of runs) {
      let content =
        run.type === "text" ? escapeHtml(run.text) : escapeHtml(" ");

      // Apply marks in reverse order so outer marks wrap inner marks
      const sortedMarks = [...run.marks].reverse();
      for (const mark of sortedMarks) {
        for (const serializeMarkToHtml of inlineHtmlSerializers) {
          const next = serializeMarkToHtml(
            { kind: mark.kind, data: mark.data },
            content,
            { escapeHtml },
          );
          if (next !== null) {
            content = next;
            break;
          }
        }
      }
      html += content;
    }
    return html;
  }

  function serializeSelectionToHtml(
    state: RuntimeState,
    selection: Selection,
  ): string {
    const normalized = normalizeSelection(selection);
    const textModel = getEditorTextModelForDoc(state.doc);
    const lines = textModel.getStructuralLines();
    const docCursorLength = textModel.getCursorLength();
    const cursorStart = Math.max(
      0,
      Math.min(docCursorLength, Math.min(normalized.start, normalized.end)),
    );
    const cursorEnd = Math.max(
      0,
      Math.min(docCursorLength, Math.max(normalized.start, normalized.end)),
    );

    const isStandaloneAtomicSelection = lines.some((line) => {
      const block = line.block;
      const lineStart = line.lineStartOffset;
      const lineEnd =
        lineStart + line.cursorLength + (line.hasNewline ? 1 : 0);
      return (
        block.type === "block-atom" &&
        cursorStart === cursorEnd &&
        cursorStart === lineStart &&
        cursorEnd === lineEnd
      );
    });

    if (cursorStart === cursorEnd && !isStandaloneAtomicSelection) {
      return "";
    }

    const startLoc = textModel.resolveOffsetToLine(cursorStart);
    const endLoc = textModel.resolveOffsetToLine(cursorEnd);

    let html = "";
    let activeGroup: SelectionHtmlGroup | null = null;

    const closeGroup = () => {
      if (!activeGroup) {
        return;
      }
      html += activeGroup.close;
      activeGroup = null;
    };

    for (
      let lineIndex = startLoc.lineIndex;
      lineIndex <= endLoc.lineIndex;
      lineIndex += 1
    ) {
      const line = lines[lineIndex];
      if (!line) {
        continue;
      }
      const block = line.block;
      const lineStart = line.lineStartOffset;
      const lineEnd =
        lineStart + line.cursorLength + (line.hasNewline ? 1 : 0);
      const selectsStandaloneAtomicLine =
        block.type === "block-atom" &&
        cursorStart === cursorEnd &&
        cursorStart === lineStart &&
        cursorEnd === lineEnd;
      const lineSelected =
        selectsStandaloneAtomicLine ||
        (cursorStart < lineEnd && cursorEnd > lineStart);
      if (!lineSelected) {
        continue;
      }
      if (block.type === "block-atom") {
        closeGroup();
        let blockHtml: string | null = null;
        for (const serializeBlockToHtml of serializeBlockToHtmlFns) {
          blockHtml = serializeBlockToHtml(block, {
            escapeHtml,
            serializeBlock,
          });
          if (blockHtml !== null) {
            break;
          }
        }
        if (blockHtml === null) {
          const markdown = serializeBlock(block).source;
          blockHtml = markdown ? `<div>${escapeHtml(markdown)}</div>` : "";
        }
        html += blockHtml;
        continue;
      }
      if (block.type !== "paragraph") {
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
      const lineHtml = runsToHtml(normalizeRuns(selectedRuns));
      const lineText = runs
        .map((r) => (r.type === "text" ? r.text : " "))
        .join("");
      let wrapperBlock: Block | null = null;
      if (line.path.length > 1) {
        const wrapperPath = line.path.slice(0, -1);
        const wrapper = getBlockAtPath(state.doc.blocks, wrapperPath);
        if (wrapper && wrapper.type === "block-wrapper") {
          wrapperBlock = wrapper;
        }
      }

      let lineResult: SerializeSelectionLineToHtmlResult | null = null;
      for (const serializeLineToHtml of serializeSelectionLineToHtmlFns) {
        lineResult = serializeLineToHtml({
          state,
          line,
          block,
          wrapperBlock,
          lineText,
          startInLine,
          endInLine,
          lineCursorLength: line.cursorLength,
          selectedHtml: lineHtml,
        });
        if (lineResult) {
          break;
        }
      }

      const group = lineResult?.group ?? null;
      if (!group || !activeGroup || activeGroup.key !== group.key) {
        closeGroup();
        if (group) {
          html += group.open;
          activeGroup = group;
        }
      }

      html += lineResult?.html ?? `<div>${lineHtml}</div>`;
    }

    closeGroup();

    if (!html) {
      return "";
    }

    return `<div>${html}</div>`;
  }

  const runtime: Runtime = {
    dom: {
      inlineRenderers: domInlineRenderers,
      blockRenderers: domBlockRenderers,
    },
    parse,
    serialize,
    createState,
    createStateFromDoc,
    updateSelection,
    serializeSelection,
    serializeSelectionToHtml,
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
  // Fast path for ASCII characters (most common case)
  const code = source.charCodeAt(start);
  if (code < 0x80) {
    // Single ASCII character
    const text = source[start] ?? "";
    return { inline: { type: "text", text }, nextPos: start + 1 };
  }

  // For non-ASCII, check if it's a surrogate pair (emoji, etc.)
  if (code >= 0xd800 && code <= 0xdbff) {
    // High surrogate - combine with low surrogate
    const lowCode = source.charCodeAt(start + 1);
    if (lowCode >= 0xdc00 && lowCode <= 0xdfff) {
      // Valid surrogate pair - but might be part of a larger grapheme cluster (like emoji with skin tone)
      // Fall back to segmenter for these cases
      const segment = graphemeSegments(
        source.slice(start, Math.min(start + 10, end)),
      )[0];
      const text = segment ? segment.segment : source.slice(start, start + 2);
      return { inline: { type: "text", text }, nextPos: start + text.length };
    }
  }

  // Other multi-byte UTF-8 characters (most are single grapheme clusters)
  // Use a small window for segmenter to avoid processing entire remaining text
  const segment = graphemeSegments(
    source.slice(start, Math.min(start + 10, end)),
  )[0];
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
