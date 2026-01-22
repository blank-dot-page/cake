import type { Affinity, Selection } from "../core/types";
import {
  createRuntime,
  type CakeExtension,
  type EditCommand,
  type Runtime,
  type RuntimeState,
} from "../core/runtime";
import { renderDocContent } from "../dom/render";
import { applyDomSelection, readDomSelection } from "../dom/dom-selection";
import type { DomMap } from "../dom/dom-map";
import { bundledExtensions } from "../extensions";
import {
  getCaretRect as getDomCaretRect,
  getSelectionGeometry,
} from "./selection/selection-geometry-dom";
import {
  getDocLines,
  getLineOffsets,
  resolveOffsetToLine,
} from "./selection/selection-layout";
import {
  cursorOffsetToVisibleOffset,
  getVisibleText,
  visibleOffsetToCursorOffset,
} from "./selection/visible-text";
import type { SelectionRect } from "./selection/selection-geometry";
import { measureLayoutModelFromDom } from "./selection/selection-layout-dom";
import { moveSelectionVertically as moveSelectionVerticallyInLayout } from "./selection/selection-navigation";
import { isMacPlatform } from "../shared/platform";
import {
  getWordBoundaries,
  nextWordBreak,
  prevWordBreak,
} from "../shared/word-break";
import { htmlToMarkdownForPaste } from "../../cake/clipboard";

type EngineOptions = {
  container: HTMLElement;
  value: string;
  selection?: Selection;
  extensions?: CakeExtension[];
  onChange?: (value: string, selection: Selection) => void;
  onSelectionChange?: (selection: Selection) => void;
  readOnly?: boolean;
  spellCheckEnabled?: boolean;
};

type InputIntent =
  | { type: "noop" }
  | { type: "insert-text"; text: string }
  | { type: "insert-line-break" }
  | { type: "delete-backward" }
  | { type: "delete-forward" }
  | { type: "replace-text"; text: string; selection: Selection }
  | { type: "undo" }
  | { type: "redo" };

const defaultSelection: Selection = { start: 0, end: 0, affinity: "forward" };
const COMPOSITION_COMMIT_CLEAR_DELAY_MS = 50;
const HISTORY_GROUPING_INTERVAL_MS = 500;
const MAX_UNDO_STACK_SIZE = 100;

type HistoryEntry = {
  source: string;
  selection: Selection;
};

type HistoryState = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  lastEditAt: number;
  lastKind: string | null;
};

export class CakeEngine {
  private container: HTMLElement;
  private runtime: Runtime;
  private extensions: CakeExtension[];
  private _state!: RuntimeState;
  private originalCaretRangeFromPoint:
    | ((x: number, y: number) => Range | null)
    | null = null;
  private patchedCaretRangeFromPoint:
    | ((x: number, y: number) => Range | null)
    | null = null;

  private get state(): RuntimeState {
    return this._state;
  }

  private set state(value: RuntimeState) {
    this._state = value;
  }
  private contentRoot: HTMLElement | null = null;
  private domMap: DomMap | null = null;
  private isApplyingSelection = false;
  private isComposing = false;
  private beforeInputHandled = false;
  private beforeInputResetId: number | null = null;
  private keydownHandledBeforeInput = false;
  private suppressSelectionChange = false;
  private suppressSelectionChangeResetId: number | null = null;
  private ignoreTouchNativeSelectionUntil: number | null = null;
  private blockTrustedTextDrag = false;
  private selectedAtomicLineIndex: number | null = null;
  private lastAppliedSelection: Selection | null = null;
  private compositionCommit = false;
  private compositionCommitTimeoutId: number | null = null;
  private overlayRoot: HTMLDivElement | null = null;
  private caretElement: HTMLDivElement | null = null;
  private caretBlinkTimeoutId: number | null = null;
  private overlayUpdateId: number | null = null;
  private scrollCaretIntoViewId: number | null = null;
  private onChange?: EngineOptions["onChange"];
  private onSelectionChange?: EngineOptions["onSelectionChange"];
  private readOnly: boolean;
  private spellCheckEnabled: boolean;
  private extensionsRoot: HTMLDivElement | null = null;
  private placeholderRoot: HTMLDivElement | null = null;
  private lastFocusRect: SelectionRect | null = null;
  private verticalNavGoalX: number | null = null;
  private history: HistoryState = {
    undoStack: [],
    redoStack: [],
    lastEditAt: 0,
    lastKind: null,
  };

  // Pending hit from pointerdown to use in click handler
  // This ensures accurate click positioning even with emoji/variable-width characters
  private pendingClickHit: {
    cursorOffset: number;
    affinity: Affinity;
  } | null = null;

  private isEventTargetInContentRoot(target: EventTarget | null): boolean {
    // In real browser events, `target` is usually a descendant of `contentRoot`.
    // In tests (and some synthetic events), `dispatchEvent` is called on the
    // container directly, making `target === container`. Treat that as "inside"
    // so the engine can still respond to input/click/keydown in those cases.
    if (target === this.container) {
      return true;
    }
    if (!this.contentRoot) {
      return false;
    }
    return (
      target instanceof Node &&
      (target === this.contentRoot || this.contentRoot.contains(target))
    );
  }

  private handleBeforeInputBound = this.handleBeforeInput.bind(this);
  private handleInputBound = this.handleInput.bind(this);
  private handleCompositionStartBound = this.handleCompositionStart.bind(this);
  private handleCompositionEndBound = this.handleCompositionEnd.bind(this);
  private handleSelectionChangeBound = this.handleSelectionChange.bind(this);
  private handleScrollBound = this.handleScroll.bind(this);
  private handleResizeBound = this.handleResize.bind(this);
  private handleClickBound = this.handleClick.bind(this);
  private handleKeyDownBound = this.handleKeyDown.bind(this);
  private handlePasteBound = this.handlePaste.bind(this);
  private handleCopyBound = this.handleCopy.bind(this);
  private handleCutBound = this.handleCut.bind(this);
  private handlePointerDownBound = this.handlePointerDown.bind(this);
  private handlePointerMoveBound = this.handlePointerMove.bind(this);
  private handlePointerUpBound = this.handlePointerUp.bind(this);
  private handleDragStartBound = this.handleDragStart.bind(this);
  private handleDragOverBound = this.handleDragOver.bind(this);
  private handleDropBound = this.handleDrop.bind(this);
  private handleDragEndBound = this.handleDragEnd.bind(this);

  // Drag state for line moving
  private dragState: {
    isDragging: boolean;
    startLineIndex: number;
    endLineIndex: number;
    pointerId: number;
    hasMoved: boolean;
  } | null = null;
  private dropIndicator: HTMLDivElement | null = null;

  // Text drag state for DragEvent-based drag and drop
  private textDragState: {
    selection: Selection;
    plainText: string;
    sourceText: string;
  } | null = null;

  private selectionDragState: {
    pointerId: number;
    anchorOffset: number;
  } | null = null;

  // Track if user is creating selection via drag (for single-click handling)
  // We track the starting position and only consider it "moved" if the mouse
  // moved more than a threshold distance (to avoid false positives from
  // micro-movements or synthetic pointermove events)
  private pointerDownPosition: { x: number; y: number } | null = null;
  private hasMovedSincePointerDown = false;

  constructor(options: EngineOptions) {
    this.container = options.container;
    this.extensions = options.extensions ?? bundledExtensions;
    this.runtime = createRuntime(this.extensions);
    this.state = this.runtime.createState(
      options.value,
      options.selection ?? defaultSelection,
    );
    this.onChange = options.onChange;
    this.onSelectionChange = options.onSelectionChange;
    this.readOnly = options.readOnly ?? false;
    this.spellCheckEnabled = options.spellCheckEnabled ?? true;

    this.render();
    this.attachListeners();
    this.installCaretRangeFromPointShim();
  }

  destroy() {
    this.detachListeners();
    this.uninstallCaretRangeFromPointShim();
    this.clearCaretBlinkTimer();
    if (this.overlayUpdateId !== null) {
      window.cancelAnimationFrame(this.overlayUpdateId);
      this.overlayUpdateId = null;
    }
    if (this.scrollCaretIntoViewId !== null) {
      window.cancelAnimationFrame(this.scrollCaretIntoViewId);
      this.scrollCaretIntoViewId = null;
    }
  }

  setReadOnly(readOnly: boolean) {
    this.readOnly = readOnly;
    this.updateContentRootAttributes();
  }

  setSpellCheckEnabled(enabled: boolean) {
    this.spellCheckEnabled = enabled;
    this.updateContentRootAttributes();
  }

  getValue() {
    return this.state.source;
  }

  getSelection() {
    return this.state.selection;
  }

  getFocusRect() {
    return this.lastFocusRect;
  }

  getContainer() {
    return this.container;
  }

  getContentRoot() {
    return this.contentRoot;
  }

  getOverlayRoot() {
    return this.extensionsRoot;
  }

  // Placeholder text is provided by the caller via the container's
  // `data-placeholder` attribute (set by the React wrapper).
  // The engine owns the placeholder element so it survives internal renders.
  syncPlaceholder() {
    this.updatePlaceholder();
  }

  insertText(text: string) {
    if (this.readOnly) {
      return;
    }
    if (!text) {
      return;
    }
    this.applyEdit({ type: "insert", text });
  }

  replaceText(oldText: string, newText: string) {
    if (this.readOnly) {
      return;
    }
    if (!oldText) {
      return;
    }
    const index = this.state.source.indexOf(oldText);
    if (index === -1) {
      return;
    }

    const nextSource =
      this.state.source.slice(0, index) +
      newText +
      this.state.source.slice(index + oldText.length);

    this.recordHistory("replace");
    this.state = this.runtime.createState(nextSource, this.state.selection);
    this.render();
    this.onChange?.(this.state.source, this.state.selection);
    this.scheduleOverlayUpdate();
    this.scheduleScrollCaretIntoView();
  }

  setSelection(selection: Selection) {
    this.state = this.runtime.updateSelection(this.state, selection, {
      kind: "programmatic",
    });
    if (!this.isComposing) {
      this.applySelection(this.state.selection);
    }
  }

  setValue({ value, selection }: { value: string; selection?: Selection }) {
    const nextSelection = selection ?? this.state.selection;
    if (value === this.state.source && selection === undefined) {
      return;
    }

    this.state = this.runtime.createState(value, nextSelection);
    this.render();
  }

  focus(selection?: Selection) {
    // Only set selection if we don't already have focus.
    // This prevents stale selection from resetting the current selection
    // during fast typing when React effects fire with stale props.
    if (selection && !this.hasFocus()) {
      this.setSelection(selection);
    }
    (this.contentRoot ?? this.container).focus();
  }

  blur() {
    (this.contentRoot ?? this.container).blur();
  }

  hasFocus() {
    const active = document.activeElement;
    if (!active) {
      return false;
    }
    if (this.contentRoot) {
      return active === this.contentRoot || this.contentRoot.contains(active);
    }
    return active === this.container || this.container.contains(active);
  }

  selectAll() {
    const length = this.state.map.cursorLength;
    this.setSelection({ start: 0, end: length, affinity: "forward" });
  }

  undo() {
    const entry = this.history.undoStack.pop();
    if (!entry) {
      return;
    }

    this.history.redoStack.push({
      source: this.state.source,
      selection: this.state.selection,
    });
    this.history.lastKind = null;
    this.state = this.runtime.createState(entry.source, entry.selection);
    this.render();
    this.onChange?.(this.state.source, this.state.selection);
  }

  redo() {
    const entry = this.history.redoStack.pop();
    if (!entry) {
      return;
    }
    this.history.undoStack.push({
      source: this.state.source,
      selection: this.state.selection,
    });
    this.history.lastKind = null;
    this.state = this.runtime.createState(entry.source, entry.selection);
    this.render();
    this.onChange?.(this.state.source, this.state.selection);
  }

  canUndo(): boolean {
    return this.history.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.history.redoStack.length > 0;
  }

  executeCommand(command: EditCommand): boolean {
    const shouldOpenLinkPopover =
      command.type === "wrap-link" && command.openPopover;
    const nextState = this.runtime.applyEdit(command, this.state);
    if (nextState === this.state) {
      return false;
    }
    this.recordHistory(command.type);
    this.state = nextState;
    this.render();
    this.onChange?.(this.state.source, this.state.selection);
    this.scheduleScrollCaretIntoView();
    if (shouldOpenLinkPopover) {
      queueMicrotask(() => {
        this.openLinkPopoverForSelection(true);
      });
    }
    return true;
  }

  private attachListeners() {
    this.container.addEventListener("beforeinput", this.handleBeforeInputBound);
    this.container.addEventListener("input", this.handleInputBound);
    this.container.addEventListener(
      "compositionstart",
      this.handleCompositionStartBound,
    );
    this.container.addEventListener(
      "compositionend",
      this.handleCompositionEndBound,
    );
    document.addEventListener(
      "selectionchange",
      this.handleSelectionChangeBound,
    );
    this.container.addEventListener("scroll", this.handleScrollBound);
    window.addEventListener("resize", this.handleResizeBound);
    this.container.addEventListener("click", this.handleClickBound);
    this.container.addEventListener("keydown", this.handleKeyDownBound);
    this.container.addEventListener("paste", this.handlePasteBound);
    this.container.addEventListener("copy", this.handleCopyBound);
    this.container.addEventListener("cut", this.handleCutBound);
    this.container.addEventListener("pointerdown", this.handlePointerDownBound);
    this.container.addEventListener("pointermove", this.handlePointerMoveBound);
    this.container.addEventListener("pointerup", this.handlePointerUpBound);
  }

  private attachDragListeners() {
    if (!this.contentRoot) {
      return;
    }
    this.contentRoot.addEventListener("dragstart", this.handleDragStartBound);
    this.contentRoot.addEventListener("dragover", this.handleDragOverBound);
    this.contentRoot.addEventListener("drop", this.handleDropBound);
    this.contentRoot.addEventListener("dragend", this.handleDragEndBound);
  }

  private detachDragListeners() {
    if (!this.contentRoot) {
      return;
    }
    this.contentRoot.removeEventListener(
      "dragstart",
      this.handleDragStartBound,
    );
    this.contentRoot.removeEventListener("dragover", this.handleDragOverBound);
    this.contentRoot.removeEventListener("drop", this.handleDropBound);
    this.contentRoot.removeEventListener("dragend", this.handleDragEndBound);
  }

  private detachListeners() {
    this.container.removeEventListener(
      "beforeinput",
      this.handleBeforeInputBound,
    );
    this.container.removeEventListener("input", this.handleInputBound);
    this.container.removeEventListener(
      "compositionstart",
      this.handleCompositionStartBound,
    );
    this.container.removeEventListener(
      "compositionend",
      this.handleCompositionEndBound,
    );
    document.removeEventListener(
      "selectionchange",
      this.handleSelectionChangeBound,
    );
    this.container.removeEventListener("scroll", this.handleScrollBound);
    window.removeEventListener("resize", this.handleResizeBound);
    this.container.removeEventListener("click", this.handleClickBound);
    this.container.removeEventListener("keydown", this.handleKeyDownBound);
    this.container.removeEventListener("paste", this.handlePasteBound);
    this.container.removeEventListener("copy", this.handleCopyBound);
    this.container.removeEventListener("cut", this.handleCutBound);
    this.container.removeEventListener(
      "pointerdown",
      this.handlePointerDownBound,
    );
    this.container.removeEventListener(
      "pointermove",
      this.handlePointerMoveBound,
    );
    this.container.removeEventListener("pointerup", this.handlePointerUpBound);
    this.detachDragListeners();
  }

  private installCaretRangeFromPointShim() {
    const doc = document as unknown as {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    if (typeof doc.caretRangeFromPoint !== "function") {
      return;
    }
    if (this.patchedCaretRangeFromPoint) {
      return;
    }

    this.originalCaretRangeFromPoint = doc.caretRangeFromPoint.bind(document);

    const patched = (x: number, y: number): Range | null => {
      const original = this.originalCaretRangeFromPoint;
      const range = original ? original(x, y) : null;

      // If the browser returned a range within a line, keep it as-is.
      const startNode = range?.startContainer ?? null;
      const startLine =
        startNode instanceof HTMLElement
          ? startNode.closest("[data-line-index]")
          : startNode?.parentElement?.closest("[data-line-index]");
      if (startLine) {
        return range;
      }

      // Only patch results for points inside this editor container.
      const rect = this.container.getBoundingClientRect();
      const isInside =
        x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      if (!isInside || !this.domMap) {
        return range;
      }

      // Resolve the caret position using caretPositionFromPoint when available,
      // falling back to the original caretRangeFromPoint.
      const docAny = document as unknown as {
        caretPositionFromPoint?: (
          x: number,
          y: number,
        ) => {
          offsetNode: Node;
          offset: number;
        } | null;
      };
      let node: Node | null = null;
      let offset = 0;
      if (typeof docAny.caretPositionFromPoint === "function") {
        const pos = docAny.caretPositionFromPoint(x, y);
        node = pos?.offsetNode ?? null;
        offset = pos?.offset ?? 0;
      } else if (original) {
        const fallback = original(x, y);
        node = fallback?.startContainer ?? null;
        offset = fallback?.startOffset ?? 0;
      }

      let resolved: { node: Text; offset: number } | null = null;
      if (node instanceof Text) {
        resolved = { node, offset };
      } else if (node instanceof Element) {
        resolved = resolveTextPoint(node, offset);
      }
      if (!resolved) {
        return range;
      }
      const cursor = this.domMap.cursorAtDom(resolved.node, resolved.offset);
      if (!cursor) {
        return range;
      }
      const domPoint = this.domMap.domAtCursor(
        cursor.cursorOffset,
        cursor.affinity,
      );
      if (!domPoint) {
        return range;
      }
      const fixed = document.createRange();
      fixed.setStart(domPoint.node, domPoint.offset);
      fixed.setEnd(domPoint.node, domPoint.offset);
      return fixed;
    };

    this.patchedCaretRangeFromPoint = patched;
    doc.caretRangeFromPoint = patched;
  }

  private uninstallCaretRangeFromPointShim() {
    if (!this.originalCaretRangeFromPoint || !this.patchedCaretRangeFromPoint) {
      return;
    }
    const doc = document as unknown as {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    if (doc.caretRangeFromPoint === this.patchedCaretRangeFromPoint) {
      doc.caretRangeFromPoint = this.originalCaretRangeFromPoint;
    }
    this.originalCaretRangeFromPoint = null;
    this.patchedCaretRangeFromPoint = null;
  }

  private render() {
    if (!this.contentRoot) {
      // Overlay roots are positioned absolutely; ensure the container forms a
      // positioning context so browser hit-testing APIs (caretRangeFromPoint)
      // keep resolving into line nodes after scrolling.
      const containerPosition = window.getComputedStyle(
        this.container,
      ).position;
      if (containerPosition === "static") {
        this.container.style.position = "relative";
      }
      this.contentRoot = document.createElement("div");
      this.contentRoot.className = "cake-content";
      this.updateContentRootAttributes();
      const overlay = this.ensureOverlayRoot();
      const extensionsRoot = this.ensureExtensionsRoot();
      this.container.replaceChildren(this.contentRoot, overlay, extensionsRoot);
      this.attachDragListeners();
    }
    const { content, map } = renderDocContent(
      this.state.doc,
      this.extensions,
      this.contentRoot,
    );
    this.contentRoot.replaceChildren(...content);
    this.domMap = map;
    this.updateExtensionsOverlayPosition();
    if (!this.isComposing) {
      this.applySelection(this.state.selection);
    }
    this.updatePlaceholder();
    this.scheduleOverlayUpdate();
  }

  private isEmptyParagraphDoc(): boolean {
    const blocks = this.state.doc.blocks;
    if (blocks.length !== 1) {
      return false;
    }
    const only = blocks[0];
    if (!only || only.type !== "paragraph") {
      return false;
    }
    const hasVisibleInlineContent = (inline: (typeof only.content)[number]) => {
      if (inline.type === "text") {
        return inline.text.length > 0;
      }
      if (inline.type === "inline-wrapper") {
        return inline.children.some(hasVisibleInlineContent);
      }
      // Atoms represent visible content (images, embeds, etc.)
      return inline.type === "inline-atom";
    };

    // Treat "empty" as truly no visible content.
    return !only.content.some(hasVisibleInlineContent);
  }

  private updatePlaceholder() {
    const placeholderText = this.container.dataset.placeholder;
    const shouldShow = Boolean(placeholderText) && this.isEmptyParagraphDoc();

    if (!this.placeholderRoot) {
      this.placeholderRoot = document.createElement("div");
      this.placeholderRoot.className = "cake-placeholder";
    }

    if (!shouldShow) {
      if (this.placeholderRoot.isConnected) {
        this.placeholderRoot.remove();
      }
      this.placeholderRoot.textContent = "";
      return;
    }

    this.placeholderRoot.textContent = placeholderText ?? "";
    this.syncPlaceholderPadding();
    if (!this.placeholderRoot.isConnected) {
      this.container.prepend(this.placeholderRoot);
    }
  }

  private syncPlaceholderPadding() {
    if (!this.placeholderRoot) {
      return;
    }
    const style = window.getComputedStyle(this.container);
    this.placeholderRoot.style.paddingTop = style.paddingTop;
    this.placeholderRoot.style.paddingRight = style.paddingRight;
    this.placeholderRoot.style.paddingBottom = style.paddingBottom;
    this.placeholderRoot.style.paddingLeft = style.paddingLeft;
  }

  private updateContentRootAttributes() {
    if (!this.contentRoot) {
      return;
    }
    this.contentRoot.contentEditable = this.readOnly ? "false" : "true";
    this.contentRoot.spellcheck = this.spellCheckEnabled;
  }

  private applySelection(selection: Selection) {
    if (!this.contentRoot) {
      return;
    }
    if (!this.domMap) {
      return;
    }
    this.isApplyingSelection = true;
    applyDomSelection(selection, this.domMap);
    // Read back what the DOM selection actually became (browser may normalize it)
    this.lastAppliedSelection = readDomSelection(this.domMap) ?? selection;
    queueMicrotask(() => {
      this.isApplyingSelection = false;
    });
    this.scheduleOverlayUpdate();
  }

  private handleSelectionChange() {
    if (this.isComposing) {
      return;
    }
    if (
      this.ignoreTouchNativeSelectionUntil !== null &&
      performance.now() < this.ignoreTouchNativeSelectionUntil
    ) {
      return;
    }
    if (this.suppressSelectionChange) {
      return;
    }
    if (this.isApplyingSelection) {
      return;
    }
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) {
      return;
    }
    const anchorNode = domSelection.anchorNode;
    const focusNode = domSelection.focusNode;
    if (
      !anchorNode ||
      !focusNode ||
      (!this.container.contains(anchorNode) &&
        !this.container.contains(focusNode))
    ) {
      return;
    }

    if (!this.domMap) {
      return;
    }
    const selection = readDomSelection(this.domMap);
    if (!selection) {
      return;
    }

    if (
      this.lastAppliedSelection &&
      selectionsEqual(selection, this.lastAppliedSelection)
    ) {
      return;
    }
    if (
      this.lastAppliedSelection &&
      selection.start === this.lastAppliedSelection.start &&
      selection.end === this.lastAppliedSelection.end &&
      selection.affinity !== this.lastAppliedSelection.affinity
    ) {
      return;
    }

    const previous = this.state.selection;
    const isSameSelection =
      previous.start === selection.start &&
      previous.end === selection.end &&
      previous.affinity === selection.affinity;
    if (isSameSelection) {
      this.lastAppliedSelection = selection;
      return;
    }

    // For collapsed selections (cursor moves), check if we landed on an atomic block
    // and skip over it in the direction of movement
    const adjustedSelection = this.adjustSelectionForAtomicBlocks(
      selection,
      previous,
    );

    this.selectedAtomicLineIndex = null;
    this.state = this.runtime.updateSelection(this.state, adjustedSelection, {
      kind: "dom",
    });
    this.onSelectionChange?.(this.state.selection);
    this.scheduleOverlayUpdate();
    this.scheduleScrollCaretIntoView();

    // If we adjusted selection, apply it to DOM
    if (
      adjustedSelection.start !== selection.start ||
      adjustedSelection.end !== selection.end
    ) {
      this.applySelection(adjustedSelection);
    }
  }

  private syncSelectionFromDom() {
    if (this.isComposing) {
      return;
    }
    if (!this.domMap) {
      return;
    }
    const selection = readDomSelection(this.domMap);
    if (!selection) {
      return;
    }
    this.selectedAtomicLineIndex = null;
    this.state = this.runtime.updateSelection(this.state, selection, {
      kind: "dom",
    });
    this.onSelectionChange?.(this.state.selection);
    this.lastAppliedSelection = this.state.selection;
    this.scheduleOverlayUpdate();
    this.scheduleScrollCaretIntoView();
  }

  private adjustSelectionForAtomicBlocks(
    selection: Selection,
    previous: Selection,
  ): Selection {
    // Only adjust collapsed selections (cursor navigation)
    if (selection.start !== selection.end) {
      return selection;
    }

    const lines = getDocLines(this.state.doc);
    const lineOffsets = getLineOffsets(lines);
    const { lineIndex } = resolveOffsetToLine(lines, selection.start);
    const lineInfo = lines[lineIndex];

    if (!lineInfo || !lineInfo.isAtomic) {
      return selection;
    }

    // Determine direction of movement
    // If previous was collapsed, use position difference. Otherwise, direction is forward.
    const direction =
      previous.start === previous.end && selection.start < previous.start
        ? "backward"
        : "forward";

    const lineStart = lineOffsets[lineIndex] ?? 0;
    const lineEnd =
      lineStart + lineInfo.cursorLength + (lineInfo.hasNewline ? 1 : 0);

    if (direction === "forward") {
      // Skip to end of atomic line (after newline if not last line)
      const isLastLine = lineIndex === lines.length - 1;
      const newOffset = isLastLine ? lineEnd : lineEnd;
      return { ...selection, start: newOffset, end: newOffset };
    } else {
      // Skip to before the atomic line (end of previous line)
      if (lineIndex === 0) {
        return { ...selection, start: 0, end: 0 };
      }
      const prevLineEnd = lineStart - 1;
      return { ...selection, start: prevLineEnd, end: prevLineEnd };
    }
  }

  private getAtomicBlockSelectionFromClick(
    event: MouseEvent,
  ): { selection: Selection; lineIndex: number } | null {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    // Check if clicking on an atomic block element (e.g., image)
    const blockElement = target.closest("[data-block-atom]");
    if (!blockElement) {
      return null;
    }

    // Get line index from the element
    const lineIndexAttr = blockElement.getAttribute("data-line-index");
    if (lineIndexAttr === null) {
      return null;
    }
    const lineIndex = parseInt(lineIndexAttr, 10);
    if (Number.isNaN(lineIndex)) {
      return null;
    }

    const lines = getDocLines(this.state.doc);
    const lineInfo = lines[lineIndex];
    if (!lineInfo || !lineInfo.isAtomic) {
      return null;
    }

    // Calculate the selection range for the entire line including newline
    const lineOffsets = getLineOffsets(lines);
    const lineStart = lineOffsets[lineIndex] ?? 0;
    const lineEnd =
      lineStart + lineInfo.cursorLength + (lineInfo.hasNewline ? 1 : 0);

    return {
      lineIndex,
      selection: {
        start: lineStart,
        end: lineEnd,
        affinity: "forward",
      },
    };
  }

  private handleClick(event: MouseEvent) {
    if (this.isComposing) {
      return;
    }
    if (
      this.ignoreTouchNativeSelectionUntil !== null &&
      performance.now() < this.ignoreTouchNativeSelectionUntil
    ) {
      return;
    }
    if (!this.contentRoot || !this.domMap) {
      return;
    }
    if (!this.isEventTargetInContentRoot(event.target)) {
      return;
    }

    // For single clicks (detail=1), use the pending hit from pointerdown
    // for accurate positioning with emoji/variable-width characters.
    // Skip if user just created a selection via drag (mouse moved since pointer down)
    if (event.detail === 1 && !this.hasMovedSincePointerDown) {
      // For shift+click, let the browser handle selection extension
      // (we didn't capture pendingClickHit for shift+click in pointerdown)
      if (event.shiftKey) {
        return;
      }

      // Check if clicking on an atomic block (like an image)
      const atomicResult = this.getAtomicBlockSelectionFromClick(event);
      if (atomicResult) {
        const atomicBlockSelection = atomicResult.selection;
        this.pendingClickHit = null;
        event.preventDefault();
        this.state = this.runtime.updateSelection(
          this.state,
          atomicBlockSelection,
          { kind: "dom" },
        );
        this.applySelection(this.state.selection);
        this.onSelectionChange?.(this.state.selection);
        this.scheduleOverlayUpdate();
        this.selectedAtomicLineIndex = atomicResult.lineIndex;
        this.suppressSelectionChange = false;
        return;
      }

      // Use pending hit from pointerdown, or do fresh hit test as fallback
      const hit =
        this.pendingClickHit ??
        this.hitTestFromClientPoint(event.clientX, event.clientY);
      this.pendingClickHit = null;

      if (hit) {
        const newSelection: Selection = {
          start: hit.cursorOffset,
          end: hit.cursorOffset,
          affinity: hit.affinity,
        };
        this.state = this.runtime.updateSelection(this.state, newSelection, {
          kind: "dom",
        });
        this.applySelection(this.state.selection);
        this.onSelectionChange?.(this.state.selection);
        this.scheduleOverlayUpdate();
      }

      // Clear the suppress flag we set in pointerdown (after applying selection)
      this.suppressSelectionChange = false;
      return;
    }
    // Clear pending hit for non-single-click events
    this.pendingClickHit = null;

    const hit = this.hitTestFromClientPoint(event.clientX, event.clientY);
    if (!hit) {
      return;
    }

    const lines = getDocLines(this.state.doc);

    if (event.detail === 2) {
      const visibleText = getVisibleText(lines);
      const visibleOffset = cursorOffsetToVisibleOffset(
        lines,
        hit.cursorOffset,
      );
      const wordBounds = getWordBoundaries(visibleText, visibleOffset);
      const start = visibleOffsetToCursorOffset(lines, wordBounds.start);
      const end = visibleOffsetToCursorOffset(lines, wordBounds.end);
      if (start === null || end === null) {
        this.suppressSelectionChange = false;
        return;
      }
      const selection: Selection = {
        start,
        end,
        affinity: "forward",
      };
      event.preventDefault();
      this.state = this.runtime.updateSelection(this.state, selection, {
        kind: "dom",
      });
      this.applySelection(this.state.selection);
      this.onSelectionChange?.(this.state.selection);
      this.suppressSelectionChange = false;
      return;
    }

    if (event.detail >= 3) {
      const lineOffsets = getLineOffsets(lines);
      const { lineIndex } = resolveOffsetToLine(lines, hit.cursorOffset);
      const lineInfo = lines[lineIndex];
      if (!lineInfo) {
        this.suppressSelectionChange = false;
        return;
      }
      const lineStart = lineOffsets[lineIndex] ?? 0;

      const lineEnd =
        lineStart + lineInfo.cursorLength + (lineInfo.hasNewline ? 1 : 0);
      const selection: Selection = {
        start: lineStart,
        end: lineEnd,
        affinity: "forward",
      };
      event.preventDefault();
      this.state = this.runtime.updateSelection(this.state, selection, {
        kind: "dom",
      });
      this.applySelection(this.state.selection);
      this.onSelectionChange?.(this.state.selection);
      this.suppressSelectionChange = false;
    }
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (this.isComposing) {
      return;
    }
    if (!this.isEventTargetInContentRoot(event.target)) {
      return;
    }

    const mac = isMacPlatform();
    const cmdOrCtrl = mac ? event.metaKey : event.ctrlKey;

    if (cmdOrCtrl && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      return;
    }

    if (cmdOrCtrl && event.key === "y" && !mac) {
      event.preventDefault();
      this.redo();
      return;
    }

    const isLineModifier = mac && event.metaKey;
    const isWordModifier = mac ? event.altKey : event.ctrlKey;

    const extendSelection = event.shiftKey;

    if (isLineModifier && event.key === "Backspace") {
      event.preventDefault();
      this.keydownHandledBeforeInput = true;
      this.deleteToVisualRowStart();
      // Reset the flag after any synchronous beforeinput events have been processed
      queueMicrotask(() => {
        this.keydownHandledBeforeInput = false;
      });
      return;
    }

    if (event.key === "ArrowLeft") {
      this.verticalNavGoalX = null;
      if (isLineModifier) {
        const selection = extendSelection
          ? this.extendSelectionToVisualRowStart()
          : this.moveSelectionToVisualRowStart();
        if (selection) {
          event.preventDefault();
          this.applySelectionUpdate(selection, "keyboard");
        }
        return;
      }
      if (isWordModifier) {
        event.preventDefault();
        const selection = extendSelection
          ? this.extendSelectionByWord("backward")
          : this.moveSelectionByWord("backward");
        this.applySelectionUpdate(selection, "keyboard");
        return;
      }
      if (extendSelection) {
        event.preventDefault();
        const cursorLength = this.state.map.cursorLength;
        const normalized = normalizeSelection(
          this.state.selection,
          cursorLength,
        );
        const { anchor, focus } = resolveSelectionAnchorAndFocus(normalized);
        const nextFocus = this.moveOffsetByChar(focus, "backward") ?? focus;
        this.applySelectionUpdate(
          selectionFromAnchor(anchor, nextFocus, "backward"),
          "keyboard",
        );
        return;
      }
      const selection = this.moveSelectionByChar("backward");
      if (selection) {
        event.preventDefault();
        this.applySelectionUpdate(selection, "keyboard");
        return;
      }
      return;
    }

    if (event.key === "ArrowRight") {
      this.verticalNavGoalX = null;
      if (isLineModifier) {
        const selection = extendSelection
          ? this.extendSelectionToVisualRowEnd()
          : this.moveSelectionToVisualRowEnd();
        if (selection) {
          event.preventDefault();
          this.applySelectionUpdate(selection, "keyboard");
        }
        return;
      }
      if (isWordModifier) {
        event.preventDefault();
        const selection = extendSelection
          ? this.extendSelectionByWord("forward")
          : this.moveSelectionByWord("forward");
        this.applySelectionUpdate(selection, "keyboard");
        return;
      }
      if (extendSelection) {
        event.preventDefault();
        const cursorLength = this.state.map.cursorLength;
        const normalized = normalizeSelection(
          this.state.selection,
          cursorLength,
        );
        const { anchor, focus } = resolveSelectionAnchorAndFocus(normalized);
        const nextFocus = this.moveOffsetByChar(focus, "forward") ?? focus;
        this.applySelectionUpdate(
          selectionFromAnchor(anchor, nextFocus, "forward"),
          "keyboard",
        );
        return;
      }
      const selection = this.moveSelectionByChar("forward");
      if (selection) {
        event.preventDefault();
        this.applySelectionUpdate(selection, "keyboard");
        return;
      }
      return;
    }

    if (event.key === "ArrowUp") {
      if (isLineModifier) {
        const selection: Selection = extendSelection
          ? this.extendSelectionToDocumentStart()
          : { start: 0, end: 0, affinity: "backward" };
        event.preventDefault();
        this.applySelectionUpdate(selection, "keyboard");
        return;
      }
      if (extendSelection) {
        const selection = this.extendFullLineSelectionByLine("up");
        if (selection) {
          event.preventDefault();
          this.applySelectionUpdate(selection, "keyboard");
          return;
        }
      }
      // Handle vertical navigation to skip atomic blocks
      if (!extendSelection) {
        const selection = this.moveSelectionVertically("up");
        if (selection) {
          event.preventDefault();
          this.applySelectionUpdate(selection, "keyboard");
          return;
        }
      }
      return;
    }

    if (event.key === "ArrowDown") {
      if (isLineModifier) {
        const end = this.state.map.cursorLength;
        const selection: Selection = extendSelection
          ? this.extendSelectionToDocumentEnd()
          : { start: end, end, affinity: "forward" };
        event.preventDefault();
        this.applySelectionUpdate(selection, "keyboard");
        return;
      }
      if (extendSelection) {
        const selection = this.extendFullLineSelectionByLine("down");
        if (selection) {
          event.preventDefault();
          this.applySelectionUpdate(selection, "keyboard");
          return;
        }
      }
      // Handle vertical navigation to skip atomic blocks
      if (!extendSelection) {
        const selection = this.moveSelectionVertically("down");
        if (selection) {
          event.preventDefault();
          this.applySelectionUpdate(selection, "keyboard");
          return;
        }
      }
      return;
    }

    if (event.key === "Tab") {
      this.verticalNavGoalX = null;
      event.preventDefault();
      this.keydownHandledBeforeInput = true;
      if (event.shiftKey) {
        this.handleOutdent();
      } else {
        this.handleIndent();
      }
      // Reset the flag after any synchronous beforeinput events have been processed
      queueMicrotask(() => {
        this.keydownHandledBeforeInput = false;
      });
      return;
    }

    const extensionCommand = this.resolveExtensionKeybinding(event);
    if (extensionCommand) {
      this.verticalNavGoalX = null;
      event.preventDefault();
      this.keydownHandledBeforeInput = true;
      this.executeCommand(extensionCommand);
      // Reset the flag after any synchronous beforeinput events have been processed
      queueMicrotask(() => {
        this.keydownHandledBeforeInput = false;
      });
      return;
    }
  }

  private resolveExtensionKeybinding(event: KeyboardEvent): EditCommand | null {
    for (const extension of this.extensions) {
      const bindings = extension.keybindings;
      if (!bindings) {
        continue;
      }
      for (const binding of bindings) {
        if (binding.key !== event.key) {
          continue;
        }
        if (binding.meta !== undefined && binding.meta !== event.metaKey) {
          continue;
        }
        if (binding.ctrl !== undefined && binding.ctrl !== event.ctrlKey) {
          continue;
        }
        if (binding.alt !== undefined && binding.alt !== event.altKey) {
          continue;
        }
        if (binding.shift !== undefined && binding.shift !== event.shiftKey) {
          continue;
        }
        const command =
          typeof binding.command === "function"
            ? binding.command(this.state)
            : binding.command;
        if (command) {
          return command;
        }
      }
    }
    return null;
  }

  private handleCopy(event: ClipboardEvent) {
    if (!this.isEventTargetInContentRoot(event.target)) {
      return;
    }

    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return;
    }

    const text = this.runtime.serializeSelection(
      this.state,
      this.state.selection,
    );
    if (!text) {
      return;
    }

    event.preventDefault();
    clipboardData.setData("text/plain", text);
  }

  private handleCut(event: ClipboardEvent) {
    if (this.readOnly) {
      return;
    }
    if (!this.isEventTargetInContentRoot(event.target)) {
      return;
    }

    this.handleCopy(event);
    if (this.state.selection.start !== this.state.selection.end) {
      this.applyEdit({ type: "delete-backward" });
    }
  }

  private handlePaste(event: ClipboardEvent) {
    if (this.readOnly) {
      return;
    }
    if (!this.isEventTargetInContentRoot(event.target)) {
      return;
    }

    const clipboardData = event.clipboardData;
    const html = clipboardData?.getData("text/html") ?? "";
    if (html) {
      const markdown = htmlToMarkdownForPaste(html);
      if (markdown) {
        event.preventDefault();
        this.applyEdit({ type: "insert", text: markdown });
        return;
      }
    }

    event.preventDefault();
    const text = clipboardData?.getData("text/plain") ?? "";
    if (!text) {
      return;
    }

    for (const extension of this.extensions) {
      const handler = extension.onPasteText;
      if (!handler) {
        continue;
      }
      const command = handler(text, this.state);
      if (!command) {
        continue;
      }
      if (
        command.type === "insert" ||
        command.type === "insert-line-break" ||
        command.type === "delete-backward" ||
        command.type === "delete-forward"
      ) {
        this.applyEdit(command);
      } else {
        this.executeCommand(command);
      }
      return;
    }

    this.applyEdit({ type: "insert", text });
  }

  private handleBeforeInput(event: InputEvent) {
    if (this.readOnly || this.isComposing || event.isComposing) {
      if (
        event.inputType === "insertReplacementText" ||
        event.inputType === "insertText"
      ) {
        console.log("[SPELLCHECK] beforeinput ignored (readonly/composing)", {
          inputType: event.inputType,
          data: event.data,
          cancelable: event.cancelable,
          isComposing: this.isComposing,
          eventIsComposing: event.isComposing,
          readOnly: this.readOnly,
        });
      }
      return;
    }
    if (!this.isEventTargetInContentRoot(event.target)) {
      if (
        event.inputType === "insertReplacementText" ||
        event.inputType === "insertText"
      ) {
        console.log(
          "[SPELLCHECK] beforeinput ignored (target outside editor)",
          {
            inputType: event.inputType,
            data: event.data,
            cancelable: event.cancelable,
            target: event.target,
          },
        );
      }
      return;
    }

    // If already handled by keydown (e.g., Cmd+Backspace for line delete),
    // skip beforeinput processing to avoid double-applying the edit.
    if (this.keydownHandledBeforeInput) {
      this.keydownHandledBeforeInput = false;
      if (
        event.inputType === "insertReplacementText" ||
        event.inputType === "insertText"
      ) {
        console.log(
          "[SPELLCHECK] beforeinput skipped (keydownHandledBeforeInput)",
          {
            inputType: event.inputType,
            data: event.data,
            cancelable: event.cancelable,
          },
        );
      }
      event.preventDefault();
      return;
    }

    const intent = this.resolveBeforeInputIntent(event);
    if (!intent) {
      if (
        event.inputType === "insertReplacementText" ||
        event.inputType === "insertText"
      ) {
        console.log("[SPELLCHECK] beforeinput: no intent", {
          inputType: event.inputType,
          data: event.data,
          cancelable: event.cancelable,
        });
      }
      return;
    }

    if (
      event.inputType === "insertReplacementText" ||
      (event.inputType === "insertText" && intent.type === "replace-text")
    ) {
      const selection = this.state.selection;
      const focus =
        selection.start === selection.end
          ? selection.start
          : Math.max(selection.start, selection.end);
      const preview = this.state.source.slice(
        Math.max(0, focus - 24),
        Math.min(this.state.source.length, focus + 24),
      );
      console.log("[SPELLCHECK] beforeinput: resolved intent", {
        inputType: event.inputType,
        data: event.data,
        cancelable: event.cancelable,
        intent,
        currentSelection: this.state.selection,
        sourcePreviewAroundFocus: preview,
      });
    }

    event.preventDefault();
    if (
      event.inputType === "insertReplacementText" ||
      (event.inputType === "insertText" && intent.type === "replace-text")
    ) {
      console.log("[SPELLCHECK] beforeinput: after preventDefault", {
        inputType: event.inputType,
        defaultPrevented: event.defaultPrevented,
      });
    }
    this.markBeforeInputHandled();
    this.suppressSelectionChangeForTick();
    this.applyInputIntent(intent);
  }

  private applyInputIntent(intent: InputIntent) {
    if (intent.type === "noop") {
      this.scheduleOverlayUpdate();
      return;
    }
    if (intent.type === "insert-text") {
      this.applyEdit({ type: "insert", text: intent.text });
      return;
    }
    if (intent.type === "insert-line-break") {
      this.applyEdit({ type: "insert-line-break" });
      return;
    }
    if (intent.type === "delete-backward") {
      this.applyEdit({ type: "delete-backward" });
      return;
    }
    if (intent.type === "delete-forward") {
      this.applyEdit({ type: "delete-forward" });
      return;
    }
    if (intent.type === "replace-text") {
      this.state = this.runtime.updateSelection(this.state, intent.selection, {
        kind: "dom",
      });
      this.applyEdit({ type: "insert", text: intent.text });
      return;
    }
    if (intent.type === "undo") {
      this.undo();
      return;
    }
    if (intent.type === "redo") {
      this.redo();
      return;
    }
  }

  private handleInput(event: Event) {
    if (!(event instanceof InputEvent)) {
      return;
    }
    if (!this.isEventTargetInContentRoot(event.target)) {
      if (event.inputType === "insertReplacementText") {
        console.log("[SPELLCHECK] input ignored (target outside editor)", {
          inputType: event.inputType,
          data: event.data,
          target: event.target,
        });
      }
      return;
    }
    if (this.beforeInputHandled) {
      if (event.inputType === "insertReplacementText") {
        console.log("[SPELLCHECK] input ignored (handled via beforeinput)", {
          inputType: event.inputType,
          data: event.data,
        });
      }
      return;
    }

    if (this.compositionCommit && event.inputType === "insertText") {
      this.clearCompositionCommit();
      return;
    }

    if (
      this.isComposing ||
      event.isComposing ||
      isCompositionInputType(event.inputType)
    ) {
      return;
    }

    if (
      event.inputType === "historyUndo" ||
      event.inputType === "historyRedo"
    ) {
      return;
    }

    if (!this.domMap) {
      return;
    }
    const selection = readDomSelection(this.domMap);
    if (!selection) {
      return;
    }
    // Use reconciliation to preserve formatting markers (for Grammarly-like edits)
    this.reconcileDomChanges(selection);
  }

  private handleCompositionStart(event: CompositionEvent) {
    if (!this.isEventTargetInContentRoot(event.target)) {
      return;
    }
    this.isComposing = true;
    this.clearCompositionCommit();
  }

  private handleCompositionEnd(event: CompositionEvent) {
    if (!this.isEventTargetInContentRoot(event.target)) {
      return;
    }
    this.isComposing = false;
    const selection = this.domMap
      ? (readDomSelection(this.domMap) ?? this.state.selection)
      : this.state.selection;

    // Use reconciliation to preserve formatting markers
    const changed = this.reconcileDomChanges(selection);
    if (!changed) {
      this.setSelection(selection);
    }
    this.markCompositionCommit();
    this.scheduleOverlayUpdate();
  }

  private resolveBeforeInputIntent(event: InputEvent): InputIntent | null {
    // Input contract:
    // - The model owns selection; DOM selection + targetRanges are not authoritative.
    // - `getTargetRanges()` is only used for replacement/composition-like flows
    //   (e.g. spellcheck/Grammarly), never to redefine selection for ordinary typing
    //   or Backspace/Delete at a collapsed caret.
    const inputType = event.inputType;
    if (inputType === "insertText") {
      const text = event.data ?? "";
      if (!text) {
        return null;
      }
      // Firefox + Grammarly can send `insertText` (not `insertReplacementText`)
      // with a non-collapsed targetRange describing the intended replacement.
      // Only treat it as replacement when the range is non-collapsed; collapsed
      // caret typing must not become DOM-targetRange-driven.
      const targetResult = this.selectionFromTargetRangesWithStatus(event);
      if (targetResult.status === "valid") {
        const targetSelection = targetResult.selection;
        if (targetSelection.start !== targetSelection.end) {
          return {
            type: "replace-text",
            text,
            selection: targetSelection,
          };
        }
      }
      return {
        type: "insert-text",
        text,
      };
    }

    if (inputType === "insertLineBreak" || inputType === "insertParagraph") {
      return {
        type: "insert-line-break",
      };
    }

    if (inputType === "insertFromPaste") {
      const text =
        event.data ??
        event.dataTransfer?.getData("text/plain") ??
        event.dataTransfer?.getData("text") ??
        "";
      if (!text) {
        return null;
      }
      return { type: "insert-text", text };
    }

    if (
      inputType === "deleteContentBackward" ||
      inputType === "deleteByCut" ||
      inputType === "deleteByLineBoundary"
    ) {
      return {
        type: "delete-backward",
      };
    }

    if (inputType === "deleteContentForward") {
      return {
        type: "delete-forward",
      };
    }

    if (inputType === "insertReplacementText") {
      // Firefox spellcheck can dispatch `beforeinput` with `insertReplacementText`
      // but omit `data`. In that case we must not preventDefault; allow the
      // browser to apply the replacement and reconcile the DOM on the subsequent
      // `input` event.
      if (event.data === null) {
        return null;
      }
      const targetResult = this.selectionFromTargetRangesWithStatus(event);
      // If targetRanges returned an invalid range (outside container), abort
      if (targetResult.status === "invalid") {
        return { type: "noop" };
      }
      // If targetRanges was empty/missing, fall back to current selection
      const targetSelection =
        targetResult.status === "valid"
          ? targetResult.selection
          : this.state.selection;
      return {
        type: "replace-text",
        text: event.data ?? "",
        selection: targetSelection,
      };
    }

    if (inputType === "historyUndo") {
      return { type: "undo" };
    }

    if (inputType === "historyRedo") {
      return { type: "redo" };
    }

    return null;
  }

  private selectionFromTargetRangesWithStatus(
    event: InputEvent,
  ):
    | { status: "none" }
    | { status: "invalid" }
    | { status: "valid"; selection: Selection } {
    const debug = event.inputType === "insertReplacementText";
    if (!event.getTargetRanges) {
      if (debug) {
        console.log("[SPELLCHECK][targetRanges] missing getTargetRanges()", {
          inputType: event.inputType,
          data: event.data,
          cancelable: event.cancelable,
        });
      }
      return { status: "none" };
    }

    const ranges = event.getTargetRanges();
    if (!ranges || ranges.length === 0) {
      if (debug) {
        console.log("[SPELLCHECK][targetRanges] no ranges", {
          inputType: event.inputType,
          data: event.data,
          cancelable: event.cancelable,
        });
      }
      return { status: "none" };
    }

    const range = ranges[0];
    // Only log insertText targetRanges when they're actually present (that
    // indicates a spellcheck/Grammarly-like replacement flow).
    if (debug || event.inputType === "insertText") {
      console.log("[SPELLCHECK][targetRanges] raw range", {
        inputType: event.inputType,
        data: event.data,
        cancelable: event.cancelable,
        startContainer:
          range.startContainer instanceof Element
            ? range.startContainer.tagName
            : range.startContainer.nodeName,
        startOffset: range.startOffset,
        endContainer:
          range.endContainer instanceof Element
            ? range.endContainer.tagName
            : range.endContainer.nodeName,
        endOffset: range.endOffset,
        startContained: this.container.contains(range.startContainer),
        endContained: this.container.contains(range.endContainer),
      });
    }
    // If range points outside the editor, it's invalid
    if (
      !this.container.contains(range.startContainer) ||
      !this.container.contains(range.endContainer)
    ) {
      return { status: "invalid" };
    }
    const start = this.cursorFromDom(range.startContainer, range.startOffset);
    const end = this.cursorFromDom(range.endContainer, range.endOffset);
    if (!start || !end) {
      if (debug || event.inputType === "insertText") {
        console.log("[SPELLCHECK][targetRanges] cursorFromDom failed", {
          inputType: event.inputType,
          data: event.data,
          cancelable: event.cancelable,
          start,
          end,
        });
      }
      return { status: "invalid" };
    }

    const affinity: Affinity =
      start.cursorOffset === end.cursorOffset ? end.affinity : "forward";

    return {
      status: "valid",
      selection: {
        start: start.cursorOffset,
        end: end.cursorOffset,
        affinity,
      },
    };
  }

  private cursorFromDom(
    node: Node,
    offset: number,
  ): { cursorOffset: number; affinity: Affinity } | null {
    if (node instanceof Text) {
      return this.domMap?.cursorAtDom(node, offset) ?? null;
    }
    if (!(node instanceof Element)) {
      return null;
    }

    const resolved = resolveTextPoint(node, offset);
    if (!resolved) {
      return null;
    }
    return this.domMap?.cursorAtDom(resolved.node, resolved.offset) ?? null;
  }

  private applyEdit(
    command:
      | { type: "insert"; text: string }
      | { type: "insert-line-break" }
      | { type: "delete-backward" }
      | { type: "delete-forward" },
  ) {
    // Special handling for backspace at start of line after atomic block
    if (command.type === "delete-backward") {
      const handled = this.handleBackspaceAfterAtomicBlock();
      if (handled) {
        return;
      }
    }
    if (
      command.type === "delete-backward" ||
      command.type === "delete-forward"
    ) {
      const handled = this.handleDeleteAtomicBlockSelection();
      if (handled) {
        return;
      }
    }

    // Use different history kind for replacement operations (selection exists)
    // to prevent grouping with regular typing
    const hasSelection =
      this.state.selection.start !== this.state.selection.end;
    const historyKind =
      command.type === "insert" && hasSelection ? "replace" : command.type;

    this.recordHistory(historyKind);

    const nextState = this.runtime.applyEdit(command, this.state);

    this.selectedAtomicLineIndex = null;
    this.state = nextState;
    this.render();
    this.onChange?.(this.state.source, this.state.selection);
    if (this.state.selection.start === this.state.selection.end) {
      this.flushOverlayUpdate();
    } else {
      this.scheduleOverlayUpdate();
    }
    this.scheduleScrollCaretIntoView();
  }

  private handleDeleteAtomicBlockSelection(): boolean {
    if (this.selectedAtomicLineIndex === null) {
      return false;
    }

    const lineIndex = this.selectedAtomicLineIndex;
    const lines = getDocLines(this.state.doc);
    const lineOffsets = getLineOffsets(lines);
    const lineInfo = lines[lineIndex];
    if (!lineInfo || !lineInfo.isAtomic) {
      this.selectedAtomicLineIndex = null;
      return false;
    }

    const lineStart = lineOffsets[lineIndex] ?? 0;

    const source = this.state.source;
    let from = 0;
    for (let i = 0; i < lineIndex; i += 1) {
      const newline = source.indexOf("\n", from);
      if (newline === -1) {
        return false;
      }
      from = newline + 1;
    }
    let to = source.indexOf("\n", from);
    if (to === -1) {
      // Last line: remove the preceding newline if possible.
      if (from > 0) {
        from -= 1;
      }
      to = source.length;
    } else {
      // Include the trailing newline so the surrounding lines stay separate.
      to += 1;
    }
    const newSource = source.slice(0, from) + source.slice(to);

    this.recordHistory("delete-backward");
    this.state = this.runtime.createState(newSource, {
      start: lineStart,
      end: lineStart,
      affinity: "forward",
    });
    this.render();
    this.onChange?.(this.state.source, this.state.selection);
    this.flushOverlayUpdate();
    this.scheduleScrollCaretIntoView();
    this.selectedAtomicLineIndex = null;
    return true;
  }

  private handleBackspaceAfterAtomicBlock(): boolean {
    const selection = this.state.selection;
    // Only for collapsed selection
    if (selection.start !== selection.end) {
      return false;
    }

    const lines = getDocLines(this.state.doc);
    const lineOffsets = getLineOffsets(lines);
    const lineIndex = lineOffsets.findIndex(
      (offset) => offset === selection.start,
    );
    if (lineIndex === -1) {
      return false;
    }

    const prev = lineIndex > 0 ? lines[lineIndex - 1] : null;
    const current = lines[lineIndex] ?? null;
    const next = lineIndex + 1 < lines.length ? lines[lineIndex + 1] : null;

    // v1 behavior:
    // - Backspace at start of a line immediately after an atomic block swaps the text line above the atomic.
    // - If the caret is on the atomic line start (browser/measurement edge cases), apply the swap with the next line.
    let swapA: number | null = null;
    let swapB: number | null = null;
    if (prev?.isAtomic) {
      swapA = lineIndex - 1;
      swapB = lineIndex;
    } else if (current?.isAtomic && next && !next.isAtomic) {
      swapA = lineIndex;
      swapB = lineIndex + 1;
    } else {
      return false;
    }

    const sourceLines = this.state.source.split("\n");
    if (
      swapA < 0 ||
      swapB < 0 ||
      swapA >= sourceLines.length ||
      swapB >= sourceLines.length
    ) {
      return false;
    }
    const aSource = sourceLines[swapA];
    const bSource = sourceLines[swapB];
    if (aSource === undefined || bSource === undefined) {
      return false;
    }
    sourceLines[swapA] = bSource;
    sourceLines[swapB] = aSource;
    const newSource = sourceLines.join("\n");

    const nextState = this.runtime.createState(newSource);
    const nextOffsets = getLineOffsets(getDocLines(nextState.doc));
    const cursorPos = nextOffsets[swapA] ?? 0;

    this.recordHistory("delete-backward");
    this.state = {
      ...nextState,
      selection: { start: cursorPos, end: cursorPos, affinity: "forward" },
    };
    this.render();
    this.onChange?.(this.state.source, this.state.selection);
    this.flushOverlayUpdate();
    this.scheduleScrollCaretIntoView();
    return true;
  }

  private recordHistory(kind: string) {
    const now = Date.now();
    const timeDelta = now - this.history.lastEditAt;
    const shouldGroup =
      kind === this.history.lastKind &&
      timeDelta < HISTORY_GROUPING_INTERVAL_MS;

    if (!shouldGroup) {
      this.history.undoStack.push({
        source: this.state.source,
        selection: this.state.selection,
      });
      if (this.history.undoStack.length > MAX_UNDO_STACK_SIZE) {
        this.history.undoStack.shift();
      }
      this.history.redoStack = [];
    }

    this.history.lastEditAt = now;
    this.history.lastKind = kind;
  }

  private applySelectionUpdate(
    selection: Selection,
    kind: "dom" | "keyboard" | "programmatic" = "programmatic",
  ) {
    if (kind !== "keyboard") {
      this.verticalNavGoalX = null;
    }
    this.selectedAtomicLineIndex = null;
    this.state = this.runtime.updateSelection(this.state, selection, { kind });
    if (!this.isComposing) {
      this.applySelection(this.state.selection);
    }
    this.onSelectionChange?.(this.state.selection);
    if (this.state.selection.start === this.state.selection.end) {
      this.flushOverlayUpdate();
    }
    this.scheduleScrollCaretIntoView();
  }

  private getLayoutForNavigation() {
    if (!this.contentRoot) {
      return null;
    }
    const lines = getDocLines(this.state.doc);
    const layout = measureLayoutModelFromDom({
      lines,
      root: this.contentRoot,
      container: this.container,
    });
    if (!layout) {
      return null;
    }
    return { lines, layout };
  }

  private moveSelectionByChar(
    direction: "forward" | "backward",
  ): Selection | null {
    const selection = this.state.selection;

    // For non-collapsed selection, collapse to the appropriate edge
    if (selection.start !== selection.end) {
      const target =
        direction === "forward"
          ? Math.max(selection.start, selection.end)
          : Math.min(selection.start, selection.end);
      return { start: target, end: target, affinity: direction };
    }

    const currentPos = selection.start;
    const nextPos = this.moveOffsetByChar(currentPos, direction);
    if (nextPos === null) {
      return null;
    }
    return { start: nextPos, end: nextPos, affinity: direction };
  }

  private moveOffsetByChar(
    offset: number,
    direction: "forward" | "backward",
  ): number | null {
    const cursorLength = this.state.map.cursorLength;
    const lines = getDocLines(this.state.doc);
    const lineOffsets = getLineOffsets(lines);

    let nextPos: number;
    if (direction === "forward") {
      if (offset >= cursorLength) {
        return null;
      }
      nextPos = offset + 1;
    } else {
      if (offset <= 0) {
        return null;
      }
      nextPos = offset - 1;
    }

    const { lineIndex: nextLineIndex } = resolveOffsetToLine(lines, nextPos);
    const nextLineInfo = lines[nextLineIndex];

    if (nextLineInfo && nextLineInfo.isAtomic) {
      const lineStart = lineOffsets[nextLineIndex] ?? 0;
      const lineEnd =
        lineStart +
        nextLineInfo.cursorLength +
        (nextLineInfo.hasNewline ? 1 : 0);

      nextPos =
        direction === "forward" ? lineEnd : lineStart > 0 ? lineStart - 1 : 0;
    }

    return Math.max(0, Math.min(nextPos, cursorLength));
  }

  private moveSelectionVertically(direction: "up" | "down"): Selection | null {
    const measurement = this.getLayoutForNavigation();
    if (!measurement) {
      return null;
    }
    const { lines, layout } = measurement;

    if (!this.lastFocusRect) {
      this.flushOverlayUpdate();
    }

    if (this.verticalNavGoalX === null) {
      if (this.lastFocusRect) {
        this.verticalNavGoalX = this.lastFocusRect.left;
      }
    }

    const { focus } = resolveSelectionAnchorAndFocus(this.state.selection);
    const focusResolved = resolveOffsetToLine(lines, focus);
    const focusLineLayout = layout.lines[focusResolved.lineIndex];
    let focusRowIndex: number | undefined = undefined;

    if (focusLineLayout?.rows.length && this.lastFocusRect) {
      const caretY = this.lastFocusRect.top;
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < focusLineLayout.rows.length; index += 1) {
        const row = focusLineLayout.rows[index];
        if (!row) {
          continue;
        }
        const distance = Math.abs(row.rect.top - caretY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }

      focusRowIndex = bestIndex;
    }

    const containerRect = this.container.getBoundingClientRect();
    const scrollLeft = this.container.scrollLeft;
    const scrollTop = this.container.scrollTop;

    const result = moveSelectionVerticallyInLayout({
      lines,
      layout,
      selection: this.state.selection,
      direction,
      goalX: this.verticalNavGoalX,
      focusRowIndex,
      hitTestCursorAt: (x, y) => {
        const hit = this.hitTestFromClientPoint(
          containerRect.left + x - scrollLeft,
          containerRect.top + y - scrollTop,
        );
        if (!hit || !this.contentRoot) {
          return null;
        }

        const resolved = resolveOffsetToLine(lines, hit.cursorOffset);
        const lineInfo = lines[resolved.lineIndex];
        const lineElement = this.contentRoot.querySelector(
          `[data-line-index="${resolved.lineIndex}"]`,
        );
        if (!lineInfo || !(lineElement instanceof HTMLElement)) {
          return { cursorOffset: hit.cursorOffset, affinity: hit.affinity };
        }

        const caret = getDomCaretRect({
          lineElement,
          lineInfo,
          offsetInLine: resolved.offsetInLine,
          affinity: hit.affinity,
        });
        const caretTop =
          caret?.rect.top !== undefined
            ? caret.rect.top - containerRect.top + scrollTop
            : undefined;

        return {
          cursorOffset: hit.cursorOffset,
          affinity: hit.affinity,
          caretTop,
        };
      },
    });
    if (!result) {
      return null;
    }
    this.verticalNavGoalX = result.goalX;
    return result.selection;
  }

  private moveSelectionToVisualRowStart(): Selection | null {
    const measurement = this.getLayoutForNavigation();
    if (!measurement) {
      const start = 0;
      return { start, end: start, affinity: "backward" };
    }
    const { lines, layout } = measurement;
    const selection = this.state.selection;
    const focus =
      selection.start === selection.end
        ? selection.start
        : Math.min(selection.start, selection.end);
    const { rowStart } = getVisualRowBoundaries({
      lines,
      layout,
      offset: focus,
      affinity: "backward",
    });
    let target = rowStart;
    if (focus === rowStart && focus > 0) {
      const previous = getVisualRowBoundaries({
        lines,
        layout,
        offset: focus - 1,
        affinity: "backward",
      });
      target = previous.rowStart;
    }
    return { start: target, end: target, affinity: "forward" };
  }

  private moveSelectionToVisualRowEnd(): Selection | null {
    const measurement = this.getLayoutForNavigation();
    if (!measurement) {
      const end = this.state.map.cursorLength;
      return { start: end, end, affinity: "forward" };
    }
    const { lines, layout } = measurement;
    const selection = this.state.selection;
    const focus =
      selection.start === selection.end
        ? selection.start
        : Math.max(selection.start, selection.end);
    const { rowEnd } = getVisualRowBoundaries({
      lines,
      layout,
      offset: focus,
      affinity: "forward",
    });
    let target = rowEnd;
    if (focus === rowEnd && focus < this.state.map.cursorLength) {
      const next = getVisualRowBoundaries({
        lines,
        layout,
        offset: focus + 1,
        affinity: "forward",
      });
      target = next.rowEnd;
    }
    return { start: target, end: target, affinity: "backward" };
  }

  private extendSelectionToVisualRowStart(): Selection | null {
    const selection = this.state.selection;
    const { anchor, focus } = resolveSelectionAnchorAndFocus(selection);
    const affinity = resolveSelectionAffinity(selection);
    const measurement = this.getLayoutForNavigation();
    if (!measurement) {
      return selectionFromAnchor(anchor, 0, "backward");
    }
    const { lines, layout } = measurement;
    const { rowStart } = getVisualRowBoundaries({
      lines,
      layout,
      offset: focus,
      affinity,
    });
    let target = rowStart;
    if (focus === rowStart && focus > 0) {
      const previous = getVisualRowBoundaries({
        lines,
        layout,
        offset: focus - 1,
        affinity: "backward",
      });
      target = previous.rowStart;
    }
    return selectionFromAnchor(anchor, target, "backward");
  }

  private extendSelectionToVisualRowEnd(): Selection | null {
    const selection = this.state.selection;
    const { anchor, focus } = resolveSelectionAnchorAndFocus(selection);
    const affinity = resolveSelectionAffinity(selection);
    const measurement = this.getLayoutForNavigation();
    if (!measurement) {
      return selectionFromAnchor(
        anchor,
        this.state.map.cursorLength,
        "forward",
      );
    }
    const { lines, layout } = measurement;
    const { rowEnd } = getVisualRowBoundaries({
      lines,
      layout,
      offset: focus,
      affinity,
    });
    let target = rowEnd;
    if (focus === rowEnd && focus < this.state.map.cursorLength) {
      const next = getVisualRowBoundaries({
        lines,
        layout,
        offset: focus + 1,
        affinity: "forward",
      });
      target = next.rowEnd;
    }
    return selectionFromAnchor(anchor, target, "forward");
  }

  private extendSelectionToDocumentStart(): Selection {
    const { anchor } = resolveSelectionAnchorAndFocus(this.state.selection);
    return selectionFromAnchor(anchor, 0, "backward");
  }

  private extendSelectionToDocumentEnd(): Selection {
    const { anchor } = resolveSelectionAnchorAndFocus(this.state.selection);
    return selectionFromAnchor(anchor, this.state.map.cursorLength, "forward");
  }

  private extendFullLineSelectionByLine(
    direction: "up" | "down",
  ): Selection | null {
    const selection = this.state.selection;
    if (selection.start === selection.end) {
      return null;
    }
    const lines = getDocLines(this.state.doc);
    const lineOffsets = getLineOffsets(lines);
    const selStart = Math.min(selection.start, selection.end);
    const selEnd = Math.max(selection.start, selection.end);
    const fullLineInfo = this.detectFullLineSelection(
      selStart,
      selEnd,
      lines,
      lineOffsets,
    );
    if (!fullLineInfo) {
      return null;
    }

    if (direction === "up") {
      if (fullLineInfo.startLineIndex <= 0) {
        return null;
      }
      const startLineIndex = fullLineInfo.startLineIndex - 1;
      const endLineIndex = fullLineInfo.endLineIndex;
      const start = lineOffsets[startLineIndex] ?? 0;
      const lineInfo = lines[endLineIndex];
      const lineStart = lineOffsets[endLineIndex] ?? 0;
      const end = lineInfo
        ? lineStart + lineInfo.cursorLength + (lineInfo.hasNewline ? 1 : 0)
        : selEnd;
      return { start, end, affinity: "forward" };
    }

    if (fullLineInfo.endLineIndex >= lines.length - 1) {
      return null;
    }
    const startLineIndex = fullLineInfo.startLineIndex;
    const endLineIndex = fullLineInfo.endLineIndex + 1;
    const start = lineOffsets[startLineIndex] ?? 0;
    const lineInfo = lines[endLineIndex];
    const lineStart = lineOffsets[endLineIndex] ?? 0;
    const end = lineInfo
      ? lineStart + lineInfo.cursorLength + (lineInfo.hasNewline ? 1 : 0)
      : selEnd;
    return { start, end, affinity: "forward" };
  }

  private moveSelectionByWord(direction: Affinity): Selection {
    const maxLength = this.state.map.cursorLength;
    const normalized = normalizeSelection(this.state.selection, maxLength);
    if (normalized.start !== normalized.end) {
      const offset =
        direction === "backward" ? normalized.start : normalized.end;
      return { start: offset, end: offset, affinity: direction };
    }
    const nextOffset = this.moveOffsetByWord(normalized.start, direction);
    return { start: nextOffset, end: nextOffset, affinity: direction };
  }

  private extendSelectionByWord(direction: Affinity): Selection {
    const maxLength = this.state.map.cursorLength;
    const normalized = normalizeSelection(this.state.selection, maxLength);
    const { anchor, focus } = resolveSelectionAnchorAndFocus(normalized);
    const nextFocus = this.moveOffsetByWord(focus, direction);
    if (nextFocus === focus) {
      return normalized;
    }
    return selectionFromAnchor(anchor, nextFocus, direction);
  }

  private moveOffsetByWord(offset: number, direction: Affinity): number {
    const lines = getDocLines(this.state.doc);
    const visibleText = getVisibleText(lines);
    if (!visibleText) {
      return 0;
    }
    const visibleOffset = cursorOffsetToVisibleOffset(lines, offset);
    const nextVisibleOffset =
      direction === "backward"
        ? prevWordBreak(visibleText, visibleOffset)
        : nextWordBreak(visibleText, visibleOffset);
    return visibleOffsetToCursorOffset(lines, nextVisibleOffset) ?? offset;
  }

  private deleteToVisualRowStart() {
    const selection = this.state.selection;
    const lines = getDocLines(this.state.doc);
    const { lineIndex, offsetInLine } = resolveOffsetToLine(
      lines,
      selection.start,
    );
    const lineInfo = lines[lineIndex];
    if (!lineInfo) {
      return;
    }

    const lineOffsets = getLineOffsets(lines);
    const lineStart = lineOffsets[lineIndex] ?? 0;
    const isLineStart = offsetInLine === 0;
    const isCollapsed = selection.start === selection.end;

    if (isCollapsed && isLineStart) {
      this.applyEdit({ type: "delete-backward" });
      return;
    }

    const measurement = this.getLayoutForNavigation();
    if (!measurement) {
      const deleteSelection: Selection = {
        start: lineStart,
        end: selection.end,
        affinity: "forward",
      };
      this.state = { ...this.state, selection: deleteSelection };
      this.applyEdit({ type: "delete-backward" });
      return;
    }

    const { layout } = measurement;
    const { rowStart } = getVisualRowBoundaries({
      lines,
      layout,
      offset: selection.start,
      affinity: "backward",
    });

    const isVisualRowStart = selection.start === rowStart;
    if (isCollapsed && isVisualRowStart) {
      this.applyEdit({ type: "delete-backward" });
      return;
    }

    const deleteSelection: Selection = {
      start: rowStart,
      end: selection.end,
      affinity: "forward",
    };
    this.state = { ...this.state, selection: deleteSelection };
    this.applyEdit({ type: "delete-backward" });
  }

  private handleIndent() {
    const selection = this.state.selection;
    const lines = getDocLines(this.state.doc);
    const TAB_SPACES = "  ";

    const isCollapsed = selection.start === selection.end;

    const startLineIndex = resolveOffsetToLine(
      lines,
      selection.start,
    ).lineIndex;
    const endLineIndex = resolveOffsetToLine(
      lines,
      Math.max(selection.start, selection.end - 1),
    ).lineIndex;

    const affectsMultipleLines = endLineIndex > startLineIndex;

    // Check if the current line is a list item by checking source text
    const sourceLines = this.state.source.split("\n");
    const startSourceLine = sourceLines[startLineIndex] ?? "";
    const listPattern = /^(\s*)([-*+]|\d+\.)(\s+)/;
    const isListItem = listPattern.test(startSourceLine);

    // For list items, delegate to runtime so extensions can handle renumbering
    if (isListItem) {
      this.recordHistory("edit");
      const nextState = this.runtime.applyEdit({ type: "indent" }, this.state);
      this.state = nextState;
      this.render();
      this.onChange?.(this.state.source, this.state.selection);
      this.scheduleOverlayUpdate();
      return;
    }

    // For collapsed selection (caret) on non-list lines in middle/end of line,
    // insert at caret position. Otherwise indent at line start.
    if (isCollapsed) {
      // Check if caret is in middle/end of line (not at start)
      const lineOffsets = getLineOffsets(lines);
      const lineStart = lineOffsets[startLineIndex] ?? 0;
      const offsetInLine = selection.start - lineStart;
      if (offsetInLine > 0) {
        // Insert at caret position
        this.applyEdit({ type: "insert", text: TAB_SPACES });
        return;
      }
    }

    // For single-line partial selection on non-list lines, replace selection with tab
    if (!affectsMultipleLines && !isCollapsed) {
      this.applyEdit({ type: "insert", text: TAB_SPACES });
      return;
    }

    // For collapsed selection at line start on non-list lines,
    // indent at line start (fall through to multi-line logic)
    if (!affectsMultipleLines && isCollapsed) {
      // Collapsed at line start on non-list - indent at line start
      this.recordHistory("edit");
    }

    let newSource = this.state.source;
    let totalInserted = 0;
    const sourceLineOffsets: number[] = [];
    let sourceOffset = 0;
    for (let i = 0; i < sourceLines.length; i++) {
      sourceLineOffsets.push(sourceOffset);
      sourceOffset += sourceLines[i].length;
      if (i < sourceLines.length - 1) {
        sourceOffset += 1;
      }
    }

    for (let i = startLineIndex; i <= endLineIndex; i++) {
      const insertAt = sourceLineOffsets[i] + totalInserted;
      newSource =
        newSource.slice(0, insertAt) + TAB_SPACES + newSource.slice(insertAt);
      totalInserted += TAB_SPACES.length;
    }

    const selStart = selection.start + TAB_SPACES.length;
    const linesAffected = endLineIndex - startLineIndex + 1;
    const selEnd = selection.end + TAB_SPACES.length * linesAffected;

    const newSelection: Selection = {
      start: selStart,
      end: selEnd,
      affinity: "forward",
    };

    this.state = this.runtime.createState(newSource, newSelection);
    this.render();
    this.onChange?.(this.state.source, this.state.selection);
    this.scheduleOverlayUpdate();
  }

  private handleOutdent() {
    const selection = this.state.selection;
    const lines = getDocLines(this.state.doc);
    const TAB_SPACES = "  ";

    const startLineIndex = resolveOffsetToLine(
      lines,
      selection.start,
    ).lineIndex;
    const endLineIndex = resolveOffsetToLine(
      lines,
      Math.max(selection.start, selection.end - 1),
    ).lineIndex;

    const sourceLines = this.state.source.split("\n");

    // Check if the current line is a list item by checking source text
    const startSourceLine = sourceLines[startLineIndex] ?? "";
    const listPattern = /^(\s*)([-*+]|\d+\.)(\s+)/;
    const isListItem = listPattern.test(startSourceLine);

    // For list items, delegate to runtime so extensions can handle renumbering
    if (isListItem) {
      this.recordHistory("edit");
      const nextState = this.runtime.applyEdit({ type: "outdent" }, this.state);
      // Only update if something changed
      if (nextState.source !== this.state.source) {
        this.state = nextState;
        this.render();
        this.onChange?.(this.state.source, this.state.selection);
        this.scheduleOverlayUpdate();
      }
      return;
    }

    let newSource = this.state.source;
    let totalRemoved = 0;
    const sourceLineOffsets: number[] = [];
    let sourceOffset = 0;
    for (let i = 0; i < sourceLines.length; i++) {
      sourceLineOffsets.push(sourceOffset);
      sourceOffset += sourceLines[i].length;
      if (i < sourceLines.length - 1) {
        sourceOffset += 1;
      }
    }

    const removedPerLine: number[] = [];
    for (let i = startLineIndex; i <= endLineIndex; i++) {
      const lineStart = sourceLineOffsets[i] - totalRemoved;
      const lineText = newSource.slice(
        lineStart,
        newSource.indexOf("\n", lineStart) === -1
          ? newSource.length
          : newSource.indexOf("\n", lineStart),
      );

      let removeCount = 0;
      if (lineText.startsWith(TAB_SPACES)) {
        removeCount = TAB_SPACES.length;
      } else if (lineText.startsWith("\t")) {
        removeCount = 1;
      } else if (lineText.startsWith(" ")) {
        removeCount = 1;
      }

      if (removeCount > 0) {
        newSource =
          newSource.slice(0, lineStart) +
          newSource.slice(lineStart + removeCount);
        totalRemoved += removeCount;
      }
      removedPerLine.push(removeCount);
    }

    if (totalRemoved === 0) {
      return;
    }

    const firstRemoved = removedPerLine[0] ?? 0;
    const selStart = Math.max(0, selection.start - firstRemoved);
    const selEnd = Math.max(0, selection.end - totalRemoved);

    const newSelection: Selection = {
      start: selStart,
      end: selEnd,
      affinity: "forward",
    };

    this.state = this.runtime.createState(newSource, newSelection);
    this.render();
    this.onChange?.(this.state.source, this.state.selection);
    this.scheduleOverlayUpdate();
  }

  private readDomText(): string {
    if (!this.contentRoot) {
      return this.state.source;
    }
    const blocks = Array.from(
      this.contentRoot.querySelectorAll<HTMLElement>(
        '[data-block="paragraph"]',
      ),
    );
    if (blocks.length === 0) {
      return this.contentRoot.textContent ?? "";
    }
    const texts = blocks.map((block) => block.textContent ?? "");
    return texts.join("\n");
  }

  /**
   * Reconcile DOM text changes with the model while preserving formatting markers.
   * Used when external agents (IME, Grammarly) modify the DOM directly.
   *
   * Strategy:
   * 1. Get visible text from DOM (what was modified)
   * 2. Get visible text from model (what we had)
   * 3. Find the minimal diff (common prefix/suffix)
   * 4. Map the changed region from cursor space to source space
   * 5. Replace the corresponding source region, preserving markers
   */
  private reconcileDomChanges(selection: Selection): boolean {
    const domText = this.readDomText();
    const lines = getDocLines(this.state.doc);
    const modelText = getVisibleText(lines);

    if (domText === modelText) {
      return false;
    }

    // Record history before applying the reconciliation
    this.recordHistory("reconcile");

    // Find common prefix (in characters, not cursor units)
    let prefixLen = 0;
    const minLen = Math.min(domText.length, modelText.length);
    while (prefixLen < minLen && domText[prefixLen] === modelText[prefixLen]) {
      prefixLen++;
    }

    // Find common suffix (from the end)
    let suffixLen = 0;
    while (
      suffixLen < minLen - prefixLen &&
      domText[domText.length - 1 - suffixLen] ===
        modelText[modelText.length - 1 - suffixLen]
    ) {
      suffixLen++;
    }

    // The replacement text from DOM
    const replacementText = domText.slice(
      prefixLen,
      domText.length - suffixLen,
    );

    // Convert visible text offsets to cursor offsets
    const cursorStart = visibleOffsetToCursorOffset(lines, prefixLen);
    const cursorEnd = visibleOffsetToCursorOffset(
      lines,
      modelText.length - suffixLen,
    );

    if (cursorStart === null || cursorEnd === null) {
      // Fallback: rebuild state from scratch (loses formatting)
      // History was already recorded above
      this.state = this.runtime.createState(domText, selection);
      this.render();
      this.onChange?.(this.state.source, this.state.selection);
      return true;
    }

    // Map cursor positions to source positions.
    // Use "forward" affinity for start so we don't swallow any source-only
    // prefix markers at that cursor boundary (e.g. "[" for links, list prefixes).
    // Use "backward" affinity for end so we don't swallow any source-only
    // suffix markers at that boundary (e.g. closing link markers).
    const map = this.state.map;
    let sourceStart: number;
    let sourceEnd: number;

    if (cursorStart === cursorEnd) {
      // Collapsed-caret DOM edits (IME insertions) should not delete source-only
      // markers at the cursor boundary. Prefer using the selection's affinity
      // (model-owned, computed via DomMap) and only fall back to a best-effort
      // DOM-point match against DomMap at this cursor boundary.
      const affinity: Affinity =
        this.resolveCollapsedReconcileAffinity(cursorStart) ??
        selection.affinity ??
        "forward";
      const pos = map.cursorToSource(cursorStart, affinity);
      sourceStart = pos;
      sourceEnd = pos;
    } else {
      const rawSourceStart = map.cursorToSource(cursorStart, "forward");
      const rawSourceEnd = map.cursorToSource(cursorEnd, "backward");
      sourceStart = Math.min(rawSourceStart, rawSourceEnd);
      sourceEnd = Math.max(rawSourceStart, rawSourceEnd);
    }

    // Build the new source by replacing the changed region
    const source = this.state.source;
    const newSource =
      source.slice(0, sourceStart) + replacementText + source.slice(sourceEnd);

    // Create new state from the modified source
    const newState = this.runtime.createState(newSource);

    // Compute new selection: caret at end of inserted text
    const newCursorOffset = cursorStart + replacementText.length;
    const clampedOffset = Math.min(newCursorOffset, newState.map.cursorLength);
    const newSelection: Selection = {
      start: clampedOffset,
      end: clampedOffset,
      affinity: selection.affinity ?? "forward",
    };

    this.state = { ...newState, selection: newSelection };
    this.render();
    this.onChange?.(this.state.source, this.state.selection);
    return true;
  }

  private resolveCollapsedReconcileAffinity(
    cursorOffset: number,
  ): Affinity | null {
    if (!this.domMap) {
      return null;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    if (!range.collapsed) {
      return null;
    }
    if (!(range.startContainer instanceof Text)) {
      return null;
    }

    const backwardPoint = this.domMap.domAtCursor(cursorOffset, "backward");
    if (backwardPoint?.node === range.startContainer) {
      return "backward";
    }
    const forwardPoint = this.domMap.domAtCursor(cursorOffset, "forward");
    if (forwardPoint?.node === range.startContainer) {
      return "forward";
    }
    return null;
  }

  private markBeforeInputHandled() {
    this.beforeInputHandled = true;
    if (this.beforeInputResetId !== null) {
      window.cancelAnimationFrame(this.beforeInputResetId);
    }
    this.beforeInputResetId = window.requestAnimationFrame(() => {
      this.beforeInputHandled = false;
      this.beforeInputResetId = null;
    });
  }

  private suppressSelectionChangeForTick() {
    this.suppressSelectionChange = true;
    if (this.suppressSelectionChangeResetId !== null) {
      window.cancelAnimationFrame(this.suppressSelectionChangeResetId);
    }
    this.suppressSelectionChangeResetId = window.requestAnimationFrame(() => {
      this.suppressSelectionChange = false;
      this.suppressSelectionChangeResetId = null;
    });
  }

  private markCompositionCommit() {
    this.compositionCommit = true;
    if (this.compositionCommitTimeoutId !== null) {
      window.clearTimeout(this.compositionCommitTimeoutId);
    }
    this.compositionCommitTimeoutId = window.setTimeout(() => {
      this.clearCompositionCommit();
    }, COMPOSITION_COMMIT_CLEAR_DELAY_MS);
  }

  private clearCompositionCommit() {
    this.compositionCommit = false;
    if (this.compositionCommitTimeoutId !== null) {
      window.clearTimeout(this.compositionCommitTimeoutId);
      this.compositionCommitTimeoutId = null;
    }
  }

  private handleScroll() {
    this.scheduleOverlayUpdate();
    this.updateExtensionsOverlayPosition();
  }

  private handleResize() {
    this.scheduleOverlayUpdate();
  }

  private openLinkPopoverForSelection(isEditing: boolean) {
    if (!this.contentRoot || !this.domMap) {
      return;
    }
    const selection = this.state.selection;
    const focus =
      selection.start === selection.end
        ? selection.start
        : Math.max(selection.start, selection.end);
    const affinity = selection.affinity ?? "forward";
    const domPoint = this.domMap.domAtCursor(focus, affinity);
    if (!domPoint) {
      return;
    }
    const link =
      domPoint.node.parentElement?.closest("a.cake-link") ??
      this.contentRoot.querySelector("a.cake-link");
    if (!link || !(link instanceof HTMLAnchorElement)) {
      return;
    }
    const event = new CustomEvent("cake-link-popover-open", {
      bubbles: true,
      detail: { link, isEditing },
    });
    this.contentRoot.dispatchEvent(event);
  }

  private scheduleOverlayUpdate() {
    if (this.isComposing) {
      return;
    }
    if (this.overlayUpdateId !== null) {
      return;
    }
    this.overlayUpdateId = window.requestAnimationFrame(() => {
      this.overlayUpdateId = null;
      this.updateSelectionOverlay();
    });
  }

  private flushOverlayUpdate() {
    if (this.isComposing) {
      return;
    }
    if (this.overlayUpdateId !== null) {
      window.cancelAnimationFrame(this.overlayUpdateId);
      this.overlayUpdateId = null;
    }
    this.updateSelectionOverlay();
  }

  private ensureOverlayRoot(): HTMLDivElement {
    if (this.overlayRoot) {
      return this.overlayRoot;
    }
    const overlay = document.createElement("div");
    overlay.className = "cake-selection-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.contentEditable = "false";
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.userSelect = "none";
    overlay.style.setProperty("-webkit-user-select", "none");
    overlay.style.zIndex = "2";
    const caret = document.createElement("div");
    caret.className = "cake-caret";
    caret.style.display = "none";
    overlay.append(caret);
    this.overlayRoot = overlay;
    this.caretElement = caret;
    return overlay;
  }

  private ensureExtensionsRoot(): HTMLDivElement {
    if (this.extensionsRoot) {
      return this.extensionsRoot;
    }
    const root = document.createElement("div");
    root.className = "cake-extension-overlay";
    root.contentEditable = "false";
    root.style.position = "absolute";
    root.style.inset = "0";
    root.style.pointerEvents = "none";
    root.style.userSelect = "none";
    root.style.setProperty("-webkit-user-select", "none");
    root.style.zIndex = "50";
    root.style.overflow = "hidden";
    this.extensionsRoot = root;
    return root;
  }

  private updateExtensionsOverlayPosition() {
    if (!this.extensionsRoot) {
      return;
    }
    const scrollTop = this.container.scrollTop;
    const scrollLeft = this.container.scrollLeft;
    if (scrollTop === 0 && scrollLeft === 0) {
      this.extensionsRoot.style.transform = "";
      return;
    }
    this.extensionsRoot.style.transform = `translate(${scrollLeft}px, ${scrollTop}px)`;
  }

  private updateSelectionOverlay() {
    if (this.isComposing) {
      return;
    }
    if (!this.overlayRoot || !this.contentRoot) {
      return;
    }
    const lines = getDocLines(this.state.doc);
    const geometry = getSelectionGeometry({
      root: this.contentRoot,
      container: this.container,
      docLines: lines,
      selection: this.state.selection,
    });
    this.lastFocusRect = geometry.focusRect;
    this.syncSelectionRects(geometry.selectionRects);
    if (geometry.caretRect) {
      this.updateCaret({
        top: geometry.caretRect.top,
        left: geometry.caretRect.left,
        height: geometry.caretRect.height,
      });
      this.markCaretActive();
    } else {
      this.updateCaret(null);
    }
  }

  private syncSelectionRects(rects: SelectionRect[]) {
    if (!this.overlayRoot || !this.caretElement) {
      return;
    }
    const existing = Array.from(
      this.overlayRoot.querySelectorAll(".cake-selection-rect"),
    );
    existing.forEach((node) => node.remove());
    const fragment = document.createDocumentFragment();
    rects.forEach((rect) => {
      const element = document.createElement("div");
      element.className = "cake-selection-rect";
      element.style.top = `${rect.top}px`;
      element.style.left = `${rect.left}px`;
      element.style.width = `${rect.width}px`;
      element.style.height = `${rect.height}px`;
      fragment.append(element);
    });
    this.overlayRoot.insertBefore(fragment, this.caretElement);
  }

  private updateCaret(
    position: { top: number; left: number; height: number } | null,
  ) {
    if (!this.caretElement) {
      return;
    }
    if (!position) {
      this.caretElement.style.display = "none";
      this.stopCaretBlink();
      return;
    }
    this.caretElement.style.display = "";
    this.caretElement.style.top = `${position.top}px`;
    this.caretElement.style.left = `${position.left}px`;
    this.caretElement.style.height = `${position.height}px`;
  }

  private markCaretActive() {
    if (!this.caretElement) {
      return;
    }
    this.clearCaretBlinkTimer();
    this.caretElement.classList.remove("is-blinking");
    this.caretBlinkTimeoutId = window.setTimeout(() => {
      this.caretBlinkTimeoutId = null;
      this.caretElement?.classList.add("is-blinking");
    }, 80);
  }

  private stopCaretBlink() {
    if (!this.caretElement) {
      return;
    }
    this.clearCaretBlinkTimer();
    this.caretElement.classList.remove("is-blinking");
  }

  private clearCaretBlinkTimer() {
    if (this.caretBlinkTimeoutId !== null) {
      window.clearTimeout(this.caretBlinkTimeoutId);
      this.caretBlinkTimeoutId = null;
    }
  }

  private scheduleScrollCaretIntoView() {
    if (this.isComposing) {
      return;
    }
    if (this.scrollCaretIntoViewId !== null) {
      return;
    }
    this.scrollCaretIntoViewId = window.requestAnimationFrame(() => {
      this.scrollCaretIntoViewId = null;
      this.scrollCaretIntoView();
    });
  }

  private scrollCaretIntoView() {
    if (this.isComposing) {
      return;
    }
    if (!this.contentRoot) {
      return;
    }
    const caret = this.lastFocusRect;
    if (!caret) {
      return;
    }

    const container = this.container;
    if (container.clientHeight <= 0) {
      return;
    }

    const styles = window.getComputedStyle(this.contentRoot);
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    const viewportTop = container.scrollTop;
    const viewportBottom = viewportTop + container.clientHeight;
    const caretTop = caret.top;
    const caretBottom = caret.top + caret.height;
    let nextScrollTop = viewportTop;

    if (caretTop < viewportTop + paddingTop) {
      nextScrollTop = caretTop - paddingTop;
    } else if (caretBottom > viewportBottom - paddingBottom) {
      nextScrollTop = caretBottom - container.clientHeight + paddingBottom;
    } else {
      return;
    }

    const maxScrollTop = Math.max(
      0,
      container.scrollHeight - container.clientHeight,
    );
    const clamped = Math.max(0, Math.min(nextScrollTop, maxScrollTop));
    if (Math.abs(clamped - container.scrollTop) > 0.5) {
      container.scrollTop = clamped;
    }
  }

  private hitTestFromClientPoint(
    clientX: number,
    clientY: number,
  ): { cursorOffset: number; affinity: Affinity } | null {
    let node: Node | null = null;
    let offset = 0;
    let pastRowEnd = false;
    const position = caretPositionFromPoint(clientX, clientY);
    if (position) {
      node = position.offsetNode;
      offset = position.offset;
    } else {
      const range = caretRangeFromPoint(clientX, clientY);
      if (range) {
        node = range.startContainer;
        offset = range.startOffset;
      }
    }

    if (!node || !this.container.contains(node)) {
      const closestLine = this.findClosestLineByY(clientY);
      const textNode = closestLine ? findFirstTextNode(closestLine) : null;
      if (textNode) {
        node = textNode;
        const hit = findOffsetInTextNode(textNode, clientX, clientY);
        offset = hit.offset;
        pastRowEnd = hit.pastRowEnd;
      }
    }

    if (!node || !this.container.contains(node)) {
      return null;
    }

    // Check if click is in a gap between lines. This happens when the browser
    // returns a node from a different line than where the click Y is closest to.
    // We need to find the closest line by Y and use its text node instead.
    const lineElement =
      node instanceof Element
        ? node.closest(".cake-line")
        : node.parentElement?.closest(".cake-line");

    if (lineElement) {
      const lineRect = lineElement.getBoundingClientRect();
      const isClickOutsideLine =
        clientY < lineRect.top || clientY > lineRect.bottom;

      if (isClickOutsideLine) {
        // Click is in a gap - find the closest line by Y
        const closestLine = this.findClosestLineByY(clientY);
        if (closestLine && closestLine !== lineElement) {
          const textNode = findFirstTextNode(closestLine);
          if (textNode) {
            node = textNode;
            const hit = findOffsetInTextNode(textNode, clientX, clientY);
            offset = hit.offset;
            pastRowEnd = hit.pastRowEnd;
          }
        }
      }
    }

    if (node instanceof Element) {
      const resolved = resolveTextPoint(node, offset);
      if (resolved) {
        node = resolved.node;
        offset = resolved.offset;
      }
    }

    if (node instanceof Text) {
      const hit = findOffsetInTextNode(node, clientX, clientY);
      offset = hit.offset;
      pastRowEnd = hit.pastRowEnd;
    }

    if (!pastRowEnd) {
      const lineElement =
        node instanceof Element
          ? node.closest(".cake-line")
          : node.parentElement?.closest(".cake-line");
      if (lineElement) {
        const lineRect = lineElement.getBoundingClientRect();
        pastRowEnd = clientX > lineRect.right;
      }
    }

    const cursor = this.cursorFromDom(node, offset);
    if (!cursor) {
      return null;
    }
    if (!pastRowEnd) {
      return cursor;
    }
    return { cursorOffset: cursor.cursorOffset, affinity: "backward" };
  }

  private handlePointerDown(event: PointerEvent) {
    if (!this.isEventTargetInContentRoot(event.target)) {
      return;
    }
    // Reset movement tracking for selection-via-drag detection
    this.hasMovedSincePointerDown = false;
    this.pointerDownPosition = { x: event.clientX, y: event.clientY };
    this.pendingClickHit = null;

    if (this.readOnly) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (!this.contentRoot) {
      return;
    }

    if (event.pointerType === "touch") {
      // In Playwright touch emulation (and some desktop browsers), tapping a
      // contentEditable updates the native DOM selection. Cake currently
      // doesn't implement touch caret placement, so ignore the native selection
      // updates and any follow-up click from the tap.
      this.ignoreTouchNativeSelectionUntil = performance.now() + 750;
      this.suppressSelectionChangeForTick();
      event.preventDefault();
      return;
    }

    const selection = this.state.selection;
    this.blockTrustedTextDrag = false;

    // Atomic blocks (like images) should be draggable even without selecting first.
    // Treat pointerdown on an atomic block as selecting the full line and starting a line drag.
    const target = event.target;
    if (target instanceof HTMLElement) {
      const blockElement = target.closest<HTMLElement>("[data-block-atom]");
      const lineIndexAttr =
        blockElement?.getAttribute("data-line-index") ?? null;
      if (lineIndexAttr !== null) {
        const lineIndex = Number.parseInt(lineIndexAttr, 10);
        const lines = getDocLines(this.state.doc);
        const lineInfo = lines[lineIndex];
        if (lineInfo?.isAtomic) {
          const lineOffsets = getLineOffsets(lines);
          const lineStart = lineOffsets[lineIndex] ?? 0;
          const lineEnd =
            lineStart + lineInfo.cursorLength + (lineInfo.hasNewline ? 1 : 0);
          const atomicSelection: Selection = {
            start: lineStart,
            end: lineEnd,
            affinity: "forward",
          };

          event.preventDefault();
          event.stopPropagation();

          this.pendingClickHit = null;
          this.suppressSelectionChange = true;
          this.state = { ...this.state, selection: atomicSelection };
          this.applySelection(atomicSelection);
          this.onSelectionChange?.(atomicSelection);
          this.flushOverlayUpdate();
          this.selectedAtomicLineIndex = lineIndex;

          this.dragState = {
            isDragging: true,
            startLineIndex: lineIndex,
            endLineIndex: lineIndex,
            pointerId: event.pointerId,
            hasMoved: false,
          };
          try {
            this.contentRoot.setPointerCapture(event.pointerId);
          } catch {
            // Ignore
          }
          return;
        }
      }
    }

    // For regular clicks with collapsed selection (no shift key), capture the hit
    // immediately so we can use accurate hit testing in the click handler.
    // Don't capture when shift is held - that's extend-selection behavior.
    if (selection.start === selection.end && !event.shiftKey) {
      // Suppress selectionchange until click handler runs, preventing the browser's
      // native selection from overwriting our programmatically set selection.
      // This is important for:
      // - Single clicks: accurate cursor positioning with variable-width chars
      // - Multi-clicks: preventing native selection (which includes newlines) from winning
      this.suppressSelectionChange = true;
      const hit = this.hitTestFromClientPoint(event.clientX, event.clientY);
      if (hit) {
        this.pendingClickHit = hit;
      }
      return;
    }
    // For range selections, let native drag-selection update both DOM + model.
    this.suppressSelectionChange = false;

    const selStart = Math.min(selection.start, selection.end);
    const selEnd = Math.max(selection.start, selection.end);

    // Hit test to find the cursor offset at the click position
    const hit = this.hitTestFromClientPoint(event.clientX, event.clientY);
    if (!hit) {
      return;
    }

    // Check if clicking inside existing selection
    const clickedInsideSelection =
      hit.cursorOffset >= selStart && hit.cursorOffset <= selEnd;
    if (!clickedInsideSelection) {
      this.blockTrustedTextDrag = false;
      return;
    }

    // Check if this is a full line selection (required for line drag)
    const lines = getDocLines(this.state.doc);
    const lineOffsets = getLineOffsets(lines);

    // Find which line the selection starts on
    // We need to handle the case where selStart might be at the newline position
    // of the previous line (offset - 1) due to DOM selection normalization
    let startLineIndex = -1;
    for (let i = 0; i < lineOffsets.length; i++) {
      const lineStart = lineOffsets[i];
      // Check if selection starts exactly at line start
      if (lineStart === selStart) {
        startLineIndex = i;
        break;
      }
      // If selection starts at previous line's end (newline position),
      // treat it as starting at this line
      if (i > 0 && lineStart === selStart + 1) {
        startLineIndex = i;
        break;
      }
    }

    // Find which line the selection ends on
    let endLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const lineStart = lineOffsets[i] ?? 0;
      if (lineStart >= selEnd) {
        continue;
      }
      const lineInfo = lines[i];
      const lineEnd = lineStart + lineInfo.cursorLength;
      // Selection end matches line end (with optional trailing newline)
      if (selEnd === lineEnd || selEnd === lineEnd + 1) {
        endLineIndex = i;
      }
    }

    const isFullLineSelection =
      startLineIndex !== -1 &&
      endLineIndex !== -1 &&
      endLineIndex >= startLineIndex;

    if (!isFullLineSelection) {
      // Clicking inside a text selection and dragging should adjust selection,
      // not start a native drag-and-drop operation (which collapses selection in Playwright).
      event.preventDefault();
      event.stopPropagation();

      this.blockTrustedTextDrag = true;
      this.suppressSelectionChange = false;
      this.selectionDragState = {
        pointerId: event.pointerId,
        anchorOffset: hit.cursorOffset,
      };
      try {
        this.contentRoot.setPointerCapture(event.pointerId);
      } catch {
        // Ignore
      }
      return;
    }

    // Prevent the browser from changing the selection
    event.preventDefault();
    event.stopPropagation();

    // Suppress selection changes while dragging - this prevents the model selection
    // from being updated when the browser's DOM selection changes during drag
    this.suppressSelectionChange = true;

    // Initialize drag state
    this.dragState = {
      isDragging: true,
      startLineIndex,
      endLineIndex,
      pointerId: event.pointerId,
      hasMoved: false,
    };

    // Capture pointer for reliable move/up events
    try {
      this.contentRoot.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers may not support pointer capture
    }
  }

  private handlePointerMove(event: PointerEvent) {
    // Track if mouse has moved significantly since pointer down.
    // We use a threshold to avoid false positives from micro-movements or
    // synthetic pointermove events that some browsers fire even without movement.
    const DRAG_THRESHOLD = 5; // pixels
    if (this.pointerDownPosition && !this.hasMovedSincePointerDown) {
      const dx = event.clientX - this.pointerDownPosition.x;
      const dy = event.clientY - this.pointerDownPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance >= DRAG_THRESHOLD) {
        this.hasMovedSincePointerDown = true;
        // When user starts dragging to create/adjust a selection, clear pending click
        // state and allow selectionchange events through (unless we are line-dragging).
        this.pendingClickHit = null;
        if (!this.dragState?.isDragging) {
          this.suppressSelectionChange = false;
        }
      }
    }

    if (this.selectionDragState) {
      if (event.pointerId !== this.selectionDragState.pointerId) {
        return;
      }
      const hit = this.hitTestFromClientPoint(event.clientX, event.clientY);
      if (!hit) {
        return;
      }
      this.applySelectionUpdate({
        start: this.selectionDragState.anchorOffset,
        end: hit.cursorOffset,
        affinity: hit.affinity,
      });
      return;
    }

    if (!this.dragState || !this.dragState.isDragging) {
      return;
    }
    if (event.pointerId !== this.dragState.pointerId) {
      return;
    }

    this.dragState.hasMoved = true;

    // Show drop indicator
    this.showDropIndicator(event.clientY);
  }

  private handlePointerUp(event: PointerEvent) {
    this.blockTrustedTextDrag = false;
    // Clear pending click hit if pointer up happens without click
    // (e.g., if user drags or releases outside the element)
    if (this.pendingClickHit) {
      this.pendingClickHit = null;
      this.suppressSelectionChange = false;
    }

    if (this.selectionDragState) {
      if (event.pointerId !== this.selectionDragState.pointerId) {
        return;
      }
      this.selectionDragState = null;
      if (this.contentRoot) {
        try {
          this.contentRoot.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore
        }
      }
      this.suppressSelectionChange = false;

      if (!this.hasMovedSincePointerDown) {
        const hit = this.hitTestFromClientPoint(event.clientX, event.clientY);
        if (hit) {
          this.applySelectionUpdate({
            start: hit.cursorOffset,
            end: hit.cursorOffset,
            affinity: hit.affinity,
          });
        }
      }
      return;
    }

    if (!this.dragState || !this.dragState.isDragging) {
      if (this.hasMovedSincePointerDown) {
        queueMicrotask(() => {
          this.syncSelectionFromDom();
          this.flushOverlayUpdate();
        });
      }
      return;
    }
    if (event.pointerId !== this.dragState.pointerId) {
      return;
    }

    const { startLineIndex, endLineIndex, hasMoved } = this.dragState;

    // Release pointer capture
    if (this.contentRoot) {
      try {
        this.contentRoot.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore
      }
    }

    // Hide drop indicator
    this.hideDropIndicator();

    // Clear drag state and re-enable selection change handling
    this.dragState = null;
    this.suppressSelectionChange = false;

    if (!hasMoved) {
      return;
    }

    // Calculate drop target line index
    const toLineIndex = this.calculateDropLineIndex(event.clientY);
    if (toLineIndex === null) {
      return;
    }

    // Don't move if dropping within the source range
    const isOutsideSourceRange =
      toLineIndex < startLineIndex || toLineIndex > endLineIndex + 1;
    if (!isOutsideSourceRange) {
      return;
    }

    // Perform the move
    this.moveLines(startLineIndex, endLineIndex, toLineIndex);
  }

  private showDropIndicator(clientY: number) {
    if (!this.contentRoot) {
      return;
    }

    if (!this.dropIndicator) {
      const indicator = document.createElement("div");
      indicator.className = "cake-drop-indicator";
      indicator.style.position = "absolute";
      indicator.style.left = "0";
      indicator.style.right = "0";
      indicator.style.height = "2px";
      indicator.style.background = "var(--accent-color, #0066cc)";
      indicator.style.pointerEvents = "none";
      indicator.style.zIndex = "1000";
      this.dropIndicator = indicator;
    }

    const containerRect = this.container.getBoundingClientRect();
    const scrollTop = this.container.scrollTop;

    // Find the closest line boundary
    const lines = this.contentRoot.querySelectorAll("[data-line-index]");
    let closestY = 0;

    for (const line of lines) {
      const lineRect = line.getBoundingClientRect();
      const lineMidpoint = (lineRect.top + lineRect.bottom) / 2;

      if (clientY >= lineMidpoint) {
        closestY = lineRect.bottom - containerRect.top + scrollTop;
      } else {
        break;
      }
    }

    // If cursor is above all lines, show at top
    if (lines.length > 0) {
      const firstLine = lines[0];
      const firstRect = firstLine.getBoundingClientRect();
      if (clientY < (firstRect.top + firstRect.bottom) / 2) {
        closestY = firstRect.top - containerRect.top + scrollTop;
      }
    }

    this.dropIndicator.style.top = `${closestY - 1}px`;

    if (!this.dropIndicator.parentElement) {
      this.container.appendChild(this.dropIndicator);
    }
  }

  private hideDropIndicator() {
    if (this.dropIndicator?.parentElement) {
      this.dropIndicator.remove();
    }
  }

  private findClosestLineByY(clientY: number): HTMLElement | null {
    if (!this.contentRoot) {
      return null;
    }

    const lines =
      this.contentRoot.querySelectorAll<HTMLElement>("[data-line-index]");
    if (lines.length === 0) {
      return null;
    }

    let closestLine: HTMLElement | null = null;
    let closestDistance = Infinity;

    for (const line of lines) {
      const rect = line.getBoundingClientRect();
      const centerY = (rect.top + rect.bottom) / 2;
      const distance = Math.abs(clientY - centerY);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestLine = line;
      }
    }

    return closestLine;
  }

  private calculateDropLineIndex(clientY: number): number | null {
    if (!this.contentRoot) {
      return null;
    }

    const lines = this.contentRoot.querySelectorAll("[data-line-index]");
    const numLines = this.state.doc.blocks.length;

    if (lines.length === 0) {
      return 0;
    }

    let toLineIndex = 0;

    for (const line of lines) {
      const lineRect = line.getBoundingClientRect();
      const lineIndex = parseInt(
        line.getAttribute("data-line-index") ?? "0",
        10,
      );
      const lineMidpoint = (lineRect.top + lineRect.bottom) / 2;

      if (clientY >= lineMidpoint) {
        toLineIndex = lineIndex + 1;
      }
    }

    return Math.min(toLineIndex, numLines);
  }

  private detectFullLineSelection(
    selStart: number,
    selEnd: number,
    lines: ReturnType<typeof getDocLines>,
    lineOffsets: readonly number[],
  ): { startLineIndex: number; endLineIndex: number } | null {
    // Find which line the selection starts on
    let startLineIndex = -1;
    for (let i = 0; i < lineOffsets.length; i++) {
      const lineStart = lineOffsets[i];
      // Check if selection starts exactly at line start
      if (lineStart === selStart) {
        startLineIndex = i;
        break;
      }
      // If selection starts at previous line's end (newline position),
      // treat it as starting at this line
      if (i > 0 && lineStart === selStart + 1) {
        startLineIndex = i;
        break;
      }
    }

    // Find which line the selection ends on
    let endLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      const lineStart = lineOffsets[i] ?? 0;
      if (lineStart >= selEnd) {
        continue;
      }
      const lineInfo = lines[i];
      const lineEnd = lineStart + lineInfo.cursorLength;
      // Selection end matches line end (with optional trailing newline)
      if (selEnd === lineEnd || selEnd === lineEnd + 1) {
        endLineIndex = i;
      }
    }

    const isFullLineSelection =
      startLineIndex !== -1 &&
      endLineIndex !== -1 &&
      endLineIndex >= startLineIndex;

    if (!isFullLineSelection) {
      return null;
    }

    return { startLineIndex, endLineIndex };
  }

  private moveLines(fromStart: number, fromEnd: number, toIndex: number) {
    const source = this.state.source;
    const sourceLines = source.split("\n");
    const numLines = sourceLines.length;

    // Validate indices
    if (
      fromStart < 0 ||
      fromEnd >= numLines ||
      fromStart > fromEnd ||
      toIndex < 0 ||
      toIndex > numLines
    ) {
      return;
    }

    // Extract the lines to move
    const linesToMove = sourceLines.slice(fromStart, fromEnd + 1);
    const linesCount = linesToMove.length;

    // Build the new source
    let newLines: string[];
    if (toIndex <= fromStart) {
      // Moving up
      newLines = [
        ...sourceLines.slice(0, toIndex),
        ...linesToMove,
        ...sourceLines.slice(toIndex, fromStart),
        ...sourceLines.slice(fromEnd + 1),
      ];
    } else {
      // Moving down
      newLines = [
        ...sourceLines.slice(0, fromStart),
        ...sourceLines.slice(fromEnd + 1, toIndex),
        ...linesToMove,
        ...sourceLines.slice(toIndex),
      ];
    }

    const newSource = newLines.join("\n");

    // Calculate new selection: select the moved lines at their new position
    let newSelectionStart: number;
    if (toIndex <= fromStart) {
      // Moving up: new position starts at toIndex
      newSelectionStart = newLines.slice(0, toIndex).join("\n").length;
      if (toIndex > 0) {
        newSelectionStart += 1; // Account for the newline before
      }
    } else {
      // Moving down: new position
      const newStartLineIndex = toIndex - linesCount;
      newSelectionStart = newLines
        .slice(0, newStartLineIndex)
        .join("\n").length;
      if (newStartLineIndex > 0) {
        newSelectionStart += 1;
      }
    }

    // Record history before the move
    this.recordHistory("move");

    // Create the new state
    this.state = this.runtime.createState(newSource, {
      start: newSelectionStart,
      end: newSelectionStart,
      affinity: "forward",
    });
    this.render();
    this.onChange?.(this.state.source, this.state.selection);
  }

  private handleDragStart(event: DragEvent) {
    if (this.readOnly) {
      return;
    }
    if (event.isTrusted && this.blockTrustedTextDrag) {
      event.preventDefault();
      return;
    }

    // Try to use model selection, but fall back to DOM selection if needed
    let selection = this.state.selection;
    let start = Math.min(selection.start, selection.end);
    let end = Math.max(selection.start, selection.end);

    // If model selection is collapsed, try reading from DOM
    if (start === end && this.domMap) {
      const domSelection = readDomSelection(this.domMap);
      if (domSelection && domSelection.start !== domSelection.end) {
        selection = domSelection;
        start = Math.min(domSelection.start, domSelection.end);
        end = Math.max(domSelection.start, domSelection.end);
      }
    }

    if (start === end) {
      return;
    }

    // Get the plain text and source text for the selection
    const lines = getDocLines(this.state.doc);
    const visibleText = getVisibleText(lines);
    const visibleStart = cursorOffsetToVisibleOffset(lines, start);
    const visibleEnd = cursorOffsetToVisibleOffset(lines, end);
    const plainText = visibleText.slice(visibleStart, visibleEnd);

    // Get source text for the selection (use backward/forward to capture full markdown syntax)
    const cursorSourceMap = this.state.map;
    const sourceStart = cursorSourceMap.cursorToSource(start, "backward");
    const sourceEnd = cursorSourceMap.cursorToSource(end, "forward");
    const sourceText = this.state.source.slice(sourceStart, sourceEnd);

    this.textDragState = {
      selection: { start, end, affinity: selection.affinity },
      plainText,
      sourceText,
    };

    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", plainText);
      event.dataTransfer.effectAllowed = "move";
    }
  }

  private handleDragOver(event: DragEvent) {
    if (this.readOnly) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this.textDragState ? "move" : "copy";
    }
  }

  private handleDrop(event: DragEvent) {
    if (this.readOnly) {
      return;
    }

    // Let image file drops bubble to the image-drop extension
    const dataTransfer = event.dataTransfer;
    const hasImageFile = this.dataTransferHasImageFile(dataTransfer);
    if (hasImageFile) {
      // Don't prevent default or stop propagation - let the extension handle it
      this.textDragState = null;
      return;
    }

    const hit = this.hitTestFromClientPoint(event.clientX, event.clientY);
    if (!hit) {
      this.textDragState = null;
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const dropOffset = hit.cursorOffset;
    let dragState = this.textDragState;
    this.textDragState = null;

    // If no drag state, try to reconstruct from current selection (model or DOM)
    if (!dragState) {
      let selection = this.state.selection;
      // Fall back to DOM selection if model selection is collapsed
      if (selection.start === selection.end && this.domMap) {
        const domSelection = readDomSelection(this.domMap);
        if (domSelection && domSelection.start !== domSelection.end) {
          selection = domSelection;
        }
      }
      if (selection.start !== selection.end) {
        const start = Math.min(selection.start, selection.end);
        const end = Math.max(selection.start, selection.end);
        const lines = getDocLines(this.state.doc);
        const visibleText = getVisibleText(lines);
        const visibleStart = cursorOffsetToVisibleOffset(lines, start);
        const visibleEnd = cursorOffsetToVisibleOffset(lines, end);
        const plainText = visibleText.slice(visibleStart, visibleEnd);
        const cursorSourceMap = this.state.map;
        const sourceStart = cursorSourceMap.cursorToSource(start, "backward");
        const sourceEnd = cursorSourceMap.cursorToSource(end, "forward");
        const sourceText = this.state.source.slice(sourceStart, sourceEnd);
        dragState = {
          selection: { start, end, affinity: selection.affinity },
          plainText,
          sourceText,
        };
      }
    }

    if (dragState) {
      // Internal drag - move the content
      const dragStart = dragState.selection.start;
      const dragEnd = dragState.selection.end;

      // Don't drop within the source range
      if (dropOffset >= dragStart && dropOffset <= dragEnd) {
        return;
      }

      // Check if this is a full-line selection - if so, use line-level move
      const lines = getDocLines(this.state.doc);
      const lineOffsets = getLineOffsets(lines);
      const fullLineInfo = this.detectFullLineSelection(
        dragStart,
        dragEnd,
        lines,
        lineOffsets,
      );

      if (fullLineInfo) {
        // Full line drag - use line-level move
        const toLineIndex = this.calculateDropLineIndex(event.clientY);
        if (toLineIndex === null) {
          return;
        }

        // Don't move if dropping within the source range
        const isOutsideSourceRange =
          toLineIndex < fullLineInfo.startLineIndex ||
          toLineIndex > fullLineInfo.endLineIndex + 1;
        if (!isOutsideSourceRange) {
          return;
        }

        this.moveLines(
          fullLineInfo.startLineIndex,
          fullLineInfo.endLineIndex,
          toLineIndex,
        );
        return;
      }

      // Text-level drag - move inline content
      // Record history
      this.recordHistory("drag_drop");

      // Calculate positions for the move
      const selectionLength = dragEnd - dragStart;
      const adjustedDrop =
        dropOffset > dragEnd ? dropOffset - selectionLength : dropOffset;

      // Delete the source content first
      const deleteState = this.runtime.createState(this.state.source, {
        start: dragStart,
        end: dragEnd,
        affinity: "forward",
      });
      const afterDelete = this.runtime.applyEdit(
        { type: "insert", text: "" },
        deleteState,
      );

      // Insert at the adjusted position
      const insertState = this.runtime.createState(afterDelete.source, {
        start: adjustedDrop,
        end: adjustedDrop,
        affinity: "forward",
      });
      const afterInsert = this.runtime.applyEdit(
        { type: "insert", text: dragState.sourceText },
        insertState,
      );

      this.state = afterInsert;
      this.render();
      this.onChange?.(this.state.source, this.state.selection);
      return;
    }

    // External drop - insert the text
    const text = dataTransfer?.getData("text/plain") ?? "";
    if (!text) {
      return;
    }

    this.recordHistory("paste");

    const insertState = this.runtime.createState(this.state.source, {
      start: dropOffset,
      end: dropOffset,
      affinity: "forward",
    });
    const afterInsert = this.runtime.applyEdit(
      { type: "insert", text },
      insertState,
    );

    this.state = afterInsert;
    this.render();
    this.onChange?.(this.state.source, this.state.selection);
  }

  private handleDragEnd() {
    this.textDragState = null;
  }

  private dataTransferHasImageFile(dataTransfer: DataTransfer | null): boolean {
    if (!dataTransfer) {
      return false;
    }
    if (dataTransfer.files) {
      for (let i = 0; i < dataTransfer.files.length; i++) {
        const file = dataTransfer.files[i];
        if (file && file.type.startsWith("image/")) {
          return true;
        }
      }
    }
    if (dataTransfer.items) {
      for (let i = 0; i < dataTransfer.items.length; i++) {
        const item = dataTransfer.items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          return true;
        }
      }
    }
    return false;
  }
}

function selectionsEqual(a: Selection, b: Selection): boolean {
  return a.start === b.start && a.end === b.end && a.affinity === b.affinity;
}

function isCompositionInputType(inputType: string): boolean {
  return (
    inputType === "insertCompositionText" || inputType === "compositionend"
  );
}

function resolveTextPoint(
  node: Element,
  offset: number,
): { node: Text; offset: number } | null {
  const children = node.childNodes;
  if (children.length === 0) {
    return null;
  }

  if (offset <= 0) {
    const first = findTextNodeAtOrAfter(children, 0);
    return first ? { node: first, offset: 0 } : null;
  }

  if (offset >= children.length) {
    const last = findTextNodeAtOrBefore(children, children.length - 1);
    return last ? { node: last, offset: last.data.length } : null;
  }

  const exact = findFirstTextNode(children[offset]);
  if (exact) {
    return { node: exact, offset: 0 };
  }

  const previous = findTextNodeAtOrBefore(children, offset - 1);
  if (previous) {
    return { node: previous, offset: previous.data.length };
  }

  const next = findTextNodeAtOrAfter(children, offset + 1);
  return next ? { node: next, offset: 0 } : null;
}

function findFirstTextNode(node: Node): Text | null {
  if (node instanceof Text) {
    return node;
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const next = walker.nextNode();
  return next instanceof Text ? next : null;
}

function findLastTextNode(node: Node): Text | null {
  if (node instanceof Text) {
    return node;
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) {
      last = current;
    }
    current = walker.nextNode();
  }
  return last;
}

function findTextNodeAtOrAfter(
  nodes: NodeListOf<ChildNode>,
  start: number,
): Text | null {
  for (let i = Math.max(0, start); i < nodes.length; i += 1) {
    const found = findFirstTextNode(nodes[i]);
    if (found) {
      return found;
    }
  }
  return null;
}

type TextNodeHitResult = {
  offset: number;
  pastRowEnd: boolean;
};

function findOffsetInTextNode(
  textNode: Text,
  clientX: number,
  clientY: number,
): TextNodeHitResult {
  const text = textNode.textContent ?? "";
  if (text.length === 0) {
    return { offset: 0, pastRowEnd: false };
  }

  let closestOffset = 0;
  let closestDistance = Infinity;
  let closestYDistance = Infinity;
  let closestCaretX = 0;
  let closestRowTop = 0;

  const rowInfo: Map<
    number,
    {
      startOffset: number;
      endOffset: number;
      left: number;
      right: number;
      top: number;
      bottom: number;
    }
  > = new Map();

  const range = document.createRange();

  let lastCharRect: DOMRect | null = null;

  for (let i = 0; i <= text.length; i += 1) {
    if (i < text.length) {
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
    } else {
      range.setStart(textNode, i);
      range.setEnd(textNode, i);
    }

    let rects = range.getClientRects();
    // For collapsed range at end of text, browsers may return no rects.
    // Use the last character's right edge as a fallback.
    if (rects.length === 0 && i === text.length && lastCharRect) {
      // Create a synthetic rect at the right edge of the last character
      const syntheticRect = new DOMRect(
        lastCharRect.right,
        lastCharRect.top,
        0,
        lastCharRect.height,
      );
      rects = [syntheticRect] as unknown as DOMRectList;
    }
    if (rects.length === 0) {
      continue;
    }
    if (i < text.length) {
      lastCharRect = rects[0];
    }

    let bestRect = rects[0];
    for (let r = 1; r < rects.length; r += 1) {
      const rect = rects[r];
      const bestCenterY = bestRect.top + bestRect.height / 2;
      const rectCenterY = rect.top + rect.height / 2;
      if (Math.abs(clientY - rectCenterY) < Math.abs(clientY - bestCenterY)) {
        bestRect = rect;
      }
    }

    const rowKey = Math.round(bestRect.top);
    if (!rowInfo.has(rowKey)) {
      rowInfo.set(rowKey, {
        startOffset: i,
        endOffset: i,
        left: bestRect.left,
        right: bestRect.right,
        top: bestRect.top,
        bottom: bestRect.bottom,
      });
    } else {
      const row = rowInfo.get(rowKey);
      if (row) {
        row.startOffset = Math.min(row.startOffset, i);
        row.endOffset = Math.max(row.endOffset, i);
        row.left = Math.min(row.left, bestRect.left);
        row.right = Math.max(row.right, bestRect.right);
        row.top = Math.min(row.top, bestRect.top);
        row.bottom = Math.max(row.bottom, bestRect.bottom);
      }
    }

    const centerY = bestRect.top + bestRect.height / 2;
    const yDistance = Math.abs(clientY - centerY);
    // Check if click is within the row's bounds (not just close to center)
    const isWithinRowBounds =
      clientY >= bestRect.top && clientY <= bestRect.bottom;
    const isSameRow = isWithinRowBounds;
    // Compare to left edge of each character boundary, not center.
    // This matches v1 behavior: clicking past the midpoint of a character
    // means the next boundary (i+1) is closer than the current one (i).
    const caretX = bestRect.left;
    const xDistance = Math.abs(clientX - caretX);

    if (isSameRow) {
      // Use <= so that when distances are equal, the later offset wins.
      // This ensures clicking near the right edge of a character places the
      // cursor after it, which is important for clicking at the end of inline
      // elements like links where the user wants to type after the element.
      if (xDistance <= closestDistance) {
        closestDistance = xDistance;
        closestOffset = i;
        closestCaretX = caretX;
        closestRowTop = bestRect.top;
        // Also update closestYDistance to prevent characters on other rows
        // from overriding our same-row match
        closestYDistance = yDistance;
      }
    } else if (
      yDistance < closestYDistance ||
      (yDistance === closestYDistance && xDistance < closestDistance)
    ) {
      // When Y distances are equal (click on boundary between rows), also compare X
      closestYDistance = yDistance;
      closestDistance = xDistance;
      closestOffset = i;
      closestCaretX = caretX;
      closestRowTop = bestRect.top;
    }
  }

  let closestRow: {
    startOffset: number;
    endOffset: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  } | null = null;

  for (const row of rowInfo.values()) {
    if (clientY >= row.top && clientY <= row.bottom) {
      closestRow = row;
      break;
    }
  }

  if (!closestRow) {
    let smallestDistance = Infinity;
    for (const row of rowInfo.values()) {
      const centerY = row.top + (row.bottom - row.top) / 2;
      const distance = Math.abs(clientY - centerY);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        closestRow = row;
      }
    }
  }

  if (closestRow) {
    if (clientX < closestRow.left) {
      closestOffset = closestRow.startOffset;
      closestCaretX = closestRow.left;
      closestRowTop = closestRow.top;
    } else if (clientX > closestRow.right) {
      closestOffset = closestRow.endOffset;
      closestCaretX = closestRow.right;
      closestRowTop = closestRow.top;
    } else if (clientY < closestRow.top || clientY > closestRow.bottom) {
      // Click Y is in a gap (outside the row bounds), but X is within the row.
      // Find the character with the closest X position within this row.
      let bestXDistance = Infinity;
      const range = document.createRange();
      for (let i = closestRow.startOffset; i <= closestRow.endOffset; i += 1) {
        if (i < text.length) {
          range.setStart(textNode, i);
          range.setEnd(textNode, i + 1);
        } else {
          range.setStart(textNode, i);
          range.setEnd(textNode, i);
        }
        const rects = range.getClientRects();
        if (rects.length === 0) continue;
        const rect = rects[0];
        const xDist = Math.abs(clientX - rect.left);
        if (xDist <= bestXDistance) {
          bestXDistance = xDist;
          closestOffset = i;
          closestCaretX = rect.left;
          closestRowTop = closestRow.top;
        }
      }
    }
  }

  const pastRowEnd =
    closestRow !== null &&
    clientX > closestRow.right &&
    Math.abs(clientY - closestRowTop) < 1;

  if (
    Math.abs(clientX - closestCaretX) <= 2 &&
    closestOffset < text.length &&
    text[closestOffset] === "\n"
  ) {
    closestOffset = Math.max(0, closestOffset - 1);
  }

  return { offset: closestOffset, pastRowEnd };
}

function caretPositionFromPoint(
  x: number,
  y: number,
): { offsetNode: Node; offset: number } | null {
  const doc = document as {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretPositionFromPoint === "function") {
    return doc.caretPositionFromPoint(x, y);
  }
  return null;
}

function caretRangeFromPoint(x: number, y: number): Range | null {
  if (typeof document.caretRangeFromPoint === "function") {
    return document.caretRangeFromPoint(x, y);
  }
  return null;
}

function getVisualRowBoundaries(params: {
  lines: ReturnType<typeof getDocLines>;
  layout: ReturnType<typeof measureLayoutModelFromDom>;
  offset: number;
  affinity: Affinity;
}): { rowStart: number; rowEnd: number } {
  const { lines, layout, offset, affinity } = params;
  if (!layout || layout.lines.length === 0) {
    return { rowStart: 0, rowEnd: 0 };
  }
  const resolved = resolveOffsetToLine(lines, offset);
  const line = layout.lines[resolved.lineIndex];
  if (!line) {
    return { rowStart: 0, rowEnd: 0 };
  }
  if (line.rows.length === 0) {
    return {
      rowStart: line.lineStartOffset,
      rowEnd: line.lineStartOffset + line.lineLength,
    };
  }

  const rowIndex = findRowIndexForOffset(
    line.rows,
    resolved.offsetInLine,
    affinity,
  );
  const row = line.rows[rowIndex] ?? line.rows[line.rows.length - 1];
  return {
    rowStart: line.lineStartOffset + row.startOffset,
    rowEnd: line.lineStartOffset + row.endOffset,
  };
}

function findRowIndexForOffset(
  rows: { startOffset: number; endOffset: number }[],
  offset: number,
  affinity: Affinity,
): number {
  if (rows.length === 0) {
    return 0;
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (offset === row.startOffset) {
      if (affinity === "backward" && index > 0) {
        return index - 1;
      }
      return index;
    }
    if (offset === row.endOffset) {
      if (affinity === "forward" && index + 1 < rows.length) {
        return index + 1;
      }
      return index;
    }
    if (offset > row.startOffset && offset < row.endOffset) {
      return index;
    }
  }

  return rows.length - 1;
}

function resolveSelectionAffinity(selection: Selection): Affinity {
  if (selection.start === selection.end) {
    return selection.affinity ?? "backward";
  }
  return selection.affinity ?? "forward";
}

function normalizeSelection(
  selection: Selection,
  maxLength: number,
): Selection {
  const start = clampOffset(selection.start, maxLength);
  const end = clampOffset(selection.end, maxLength);
  const normalized = start <= end ? { start, end } : { start: end, end: start };
  return selection.affinity
    ? { ...normalized, affinity: selection.affinity }
    : normalized;
}

function resolveSelectionAnchorAndFocus(selection: Selection): {
  anchor: number;
  focus: number;
} {
  if (selection.start === selection.end) {
    return { anchor: selection.start, focus: selection.start };
  }
  const affinity = resolveSelectionAffinity(selection);
  if (affinity === "backward") {
    return { anchor: selection.end, focus: selection.start };
  }
  return { anchor: selection.start, focus: selection.end };
}

function selectionFromAnchor(
  anchor: number,
  focus: number,
  affinity?: Affinity,
): Selection {
  if (anchor === focus) {
    return { start: focus, end: focus, affinity };
  }
  if (anchor < focus) {
    return { start: anchor, end: focus, affinity: "forward" };
  }
  return { start: focus, end: anchor, affinity: "backward" };
}

function clampOffset(offset: number, maxLength: number): number {
  return Math.max(0, Math.min(offset, maxLength));
}

function findTextNodeAtOrBefore(
  nodes: NodeListOf<ChildNode>,
  start: number,
): Text | null {
  for (let i = Math.min(nodes.length - 1, start); i >= 0; i -= 1) {
    const found = findLastTextNode(nodes[i]);
    if (found) {
      return found;
    }
  }
  return null;
}
